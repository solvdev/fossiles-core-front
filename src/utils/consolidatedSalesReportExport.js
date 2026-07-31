import * as XLSX from "xlsx-js-style";
import { formatDateGt, formatDateTimeGt } from "./dateTimeHelper";

const COLS = 9;

const fontBase = { name: "Calibri", sz: 10, color: { rgb: "000000" } };
const boldFont = { ...fontBase, bold: true };
const titleFont = { ...fontBase, bold: true, sz: 13 };
const voidFont = { ...fontBase, bold: true, color: { rgb: "CC0000" } };
const headerFill = { fgColor: { rgb: "D9D9D9" } };
const moneyFmt = '"Q"#,##0.00';

const colLetter = (c) => XLSX.utils.encode_col(c);
const setCell = (ws, r, c, cell) => {
  ws[`${colLetter(c)}${r + 1}`] = cell;
};
const thinBorder = { style: "thin", color: { rgb: "000000" } };

const isVoided = (sale) => String(sale?.status || "").trim().toUpperCase() === "VOID";

const normalizeClientName = (sale) => {
  const taxId = String(sale?.customerTaxId || "CF").trim().toUpperCase();
  if (!taxId || taxId === "CF" || taxId === "C/F") return "CONSUMIDOR FINAL";
  return String(sale?.customerName || "").trim() || "CONSUMIDOR FINAL";
};

const getInvoiceNumber = (sale) => sale?.internalNumber || sale?.invoice?.internalNumber || "-";

export const formatGeneratedByLine = (generatedByName) => {
  const name = String(generatedByName || "").trim().toUpperCase() || "USUARIO";
  const when = formatDateTimeGt(new Date()).replace(",", "");
  return `${name} EL ${when}`;
};

