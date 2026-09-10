export const PRODUCT_BRAND_OPTIONS = [
  "LEVIS",
  "NAUTICA",
  "TOMMY HILFIGER",
  "LACOSTE",
  "ABERCROMBIE",
];

export function normalizeProductBrand(value) {
  const n = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  return PRODUCT_BRAND_OPTIONS.includes(n) ? n : "";
}
