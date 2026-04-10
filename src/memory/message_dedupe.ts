import type { Database } from "bun:sqlite";
import type { IncomingMessage } from "../transport/types";

const OUTBOUND_GUID_TTL_MS = 5 * 60_000;
const INBOUND_TTL_MS = 7 * 24 * 60 * 60_000;

export interface IncomingDecision {
  shouldProcess: boolean;
  reason: "ok" | "already_processed" | "outbound_echo_guid";
  key: string;
}

export function ensureMessageDedupeTables(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS processed_incoming_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_key TEXT NOT NULL UNIQUE,
      chat_id TEXT,
      processed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_processed_incoming_processed_at ON processed_incoming_messages(processed_at);

    CREATE TABLE IF NOT EXISTS outbound_echo_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      chat_id TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(kind, key)
    );
    CREATE INDEX IF NOT EXISTS idx_outbound_echo_created_at ON outbound_echo_keys(created_at);
  `);
}

export function shouldProcessIncomingMessage(db: Database, message: IncomingMessage): IncomingDecision {
  pruneDedupeRows(db);

  const messageKey = inboundMessageKey(message);
  const alreadyProcessed = db
    .query("SELECT 1 FROM processed_incoming_messages WHERE message_key = ?1 LIMIT 1")
    .get(messageKey);
  if (alreadyProcessed) {
    return { shouldProcess: false, reason: "already_processed", key: messageKey };
  }

  if (isRecentOutboundEcho(db, message)) {
    markIncomingProcessed(db, messageKey, message.chatId, Date.now());
    return { shouldProcess: false, reason: "outbound_echo_guid", key: messageKey };
  }

  markIncomingProcessed(db, messageKey, message.chatId, Date.now());
  return { shouldProcess: true, reason: "ok", key: messageKey };
}

export function recordOutboundEcho(
  db: Database,
  input: { guid?: string; chatId?: string; text: string; ts?: number }
): void {
  const ts = input.ts ?? Date.now();

  if (input.guid && input.guid.trim().length > 0) {
    db.query(
      `INSERT INTO outbound_echo_keys (kind, key, chat_id, created_at)
       VALUES ('guid', ?1, ?2, ?3)
       ON CONFLICT(kind, key) DO UPDATE SET created_at = excluded.created_at`
    ).run(input.guid.trim(), input.chatId ?? null, ts);
  }
}

function isRecentOutboundEcho(db: Database, message: IncomingMessage): boolean {
  const cutoff = Date.now() - OUTBOUND_GUID_TTL_MS;

  if (message.guid && message.guid.trim().length > 0) {
    const guidRow = db
      .query(
        `SELECT 1 FROM outbound_echo_keys
         WHERE kind = 'guid' AND key = ?1 AND created_at >= ?2
         LIMIT 1`
      )
      .get(message.guid.trim(), cutoff);
    if (guidRow) return true;
  }

  return false;
}

function markIncomingProcessed(db: Database, key: string, chatId: string | undefined, ts: number): void {
  db.query(
    `INSERT INTO processed_incoming_messages (message_key, chat_id, processed_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(message_key) DO NOTHING`
  ).run(key, chatId ?? null, ts);
}

function inboundMessageKey(message: IncomingMessage): string {
  if (message.guid && message.guid.trim().length > 0) return `guid:${message.guid.trim()}`;
  if (message.id && message.id.trim().length > 0) return `id:${message.id.trim()}`;

  const tsBucket = Math.floor(message.timestamp / 1000);
  return `fallback:${message.chatId ?? message.from}:${normalizeText(message.text)}:${tsBucket}`;
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function pruneDedupeRows(db: Database): void {
  const now = Date.now();
  db.query("DELETE FROM outbound_echo_keys WHERE created_at < ?1").run(now - OUTBOUND_GUID_TTL_MS);
  db.query("DELETE FROM processed_incoming_messages WHERE processed_at < ?1").run(now - INBOUND_TTL_MS);
}
