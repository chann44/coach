import type { Database } from "bun:sqlite";
import type { CoachConfig } from "../config";
import { insertConversation } from "../memory/conversations";
import { shouldProcessIncomingMessage } from "../memory/message_dedupe";
import type { IMessageTransport } from "../transport/imessage";
import type { IncomingMessage } from "../transport/types";
import { runChatAgent } from "./agent";

export async function handleIncomingMessage(
  db: Database,
  config: CoachConfig,
  transport: IMessageTransport,
  message: IncomingMessage
): Promise<void> {
  const decision = shouldProcessIncomingMessage(db, message);
  if (!decision.shouldProcess) {
    console.log(
      `[incoming] skipped reason=${decision.reason} key=${decision.key} chat=${message.chatId ?? message.from}`
    );
    return;
  }

  console.log(
    `[incoming] processing key=${decision.key} chat=${message.chatId ?? message.from} textLen=${message.text.length} hasImage=${String(Boolean(message.imagePath))} attachments=${message.attachments?.length ?? 0}`
  );

  const content = message.text.length > 0 ? message.text : message.imagePath ? "[image]" : "[empty]";

  insertConversation(db, {
    ts: message.timestamp,
    role: "user",
    content,
    hasImage: !!message.imagePath
  });

  const result = await runChatAgent(
    {
      db,
      config,
      transport,
      now: new Date(message.timestamp)
    },
    content,
    message.imagePath
  );

  console.log(`[chat] sent=${result.sent} usage=${result.usageText}`);
}
