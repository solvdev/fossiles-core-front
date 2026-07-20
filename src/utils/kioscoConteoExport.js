import * as XLSX from "xlsx-js-style";
import { formatConteoSubtotalLabel } from "./kioscoConteoDisplay";
import {
  CONTEO_COLOR_LEGEND_LEFT,
  CONTEO_COLOR_LEGEND_RIGHT,
} from "./kioscoConteoColorLegend";
import { formatNowGt } from "./dateTimeHelper";

const COUNT_LOCATION_KEYS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "E", "BO"];
/** Código + Producto (nombre · color · talla en una sola columna). */
const PRODUCT_COL_COUNT = 2;
const DIFF_ALERT_THRESHOLD = 3;

const COLORS = {
  border: "D1D5DB",
  separator: "9CA3AF",
  titleBg: "DBEAFE",
  metaBg: "F9FAFB",
  tableHeaderBg: "F3F4F6",
  vitrineHeaderBg: "DCFCE7",
  categoryBg: "E5E7EB",
  separatorBg: "E5E7EB",
  subtotalBg: "F9FAFB",
  totalBg: "1F2937",
  totalText: "FFFFFF",
  alertBg: "FEF2F2",
  diffBad: "DC2626",
  diffOk: "16A34A",
  zebraBg: "FAFAFA",
};

const diffColorRgb = (diferencia) => {
  if (Number(diferencia || 0) === 0) return "111827";
  return Number(diferencia) > 0 ? COLORS.diffOk : COLORS.diffBad;
};

const formatDiffValue = (diferencia) => {
  const n = Number(diferencia || 0);
  if (n > 0) return `+${n}`;
  return n;
};

const thinBorder = {
  top: { style: "thin", color: { rgb: COLORS.border } },
  right: { style: "thin", color: { rgb: COLORS.border } },
  bottom: { style: "thin", color: { rgb: COLORS.border } },
  left: { style: "thin", color: { rgb: COLORS.border } },
};

const thickBorderSide = { style: "medium", color: { rgb: COLORS.separator } };

const fillStyle = (rgb) => ({ fgColor: { rgb } });

const KARDEX_HEADERS = [
  { key: "inventarioInicial", label: "Inv. inicial" },
  { key: "comprasAjustes", label: "Compras/ajustes" },
  { key: "anulacionCompras", label: "Anul. compras" },
  { key: "entradas", label: "Entradas" },
  { key: "ventas", label: "Ventas" },
  { key: "anulacionVenta", label: "Anul. venta" },
  { key: "salida", label: "Salidas" },
  { key: "inventarioFinal", label: "Inv. final" },
];

const isSubcountReport = (report) =>
  report?.reportType === "SUBCONTEO" || Boolean(report?.asOfDate);

const resolveKardexHeaders = (report) => {
  if (!isSubcountReport(report)) return KARDEX_HEADERS;
  return KARDEX_HEADERS.map((col) =>
    col.key === "inventarioFinal" ? { ...col, label: "Inv. final al corte" } : col
  );
};

const escape = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Nombre + color + talla en una celda para filtrar fácil en Excel. */
function formatProductLabel(row) {
  const name = String(row?.productName || "").trim();
  const colorRaw = String(row?.colorName || "").trim();
  const color = colorRaw && colorRaw !== "—" ? colorRaw : "";
  const size = String(row?.sizeLabel || row?.sizesSummary || "").trim();
  return [name, color, size].filter(Boolean).join("  ");
}

function colLayout(showKardex, includeVitrines = true) {
  const kardexCount = showKardex ? KARDEX_HEADERS.length : 0;
  const kardexStart = PRODUCT_COL_COUNT;
  if (!includeVitrines) {
    const colCount = PRODUCT_COL_COUNT + kardexCount;
    return {
      includeVitrines: false,
      kardexCount,
      kardexStart,
      separatorCol: -1,
      vitrineStart: colCount,
      totalCol: -1,
      diffCol: -1,
      colCount,
    };
  }
  const separatorCol = kardexStart + kardexCount;
  const vitrineStart = separatorCol + 1;
  const totalCol = vitrineStart + COUNT_LOCATION_KEYS.length;
  const diffCol = totalCol + 1;
  const obsCol = diffCol + 1;
  return {
    includeVitrines: true,
    kardexCount,
    kardexStart,
    separatorCol,
    vitrineStart,
    totalCol,
    diffCol,
    obsCol,
    colCount: obsCol + 1,
  };
}

