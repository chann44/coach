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
  citation: {
    provider: string;
    detail: string;
    url?: string;
  };
}

export async function lookupFood(input: LookupFoodInput, config: CoachConfig): Promise<LookupFoodResult> {
  const normalized = normalize(input.query);
  console.log(`[tool:lookup_food:chain] start query=${input.query} brand=${input.brand ?? "-"} portion=${input.portion ?? "-"}`);

  const local = searchFoodsLocal(normalized);
  if (local) {
    console.log(`[tool:lookup_food:chain] source=foods_local label=${local.label}`);
    return {
      calories: local.calories,
      protein_g: local.protein_g,
      carbs_g: local.carbs_g,
      fat_g: local.fat_g,
      source: "foods_local",
      confidence: "high",
      citation: {
        provider: "foods_local",
        detail: `seed:${local.label}`,
        url: "src/tools/foods_local.ts"
      }
    };
  }

  const fromNutritionix = await fetchNutritionixFood(input, config);
  if (fromNutritionix) {
    console.log("[tool:lookup_food:chain] source=nutritionix");
    return {
      calories: fromNutritionix.calories,
      protein_g: fromNutritionix.protein_g,
      carbs_g: fromNutritionix.carbs_g,
      fat_g: fromNutritionix.fat_g,
      source: "nutritionix",
      confidence: "high",
      citation: {
        provider: "nutritionix",
        detail: fromNutritionix.citation.query,
        url: fromNutritionix.citation.endpoint
      }
    };
  }

  const fromOpenFoodFacts = await fetchOpenFoodFactsFood(input);
  if (fromOpenFoodFacts) {
    console.log("[tool:lookup_food:chain] source=open_food_facts_search");
    return {
      calories: fromOpenFoodFacts.calories,
      protein_g: fromOpenFoodFacts.protein_g,
      carbs_g: fromOpenFoodFacts.carbs_g,
      fat_g: fromOpenFoodFacts.fat_g,
      source: "open_food_facts",
      confidence: "medium",
      citation: {
        provider: "open_food_facts_search",
        detail: fromOpenFoodFacts.citation.search_terms,
        url: fromOpenFoodFacts.citation.endpoint
      }
    };
  }

  console.log("[tool:lookup_food:chain] source=estimate");
  return estimateFromText(normalized);
}

function estimateFromText(query: string): LookupFoodResult {
  const q = normalize(query);

  if (q.includes("rice") || q.includes("biryani")) {
    return {
      calories: 280,
      protein_g: 6,
      carbs_g: 45,
      fat_g: 8,
      source: "estimate",
      confidence: "low",
      citation: { provider: "estimate", detail: "heuristic:rice_or_biryani" }
    };
  }
  if (q.includes("roti") || q.includes("chapati")) {
    return {
      calories: 120,
      protein_g: 4,
      carbs_g: 22,
      fat_g: 2,
      source: "estimate",
      confidence: "low",
      citation: { provider: "estimate", detail: "heuristic:roti_or_chapati" }
    };
  }
  if (q.includes("dosa")) {
    return {
      calories: 170,
      protein_g: 4,
      carbs_g: 25,
      fat_g: 6,
      source: "estimate",
      confidence: "low",
      citation: { provider: "estimate", detail: "heuristic:dosa" }
    };
  }
  if (q.includes("paneer")) {
    return {
      calories: 265,
      protein_g: 18,
      carbs_g: 8,
      fat_g: 18,
      source: "estimate",
      confidence: "low",
      citation: { provider: "estimate", detail: "heuristic:paneer" }
    };
  }

  return {
    calories: 250,
    protein_g: 12,
    carbs_g: 25,
    fat_g: 10,
    source: "estimate",
    confidence: "low",
    citation: { provider: "estimate", detail: "heuristic:default" }
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
