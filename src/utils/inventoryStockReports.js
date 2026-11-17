import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";
import { fmtDate, fmtInt, fmtMoney, fmtQty } from "./inventoryRotationReport";
import {
  MONEY,
  QTY,
  buildSummarySheetFrom,
  buildTableSheet,
  cell,
  centerStyle,
  numStyle,
  statusStyle,
  textStyle,
  tintedNumStyle,
  totalNum,
  totalStyle,
  wrapStyle,
} from "./reportExcelKit";

/**
 * Reportes de inventario en pantalla y en Excel: materiales (existencia contra mínimo y máximo)
 * y existencias por kiosco. Misma idea que la rotación: estados de una palabra y frases simples.
 */

const num = (v) => Number(v || 0);

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// ==================== Materiales ====================

export const MATERIAL_STATUS_ORDER = ["AGOTADO", "BAJO", "OK", "SOBRE"];

export const MATERIAL_STATUS = {
  AGOTADO: {
    key: "AGOTADO",
    label: "Agotado",
    color: "#991b1b",
    bg: "#fee2e2",
    xlsText: "991B1B",
    xlsFill: "FEE2E2",
    hint: "No hay existencia",
    meaning: "No hay nada en existencia: hay que comprar ya.",
  },
  BAJO: {
    key: "BAJO",
    label: "Bajo el mínimo",
    color: "#c2410c",
    bg: "#ffedd5",
    xlsText: "9A3412",
    xlsFill: "FFEDD5",
    hint: "Por debajo del mínimo",
    meaning: "Hay menos del mínimo definido: conviene reponer pronto.",
  },
  OK: {
    key: "OK",
    label: "En rango",
    color: "#047857",
    bg: "#d1fae5",
    xlsText: "065F46",
    xlsFill: "D1FAE5",
    hint: "Entre el mínimo y el máximo",
    meaning: "La existencia está entre el mínimo y el máximo.",
  },
  SOBRE: {
    key: "SOBRE",
    label: "Sobre el máximo",
    color: "#1d4ed8",
    bg: "#dbeafe",
    xlsText: "1E40AF",
    xlsFill: "DBEAFE",
    hint: "Por encima del máximo",
    meaning: "Hay más del máximo definido: dinero de más en bodega.",
  },
};

export const materialStatusMeta = (key) => MATERIAL_STATUS[key] || MATERIAL_STATUS.OK;

export function classifyMaterial({ stock, min, max, isCritical }) {
  if (stock <= 0) return "AGOTADO";
  if ((min > 0 && stock < min) || isCritical) return "BAJO";
  if (max > 0 && stock > max) return "SOBRE";
  return "OK";
}

/** Normaliza lo que manda el servidor y le pone estado. */
export function buildMaterialRows(report) {
  return (report?.materials || []).map((m) => {
    const stock = num(m.currentStock);
    const min = num(m.minStock);
    const max = num(m.maxStock);
    const row = {
      key: String(m.materialId ?? m.sku),
      sku: m.sku || "",
      name: m.name || "",
      stock,
      min,
      max,
      unitCost: num(m.unitCost),
      value: num(m.totalValue),
      isCritical: !!m.isCritical,
      active: String(m.status || "").toLowerCase() !== "inactivo",
    };
    row.status = classifyMaterial(row);
    return row;
  });
}

/** Cuánto del máximo está lleno (0–100) y dónde cae el mínimo en esa barra; null si no hay máximo. */
export function materialLevel(row) {
  if (row.max <= 0) return null;
  return {
    pct: Math.max(0, Math.min(100, (row.stock / row.max) * 100)),
    minPct: row.min > 0 ? Math.min(100, (row.min / row.max) * 100) : null,
  };
}

