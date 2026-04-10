import type { Database } from "bun:sqlite";

export function wasNudgeSent(db: Database, kind: string, dateKey: string): boolean {
  const row = db
    .query("SELECT 1 FROM sent_nudges WHERE kind = ?1 AND date_key = ?2 LIMIT 1")
    .get(kind, dateKey);
  return !!row;
}

export function markNudgeSent(db: Database, kind: string, dateKey: string, ts = Date.now()): boolean {
  const result = db
    .query("INSERT OR IGNORE INTO sent_nudges (kind, ts, date_key) VALUES (?1, ?2, ?3)")
    .run(kind, ts, dateKey);
  return result.changes > 0;
}
