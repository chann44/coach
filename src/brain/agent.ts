import type { Database } from "bun:sqlite";
import { generateText, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { CoachConfig } from "../config";
import { insertConversation } from "../memory/conversations";
import { getFact, upsertFact } from "../memory/facts";
import { recordOutboundEcho } from "../memory/message_dedupe";
import { markNudgeSent } from "../memory/nudges";
import type { IMessageTransport } from "../transport/imessage";
import { getDueNudges, type NudgeKind } from "../scheduler/due";
import { dateKeyInTimezone, getZonedParts } from "../time";
import { createCoachTools } from "./tools";
import { systemPrompt } from "./prompts";

interface AgentInput {
  db: Database;
  config: CoachConfig;
  transport: IMessageTransport;
  now: Date;
}

export async function runChatAgent(
  input: AgentInput,
  userText: string,
  imagePath?: string
): Promise<{ sent: boolean; usageText: string }> {
  console.log(`[agent:chat] start text=${userText.slice(0, 120)}`);
  const openrouter = createOpenRouter({ apiKey: input.config.openrouter_api_key });
  const sentMessages: string[] = [];
  const tools = createCoachTools({ ...input, sentMessages, maxSends: 1 });

  const userContent = imagePath
    ? `${userText}\n\n[user attached an image at ${imagePath}]`
    : userText;

  const result = await generateText({
    model: openrouter.chat(input.config.model),
    system:
      `${systemPrompt}\n\n` +
      "First call get_context. Use tools when you need to save/update data. You may answer directly in text or call send_message.",
    prompt: userContent,
    tools,
    activeTools: [
      "get_context",
      "calendar_get_upcoming",
      "lookup_food",
      "log_meal",
      "log_workout",
      "set_goal",
      "set_training_schedule",
      "log_checkin",
      "remember_fact",
      "send_message"
    ],
    toolChoice: "auto",
    stopWhen: stepCountIs(8)
  });

  console.log(
    `[agent:chat] llm done toolSends=${sentMessages.length} textChars=${result.text.trim().length} text=${preview(result.text)}`
  );

  if (sentMessages.length === 0 && result.text.trim().length > 0) {
    const text = result.text.trim().slice(0, 500);
    console.log(`[agent:chat] no tool send, using model text=${preview(text)}`);
    const sendResult = await input.transport.reply(input.config.imessage_handle, text);
    recordOutboundEcho(input.db, {
      guid: sendResult.message?.guid,
      chatId: sendResult.message?.chatId,
      text,
      ts: Date.now()
    });
    sentMessages.push(text);
    insertConversation(input.db, {
      ts: Date.now(),
      role: "coach",
      content: text,
      hasImage: false,
      tokensIn: result.totalUsage.inputTokens,
      tokensOut: result.totalUsage.outputTokens,
      model: input.config.model
    });
  }

  if (sentMessages.length === 0) {
    console.log("[agent:chat] no outbound tool message; retrying with forced send_message");
    const recoveryTools = createCoachTools({ ...input, sentMessages, maxSends: 1 });
    const recovery = await generateText({
      model: openrouter.chat(input.config.model),
      system: [
        systemPrompt,
        "Recovery mode: the previous run did not send a user message.",
        "Call get_context, then call send_message exactly once.",
        "Do not leave the user without a concrete response."
      ].join("\n\n"),
      prompt: userContent,
      tools: recoveryTools,
      activeTools: ["get_context", "send_message", "remember_fact"],
      toolChoice: "required",
      stopWhen: stepCountIs(4)
    });

    console.log(
      `[agent:chat] recovery done toolSends=${sentMessages.length} textChars=${recovery.text.trim().length} text=${preview(recovery.text)}`
    );

    if (sentMessages.length === 0) {
      const fallback = "got your message. give me one target for today (calories/protein/workout) and i will set the plan now.";
      console.log("[agent:chat] recovery produced no send; sending fallback");
      const sendResult = await input.transport.reply(input.config.imessage_handle, fallback);
      recordOutboundEcho(input.db, {
        guid: sendResult.message?.guid,
        chatId: sendResult.message?.chatId,
        text: fallback,
        ts: Date.now()
      });
      sentMessages.push(fallback);
      insertConversation(input.db, {
        ts: Date.now(),
        role: "coach",
        content: fallback,
        hasImage: false,
        tokensIn: result.totalUsage.inputTokens,
        tokensOut: result.totalUsage.outputTokens,
        model: input.config.model
      });
    }
  }

  const usageText = `in:${result.totalUsage.inputTokens ?? 0} out:${result.totalUsage.outputTokens ?? 0}`;
  return { sent: sentMessages.length > 0, usageText };
}

function preview(text: string): string {
  const compact = text.trim().replace(/\s+/g, " ");
  if (!compact) return "<empty>";
  return compact.length > 140 ? `${compact.slice(0, 140)}...` : compact;
}

export async function runSchedulerAgent(input: AgentInput): Promise<void> {
  const { dateKey, due } = await getDueNudges(input.db, input.config, input.now);
  if (due.length === 0) {
    console.log("[agent:scheduler] no due nudges");
    return;
  }

  console.log(`[agent:scheduler] due=${due.join(",")}`);

  for (const kind of due) {
    const text = schedulerMessageFor(kind);
    console.log(`[agent:scheduler] sending kind=${kind}`);
    const sendResult = await input.transport.reply(input.config.imessage_handle, text);
    recordOutboundEcho(input.db, {
      guid: sendResult.message?.guid,
      chatId: sendResult.message?.chatId,
      text,
      ts: Date.now()
    });

    insertConversation(input.db, {
      ts: Date.now(),
      role: "coach",
      content: text,
      hasImage: false,
      model: input.config.model
    });

    markNudgeSent(input.db, kind, dateKey, input.now.getTime());
    console.log(`[agent:scheduler] marked_sent kind=${kind} dateKey=${dateKey}`);
  }
}

function schedulerMessageFor(kind: NudgeKind): string {
  switch (kind) {
    case "morning":
      return "morning check. whats todays training plan, target calories/protein, and first meal timing?";
    case "protein":
      return "protein check. report current protein and calories so we can close the gap before bed.";
    case "winddown":
      return "wind down. send final meal, steps, and target sleep time.";
    case "preworkout":
      return "gym in about an hour. fuel now and lock in.";
  }
}

export async function runStartupAgent(input: AgentInput): Promise<void> {
  const nowTs = input.now.getTime();
  const hasTrainingHistory = !!input.db.query("SELECT 1 FROM workouts LIMIT 1").get();
  const parts = getZonedParts(input.now, input.config.timezone);
  const greeting = greetingForHour(parts.hour);
  const dateKey = dateKeyInTimezone(input.now, input.config.timezone);
  const lastStartup = getFact(input.db, "startup_last_date")?.value;

  const startMessage = hasTrainingHistory
    ? `${greeting}. youre back in. what session are you hitting today, and are we pushing fat loss or size right now?`
    : `${greeting}. i dont have training history yet. what days and time will you train this week, and is your goal fat loss or muscle gain?`;

  const startSend = await input.transport.reply(input.config.imessage_handle, startMessage);
  recordOutboundEcho(input.db, {
    guid: startSend.message?.guid,
    chatId: startSend.message?.chatId,
    text: startMessage,
    ts: nowTs
  });
  insertConversation(input.db, {
    ts: nowTs,
    role: "coach",
    content: startMessage,
    hasImage: false,
    model: input.config.model
  });

  if (lastStartup !== dateKey) {
    const dailyCheck = hasTrainingHistory
      ? "daily check. send sleep hours, energy 1-10, and what youve eaten so far."
      : "daily check. send wake time, first meal plan, and your training window for today.";
    const dailySend = await input.transport.reply(input.config.imessage_handle, dailyCheck);
    recordOutboundEcho(input.db, {
      guid: dailySend.message?.guid,
      chatId: dailySend.message?.chatId,
      text: dailyCheck,
      ts: Date.now()
    });
    insertConversation(input.db, {
      ts: Date.now(),
      role: "coach",
      content: dailyCheck,
      hasImage: false,
      model: input.config.model
    });
    upsertFact(input.db, { key: "startup_last_date", value: dateKey });
  }
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "whats up good morning";
  if (hour < 18) return "whats up good afternoon";
  return "whats up good evening";
}
