import * as XLSX from "xlsx-js-style";
import { formatDateGt, formatDateTimeGt, formatNowGt, getSaleYmdGuatemala } from "./dateTimeHelper";

const getSaleInternalNumber = (sale) =>
  sale?.internalNumber || sale?.invoice?.internalNumber || "";

const thinBorder = {
  top: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } },
};

const thickBottom = {
  ...thinBorder,
  bottom: { style: "medium", color: { rgb: "000000" } },
};

const thickTop = {
  ...thinBorder,
  top: { style: "medium", color: { rgb: "000000" } },
};

const doubleBottom = {
  ...thinBorder,
  bottom: { style: "double", color: { rgb: "000000" } },
};

const boldFont = { bold: true, name: "Calibri", sz: 11 };
const normalFont = { name: "Calibri", sz: 11 };
const titleFont = { bold: true, name: "Calibri", sz: 14 };

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
  // formatDateGt returns dd/mm/yyyy; example uses dd-mm-yyyy
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
  const when = formatDateTimeGt(new Date()).replace(/\//g, "-");
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
  const efectivo = method === "EFECTIVO" || method === "MIXTO" || cashAmt > 0;
  const pos = method === "TARJETA" || method === "MIXTO" || cardAmt > 0;
  // Si solo dice TARJETA, no marcar efectivo; si solo EFECTIVO, no marcar POS
  if (method === "EFECTIVO") return { efectivo: "X", pos: "" };
  if (method === "TARJETA") return { efectivo: "", pos: "X" };
  if (method === "MIXTO") return { efectivo: "X", pos: "X" };
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

const buildReportRows = (sales) => {
  const rows = [];
  let totalQty = 0;
  let totalUnit = 0;
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
      const lineTotal = Number(item.lineTotal != null ? item.lineTotal : qty * unit);
      totalQty += qty;
      totalUnit += unit;
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
    vUnidad: totalUnit,
    total: totalAmount,
    efectivo: "",
    pos: "",
  });

  return rows;
};

const colLetter = (index) => XLSX.utils.encode_col(index);

const styleCell = (ws, r, c, style) => {
  const addr = `${colLetter(c)}${r + 1}`;
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  ws[addr].s = { ...(ws[addr].s || {}), ...style };
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
    ["* Nombre", "", "Descripcion", "Cantidad", "V.Unidad", "Total", "Efectivo", "POS"],
  ];

  reportRows.forEach((row) => {
    if (row.type === "invoice") {
      aoa.push([row.nombre, "", "", "", "", "", "", ""]);
      return;
    }
    if (row.type === "totals") {
      aoa.push([
        row.nombre,
        "",
        "",
        row.cantidad,
        row.vUnidad,
        row.total,
        "",
        "",
      ]);
      return;
    }
    aoa.push([
      row.nombre,
      "",
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
    { s: { r: 0, c: 0 }, e: { r: 0, c: 7 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 7 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 7 } },
  ];
  ws["!cols"] = [
    { wch: 42 },
    { wch: 3 },
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 8 },
  ];

  // Header meta
  for (let r = 0; r <= 3; r += 1) {
    styleCell(ws, r, 0, { font: r === 0 ? titleFont : boldFont });
  }

  // Column headers row (index 5)
  for (let c = 0; c < 8; c += 1) {
    styleCell(ws, 5, c, { font: boldFont, border: thickBottom, alignment: { horizontal: c >= 3 ? "right" : "left" } });
  }

  let excelRow = 6;
  reportRows.forEach((row) => {
    if (row.type === "invoice") {
      ws[`A${excelRow + 1}`] = { t: "s", v: row.nombre, s: { font: boldFont, border: thickTop } };
      for (let c = 1; c < 8; c += 1) {
        styleCell(ws, excelRow, c, { border: thickTop });
      }
      // also thick bottom on invoice header
      for (let c = 0; c < 8; c += 1) {
        const addr = `${colLetter(c)}${excelRow + 1}`;
        ws[addr] = ws[addr] || { t: "s", v: "" };
        ws[addr].s = {
          ...(ws[addr].s || {}),
          font: boldFont,
          border: {
            top: { style: "medium", color: { rgb: "000000" } },
            bottom: { style: "medium", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        };
      }
    } else if (row.type === "item") {
      const values = [
        row.nombre,
        "",
        row.descripcion,
        row.cantidad,
        row.vUnidad,
        row.total,
        row.efectivo,
        row.pos,
      ];
      values.forEach((val, c) => {
        const addr = `${colLetter(c)}${excelRow + 1}`;
        if (c === 3) {
          ws[addr] = { t: "n", v: Number(val) || 0, s: { font: normalFont, alignment: { horizontal: "right" } } };
        } else if (c === 4 || c === 5) {
          ws[addr] = {
            t: "n",
            v: Number(val) || 0,
            z: moneyFmt,
            s: { font: normalFont, alignment: { horizontal: "right" }, numFmt: moneyFmt },
          };
        } else {
          ws[addr] = {
            t: "s",
            v: val == null ? "" : String(val),
            s: { font: normalFont, alignment: { horizontal: c >= 6 ? "center" : "left" } },
          };
        }
      });
    } else if (row.type === "totals") {
      const values = [row.nombre, "", "", row.cantidad, row.vUnidad, row.total, "", ""];
      values.forEach((val, c) => {
        const addr = `${colLetter(c)}${excelRow + 1}`;
        if (c === 3) {
          ws[addr] = {
            t: "n",
            v: Number(val) || 0,
            s: { font: boldFont, alignment: { horizontal: "right" }, border: { ...thickTop, ...doubleBottom } },
          };
        } else if (c === 4 || c === 5) {
          ws[addr] = {
            t: "n",
            v: Number(val) || 0,
            z: moneyFmt,
            s: {
              font: boldFont,
              alignment: { horizontal: "right" },
              numFmt: moneyFmt,
              border: {
                top: { style: "medium", color: { rgb: "000000" } },
                bottom: { style: "double", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } },
              },
            },
          };
        } else {
          ws[addr] = {
            t: "s",
            v: val == null ? "" : String(val),
            s: {
              font: boldFont,
              border: {
                top: { style: "medium", color: { rgb: "000000" } },
                bottom: { style: "double", color: { rgb: "000000" } },
                left: { style: "thin", color: { rgb: "000000" } },
                right: { style: "thin", color: { rgb: "000000" } },
              },
            },
          };
        }
      });
    }
    excelRow += 1;
  });

  ws["!ref"] = `A1:H${excelRow}`;

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
    .map((row) => {
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
      return `<tr>
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
    @page { size: letter landscape; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; margin: 12px; }
    .title { font-size: 16px; font-weight: 700; margin: 0 0 4px; }
    .meta { font-size: 12px; font-weight: 700; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th {
      text-align: left;
      border-bottom: 2px solid #000;
      padding: 4px 6px;
      font-weight: 700;
    }
    th.num, td.num { text-align: right; }
    td.center { text-align: center; }
    td { padding: 3px 6px; vertical-align: top; }
    tr.invoice-row td {
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding-top: 6px;
      padding-bottom: 6px;
    }
    tr.totals-row td {
      border-top: 2px solid #000;
      border-bottom: 3px double #000;
      font-weight: 700;
      padding-top: 6px;
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

// Keep helper used elsewhere
export const formatNowGtExport = formatNowGt;
