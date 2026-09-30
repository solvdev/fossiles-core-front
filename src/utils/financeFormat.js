/**
 * Formateo compartido para Finanzas por kiosco (es-GT).
 * Contrato: montos en quetzales, porcentajes como decimales (0.18 = 18 %).
 * Este archivo es importado por costos, importador y reportes: mantener estable.
 */

export const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export const MONTHS_ES_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

/** Etiqueta mostrada cuando no hay dato. */
export const EMPTY_VALUE = "—";

/** Colores del tema Paper Dashboard (para charts y chips). */
export const FINANCE_COLORS = {
  primary: "#51cbce",
  success: "#6bd098",
  warning: "#fbc658",
  danger: "#ef8156",
  muted: "#9a9a9a",
  base: "#c8ccd0",
  pageBg: "#f4f3ef",
};

export const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const toNum = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const groupInt = (intPart) => intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Número con separador de miles "," y decimales ".", igual que es-GT.
 * Determinista (no depende de ICU del entorno).
 */
export const fmtNumber = (value, decimals = 2) => {
  const n = toNum(value);
  if (n === null) return EMPTY_VALUE;
  const fixed = Math.abs(n).toFixed(decimals);
  const [i, d] = fixed.split(".");
  const sign = n < 0 && Number(fixed) !== 0 ? "-" : "";
  return `${sign}${groupInt(i)}${d ? `.${d}` : ""}`;
};

/** 'Q 1,234.50'. Negativos: '-Q 1,234.50'. null/undefined: '—'. */
export const fmtMoney = (value, { decimals = 2, prefix = "Q " } = {}) => {
  const n = toNum(value);
  if (n === null) return EMPTY_VALUE;
  const body = fmtNumber(Math.abs(n), decimals);
  const negative = n < 0 && Number(Math.abs(n).toFixed(decimals)) !== 0;
  return `${negative ? "-" : ""}${prefix}${body}`;
};

/** Monto para celdas de tablas y grillas: siempre con quetzales ('Q 1,234.50'). */
export const fmtAmount = (value, decimals = 2) => fmtMoney(value, { decimals });

/** Porcentaje desde decimal: 0.1834 -> '18.3%'. */
export const fmtPct = (decimal, digits = 1) => {
  const n = toNum(decimal);
  if (n === null) return EMPTY_VALUE;
  const scaled = n * 100;
  const fixed = Math.abs(scaled).toFixed(digits);
  const sign = scaled < 0 && Number(fixed) !== 0 ? "-" : "";
  return `${sign}${fixed}%`;
};

/** Con signo explícito: '+Q 500.00', '-Q 200.00', 'Q 0.00'. */
export const fmtDelta = (value, opts = {}) => {
  const n = toNum(value);
  if (n === null) return EMPTY_VALUE;
  const decimals = opts.decimals ?? 2;
  const rounded = Number(Math.abs(n).toFixed(decimals));
  if (rounded === 0) return fmtMoney(0, opts);
  return `${n > 0 ? "+" : "-"}${fmtMoney(Math.abs(n), opts)}`;
};

/** Delta porcentual con signo desde decimal: 0.125 -> '+12.5%'. */
export const fmtDeltaPct = (decimal, digits = 1) => {
  const n = toNum(decimal);
  if (n === null) return EMPTY_VALUE;
  const rounded = Number(Math.abs(n * 100).toFixed(digits));
  if (rounded === 0) return fmtPct(0, digits);
  return `${n > 0 ? "+" : "-"}${fmtPct(Math.abs(n), digits)}`;
};

/** Tono de crecimiento: 'up' | 'down' | 'flat' | 'na'. */
export const growthTone = (delta, epsilon = 0.0005) => {
  const n = toNum(delta);
  if (n === null) return "na";
  if (Math.abs(n) <= epsilon) return "flat";
  return n > 0 ? "up" : "down";
};

export const growthColor = (tone) => {
  switch (tone) {
    case "up":
      return FINANCE_COLORS.success;
    case "down":
      return FINANCE_COLORS.danger;
    case "flat":
      return FINANCE_COLORS.warning;
    default:
      return FINANCE_COLORS.muted;
  }
};

/** Color reactstrap (Badge/Alert) para un tono. */
export const growthBadgeColor = (tone) => {
  switch (tone) {
    case "up":
      return "success";
    case "down":
      return "danger";
    case "flat":
      return "warning";
    default:
      return "secondary";
  }
};

/** Flecha textual: nunca depender solo del color. */
export const growthArrow = (tone) => {
  switch (tone) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "flat":
      return "■";
    default:
      return "–";
  }
};

export const growthLabel = (tone) => {
  switch (tone) {
    case "up":
      return "Aumento";
    case "down":
      return "Disminución";
    case "flat":
      return "Sin cambio";
    default:
      return "Sin dato";
  }
};

/** 'yyyy-MM-dd' -> 'dd/MM/yyyy'. */
export const fmtDateEs = (iso) => {
  if (!iso || typeof iso !== "string") return EMPTY_VALUE;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

/** Días del mes (mes 1..12). */
export const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

/** 'yyyy-MM-dd' con ceros. */
export const isoDate = (year, month, day) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
