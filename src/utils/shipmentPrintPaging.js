/**
 * Cuántas líneas de producto lleva cada hoja al imprimir envíos (Preparar envíos).
 *
 * Modos:
 *  - "auto": llena la hoja carta, estimando la altura de cada fila (los nombres largos ocupan 2+ renglones).
 *  - "all": todas las líneas en un solo documento; si no caben, el navegador sigue en la hoja siguiente.
 *  - número (string o number): ese máximo de líneas por hoja.
 */

export const SHIPMENT_LINES_PER_PAGE_STORAGE_KEY = "prepareShipments.linesPerPage";
export const SHIPMENT_LINES_PER_PAGE_DEFAULT = "auto";

export const SHIPMENT_LINES_PER_PAGE_OPTIONS = [
  { value: "auto", label: "Llenar la hoja" },
  { value: "all", label: "Todas en un documento" },
  { value: "10", label: "10 por hoja" },
  { value: "15", label: "15 por hoja" },
  { value: "20", label: "20 por hoja" },
  { value: "25", label: "25 por hoja" },
  { value: "30", label: "30 por hoja" },
  { value: "custom", label: "Otro número…" },
];

/* Medidas del formato de Preparar envíos (carta, Times 11.5px, padding 3px, line-height 1.1). */
const ROW_BASE_MM = 5.2; // fila de un renglón
const ROW_EXTRA_LINE_MM = 3.4; // cada renglón adicional
/** Alto útil para filas de producto: carta (279.4) − márgenes (8) − encabezado, títulos, total y pie (~58). */
const GRID_BUDGET_MM = 212;
/* Caracteres por renglón (conservador, negrita) según el ancho de cada columna. */
const PRODUCT_CHARS_PER_LINE = 24;
const COLOR_CHARS_PER_LINE = 12;
const CODE_CHARS_PER_LINE = 12;

const linesFor = (text, charsPerLine) => {
  const len = String(text || "").trim().length;
  return Math.max(1, Math.ceil(len / charsPerLine));
};

/** Alto estimado (mm) de una línea de producto en la hoja. */
export const estimateShipmentRowHeightMm = (item) => {
  const size = String(item?.size || "").trim();
  const name = `${item?.productName || ""}${size ? ` TALLA ${size}` : ""}`;
  const lines = Math.max(
    linesFor(name, PRODUCT_CHARS_PER_LINE),
    linesFor(item?.colorName, COLOR_CHARS_PER_LINE),
    linesFor(item?.productCode, CODE_CHARS_PER_LINE)
  );
  return ROW_BASE_MM + ROW_EXTRA_LINE_MM * (lines - 1);
};

/** ¿Caben estas filas (productos + empaque) en una sola hoja? */
export const shipmentRowsFitOnePage = (rows) => {
  const total = (Array.isArray(rows) ? rows : []).reduce(
    (sum, row) => sum + estimateShipmentRowHeightMm(row),
    0
  );
  return total <= GRID_BUDGET_MM;
};

/** Normaliza lo elegido en pantalla: "auto" | "all" | entero ≥ 1. */
export const resolveLinesPerPageSetting = (mode, customValue) => {
  if (mode === "auto" || mode === "all") return mode;
  const raw = mode === "custom" ? customValue : mode;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : "auto";
};

/** Parte las líneas en hojas según el modo. Siempre devuelve al menos una hoja (vacía si no hay líneas). */
export const chunkShipmentLinesForPrint = (items, setting) => {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) return [[]];
  if (setting === "all") return [source.slice()];
  if (typeof setting === "number") {
    const chunks = [];
    for (let idx = 0; idx < source.length; idx += setting) {
      chunks.push(source.slice(idx, idx + setting));
    }
    return chunks;
  }
  const chunks = [];
  let current = [];
  let used = 0;
  source.forEach((item) => {
    const h = estimateShipmentRowHeightMm(item);
    if (current.length > 0 && used + h > GRID_BUDGET_MM) {
      chunks.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += h;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
};
