import type { LookupFoodInput } from "./lookup_food";

interface OpenFoodFactsProduct {
  nutriments?: {
    "energy-kcal_100g"?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
  };
}

interface OpenFoodFactsSearchResponse {
  products?: OpenFoodFactsProduct[];
}

export async function fetchOpenFoodFactsFood(
  input: LookupFoodInput
): Promise<
  | {
      calories: number;
      protein_g: number;
      carbs_g: number;
      fat_g: number;
      citation: {
        provider: "open_food_facts_search";
        endpoint: string;
        search_terms: string;
      };
    }
  | null
> {
  const query = [input.brand, input.query].filter(Boolean).join(" ").trim();
  if (!query) return null;

  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", "5");

  const response = await fetch(url, { headers: { "User-Agent": "coach-app/1.0 (local nutrition lookup)" } }).catch(
    () => null
  );
  if (!response || !response.ok) return null;

  const data = (await response.json().catch(() => null)) as OpenFoodFactsSearchResponse | null;
  const product = data?.products?.find((item) => item.nutriments);
  if (!product?.nutriments) return null;

  const calories = safe(product.nutriments["energy-kcal_100g"]);
  const protein = safe(product.nutriments.proteins_100g);
  const carbs = safe(product.nutriments.carbohydrates_100g);
  const fat = safe(product.nutriments.fat_100g);

  if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) return null;
  return {
    calories,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    citation: {
      provider: "open_food_facts_search",
      endpoint: "https://world.openfoodfacts.org/cgi/search.pl",
      search_terms: query
    }
  };
}

function safe(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.round(value));
}
