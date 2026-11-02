import { normalizeCinchoAudience, normalizeCinchoType } from "utils/productCinchoHelper";
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
  PACKAGING: "PACKAGING",
};

export const ENTRECUEROS_WHOLESALE_UNLOCK_QTY = 6;

const LIST_CASUAL_TIERS = [
  { minQty: 1, label: "1", unitPrice: 125 },
  { minQty: 3, label: "3+", unitPrice: 110 },
  { minQty: 6, label: "6+", unitPrice: 95 },
  { minQty: 12, label: "12+", unitPrice: 85 },
];

const SYNTHETIC_UNIT = 40;
const SYNTHETIC_QTY3_UNIT = 30;
const B1_GROUP_SIZE = 3;
const B1_GROUP_TOTAL = 130;

function stripDiacritics(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}/gu, "");
}

function compactHardware(value) {
  return stripDiacritics(value).trim().toUpperCase().replace(/[\s_]/g, "");
}

function isSyntheticVariant(value) {
  const compact = compactHardware(value);
  if (compact.startsWith("NOSINTETIC")) return false;
  return compact === "SINTETICO"
    || compact === "SINTETICA"
    || compact.startsWith("SINTETICO:")
    || compact.startsWith("SINTETICA:");
}

function isCinchoLine(source) {
  const type = normalizeCinchoType(source?.cinchoType);
  if (type === "CASUAL" || type === "REVERSIBLE") return true;
  const code = String(source?.productCode || "").trim().toUpperCase();
  if (code.startsWith("FOSS")) return true;
  const name = stripDiacritics(source?.productName).toLowerCase();
  return name.includes("cincho");
}

function cinchoKind(source) {
  if (normalizeCinchoType(source?.cinchoType) === "REVERSIBLE") {
    return ENTRECUEROS_PRICE_KIND.REVERSIBLE;
  }
  const audience = normalizeCinchoAudience(source?.hardwareCondition);
  if (audience === "NINO") return ENTRECUEROS_PRICE_KIND.NINO;
  if (audience === "DAMA") return ENTRECUEROS_PRICE_KIND.DAMA;
  return ENTRECUEROS_PRICE_KIND.CASUAL;
}

/**
 * First match wins. Hardware is the line variant (`hardwareCondition`).
 * Packaging, cincho, tarjetero, billetera, then any other synthetic product.
 */
export function entrecuerosPriceKind(source) {
  if (!source) return ENTRECUEROS_PRICE_KIND.PRODUCT;
  if (source.isPackaging || isPackagingProductCode(source.productCode)) {
    return ENTRECUEROS_PRICE_KIND.PACKAGING;
  }
  if (isCinchoLine(source)) return cinchoKind(source);
  const name = String(source.productName || "").toUpperCase();
  if (name.includes("TARJETER")) return ENTRECUEROS_PRICE_KIND.CARDHOLDER_SYNTHETIC;
  const synthetic = isSyntheticVariant(source.hardwareCondition);
  if (name.includes("BILLETERA")) {
    return synthetic
      ? ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC
      : ENTRECUEROS_PRICE_KIND.WALLET_LEATHER;
  }
  if (synthetic) return ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC;
  return ENTRECUEROS_PRICE_KIND.PRODUCT;
}

export function entrecuerosVolumeKey(source) {
  const kind = entrecuerosPriceKind(source);
  if (kind === ENTRECUEROS_PRICE_KIND.PRODUCT || kind === ENTRECUEROS_PRICE_KIND.PACKAGING) {
    return `${source?.productId ?? ""}|${kind}`;
  }
  return kind;
}

export function isEntrecuerosPackagingLine(source) {
  return entrecuerosPriceKind(source) === ENTRECUEROS_PRICE_KIND.PACKAGING;
}

function exactProductCode(source) {
  return String(source?.productCode || "").trim().toUpperCase();
}

function isExactB1Code(source) {
  const code = exactProductCode(source);
  return code === "B-1" || code === "B1";
}

function isExactB5OrB2Code(source) {
  const code = exactProductCode(source);
  return code === "B-5" || code === "B5" || code === "B-2" || code === "B2";
}

function lineQuantity(source, qty) {
  const n = Number(source?.quantity);
  if (Number.isFinite(n) && n > 0) return n;
  return Number(qty || 0);
}

