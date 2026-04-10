import type { CoachConfig } from "../config";
import type { LookupFoodInput } from "./lookup_food";

interface NutritionixFood {
  nf_calories?: number;
  nf_protein?: number;
  nf_total_carbohydrate?: number;
  nf_total_fat?: number;
}

interface NutritionixResponse {
  foods?: NutritionixFood[];
}

export async function fetchNutritionixFood(
  input: LookupFoodInput,
  config: CoachConfig
): Promise<
  | {
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      citation: {
        provider: "nutritionix";
        endpoint: string;
        query: string;
      };
    }
  | null
> {
  if (!config.nutritionix_app_id || !config.nutritionix_app_key) {
    return null;
  }

  const text = [input.portion, input.brand, input.query].filter(Boolean).join(" ");
  if (!text) return null;

  const response = await fetch("https://trackapi.nutritionix.com/v2/natural/nutrients", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-app-id": config.nutritionix_app_id,
      "x-app-key": config.nutritionix_app_key
    },
    body: JSON.stringify({ query: text })
  }).catch(() => null);

  if (!response || !response.ok) return null;

  const data = (await response.json().catch(() => null)) as NutritionixResponse | null;
  const first = data?.foods?.[0];
  if (!first) return null;

  const calories = safe(first.nf_calories);
  const protein = safe(first.nf_protein);
  const carbs = safe(first.nf_total_carbohydrate);
  const fat = safe(first.nf_total_fat);

  if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return null;
  return {
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    citation: {
      provider: "nutritionix",
      endpoint: "https://trackapi.nutritionix.com/v2/natural/nutrients",
      query: text
    }
  };
}

function safe(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}