function resolveExportOptions(report, options = {}) {
  const showKardex = options.showKardex !== false;
  const subcount = isSubcountReport(report);
  const includeVitrines =
    options.includeVitrines != null ? Boolean(options.includeVitrines) : !subcount;
  return { showKardex, includeVitrines, subcount };
}

function calculateDifferenceBreakdown(report) {
  return (report.categories || [])
    .flatMap((category) => category.rows || [])
    .reduce(
      (summary, row) => {
        const difference = Number(row.diferencia || 0);
        if (difference > 0) {
          summary.surplus += difference;
        } else if (difference < 0) {
          summary.shortage += Math.abs(difference);
        }
        return summary;
      },
      { surplus: 0, shortage: 0 }
    );
}

function buildHeaderRows(report, includeVitrines = true) {
  const subcount = isSubcountReport(report);
  const rows = [
    [subcount ? "Inventario sistema al corte (sin vitrinas)" : "Conteo físico de inventario kiosco"],
    ["Kiosko", report.locationName || report.locationCode || "—"],
  ];
  if (subcount) {
    rows.push(["Tipo", "Inventario a fecha"]);
    rows.push(["Corte sistema (23:59)", report.asOfDate || "—"]);
    rows.push(["Kardex período", `${report.periodFrom || ""} a ${report.asOfDate || ""}`]);
  }
  rows.push(
    ["Período sesión", `${report.periodFrom || ""} a ${report.periodTo || ""}`],
    ["Estado", report.status || "—"],
    ["Generado por", report.generatedByName || "—"],
    ["Generado el", report.generatedAt ? String(report.generatedAt).slice(0, 19).replace("T", " ") : "—"],
    ["Revisado por", report.reviewedByName || "Pendiente"],
    ["Notas", report.notes || ""],
    ["Exportado", formatNowGt()]
  );
  rows.push([]);
  return rows;
}

/** Encabezado fijo: Código + Producto + kardex (hasta el separador). */
function buildKardexHeaderCells(showKardex, report, includeVitrines = true) {
  const kardexHeaders = resolveKardexHeaders(report);
  const layout = colLayout(showKardex, includeVitrines);
  const cells = Array(layout.colCount).fill("");
  cells[0] = "Código";
  cells[1] = "Producto";
  if (showKardex) {
    kardexHeaders.forEach((col, index) => {
      cells[PRODUCT_COL_COUNT + index] = col.label;
    });
  }
  if (includeVitrines) {
    cells[layout.separatorCol] = "";
  }
  return cells;
}

/** Encabezados de vitrinas (por categoría). */
function buildVitrineHeaderCells(showKardex, report) {
  const layout = colLayout(showKardex, true);
  const cells = Array(layout.colCount).fill("");
  COUNT_LOCATION_KEYS.forEach((key, index) => {
    cells[layout.vitrineStart + index] = key;
  });
  cells[layout.totalCol] = "Total físico";
  cells[layout.diffCol] = "Diferencia";
  cells[layout.obsCol] = "Observaciones";
  cells[layout.separatorCol] = "";
  return cells;
}

function buildDataRowCells(row, showKardex, report, includeVitrines = true) {
  const kardexHeaders = resolveKardexHeaders(report);
  const layout = colLayout(showKardex, includeVitrines);
  const { kardexStart, separatorCol, vitrineStart, totalCol, diffCol, obsCol, colCount } = layout;
  const cells = Array(colCount).fill("");
  cells[0] = row.productCode || "";
  cells[1] = formatProductLabel(row);
  if (showKardex) {
    kardexHeaders.forEach((col, index) => {
      cells[kardexStart + index] = row[col.key] ?? 0;
    });
  }
  if (includeVitrines) {
    COUNT_LOCATION_KEYS.forEach((key, index) => {
      cells[vitrineStart + index] = (row.counts || {})[key] ?? 0;
    });
    cells[totalCol] = row.total ?? 0;
    cells[diffCol] = formatDiffValue(row.diferencia ?? 0);
    cells[obsCol] = Number(row.diferencia || 0) !== 0 ? (row.observation || "") : "";
    cells[separatorCol] = "";
  }
  return cells;
}

function buildSubtotalCells(label, sub, showKardex, report, includeVitrines = true) {
  const cells = buildDataRowCells(
    {
      productCode: label.startsWith("TOTAL") ? label : "",
      productName: label.startsWith("TOTAL") ? "" : label,
      colorName: "",
      sizesSummary: "",
      counts: sub.counts,
      total: sub.total,
      diferencia: sub.diferencia,
      ...sub,
    },
    showKardex,
    report,
    includeVitrines
  );
  if (label.startsWith("TOTAL")) {
    cells[0] = label;
    cells[1] = "";
  } else {
    cells[0] = "";
    cells[1] = label;
  }
  return cells;
}

