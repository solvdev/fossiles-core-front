import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";

const moneyFmt = '"Q"#,##0.00';
const yellowFill = { fgColor: { rgb: "FFFF00" } };
const blueFill = { fgColor: { rgb: "B4C6E7" } };
const fontBase = { name: "Calibri", sz: 11, color: { rgb: "000000" } };
const boldFont = { ...fontBase, bold: true };
const titleFont = { ...fontBase, bold: true, sz: 12 };

const thinBorder = {
  top: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
};

const thickBorder = {
  top: { style: "medium", color: { rgb: "000000" } },
  right: { style: "medium", color: { rgb: "000000" } },
  bottom: { style: "medium", color: { rgb: "000000" } },
  left: { style: "medium", color: { rgb: "000000" } },
};

const MONTHS_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

const parseYmd = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatMainSheetShortDate = (value) => {
  const date = parseYmd(value);
  if (!date) return "—";
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

export const formatMainSheetDailyDate = (value) => {
  const date = parseYmd(value);
  if (!date) return "—";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getFullYear()}`;
};

const formatMoneyDisplay = (value) => {
  const n = Number(value || 0);
  return `Q ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDifferenceDisplay = (value) => {
  const n = Number(value || 0);
  if (Math.abs(n) < 0.005) return "Q -";
  return formatMoneyDisplay(n);
};

export const groupDailySalesByMonth = (dailySales = []) => {
  const groups = [];
  let currentKey = null;
  (dailySales || []).forEach((row) => {
    const date = parseYmd(row.saleDate);
    if (!date) return;
    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
    if (monthKey !== currentKey) {
      currentKey = monthKey;
      groups.push({
        type: "month",
        key: monthKey,
        label: MONTHS_ES[date.getMonth()] || "",
        monthTotal: 0,
        rows: [],
      });
    }
    const group = groups[groups.length - 1];
    group.rows.push(row);
    group.monthTotal += Number(row.amount || 0);
  });
  return groups;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const setCell = (ws, r, c, cell) => {
  ws[XLSX.utils.encode_cell({ r, c })] = cell;
};

const refreshWorksheetRange = (ws) => {
  const cellAddrs = Object.keys(ws).filter((key) => !key.startsWith("!"));
  if (!cellAddrs.length) {
    ws["!ref"] = "A1:A1";
    return;
  }
  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = 0;
  let maxCol = 0;
  cellAddrs.forEach((addr) => {
    const { r, c } = XLSX.utils.decode_cell(addr);
    minRow = Math.min(minRow, r);
    minCol = Math.min(minCol, c);
    maxRow = Math.max(maxRow, r);
    maxCol = Math.max(maxCol, c);
  });
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: minRow, c: minCol },
    e: { r: maxRow, c: maxCol },
  });
};

const kioskTitle = (report) => {
  const name = String(report?.kioskName || report?.kioskCode || "KIOSKO").trim().toUpperCase();
  return `REPORTE DE VENTAS KIOSCO ${name}`;
};

const buildLeftTableRows = (report) => {
  const groups = groupDailySalesByMonth(report?.dailySales);
  const rows = [
    ["Etiquetas de fila", "Suma de Total Facturado"],
  ];
  groups.forEach((group) => {
    rows.push([group.label, Number(group.monthTotal || 0)]);
    group.rows.forEach((item) => {
      rows.push([
        formatMainSheetDailyDate(item.saleDate),
        Number(item.amount || 0),
      ]);
    });
  });
  rows.push(["Total general", Number(report?.totalSold || 0)]);
  return rows;
};

