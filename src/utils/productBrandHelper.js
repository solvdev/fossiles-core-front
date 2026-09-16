export const PRODUCT_BRAND_OPTIONS = [
  "LEVIS",
  "NAUTICA",
  "TOMMY HILFIGER",
  "LACOSTE",
  "ABERCROMBIE",
];

/** Colores de marca con contraste alto (el badge secondary del tema queda ilegible). */
export const PRODUCT_BRAND_STYLES = {
  LEVIS: { bg: "#C41230", fg: "#FFFFFF", accent: "#F5D76E", short: "LV" },
  NAUTICA: { bg: "#0A2540", fg: "#FFFFFF", accent: "#E10600", short: "NA" },
  "TOMMY HILFIGER": { bg: "#001E62", fg: "#FFFFFF", accent: "#D0121A", short: "TH" },
  LACOSTE: { bg: "#004D27", fg: "#FFFFFF", accent: "#C4A35A", short: "LC" },
  ABERCROMBIE: { bg: "#5C3317", fg: "#FFFFFF", accent: "#E8D5A3", short: "AB" },
};

export function productBrandStyle(brand) {
  return PRODUCT_BRAND_STYLES[normalizeProductBrand(brand)] || null;
}

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
