import * as XLSX from "xlsx-js-style";
import { formatDateGt, formatDateTimeGt, formatNowGt, getSaleYmdGuatemala } from "./dateTimeHelper";

const getSaleInternalNumber = (sale) =>
  sale?.internalNumber || sale?.invoice?.internalNumber || "";

/** Solo líneas horizontales (como el reporte legado). */
const hBorder = (top, bottom) => ({
  top: top ? { style: top, color: { rgb: "000000" } } : undefined,
  bottom: bottom ? { style: bottom, color: { rgb: "000000" } } : undefined,
});

const fontBase = { name: "Calibri", sz: 11, color: { rgb: "000000" } };
const boldFont = { ...fontBase, bold: true };
const titleFont = { ...fontBase, bold: true, sz: 14 };
const dayFont = { ...fontBase, bold: true, sz: 12 };
const normalFont = { ...fontBase };

const moneyFmt = '"Q"#,##0.00';
const COLS = 7;

const normalizeRange = (startDate, endDate) => {
  let from = startDate || "";
  let to = endDate || "";
  if (from && !to) to = from;
  if (!from && to) from = to;
  if (from && to && from > to) {
    return { startDate: to, endDate: from };
  }
  return { startDate: from, endDate: to };
};

const formatPeriodDateTime = (ymd, endOfDay = false) => {
  if (!ymd) return "";
  const dateLabel = formatDateGt(ymd);
  if (!dateLabel || dateLabel === "-") return ymd;
  const dashed = String(dateLabel).replace(/\//g, "-");
  return `${dashed} ${endOfDay ? "23:59" : "00:00"}`;
};

const formatPeriodLabelExact = (startDate, endDate) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  if (!from && !to) return "Sin período";
  return `${formatPeriodDateTime(from, false)} AL ${formatPeriodDateTime(to || from, true)}`;
};

