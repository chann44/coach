import type { Database } from "bun:sqlite";

export type ConversationRole = "user" | "coach";

export interface ConversationRow {
  ts: number;
  role: ConversationRole;
  content: string;
  has_image: number;
}

export function insertConversation(
  db: Database,
  input: {
    ts: number;
    role: ConversationRole;
    content: string;
    hasImage?: boolean;
    tokensIn?: number;
    tokensOut?: number;
    model?: string;
  }
): void {
  db.query(
    `INSERT INTO conversations (ts, role, content, has_image, tokens_in, tokens_out, model)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`
  ).run(
    input.ts,
    input.role,
    input.content,
    input.hasImage ? 1 : 0,
    input.tokensIn ?? null,
    input.tokensOut ?? null,
    input.model ?? null
  );
}

export function recentConversations(db: Database, limit = 5): ConversationRow[] {
  return db
    .query(
      `SELECT ts, role, content, has_image
       FROM conversations
       ORDER BY ts DESC
       LIMIT ?1`
    )
    .all(limit) as ConversationRow[];
}