export function explainMaterial(row) {
  const stock = fmtQty(row.stock);
  switch (row.status) {
    case "AGOTADO":
      return row.min > 0 ? `No hay existencia. El mínimo es ${fmtQty(row.min)}.` : "No hay existencia.";
    case "BAJO":
      return row.stock < row.min
        ? `Hay ${stock} y el mínimo es ${fmtQty(row.min)}: faltan ${fmtQty(row.min - row.stock)} para llegar al mínimo.`
        : `Hay ${stock} y está marcado como crítico.`;
    case "SOBRE":
      return `Hay ${stock} y el máximo es ${fmtQty(row.max)}: sobran ${fmtQty(row.stock - row.max)}.`;
    default:
      return row.max > 0
        ? `Hay ${stock}, dentro del rango de ${fmtQty(row.min)} a ${fmtQty(row.max)}.`
        : `Hay ${stock}. No tiene máximo definido.`;
  }
}

export function summarizeMaterials(rows) {
  const out = {
    count: rows.length,
    value: 0,
    byStatus: Object.fromEntries(MATERIAL_STATUS_ORDER.map((k) => [k, { lines: 0, value: 0 }])),
  };
  rows.forEach((r) => {
    out.value += r.value;
    out.byStatus[r.status].lines += 1;
    out.byStatus[r.status].value += r.value;
  });
  return out;
}

export function filterMaterials(rows, { status = "ALL", search = "" } = {}) {
  const q = norm(search).trim();
  return rows.filter((r) => {
    if (status !== "ALL" && r.status !== status) return false;
    return !q || norm(`${r.sku} ${r.name}`).includes(q);
  });
}

const MATERIAL_SORTERS = {
  status: (r) => MATERIAL_STATUS_ORDER.indexOf(r.status),
  name: (r) => norm(r.name),
  stock: (r) => r.stock,
  level: (r) => (r.max > 0 ? r.stock / r.max : Number.POSITIVE_INFINITY),
  cost: (r) => r.unitCost,
  value: (r) => r.value,
};

/** Por defecto (estado) va lo urgente primero y, dentro de cada estado, lo de más valor. */
export function sortMaterials(rows, key = "status", dir = "asc") {
  const get = MATERIAL_SORTERS[key] || MATERIAL_SORTERS.status;
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x < y) return -1 * sign;
    if (x > y) return 1 * sign;
    return b.value - a.value;
  });
}

const materialStatusCell = (key) => {
  const m = materialStatusMeta(key);
  return statusStyle(m.xlsText, m.xlsFill);
};

