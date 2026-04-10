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
    const handleEvent = async (msg: any, channel: "message" | "direct") => {
      await this.handleIncomingEvent(msg, channel, onMessage);
    };

    await this.sdk.startWatching({
      onMessage: async (msg: any) => handleEvent(msg, "message"),
      onDirectMessage: async (msg: any) => handleEvent(msg, "direct"),
      onError: (error: Error) => {
        console.error("[transport] watcher error", error);
      }
    });

    console.log("[transport] watcher started");
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

  private pickImagePath(attachments: Array<{ path: string; mimeType?: string; filename?: string }>): string | undefined {
    const image = attachments.find((attachment) => {
      const mime = attachment.mimeType?.toLowerCase() ?? "";
      if (mime.startsWith("image/")) return true;
      return /\.(png|jpe?g|gif|webp|heic|heif|avif)$/i.test(attachment.path);
    });
    return image?.path;
  }

  private async handleIncomingEvent(
    msg: any,
    channel: "message" | "direct",
    onMessage: (message: IncomingMessage) => Promise<void>
  ): Promise<void> {
    this.gcDedupeMaps();

    const attachments = Array.isArray(msg.attachments)
      ? msg.attachments
          .map((attachment: any) => ({
            path: String(attachment?.path ?? ""),
            mimeType: attachment?.mimeType ? String(attachment.mimeType) : undefined,
            filename: attachment?.filename ? String(attachment.filename) : undefined
          }))
          .filter((attachment: { path: string }) => attachment.path.length > 0)
      : [];

    const sender = String(msg.sender ?? "");
    const chatId = msg.chatId ? String(msg.chatId) : undefined;
    const text = String(msg.text ?? "").trim();

    console.log(
      `[transport] incoming raw channel=${channel} sender=${sender || "-"} chat=${chatId ?? "-"} fromMe=${String(Boolean(msg.isFromMe))} reaction=${String(Boolean(msg.isReaction))} group=${String(Boolean(msg.isGroupChat))} textLen=${text.length} attachments=${attachments.length}`
    );

    if (msg.isFromMe || msg.isReaction) {
      console.log("[transport] skipped incoming own/reaction message");
      return;
    }

    if (!this.shouldAcceptInbound(sender, chatId)) {
      console.log(
        `[transport] skipped incoming sender=${sender || "-"} chat=${chatId ?? "-"}; expected=${this.allowedHandle}`
      );
      return;
    }

    const id = String(msg.id ?? "");
    const guid = String(msg.guid ?? "");

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
      chatId,
      from: sender,
      text,
      attachments: attachments.length > 0 ? attachments : undefined,
      imagePath: this.pickImagePath(attachments),
      timestamp: this.normalizeTimestamp(msg.date)
    };

    console.log(
      `[transport] incoming accepted id=${id || "-"} guid=${guid || "-"} chat=${normalized.chatId ?? normalized.from}`
    );
    await onMessage(normalized);
  }

  private shouldAcceptInbound(sender: string, chatId?: string): boolean {
    const expected = this.allowedHandle.trim();
    if (!expected) return true;
    if (this.matchesAllowedHandle(sender)) return true;
    if (chatId && this.matchesAllowedHandle(chatId)) return true;
    return false;
  }

  private matchesAllowedHandle(sender: string): boolean {
    const expected = this.allowedHandle.trim();
    const actual = sender.trim();
    if (!expected || !actual) return false;

    if (expected.toLowerCase() === actual.toLowerCase()) return true;

    const expectedDigits = expected.replace(/\D+/g, "");
    const actualDigits = actual.replace(/\D+/g, "");
    if (expectedDigits.length >= 7 && actualDigits.length >= 7) {
      if (expectedDigits === actualDigits) return true;
      if (expectedDigits.endsWith(actualDigits) || actualDigits.endsWith(expectedDigits)) return true;
    }

    return false;
  }
}
