/**
 * Helpers puros para captura numérica tipo Excel (es-GT) en Finanzas por kiosco.
 * Sin dependencias de React: se prueban con jest.
 */

const INVALID = { valid: false, value: null };

/** Grupos de miles bien formados: 1-3 dígitos y luego grupos de 3 (ej. 1,234,567). */
const groupsOk = (intPart, sep) => {
  if (!intPart.includes(sep)) return true;
  const parts = intPart.split(sep);
  return /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((p) => /^\d{3}$/.test(p));
};

/**
 * Convierte texto libre a número.
 * Acepta '1,234.50', '1234.5', 'Q 1,234.50', 'Q1234', '1.234,50', '(500)', '-', '12%'.
 * Devuelve { valid, value }: vacío => { valid: true, value: null } (borra la celda);
 * '-' solo (formato contable de Excel) => 0.
 */
export const parseLocaleNumber = (raw) => {
  if (raw === null || raw === undefined) return { valid: true, value: null };
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? { valid: true, value: raw } : INVALID;
  }

  let s = String(raw).replace(/[\s ]/g, "");
  s = s.replace(/^(gtq|q)\.?/i, "");
  if (/\d/.test(s.replace(/(gtq|q)$/i, ""))) s = s.replace(/(gtq|q)$/i, "");
  s = s.replace(/%$/, "");
  if (s === "") return { valid: true, value: null };
  if (s === "-" || s === "--") return { valid: true, value: 0 };

  let negative = false;
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    negative = true;
    s = paren[1];
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/^(gtq|q)\.?/i, "");
  if (s === "" || /[^0-9.,]/.test(s)) return INVALID;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  const commas = (s.match(/,/g) || []).length;
  const dots = (s.match(/\./g) || []).length;
  let normalized;

  if (commas > 0 && dots > 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    // Un separador de miles no puede aparecer después del decimal
    const decimalCount = decimalSep === "," ? commas : dots;
    if (decimalCount > 1) return INVALID;
    const intPart = s.slice(0, s.lastIndexOf(decimalSep));
    if (!groupsOk(intPart, thousandsSep)) return INVALID;
    normalized = s.split(thousandsSep).join("").replace(decimalSep, ".");
  } else if (commas > 0) {
    const after = s.slice(lastComma + 1);
    const before = s.slice(0, lastComma);
    const looksThousands =
      commas > 1 || (after.length === 3 && before.length >= 1 && before.length <= 3 && before !== "0");
    if (looksThousands && !groupsOk(s, ",")) return INVALID;
    normalized = looksThousands ? s.split(",").join("") : s.replace(",", ".");
  } else if (dots > 1) {
    if (!groupsOk(s, ".")) return INVALID;
    normalized = s.split(".").join("");
  } else {
    normalized = s;
  }

  if (!/^(\d+\.?\d*|\.\d+)$/.test(normalized)) return INVALID;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return INVALID;
  return { valid: true, value: negative ? -n : n };
};

const round = (n, decimals) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};

/** Dinero: redondea a 2 decimales. Los negativos son inválidos (costos/metas). */
export const parseMoneyInput = (raw) => {
  const res = parseLocaleNumber(raw);
  if (!res.valid) return res;
  if (res.value === null) return res;
  if (res.value < 0) return INVALID;
  return { valid: true, value: round(res.value, 2) };
};

/** Porcentaje escrito como % (18 o '18%') -> decimal 0.18. 0..100. */
export const parsePercentInput = (raw) => {
  const res = parseLocaleNumber(raw);
  if (!res.valid) return res;
  if (res.value === null) return res;
  if (res.value < 0 || res.value > 100) return INVALID;
  return { valid: true, value: round(res.value / 100, 6) };
};

/**
 * Texto pegado desde Excel (TSV) -> matriz de strings.
 * Ignora la línea vacía final; una línea vacía intermedia queda como fila de una celda vacía.
 */
export const parsePasteBlock = (text) => {
  if (text === null || text === undefined) return [];
  const normalized = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines.map((line) => line.split("\t"));
};

/**
 * Proyecta una matriz pegada sobre la grilla desde (startR, startC).
 * Devuelve { cells: [{ r, c, text }], clipped } donde `clipped` cuenta celdas fuera de rango.
 */
export const planPaste = (matrix, startR, startC, rowCount, colCount) => {
  const cells = [];
  let clipped = 0;
  matrix.forEach((line, i) => {
    line.forEach((text, j) => {
      const r = startR + i;
      const c = startC + j;
      if (r >= rowCount || c >= colCount) {
        clipped += 1;
      } else {
        cells.push({ r, c, text });
      }
    });
  });
  return { cells, clipped };
};

/** Texto crudo de edición para un monto (sin miles): 1234.5 -> '1234.5'. */
export const moneyToEditText = (value) => {
  if (value === null || value === undefined) return "";
  return String(round(value, 2));
};

/** Texto crudo de edición para % desde decimal: 0.025 -> '2.5'. */
export const pctToEditText = (decimal) => {
  if (decimal === null || decimal === undefined) return "";
  return String(round(decimal * 100, 4));
};

/** Filtra teclas no numéricas al teclear en una celda (permite dígitos , . - Q %). */
export const isNumericKey = (key) => /^[0-9.,]$/.test(key);

/**
 * Normalización de alias de kiosco (contrato): NFD, sin diacríticos, MAYÚSCULAS,
 * sólo A-Z / 0-9 / espacio (elimina U+FFFD), espacios colapsados y trim.
 */
export const normalizeAlias = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};
