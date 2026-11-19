import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";
import {
  buildSummarySheetFrom,
  buildTableSheet,
  cell,
  centerStyle,
  numStyle,
  textStyle,
  tintedNumStyle,
  totalNum,
  totalStyle,
  wrapStyle,
} from "./reportExcelKit";
import { isEntreCuerosLocation, kioskDimensionDisplayLabel } from "./kioskStockDimensionHelper";
import { PRODUCT_AUDIENCE_OPTIONS, getProductAudienceLabel } from "./productAudienceHelper";

/**
 * Consulta de stock en kioscos: pasa las existencias de todos los kioscos a registros planos
 * (una fila por kiosco, producto, color, herraje y talla) y las suma según lo que se pida ver.
 */

const num = (v) => Number(v || 0);

export const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const natural = (a, b) =>
  String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });

export const NO_SIZE = "Sin talla";
export const NO_COLOR = "Sin color";
export const NO_CATEGORY = "Sin categoría";
export const NO_DATA = "Sin dato";

/** Por qué se puede ver (y cruzar) el stock. */
export const STOCK_DIMENSIONS = [
  { key: "kiosk", label: "Kiosko" },
  { key: "kioskCategory", label: "Categoría de kiosco" },
  { key: "category", label: "Categoría de producto" },
  { key: "audience", label: "Dama / Caballero" },
  { key: "product", label: "Producto" },
  { key: "color", label: "Color" },
  { key: "hardware", label: "Herraje / variante" },
  { key: "size", label: "Talla" },
];

/** Cómo se agrupan los kioscos dentro del filtro. */
export const KIOSK_GROUP_OPTIONS = [
  { key: "salesCategory", label: "Categoría A/B/C" },
  { key: "departamento", label: "Departamento" },
  { key: "zona", label: "Zona" },
];

const GETTERS = {
  kiosk: (r) => r.kiosk,
  kioskCategory: (r) => r.kioskCategory,
  category: (r) => r.category,
  audience: (r) => r.audience,
  product: (r) => r.product,
  color: (r) => r.color,
  hardware: (r) => r.hardware,
  size: (r) => r.size,
};

export const dimensionLabel = (key) => STOCK_DIMENSIONS.find((d) => d.key === key)?.label || key;

/** Categoría de ventas del kiosco (A, B o C), configurada en Costos por kiosco > Sitios. */
export const kioskCategoryLabel = (v) => {
  const t = String(v || "").trim().toUpperCase();
  return t ? `Categoría ${t}` : "Sin categoría";
};

const cleanGroup = (v) => {
  const t = String(v || "").trim();
  return t || NO_DATA;
};

/**
 * Registros planos. `apiRows` es lo que devuelve /kiosco-inventory/reporte/existencias.
 * Si una línea trae desglose por talla se abre una fila por talla; lo que no cuadre queda como «Sin talla».
 */
export function buildStockRecords({ apiRows, kiosks, products, categories }) {
  const kioskById = new Map((kiosks || []).map((k) => [Number(k.id), k]));
  const productById = new Map((products || []).map((p) => [Number(p.id), p]));
  const categoryById = new Map((categories || []).map((c) => [Number(c.id), c.name || c.code || String(c.id)]));
  const records = [];

  (apiRows || []).forEach((r) => {
    const kiosk = kioskById.get(Number(r.locationId));
    if (!kiosk) return;
    const product = productById.get(Number(r.productId));
    const categoryId = product?.categoryId != null ? Number(product.categoryId) : null;
    const category = categoryId != null ? categoryById.get(categoryId) || `Cat. ${categoryId}` : NO_CATEGORY;
    // En Entrecueros la columna es «variante» (Dama/Niño), no herraje.
    const entreCueros = isEntreCuerosLocation(kiosk.id);
    const hardwareRaw = kioskDimensionDisplayLabel(r.hardwareCondition, { entreCueros });
    const hardware = !hardwareRaw || hardwareRaw === "—" ? "—" : hardwareRaw;
    const base = {
      locationId: Number(kiosk.id),
      kiosk: kiosk.name || kiosk.code || String(kiosk.id),
      kioskCode: kiosk.code || "",
      departamento: cleanGroup(kiosk.departamento),
      zona: cleanGroup(kiosk.zona),
      kioskCategory: kioskCategoryLabel(kiosk.salesCategory),
      category,
      audience: getProductAudienceLabel(product?.audienceCategory),
      productId: Number(r.productId),
      productCode: r.productCode || "",
      productName: r.productName || "",
      product: `${r.productCode || "?"} · ${r.productName || ""}`.trim(),
      color: r.colorName || NO_COLOR,
      hardware,
    };

    const total = Math.max(0, num(r.currentStock));
    const sizes = Object.entries(r.sizes || {})
      .map(([size, qty]) => [String(size), Math.max(0, num(qty))])
      .filter(([, qty]) => qty > 0);
    const sizesSum = sizes.reduce((a, [, qty]) => a + qty, 0);

    sizes.forEach(([size, qty]) => records.push({ ...base, size, qty }));
    const rest = total - sizesSum;
    if (rest > 0.0001) records.push({ ...base, size: NO_SIZE, qty: rest });
  });
  return records;
}