function ensureCategorySubtotals(report) {
  const categories = (report.categories || []).map((cat) => {
    if (cat.subtotal) return cat;
    const rows = cat.rows || [];
    return {
      ...cat,
      subtotal: {
        inventarioInicial: rows.reduce((s, r) => s + Number(r.inventarioInicial || 0), 0),
        comprasAjustes: rows.reduce((s, r) => s + Number(r.comprasAjustes || 0), 0),
        anulacionCompras: rows.reduce((s, r) => s + Number(r.anulacionCompras || 0), 0),
        entradas: rows.reduce((s, r) => s + Number(r.entradas || 0), 0),
        ventas: rows.reduce((s, r) => s + Number(r.ventas || 0), 0),
        anulacionVenta: rows.reduce((s, r) => s + Number(r.anulacionVenta || 0), 0),
        salida: rows.reduce((s, r) => s + Number(r.salida || 0), 0),
        inventarioFinal: rows.reduce((s, r) => s + Number(r.inventarioFinal || 0), 0),
        counts: cat.subtotal?.counts,
        total: rows.reduce((s, r) => s + Number(r.total || 0), 0),
        diferencia:
          rows.reduce((s, r) => s + Number(r.total || 0), 0)
          - rows.reduce((s, r) => s + Number(r.inventarioFinal || 0), 0),
      },
    };
  });
  return { ...report, categories };
}

function buildSheetStructure(report, showKardex, includeVitrines = true) {
  const prepared = ensureCategorySubtotals(report);
  const layout = colLayout(showKardex, includeVitrines);
  const { colCount } = layout;
  const rows = [];
  const meta = [];

  buildHeaderRows(prepared, includeVitrines).forEach((row) => {
    rows.push(row);
    meta.push({ type: "meta" });
  });

  // Encabezado único de kardex (congelado arriba); vitrinas van por categoría.
  rows.push(buildKardexHeaderCells(showKardex, prepared, includeVitrines));
  meta.push({ type: "kardex-headers" });

  (prepared.categories || []).forEach((cat) => {
    const titleRow = Array(colCount).fill("");
    titleRow[0] = cat.categoryName || "Sin categoría";
    rows.push(titleRow);
    meta.push({ type: "category-title" });

    if (includeVitrines) {
      rows.push(buildVitrineHeaderCells(showKardex, prepared));
      meta.push({ type: "vitrine-headers" });
    }

    (cat.rows || []).forEach((row, rowIndex) => {
      rows.push(buildDataRowCells(row, showKardex, prepared, includeVitrines));
      meta.push({
        type: "data",
        isAlert: includeVitrines && Math.abs(row.diferencia ?? 0) >= DIFF_ALERT_THRESHOLD,
        isZebra: rowIndex % 2 === 1,
        diferencia: row.diferencia ?? 0,
      });
    });

    const subtotal = cat.subtotal;
    if (subtotal) {
      rows.push(
        buildSubtotalCells(
          formatConteoSubtotalLabel(cat.categoryName),
          subtotal,
          showKardex,
          prepared,
          includeVitrines
        )
      );
      meta.push({ type: "subtotal" });
    }

    rows.push(Array(colCount).fill(""));
    meta.push({ type: "blank" });
  });

  // Con vitrinas: TOTAL GENERAL global. Sin vitrinas (inventario a fecha): solo subtotales por categoría.
  if (includeVitrines && prepared.totalGeneral) {
    rows.push(buildSubtotalCells("TOTAL GENERAL", prepared.totalGeneral, showKardex, prepared, includeVitrines));
    meta.push({ type: "total-general" });
  }

  return { rows, meta, layout };
}

function ensureCell(ws, rowIdx, colIdx, value) {
  const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
  if (!ws[cellRef]) {
    ws[cellRef] = { t: "s", v: value ?? "" };
  }
  return cellRef;
}

function styleCell(ws, rowIdx, colIdx, style) {
  const cellRef = ensureCell(ws, rowIdx, colIdx, "");
  ws[cellRef].s = { ...(ws[cellRef].s || {}), ...style };
}

function styleRowRange(ws, rowIdx, colCount, style) {
  for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
    styleCell(ws, rowIdx, colIdx, style);
  }
}

