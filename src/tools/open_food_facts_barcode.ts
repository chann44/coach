interface OpenFoodFactsBarcodeResponse {
  status?: number;
  product?: {
    product_name?: string;
    brands?: string;
    nutriments?: Record<string, number | string | undefined>;
  };
}

export interface OpenFoodFactsBarcodeResult {
  barcode: string;
  product_name?: string;
  brand?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: "high" | "medium";
  citation: {
    provider: "open_food_facts_barcode";
    endpoint: string;
  };
}

export async function fetchOpenFoodFactsByBarcode(barcode: string): Promise<OpenFoodFactsBarcodeResult | null> {
  const clean = barcode.replace(/\D+/g, "");
  if (!/^\d{8,14}$/.test(clean)) {
    console.log(`[tool:off_barcode] invalid barcode=${barcode}`);
    return null;
  }

  const url = `https://world.openfoodfacts.org/api/v2/product/${clean}.json`;
  console.log(`[tool:off_barcode] fetch barcode=${clean} url=${url}`);
  const response = await fetch(url, {
    headers: { "User-Agent": "coach-app/1.0 (local nutrition lookup)" }
  }).catch(() => null);
  if (!response || !response.ok) {
    console.log(`[tool:off_barcode] miss barcode=${clean} status=${response?.status ?? "no_response"}`);
    return null;
  }

  const data = (await response.json().catch(() => null)) as OpenFoodFactsBarcodeResponse | null;
  if (!data || data.status !== 1 || !data.product?.nutriments) {
    console.log(`[tool:off_barcode] no product/nutriments barcode=${clean}`);
    return null;
  }

  const nutriments = data.product.nutriments;

  const caloriesServing = num(nutriments["energy-kcal_serving"]);
  const proteinServing = num(nutriments["proteins_serving"]);
  const carbsServing = num(nutriments["carbohydrates_serving"]);
  const fatServing = num(nutriments["fat_serving"]);

  const calories100g = num(nutriments["energy-kcal_100g"]);
  const protein100g = num(nutriments["proteins_100g"]);
  const carbs100g = num(nutriments["carbohydrates_100g"]);
  const fat100g = num(nutriments["fat_100g"]);

  const hasServing = caloriesServing > 0 || proteinServing > 0 || carbsServing > 0 || fatServing > 0;
  const has100g = calories100g > 0 || protein100g > 0 || carbs100g > 0 || fat100g > 0;
  if (!hasServing && !has100g) {
    console.log(`[tool:off_barcode] no macro fields barcode=${clean}`);
    return null;
  }

  console.log(
    `[tool:off_barcode] hit barcode=${clean} product=${text(data.product.product_name) ?? "-"} brand=${text(data.product.brands) ?? "-"} serving=${String(hasServing)}`
  );

  return {
    barcode: clean,
    product_name: text(data.product.product_name),
    brand: text(data.product.brands),
    calories: hasServing ? caloriesServing : calories100g,
    protein_g: hasServing ? proteinServing : protein100g,
    carbs_g: hasServing ? carbsServing : carbs100g,
    fat_g: hasServing ? fatServing : fat100g,
    confidence: hasServing ? "high" : "medium",
    citation: {
      provider: "open_food_facts_barcode",
      endpoint: url
    }
  };
}

function num(value: number | string | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
  }
  return 0;
}

function text(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
