import { getProductAudienceLabel, normalizeAudienceCategory, productMatchesAudienceFilter } from "utils/productAudienceHelper";
import {
  isCinchoProductRow,
  isPackagingProductCode,
  normalizeCinchoAudience,
  normalizeCinchoType,
  normalizeHardwareCondition,
} from "utils/productCinchoHelper";
import { POS_CATEGORY_ORDER, posVariantStockQty } from "views/kiosks/pos/posUtils";

const PACKAGING_KEY = "PACKAGING";

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

const kidsCinchoAudience = (product, variant) => {
  const fromStock = normalizeCinchoAudience(variant?.hardwareCondition);
  if (fromStock) return fromStock;
  if (product?.cinchoForKids) return "NINO";
  return "";
};

const resolveGroupKey = (product, variant, { entreCueros } = {}) => {
  if (product.packaging || isPackagingProductCode(product.productCode)) {
    return PACKAGING_KEY;
  }
  if (isCinchoProductRow(asCinchoProbe(product))) {
    const categoryId = product.productCategoryId ?? "NONE";
    const kidsAudience = kidsCinchoAudience(product, variant);
    if (entreCueros && kidsAudience) {
      return `BELT:${categoryId}:KIDS:${kidsAudience}`;
    }
    if (!entreCueros && product.cinchoForKids) {
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
      if (audience === "DAMA") return `${baseName} — Dama`;
      if (audience === "NINO") return `${baseName} — Niño`;
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
 * En Entre Cueros, cinchos de niño se parten por variante Niño / Dama del stock.
 * @param {object[]} products — salida de buildProducts (productos con variants)
 */
export function buildKioskInventorySummaryGroups(products, options = {}) {
  const byKey = new Map();

  (products || []).forEach((product) => {
    if (!product) return;
    const variants = product.variants || [];
    const countedInGroup = new Set();
    variants.forEach((variant) => {
      const key = resolveGroupKey(product, variant, options);
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
      if (!countedInGroup.has(key)) {
        group.products += 1;
        group.productKeys.push(product.key);
        countedInGroup.add(key);
      }
      group.variants += 1;
      const qty = posVariantStockQty(variant);
      group.units += qty;
      const hw = normalizeHardwareCondition(variant.hardwareCondition);
      if (hw === "VIEJO") group.unitsViejo += qty;
      else if (hw === "NUEVO") group.unitsNuevo += qty;
      if (isVariantLow(variant)) group.lowCount += 1;
    });
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

export function filterProductsBySummaryGroup(products, group, options = {}) {
  if (!group?.key) return [];
  return (products || [])
    .map((product) => filterProductForSummaryGroup(product, group.key, options))
    .filter(Boolean);
}

export function productMatchesSummaryGroupKey(product, groupKey, options = {}) {
  if (!product || !groupKey) return false;
  const variants = product.variants || [];
  if (!variants.length) {
    return resolveGroupKey(product, null, options) === groupKey;
  }
  return variants.some((variant) => resolveGroupKey(product, variant, options) === groupKey);
}

export function filterProductForSummaryGroup(product, groupKey, options = {}) {
  if (!product || !groupKey) return null;
  const variants = (product.variants || []).filter(
    (variant) => resolveGroupKey(product, variant, options) === groupKey
  );
  if (!variants.length) return null;
  return {
    ...product,
    variants,
    totalQuantity: variants.reduce((sum, variant) => sum + posVariantStockQty(variant), 0),
  };
}

/** Línea Dama/Caballero/Unisex: cinchos de niño usan la variante de stock, no la línea del producto. */
export function variantMatchesInventoryAudienceFilter(product, variant, audienceFilter, { entreCueros } = {}) {
  if (!audienceFilter) return true;
  if (entreCueros && isCinchoProductRow(asCinchoProbe(product))) {
    const kidsAudience = kidsCinchoAudience(product, variant);
    if (kidsAudience) {
      if (audienceFilter === "DAMA") return kidsAudience === "DAMA";
      return false;
    }
  }
  return productMatchesAudienceFilter(product, audienceFilter);
}
