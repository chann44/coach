import type { Database } from "bun:sqlite";

export interface Fact {
  key: string;
  value: string;
}

export function upsertFact(db: Database, fact: Fact): void {
  db.query(
    `INSERT INTO facts (key, value, updated_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(fact.key, fact.value, Date.now());
}

export function listFacts(db: Database): Fact[] {
  return db.query("SELECT key, value FROM facts ORDER BY updated_at DESC").all() as Fact[];
}
