import type { CoachConfig } from "../config";
import { detectBarcodeStandard, hasValidChecksum, normalizeBarcode } from "./barcode";
import { lookupFood, type FoodSource } from "./lookup_food";
import { inferFoodFromImage } from "./image_food_infer";
import { fetchOpenFoodFactsByBarcode } from "./open_food_facts_barcode";
import { searchOpenFoodFactsBarcodeCandidates } from "./open_food_facts_search";

export interface GetBarcodeMacrosResult {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: FoodSource | "open_food_facts_barcode";
  confidence: "high" | "medium" | "low";
  barcode?: string;
  product_name?: string;
  brand?: string;
  requires_confirmation?: boolean;
  match_method?: "direct_barcode" | "searched_barcode" | "fallback_lookup";
  citation: {
    provider: string;
    detail: string;
    url?: string;
  };
  regulatory?: {
    fssai_license?: string;
  };
  attempts: Array<{
    source: string;
    status: "hit" | "miss";
    detail: string;
  }>;
}

export async function getBarcodeMacros(
  imagePath: string,
  config: CoachConfig,
  queryHint?: string
): Promise<GetBarcodeMacrosResult | null> {
  const attempts: GetBarcodeMacrosResult["attempts"] = [];
  console.log(`[tool:get_barcode_macros:chain] start image=${imagePath} query_hint=${queryHint ?? "-"}`);

  const hintBarcode = extractBarcodeCandidate(queryHint);
  if (hintBarcode) {
    console.log(`[tool:get_barcode_macros:chain] trying query_hint barcode=${hintBarcode}`);
    attempts.push({ source: "query_hint_barcode", status: "miss", detail: `barcode=${hintBarcode}` });
    const hintBarcodeHit = await fetchOpenFoodFactsByBarcode(hintBarcode);
    if (hintBarcodeHit) {
      attempts[attempts.length - 1] = { source: "query_hint_barcode", status: "hit", detail: `barcode=${hintBarcode}` };
      return {
        calories: hintBarcodeHit.calories,
        protein_g: hintBarcodeHit.protein_g,
        carbs_g: hintBarcodeHit.carbs_g,
        fat_g: hintBarcodeHit.fat_g,
        source: "open_food_facts_barcode",
        confidence: hintBarcodeHit.confidence,
        barcode: hintBarcodeHit.barcode,
        product_name: hintBarcodeHit.product_name,
        brand: hintBarcodeHit.brand,
        requires_confirmation: true,
        match_method: "direct_barcode",
        citation: {
          provider: hintBarcodeHit.citation.provider,
          detail: `from_query_hint:${hintBarcode}`,
          url: hintBarcodeHit.citation.endpoint
        },
        attempts
      };
    }
  }

  const inferred = await inferFoodFromImage(imagePath, config);
  if (!inferred || !inferred.is_food) {
    console.log("[tool:get_barcode_macros:chain] unresolved: infer missing or non-food");
    attempts.push({ source: "vision", status: "miss", detail: "not_food_or_infer_failed" });
    return null;
  }

  console.log(`[tool:get_barcode_macros:chain] infer=${JSON.stringify(inferred)}`);
  const inferredFoodQuery = inferred.food_query ?? undefined;
  const inferredBrand = inferred.brand ?? undefined;
  const inferredPortion = inferred.portion ?? undefined;
  const regulatory = inferred.fssai_license ? { fssai_license: inferred.fssai_license } : undefined;

  const visionBarcodes = [inferred.barcode, ...(inferred.barcode_candidates ?? [])]
    .map((item) => normalizeBarcode(item ?? undefined))
    .filter((item): item is string => Boolean(item));
  const uniqueVisionBarcodes = Array.from(new Set(visionBarcodes));

  for (const candidate of uniqueVisionBarcodes) {
    const standard = detectBarcodeStandard(candidate);
    const checksumOk = hasValidChecksum(candidate);
    attempts.push({
      source: "vision_barcode",
      status: "miss",
      detail: `barcode=${candidate} standard=${standard} checksum=${String(checksumOk)}`
    });
    if (!checksumOk) {
      continue;
    }

    console.log(`[tool:get_barcode_macros:chain] trying inferred barcode=${candidate}`);
    const barcodeHit = await fetchOpenFoodFactsByBarcode(candidate);
    if (barcodeHit) {
      attempts[attempts.length - 1] = {
        source: "vision_barcode",
        status: "hit",
        detail: `barcode=${candidate} standard=${standard} checksum=true`
      };
      return {
        calories: barcodeHit.calories,
        protein_g: barcodeHit.protein_g,
        carbs_g: barcodeHit.carbs_g,
        fat_g: barcodeHit.fat_g,
        source: "open_food_facts_barcode",
        confidence: barcodeHit.confidence,
        barcode: barcodeHit.barcode,
        product_name: barcodeHit.product_name,
        brand: barcodeHit.brand,
        requires_confirmation: true,
        match_method: "direct_barcode",
        citation: {
          provider: barcodeHit.citation.provider,
          detail: candidate,
          url: barcodeHit.citation.endpoint
        },
        regulatory,
        attempts
      };
    }
    console.log(`[tool:get_barcode_macros:chain] inferred barcode miss barcode=${candidate}`);
  }

  const fallbackQuery = inferredFoodQuery ?? queryHint;
  if (!fallbackQuery) {
    console.log("[tool:get_barcode_macros:chain] unresolved: no fallback query");
    attempts.push({ source: "query_fallback", status: "miss", detail: "no_query" });
    return null;
  }

  attempts.push({ source: "open_food_facts_search", status: "miss", detail: `query=${fallbackQuery}` });
  const barcodeCandidates = await searchOpenFoodFactsBarcodeCandidates({
    query: fallbackQuery,
    brand: inferredBrand,
    limit: 8
  });

  const bestCandidate = barcodeCandidates[0];
  if (bestCandidate && bestCandidate.score >= 0.6) {
    console.log(
      `[tool:get_barcode_macros:chain] trying candidate barcode=${bestCandidate.barcode} score=${bestCandidate.score.toFixed(2)}`
    );
    const candidateHit = await fetchOpenFoodFactsByBarcode(bestCandidate.barcode);
    if (candidateHit && isLikelyFood(bestCandidate.categories_tags)) {
      attempts[attempts.length - 1] = {
        source: "open_food_facts_search",
        status: "hit",
        detail: `query=${fallbackQuery} barcode=${bestCandidate.barcode} score=${bestCandidate.score.toFixed(2)}`
      };
      return {
        calories: candidateHit.calories,
        protein_g: candidateHit.protein_g,
        carbs_g: candidateHit.carbs_g,
        fat_g: candidateHit.fat_g,
        source: "open_food_facts_barcode",
        confidence: candidateHit.confidence === "high" ? "high" : "medium",
        barcode: candidateHit.barcode,
        product_name: candidateHit.product_name ?? bestCandidate.product_name,
        brand: candidateHit.brand ?? bestCandidate.brand,
        requires_confirmation: true,
        match_method: "searched_barcode",
        citation: {
          provider: candidateHit.citation.provider,
          detail: `candidate_score=${bestCandidate.score.toFixed(2)}`,
          url: candidateHit.citation.endpoint
        },
        regulatory,
        attempts
      };
    }
    console.log("[tool:get_barcode_macros:chain] candidate barcode miss or non-food categories");
  } else {
    console.log(
      `[tool:get_barcode_macros:chain] no strong candidate best_score=${bestCandidate ? bestCandidate.score.toFixed(2) : "none"}`
    );
  }

  console.log(`[tool:get_barcode_macros:chain] fallback lookup query=${fallbackQuery} brand=${inferred.brand ?? "-"}`);
  attempts.push({ source: "lookup_food", status: "miss", detail: `query=${fallbackQuery}` });
  const lookup = await lookupFood(
    {
      query: fallbackQuery,
      brand: inferredBrand,
      portion: inferredPortion
    },
    config
  );

  return {
    calories: lookup.calories,
    protein_g: lookup.protein_g,
    carbs_g: lookup.carbs_g,
    fat_g: lookup.fat_g,
    source: lookup.source,
    confidence: lookup.confidence,
    barcode: inferred.barcode ?? undefined,
    product_name: inferredFoodQuery,
    brand: inferredBrand,
    requires_confirmation: true,
    match_method: "fallback_lookup",
    citation: lookup.citation,
    regulatory,
    attempts: attempts.map((item, idx) => {
      if (idx === attempts.length - 1) {
        return { source: item.source, status: "hit", detail: `${item.detail} source=${lookup.source}` };
      }
      return item;
    })
  };
}

function extractBarcodeCandidate(value: string | undefined): string | null {
  return normalizeBarcode(value);
}

function isLikelyFood(categories: string[] | undefined): boolean {
  if (!categories || categories.length === 0) return true;
  const lower = categories.map((entry) => entry.toLowerCase());
  const obviousNonFood = ["beauty", "cosmetic", "petfood", "household", "cleaner", "supplement"];
  return !obviousNonFood.some((token) => lower.some((entry) => entry.includes(token)));
}
