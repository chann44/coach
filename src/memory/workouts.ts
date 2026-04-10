import type { Database } from "bun:sqlite";

export interface WorkoutSetInput {
  ts: number;
  exercise: string;
  exercise_normalized: string;
  weight_kg: number;
  reps: number;
  set_number: number;
  raw_input: string;
}

export interface WorkoutSummary {
  sets_count: number;
}

export interface RecentPr {
  exercise_normalized: string;
  best_weight_kg: number;
  best_reps: number;
  ts: number;
}

export function insertWorkoutSet(db: Database, set: WorkoutSetInput): void {
  db.query(
    `INSERT INTO workouts (ts, exercise, exercise_normalized, weight_kg, reps, set_number, raw_input, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).run(
    set.ts,
    set.exercise,
    set.exercise_normalized,
    set.weight_kg,
    set.reps,
    set.set_number,
    set.raw_input,
    Date.now()
  );
}

export function workoutsBetween(db: Database, startTs: number, endTs: number): WorkoutSummary {
  const row = db
    .query(`SELECT COUNT(*) AS sets_count FROM workouts WHERE ts >= ?1 AND ts < ?2`)
    .get(startTs, endTs) as WorkoutSummary;
  return row;
}

export function recentPrs(db: Database, limit = 3): RecentPr[] {
  return db
    .query(
      `SELECT exercise_normalized, weight_kg AS best_weight_kg, reps AS best_reps, ts
       FROM workouts
       ORDER BY ts DESC
       LIMIT ?1`
    )
    .all(limit) as RecentPr[];
}
