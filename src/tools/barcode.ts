export type BarcodeStandard = "EAN-8" | "EAN-13" | "UPC-A" | "unknown";

export function normalizeBarcode(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D+/g, "");
  if (!/^\d{8,14}$/.test(digits)) return null;
  return digits;
}

export function detectBarcodeStandard(code: string): BarcodeStandard {
  if (/^\d{8}$/.test(code)) return "EAN-8";
  if (/^\d{12}$/.test(code)) return "UPC-A";
  if (/^\d{13}$/.test(code)) return "EAN-13";
  return "unknown";
}

export function hasValidChecksum(code: string): boolean {
  if (!/^\d+$/.test(code) || code.length < 8) return false;
  if (code.length === 8) return isValidEan8(code);
  if (code.length === 12) return isValidUpcA(code);
  if (code.length === 13) return isValidEan13(code);
  return false;
}

function isValidEan8(code: string): boolean {
  const digits = code.split("").map(Number);
  const check = digits[7];
  const sum = digits.slice(0, 7).reduce((acc, d, idx) => acc + d * (idx % 2 === 0 ? 3 : 1), 0);
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

function isValidEan13(code: string): boolean {
  const digits = code.split("").map(Number);
  const check = digits[12];
  const sum = digits.slice(0, 12).reduce((acc, d, idx) => acc + d * (idx % 2 === 0 ? 1 : 3), 0);
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}

function isValidUpcA(code: string): boolean {
  const digits = code.split("").map(Number);
  const check = digits[11];
  let odd = 0;
  let even = 0;
  for (let i = 0; i < 11; i += 1) {
    const value = digits[i] ?? 0;
    if (i % 2 === 0) odd += value;
    else even += value;
  }
  const sum = odd * 3 + even;
  const computed = (10 - (sum % 10)) % 10;
  return computed === check;
}
