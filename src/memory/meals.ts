import type { Database } from "bun:sqlite";

export interface MealInput {
  ts: number;
  description: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: "text" | "photo" | "voice";
  photo_path?: string;
  raw_input: string;
}

export interface MealTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  meals_count: number;
}

export function insertMeal(db: Database, meal: MealInput): void {
  db.query(
    `INSERT INTO meals (ts, description, calories, protein_g, carbs_g, fat_g, source, photo_path, raw_input, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  ).run(
    meal.ts,
    meal.description,
    meal.calories,
    meal.protein_g,
    meal.carbs_g,
    meal.fat_g,
    meal.source,
    meal.photo_path ?? null,
    meal.raw_input,
    Date.now()
  );
}

export function mealTotalsBetween(db: Database, startTs: number, endTs: number): MealTotals {
  const row = db
    .query(
      `SELECT
        COALESCE(SUM(calories), 0) AS calories,
        COALESCE(SUM(protein_g), 0) AS protein_g,
        COALESCE(SUM(carbs_g), 0) AS carbs_g,
        COALESCE(SUM(fat_g), 0) AS fat_g,
        COUNT(*) AS meals_count
       FROM meals
       WHERE ts >= ?1 AND ts < ?2`
    )
    .get(startTs, endTs) as MealTotals;
  return row;
}
