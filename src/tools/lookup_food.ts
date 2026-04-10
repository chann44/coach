import type { CoachConfig } from "../config";
import { searchFoodsLocal } from "./foods_local";
import { fetchNutritionixFood } from "./nutritionix";
import { fetchOpenFoodFactsFood } from "./open_food_facts";

export type FoodSource = "nutritionix" | "open_food_facts" | "foods_local" | "estimate";
export type FoodConfidence = "high" | "medium" | "low";

export interface LookupFoodInput {
  query: string;
  brand?: string;
  portion?: string;
}

export interface LookupFoodResult {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: FoodSource;
  confidence: FoodConfidence;
}

export async function lookupFood(input: LookupFoodInput, config: CoachConfig): Promise<LookupFoodResult> {
  const normalized = normalize(input.query);

  const local = searchFoodsLocal(normalized);
  if (local) {
    return {
      calories: local.calories,
      protein_g: local.protein_g,
      carbs_g: local.carbs_g,
      fat_g: local.fat_g,
      source: "foods_local",
      confidence: "high"
    };
  }

  const fromNutritionix = await fetchNutritionixFood(input, config);
  if (fromNutritionix) {
    return {
      calories: fromNutritionix.calories,
      protein_g: fromNutritionix.protein_g,
      carbs_g: fromNutritionix.carbs_g,
      fat_g: fromNutritionix.fat_g,
      source: "nutritionix",
      confidence: "high"
    };
  }

  const fromOpenFoodFacts = await fetchOpenFoodFactsFood(input);
  if (fromOpenFoodFacts) {
    return {
      calories: fromOpenFoodFacts.calories,
      protein_g: fromOpenFoodFacts.protein_g,
      carbs_g: fromOpenFoodFacts.carbs_g,
      fat_g: fromOpenFoodFacts.fat_g,
      source: "open_food_facts",
      confidence: "medium"
    };
  }

  return estimateFromText(normalized);
}

function estimateFromText(query: string): LookupFoodResult {
  const q = normalize(query);

  if (q.includes("rice") || q.includes("biryani")) {
    return { calories: 280, protein_g: 6, carbs_g: 45, fat_g: 8, source: "estimate", confidence: "low" };
  }
  if (q.includes("roti") || q.includes("chapati")) {
    return { calories: 120, protein_g: 4, carbs_g: 22, fat_g: 2, source: "estimate", confidence: "low" };
  }
  if (q.includes("dosa")) {
    return { calories: 170, protein_g: 4, carbs_g: 25, fat_g: 6, source: "estimate", confidence: "low" };
  }
  if (q.includes("paneer")) {
    return { calories: 265, protein_g: 18, carbs_g: 8, fat_g: 18, source: "estimate", confidence: "low" };
  }

  return { calories: 250, protein_g: 12, carbs_g: 25, fat_g: 10, source: "estimate", confidence: "low" };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