export function buildMaterialStockWorkbook({ rows, filtersLabel = "" }) {
  const subtitle = [`Existencia de materiales al día de hoy`, filtersLabel, `Generado ${formatNowGt()}`]
    .filter(Boolean)
    .join("  ·  ");
  const sum = summarizeMaterials(rows);

  const summaryRows = MATERIAL_STATUS_ORDER.map((k) => {
    const m = materialStatusMeta(k);
    const b = sum.byStatus[k];
    return [
      cell(m.label, materialStatusCell(k)),
      cell(m.meaning, wrapStyle),
      cell(b.lines, numStyle("#,##0")),
      cell(b.value, numStyle(MONEY)),
    ];
  });
  const summary = buildSummarySheetFrom({
    title: "Inventario de materiales",
    heading: "Existencia contra mínimo y máximo",
    subtitle,
    tableTitle: "Resumen por estado",
    headers: ["Estado", "Qué significa", "Materiales", "Valor (Q)"],
    rows: summaryRows,
    totalRow: [
      cell("TOTAL", totalStyle),
      cell("", totalStyle),
      cell(sum.count, totalNum("#,##0")),
      cell(sum.value, totalNum(MONEY)),
    ],
    notes: [
      "Existencia: lo que hay hoy en bodega de materiales.",
      "Mínimo y máximo: los límites definidos para cada material en el catálogo.",
      "Valor: existencia × costo unitario.",
      "Hoja «Detalle»: una fila por material, con filtros en el encabezado y la columna «Qué significa».",
    ],
    widths: [20, 62, 14, 20],
  });

  const detail = buildTableSheet({
    title: "Inventario de materiales: detalle",
    subtitle,
    freezeCols: 2,
    rows,
    columns: [
      { label: "SKU", width: 14, get: (r) => r.sku, style: () => textStyle },
      { label: "Material", width: 40, get: (r) => r.name, style: () => textStyle },
      { label: "Existencia", width: 13, get: (r) => r.stock, style: () => numStyle(QTY), total: "sum" },
      { label: "Mínimo", width: 11, get: (r) => r.min, style: () => numStyle(QTY) },
      { label: "Máximo", width: 11, get: (r) => r.max, style: () => numStyle(QTY) },
      {
        label: "Estado",
        width: 18,
        get: (r) => materialStatusMeta(r.status).label,
        style: (r) => materialStatusCell(r.status),
      },
      { label: "Costo unitario (Q)", width: 16, get: (r) => r.unitCost, style: () => numStyle(MONEY) },
      {
        label: "Valor (Q)",
        width: 16,
        get: (r) => r.value,
        style: () => numStyle(MONEY),
        total: "sum",
        totalFmt: MONEY,
      },
      { label: "Qué significa", width: 64, get: (r) => explainMaterial(r), style: () => wrapStyle },
    ],
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summary, "Resumen");
  XLSX.utils.book_append_sheet(wb, detail, "Detalle");
  return wb;
}

export function exportMaterialStockExcel(args) {
  const wb = buildMaterialStockWorkbook(args);
  XLSX.writeFile(wb, `inventario_materiales_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

// ==================== Existencias por kiosco ====================

const formatSizes = (sizes) =>
  Object.entries(sizes || {})
    .sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true }))
    .map(([size, qty]) => `${size}: ${qty}`)
    .join(" · ");

/** Normaliza las filas del servidor, trayendo nombre y código del kiosco desde el catálogo. */
export function buildKioskStockRows(apiRows, locations = []) {
  const byId = new Map((locations || []).map((l) => [Number(l.id), l]));
  return (apiRows || []).map((r, i) => {
    const loc = byId.get(Number(r.locationId));
    return {
      key: `${r.locationId}|${r.productCode}|${r.colorName || ""}|${r.hardwareCondition || ""}|${i}`,
      locationId: Number(r.locationId),
      kioskName: loc?.name || r.locationName || "",
      kioskCode: loc?.code || r.locationCode || "",
      code: r.productCode || "",
      name: r.productName || "",
      color: r.colorName || "",
      sizes: formatSizes(r.sizes),
      hardware: r.hardwareCondition || "",
      stock: num(r.currentStock),
      minimum: num(r.minimumStock),
      low: !!r.lowStock,
      updatedAt: r.lastUpdatedAt || "",
    };
  });
}

/** Una fila por kiosco: cuántas líneas, cuántas unidades y cuántas con stock bajo. */
export function summarizeKiosks(rows) {
  const map = new Map();
  rows.forEach((r) => {
    let g = map.get(r.locationId);
    if (!g) {
      g = { locationId: r.locationId, name: r.kioskName, code: r.kioskCode, lines: 0, units: 0, lowLines: 0, last: "" };
      map.set(r.locationId, g);
    }
    g.lines += 1;
    g.units += Math.max(0, r.stock);
    if (r.low) g.lowLines += 1;
    if (r.updatedAt && r.updatedAt > g.last) g.last = r.updatedAt;
  });
  return [...map.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));
}

export function filterKioskStock(rows, { locationId = null, onlyLow = false, search = "" } = {}) {
  const q = norm(search).trim();
  return rows.filter((r) => {
    if (locationId != null && r.locationId !== locationId) return false;
    if (onlyLow && !r.low) return false;
    return !q || norm(`${r.code} ${r.name} ${r.color} ${r.hardware} ${r.kioskName}`).includes(q);
  });
}

const KIOSK_SORTERS = {
  kiosk: (r) => norm(r.kioskName),
  name: (r) => norm(r.name),
  stock: (r) => r.stock,
  minimum: (r) => r.minimum,
  status: (r) => (r.low ? 0 : 1),
  updated: (r) => r.updatedAt || "",
};

export function sortKioskStock(rows, key = "kiosk", dir = "asc") {
  const get = KIOSK_SORTERS[key] || KIOSK_SORTERS.kiosk;
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x < y) return -1 * sign;
    if (x > y) return 1 * sign;
    const byKiosk = norm(a.kioskName).localeCompare(norm(b.kioskName));
    return byKiosk !== 0 ? byKiosk : norm(a.name).localeCompare(norm(b.name));
  });
}

const KIOSK_LOW = { text: "991B1B", fill: "FEE2E2" };
const KIOSK_OK = { text: "065F46", fill: "D1FAE5" };

export function buildKioskStockWorkbook({ rows, filtersLabel = "" }) {
  const subtitle = [`Existencias por kiosco al día de hoy`, filtersLabel, `Generado ${formatNowGt()}`]
    .filter(Boolean)
    .join("  ·  ");
  const kiosks = summarizeKiosks(rows);
  const totalLines = kiosks.reduce((a, k) => a + k.lines, 0);
  const totalUnits = kiosks.reduce((a, k) => a + k.units, 0);
  const totalLow = kiosks.reduce((a, k) => a + k.lowLines, 0);

  const summary = buildSummarySheetFrom({
    title: "Existencias por kiosco",
    heading: "Producto en cada punto de venta",
    subtitle,
    tableTitle: "Resumen por kiosco",
    headers: ["Kiosco", "Código", "Líneas de producto", "Unidades en existencia", "Líneas con stock bajo", "Última actualización"],
    rows: kiosks.map((k) => [
      cell(k.name, textStyle),
      cell(k.code, centerStyle),
      cell(k.lines, numStyle("#,##0")),
      cell(k.units, numStyle("#,##0")),
      cell(k.lowLines, k.lowLines > 0 ? tintedNumStyle(KIOSK_LOW.text, KIOSK_LOW.fill, "#,##0") : numStyle("#,##0")),
      cell(fmtDate(k.last), centerStyle),
    ]),
    totalRow: [
      cell("TOTAL", totalStyle),
      cell("", totalStyle),
      cell(totalLines, totalNum("#,##0")),
      cell(totalUnits, totalNum("#,##0")),
      cell(totalLow, totalNum("#,##0")),
      cell("", totalStyle),
    ],
    notes: [
      "Línea de producto: un producto con su color y herraje en un kiosco.",
      "Stock bajo: la existencia de la línea está por debajo del mínimo definido para ese kiosco.",
      "Hoja «Detalle»: una fila por línea, con filtros en el encabezado para elegir kiosco o producto.",
    ],
    widths: [34, 14, 18, 22, 22, 20],
  });

  const detail = buildTableSheet({
    title: "Existencias por kiosco: detalle",
    subtitle,
    freezeCols: 2,
    rows,
    columns: [
      { label: "Kiosco", width: 32, get: (r) => r.kioskName, style: () => textStyle },
      { label: "Código kiosco", width: 14, get: (r) => r.kioskCode, style: () => centerStyle },
      { label: "Código", width: 14, get: (r) => r.code, style: () => textStyle },
      { label: "Producto", width: 36, get: (r) => r.name, style: () => textStyle },
      { label: "Color", width: 18, get: (r) => r.color, style: () => textStyle },
      { label: "Tallas", width: 34, get: (r) => r.sizes, style: () => wrapStyle },
      { label: "Herraje", width: 12, get: (r) => r.hardware, style: () => centerStyle },
      { label: "Existencia", width: 12, get: (r) => r.stock, style: () => numStyle("#,##0"), total: "sum", totalFmt: "#,##0" },
      { label: "Mínimo", width: 11, get: (r) => r.minimum, style: () => numStyle("#,##0") },
      {
        label: "Estado",
        width: 14,
        get: (r) => (r.low ? "Stock bajo" : "Disponible"),
        style: (r) => (r.low ? statusStyle(KIOSK_LOW.text, KIOSK_LOW.fill) : statusStyle(KIOSK_OK.text, KIOSK_OK.fill)),
      },
      { label: "Última actualización", width: 20, get: (r) => fmtDate(r.updatedAt), style: () => centerStyle },
    ],
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summary, "Resumen");
  XLSX.utils.book_append_sheet(wb, detail, "Detalle");
  return wb;
}

export function exportKioskStockExcel(args) {
  const wb = buildKioskStockWorkbook(args);
  XLSX.writeFile(wb, `existencias_kioscos_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export { fmtInt, fmtMoney, fmtQty, fmtDate };