function isNumericCol(colIdx, layout) {
  const { kardexStart, separatorCol, vitrineStart, diffCol, obsCol, includeVitrines } = layout;
  if (colIdx < PRODUCT_COL_COUNT) return false;
  if (includeVitrines && colIdx === separatorCol) return false;
  if (includeVitrines && colIdx === obsCol) return false;
  if (!includeVitrines) return colIdx >= kardexStart;
  if (colIdx >= kardexStart && colIdx < separatorCol) return true;
  if (colIdx >= vitrineStart && colIdx <= diffCol) return true;
  return false;
}

function borderWithSeparator(colIdx, layout, baseBorder = thinBorder) {
  const { separatorCol, vitrineStart, kardexStart, kardexCount, includeVitrines } = layout;
  const lastKardexCol = kardexStart + kardexCount - 1;
  const border = { ...baseBorder };
  if (includeVitrines && colIdx === separatorCol) {
    return {
      ...border,
      left: thickBorderSide,
      right: thickBorderSide,
      top: border.top,
      bottom: border.bottom,
    };
  }
  if (includeVitrines && colIdx === vitrineStart) {
    return { ...border, left: thickBorderSide };
  }
  if (kardexCount > 0 && colIdx === lastKardexCol) {
    return { ...border, right: thickBorderSide };
  }
  if (kardexCount === 0 && colIdx === PRODUCT_COL_COUNT - 1) {
    return { ...border, right: thickBorderSide };
  }
  return border;
}

function applySheetLayout(ws, layout, merges) {
  const { colCount, separatorCol, vitrineStart, includeVitrines } = layout;
  ws["!merges"] = merges;
  ws["!cols"] = Array.from({ length: Math.max(colCount, 9) }, (_, colIdx) => {
    if (colIdx === 2) return { wch: 26 };
    if (colIdx === 3) return { wch: 10 };
    if (colIdx === 4 || colIdx === 7) return { wch: 24 };
    if (colIdx === 5 || colIdx === 8) return { wch: 4 };
    if (includeVitrines && colIdx === separatorCol) return { wch: 2 };
    if (colIdx === 0) return { wch: 14 };
    if (colIdx === 1) return { wch: 44 };
    if (includeVitrines && colIdx >= vitrineStart && colIdx < layout.totalCol) return { wch: 6 };
    if (colIdx >= PRODUCT_COL_COUNT && (!includeVitrines || colIdx < separatorCol)) return { wch: 9 };
    if (includeVitrines && (colIdx === layout.totalCol || colIdx === layout.diffCol)) return { wch: 10 };
    if (includeVitrines && colIdx === layout.obsCol) return { wch: 28 };
    return { wch: 14 };
  });
}

function styleKardexHeaderRow(ws, rowIdx, layout) {
  const { colCount, separatorCol, kardexStart, kardexCount, includeVitrines } = layout;
  const lastKardexCol = kardexCount > 0 ? kardexStart + kardexCount - 1 : PRODUCT_COL_COUNT - 1;
  for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
    const inKardexBlock = colIdx <= lastKardexCol;
    let fill = inKardexBlock ? COLORS.tableHeaderBg : "FFFFFF";
    if (includeVitrines && colIdx === separatorCol) {
      fill = COLORS.separatorBg;
    }
    styleCell(ws, rowIdx, colIdx, {
      font: {
        name: "Arial",
        sz: 10,
        bold: inKardexBlock,
        color: { rgb: inKardexBlock ? "111827" : "9CA3AF" },
      },
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: borderWithSeparator(colIdx, layout),
      fill: fillStyle(fill),
    });
  }
}

function styleVitrineHeaderRow(ws, rowIdx, layout) {
  const { colCount, separatorCol, vitrineStart, diffCol, obsCol } = layout;
  for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
    const inVitrineBlock = colIdx >= vitrineStart && colIdx <= obsCol;
    let fill = "FFFFFF";
    if (colIdx === separatorCol) fill = COLORS.separatorBg;
    else if (colIdx === obsCol) fill = "FFFBEB";
    else if (inVitrineBlock && colIdx <= diffCol) fill = COLORS.vitrineHeaderBg;
    styleCell(ws, rowIdx, colIdx, {
      font: {
        name: "Arial",
        sz: 10,
        bold: inVitrineBlock,
        color: { rgb: inVitrineBlock ? "111827" : "9CA3AF" },
      },
      alignment: { vertical: "center", horizontal: "center", wrapText: true },
      border: borderWithSeparator(colIdx, layout),
      fill: fillStyle(fill),
    });
  }
}

