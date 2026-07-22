import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";
import { applyKioskReportTableStyles } from "./kioskReportExcelStyle";

const moneyFmt = '"Q"#,##0.00';

const toGtDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/** dd-MM-yyyy HH:mm (estilo reporte legacy). */
export const formatDisbursementDateTime = (value) => {
  const date = toGtDate(value);
  if (!date) return "—";
  const parts = new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}:${get("second")}`;
};

const formatDateOnlyLegacy = (ymd) => {
  const date = toGtDate(ymd);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("day")}-${get("month")}-${get("year")}`;
};

export const formatDisbursementPeriodLine = (startDate, endDate) => {
  const from = startDate || endDate || "";
  const to = endDate || from;
  if (!from) return "Sin período";
  const fromLabel = `${formatDateOnlyLegacy(from)} 00:00`;
  const toLabel = from === to ? `${formatDateOnlyLegacy(to)} 23:59` : `${formatDateOnlyLegacy(to)} 23:59`;
  return `${fromLabel} AL ${toLabel}`;
};

export const formatGeneratedByLine = (generatedByName) => {
  const name = String(generatedByName || "").trim().toUpperCase() || "USUARIO";
  const when = formatDisbursementDateTime(new Date());
  return `${name} EL ${when}`;
};

const formatMoneyQ = (value) => {
  const n = Number(value || 0);
  return `Q${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const resolveBodegaLabel = (row) => row?.kioskName || row?.kioskCode || "—";

const sortRows = (rows) =>
  [...(rows || [])].sort((a, b) => {
    const ta = toGtDate(a?.createdAt)?.getTime() || 0;
    const tb = toGtDate(b?.createdAt)?.getTime() || 0;
    if (ta !== tb) return ta - tb;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });

const TABLE_HEADERS = ["#", "Bodega", "Usuario", "Venta", "Descripción", "Fecha/Hora", "Monto"];

export const exportKioskDisbursementsToExcel = ({
  rows,
  startDate,
  endDate,
  generatedByName,
}) => {
  const list = sortRows(rows);
  const total = list.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const aoa = [
    ["REPORTE DE DESEMBOLSOS"],
    [`FECHA: ${formatDisbursementPeriodLine(startDate, endDate)}`],
    [`GENERADO POR: ${formatGeneratedByLine(generatedByName)}`],
    [],
    TABLE_HEADERS,
  ];

  list.forEach((row, index) => {
    aoa.push([
      index + 1,
      resolveBodegaLabel(row),
      row.createdByName || "—",
      row.kioskSaleId
        ? row.internalNumber || row.saleNumber || `#${row.kioskSaleId}`
        : "General",
      row.description || "—",
      formatDisbursementDateTime(row.createdAt),
      Number(row.amount || 0),
    ]);
  });

  aoa.push([]);
  aoa.push(["", "", "", "", "", "Total", total]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 5 }, { wch: 28 }, { wch: 22 }, { wch: 16 }, { wch: 48 }, { wch: 20 }, { wch: 12 }];

  const headerRow = 4;
  const dataStartRow = headerRow + 1;
  const totalRow = dataStartRow + list.length + 1;
  applyKioskReportTableStyles(ws, headerRow, list.length, TABLE_HEADERS.length, {
    totalRow,
    moneyFmt,
    numCols: [0, 6],
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Desembolsos");
  const from = startDate || "inicio";
  const to = endDate || from;
  XLSX.writeFile(wb, `Reporte_Desembolsos_${from}_${to}_${formatNowGt().replace(/[:\s]/g, "")}.xlsx`);
};

export const exportKioskDisbursementsToPdf = ({
  rows,
  startDate,
  endDate,
  generatedByName,
}) => {
  const list = sortRows(rows);
  const total = list.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const bodyRows = list
    .map(
      (row, index) => `
    <tr>
      <td class="num">${index + 1}</td>
      <td>${escapeHtml(resolveBodegaLabel(row))}</td>
      <td>${escapeHtml(row.createdByName || "—")}</td>
      <td>${escapeHtml(
        row.kioskSaleId
          ? row.internalNumber || row.saleNumber || `#${row.kioskSaleId}`
          : "General"
      )}</td>
      <td>${escapeHtml(row.description || "—")}</td>
      <td class="nowrap">${escapeHtml(formatDisbursementDateTime(row.createdAt))}</td>
      <td class="num">${escapeHtml(formatMoneyQ(row.amount))}</td>
    </tr>`
    )
    .join("");

  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>REPORTE DE DESEMBOLSOS</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000; margin: 16px; }
    .title { text-align: center; font-size: 14pt; font-weight: bold; margin-bottom: 8px; }
    .meta { margin: 2px 0; font-size: 11pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
    th { background: #d9d9d9; text-align: center; font-weight: bold; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    td.nowrap { white-space: nowrap; }
    tr.total td { font-weight: bold; }
    @media print { body { margin: 8mm; } }
  </style>
</head>
<body>
  <div class="title">REPORTE DE DESEMBOLSOS</div>
  <div class="meta"><strong>FECHA:</strong> ${escapeHtml(formatDisbursementPeriodLine(startDate, endDate))}</div>
  <div class="meta"><strong>GENERADO POR:</strong> ${escapeHtml(formatGeneratedByLine(generatedByName))}</div>
  <table>
    <thead>
      <tr>
        ${TABLE_HEADERS.map((h) => `<th class="${h === "Monto" || h === "#" ? "num" : ""}">${escapeHtml(h)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="7">Sin desembolsos en el período</td></tr>`}
      <tr class="total">
        <td colspan="6" style="text-align:right">Total</td>
        <td class="num">${escapeHtml(formatMoneyQ(total))}</td>
      </tr>
    </tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
};
