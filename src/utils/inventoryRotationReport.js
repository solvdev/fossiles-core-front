import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";

/**
 * Reporte de rotación y cobertura de inventario: estados, textos en palabras simples, filtros/orden y Excel.
 * "Cobertura" = cuántos días alcanza la existencia al ritmo de venta (producto) o de consumo (material).
 */

export const SCOPES = {
  PRODUCTS: {
    key: "PRODUCTS",
    tab: "Producto en kioscos",
    itemLabel: "Producto",
    movedLabel: "Vendido",
    movedVerb: "se vendieron",
    movedNoun: "venta",
    lastLabel: "Última venta",
    valueLabel: "Valor a precio de venta",
    emptyMove: "no se vendió ninguna",
  },
  MATERIALS: {
    key: "MATERIALS",
    tab: "Materiales",
    itemLabel: "Material",
    movedLabel: "Consumido",
    movedVerb: "se consumieron",
    movedNoun: "consumo",
    lastLabel: "Último consumo",
    valueLabel: "Valor a costo",
    emptyMove: "no se consumió nada",
  },
};

/** De lo más urgente a lo más parado (igual que el orden que manda el servidor). */
export const STATUS_ORDER = ["SIN_STOCK", "SE_AGOTA", "NORMAL", "LENTO", "SIN_MOVIMIENTO"];

export const STATUS = {
  SIN_STOCK: {
    key: "SIN_STOCK",
    label: "Agotado",
    color: "#991b1b",
    bg: "#fee2e2",
    xlsText: "991B1B",
    xlsFill: "FEE2E2",
    meaning: (scope) => `Ya no hay existencia y en el período sí hubo ${scope.movedNoun}.`,
  },
  SE_AGOTA: {
    key: "SE_AGOTA",
    label: "Se agota",
    color: "#c2410c",
    bg: "#ffedd5",
    xlsText: "9A3412",
    xlsFill: "FFEDD5",
    meaning: (scope, t) => `Lo que hay alcanza para menos de ${t.shortDays} días.`,
  },
  NORMAL: {
    key: "NORMAL",
    label: "Normal",
    color: "#047857",
    bg: "#d1fae5",
    xlsText: "065F46",
    xlsFill: "D1FAE5",
    meaning: (scope, t) => `Alcanza entre ${t.shortDays} y ${t.slowDays} días.`,
  },
  LENTO: {
    key: "LENTO",
    label: "Lento",
    color: "#b45309",
    bg: "#fef3c7",
    xlsText: "92400E",
    xlsFill: "FEF3C7",
    meaning: (scope, t) => `Alcanza para más de ${t.slowDays} días: hay más de lo que se mueve.`,
  },
  SIN_MOVIMIENTO: {
    key: "SIN_MOVIMIENTO",
    label: "Sin movimiento",
    color: "#4b5563",
    bg: "#f3f4f6",
    xlsText: "374151",
    xlsFill: "E5E7EB",
    meaning: (scope) => `Hay existencia y ${scope.emptyMove} en el período: dinero parado.`,
  },
};

export const statusMeta = (key) => STATUS[key] || STATUS.NORMAL;

const num = (v) => Number(v || 0);

export const fmtInt = (v) => num(v).toLocaleString("es-GT", { maximumFractionDigits: 0 });
export const fmtQty = (v) =>
  num(v).toLocaleString("es-GT", { maximumFractionDigits: Number.isInteger(num(v)) ? 0 : 2 });
export const fmtRate = (v) => (num(v) > 0 ? num(v).toLocaleString("es-GT", { maximumFractionDigits: 2 }) : "—");
export const fmtMoney = (v) =>
  `Q${num(v).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const fmtDate = (v) => {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : String(v);
};

/** «8 días», «1 día», «más de 1 año» o «—» cuando no hubo movimiento y no se puede estimar. */
export function coverageText(row) {
  if (row.coverageDays == null) return "—";
  const d = num(row.coverageDays);
  if (d >= 365) return "más de 1 año";
  if (d < 1) return "menos de 1 día";
  const rounded = d >= 100 ? Math.round(d) : Math.round(d * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toLocaleString("es-GT")} ${rounded === 1 ? "día" : "días"}`;
}