function paintDifferenceSummary(ws, report, startRow = 1) {
  const difference = calculateDifferenceBreakdown(report);
  const net = difference.surplus - difference.shortage;
  const labelCol = 2;
  const valueCol = 3;
  const items = [
    { label: "Total sobrante", value: `+${difference.surplus}`, color: COLORS.diffOk },
    { label: "Total faltante", value: `−${difference.shortage}`, color: COLORS.diffBad },
    {
      label: "Neto (sobrante − faltante)",
      value: net > 0 ? `+${net}` : String(net),
      color: net === 0 ? "111827" : net > 0 ? COLORS.diffOk : COLORS.diffBad,
    },
  ];

  items.forEach((item, index) => {
    const rowIdx = startRow + index;
    const labelRef = ensureCell(ws, rowIdx, labelCol, item.label);
    ws[labelRef].v = item.label;
    ws[labelRef].t = "s";
    styleCell(ws, rowIdx, labelCol, {
      font: { name: "Arial", sz: 9, bold: true, color: { rgb: "374151" } },
      alignment: { vertical: "center", horizontal: "left" },
      border: thinBorder,
      fill: fillStyle(COLORS.metaBg),
    });

    const valueRef = ensureCell(ws, rowIdx, valueCol, item.value);
    ws[valueRef].v = item.value;
    ws[valueRef].t = "s";
    styleCell(ws, rowIdx, valueCol, {
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: item.color } },
      alignment: { vertical: "center", horizontal: "right" },
      border: thinBorder,
      fill: fillStyle("FFFFFF"),
    });
  });

  const currentRef = ws["!ref"] || "A1";
  const range = XLSX.utils.decode_range(currentRef);
  range.e.c = Math.max(range.e.c, valueCol);
  range.e.r = Math.max(range.e.r, startRow + items.length - 1);
  ws["!ref"] = XLSX.utils.encode_range(range);
}

function paintColorLegend(ws, startRow = 1) {
  const leftLabelCol = 4;
  const leftSwatchCol = 5;
  const rightLabelCol = 7;
  const rightSwatchCol = 8;

  const paintGroup = (items, labelCol, swatchCol) => {
    items.forEach((item, index) => {
      const rowIdx = startRow + index;
      const labelRef = ensureCell(ws, rowIdx, labelCol, item.label);
      ws[labelRef].v = item.label;
      ws[labelRef].t = "s";
      styleCell(ws, rowIdx, labelCol, {
        font: { name: "Arial", sz: 9, bold: true, color: { rgb: "111827" } },
        alignment: { vertical: "center", horizontal: "left" },
        border: thinBorder,
        fill: fillStyle("FFFFFF"),
      });

      const swatchRef = ensureCell(ws, rowIdx, swatchCol, "");
      ws[swatchRef].v = "";
      ws[swatchRef].t = "s";
      styleCell(ws, rowIdx, swatchCol, {
        font: { name: "Arial", sz: 9, bold: true, color: { rgb: item.textColor } },
        alignment: { vertical: "center", horizontal: "center" },
        border: thinBorder,
        fill: fillStyle(item.color),
      });
    });
  };

  paintGroup(CONTEO_COLOR_LEGEND_LEFT, leftLabelCol, leftSwatchCol);
  paintGroup(CONTEO_COLOR_LEGEND_RIGHT, rightLabelCol, rightSwatchCol);

  const currentRef = ws["!ref"] || "A1";
  const range = XLSX.utils.decode_range(currentRef);
  range.e.c = Math.max(range.e.c, rightSwatchCol);
  range.e.r = Math.max(range.e.r, startRow + Math.max(CONTEO_COLOR_LEGEND_LEFT.length, CONTEO_COLOR_LEGEND_RIGHT.length) - 1);
  ws["!ref"] = XLSX.utils.encode_range(range);
}