export const exportKioskMainSheetToExcel = ({ report }) => {
  if (!report) return;
  const leftRows = buildLeftTableRows(report);
  const ws = XLSX.utils.aoa_to_sheet([]);
  ws["!cols"] = [{ wch: 18 }, { wch: 20 }, { wch: 3 }, { wch: 18 }, { wch: 4 }, { wch: 18 }];

  leftRows.forEach((row, index) => {
    const rowIndex = index;
    const isHeader = index === 0;
    const isTotalGeneral = row[0] === "Total general";
    const isDayRow = /^\d{2}\/\d{2}\/\d{4}$/.test(String(row[0]));
    const isMonthRow = !isHeader && !isTotalGeneral && !isDayRow && typeof row[1] === "number";
    const isBold = isHeader || isTotalGeneral || isMonthRow;
    setCell(ws, rowIndex, 0, {
      t: "s",
      v: row[0] ?? "",
      s: { font: isBold ? boldFont : fontBase, border: thinBorder },
    });
    const isMoney = index > 0 && typeof row[1] === "number";
    setCell(ws, rowIndex, 1, {
      t: isMoney ? "n" : "s",
      v: isMoney ? row[1] : row[1] ?? "",
      z: isMoney ? moneyFmt : undefined,
      s: {
        font: isBold ? boldFont : fontBase,
        border: thinBorder,
        fill: isTotalGeneral ? blueFill : undefined,
        alignment: { horizontal: isMoney ? "right" : "left" },
      },
    });
  });

  const summaryStart = 3;
  const title = kioskTitle(report);
  setCell(ws, summaryStart, 3, {
    t: "s",
    v: title,
    s: {
      font: titleFont,
      alignment: { horizontal: "center", vertical: "center" },
      border: thickBorder,
    },
  });
  setCell(ws, summaryStart, 4, { t: "s", v: "", s: { border: thickBorder } });
  setCell(ws, summaryStart, 5, { t: "s", v: "", s: { border: thickBorder } });
  ws["!merges"] = [
    { s: { r: summaryStart, c: 3 }, e: { r: summaryStart, c: 5 } },
  ];

  const writeLabelValue = (row, label, value, { money = false, highlight = true } = {}) => {
    setCell(ws, row, 3, {
      t: "s",
      v: label,
      s: { font: boldFont, border: thinBorder },
    });
    setCell(ws, row, 4, { t: "s", v: "", s: { border: thinBorder } });
    setCell(ws, row, 5, {
      t: money ? "n" : "s",
      v: money ? Number(value || 0) : value ?? "",
      z: money ? moneyFmt : undefined,
      s: {
        font: boldFont,
        border: thickBorder,
        fill: highlight ? yellowFill : undefined,
        alignment: { horizontal: "right" },
      },
    });
  };

  writeLabelValue(summaryStart + 1, "ENCARGADA", report.encargadaName || "—", { highlight: false });
  writeLabelValue(summaryStart + 2, "FECHA INICIAL", formatMainSheetShortDate(report.periodFrom), { highlight: false });
  writeLabelValue(summaryStart + 3, "FECHA FINAL", formatMainSheetShortDate(report.periodTo), { highlight: false });
  writeLabelValue(summaryStart + 4, "FACTURAS DE LA", report.invoiceFrom || "—", { highlight: false });
  writeLabelValue(summaryStart + 5, "A LA", report.invoiceTo || "—", { highlight: false });
  writeLabelValue(summaryStart + 7, "TOTAL VENDIDO", report.totalSold, { money: true });
  writeLabelValue(summaryStart + 8, "TARJETAS", report.cardsTotal, { money: true });
  writeLabelValue(summaryStart + 9, "DEPOSITOS", report.depositsTotal, { money: true });
  writeLabelValue(summaryStart + 10, "GASTOS", report.expensesTotal, { money: true });
  writeLabelValue(summaryStart + 11, "TOTAL", report.reconciledTotal, { money: true });
  writeLabelValue(
    summaryStart + 12,
    "DIFERENCIA",
    Math.abs(Number(report.difference || 0)) < 0.005 ? "Q -" : Number(report.difference || 0),
    { money: Math.abs(Number(report.difference || 0)) >= 0.005, highlight: true }
  );

  refreshWorksheetRange(ws);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Hoja Principal");
  const kiosk = String(report.kioskCode || report.kioskId || "kiosko").replace(/[^\w-]+/g, "_");
  const from = report.periodFrom || "inicio";
  const to = report.periodTo || from;
  XLSX.writeFile(
    wb,
    `Hoja_Principal_${kiosk}_${from}_${to}_${formatNowGt().replace(/[:\s]/g, "")}.xlsx`
  );
};