/** Una frase que explica la fila sin leer columnas. */
export function explainRow(row, scope, windowDays) {
  const unit = row.unit ? ` ${row.unit}` : "";
  const stock = fmtQty(row.stock);
  const moved = fmtQty(row.moved);
  switch (row.status) {
    case "SIN_STOCK":
      return `En ${windowDays} días ${scope.movedVerb} ${moved}${unit} y hoy no hay existencia.`;
    case "SIN_MOVIMIENTO":
      return `Hay ${stock}${unit} en existencia y ${scope.emptyMove} en ${windowDays} días.`;
    default:
      return `En ${windowDays} días ${scope.movedVerb} ${moved}${unit} (${fmtRate(row.dailyRate)} por día). Con ${stock}${unit} en existencia alcanza para ${coverageText(row)}.`;
  }
}

export const countByStatus = (rows) => {
  const out = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0]));
  (rows || []).forEach((r) => {
    if (out[r.status] != null) out[r.status] += 1;
  });
  return out;
};

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function filterRows(rows, { status = "ALL", search = "" } = {}) {
  const q = norm(search).trim();
  return (rows || []).filter((r) => {
    if (status !== "ALL" && r.status !== status) return false;
    if (!q) return true;
    return norm(`${r.code} ${r.name} ${r.variant} ${r.hardware}`).includes(q);
  });
}

const SORTERS = {
  status: (r) => STATUS_ORDER.indexOf(r.status),
  name: (r) => norm(r.name),
  stock: (r) => num(r.stock),
  moved: (r) => num(r.moved),
  rate: (r) => num(r.dailyRate),
  coverage: (r) => (r.coverageDays == null ? Number.POSITIVE_INFINITY : num(r.coverageDays)),
  value: (r) => num(r.stockValue),
  last: (r) => r.lastMovementDate || "",
};

/** `status` conserva el orden del servidor (urgente primero); el resto ordena por la columna. */
export function sortRows(rows, key = "status", dir = "asc") {
  const get = SORTERS[key];
  if (!get || key === "status") return rows;
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x < y) return -1 * sign;
    if (x > y) return 1 * sign;
    return 0;
  });
}

export const thresholds = (data) => ({ shortDays: data?.shortDays ?? 5, slowDays: data?.slowDays ?? 45 });

// ==================== Excel ====================

const line = { style: "thin", color: { rgb: "D1D5DB" } };
const box = { top: line, right: line, bottom: line, left: line };
const NAVY = "1F2937";

const titleStyle = { font: { bold: true, sz: 16, color: { rgb: NAVY } } };
const metaStyle = { font: { sz: 10, color: { rgb: "6B7280" } } };
const sectionStyle = { font: { bold: true, sz: 12, color: { rgb: NAVY } } };
const headStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: NAVY } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: box,
};
const textStyle = { border: box, alignment: { vertical: "center" } };
const wrapStyle = { border: box, alignment: { vertical: "center", wrapText: true } };
const centerStyle = { border: box, alignment: { horizontal: "center", vertical: "center" } };
const numStyle = (fmt) => ({ border: box, numFmt: fmt, alignment: { horizontal: "right", vertical: "center" } });
const totalStyle = {
  font: { bold: true },
  fill: { fgColor: { rgb: "F3F4F6" } },
  border: box,
  alignment: { vertical: "center" },
};
const totalNum = (fmt) => ({ ...totalStyle, numFmt: fmt, alignment: { horizontal: "right", vertical: "center" } });
const statusCell = (key) => {
  const m = statusMeta(key);
  return {
    font: { bold: true, color: { rgb: m.xlsText } },
    fill: { fgColor: { rgb: m.xlsFill } },
    border: box,
    alignment: { horizontal: "center", vertical: "center" },
  };
};
const tintedNum = (key, fmt) => ({
  ...numStyle(fmt),
  fill: { fgColor: { rgb: statusMeta(key).xlsFill } },
  font: { color: { rgb: statusMeta(key).xlsText } },
});

const cell = (v, s) => ({ v: v ?? "", t: typeof v === "number" ? "n" : "s", s });

