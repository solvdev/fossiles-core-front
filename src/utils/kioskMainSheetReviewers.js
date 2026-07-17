/** Supervisores autorizados para certificar la hoja principal (debe coincidir con el backend). */
export const MAIN_SHEET_REVIEWERS = [
  "GUSTAVO CASTRO",
  "ROBERTO LIQUE",
  "FATIMA ZACARIAS",
];

export const formatMainSheetSalesRange = (periodFrom, periodTo) => {
  const from = formatShort(periodFrom);
  const to = formatShort(periodTo);
  if (from === "—" && to === "—") return "—";
  if (from === to) return from;
  return `${from} al ${to}`;
};

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

const formatShort = (value) => {
  const date = parseYmd(value);
  if (!date) return "—";
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

export const formatMainSheetCertifiedAt = (value) => {
  if (!value) return "—";
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${Number(d)}/${Number(m)}/${y}`;
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "—";
  return `${parsed.getDate()}/${parsed.getMonth() + 1}/${parsed.getFullYear()}`;
};
