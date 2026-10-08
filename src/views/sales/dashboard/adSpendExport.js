import * as XLSX from "xlsx-js-style";
import { fmtMoney } from "utils/financeFormat";
import { boldFont, thinBorder } from "utils/kioskReportExcelStyle";
import { statusFromNet, statusMeta, weekdayFull } from "./adSpendHelpers";
import { fmtDmy } from "./salesDashboardHelpers";

/**
 * Exportación a Excel de 'Publicidad vs ventas' (una hoja). Sigue el patrón de utils/kioskFinancialsExport.js
 * (xlsx-js-style: arreglo de filas + estilos por tipo de fila).
 * - buildAdSpendSheetLayout: función pura que arma las filas (título, periodo, nota, resumen, encabezado, un renglón
 *   por día y fila de totales).
 * - buildAdSpendWorkbook: aplica formatos y colores (verde ganancia / rojo pérdida) y devuelve el libro.
 * - exportAdSpendExcel: descarga el .xlsx con el reporte guardado en el servidor.
 */

export const SHEET_NAME = "Publicidad vs ventas";
export const HEADERS = [
  "Fecha",
  "Día",
  "Pedidos",
  "Venta (Q)",
  "Inversión (Q)",
  "Resultado (Q)",
  "Resultado (% s/ inversión)",
  "ROAS",
  "Estado",
  "Notas",
];
const COL = { date: 0, weekday: 1, orders: 2, sales: 3, spend: 4, result: 5, pct: 6, roas: 7, status: 8, notes: 9 };
/** Columna del valor en el bloque de resumen (la etiqueta ocupa de la A a la C). */
const SUMMARY_VALUE_COL = 3;

const moneyFmt = '"Q"#,##0.00;-"Q"#,##0.00';
const dateFmt = "dd/mm/yyyy";
const roasFmt = "0.00";
const pctFmt = "+0.0%;-0.0%;0.0%";
const countFmt = "0";

const fillGray = { fgColor: { rgb: "D9D9D9" } };
const fillLight = { fgColor: { rgb: "F2F2F2" } };
const fillBlue = { fgColor: { rgb: "B4C6E7" } };
const baseFont = { name: "Calibri", sz: 11, color: { rgb: "000000" } };

/** Colores por estado: el texto del estado y el signo del número acompañan al color. */
const TONE = {
  WIN: { fill: { fgColor: { rgb: "C6EFCE" } }, font: { ...boldFont, color: { rgb: "006100" } } },
  LOSS: { fill: { fgColor: { rgb: "FFC7CE" } }, font: { ...boldFont, color: { rgb: "9C0006" } } },
  EVEN: { fill: { fgColor: { rgb: "EDEDED" } }, font: { ...boldFont, color: { rgb: "404040" } } },
  NO_SPEND: { fill: null, font: { ...baseFont, italic: true, color: { rgb: "808080" } } },
};

const excelSerial = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) + 25569;
};

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export const exportFileName = (report, ext = "xlsx") => `publicidad-vs-ventas-online_${report.startDate}_${report.endDate}.${ext}`;

/**
 * Filas del reporte. report = normalizeReport(...) (días con números y totales del backend).
 * rows[i] = { kind, fmt?, tone? } con kind: title | subtitle | note | blank | section | kv | header | day | total.
 */