function applyConteoSheetStyles(ws, report, showKardex, includeVitrines = true) {
  const { meta, layout } = buildSheetStructure(report, showKardex, includeVitrines);
  const { colCount, separatorCol, diffCol, includeVitrines: withVitrines } = layout;
  const headerOffset = buildHeaderRows(report, includeVitrines).length;
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(colCount - 1, 0) } }];
  const kardexHeaderRow = headerOffset;

  applySheetLayout(ws, layout, merges);

  styleRowRange(ws, 0, colCount, {
    font: { name: "Arial", sz: 13, bold: true, color: { rgb: "1E3A8A" } },
    alignment: { vertical: "center", horizontal: "center" },
    border: thinBorder,
    fill: fillStyle(COLORS.titleBg),
  });
  ws["!rows"] = [{ hpt: 28 }];

  for (let rowIdx = 1; rowIdx < headerOffset - 1; rowIdx += 1) {
    styleCell(ws, rowIdx, 0, {
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "374151" } },
      alignment: { vertical: "center", horizontal: "left" },
      border: thinBorder,
      fill: fillStyle(COLORS.metaBg),
    });
    styleCell(ws, rowIdx, 1, {
      font: { name: "Arial", sz: 10, color: { rgb: "111827" } },
      alignment: { vertical: "center", horizontal: "left", wrapText: true },
      border: thinBorder,
      fill: fillStyle(COLORS.metaBg),
    });
  }

  if (includeVitrines) {
    paintDifferenceSummary(ws, report, 1);
  }
  paintColorLegend(ws, 1);

  meta.slice(headerOffset).forEach((entry, offset) => {
    const currentRow = headerOffset + offset;
    if (entry.type === "kardex-headers") {
      styleKardexHeaderRow(ws, currentRow, layout);
      return;
    }
    if (entry.type === "vitrine-headers") {
      styleVitrineHeaderRow(ws, currentRow, layout);
      return;
    }
    if (entry.type === "category-title") {
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: colCount - 1 } });
      styleRowRange(ws, currentRow, colCount, {
        font: { name: "Arial", sz: 10, bold: true, color: { rgb: "111827" } },
        alignment: { vertical: "center", horizontal: "left" },
        border: thinBorder,
        fill: fillStyle(COLORS.categoryBg),
      });
      return;
    }
    if (entry.type === "data") {
      const absDiff = Math.abs(Number(entry.diferencia || 0));
      const isAlert = withVitrines && absDiff >= DIFF_ALERT_THRESHOLD;
      const alertFill = Number(entry.diferencia || 0) > 0 ? "F0FDF4" : COLORS.alertBg;
      const rowFill = isAlert ? alertFill : entry.isZebra ? COLORS.zebraBg : "FFFFFF";
      const diffColor = diffColorRgb(entry.diferencia);
      for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
        const isNumeric = isNumericCol(colIdx, layout);
        let fill = rowFill;
        if (withVitrines && colIdx === separatorCol) fill = COLORS.separatorBg;
        styleCell(ws, currentRow, colIdx, {
          font: {
            name: "Arial",
            sz: 10,
            bold: withVitrines && colIdx === diffCol,
            color: { rgb: withVitrines && colIdx === diffCol ? diffColor : "111827" },
          },
          alignment: {
            vertical: "center",
            horizontal: isNumeric ? "right" : "left",
            wrapText: colIdx === 1 || colIdx === layout.obsCol,
          },
          border: borderWithSeparator(colIdx, layout),
          fill: fillStyle(fill),
        });
      }
      return;
    }
    if (entry.type === "subtotal") {
      for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
        const isNumeric = isNumericCol(colIdx, layout);
        let fill = COLORS.subtotalBg;
        if (withVitrines && colIdx === separatorCol) fill = COLORS.separatorBg;
        styleCell(ws, currentRow, colIdx, {
          font: { name: "Arial", sz: 10, bold: true, color: { rgb: "111827" } },
          alignment: {
            vertical: "center",
            horizontal: isNumeric ? "right" : "left",
            wrapText: colIdx === 1,
          },
          border: borderWithSeparator(colIdx, layout),
          fill: fillStyle(fill),
        });
      }
      return;
    }
    if (entry.type === "total-general") {
      merges.push({ s: { r: currentRow, c: 0 }, e: { r: currentRow, c: Math.max(PRODUCT_COL_COUNT - 1, 0) } });
      const totalDiff = report.totalGeneral?.diferencia ?? 0;
      const totalDiffColor = Number(totalDiff) === 0
        ? "86EFAC"
        : Number(totalDiff) > 0
          ? "86EFAC"
          : "FCA5A5";
      for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
        const isNumeric = isNumericCol(colIdx, layout);
        styleCell(ws, currentRow, colIdx, {
          font: {
            name: "Arial",
            sz: 10,
            bold: true,
            color: { rgb: colIdx === diffCol ? totalDiffColor : COLORS.totalText },
          },
          alignment: {
            vertical: "center",
            horizontal: colIdx < PRODUCT_COL_COUNT ? "left" : isNumeric ? "right" : "left",
          },
          border: borderWithSeparator(colIdx, layout),
          fill: fillStyle(COLORS.totalBg),
        });
      }
    }
  });

  ws["!merges"] = merges;

  // Congela filas de meta + encabezado kardex; al scroll horizontal deja fijos Código/Producto.
  ws["!views"] = [
    {
      state: "frozen",
      xSplit: PRODUCT_COL_COUNT,
      ySplit: kardexHeaderRow + 1,
      topLeftCell: XLSX.utils.encode_cell({ r: kardexHeaderRow + 1, c: PRODUCT_COL_COUNT }),
      activePane: "bottomRight",
    },
  ];
}