/** Opciones del filtro de kioscos: una por kiosco, con su grupo (departamento, zona o categoría). */
export function buildKioskFilterItems(kiosks, groupKey) {
  return (kiosks || [])
    .map((k) => ({
      key: String(k.id),
      label: k.name || k.code || String(k.id),
      group:
        groupKey === "salesCategory"
          ? kioskCategoryLabel(k.salesCategory)
          : cleanGroup(k[groupKey === "zona" ? "zona" : "departamento"]),
    }))
    .sort((a, b) => natural(a.label, b.label));
}

export function buildCategoryFilterItems(records, categories) {
  const names = new Set((categories || []).map((c) => c.name || c.code).filter(Boolean));
  records.forEach((r) => names.add(r.category));
  return [...names].sort(natural).map((name) => ({ key: name, label: name }));
}

/** Público del producto: Dama, Caballero o Unisex (campo audienceCategory del catálogo). */
export const AUDIENCE_ITEMS = PRODUCT_AUDIENCE_OPTIONS.map((o) => ({ key: o.label, label: o.label }));

export function filterRecords(
  records,
  { kioskIds = [], categories = [], audiences = [], productCode = "", color = "" } = {}
) {
  const kioskSet = kioskIds.length ? new Set(kioskIds.map(String)) : null;
  const catSet = categories.length ? new Set(categories) : null;
  const audSet = audiences.length ? new Set(audiences) : null;
  return records.filter(
    (r) =>
      (!kioskSet || kioskSet.has(String(r.locationId))) &&
      (!catSet || catSet.has(r.category)) &&
      (!audSet || audSet.has(r.audience)) &&
      (!productCode || r.productCode === productCode) &&
      (!color || r.color === color)
  );
}

export const sumBy = (records, getKey) => {
  const out = {};
  records.forEach((r) => {
    const k = getKey(r);
    out[k] = (out[k] || 0) + r.qty;
  });
  return out;
};

/**
 * Suma por fila (groupKey) y, si se pide, por columna (crossKey).
 * order: "desc" (mayor stock primero) o "asc" (A–Z, tallas en orden numérico).
 */
export function buildPivot(records, groupKey, crossKey, order = "desc") {
  const gk = GETTERS[groupKey];
  const ck = crossKey && crossKey !== "none" ? GETTERS[crossKey] : null;
  const matrix = {};
  const rowTotals = {};
  const colTotals = {};
  const rowKeys = [];
  const colKeys = [];
  let grand = 0;

  records.forEach((r) => {
    const a = gk(r);
    const b = ck ? ck(r) : "";
    if (!(a in rowTotals)) rowKeys.push(a);
    if (ck && !(b in colTotals)) colKeys.push(b);
    matrix[a] = matrix[a] || {};
    matrix[a][b] = (matrix[a][b] || 0) + r.qty;
    rowTotals[a] = (rowTotals[a] || 0) + r.qty;
    colTotals[b] = (colTotals[b] || 0) + r.qty;
    grand += r.qty;
  });

  colKeys.sort(natural);
  if (order === "desc" && groupKey !== "size") rowKeys.sort((a, b) => rowTotals[b] - rowTotals[a] || natural(a, b));
  else rowKeys.sort(natural);

  let max = 0;
  rowKeys.forEach((a) => colKeys.forEach((b) => { if ((matrix[a][b] || 0) > max) max = matrix[a][b]; }));

  return { rowKeys, colKeys, matrix, rowTotals, colTotals, grand, max, crossed: Boolean(ck) };
}

