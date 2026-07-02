export const PRODUCT_AUDIENCE_OPTIONS = [
  { value: "DAMA", label: "Dama" },
  { value: "CABALLERO", label: "Caballero" },
  { value: "UNISEX", label: "Unisex" },
];

export const PROMO_AUDIENCE_OPTIONS = [
  { value: "", label: "Todas las líneas" },
  { value: "DAMA", label: "Dama" },
  { value: "CABALLERO", label: "Caballero" },
];

export const PROMO_TIER_AUDIENCE_OPTIONS = PRODUCT_AUDIENCE_OPTIONS;

export const normalizeAudienceCategory = (value) => {
  const v = String(value || "UNISEX")
    .trim()
    .toUpperCase();
  if (v === "DAMA" || v === "CABALLERO") return v;
  return "UNISEX";
};

export const getProductAudienceLabel = (value) => {
  const normalized = normalizeAudienceCategory(value);
  return PRODUCT_AUDIENCE_OPTIONS.find((opt) => opt.value === normalized)?.label || "Unisex";
};

export const getPromoAudienceLabel = (value) => {
  if (!value) return "Todas";
  return getProductAudienceLabel(value);
};

export const productMatchesAudienceFilter = (item, audienceFilter) => {
  if (!audienceFilter) return true;
  const product = normalizeAudienceCategory(item?.audienceCategory);
  const filter = normalizeAudienceCategory(audienceFilter);
  if (product === "UNISEX") return true;
  return product === filter;
};

export const lineMatchesPromotionAudience = (line, promoAudience) => {
  if (!promoAudience) return true;
  const product = normalizeAudienceCategory(line?.audienceCategory);
  const promo = normalizeAudienceCategory(promoAudience);
  if (product === "UNISEX") return true;
  return product === promo;
};

export const filterCartLinesForPromotion = (cartLines, promoAudience) =>
  (cartLines || []).filter((line) => lineMatchesPromotionAudience(line, promoAudience));

export const buildPromotionTierMap = (promotion) => {
  const map = {};
  (promotion?.tiers || []).forEach((tier) => {
    const audience = normalizeAudienceCategory(tier?.audienceCategory);
    map[audience] = Number(tier?.discountValue || 0);
  });
  return map;
};

export const formatPromotionTierSummary = (promotion) => {
  const tiers = (promotion?.tiers || []).filter((tier) => Number(tier?.discountValue || 0) > 0);
  if (!tiers.length) return "";
  return tiers
    .map((tier) => `${getProductAudienceLabel(tier.audienceCategory)} ${Number(tier.discountValue)}%`)
    .join(" · ");
};

export const formatPromotionOptionLabel = (promo) => {
  const type = String(promo?.discountType || "").toUpperCase();
  if (type.includes("TIERED")) {
    const tierSummary = formatPromotionTierSummary(promo);
    return tierSummary ? `${promo?.name || "Promoción"} · ${tierSummary}` : promo?.name || "Promoción";
  }
  const audience = promo?.audienceCategory ? ` · ${getPromoAudienceLabel(promo.audienceCategory)}` : "";
  return `${promo?.name || "Promoción"}${audience}`;
};