function detailColumns(scope, data) {
  const isProducts = scope.key === "PRODUCTS";
  const w = data.windowDays;
  const cols = [
    { label: "Código", width: 14, get: (r) => r.code || "", style: () => textStyle },
    { label: scope.itemLabel, width: 36, get: (r) => r.name || "", style: () => textStyle },
  ];
  if (isProducts) {
    cols.push(
      { label: "Color", width: 18, get: (r) => r.variant || "", style: () => textStyle },
      { label: "Herraje", width: 12, get: (r) => r.hardware || "", style: () => centerStyle }
    );
  } else {
    cols.push({ label: "Unidad", width: 12, get: (r) => r.unit || "", style: () => centerStyle });
  }
  cols.push(
    { label: "Existencia", width: 12, get: (r) => num(r.stock), style: () => numStyle("#,##0.##"), total: "sum" },
    {
      label: `${scope.movedLabel} en ${w} días`,
      width: 14,
      get: (r) => num(r.moved),
      style: () => numStyle("#,##0.##"),
      total: "sum",
    },
    { label: "Por día", width: 10, get: (r) => num(r.dailyRate), style: () => numStyle("0.00") },
    {
      label: "Alcanza para (días)",
      width: 14,
      get: (r) => (r.coverageDays == null ? "—" : num(r.coverageDays)),
      style: (r) => (r.coverageDays == null ? centerStyle : tintedNum(r.status, "#,##0.0")),
    },
    { label: "Estado", width: 16, get: (r) => statusMeta(r.status).label, style: (r) => statusCell(r.status) },
    { label: scope.lastLabel, width: 13, get: (r) => fmtDate(r.lastMovementDate), style: () => centerStyle }
  );
  if (isProducts) {
    cols.push({
      label: "Kioscos con existencia",
      width: 12,
      get: (r) => num(r.locationsWithStock),
      style: () => numStyle("#,##0"),
    });
  } else {
    cols.push(
      { label: "Mínimo", width: 10, get: (r) => (r.min == null ? "" : num(r.min)), style: () => numStyle("#,##0") },
      { label: "Máximo", width: 10, get: (r) => (r.max == null ? "" : num(r.max)), style: () => numStyle("#,##0") }
    );
  }
  cols.push(
    {
      label: isProducts ? "Precio de venta (Q)" : "Costo unitario (Q)",
      width: 14,
      get: (r) => num(r.unitValue),
      style: () => numStyle('"Q"#,##0.00'),
    },
    {
      label: `${scope.valueLabel} (Q)`,
      width: 16,
      get: (r) => num(r.stockValue),
      style: () => numStyle('"Q"#,##0.00'),
      total: "sum",
      totalFmt: '"Q"#,##0.00',
    },
    {
      label: "Qué significa",
      width: 70,
      get: (r) => explainRow(r, scope, w),
      style: () => wrapStyle,
    }
  );
  return cols;
}

function buildDetailSheet(scope, data, rows, subtitle) {
  const cols = detailColumns(scope, data);
  const headerRow = 3;
  const aoa = [
    [cell(`${scope.tab}: detalle`, titleStyle)],
    [cell(subtitle, metaStyle)],
    [],
    cols.map((c) => cell(c.label, headStyle)),
  ];
  rows.forEach((r) => aoa.push(cols.map((c) => cell(c.get(r), c.style(r)))));
  aoa.push(
    cols.map((c, i) => {
      if (i === 0) return cell("TOTAL", totalStyle);
      if (c.total === "sum") {
        const v = rows.reduce((acc, r) => acc + num(c.get(r)), 0);
        return cell(v, totalNum(c.totalFmt || "#,##0.##"));
      }
      return cell("", totalStyle);
    })
  );
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = cols.map((c) => ({ wch: c.width }));
  ws["!rows"] = [{ hpt: 24 }, {}, {}, { hpt: 34 }];
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + rows.length, c: cols.length - 1 } }),
  };
  ws["!freeze"] = { xSplit: 2, ySplit: headerRow + 1 };
  ws["!views"] = [{ state: "frozen", xSplit: 2, ySplit: headerRow + 1, showGridLines: false }];
  ws["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  ws["!margins"] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
  return ws;
}