export function exportConteoToExcel(report, options = {}) {
  const { showKardex, includeVitrines } = resolveExportOptions(report, options);
  const prepared = ensureCategorySubtotals(report);
  const { rows } = buildSheetStructure(prepared, showKardex, includeVitrines);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyConteoSheetStyles(ws, prepared, showKardex, includeVitrines);

  const wb = XLSX.utils.book_new();
  const sheetName = isSubcountReport(prepared)
    ? "Inventario al corte"
    : "Conteo físico";
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const loc = prepared.locationCode || "kiosko";
  const suffix = isSubcountReport(prepared)
    ? `Inventario_${loc}_${prepared.asOfDate || ""}`
    : `${loc}_${prepared.periodFrom || ""}_${prepared.periodTo || ""}`;
  XLSX.writeFile(wb, `Conteo_Fisico_${suffix}.xlsx`);
}

export function exportConteoToPdf(report, options = {}) {
  const win = window.open("", "_blank");
  if (!win) return;

  const { showKardex, includeVitrines, subcount } = resolveExportOptions(report, options);
  const prepared = ensureCategorySubtotals(report);
  const legendHtml = `
    <div class="color-legend">
      <div class="legend-col">
        ${CONTEO_COLOR_LEGEND_LEFT.map((item) => `
          <div class="legend-item">
            <span>${escape(item.label)}</span>
            <i style="background:#${item.color}"></i>
          </div>
        `).join("")}
      </div>
      <div class="legend-col">
        ${CONTEO_COLOR_LEGEND_RIGHT.map((item) => `
          <div class="legend-item">
            <span>${escape(item.label)}</span>
            <i style="background:#${item.color}"></i>
          </div>
        `).join("")}
      </div>
    </div>
  `;
  const headerMeta = `
    <div class="header-row">
      <div class="meta-grid">
        <div><span>Kiosko</span><strong>${escape(prepared.locationName || prepared.locationCode || "—")}</strong></div>
        ${subcount ? `<div><span>Tipo</span><strong>Inventario a fecha</strong></div>` : ""}
        ${subcount ? `<div><span>Corte sistema (23:59)</span><strong>${escape(prepared.asOfDate || "—")}</strong></div>` : ""}
        <div><span>Período sesión</span><strong>${escape(prepared.periodFrom || "")} – ${escape(prepared.periodTo || "")}</strong></div>
        <div><span>Estado</span><strong>${escape(prepared.status || "—")}</strong></div>
        <div><span>Generado por</span><strong>${escape(prepared.generatedByName || "—")}</strong></div>
        <div><span>Revisado por</span><strong>${escape(prepared.reviewedByName || "Pendiente")}</strong></div>
        ${prepared.notes ? `<div class="full"><span>Notas</span><strong>${escape(prepared.notes)}</strong></div>` : ""}
      </div>
      ${legendHtml}
    </div>
  `;

  const kardexHeaderList = resolveKardexHeaders(prepared);
  const kardexHeaders = showKardex
    ? kardexHeaderList.map((col) => `<th>${escape(col.label)}</th>`).join("")
    : "";
  const countHeaders = includeVitrines
    ? COUNT_LOCATION_KEYS.map((k) => `<th>${escape(k)}</th>`).join("")
    : "";
  const trailingHeaders = includeVitrines ? "<th>Total</th><th>Dif.</th><th>Observaciones</th>" : "";
  const colSpan =
    4
    + (showKardex ? kardexHeaderList.length : 0)
    + (includeVitrines ? COUNT_LOCATION_KEYS.length + 3 : 0);

  const theadHtml = `
    <tr>
      <th>Código</th><th>Producto</th><th>Color</th><th>Talla</th>
      ${kardexHeaders}
      ${countHeaders}
      ${trailingHeaders}
    </tr>
  `;

  const renderRow = (row, style = "") => {
    const kardexCells = showKardex
      ? kardexHeaderList.map((col) => `<td class="num">${row[col.key] ?? 0}</td>`).join("")
      : "";
    const counts = includeVitrines
      ? COUNT_LOCATION_KEYS.map((k) => `<td class="num">${(row.counts || {})[k] ?? 0}</td>`).join("")
      : "";
    const trailing = includeVitrines
      ? `<td class="num bold">${row.total ?? 0}</td>
         <td class="num bold ${
           Number(row.diferencia || 0) === 0
             ? "dif-zero"
             : Number(row.diferencia) > 0
               ? "dif-ok"
               : "dif-bad"
         }">${escape(String(formatDiffValue(row.diferencia ?? 0)))}</td>
         <td>${Number(row.diferencia || 0) !== 0 ? escape(row.observation || "") : ""}</td>`
      : "";
    const absDiff = Math.abs(Number(row.diferencia || 0));
    const alertClass =
      includeVitrines && absDiff >= DIFF_ALERT_THRESHOLD
        ? Number(row.diferencia || 0) > 0
          ? "alert-row-surplus"
          : "alert-row"
        : "";
    return `<tr class="${alertClass}" style="${escape(style)}">
      <td>${escape(row.productCode || "")}</td>
      <td>${escape(row.productName || "")}</td>
      <td>${escape(row.colorName || "—")}</td>
      <td>${escape(row.sizeLabel || row.sizesSummary || "")}</td>
      ${kardexCells}
      ${counts}
      ${trailing}
    </tr>`;
  };

  let tbodyHtml = "";
  (prepared.categories || []).forEach((cat) => {
    tbodyHtml += `<tr class="cat-header"><td colspan="${colSpan}">${escape(cat.categoryName || "Sin categoría")}</td></tr>`;
    (cat.rows || []).forEach((row) => {
      tbodyHtml += renderRow(row);
    });
    if (cat.subtotal) {
      tbodyHtml += renderRow(
        {
          ...cat.subtotal,
          productCode: "",
          productName: formatConteoSubtotalLabel(cat.categoryName),
          colorName: "",
          sizesSummary: "",
        },
        "font-weight:600;background:#f9fafb"
      );
    }
  });

  const tg = prepared.totalGeneral;
  const tfootHtml =
    includeVitrines && tg
      ? `<tfoot>
    <tr class="total-general">
      <td colspan="4">TOTAL GENERAL</td>
      ${showKardex ? kardexHeaderList.map((col) => `<td class="num">${tg[col.key] ?? 0}</td>`).join("") : ""}
      ${COUNT_LOCATION_KEYS.map((k) => `<td class="num">${(tg.counts || {})[k] ?? 0}</td>`).join("")}
      <td class="num bold">${tg.total ?? 0}</td>
      <td class="num bold ${
        Number(tg.diferencia || 0) === 0
          ? "dif-zero"
          : Number(tg.diferencia) > 0
            ? "dif-ok"
            : "dif-bad"
      }">${escape(String(formatDiffValue(tg.diferencia ?? 0)))}</td>
    </tr>
  </tfoot>`
      : "";

  win.document.write(`<!doctype html><html><head>
    <meta charset="utf-8"/>
    <title>${subcount ? "Inventario al corte" : "Conteo Físico"} — ${escape(prepared.locationName || "")}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 12px; color: #111; }
      h1 { font-size: 15px; margin: 0 0 8px; }
      .meta-grid { display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: 11px; flex: 1; }
      .meta-grid div span { display: block; color: #666; font-size: 10px; }
      .meta-grid div.full { width: 100%; }
      .header-row { display: flex; flex-wrap: wrap; gap: 16px; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
      .color-legend { display: flex; gap: 18px; font-size: 10px; }
      .legend-col { display: flex; flex-direction: column; gap: 3px; }
      .legend-item { display: flex; align-items: center; gap: 6px; min-width: 150px; }
      .legend-item i { width: 22px; height: 12px; border: 1px solid #9ca3af; display: inline-block; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { border: 1px solid #d1d5db; padding: 3px 5px; }
      th { background: #f3f4f6; font-weight: 700; text-align: center; }
      .num { text-align: right; }
      .bold { font-weight: 700; }
      .cat-header td { background: #e5e7eb; font-weight: 700; font-size: 10px; }
      .total-general td { background: #1f2937; color: #fff; font-weight: 700; }
      .dif-bad { color: #dc2626; }
      .dif-ok { color: #16a34a; }
      .dif-zero { color: #111827; }
      .alert-row td { background: #fef2f2; }
      .alert-row-surplus td { background: #f0fdf4; }
      @media print { body { margin: 6mm; } }
    </style>
  </head><body>
    <h1>${subcount ? "Inventario sistema al corte (sin vitrinas)" : "Conteo Físico de Inventario"} — ${escape(prepared.locationName || prepared.locationCode || "")}</h1>
    ${headerMeta}
    <table>
      <thead>${theadHtml}</thead>
      <tbody>${tbodyHtml || `<tr><td colspan="${colSpan}" style="text-align:center">Sin datos</td></tr>`}</tbody>
      ${tfootHtml}
    </table>
    <script>window.onload = function(){ window.print(); };</script>
  </body></html>`);
  win.document.close();
}
