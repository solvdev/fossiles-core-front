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

export const HARDWARE_CONDITION_OPTIONS = [
  { value: "", label: "— Herraje" },
  { value: "NUEVO", label: "Herraje nuevo" },
  { value: "VIEJO", label: "Herraje viejo" },
];

export const CINCHO_FILTER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "CASUAL", label: "Casual" },
  { value: "REVERSIBLE", label: "Reversible" },
  { value: "KIDS", label: "Niño" },
  { value: "NONE", label: "No cincho" },
];

export const normalizeCinchoType = (value) => {
  const v = String(value || "").trim().toUpperCase();
  if (v === "CASUAL" || v === "REVERSIBLE") return v;
  return "";
};

export const normalizeHardwareCondition = (value) => {
  const v = String(value || "").trim().toUpperCase();
  if (v === "NUEVO" || v === "NEW") return "NUEVO";
  if (v === "VIEJO" || v === "OLD" || v === "ANTIGUO") return "VIEJO";
  return "";
};

export const getCinchoTypeLabel = (value) => {
  const normalized = normalizeCinchoType(value);
  if (!normalized) return "—";
  return CINCHO_TYPE_OPTIONS.find((opt) => opt.value === normalized)?.label || normalized;
};

export const getHardwareConditionLabel = (value) => {
  const normalized = normalizeHardwareCondition(value);
  if (!normalized) return "—";
  return HARDWARE_CONDITION_OPTIONS.find((opt) => opt.value === normalized)?.label || normalized;
};

/** Etiqueta corta: Casual / Reversible / Niño (combinable). */
export const formatCinchoClassification = (row) => {
  const type = normalizeCinchoType(row?.cinchoType);
  const typeLabel = type ? getCinchoTypeLabel(type) : "";
  const kids = Boolean(row?.cinchoForKids);
  if (!typeLabel && !kids) return "—";
  if (!typeLabel && kids) return "Niño";
  return kids ? `${typeLabel} · Niño` : typeLabel;
};

export const isPackagingProductCode = (code) =>
  String(code || "").trim().toUpperCase().startsWith("SUM");

export const productMatchesCinchoFilter = (row, cinchoFilter) => {
  if (!cinchoFilter) return true;
  const cincho = normalizeCinchoType(row?.cinchoType);
  if (cinchoFilter === "NONE") return !cincho;
  if (cinchoFilter === "KIDS") return Boolean(row?.cinchoForKids);
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

const hasConteoKardexActivity = (row) => {
  const n = (v) => Number(v || 0);
  return n(row?.inventarioInicial) > 0
    || n(row?.inventarioFinal) > 0
    || n(row?.comprasAjustes) > 0
    || n(row?.anulacionCompras) > 0
    || n(row?.entradas) > 0
    || n(row?.ventas) > 0
    || n(row?.anulacionVenta) > 0
    || n(row?.salida) > 0
    || n(row?.total) > 0;
};

/** Empaques SUM- no llevan color; deben aparecer igual en conteo físico y listados de stock. */
export const shouldShowInKioskPhysicalCount = (row) =>
  hasAssignedProductColor(row)
  || row?.packaging === true
  || isPackagingProductCode(row?.productCode)
  || hasConteoKardexActivity(row);

export const filterVisibleKioskStockRows = (rows) =>
  (rows || []).filter(shouldShowInKioskPhysicalCount);

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

/** Clave única por fila de conteo (incluye talla cuando el cincho está desglosado). */
export const rowKey = (row) =>
  `${row?.productId}-${row?.colorId || ""}-${row?.sizeLabel || ""}`;

export const persistKey = (row) => `${row?.productId}-${row?.colorId || ""}`;

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
  const classified = formatCinchoClassification(row);
  if (classified !== "—") return classified;
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