function syntheticB1LineTotal(qty) {
  const n = Math.trunc(Number(qty) || 0);
  if (n <= 0) return 0;
  return Math.floor(n / B1_GROUP_SIZE) * B1_GROUP_TOTAL + (n % B1_GROUP_SIZE) * SYNTHETIC_UNIT;
}

export function roundEntrecuerosMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  const cents = Math.floor(Math.abs(n) * 100 + 0.5 + 1e-8);
  return (sign * cents) / 100;
}

function firstPositive(values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function catalogUnit(source) {
  return firstPositive([
    source?.catalogPrice,
    source?.catalogUnitPrice,
    source?.suggestedUnitPrice,
  ]);
}

function hasProductTiers(source) {
  return firstPositive([
    source?.entrecuerosPriceUnit,
    source?.entrecuerosPriceQty3,
    source?.entrecuerosPriceQty6,
    source?.entrecuerosPriceQty12,
  ]) > 0;
}

function listProductTiers(source) {
  const tiers = [];
  const unit = firstPositive([source?.entrecuerosPriceUnit, catalogUnit(source)]);
  if (unit > 0) tiers.push({ minQty: 1, label: "1", unitPrice: unit });
  const qty3 = firstPositive([source?.entrecuerosPriceQty3]);
  const qty6 = firstPositive([source?.entrecuerosPriceQty6]);
  const qty12 = firstPositive([source?.entrecuerosPriceQty12]);
  if (qty3 > 0) tiers.push({ minQty: 3, label: "3+", unitPrice: qty3 });
  if (qty6 > 0) tiers.push({ minQty: 6, label: "6+", unitPrice: qty6 });
  if (qty12 > 0) tiers.push({ minQty: 12, label: "12+", unitPrice: qty12 });
  return tiers;
}

function listCasualTiers(source) {
  if (hasProductTiers(source)) return listProductTiers(source);
  return LIST_CASUAL_TIERS;
}

function listSyntheticWalletTiers(source) {
  if (isExactB1Code(source)) {
    return [{ minQty: 1, label: "1", unitPrice: SYNTHETIC_UNIT }];
  }
  if (isExactB5OrB2Code(source)) {
    return [
      { minQty: 1, label: "1", unitPrice: SYNTHETIC_UNIT },
      { minQty: 3, label: "3+", unitPrice: SYNTHETIC_QTY3_UNIT },
      { minQty: 4, label: "4+", unitPrice: SYNTHETIC_UNIT },
    ];
  }
  return [
    { minQty: 1, label: "1", unitPrice: SYNTHETIC_UNIT },
    { minQty: 3, label: "3+", unitPrice: SYNTHETIC_QTY3_UNIT },
  ];
}

export function listEntrecuerosPriceListTiers(source) {
  switch (entrecuerosPriceKind(source)) {
    case ENTRECUEROS_PRICE_KIND.PACKAGING:
      return [{ minQty: 1, label: "1", unitPrice: catalogUnit(source) }];
    case ENTRECUEROS_PRICE_KIND.NINO:
      return [
        { minQty: 1, label: "1", unitPrice: 75 },
        { minQty: 3, label: "3+", unitPrice: 55 },
      ];
    case ENTRECUEROS_PRICE_KIND.DAMA:
      return [
        { minQty: 1, label: "1", unitPrice: 75 },
        { minQty: 3, label: "3+", unitPrice: 70 },
      ];
    case ENTRECUEROS_PRICE_KIND.REVERSIBLE:
      return [{ minQty: 1, label: "1", unitPrice: 125 }];
    case ENTRECUEROS_PRICE_KIND.WALLET_LEATHER:
      return [
        { minQty: 1, label: "1", unitPrice: 125 },
        { minQty: 3, label: "3+", unitPrice: 75 },
        { minQty: 6, label: "6+", unitPrice: 65 },
      ];
    case ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC:
      return listSyntheticWalletTiers(source);
    case ENTRECUEROS_PRICE_KIND.CARDHOLDER_SYNTHETIC:
      return [
        { minQty: 1, label: "1", unitPrice: 15 },
        { minQty: 3, label: "3+", unitPrice: 10 },
      ];
    case ENTRECUEROS_PRICE_KIND.CASUAL:
      return listCasualTiers(source);
    default:
      return listProductTiers(source);
  }
}

function priceForQuantity(tiers, qty) {
  let price = 0;
  tiers.forEach((tier) => {
    if (qty >= tier.minQty) price = tier.unitPrice;
  });
  return price;
}

function topTierPrice(tiers) {
  return tiers.reduce((best, tier) => (tier.minQty >= best.minQty ? tier : best), tiers[0])?.unitPrice || 0;
}

/**
 * `courtesy` prices the line at its own highest configured tier (12, else 6, else 3, else 1, else catalog).
 * Packaging ignores it. Reversible is flat so courtesy equals the list. Exact B-1 courtesy is Q40/unit;
 * without courtesy, B-1 is Q130 per complete group of 3 and Q40 per leftover unit.
 */
export function resolveEntrecuerosListUnitPrice(source, qty, courtesy = false) {
  const kind = entrecuerosPriceKind(source);
  if (kind === ENTRECUEROS_PRICE_KIND.PACKAGING) {
    return roundEntrecuerosMoney(catalogUnit(source));
  }
  if (kind === ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC && isExactB1Code(source)) {
    if (courtesy) return roundEntrecuerosMoney(SYNTHETIC_UNIT);
    const n = lineQuantity(source, qty);
    if (n <= 0) return 0;
    return roundEntrecuerosMoney(syntheticB1LineTotal(n) / n);
  }
  const tiers = listEntrecuerosPriceListTiers(source);
  if (!tiers.length) return 0;
  const useTop = Boolean(courtesy) && kind !== ENTRECUEROS_PRICE_KIND.REVERSIBLE;
  const priceQty = kind === ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC && isExactB5OrB2Code(source)
    ? lineQuantity(source, qty)
    : Number(qty || 0);
  const price = useTop ? topTierPrice(tiers) : priceForQuantity(tiers, priceQty);
  return roundEntrecuerosMoney(price);
}

export function resolveEntrecuerosListLineTotal(source, qty, courtesy = false) {
  const quantity = lineQuantity(source, qty);
  if (entrecuerosPriceKind(source) === ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC && isExactB1Code(source)) {
    if (courtesy) return roundEntrecuerosMoney(SYNTHETIC_UNIT * quantity);
    return roundEntrecuerosMoney(syntheticB1LineTotal(quantity));
  }
  return roundEntrecuerosMoney(resolveEntrecuerosListUnitPrice(source, qty, courtesy) * quantity);
}

export function entrecuerosCartQuantities(cart) {
  const qtyByKey = {};
  (cart || []).forEach((line) => {
    if (!line || isEntrecuerosPackagingLine(line)) return;
    const key = entrecuerosVolumeKey(line);
    qtyByKey[key] = (qtyByKey[key] || 0) + Number(line.quantity || 0);
  });
  let topQty = 0;
  Object.values(qtyByKey).forEach((qty) => {
    if (qty > topQty) topQty = qty;
  });
  return {
    qtyByKey,
    courtesyActive: topQty >= ENTRECUEROS_WHOLESALE_UNLOCK_QTY,
  };
}

export function lineReceivesEntrecuerosCourtesy(source, groupQty, courtesyActive) {
  if (!courtesyActive || isEntrecuerosPackagingLine(source)) return false;
  return Number(groupQty || 0) < ENTRECUEROS_WHOLESALE_UNLOCK_QTY;
}

export function cartUnlocksEntrecuerosWholesale(cart) {
  return entrecuerosCartQuantities(cart).courtesyActive;
}

export function sumEntrecuerosLineTotals(lines) {
  const cents = (lines || []).reduce((sum, line) => {
    const total = line?.lineTotal != null
      ? Number(line.lineTotal)
      : roundEntrecuerosMoney(Number(line?.unitPrice || 0) * Number(line?.quantity || 0));
    return sum + Math.round(roundEntrecuerosMoney(total) * 100);
  }, 0);
  return cents / 100;
}

export const ENTRECUEROS_VARIANT_FILTERS = [
  { value: "", label: "Todas" },
  { value: "CASUAL", label: "Casual" },
  { value: "REVERSIBLE", label: "Reversible" },
  { value: "NINO", label: "Cincho niño" },
  { value: "DAMA", label: "Cincho dama" },
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