const formatDayLabel = (ymd) => {
  if (!ymd) return "";
  const dateLabel = formatDateGt(ymd);
  if (!dateLabel || dateLabel === "-") return ymd;
  return String(dateLabel).replace(/\//g, "-");
};

const formatGeneratedByLine = (generatedByName) => {
  const name = String(generatedByName || "").trim().toUpperCase() || "USUARIO";
  const when = formatDateTimeGt(new Date())
    .replace(/\//g, "-")
    .replace(/,\s*/g, " ")
    .replace(/\s*a\.?\s*m\.?/gi, "")
    .replace(/\s*p\.?\s*m\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${name} EL ${when}`;
};

const formatQtyPlain = (value) => {
  const n = Number(value || 0);
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
};

const formatMoneyQ = (value) => {
  const n = Number(value || 0);
  return `Q${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const resolveItemName = (item) => {
  const name = String(item?.productName || "Producto").trim();
  return name.startsWith("*") ? name : `* ${name}`;
};

const resolveItemDescription = (item) => {
  if (item?.categoryName) return String(item.categoryName).trim();
  if (item?.colorName) return String(item.colorName).trim();
  return "";
};

const normalizePayment = (sale) => String(sale?.paymentMethod || "").toUpperCase().trim();

const paymentMarks = (sale) => {
  const method = normalizePayment(sale);
  const cashAmt = Number(sale?.cashAmount || 0);
  const cardAmt = Number(sale?.cardAmount || 0);
  if (method === "EFECTIVO") return { efectivo: "X", pos: "" };
  if (method === "TARJETA") return { efectivo: "", pos: "X" };
  if (method === "MIXTO") return { efectivo: "X", pos: "X" };
  const efectivo = cashAmt > 0;
  const pos = cardAmt > 0;
  return { efectivo: efectivo ? "X" : "", pos: pos ? "X" : "" };
};

const activeSales = (sales) =>
  (sales || []).filter((sale) => String(sale.status || "").toUpperCase() !== "VOID");

/** Ordena A45-10 < A45-13 < A45-100 (prefijo + número). */
const compareInternalNumbers = (a, b) => {
  const left = String(getSaleInternalNumber(a) || a?.internalNumber || "").trim();
  const right = String(getSaleInternalNumber(b) || b?.internalNumber || "").trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;

  const parseParts = (value) => {
    const match = value.match(/^(.*?)(\d+)$/);
    if (!match) return { prefix: value.toUpperCase(), num: null };
    return { prefix: match[1].toUpperCase(), num: Number(match[2]) };
  };

  const pa = parseParts(left);
  const pb = parseParts(right);
  const prefixCmp = pa.prefix.localeCompare(pb.prefix, "es", { sensitivity: "base" });
  if (prefixCmp !== 0) return prefixCmp;
  if (pa.num != null && pb.num != null && pa.num !== pb.num) return pa.num - pb.num;
  return left.localeCompare(right, "es", { numeric: true, sensitivity: "base" });
};

const sortSalesByInternalNumber = (sales) =>
  [...(sales || [])].sort(compareInternalNumbers);

export const formatSaleItemLine = (item) => {
  const qty = Number(item?.quantity || 0);
  const qtyLabel = Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, "");
  const code = item?.productCode ? `${item.productCode} ` : "";
  const name = item?.productName || "Producto";
  const color = item?.colorName ? ` (${item.colorName})` : "";
  return `${qtyLabel}x ${code}${name}${color}`.trim();
};

export const formatSaleItemsSummary = (sale, maxLines = 4) => {
  const items = sale?.items || [];
  if (!items.length) return "";
  const lines = items.map(formatSaleItemLine);
  if (lines.length <= maxLines) return lines.join("; ");
  return `${lines.slice(0, maxLines).join("; ")} (+${lines.length - maxLines} más)`;
};

export const filterSalesByDateRange = (sales, startDate, endDate) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  if (!from || !to) return sales || [];
  return (sales || []).filter((sale) => {
    const ymd = getSaleYmdGuatemala(sale);
    return ymd && ymd >= from && ymd <= to;
  });
};

export const buildKioskReportSummary = (sales) => {
  const rows = activeSales(sales);
  const salesCount = rows.length;
  const totalItems = rows.reduce((sum, sale) => sum + Number(sale.totalItems || 0), 0);
  const totalAmount = rows.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const averageTicket = salesCount > 0 ? totalAmount / salesCount : 0;
  return { salesCount, totalItems, totalAmount, averageTicket };
};

/** Agrupa ventas activas por día (YYYY-MM-DD); dentro de cada día por internalNumber ASC. */
export const groupSalesByDay = (sales) => {
  const map = new Map();
  activeSales(sales).forEach((sale) => {
    const ymd = getSaleYmdGuatemala(sale) || "sin-fecha";
    if (!map.has(ymd)) map.set(ymd, []);
    map.get(ymd).push(sale);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([ymd, daySales]) => ({
      ymd,
      sales: sortSalesByInternalNumber(daySales),
    }));
};

/**
 * Filas del reporte. En Totales, V.Unidad y Total llevan el mismo gran total.
 * @param {object} [options]
 * @param {boolean} [options.includeTotals=true]
 * @param {string} [options.dayYmd] si se indica, inserta encabezado de fecha del día
 * @param {boolean} [options.showDayHeader=true]
 */
const buildReportRows = (sales, options = {}) => {
  const { includeTotals = true, dayYmd = null, showDayHeader = true } = options;
  const rows = [];
  let totalQty = 0;
  let totalAmount = 0;

  if (dayYmd && showDayHeader) {
    rows.push({
      type: "day",
      nombre: `FECHA: ${formatPeriodLabelExact(dayYmd, dayYmd)}`,
      descripcion: "",
      cantidad: "",
      vUnidad: "",
      total: "",
      efectivo: "",
      pos: "",
    });
  }

  sortSalesByInternalNumber(activeSales(sales)).forEach((sale) => {
    const invoiceNo = getSaleInternalNumber(sale) || sale.internalNumber || "—";
    const marks = paymentMarks(sale);
    rows.push({
      type: "invoice",
      nombre: `FACTURA NO. ${invoiceNo}`,
      descripcion: "",
      cantidad: "",
      vUnidad: "",
      total: "",
      efectivo: "",
      pos: "",
    });

    (sale.items || []).forEach((item) => {
      const qty = Number(item.quantity || 0);
      const unit = Number(item.unitPrice || 0);
      const lineTotal = qty * unit;
      totalQty += qty;
      totalAmount += lineTotal;
      rows.push({
        type: "item",
        nombre: resolveItemName(item),
        descripcion: resolveItemDescription(item),
        cantidad: qty,
        vUnidad: unit,
        total: lineTotal,
        efectivo: marks.efectivo,
        pos: marks.pos,
      });
    });
  });

  if (includeTotals) {
    rows.push({
      type: "totals",
      nombre: dayYmd ? `Totales ${formatDayLabel(dayYmd)}` : "Totales",
      descripcion: "",
      cantidad: totalQty,
      vUnidad: totalAmount,
      total: totalAmount,
      efectivo: "",
      pos: "",
    });
  }

  return rows;
};

/** Un archivo: cada día empieza con FECHA: ... y sus facturas ordenadas. */
const buildConsolidatedReportRows = (sales) => {
  const days = groupSalesByDay(sales);
  if (!days.length) {
    return buildReportRows([]);
  }
  const rows = [];
  days.forEach((day, idx) => {
    if (idx > 0) {
      rows.push({
        type: "spacer",
        nombre: "",
        descripcion: "",
        cantidad: "",
        vUnidad: "",
        total: "",
        efectivo: "",
        pos: "",
      });
    }
    rows.push(
      ...buildReportRows(day.sales, {
        dayYmd: day.ymd,
        showDayHeader: true,
        includeTotals: true,
      })
    );
  });
  return rows;
};

const colLetter = (index) => XLSX.utils.encode_col(index);

const setCell = (ws, r, c, cell) => {
  ws[`${colLetter(c)}${r + 1}`] = cell;
};

const applyHBorderRow = (ws, r, top, bottom, fromC = 0, toC = COLS - 1) => {
  for (let c = fromC; c <= toC; c += 1) {
    const addr = `${colLetter(c)}${r + 1}`;
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    const prev = ws[addr].s || {};
    ws[addr].s = {
      ...prev,
      border: {
        ...(prev.border || {}),
        ...hBorder(top, bottom),
      },
    };
  }
};

const styleReportRowsOnSheet = (ws, reportRows, startExcelRow, merges = []) => {
  let excelRow = startExcelRow;
  reportRows.forEach((row, idx) => {
    const next = reportRows[idx + 1];
    const isLastItemBeforeInvoice = row.type === "item" && next && next.type === "invoice";
    const isLastItemBeforeTotals = row.type === "item" && next && next.type === "totals";
    const isLastItemBeforeDay = row.type === "item" && next && (next.type === "day" || next.type === "spacer");

    if (row.type === "spacer") {
      for (let c = 0; c < COLS; c += 1) {
        setCell(ws, excelRow, c, { t: "s", v: "", s: { font: normalFont } });
      }
    } else if (row.type === "day") {
      setCell(ws, excelRow, 0, {
        t: "s",
        v: row.nombre,
        s: {
          font: dayFont,
          alignment: { horizontal: "left", vertical: "center" },
          border: hBorder("medium", "medium"),
        },
      });
      for (let c = 1; c < COLS; c += 1) {
        setCell(ws, excelRow, c, {
          t: "s",
          v: "",
          s: { font: dayFont, border: hBorder("medium", "medium") },
        });
      }
      merges.push({ s: { r: excelRow, c: 0 }, e: { r: excelRow, c: COLS - 1 } });
    } else if (row.type === "invoice") {
      setCell(ws, excelRow, 0, {
        t: "s",
        v: row.nombre,
        s: {
          font: boldFont,
          alignment: { horizontal: "left" },
          border: hBorder("medium", undefined),
        },
      });
      applyHBorderRow(ws, excelRow, "medium", undefined, 0, 3);
      for (let c = 4; c < COLS; c += 1) {
        setCell(ws, excelRow, c, { t: "s", v: "", s: { font: normalFont } });
      }
    } else if (row.type === "item") {
      const bottom =
        isLastItemBeforeInvoice || isLastItemBeforeTotals || isLastItemBeforeDay
          ? "medium"
          : undefined;
      const cells = [
        { t: "s", v: row.nombre, align: "left" },
        { t: "s", v: row.descripcion || "", align: "left" },
        { t: "n", v: Number(row.cantidad) || 0, align: "right" },
        { t: "n", v: Number(row.vUnidad) || 0, align: "right", money: true },
        { t: "n", v: Number(row.total) || 0, align: "right", money: true },
        { t: "s", v: row.efectivo || "", align: "center" },
        { t: "s", v: row.pos || "", align: "center" },
      ];
      cells.forEach((cell, c) => {
        const borderBottom = bottom && c <= 3 ? "medium" : undefined;
        setCell(ws, excelRow, c, {
          t: cell.t,
          v: cell.v,
          z: cell.money ? moneyFmt : undefined,
          s: {
            font: normalFont,
            alignment: { horizontal: cell.align },
            numFmt: cell.money ? moneyFmt : undefined,
            border: borderBottom ? hBorder(undefined, borderBottom) : undefined,
          },
        });
      });
    } else if (row.type === "totals") {
      const values = [
        { t: "s", v: row.nombre || "Totales", align: "left" },
        { t: "s", v: "", align: "left" },
        { t: "n", v: Number(row.cantidad) || 0, align: "right" },
        { t: "n", v: Number(row.vUnidad) || 0, align: "right", money: true },
        { t: "n", v: Number(row.total) || 0, align: "right", money: true },
        { t: "s", v: "", align: "center" },
        { t: "s", v: "", align: "center" },
      ];
      values.forEach((cell, c) => {
        setCell(ws, excelRow, c, {
          t: cell.t,
          v: cell.v,
          z: cell.money ? moneyFmt : undefined,
          s: {
            font: boldFont,
            alignment: { horizontal: cell.align },
            numFmt: cell.money ? moneyFmt : undefined,
            border: hBorder("medium", "double"),
          },
        });
      });
    }
    excelRow += 1;
  });
  return excelRow;
};

const buildSalesWorksheet = ({
  sales,
  startDate,
  endDate,
  kioskName,
  generatedByName,
  mode = "single",
  dayYmd = null,
}) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  const periodFrom = dayYmd || from;
  const periodTo = dayYmd || to;
  const reportRows =
    mode === "consolidated"
      ? buildConsolidatedReportRows(sales)
      : buildReportRows(sortSalesByInternalNumber(activeSales(sales)), {
          dayYmd: dayYmd || null,
          showDayHeader: Boolean(dayYmd),
        });

  const periodLabel =
    mode === "consolidated" && !dayYmd
      ? `${formatPeriodLabelExact(from, to)} (CONSOLIDADO POR DÍA)`
      : formatPeriodLabelExact(periodFrom, periodTo);

  const aoa = [
    ["REPORTE DE VENTAS"],
    [`BODEGA: ${kioskName || "—"}`],
    [`PERÍODO: ${periodLabel}`],
    [`GENERADO POR: ${formatGeneratedByLine(generatedByName)}`],
    [],
    ["* Nombre", "Descripcion", "Cantidad", "V.Unidad", "Total", "Efectivo", "POS"],
  ];

  reportRows.forEach((row) => {
    if (row.type === "spacer") {
      aoa.push(["", "", "", "", "", "", ""]);
      return;
    }
    if (row.type === "day" || row.type === "invoice") {
      aoa.push([row.nombre, "", "", "", "", "", ""]);
      return;
    }
    if (row.type === "totals") {
      aoa.push([row.nombre, "", row.cantidad, row.vUnidad, row.total, "", ""]);
      return;
    }
    aoa.push([
      row.nombre,
      row.descripcion,
      row.cantidad,
      row.vUnidad,
      row.total,
      row.efectivo,
      row.pos,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: COLS - 1 } },
  ];
  ws["!cols"] = [
    { wch: 36 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
  ];

  for (let r = 0; r <= 3; r += 1) {
    setCell(ws, r, 0, {
      t: "s",
      v: aoa[r][0],
      s: { font: r === 0 ? titleFont : boldFont, alignment: { horizontal: "left" } },
    });
  }

  const headerLabels = aoa[5];
  headerLabels.forEach((label, c) => {
    setCell(ws, 5, c, {
      t: "s",
      v: label,
      s: {
        font: boldFont,
        alignment: {
          horizontal: c === 2 || c === 3 || c === 4 ? "right" : c >= 5 ? "center" : "left",
        },
        border: hBorder("medium", "medium"),
      },
    });
  });

  const lastRow = styleReportRowsOnSheet(ws, reportRows, 6, merges);
  ws["!merges"] = merges;
  ws["!ref"] = `A1:G${lastRow}`;
  return ws;
};

const safeSheetName = (ymd) => {
  const label = formatDayLabel(ymd) || ymd || "DIA";
  return String(label).replace(/[\\/?*[\]]/g, "-").slice(0, 31);
};

/**
 * @param {"single"|"byDay"|"consolidated"} [mode]
 * - single: un bloque (comportamiento actual)
 * - byDay: una hoja Excel por día
 * - consolidated: un solo archivo con "DIA: ..." sobre cada bloque
 */
export const exportKioskSalesToExcel = ({
  sales,
  startDate,
  endDate,
  kioskName,
  kioskCode,
  generatedByName,
  mode = "single",
}) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  const days = groupSalesByDay(sales);
  const wb = XLSX.utils.book_new();
  const rangeLabel = from === to ? from : `${from || "inicio"}_${to || "fin"}`;
  const kiosk = kioskCode ? `_${kioskCode}` : "";
  // Con rango: respetar consolidado / por día. Un solo día: igual ordenado por internalNumber.
  const exportMode =
    mode === "byDay" || mode === "consolidated"
      ? mode
      : days.length > 1
        ? "consolidated"
        : "single";

  if (exportMode === "byDay") {
    days.forEach((day) => {
      const ws = buildSalesWorksheet({
        sales: day.sales,
        startDate: day.ymd,
        endDate: day.ymd,
        kioskName,
        generatedByName,
        mode: "single",
        dayYmd: day.ymd,
      });
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(day.ymd));
    });
    XLSX.writeFile(wb, `REPORTE_DE_VENTAS_POR_DIA_${rangeLabel}${kiosk}.xlsx`);
    return;
  }

  const ws = buildSalesWorksheet({
    sales,
    startDate: from,
    endDate: to,
    kioskName,
    generatedByName,
    mode: exportMode === "consolidated" ? "consolidated" : "single",
    dayYmd: exportMode === "single" && days.length === 1 ? days[0].ymd : null,
  });
  XLSX.utils.book_append_sheet(wb, ws, "REPORTE DE VENTAS");
  const suffix = exportMode === "consolidated" ? "_CONSOLIDADO" : "";
  XLSX.writeFile(wb, `REPORTE_DE_VENTAS${suffix}_${rangeLabel}${kiosk}.xlsx`);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const buildReportRowsHtml = (reportRows) =>
  reportRows
    .map((row, idx) => {
      const next = reportRows[idx + 1];
      const sepBeforeNextInvoice = row.type === "item" && next && next.type === "invoice";
      const sepBeforeTotals = row.type === "item" && next && next.type === "totals";
      const sepBeforeDay = row.type === "item" && next && next.type === "day";
      const itemClass =
        sepBeforeNextInvoice || sepBeforeTotals || sepBeforeDay ? ' class="item-sep"' : "";

      if (row.type === "spacer") {
        return `<tr class="spacer-row"><td colspan="7">&nbsp;</td></tr>`;
      }
      if (row.type === "day") {
        return `<tr class="day-row"><td colspan="7"><strong>${escapeHtml(row.nombre)}</strong></td></tr>`;
      }
      if (row.type === "invoice") {
        return `<tr class="invoice-row"><td colspan="7"><strong>${escapeHtml(row.nombre)}</strong></td></tr>`;
      }
      if (row.type === "totals") {
        return `<tr class="totals-row">
          <td><strong>${escapeHtml(row.nombre || "Totales")}</strong></td>
          <td></td>
          <td class="num"><strong>${escapeHtml(formatQtyPlain(row.cantidad))}</strong></td>
          <td class="num"><strong>${escapeHtml(formatMoneyQ(row.vUnidad))}</strong></td>
          <td class="num"><strong>${escapeHtml(formatMoneyQ(row.total))}</strong></td>
          <td></td>
          <td></td>
        </tr>`;
      }
      return `<tr${itemClass}>
        <td>${escapeHtml(row.nombre)}</td>
        <td>${escapeHtml(row.descripcion)}</td>
        <td class="num">${escapeHtml(formatQtyPlain(row.cantidad))}</td>
        <td class="num">${escapeHtml(formatMoneyQ(row.vUnidad))}</td>
        <td class="num">${escapeHtml(formatMoneyQ(row.total))}</td>
        <td class="center">${escapeHtml(row.efectivo)}</td>
        <td class="center">${escapeHtml(row.pos)}</td>
      </tr>`;
    })
    .join("");

const reportStyles = `
  @page { size: letter landscape; margin: 12mm; }
  body {
    font-family: Calibri, Arial, Helvetica, sans-serif;
    font-size: 11px;
    color: #000;
    margin: 12px;
  }
  .title { font-size: 15px; font-weight: 700; margin: 0 0 2px; }
  .meta { font-size: 12px; font-weight: 700; margin: 1px 0; }
  .day-block { margin-top: 18px; page-break-inside: avoid; }
  .day-block:first-of-type { margin-top: 12px; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
  }
  th {
    text-align: left;
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    padding: 5px 6px;
    font-weight: 700;
  }
  th.num, td.num { text-align: right; }
  th.center, td.center { text-align: center; }
  td {
    padding: 2px 6px;
    vertical-align: top;
    border: none;
  }
  tr.day-row td {
    border-top: 2px solid #000;
    border-bottom: 2px solid #000;
    font-weight: 700;
    font-size: 12px;
    padding-top: 8px;
    padding-bottom: 6px;
  }
  tr.invoice-row td {
    border-top: 2px solid #000;
    font-weight: 700;
    padding-top: 7px;
    padding-bottom: 3px;
  }
  tr.item-sep td:nth-child(-n+4) {
    border-bottom: 2px solid #000;
    padding-bottom: 5px;
  }
  tr.totals-row td {
    border-top: 2px solid #000;
    border-bottom: 3px double #000;
    font-weight: 700;
    padding-top: 6px;
    padding-bottom: 4px;
  }
  tr.spacer-row td { height: 12px; }
  @media print {
    body { margin: 0; }
    .day-block { page-break-before: auto; }
  }
`;

const tableHeaderHtml = `
  <thead>
    <tr>
      <th>* Nombre</th>
      <th>Descripcion</th>
      <th class="num">Cantidad</th>
      <th class="num">V.Unidad</th>
      <th class="num">Total</th>
      <th class="center">Efectivo</th>
      <th class="center">POS</th>
    </tr>
  </thead>`;

export const exportKioskSalesToPdf = ({
  sales,
  startDate,
  endDate,
  kioskName,
  generatedByName,
  mode = "single",
}) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  const days = groupSalesByDay(sales);
  const exportMode =
    mode === "byDay" || mode === "consolidated"
      ? mode
      : days.length > 1
        ? "consolidated"
        : "single";

  let bodySections = "";
  if (exportMode === "byDay") {
    bodySections = days
      .map((day) => {
        const rows = buildReportRows(day.sales, { dayYmd: day.ymd, showDayHeader: true });
        return `<div class="day-block">
          <table>
            ${tableHeaderHtml}
            <tbody>${buildReportRowsHtml(rows)}</tbody>
          </table>
        </div>`;
      })
      .join("");
  } else {
    const reportRows =
      exportMode === "consolidated"
        ? buildConsolidatedReportRows(sales)
        : buildReportRows(sortSalesByInternalNumber(activeSales(sales)), {
            dayYmd: days[0]?.ymd || null,
            showDayHeader: Boolean(days[0]?.ymd),
          });
    bodySections = `<table>
      ${tableHeaderHtml}
      <tbody>${buildReportRowsHtml(reportRows) || `<tr><td colspan="7">Sin ventas</td></tr>`}</tbody>
    </table>`;
  }

  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>REPORTE DE VENTAS</title>
  <style>${reportStyles}</style>
</head>
<body>
  <div class="title">REPORTE DE VENTAS</div>
  <div class="meta">BODEGA: ${escapeHtml(kioskName || "—")}</div>
  <div class="meta">PERÍODO: ${escapeHtml(formatPeriodLabelExact(from, to))}${
    exportMode === "consolidated" ? " (CONSOLIDADO POR DÍA)" : ""
  }</div>
  <div class="meta">GENERADO POR: ${escapeHtml(formatGeneratedByLine(generatedByName))}</div>
  ${bodySections}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
};

export const formatNowGtExport = formatNowGt;