export const buildAdSpendSheetLayout = (report) => {
  const { totals, days } = report;
  const aoa = [];
  const rows = [];
  const push = (kind, cells = {}, meta = {}) => {
    const row = new Array(HEADERS.length).fill(null);
    Object.entries(cells).forEach(([col, value]) => {
      row[Number(col)] = value === undefined ? null : value;
    });
    aoa.push(row);
    rows.push({ kind, ...meta });
  };

  push("title", { 0: "PUBLICIDAD VS VENTAS ONLINE" });
  push("subtitle", { 0: `Periodo: ${fmtDmy(report.startDate)} – ${fmtDmy(report.endDate)}` });
  push("note", {
    0: "Montos en quetzales (Q). Resultado = venta online del día − inversión en publicidad del día. No incluye costo de producción ni otros gastos. Los días sin inversión capturada no entran al resultado ni al ROAS.",
  });
  push("blank");

  const hasSpend = totals.daysWithSpend > 0;
  const resultStatus = hasSpend ? statusFromNet(totals.netResult) : "NO_SPEND";
  push("section", { 0: "RESUMEN" });
  const summary = (label, value, fmt, tone) =>
    push("kv", { 0: label, [SUMMARY_VALUE_COL]: value }, { fmt, tone });
  summary("Inversión en publicidad", numOrNull(totals.adSpend), "money");
  summary("Venta de los días con inversión", numOrNull(totals.comparableSales), "money");
  summary("Resultado (venta − inversión)", hasSpend ? numOrNull(totals.netResult) : null, "money", resultStatus);
  summary("Resultado en % sobre la inversión", hasSpend ? numOrNull(totals.resultPct) : null, "pct", resultStatus);
  summary("ROAS (Q vendidos por cada Q1 invertido)", numOrNull(totals.roas), "roas");
  summary("Días en ganancia", totals.daysWin, "count");
  summary("Días en pérdida", totals.daysLoss, "count");
  summary("Días en equilibrio", totals.daysEven, "count");
  summary("Días sin inversión capturada (no entran al resultado)", totals.daysNoSpend, "count");
  summary("Venta total online del periodo (todos los días)", numOrNull(totals.salesAmount), "money");
  summary("Pedidos del periodo", totals.ordersCount, "count");
  push("blank");

  push("header", Object.fromEntries(HEADERS.map((h, i) => [i, h])));
  days.forEach((d) => {
    push(
      "day",
      {
        [COL.date]: excelSerial(d.date),
        [COL.weekday]: weekdayFull(d.date),
        [COL.orders]: d.ordersCount,
        [COL.sales]: numOrNull(d.salesAmount),
        [COL.spend]: numOrNull(d.adSpend),
        [COL.result]: numOrNull(d.netResult),
        [COL.pct]: numOrNull(d.resultPct),
        [COL.roas]: numOrNull(d.roas),
        [COL.status]: statusMeta(d.status).label,
        [COL.notes]: d.notes || "",
      },
      { tone: d.status }
    );
  });
  push(
    "total",
    {
      [COL.date]: "Total",
      [COL.orders]: totals.ordersCount,
      [COL.sales]: numOrNull(totals.salesAmount),
      [COL.spend]: numOrNull(totals.adSpend),
      [COL.result]: hasSpend ? numOrNull(totals.netResult) : null,
      [COL.pct]: hasSpend ? numOrNull(totals.resultPct) : null,
      [COL.roas]: numOrNull(totals.roas),
      [COL.status]: hasSpend ? statusMeta(resultStatus).label : "",
      [COL.notes]: `Resultado y ROAS: solo ${totals.daysWithSpend} ${
        totals.daysWithSpend === 1 ? "día con inversión" : "días con inversión"
      } (venta de esos días ${fmtMoney(totals.comparableSales)}).`,
    },
    { tone: resultStatus }
  );

  const headerRow = rows.findIndex((r) => r.kind === "header");
  return {
    aoa,
    rows,
    headerRow,
    firstDayRow: headerRow + 1,
    lastDayRow: headerRow + days.length,
    totalRow: aoa.length - 1,
    colCount: HEADERS.length,
    sheetName: SHEET_NAME,
    fileName: exportFileName(report),
  };
};

