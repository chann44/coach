interface OpenFoodFactsSearchProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  categories_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
}

interface OpenFoodFactsSearchResponse {
  products?: OpenFoodFactsSearchProduct[];
}

export interface OpenFoodFactsBarcodeCandidate {
  barcode: string;
  product_name?: string;
  brand?: string;
  score: number;
  categories_tags?: string[];
}

export async function searchOpenFoodFactsBarcodeCandidates(input: {
  query: string;
  brand?: string;
  limit?: number;
}): Promise<OpenFoodFactsBarcodeCandidate[]> {
  const query = [input.brand, input.query].filter(Boolean).join(" ").trim();
  if (!query) return [];

  console.log(`[tool:off_search] query=${query} limit=${input.limit ?? 8}`);

  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", query);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(input.limit ?? 8));

  const response = await fetch(url, {
    headers: { "User-Agent": "coach-app/1.0 (local nutrition lookup)" }
  }).catch(() => null);
  if (!response || !response.ok) {
    console.log(`[tool:off_search] miss status=${response?.status ?? "no_response"}`);
    return [];
  }

  const data = (await response.json().catch(() => null)) as OpenFoodFactsSearchResponse | null;
  if (!data?.products?.length) return [];

  const queryTokens = tokenize(query);

  const ranked: OpenFoodFactsBarcodeCandidate[] = [];

  for (const product of data.products) {
    const barcode = normalizeBarcode(product.code);
    if (!barcode) continue;

    const productName = clean(product.product_name);
    const brand = clean(product.brands);
    const joined = [brand, productName].filter(Boolean).join(" ");
    const productTokens = tokenize(joined);
    const overlap = tokenOverlap(queryTokens, productTokens);
    const hasNutriments = Boolean(product.nutriments && Object.keys(product.nutriments).length > 0);
    const score = overlap + (hasNutriments ? 0.15 : 0);

    ranked.push({
      barcode,
      product_name: productName,
      brand,
      categories_tags: product.categories_tags,
      score
    });
  }

  ranked.sort((a, b) => b.score - a.score);

  console.log(
    `[tool:off_search] candidates=${ranked.length} top=${ranked
      .slice(0, 3)
      .map((item) => `${item.barcode}:${item.score.toFixed(2)}`)
      .join(",") || "none"}`
  );

  return ranked;
}

function normalizeBarcode(value: string | undefined): string | null {
  if (!value) return null;
  const code = value.replace(/\D+/g, "");
  if (!/^\d{8,14}$/.test(code)) return null;
  return code;
}

function clean(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function tokenize(input: string): Set<string> {
  const words = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((part) => part.length >= 2);
  return new Set(words);
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / Math.max(a.size, b.size);
}
