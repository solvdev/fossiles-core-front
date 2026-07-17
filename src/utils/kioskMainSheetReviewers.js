/** Supervisores autorizados para certificar la hoja principal (debe coincidir con el backend). */
export const MAIN_SHEET_REVIEWERS = [
  "GUSTAVO CASTRO",
  "ROBERTO LIQUE",
  "FATIMA ZACARIAS",
];

const parseYmd = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const toInputDate = (value) => {
  if (!value) return "";
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
};

const formatShort = (value) => {
  const date = parseYmd(value);
  if (!date) return "—";
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

export const formatMainSheetDateRange = (from, to) => {
  const fromLabel = formatShort(from);
  const toLabel = formatShort(to);
  if (fromLabel === "—" && toLabel === "—") return "—";
  if (fromLabel === toLabel) return fromLabel;
  return `${fromLabel} al ${toLabel}`;
};

export const formatMainSheetSalesRange = (periodFrom, periodTo) =>
  formatMainSheetDateRange(periodFrom, periodTo);

export const resolveMainSheetInventoryRange = (report) => ({
  from: report?.mainSheetInventoryFrom || report?.periodFrom,
  to: report?.mainSheetInventoryTo || report?.periodTo,
});

export const resolveMainSheetSalesCertRange = (report) => ({
  from: report?.mainSheetSalesFrom || report?.periodFrom,
  to: report?.mainSheetSalesTo || report?.periodTo,
});

export const formatMainSheetCertifiedAt = (value) => formatShort(value);

export const buildMainSheetCertificationHeader = (report) => {
  const inventory = resolveMainSheetInventoryRange(report);
  const sales = resolveMainSheetSalesCertRange(report);
  return {
    certifiedBy: report?.mainSheetCertifiedBy || "—",
    reviewedBy: report?.mainSheetReviewedBy || "—",
    inventoryRange: formatMainSheetDateRange(inventory.from, inventory.to),
    salesRange: formatMainSheetDateRange(sales.from, sales.to),
  };
};
