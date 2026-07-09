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
const normalFont = { ...fontBase };

const moneyFmt = '"Q"#,##0.00';

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

const formatGeneratedByLine = (generatedByName) => {
  const name = String(generatedByName || "").trim().toUpperCase() || "USUARIO";
  // Ejemplo legado: "ROBERTO EL 09-07-2026 14:48"
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

/**
 * Filas del reporte. En Totales, V.Unidad y Total llevan el mismo gran total
 * (como el Excel legado).
 */
const buildReportRows = (sales) => {
  const rows = [];
  let totalQty = 0;
  let totalAmount = 0;

  activeSales(sales).forEach((sale) => {
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

  rows.push({
    type: "totals",
    nombre: "Totales",
    descripcion: "",
    cantidad: totalQty,
    vUnidad: totalAmount,
    total: totalAmount,
    efectivo: "",
    pos: "",
  });

  return rows;
};

const COLS = 7; // A..G: Nombre, Descripcion, Cantidad, V.Unidad, Total, Efectivo, POS

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

export const exportKioskSalesToExcel = ({
  sales,
  startDate,
  endDate,
  kioskName,
  kioskCode,
  generatedByName,
}) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  const reportRows = buildReportRows(sales);

  const aoa = [
    ["REPORTE DE VENTAS"],
    [`BODEGA: ${kioskName || "—"}`],
    [`FECHA: ${formatPeriodLabelExact(from, to)}`],
    [`GENERADO POR: ${formatGeneratedByLine(generatedByName)}`],
    [],
    ["* Nombre", "Descripcion", "Cantidad", "V.Unidad", "Total", "Efectivo", "POS"],
  ];

  reportRows.forEach((row) => {
    if (row.type === "invoice") {
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
  ws["!merges"] = [
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

  // Meta header (sin bordes)
  for (let r = 0; r <= 3; r += 1) {
    setCell(ws, r, 0, {
      t: "s",
      v: aoa[r][0],
      s: { font: r === 0 ? titleFont : boldFont, alignment: { horizontal: "left" } },
    });
  }

  // Encabezados de columna: línea gruesa arriba y abajo
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

  let excelRow = 6;
  reportRows.forEach((row, idx) => {
    const next = reportRows[idx + 1];
    const isLastItemBeforeInvoice = row.type === "item" && next && next.type === "invoice";
    const isLastItemBeforeTotals = row.type === "item" && next && next.type === "totals";

    if (row.type === "invoice") {
      setCell(ws, excelRow, 0, {
        t: "s",
        v: row.nombre,
        s: {
          font: boldFont,
          alignment: { horizontal: "left" },
          border: hBorder("medium", undefined),
        },
      });
      // Línea gruesa solo sobre Nombre → V.Unidad (como el legado)
      applyHBorderRow(ws, excelRow, "medium", undefined, 0, 3);
      for (let c = 4; c < COLS; c += 1) {
        setCell(ws, excelRow, c, { t: "s", v: "", s: { font: normalFont } });
      }
    } else if (row.type === "item") {
      const bottom = isLastItemBeforeInvoice || isLastItemBeforeTotals ? "medium" : undefined;
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
        { t: "s", v: "Totales", align: "left" },
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

  ws["!ref"] = `A1:G${excelRow}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "REPORTE DE VENTAS");
  const rangeLabel = from === to ? from : `${from || "inicio"}_${to || "fin"}`;
  const kiosk = kioskCode ? `_${kioskCode}` : "";
  XLSX.writeFile(wb, `REPORTE_DE_VENTAS_${rangeLabel}${kiosk}.xlsx`);
};

export const exportKioskSalesToPdf = ({
  sales,
  startDate,
  endDate,
  kioskName,
  generatedByName,
}) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  const reportRows = buildReportRows(sales);
  const escape = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const bodyHtml = reportRows
    .map((row, idx) => {
      const next = reportRows[idx + 1];
      const sepBeforeNextInvoice = row.type === "item" && next && next.type === "invoice";
      const sepBeforeTotals = row.type === "item" && next && next.type === "totals";
      const itemClass =
        sepBeforeNextInvoice || sepBeforeTotals ? ' class="item-sep"' : "";

      if (row.type === "invoice") {
        return `<tr class="invoice-row"><td colspan="7"><strong>${escape(row.nombre)}</strong></td></tr>`;
      }
      if (row.type === "totals") {
        return `<tr class="totals-row">
          <td><strong>Totales</strong></td>
          <td></td>
          <td class="num"><strong>${escape(formatQtyPlain(row.cantidad))}</strong></td>
          <td class="num"><strong>${escape(formatMoneyQ(row.vUnidad))}</strong></td>
          <td class="num"><strong>${escape(formatMoneyQ(row.total))}</strong></td>
          <td></td>
          <td></td>
        </tr>`;
      }
      return `<tr${itemClass}>
        <td>${escape(row.nombre)}</td>
        <td>${escape(row.descripcion)}</td>
        <td class="num">${escape(formatQtyPlain(row.cantidad))}</td>
        <td class="num">${escape(formatMoneyQ(row.vUnidad))}</td>
        <td class="num">${escape(formatMoneyQ(row.total))}</td>
        <td class="center">${escape(row.efectivo)}</td>
        <td class="center">${escape(row.pos)}</td>
      </tr>`;
    })
    .join("");

  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>REPORTE DE VENTAS</title>
  <style>
    @page { size: letter landscape; margin: 12mm; }
    body {
      font-family: Calibri, Arial, Helvetica, sans-serif;
      font-size: 11px;
      color: #000;
      margin: 12px;
    }
    .title { font-size: 15px; font-weight: 700; margin: 0 0 2px; }
    .meta { font-size: 12px; font-weight: 700; margin: 1px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
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
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="title">REPORTE DE VENTAS</div>
  <div class="meta">BODEGA: ${escape(kioskName || "—")}</div>
  <div class="meta">FECHA: ${escape(formatPeriodLabelExact(from, to))}</div>
  <div class="meta">GENERADO POR: ${escape(formatGeneratedByLine(generatedByName))}</div>
  <table>
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
    </thead>
    <tbody>
      ${bodyHtml || `<tr><td colspan="7">Sin ventas</td></tr>`}
    </tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
};

export const formatNowGtExport = formatNowGt;
