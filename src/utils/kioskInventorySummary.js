import { getProductAudienceLabel, normalizeAudienceCategory } from "utils/productAudienceHelper";
import {
  isCinchoProductRow,
  isPackagingProductCode,
  normalizeCinchoType,
  normalizeHardwareCondition,
} from "utils/productCinchoHelper";
import { POS_CATEGORY_ORDER, posVariantStockQty } from "views/kiosks/pos/posUtils";

const PACKAGING_KEY = "PACKAGING";

const safeText = (value) => String(value || "").trim();
const safeNumber = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
};

const isWalletCategory = (name) => {
  if (!name || name === "Empaques") return false;
  return String(name).toUpperCase().includes("BILLETERA");
};

const isVariantLow = (variant) => {
  const stock = posVariantStockQty(variant);
  const min = safeNumber(variant?.min);
  if (stock <= 0) return true;
  return min > 0 && stock <= min;
};

/** Fila compatible con isCinchoProductRow (usa sizes como systemSizes). */
const asCinchoProbe = (product) => ({
  productCode: product.productCode,
  productName: product.productName,
  cinchoType: product.cinchoType,
  cinchoForKids: product.cinchoForKids,
  packaging: product.packaging,
  systemSizes: product.sizes || product.variants?.[0]?.sizes || null,
});

const resolveGroupKey = (product) => {
  if (product.packaging || isPackagingProductCode(product.productCode)) {
    return PACKAGING_KEY;
  }
  if (isCinchoProductRow(asCinchoProbe(product))) {
    const categoryId = product.productCategoryId ?? "NONE";
    if (product.cinchoForKids) {
      return `BELT:${categoryId}:KIDS:KIDS`;
    }
    const classification = normalizeCinchoType(product.cinchoType) || "UNCLASSIFIED";
    const audience = normalizeAudienceCategory(product.audienceCategory);
    return `BELT:${categoryId}:${classification}:${audience}`;
  }
  const categoryName = product.productCategoryName || "";
  if (isWalletCategory(categoryName)) {
    const audience = normalizeAudienceCategory(product.audienceCategory);
    const categoryId = product.productCategoryId ?? "0";
    return `WALLET:${categoryId}:${audience}`;
  }
  const categoryId = product.productCategoryId ?? "NONE";
  return `CAT:${categoryId}`;
};

const resolveGroupLabel = (key, product) => {
  if (key === PACKAGING_KEY) return "Empaques";
  if (key.startsWith("BELT:")) {
    const [, , classification, audience] = key.split(":");
    const labels = {
      CASUAL: "Casual",
      REVERSIBLE: "Reversible",
      KIDS: "Niño",
      UNCLASSIFIED: "Sin clasificar",
    };
    const baseName = String(product.productCategoryName || "Cinchos").split(" — ")[0];
    if (classification === "KIDS") {
      return `${baseName} — Niño`;
    }
    return `${baseName} — ${getProductAudienceLabel(audience)} — ${labels[classification] || "Sin clasificar"}`;
  }
  if (key.startsWith("WALLET:")) {
    const audience = key.split(":")[2];
    const baseName = String(product.productCategoryName || "Billeteras").split(" — ")[0];
    return `${baseName} — ${getProductAudienceLabel(audience)}`;
  }
  return product.productCategoryName || "Sin categoría";
};

const categorySortIndex = (label) => {
  const base = String(label || "")
    .split(" — ")[0]
    .trim()
    .toLowerCase();
  const idx = POS_CATEGORY_ORDER.findIndex((name) => name.toLowerCase() === base);
  return idx >= 0 ? idx : 999;
};

/**
 * Agrupa productos del inventario kiosko para el resumen fácil de encargadas.
 * @param {object[]} products — salida de buildProducts (productos con variants)
 */
export function buildKioskInventorySummaryGroups(products) {
  const byKey = new Map();

  (products || []).forEach((product) => {
    if (!product) return;
    const key = resolveGroupKey(product);
    const label = resolveGroupLabel(key, product);
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label,
        units: 0,
        unitsNuevo: 0,
        unitsViejo: 0,
        products: 0,
        variants: 0,
        lowCount: 0,
        productKeys: [],
      });
    }
    const group = byKey.get(key);
    const variants = product.variants || [];
    group.products += 1;
    group.variants += variants.length;
    variants.forEach((v) => {
      const qty = posVariantStockQty(v);
      group.units += qty;
      const hw = normalizeHardwareCondition(v.hardwareCondition) || "NUEVO";
      if (hw === "VIEJO") group.unitsViejo += qty;
      else group.unitsNuevo += qty;
    });
    group.lowCount += variants.filter(isVariantLow).length;
    group.productKeys.push(product.key);
  });

  return Array.from(byKey.values()).sort((a, b) => {
    const aPack = a.key === PACKAGING_KEY ? 1 : 0;
    const bPack = b.key === PACKAGING_KEY ? 1 : 0;
    if (aPack !== bPack) return aPack - bPack;
    const byOrder = categorySortIndex(a.label) - categorySortIndex(b.label);
    if (byOrder !== 0) return byOrder;
    return a.label.localeCompare(b.label, "es", { sensitivity: "base" });
  });
}

export function filterProductsBySummaryGroup(products, group) {
  if (!group?.productKeys?.length) return [];
  const keys = new Set(group.productKeys);
  return (products || []).filter((p) => keys.has(p.key));
}

export function productMatchesSummaryGroupKey(product, groupKey) {
  if (!product || !groupKey) return false;
  return resolveGroupKey(product) === groupKey;
}
