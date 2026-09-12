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

/** Marca embebida en nombre/código (cinchos Entrecueros). El más largo gana (TOMMY HILFIGER). */
export function extractBrandFromText(value) {
  const n = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!n) return "";
  return [...PRODUCT_BRAND_OPTIONS]
    .sort((a, b) => b.length - a.length)
    .find((brand) => n.includes(brand)) || "";
}