function buildSummarySheet(scope, data, rows, subtitle) {
  const t = thresholds(data);
  const byStatus = Object.fromEntries(STATUS_ORDER.map((k) => [k, { lines: 0, units: 0, value: 0 }]));
  rows.forEach((r) => {
    const b = byStatus[r.status];
    if (!b) return;
    b.lines += 1;
    b.units += Math.max(0, num(r.stock));
    b.value += num(r.stockValue);
  });
  const totalLines = rows.length;
  const totalUnits = rows.reduce((a, r) => a + Math.max(0, num(r.stock)), 0);
  const totalValue = rows.reduce((a, r) => a + num(r.stockValue), 0);

  const aoa = [
    [cell("Rotación y cobertura de inventario", titleStyle)],
    [cell(`${scope.tab}`, { font: { bold: true, sz: 12, color: { rgb: "4B5563" } } })],
    [cell(subtitle, metaStyle)],
    [],
    [cell("Resumen por estado", sectionStyle)],
    [
      cell("Estado", headStyle),
      cell("Qué significa", headStyle),
      cell("Líneas", headStyle),
      cell("Unidades en existencia", headStyle),
      cell(`${scope.valueLabel} (Q)`, headStyle),
    ],
  ];
  STATUS_ORDER.forEach((k) => {
    const m = statusMeta(k);
    const b = byStatus[k];
    aoa.push([
      cell(m.label, statusCell(k)),
      cell(m.meaning(scope, t), wrapStyle),
      cell(b.lines, numStyle("#,##0")),
      cell(b.units, numStyle("#,##0.##")),
      cell(b.value, numStyle('"Q"#,##0.00')),
    ]);
  });
  aoa.push([
    cell("TOTAL", totalStyle),
    cell("", totalStyle),
    cell(totalLines, totalNum("#,##0")),
    cell(totalUnits, totalNum("#,##0.##")),
    cell(totalValue, totalNum('"Q"#,##0.00')),
  ]);
  aoa.push([]);
  aoa.push([cell("Cómo leer este reporte", sectionStyle)]);
  [
    `Existencia: lo que hay hoy.`,
    scope.key === "PRODUCTS"
      ? `Vendido: unidades vendidas en kioscos menos las anuladas, en los últimos ${data.windowDays} días (desde ${fmtDate(data.since)}).`
      : `Consumido: cantidad que salió a producción en los últimos ${data.windowDays} días (desde ${fmtDate(data.since)}).`,
    `Por día: lo anterior dividido entre ${data.windowDays} días.`,
    `Alcanza para: existencia ÷ por día. Es cuántos días dura lo que hay si el ritmo no cambia.`,
    `Hoja «Detalle»: una fila por línea, con filtros en el encabezado y la columna «Qué significa» en palabras simples.`,
  ].forEach((txt) => aoa.push([cell(`•  ${txt}`, { alignment: { wrapText: false } })]));

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 18 }, { wch: 62 }, { wch: 10 }, { wch: 22 }, { wch: 26 }];
  ws["!rows"] = [{ hpt: 26 }, { hpt: 18 }, {}, {}, { hpt: 20 }, { hpt: 32 }];
  ws["!views"] = [{ showGridLines: false }];
  ws["!margins"] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  return ws;
}

/** Libro con «Resumen» (por estado y cómo leerlo) y «Detalle» (una fila por línea, filtrable). */
export function buildRotationWorkbook({ scope, data, rows, filtersLabel = "" }) {
  const subtitle = [
    `Últimos ${data.windowDays} días (desde ${fmtDate(data.since)})`,
    filtersLabel,
    `Generado ${formatNowGt()}`,
  ]
    .filter(Boolean)
    .join("  ·  ");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(scope, data, rows, subtitle), "Resumen");
  XLSX.utils.book_append_sheet(wb, buildDetailSheet(scope, data, rows, subtitle), "Detalle");
  return wb;
}

export function exportRotationExcel(args) {
  const wb = buildRotationWorkbook(args);
  const stamp = new Date().toISOString().slice(0, 10);
  const name = args.scope.key === "PRODUCTS" ? "rotacion_producto_kioscos" : "rotacion_materiales";
  XLSX.writeFile(wb, `${name}_${args.data.windowDays}d_${stamp}.xlsx`);
}
