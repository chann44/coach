import type { Database } from "bun:sqlite";
import { generateText, stepCountIs } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { CoachConfig } from "../config";
import { insertConversation } from "../memory/conversations";
import { recordOutboundEcho } from "../memory/message_dedupe";
import { markNudgeSent } from "../memory/nudges";
import type { IMessageTransport } from "../transport/imessage";
import { getDueNudges, type NudgeKind } from "../scheduler/due";
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
      "You must use tools for actions. First call get_context. Use that context in your final wording. When done, call send_message exactly once.",
    prompt: userContent,
    tools,
    activeTools: [
      "get_context",
      "calendar_get_upcoming",
      "log_meal",
      "log_workout",
      "remember_fact",
      "send_message"
    ],
    toolChoice: "required",
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
      return "morning check. log plan + first meal when done.";
    case "protein":
      return "protein check. close the gap before bed.";
    case "winddown":
      return "wind down. log final meal and sleep target.";
    case "preworkout":
      return "gym in about an hour. fuel now and lock in.";
  }
}

export async function runStartupAgent(input: AgentInput): Promise<void> {
  const openrouter = createOpenRouter({ apiKey: input.config.openrouter_api_key });
  const sentMessages: string[] = [];
  const tools = createCoachTools({ ...input, sentMessages, maxSends: 1 });

  await generateText({
    model: openrouter.chat(input.config.model),
    system: [
      "You are Coach startup agent.",
      "Send one short onboarding check-in message that asks exactly two questions.",
      "Question 1 must ask for the user's most recent meal.",
      "Question 2 must ask what time they plan to train today.",
      "Keep it concise and coach-like.",
      "Do not call any other tool."
    ].join("\n"),
    prompt: "send startup message now",
    tools,
    activeTools: ["send_message"],
    toolChoice: "required",
    stopWhen: stepCountIs(2)
  });
}
