import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";
import {
  formatDisbursementPeriodLine,
  formatGeneratedByLine,
} from "./kioskDisbursementReportExport";
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

/** dd/MM/yyyy HH:mm (columna Fecha del reporte bancario). */
export const formatBankDepositDateTime = (value) => {
  const date = toGtDate(value);
  if (!date) return "—";
  const parts = new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
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

const sortRows = (rows) =>
  [...(rows || [])].sort((a, b) => {
    const ta = toGtDate(a?.recordedAt)?.getTime() || 0;
    const tb = toGtDate(b?.recordedAt)?.getTime() || 0;
    if (ta !== tb) return ta - tb;
    return Number(a?.id || 0) - Number(b?.id || 0);
  });

const TABLE_HEADERS = [
  "Cuenta",
  "Banco",
  "No. Documento",
  "Monto",
  "Usuario",
  "Descripción",
  "Fecha",
  "Bodega",
];

const resolveMeta = (payload) => ({
  accountNumber: payload?.accountNumber || payload?.rows?.[0]?.accountNumber || "—",
  accountName: payload?.accountName || "—",
  bankName: payload?.bankName || payload?.rows?.[0]?.bankName || "—",
});

export const exportKioskBankDepositsToExcel = ({
  report,
  rows,
  startDate,
  endDate,
  generatedByName,
}) => {
  const meta = resolveMeta(report || { rows });
  const list = sortRows(rows || report?.rows);
  const total = list.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const aoa = [
    ["REPORTE DE MOVIMIENTOS BANCARIOS"],
    [`NO. CUENTA: ${meta.accountNumber}`],
    [`NOMBRE: ${meta.accountName}`],
    [`FECHA: ${formatDisbursementPeriodLine(startDate, endDate)}`],
    [`GENERADO POR: ${formatGeneratedByLine(generatedByName)}`],
    [],
    TABLE_HEADERS,
  ];

  list.forEach((row) => {
    aoa.push([
      row.accountNumber || meta.accountNumber,
      row.bankName || meta.bankName,
      row.documentNumber || "—",
      Number(row.amount || 0),
      row.userName || "—",
      row.description || "—",
      formatBankDepositDateTime(row.recordedAt),
      row.kioskName || row.kioskCode || "—",
    ]);
  });

  aoa.push([]);
  aoa.push(["Total", "", "", total, "", "", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 22 },
    { wch: 14 },
    { wch: 12 },
    { wch: 20 },
    { wch: 36 },
    { wch: 18 },
    { wch: 26 },
  ];

  const headerRow = 6;
  const dataStartRow = headerRow + 1;
  const totalRow = dataStartRow + list.length + 1;
  applyKioskReportTableStyles(ws, headerRow, list.length, TABLE_HEADERS.length, {
    totalRow,
    moneyFmt,
    numCols: [3],
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Depósitos");
  const from = startDate || "inicio";
  const to = endDate || from;
  XLSX.writeFile(
    wb,
    `Reporte_Movimientos_Bancarios_${from}_${to}_${formatNowGt().replace(/[:\s]/g, "")}.xlsx`
  );
};

export const exportKioskBankDepositsToPdf = ({
  report,
  rows,
  startDate,
  endDate,
  generatedByName,
}) => {
  const meta = resolveMeta(report || { rows });
  const list = sortRows(rows || report?.rows);
  const total = list.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const bodyRows = list
    .map(
      (row) => `
    <tr>
      <td class="nowrap">${escapeHtml(row.accountNumber || meta.accountNumber)}</td>
      <td>${escapeHtml(row.bankName || meta.bankName)}</td>
      <td class="nowrap">${escapeHtml(row.documentNumber || "—")}</td>
      <td class="num">${escapeHtml(formatMoneyQ(row.amount))}</td>
      <td>${escapeHtml(row.userName || "—")}</td>
      <td>${escapeHtml(row.description || "—")}</td>
      <td class="nowrap">${escapeHtml(formatBankDepositDateTime(row.recordedAt))}</td>
      <td>${escapeHtml(row.kioskName || row.kioskCode || "—")}</td>
    </tr>`
    )
    .join("");

  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>REPORTE DE MOVIMIENTOS BANCARIOS</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 10pt; color: #000; margin: 12px; }
    .title { text-align: center; font-size: 13pt; font-weight: bold; margin-bottom: 8px; }
    .meta { margin: 2px 0; font-size: 10pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #000; padding: 3px 4px; vertical-align: top; font-size: 9pt; }
    th { background: #d9d9d9; text-align: center; font-weight: bold; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    td.nowrap { white-space: nowrap; }
    tr.total td { font-weight: bold; }
    @media print { body { margin: 6mm; } @page { size: landscape; } }
  </style>
</head>
<body>
  <div class="title">REPORTE DE MOVIMIENTOS BANCARIOS</div>
  <div class="meta"><strong>NO. CUENTA:</strong> ${escapeHtml(meta.accountNumber)}</div>
  <div class="meta"><strong>NOMBRE:</strong> ${escapeHtml(meta.accountName)}</div>
  <div class="meta"><strong>FECHA:</strong> ${escapeHtml(formatDisbursementPeriodLine(startDate, endDate))}</div>
  <div class="meta"><strong>GENERADO POR:</strong> ${escapeHtml(formatGeneratedByLine(generatedByName))}</div>
  <table>
    <thead>
      <tr>
        ${TABLE_HEADERS.map((h) => `<th class="${h === "Monto" ? "num" : ""}">${escapeHtml(h)}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="8">Sin depósitos en el período</td></tr>`}
      <tr class="total">
        <td>Total</td>
        <td colspan="2"></td>
        <td class="num">${escapeHtml(formatMoneyQ(total))}</td>
        <td colspan="4"></td>
      </tr>
    </tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
};