export const exportKioskMainSheetToPdf = ({ report }) => {
  if (!report) return false;
  const groups = groupDailySalesByMonth(report.dailySales);
  const leftRows = groups
    .map((group) => {
      const monthRow = `<tr class="month"><td>${escapeHtml(group.label)}</td><td class="num">${escapeHtml(formatMoneyDisplay(group.monthTotal))}</td></tr>`;
      const dayRows = group.rows
        .map(
          (item) => `
        <tr>
          <td>${escapeHtml(formatMainSheetDailyDate(item.saleDate))}</td>
          <td class="num">${escapeHtml(formatMoneyDisplay(item.amount))}</td>
        </tr>`
        )
        .join("");
      return monthRow + dayRows;
    })
    .join("");

  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(kioskTitle(report))}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #000; margin: 12px; }
    .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
    th { background: #f3f3f3; font-weight: bold; }
    td.num, th.num { text-align: right; white-space: nowrap; }
    tr.month td { font-weight: bold; background: #fafafa; }
    tr.total td { font-weight: bold; background: #b4c6e7; }
    .summary-title { text-align: center; font-weight: bold; font-size: 12pt; border: 2px solid #000; padding: 6px; margin-bottom: 8px; }
    .summary-row { display: grid; grid-template-columns: 1fr 120px; gap: 8px; margin: 2px 0; align-items: center; }
    .summary-row .label { font-weight: bold; }
    .summary-row .value { text-align: right; font-weight: bold; border: 2px solid #000; background: #ffff00; padding: 4px 6px; min-height: 18px; }
    .summary-row.plain .value { background: #fff; border: 1px solid #000; font-weight: normal; }
    @media print { body { margin: 8mm; } }
  </style>
</head>
<body>
  <div class="layout">
    <div>
      <table>
        <thead>
          <tr><th>Etiquetas de fila</th><th class="num">Suma de Total Facturado</th></tr>
        </thead>
        <tbody>
          ${leftRows || `<tr><td colspan="2">Sin ventas en el período</td></tr>`}
          <tr class="total">
            <td>Total general</td>
            <td class="num">${escapeHtml(formatMoneyDisplay(report.totalSold))}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div>
      <div class="summary-title">${escapeHtml(kioskTitle(report))}</div>
      <div class="summary-row plain"><div class="label">ENCARGADA</div><div class="value">${escapeHtml(report.encargadaName || "—")}</div></div>
      <div class="summary-row plain"><div class="label">FECHA INICIAL</div><div class="value">${escapeHtml(formatMainSheetShortDate(report.periodFrom))}</div></div>
      <div class="summary-row plain"><div class="label">FECHA FINAL</div><div class="value">${escapeHtml(formatMainSheetShortDate(report.periodTo))}</div></div>
      <div class="summary-row plain"><div class="label">FACTURAS DE LA</div><div class="value">${escapeHtml(report.invoiceFrom || "—")}</div></div>
      <div class="summary-row plain"><div class="label">A LA</div><div class="value">${escapeHtml(report.invoiceTo || "—")}</div></div>
      <div class="summary-row"><div class="label">TOTAL VENDIDO</div><div class="value">${escapeHtml(formatMoneyDisplay(report.totalSold))}</div></div>
      <div class="summary-row"><div class="label">TARJETAS</div><div class="value">${escapeHtml(formatMoneyDisplay(report.cardsTotal))}</div></div>
      <div class="summary-row"><div class="label">DEPOSITOS</div><div class="value">${escapeHtml(formatMoneyDisplay(report.depositsTotal))}</div></div>
      <div class="summary-row"><div class="label">GASTOS</div><div class="value">${escapeHtml(formatMoneyDisplay(report.expensesTotal))}</div></div>
      <div class="summary-row"><div class="label">TOTAL</div><div class="value">${escapeHtml(formatMoneyDisplay(report.reconciledTotal))}</div></div>
      <div class="summary-row"><div class="label">DIFERENCIA</div><div class="value">${escapeHtml(formatDifferenceDisplay(report.difference))}</div></div>
    </div>
  </div>
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`);
  win.document.close();
  return true;
};

export const formatMainSheetCountLabel = (session) => {
  if (!session) return "—";
  const from = formatMainSheetShortDate(session.periodFrom);
  const to = formatMainSheetShortDate(session.periodTo);
  const status = session.status ? ` · ${session.status}` : "";
  return `${from} al ${to}${status}`;
};
