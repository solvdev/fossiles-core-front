import { isSyntheticHardware, normalizeCinchoAudience, normalizeCinchoType } from "utils/productCinchoHelper";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";

export const ENTRECUEROS_PRICE_KIND = {
  CASUAL: "CASUAL",
  REVERSIBLE: "REVERSIBLE",
  NINO: "NINO",
  DAMA: "DAMA",
  WALLET_LEATHER: "WALLET_LEATHER",
  WALLET_SYNTHETIC: "WALLET_SYNTHETIC",
  CARDHOLDER_SYNTHETIC: "CARDHOLDER_SYNTHETIC",
  PRODUCT: "PRODUCT",
};

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function isCinchoSource(source) {
  if (normalizeCinchoType(source?.cinchoType)) return true;
  const text = `${source?.productCode || ""} ${source?.productName || ""} ${source?.categoryName || ""}`.toUpperCase();
  return text.includes("CINCHO");
}

function isWalletSource(source) {
  const text = `${source?.productCode || ""} ${source?.productName || ""} ${source?.categoryName || ""}`.toUpperCase();
  return text.includes("BILLETER") || text.includes("WALLET");
}

export function entrecuerosPriceKind(source) {
  if (!source || isPackagingProductCode(source.productCode)) {
    return ENTRECUEROS_PRICE_KIND.PRODUCT;
  }
  const hardware = source.hardwareCondition;
  const cincho = isCinchoSource(source);
  if (cincho && normalizeCinchoType(source.cinchoType) === "REVERSIBLE") {
    return ENTRECUEROS_PRICE_KIND.REVERSIBLE;
  }
  const audience = normalizeCinchoAudience(hardware);
  if (cincho && audience === "NINO") return ENTRECUEROS_PRICE_KIND.NINO;
  if (cincho && audience === "DAMA") return ENTRECUEROS_PRICE_KIND.DAMA;
  if (cincho) return ENTRECUEROS_PRICE_KIND.CASUAL;
  const name = String(source.productName || "").toUpperCase();
  const synthetic = isSyntheticHardware(hardware);
  if (name.includes("TARJETER")) return ENTRECUEROS_PRICE_KIND.CARDHOLDER_SYNTHETIC;
  if (isWalletSource(source)) {
    return synthetic ? ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC : ENTRECUEROS_PRICE_KIND.WALLET_LEATHER;
  }
  return synthetic ? ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC : ENTRECUEROS_PRICE_KIND.PRODUCT;
}

export function entrecuerosVolumeKey(source) {
  return `${source?.productId ?? ""}|${entrecuerosPriceKind(source)}`;
}

function hasProductTiers(source) {
  return [source?.entrecuerosPriceUnit, source?.entrecuerosPriceQty3, source?.entrecuerosPriceQty6, source?.entrecuerosPriceQty12]
    .some((value) => money(value) > 0);
}

function listProductTiers(source) {
  const p1 = money(source?.entrecuerosPriceUnit || source?.catalogUnitPrice || source?.suggestedUnitPrice);
  const tiers = [{ minQty: 1, label: "1", unitPrice: p1 }];
  const p3 = money(source?.entrecuerosPriceQty3);
  const p6 = money(source?.entrecuerosPriceQty6);
  const p12 = money(source?.entrecuerosPriceQty12);
  if (p3 > 0) tiers.push({ minQty: 3, label: "3+", unitPrice: p3 });
  if (p6 > 0) tiers.push({ minQty: 6, label: "6+", unitPrice: p6 });
  if (p12 > 0) tiers.push({ minQty: 12, label: "12+", unitPrice: p12 });
  return tiers.filter((tier) => money(tier.unitPrice) > 0);
}

function listCasualTiers(source) {
  if (hasProductTiers(source)) return listProductTiers(source);
  return [
    { minQty: 1, label: "1", unitPrice: 100 },
    { minQty: 3, label: "3+", unitPrice: 90 },
    { minQty: 6, label: "6+", unitPrice: 80 },
    { minQty: 12, label: "12+", unitPrice: 75 },
  ];
}

function listSyntheticWalletTiers(source) {
  const code = String(source?.productCode || "").trim().toUpperCase();
  if (code.includes("B-1") || code === "B1") {
    return [{ minQty: 1, label: "1", unitPrice: 40 }];
  }
  return [
    { minQty: 1, label: "1", unitPrice: 40 },
    { minQty: 3, label: "3+", unitPrice: 30 },
  ];
}

export function listEntrecuerosPriceListTiers(source) {
  switch (entrecuerosPriceKind(source)) {
    case ENTRECUEROS_PRICE_KIND.NINO:
      return [
        { minQty: 1, label: "1", unitPrice: 65 },
        { minQty: 3, label: "3+", unitPrice: 45 },
      ];
    case ENTRECUEROS_PRICE_KIND.DAMA:
      return [
        { minQty: 1, label: "1", unitPrice: 65 },
        { minQty: 3, label: "3+", unitPrice: 60 },
      ];
    case ENTRECUEROS_PRICE_KIND.REVERSIBLE:
      return [{ minQty: 1, label: "1", unitPrice: 100 }];
    case ENTRECUEROS_PRICE_KIND.WALLET_LEATHER:
      return [
        { minQty: 1, label: "1", unitPrice: 100 },
        { minQty: 3, label: "3+", unitPrice: 65 },
        { minQty: 6, label: "6+", unitPrice: 55 },
      ];
    case ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC:
      return listSyntheticWalletTiers(source);
    case ENTRECUEROS_PRICE_KIND.CARDHOLDER_SYNTHETIC:
      return [
        { minQty: 1, label: "1", unitPrice: 10 },
        { minQty: 3, label: "3+", unitPrice: 6 },
      ];
    case ENTRECUEROS_PRICE_KIND.CASUAL:
      return listCasualTiers(source);
    default:
      return listProductTiers(source);
  }
}

export function resolveEntrecuerosListUnitPrice(source, qty) {
  const n = Number(qty || 0);
  let price = 0;
  listEntrecuerosPriceListTiers(source).forEach((tier) => {
    if (n >= tier.minQty) price = tier.unitPrice;
  });
  return price;
}

export const ENTRECUEROS_VARIANT_FILTERS = [
  { value: "", label: "Todas" },
  { value: "CASUAL", label: "Casual" },
  { value: "REVERSIBLE", label: "Reversible" },
  { value: "NINO", label: "Niño" },
  { value: "DAMA", label: "Dama" },
  { value: "BILLETERAS", label: "Billeteras" },
  { value: "SINTETICOS", label: "Sintéticos" },
];

export function matchesEntrecuerosVariantFilter(row, filter) {
  if (!filter) return true;
  const kind = entrecuerosPriceKind(row);
  if (filter === "CASUAL") return kind === ENTRECUEROS_PRICE_KIND.CASUAL;
  if (filter === "REVERSIBLE") return kind === ENTRECUEROS_PRICE_KIND.REVERSIBLE;
  if (filter === "NINO") return kind === ENTRECUEROS_PRICE_KIND.NINO;
  if (filter === "DAMA") return kind === ENTRECUEROS_PRICE_KIND.DAMA;
  if (filter === "BILLETERAS") return kind === ENTRECUEROS_PRICE_KIND.WALLET_LEATHER;
  if (filter === "SINTETICOS") {
    return kind === ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC
      || kind === ENTRECUEROS_PRICE_KIND.CARDHOLDER_SYNTHETIC;
  }
  return true;
}
