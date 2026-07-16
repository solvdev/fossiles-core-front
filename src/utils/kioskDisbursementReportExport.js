import * as XLSX from "xlsx-js-style";
import { formatDateGt, formatDateTimeGt, formatNowGt } from "./dateTimeHelper";

const moneyFmt = '"Q"#,##0.00';

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

const formatPeriodLabel = (startDate, endDate) => {
  const from = startDate || endDate || "";
  const to = endDate || from;
  if (!from) return "Sin período";
  if (from === to) return formatDateGt(from);
  return `${formatDateGt(from)} — ${formatDateGt(to)}`;
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

export const exportKioskDisbursementsToExcel = ({
  rows,
  startDate,
  endDate,
  kioskName,
  generatedByName,
}) => {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const aoa = [
    ["REPORTE DE DESEMBOLSOS (CAJA CHICA)"],
    [`KIOSKO: ${kioskName || "TODOS LOS KIOSKOS"}`],
    [`PERÍODO: ${formatPeriodLabel(startDate, endDate)}`],
    [`GENERADO POR: ${formatGeneratedByLine(generatedByName)}`],
    [],
    ["Fecha", "Kiosko", "Descripción", "Monto", "Registrado por", "Sesión caja"],
  ];

  list.forEach((row) => {
    aoa.push([
      formatDateTimeGt(row.createdAt),
      row.kioskName || "—",
      row.description || "—",
      Number(row.amount || 0),
      row.createdByName || "—",
      row.cashSessionId != null ? String(row.cashSessionId) : "—",
    ]);
  });

  aoa.push([]);
  aoa.push(["TOTAL", "", "", total, "", ""]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 20 }, { wch: 28 }, { wch: 45 }, { wch: 14 }, { wch: 28 }, { wch: 12 }];

  for (let r = 6; r < 6 + list.length; r += 1) {
    const addr = XLSX.utils.encode_cell({ r, c: 3 });
    if (ws[addr]) ws[addr].z = moneyFmt;
  }
  const totalAddr = XLSX.utils.encode_cell({ r: 7 + list.length, c: 3 });
  if (ws[totalAddr]) ws[totalAddr].z = moneyFmt;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Desembolsos");
  const from = startDate || "inicio";
  const to = endDate || from;
  XLSX.writeFile(wb, `desembolsos_kiosko_${from}_${to}_${formatNowGt().replace(/[:\s]/g, "")}.xlsx`);
};

export const exportKioskDisbursementsToPdf = ({
  rows,
  startDate,
  endDate,
  kioskName,
  generatedByName,
}) => {
  const list = Array.isArray(rows) ? rows : [];
  const total = list.reduce((sum, row) => sum + Number(row?.amount || 0), 0);
  const bodyRows = list
    .map(
      (row) => `
    <tr>
      <td>${escapeHtml(formatDateTimeGt(row.createdAt))}</td>
      <td>${escapeHtml(row.kioskName || "—")}</td>
      <td>${escapeHtml(row.description || "—")}</td>
      <td class="num">${escapeHtml(formatMoneyQ(row.amount))}</td>
      <td>${escapeHtml(row.createdByName || "—")}</td>
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
    .title { text-align: center; font-size: 16pt; font-weight: bold; margin-bottom: 10px; }
    .meta { margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 14px; }
    th, td { border: 1px solid #222; padding: 4px 6px; vertical-align: top; }
    th { background: #f0f0f0; text-align: left; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    tr.total td { font-weight: bold; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="title">REPORTE DE DESEMBOLSOS (CAJA CHICA)</div>
  <div class="meta"><strong>KIOSKO:</strong> ${escapeHtml(kioskName || "TODOS LOS KIOSKOS")}</div>
  <div class="meta"><strong>PERÍODO:</strong> ${escapeHtml(formatPeriodLabel(startDate, endDate))}</div>
  <div class="meta"><strong>GENERADO POR:</strong> ${escapeHtml(formatGeneratedByLine(generatedByName))}</div>
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Kiosko</th>
        <th>Descripción</th>
        <th class="num">Monto</th>
        <th>Registrado por</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="5">Sin desembolsos en el período</td></tr>`}
      <tr class="total">
        <td colspan="3" style="text-align:right">TOTAL</td>
        <td class="num">${escapeHtml(formatMoneyQ(total))}</td>
        <td></td>
      </tr>
    </tbody>
  </table>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
};
