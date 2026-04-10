import { IMessageSDK } from "@photon-ai/imessage-kit";
import type { SendResult } from "@photon-ai/imessage-kit";
import type { IncomingMessage } from "./types";

export class IMessageTransport {
  private readonly sdk: IMessageSDK;
  private readonly allowedHandle: string;
  private readonly seenIncomingIds = new Map<string, number>();
  private readonly recentSentGuids = new Map<string, number>();
  private readonly dedupeTtlMs = 90_000;

  constructor(allowedHandle: string) {
    this.allowedHandle = allowedHandle;
    this.sdk = new IMessageSDK({
      debug: false,
      watcher: {
        excludeOwnMessages: true
      }
    });
  }

  async start(onMessage: (message: IncomingMessage) => Promise<void>): Promise<void> {
    await this.sdk.startWatching({
      onDirectMessage: async (msg: any) => {
        this.gcDedupeMaps();

        if (msg.isFromMe || msg.isReaction) {
          console.log("[transport] skipped incoming own/reaction message");
          return;
        }
        if (msg.sender !== this.allowedHandle) {
          console.log(`[transport] skipped incoming from unexpected sender=${String(msg.sender)}`);
          return;
        }

        const id = String(msg.id ?? "");
        const guid = String(msg.guid ?? "");
        const text = String(msg.text ?? "").trim();

        if (id && this.seenIncomingIds.has(id)) {
          console.log(`[transport] skipped duplicate incoming id=${id}`);
          return;
        }
        if (guid && this.recentSentGuids.has(guid)) {
          console.log(`[transport] skipped outbound echo guid=${guid}`);
          return;
        }

        if (id) this.seenIncomingIds.set(id, Date.now());

        const normalized: IncomingMessage = {
          id,
          guid,
          chatId: msg.chatId ? String(msg.chatId) : undefined,
          from: String(msg.sender),
          text,
          imagePath: msg.attachments?.[0]?.path,
          timestamp: this.normalizeTimestamp(msg.date)
        };

        console.log(
          `[transport] incoming accepted id=${id || "-"} guid=${guid || "-"} chat=${normalized.chatId ?? normalized.from}`
        );
        await onMessage(normalized);
      }
    });
  }

  async reply(to: string, text: string): Promise<SendResult> {
    console.log(`[transport] sending reply to=${to} text=${text.slice(0, 120)}`);
    const result = await this.sdk.send(to, text);
    const now = Date.now();

    if (result.message?.guid) {
      this.recentSentGuids.set(String(result.message.guid), now);
    }

    console.log(
      `[transport] send complete guid=${result.message?.guid ? String(result.message.guid) : "-"} chat=${result.message?.chatId ? String(result.message.chatId) : "-"}`
    );

    return result;
  }

  async stop(): Promise<void> {
    this.sdk.stopWatching();
    await this.sdk.close();
  }

  private gcDedupeMaps(): void {
    const threshold = Date.now() - this.dedupeTtlMs;

    for (const [key, ts] of this.seenIncomingIds) {
      if (ts < threshold) this.seenIncomingIds.delete(key);
    }

    for (const [key, ts] of this.recentSentGuids) {
      if (ts < threshold) this.recentSentGuids.delete(key);
    }
  }

  private normalizeTimestamp(rawDate: unknown): number {
    const ts = Number(rawDate ?? Date.now());
    if (!Number.isFinite(ts)) return Date.now();

    const minValid = Date.UTC(2000, 0, 1);
    const maxValid = Date.now() + 24 * 60 * 60_000;
    if (ts < minValid || ts > maxValid) return Date.now();

    return ts;
  }
}
