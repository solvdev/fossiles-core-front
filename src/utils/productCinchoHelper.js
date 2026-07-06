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
