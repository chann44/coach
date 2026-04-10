import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { paths } from "../paths";
import { ensureMessageDedupeTables } from "./message_dedupe";

export function openDb(): Database {
  mkdirSync(dirname(paths.dbPath), { recursive: true });
  const db = new Database(paths.dbPath, { create: true });
  runMigrations(db);
  ensureMessageDedupeTables(db);
  return db;
}

function runMigrations(db: Database): void {
  const migrationPath = new URL("./migrations/001_initial.sql", import.meta.url);
  const sql = readFileSync(migrationPath, "utf8");
  db.exec(sql);
}