export const formatConsolidatedPeriodLabel = (startDate, endDate) => {
  const from = startDate || endDate;
  const to = endDate || startDate;
  if (!from) return "Sin período";
  const fromLabel = formatDateGt(from).replace(/\//g, "-");
  const toLabel = formatDateGt(to).replace(/\//g, "-");
  return `${fromLabel} 00:00 AL ${toLabel} 23:59`;
};

/** Aplana cada venta a una fila del reporte, ya con Anulado/Total Facturado resueltos por estado. */
export const buildConsolidatedSalesRows = (sales) =>
  (sales || []).map((sale) => {
    const voided = isVoided(sale);
    const total = Number(sale?.totalAmount || 0);
    return {
      kiosco: sale?.kioskName || "-",
      noFactura: getInvoiceNumber(sale),
      fechaEmision: formatDateTimeGt(sale?.soldAt || sale?.saleDate).replace(",", ""),
      estado: voided ? "ANULADO" : "FACTURADO",
      cliente: normalizeClientName(sale),
      vendedor: sale?.soldByName || "-",
      anulado: voided ? total : 0,
      creditos: 0,
      totalFacturado: voided ? 0 : total,
      voided,
    };
  });

const sumRows = (rows, field) => rows.reduce((sum, row) => sum + Number(row[field] || 0), 0);

export const exportConsolidatedSalesToExcel = ({ sales, startDate, endDate, generatedByName }) => {
  const rows = buildConsolidatedSalesRows(sales);
  const totals = {
    anulado: sumRows(rows, "anulado"),
    creditos: sumRows(rows, "creditos"),
    totalFacturado: sumRows(rows, "totalFacturado"),
  };

  const aoa = [
    ["REPORTE DE VENTAS CONSOLIDADAS"],
    [`FECHA: ${formatConsolidatedPeriodLabel(startDate, endDate)}`],
    [`GENERADO POR: ${formatGeneratedByLine(generatedByName)}`],
    [],
    ["Kiosco", "No. Factura", "Fecha Emisión", "Estado Venta", "Cliente", "Vendedor", "Anulado", "Créditos", "Total Facturado"],
  ];
  rows.forEach((row) => {
    aoa.push([row.kiosco, row.noFactura, row.fechaEmision, row.estado, row.cliente, row.vendedor, row.anulado, row.creditos, row.totalFacturado]);
  });
  aoa.push(["TOTAL", "", "", "", "", "", totals.anulado, totals.creditos, totals.totalFacturado]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 12 }, { wch: 26 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
  ];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: COLS - 1 } },
  ];

  for (let r = 0; r <= 2; r += 1) {
    setCell(ws, r, 0, { t: "s", v: aoa[r][0], s: { font: r === 0 ? titleFont : boldFont } });
  }

  const headerRow = 4;
  aoa[headerRow].forEach((label, c) => {
    setCell(ws, headerRow, c, {
      t: "s",
      v: label,
      s: {
        font: boldFont,
        fill: headerFill,
        border: { top: thinBorder, bottom: thinBorder },
        alignment: { horizontal: c >= 6 ? "right" : "left" },
      },
    });
  });

  const dataStart = headerRow + 1;
  rows.forEach((row, i) => {
    const r = dataStart + i;
    const font = row.voided ? voidFont : fontBase;
    [row.kiosco, row.noFactura, row.fechaEmision, row.estado, row.cliente, row.vendedor].forEach((value, c) => {
      setCell(ws, r, c, { t: "s", v: value, s: { font } });
    });
    [row.anulado, row.creditos, row.totalFacturado].forEach((value, i2) => {
      setCell(ws, r, 6 + i2, { t: "n", v: value, z: moneyFmt, s: { font, alignment: { horizontal: "right" } } });
    });
  });

  const totalRow = dataStart + rows.length;
  setCell(ws, totalRow, 0, { t: "s", v: "TOTAL", s: { font: boldFont, border: { top: thinBorder } } });
  [totals.anulado, totals.creditos, totals.totalFacturado].forEach((value, i2) => {
    setCell(ws, totalRow, 6 + i2, {
      t: "n",
      v: value,
      z: moneyFmt,
      s: { font: boldFont, border: { top: thinBorder }, alignment: { horizontal: "right" } },
    });
  });

  ws["!ref"] = `A1:${colLetter(COLS - 1)}${totalRow + 1}`;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "VENTAS CONSOLIDADAS");
  const rangeLabel = startDate === endDate ? startDate || "reporte" : `${startDate || "inicio"}_${endDate || "fin"}`;
  XLSX.writeFile(wb, `REPORTE_VENTAS_CONSOLIDADAS_${rangeLabel}.xlsx`);
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const formatMoneyQ = (value) => {
  const n = Number(value || 0);
  return `Q${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const reportStyles = `
  @page { size: letter landscape; margin: 12mm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11px; color: #111; }
  .title { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
  .meta { font-size: 12px; font-weight: bold; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { border: 1px solid #333; padding: 3px 6px; }
  th { background: #d9d9d9; text-align: left; }
  td.num { text-align: right; }
  tr.void td { color: #cc0000; font-weight: bold; }
  tr.totals td { font-weight: bold; border-top: 2px solid #000; }
`;

export const exportConsolidatedSalesToPdf = ({ sales, startDate, endDate, generatedByName }) => {
  const rows = buildConsolidatedSalesRows(sales);
  const totals = {
    anulado: sumRows(rows, "anulado"),
    creditos: sumRows(rows, "creditos"),
    totalFacturado: sumRows(rows, "totalFacturado"),
  };

  const bodyRows = rows
    .map(
      (row) => `<tr${row.voided ? ' class="void"' : ""}>
        <td>${escapeHtml(row.kiosco)}</td>
        <td>${escapeHtml(row.noFactura)}</td>
        <td>${escapeHtml(row.fechaEmision)}</td>
        <td>${escapeHtml(row.estado)}</td>
        <td>${escapeHtml(row.cliente)}</td>
        <td>${escapeHtml(row.vendedor)}</td>
        <td class="num">${formatMoneyQ(row.anulado)}</td>
        <td class="num">${formatMoneyQ(row.creditos)}</td>
        <td class="num">${formatMoneyQ(row.totalFacturado)}</td>
      </tr>`
    )
    .join("");

  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>REPORTE DE VENTAS CONSOLIDADAS</title>
  <style>${reportStyles}</style>
</head>
<body>
  <div class="title">REPORTE DE VENTAS CONSOLIDADAS</div>
  <div class="meta">FECHA: ${escapeHtml(formatConsolidatedPeriodLabel(startDate, endDate))}</div>
  <div class="meta">GENERADO POR: ${escapeHtml(formatGeneratedByLine(generatedByName))}</div>
  <table>
    <thead>
      <tr>
        <th>Kiosco</th>
        <th>No. Factura</th>
        <th>Fecha Emisión</th>
        <th>Estado Venta</th>
        <th>Cliente</th>
        <th>Vendedor</th>
        <th>Anulado</th>
        <th>Créditos</th>
        <th>Total Facturado</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="9">Sin ventas en el período seleccionado.</td></tr>`}
      <tr class="totals">
        <td colspan="6">TOTAL</td>
        <td class="num">${formatMoneyQ(totals.anulado)}</td>
        <td class="num">${formatMoneyQ(totals.creditos)}</td>
        <td class="num">${formatMoneyQ(totals.totalFacturado)}</td>
      </tr>
    </tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
};
