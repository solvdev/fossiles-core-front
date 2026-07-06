import { isCinchoInventoryProductByCodeAndName, isFossCinchosProductCode } from "utils/cinchoProductionHelper";
import { hasInventorySizeBreakdown } from "utils/inventoryVariantHelper";

export const CINCHO_COUNT_LOCATION = {
  VITRINE: "E",
  WAREHOUSE: "BO",
};

export const CINCHO_TYPE_OPTIONS = [
  { value: "", label: "— (no aplica)" },
  { value: "CASUAL", label: "Casual" },
  { value: "REVERSIBLE", label: "Reversible" },
];

export const CINCHO_FILTER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "CASUAL", label: "Casual" },
  { value: "REVERSIBLE", label: "Reversible" },
  { value: "NONE", label: "No cincho" },
];

export const normalizeCinchoType = (value) => {
  const v = String(value || "").trim().toUpperCase();
  if (v === "CASUAL" || v === "REVERSIBLE") return v;
  return "";
};

export const getCinchoTypeLabel = (value) => {
  const normalized = normalizeCinchoType(value);
  if (!normalized) return "—";
  return CINCHO_TYPE_OPTIONS.find((opt) => opt.value === normalized)?.label || normalized;
};

export const isPackagingProductCode = (code) =>
  String(code || "").trim().toUpperCase().startsWith("SUM-");

export const productMatchesCinchoFilter = (row, cinchoFilter) => {
  if (!cinchoFilter) return true;
  const cincho = normalizeCinchoType(row?.cinchoType);
  if (cinchoFilter === "NONE") return !cincho;
  return cincho === cinchoFilter;
};

export const productMatchesSearchFilter = (row, search) => {
  const q = String(search || "").trim().toLowerCase();
  if (!q) return true;
  const code = String(row?.productCode || "").toLowerCase();
  const name = String(row?.productName || "").toLowerCase();
  return code.includes(q) || name.includes(q);
};

export const hasAssignedProductColor = (row) =>
  row?.colorId != null && String(row?.colorName || "").trim() !== "";

/** Empaques SUM- no llevan color; deben aparecer igual en el conteo físico. */
export const shouldShowInKioskPhysicalCount = (row) =>
  hasAssignedProductColor(row) || row?.packaging === true || isPackagingProductCode(row?.productCode);

export const formatSystemSizesText = (sizes) => {
  if (!sizes || typeof sizes !== "object") return "";
  const parts = Object.entries(sizes)
    .filter(([, qty]) => Number(qty) > 0)
    .sort(([a], [b]) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b), undefined, { numeric: true });
    })
    .map(([size, qty]) => `${size}: ${qty}`);
  return parts.length ? parts.join(" · ") : "";
};

export const resolveSizesSummary = (row) =>
  row?.sizesSummary || formatSystemSizesText(row?.systemSizes) || "";

export const resolvePhysicalSizesSummary = (row) =>
  row?.physicalSizesSummary || formatSystemSizesText(row?.physicalSizes) || "";

export const isFossCinchoProductRow = (row) =>
  !!row && !row.packaging && !isPackagingProductCode(row.productCode)
  && isFossCinchosProductCode(row.productCode);

/** Cincho en conteo kiosko: FOSS/cincho por código o nombre, tipo Casual/Reversible, o inventario por talla. */
export const isCinchoProductRow = (row) => {
  if (!row || row.packaging || isPackagingProductCode(row.productCode)) return false;
  if (normalizeCinchoType(row.cinchoType)) return true;
  if (isCinchoInventoryProductByCodeAndName(row.productCode, row.productName)) return true;
  if (hasInventorySizeBreakdown(row.systemSizes)) return true;
  return false;
};

export const resolveCinchoProductLabel = (row) => {
  const type = normalizeCinchoType(row?.cinchoType);
  if (type) return getCinchoTypeLabel(type);
  if (isCinchoInventoryProductByCodeAndName(row?.productCode, row?.productName)) return "FOSS / Cincho";
  if (hasInventorySizeBreakdown(row?.systemSizes)) return "Por talla";
  return "—";
};

export const sortSizeKeys = (keys) =>
  [...keys].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  });

export const sumSizeCounts = (sizes) =>
  Object.values(sizes || {}).reduce((sum, qty) => sum + Number(qty || 0), 0);

export const collectSizeKeysForRows = (rows) => {
  const keys = new Set();
  (rows || []).forEach((row) => {
    Object.keys(row?.systemSizes || {}).forEach((size) => keys.add(size));
    Object.keys(row?.physicalSizes || {}).forEach((size) => keys.add(size));
    Object.values(row?.physicalSizesByLocation || {}).forEach((locSizes) => {
      Object.keys(locSizes || {}).forEach((size) => keys.add(size));
    });
  });
  return sortSizeKeys(keys);
};

export const emptyFossLocationSizeDraft = () => ({
  [CINCHO_COUNT_LOCATION.VITRINE]: {},
  [CINCHO_COUNT_LOCATION.WAREHOUSE]: {},
});

export const mergeFossLocationSizeTotals = (byLocation) => {
  const vitrine = byLocation?.[CINCHO_COUNT_LOCATION.VITRINE] || {};
  const warehouse = byLocation?.[CINCHO_COUNT_LOCATION.WAREHOUSE] || {};
  const keys = new Set([...Object.keys(vitrine), ...Object.keys(warehouse)]);
  const totals = {};
  keys.forEach((size) => {
    const total = Number(vitrine[size] || 0) + Number(warehouse[size] || 0);
    if (total > 0) totals[size] = total;
  });
  return totals;
};

export const buildFossLocationSizeDraft = (row, editedByLocation, editedTotals) => {
  if (editedByLocation) {
    return {
      [CINCHO_COUNT_LOCATION.VITRINE]: { ...(editedByLocation[CINCHO_COUNT_LOCATION.VITRINE] || {}) },
      [CINCHO_COUNT_LOCATION.WAREHOUSE]: { ...(editedByLocation[CINCHO_COUNT_LOCATION.WAREHOUSE] || {}) },
    };
  }
  if (row?.physicalSizesByLocation) {
    return {
      [CINCHO_COUNT_LOCATION.VITRINE]: { ...(row.physicalSizesByLocation[CINCHO_COUNT_LOCATION.VITRINE] || {}) },
      [CINCHO_COUNT_LOCATION.WAREHOUSE]: { ...(row.physicalSizesByLocation[CINCHO_COUNT_LOCATION.WAREHOUSE] || {}) },
    };
  }
  const physical = editedTotals || row?.physicalSizes || {};
  return {
    [CINCHO_COUNT_LOCATION.VITRINE]: { ...physical },
    [CINCHO_COUNT_LOCATION.WAREHOUSE]: {},
  };
};

export const formatFossLocationSizeSummary = (byLocation) => {
  if (!byLocation) return "";
  const vitrine = formatSystemSizesText(byLocation[CINCHO_COUNT_LOCATION.VITRINE]);
  const warehouse = formatSystemSizesText(byLocation[CINCHO_COUNT_LOCATION.WAREHOUSE]);
  const parts = [];
  if (vitrine) parts.push(`E: ${vitrine}`);
  if (warehouse) parts.push(`BO: ${warehouse}`);
  return parts.join(" · ");
};