export function summarizeRecords(records) {
  const kiosks = new Set();
  const products = new Set();
  const variants = new Set();
  let units = 0;
  records.forEach((r) => {
    kiosks.add(r.locationId);
    products.add(r.productCode);
    variants.add(`${r.productCode}|${r.color}|${r.hardware}`);
    units += r.qty;
  });
  return { units, kiosks: kiosks.size, products: products.size, variants: variants.size };
}

export function stockQueryFiltersLabel({
  kioskLabels = [],
  categories = [],
  audiences = [],
  productLabel = "",
  color = "",
  withKiosks = true,
}) {
  const parts = [];
  if (withKiosks) parts.push(kioskLabels.length ? `Kioscos: ${kioskLabels.join(", ")}` : "Kioscos: todos");
  parts.push(categories.length ? `Categorías: ${categories.join(", ")}` : "Categorías: todas");
  if (audiences.length) parts.push(`Público: ${audiences.join(", ")}`);
  if (productLabel) parts.push(`Producto: ${productLabel}`);
  if (color) parts.push(`Color: ${color}`);
  return parts.join("  ·  ");
}

const EXCEL_PART_ORDER = ["summary", "byCode", "byCodeColor", "perKiosk", "detail"];

const fmtUnits = (n) => Number(n).toLocaleString("es-GT", { maximumFractionDigits: 0 });

const sizesText = (sizes) =>
  Object.entries(sizes || {})
    .sort(([a], [b]) => natural(a, b))
    .map(([size, qty]) => `${size}: ${fmtUnits(qty)}`)
    .join("   ");

/** Suma de unidades por clave; guarda en cuántos kioscos hay y el desglose por talla. */
const sumGroups = (records, keyOf, baseOf) => {
  const map = new Map();
  records.forEach((r) => {
    const key = keyOf(r);
    let g = map.get(key);
    if (!g) {
      g = { ...baseOf(r), qty: 0, kiosks: new Set(), sizes: {} };
      map.set(key, g);
    }
    g.qty += r.qty;
    g.kiosks.add(r.locationId);
    if (r.size !== NO_SIZE) g.sizes[r.size] = (g.sizes[r.size] || 0) + r.qty;
  });
  return [...map.values()];
};

/** Lista general: una fila por código de producto, sumando todos los kioscos. */
export const aggregateByCode = (records) =>
  sumGroups(
    records,
    (r) => r.productCode,
    (r) => ({ code: r.productCode, name: r.productName, category: r.category, audience: r.audience })
  ).sort((a, b) => natural(a.code, b.code));

/** Una fila por código y color, sumando todos los kioscos. */
export const aggregateByCodeColor = (records) =>
  sumGroups(
    records,
    (r) => `${r.productCode}|${r.color}`,
    (r) => ({ code: r.productCode, name: r.productName, color: r.color })
  ).sort((a, b) => natural(a.code, b.code) || natural(a.color, b.color));

/** Líneas de un kiosco: código, color y herraje, con el desglose de tallas. */
const aggregateKioskLines = (records) =>
  sumGroups(
    records,
    (r) => `${r.productCode}|${r.color}|${r.hardware}`,
    (r) => ({ code: r.productCode, name: r.productName, color: r.color, hardware: r.hardware })
  ).sort((a, b) => natural(a.code, b.code) || natural(a.color, b.color) || natural(a.hardware, b.hardware));

/** Nombre de hoja válido en Excel (máx. 31, sin \ / ? * [ ] :) y sin repetirse. */
const uniqueSheetName = (name, used) => {
  const clean = String(name || "Kiosco").replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim() || "Kiosco";
  let candidate = clean.slice(0, 31);
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n})`;
    candidate = `${clean.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
};