/** Libro de Excel con formatos y colores. Devuelve { wb, layout }. */
export const buildAdSpendWorkbook = (report) => {
  const layout = buildAdSpendSheetLayout(report);
  const { aoa, rows, colCount, headerRow, firstDayRow, lastDayRow } = layout;
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  rows.forEach((row, r) => {
    for (let c = 0; c < colCount; c += 1) {
      // El resumen solo ocupa de la A a la D.
      if ((row.kind === "kv" || row.kind === "section") && c > SUMMARY_VALUE_COL) continue;
      const addr = XLSX.utils.encode_cell({ r, c });
      const bordered = ["kv", "header", "day", "total", "section"].includes(row.kind);
      if (!ws[addr]) {
        if (!bordered && row.kind !== "note") continue;
        ws[addr] = { t: "s", v: "" };
      }
      const cell = ws[addr];
      const style = { font: baseFont, alignment: {} };
      if (bordered) style.border = thinBorder;

      if (cell.t === "n") {
        if (row.kind === "kv") {
          cell.z =
            row.fmt === "money" ? moneyFmt : row.fmt === "roas" ? roasFmt : row.fmt === "pct" ? pctFmt : countFmt;
        } else if (c === COL.date) cell.z = dateFmt;
        else if (c === COL.orders) cell.z = countFmt;
        else if (c === COL.pct) cell.z = pctFmt;
        else if (c === COL.roas) cell.z = roasFmt;
        else cell.z = moneyFmt;
        style.alignment = { horizontal: "right" };
      }

      switch (row.kind) {
        case "title":
          style.font = { ...boldFont, sz: 14 };
          break;
        case "subtitle":
          style.font = { ...boldFont, sz: 12 };
          break;
        case "note":
          style.font = { ...baseFont, italic: true, color: { rgb: "666666" } };
          style.alignment = { wrapText: true, vertical: "top" };
          break;
        case "section":
          style.font = boldFont;
          style.fill = fillBlue;
          break;
        case "kv":
          if (c < SUMMARY_VALUE_COL) style.font = boldFont;
          if (c === SUMMARY_VALUE_COL && row.tone && TONE[row.tone]) {
            style.font = TONE[row.tone].font;
            if (TONE[row.tone].fill) style.fill = TONE[row.tone].fill;
          } else if (c === SUMMARY_VALUE_COL) {
            style.font = boldFont;
          }
          break;
        case "header":
          style.font = boldFont;
          style.fill = fillGray;
          style.alignment = { horizontal: "center", vertical: "center", wrapText: true };
          break;
        case "day": {
          const tone = TONE[row.tone] || TONE.NO_SPEND;
          if (c === COL.result || c === COL.pct || c === COL.status) {
            style.font = tone.font;
            if (tone.fill) style.fill = tone.fill;
          } else if (row.tone === "NO_SPEND" && c !== COL.notes) {
            style.font = { ...baseFont, color: { rgb: "808080" } };
          }
          if (c === COL.date || c === COL.weekday || c === COL.status || c === COL.notes) {
            style.alignment = { horizontal: "left" };
          }
          break;
        }
        case "total": {
          style.font = boldFont;
          style.fill = fillLight;
          const tone = TONE[row.tone];
          if ((c === COL.result || c === COL.pct || c === COL.status) && tone && row.tone !== "NO_SPEND") {
            style.font = tone.font;
            if (tone.fill) style.fill = tone.fill;
          }
          if (c === COL.date || c === COL.status) style.alignment = { horizontal: "left" };
          if (c === COL.notes) style.font = { ...baseFont, italic: true, color: { rgb: "666666" } };
          break;
        }
        default:
          break;
      }
      cell.s = style;
    }
  });

  ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }, { wch: 24 }, { wch: 52 }];
  ws["!rows"] = [];
  ws["!rows"][headerRow] = { hpt: 24 };
  ws["!merges"] = [];
  rows.forEach((row, r) => {
    if (row.kind === "note") {
      ws["!merges"].push({ s: { r, c: 0 }, e: { r, c: colCount - 1 } });
      ws["!rows"][r] = { hpt: 32 };
    }
    if (row.kind === "kv") ws["!merges"].push({ s: { r, c: 0 }, e: { r, c: SUMMARY_VALUE_COL - 1 } });
  });
  if (lastDayRow >= firstDayRow) {
    ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: lastDayRow, c: colCount - 1 } }) };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME.slice(0, 31));
  return { wb, layout };
};

/** Escribe y descarga el .xlsx. Devuelve el nombre del archivo. */
export const exportAdSpendExcel = (report) => {
  const { wb, layout } = buildAdSpendWorkbook(report);
  XLSX.writeFile(wb, layout.fileName);
  return layout.fileName;
};