export function buildStockQueryWorkbook({ records, pivot, groupKey, crossKey, filtersLabel, productFiltersLabel = "", parts = null }) {
  const subtitle = [`Stock en kioscos al día de hoy`, filtersLabel, `Generado ${formatNowGt()}`]
    .filter(Boolean)
    .join("  ·  ");
  const fmt = "#,##0";
  const crossLabel = crossKey && crossKey !== "none" ? dimensionLabel(crossKey) : "";

  const headers = [dimensionLabel(groupKey), ...pivot.colKeys, "Total", "% del total"];
  const rows = pivot.rowKeys.map((a) => [
    cell(a, textStyle),
    ...pivot.colKeys.map((b) => {
      const v = pivot.matrix[a][b] || 0;
      return v ? cell(v, numStyle(fmt)) : cell("", centerStyle);
    }),
    cell(pivot.rowTotals[a], tintedNumStyle("0B6E71", "E3F0F0", fmt)),
    cell(pivot.grand ? Math.round((pivot.rowTotals[a] / pivot.grand) * 1000) / 10 : 0, numStyle('0.0"%"')),
  ]);
  const totalRow = [
    cell("TOTAL GENERAL", totalStyle),
    ...pivot.colKeys.map((b) => cell(pivot.colTotals[b] || 0, totalNum(fmt))),
    cell(pivot.grand, totalNum(fmt)),
    cell(100, totalNum('0"%"')),
  ];

  const summary = buildSummarySheetFrom({
    title: "Stock en kioscos",
    heading: crossLabel
      ? `Unidades por ${dimensionLabel(groupKey).toLowerCase()} y ${crossLabel.toLowerCase()}`
      : `Unidades por ${dimensionLabel(groupKey).toLowerCase()}`,
    subtitle,
    tableTitle: "Resumen",
    headers,
    rows,
    totalRow,
    notes: [
      "Cada número es la cantidad de piezas en existencia hoy en los kioscos incluidos.",
      "Un guion o celda vacía significa que no hay existencia de esa combinación.",
      "Hoja «Detalle»: una fila por kiosco, producto, color, herraje y talla, con filtros en el encabezado.",
    ],
    widths: [38, ...pivot.colKeys.map(() => 14), 14, 14],
  });

  const detailRows = [...records].sort(
    (x, y) => natural(x.kiosk, y.kiosk) || natural(x.product, y.product) || natural(x.color, y.color) || natural(x.size, y.size)
  );
  const detail = buildTableSheet({
    title: "Stock en kioscos: detalle",
    subtitle,
    freezeCols: 1,
    rows: detailRows,
    columns: [
      { label: "Kiosco", width: 30, get: (r) => r.kiosk, style: () => textStyle },
      { label: "Departamento", width: 18, get: (r) => r.departamento, style: () => textStyle },
      { label: "Zona", width: 16, get: (r) => r.zona, style: () => textStyle },
      { label: "Categoría de kiosco", width: 20, get: (r) => r.kioskCategory, style: () => textStyle },
      { label: "Categoría de producto", width: 20, get: (r) => r.category, style: () => textStyle },
      { label: "Dama / Caballero", width: 16, get: (r) => r.audience, style: () => centerStyle },
      { label: "Código", width: 14, get: (r) => r.productCode, style: () => textStyle },
      { label: "Producto", width: 36, get: (r) => r.productName, style: () => textStyle },
      { label: "Color", width: 18, get: (r) => r.color, style: () => textStyle },
      { label: "Herraje / variante", width: 18, get: (r) => r.hardware, style: () => centerStyle },
      { label: "Talla", width: 12, get: (r) => r.size, style: () => centerStyle },
      { label: "Unidades", width: 12, get: (r) => r.qty, style: () => numStyle(fmt), total: "sum", totalFmt: fmt },
    ],
  });

  const portrait = (ws) => {
    ws["!pageSetup"] = { orientation: "portrait", fitToWidth: 1, fitToHeight: 0 };
    return ws;
  };
  const pctOf = (qty, total) => (total ? Math.round((qty / total) * 1000) / 10 : 0);
  const grandUnits = records.reduce((a, r) => a + r.qty, 0);

  // Lista general: cuánto hay de cada código sumando todos los kioscos.
  const byCodeRows = aggregateByCode(records);
  const byCodeSheet = portrait(
    buildTableSheet({
      title: "Stock total por código de producto",
      subtitle,
      freezeCols: 1,
      rows: byCodeRows,
      columns: [
        { label: "Código", width: 16, get: (r) => r.code, style: () => textStyle },
        { label: "Producto", width: 40, get: (r) => r.name, style: () => textStyle },
        { label: "Categoría de producto", width: 22, get: (r) => r.category, style: () => textStyle },
        { label: "Dama / Caballero", width: 16, get: (r) => r.audience, style: () => centerStyle },
        { label: "Unidades", width: 12, get: (r) => r.qty, style: () => numStyle(fmt), total: "sum", totalFmt: fmt },
        { label: "% del total", width: 12, get: (r) => pctOf(r.qty, grandUnits), style: () => numStyle('0.0"%"') },
        { label: "Kioscos con stock", width: 16, get: (r) => r.kiosks.size, style: () => numStyle(fmt) },
      ],
    })
  );

  // Por código y color, sumando todos los kioscos.
  const byCodeColorRows = aggregateByCodeColor(records);
  const byCodeColorSheet = portrait(
    buildTableSheet({
      title: "Stock total por código y color (todos los kioscos)",
      subtitle,
      freezeCols: 1,
      rows: byCodeColorRows,
      columns: [
        { label: "Código", width: 16, get: (r) => r.code, style: () => textStyle },
        { label: "Producto", width: 40, get: (r) => r.name, style: () => textStyle },
        { label: "Color", width: 20, get: (r) => r.color, style: () => textStyle },
        { label: "Unidades", width: 12, get: (r) => r.qty, style: () => numStyle(fmt), total: "sum", totalFmt: fmt },
        { label: "Kioscos con stock", width: 16, get: (r) => r.kiosks.size, style: () => numStyle(fmt) },
      ],
    })
  );

  const sheets = {
    summary: [[summary, "Resumen"]],
    byCode: [[byCodeSheet, "Por código"]],
    byCodeColor: [[byCodeColorSheet, "Código y color"]],
    detail: [[detail, "Detalle"]],
  };

  // Una hoja por kiosco, lista para imprimir (cada hoja sale en sus propias páginas).
  const used = new Set(["Resumen", "Por código", "Código y color", "Detalle"].map((n) => n.toLowerCase()));
  const kioskSheets = [];
  const byKiosk = new Map();
  records.forEach((r) => {
    if (!byKiosk.has(r.locationId)) byKiosk.set(r.locationId, []);
    byKiosk.get(r.locationId).push(r);
  });
  [...byKiosk.values()]
    .sort((a, b) => natural(a[0].kiosk, b[0].kiosk))
    .forEach((list) => {
      const first = list[0];
      const rows = aggregateKioskLines(list);
      const total = list.reduce((a, r) => a + r.qty, 0);
      const ws = portrait(
        buildTableSheet({
          title: `Stock en kiosco: ${first.kiosk}`,
          subtitle: [first.kioskCategory, productFiltersLabel, `Total ${total.toLocaleString("es-GT")} unidades`, `Generado ${formatNowGt()}`]
            .filter(Boolean)
            .join("  ·  "),
          freezeCols: 1,
          rows,
          columns: [
            { label: "Código", width: 16, get: (r) => r.code, style: () => textStyle },
            { label: "Producto", width: 38, get: (r) => r.name, style: () => textStyle },
            { label: "Color", width: 18, get: (r) => r.color, style: () => textStyle },
            { label: "Herraje / variante", width: 16, get: (r) => r.hardware, style: () => centerStyle },
            { label: "Tallas", width: 30, get: (r) => sizesText(r.sizes), style: () => wrapStyle },
            { label: "Unidades", width: 12, get: (r) => r.qty, style: () => numStyle(fmt), total: "sum", totalFmt: fmt },
          ],
        })
      );
      kioskSheets.push([ws, uniqueSheetName(first.kiosk, used)]);
    });
  sheets.perKiosk = kioskSheets;

  const wb = XLSX.utils.book_new();
  const wanted = parts && parts.length ? parts : EXCEL_PART_ORDER;
  EXCEL_PART_ORDER.filter((p) => wanted.includes(p)).forEach((p) => {
    (sheets[p] || []).forEach(([ws, name]) => XLSX.utils.book_append_sheet(wb, ws, name));
  });
  return wb;
}

/** Qué hojas lleva cada descarga del Excel. */
export const EXCEL_DOWNLOADS = [
  { key: "all", label: "Excel completo", hint: "Resumen, lista por código, código y color, una hoja por kiosco y detalle", parts: null, suffix: "" },
  { key: "byCode", label: "Lista general por código", hint: "Cuánto hay de cada código sumando todos los kioscos", parts: ["byCode"], suffix: "_por_codigo" },
  { key: "byCodeColor", label: "Por código y color", hint: "Suma de todos los kioscos por código y color", parts: ["byCodeColor"], suffix: "_por_codigo_color" },
  { key: "perKiosk", label: "Una hoja por kiosco", hint: "Para imprimir cada kiosco por separado", parts: ["perKiosk"], suffix: "_por_kiosco" },
];

export function exportStockQueryExcel({ download = "all", ...args }) {
  const option = EXCEL_DOWNLOADS.find((d) => d.key === download) || EXCEL_DOWNLOADS[0];
  const wb = buildStockQueryWorkbook({ ...args, parts: option.parts });
  XLSX.writeFile(wb, `stock_kioscos${option.suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
