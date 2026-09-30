import * as XLSX from "xlsx-js-style";
import { boldFont, thinBorder } from "./kioskReportExcelStyle";
import { MONTHS_ES } from "./financeFormat";

/**
 * Exportación de Finanzas por kiosco.
 *
 * - buildOriginalSheetLayout: función pura que arma la hoja con el layout ORIGINAL de los
 *   Excel de ventas (etiquetas en la columna B, encabezado en la fila 8: 'Fecha' + kioscos
 *   desde la columna C, filas de días, Total, % Participacion, METAS, % DE META, bloque de
 *   costos con tasas y costos fijos, Total Cto Oper., Diferencia Vta, MARGEN,
 *   Punto de Equilibrio y PE DIARIO).
 * - exportOriginalSheetExcel: escribe el .xlsx con xlsx-js-style.
 * - downloadElementPdf: PDF de un elemento visible (html2canvas + jsPDF, como kioskCashCloseReport).
 */

/** Fila del encabezado (índice 0) => fila 8 de Excel. */
export const HEADER_ROW_INDEX = 7;
/** Índice de la primera columna de kiosco (C). */
export const FIRST_SITE_COL = 2;

// Formato de moneda Excel con quetzales (positivos y negativos)
const moneyFmt = '"Q"#,##0.00;-"Q"#,##0.00';
const pctFmt = "0.0%";
const dateFmt = "dd/mm/yyyy";

const VARIABLE_BLOCKS = [
  { label: "Costo del Pdcto", rate: "productCostPct", calc: "productCost" },
  { label: "Comision de venta", rate: "salesCommissionPct", calc: "salesCommission" },
  { label: "Comision tarjeta", rate: "cardCommissionPct", calc: "cardCommission" },
  { label: "IVA", rate: "taxPct", calc: "tax" },
];

const excelSerial = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) + 25569;
};

const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Un día sin operación no queda en blanco en el Excel: se escribe 0. */
const numOrZero = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Tasas del mes por sitio desde getKioskConfig(). */
export const ratesBySiteFromConfig = (config, month) => {
  const out = {};
  (config?.sites || []).forEach((s) => {
    const m = (s.months || []).find((x) => x.month === month);
    if (m) out[s.siteId] = m;
  });
  return out;
};

/**
 * @param {object} args
 * @param {number} args.year
 * @param {number} args.month 1..12
 * @param {object} args.matrix respuesta de /daily-matrix
 * @param {object} args.pnl respuesta de /pnl (con `month`)
 * @param {object} args.config respuesta de /config (para tasas)
 * @param {{code:string,name:string}[]} args.categories categorías fijas ordenadas
 * @returns {{aoa: any[][], rows: {kind:string, fmt:string}[], colCount:number, siteCount:number,
 *   totalCol:number, cumCol:number, headerRow:number, sheetName:string}}
 */
export const buildOriginalSheetLayout = ({ year, month, matrix, pnl, config, categories = [] }) => {
  const sites = (matrix?.sites && matrix.sites.length ? matrix.sites : pnl?.sites || []).map((s) => ({
    siteId: s.siteId,
    name: s.name,
  }));
  const siteCount = sites.length;
  const totalCol = FIRST_SITE_COL + siteCount;
  const cumCol = totalCol + 1;
  const colCount = cumCol + 1;

  const pnlBySite = {};
  (pnl?.sites || []).forEach((s) => {
    pnlBySite[s.siteId] = s;
  });
  const rates = ratesBySiteFromConfig(config, month);
  const totals = pnl?.totals || {};

  const aoa = [];
  const rows = [];
  const push = (kind, fmt, cells) => {
    const row = new Array(colCount).fill(null);
    Object.entries(cells).forEach(([col, value]) => {
      row[Number(col)] = value === undefined ? null : value;
    });
    aoa.push(row);
    rows.push({ kind, fmt });
  };

  const monthName = (MONTHS_ES[month - 1] || "").toUpperCase();

  // Filas 1..7 (título y contexto).
  push("blank", "text", {});
  push("title", "text", { 1: "REPORTE DE VENTAS Y COSTOS POR KIOSCO" });
  push("blank", "text", {});
  push("subtitle", "text", { 1: `MES: ${monthName} ${year}` });
  push("note", "text", { 1: "Montos en quetzales (Q), IVA incluido. Celda vacía = sin dato; 0 = venta cero." });
  push("blank", "text", {});
  push("blank", "text", {});

  // Fila 8: encabezado.
  const header = { 1: "Fecha", [totalCol]: "Total por día", [cumCol]: "Acumulado" };
  sites.forEach((s, i) => {
    header[FIRST_SITE_COL + i] = s.name;
  });
  push("header", "text", header);

  // Filas de días.
  (matrix?.days || []).forEach((day) => {
    const cells = { 1: excelSerial(day.date), [totalCol]: numOrZero(day.total), [cumCol]: numOrZero(day.cumulative) };
    sites.forEach((s, i) => {
      const v = day.values ? day.values[s.siteId] ?? day.values[String(s.siteId)] : null;
      cells[FIRST_SITE_COL + i] = numOrZero(v);
    });
    push("date", "money", cells);
  });

  const perSite = (label, kind, fmt, getSite, totalValue, cumValue) => {
    const cells = { 1: label, [totalCol]: totalValue === undefined ? null : totalValue };
    if (cumValue !== undefined) cells[cumCol] = cumValue;
    sites.forEach((s, i) => {
      cells[FIRST_SITE_COL + i] = numOrNull(getSite(s));
    });
    push(kind, fmt, cells);
  };

  const P = (s) => pnlBySite[s.siteId] || {};
  const R = (s) => rates[s.siteId] || {};

  // Total y participación / metas.
  const siteTotals = matrix?.siteTotals || {};
  perSite(
    "Total",
    "total",
    "money",
    (s) => siteTotals[s.siteId] ?? siteTotals[String(s.siteId)] ?? P(s).sales,
    numOrNull(matrix?.grandTotal ?? totals.sales)
  );
  perSite("% Participacion", "pct", "pct", (s) => P(s).participationPct, numOrNull(totals.participationPct));
  perSite("METAS", "money", "money", (s) => P(s).goal, numOrNull(totals.goal));
  perSite("% DE META", "pct", "pct", (s) => P(s).goalPct, numOrNull(totals.goalPct));

  push("blank", "text", {});
  push("section", "text", { 1: "COSTOS" });
  push("section", "text", { 1: "Costos Variables" });
  VARIABLE_BLOCKS.forEach((b) => {
    perSite(b.label, "rate", "pct", (s) => R(s)[b.rate], null);
    perSite("", "calc", "money", (s) => P(s).variable?.[b.calc], numOrNull(totals.variable?.[b.calc]));
  });
  perSite("Total CI", "subtotal", "money", (s) => P(s).variable?.total, numOrNull(totals.variable?.total));

  push("section", "text", { 1: "Costos Fijos" });
  categories.forEach((c) => {
    perSite(
      c.name,
      "calc",
      "money",
      (s) => P(s).fixed?.byCategory?.[c.code],
      numOrNull(totals.fixed?.byCategory?.[c.code])
    );
  });
  perSite("Total CI", "subtotal", "money", (s) => P(s).fixed?.total, numOrNull(totals.fixed?.total));

  perSite("Total Cto Oper.", "grand", "money", (s) => P(s).totalCost, numOrNull(totals.totalCost));
  perSite("Diferencia Vta", "grand", "money", (s) => P(s).difference, numOrNull(totals.difference));
  perSite("MARGEN", "grand", "pct", (s) => P(s).margin, numOrNull(totals.margin));
  perSite("Punto de Equilibrio", "grand", "money", (s) => P(s).breakEven, numOrNull(totals.breakEven));
  perSite("PE DIARIO", "grand", "money", (s) => P(s).breakEvenDaily, numOrNull(totals.breakEvenDaily));

  return {
    aoa,
    rows,
    colCount,
    siteCount,
    totalCol,
    cumCol,
    headerRow: HEADER_ROW_INDEX,
    sheetName: `Reporte de Vtas ${String(month).padStart(2, "0")}-${year}`,
  };
};

const fillGray = { fgColor: { rgb: "D9D9D9" } };
const fillLight = { fgColor: { rgb: "F2F2F2" } };
const fillBlue = { fgColor: { rgb: "B4C6E7" } };
const baseFont = { name: "Calibri", sz: 11, color: { rgb: "000000" } };

/** Escribe y descarga el .xlsx con el layout original. */
export const exportOriginalSheetExcel = (args) => {
  const layout = buildOriginalSheetLayout(args);
  const { aoa, rows, colCount, totalCol, cumCol, headerRow, sheetName } = layout;
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  rows.forEach((row, r) => {
    for (let c = 1; c < colCount; c += 1) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      const cell = ws[addr];
      const isLabel = c === 1;
      const isNumeric = !isLabel && cell.t === "n";
      const isTotalCol = c === totalCol || c === cumCol;

      // Formato numérico por tipo de fila (la fecha va en la columna B).
      if (cell.t === "n") {
        if (row.kind === "date" && isLabel) cell.z = dateFmt;
        else cell.z = row.fmt === "pct" ? pctFmt : moneyFmt;
      }

      const style = { font: baseFont, alignment: {} };
      const bordered = ["header", "date", "total", "pct", "rate", "calc", "subtotal", "grand", "section"].includes(row.kind);
      if (bordered) style.border = thinBorder;
      if (row.kind === "title") style.font = { ...boldFont, sz: 14 };
      if (row.kind === "subtitle") style.font = { ...boldFont, sz: 12 };
      if (row.kind === "note") style.font = { ...baseFont, italic: true, color: { rgb: "666666" } };
      if (row.kind === "header") {
        style.font = boldFont;
        style.fill = fillGray;
        style.alignment = { horizontal: "center", vertical: "center", wrapText: true };
      } else if (row.kind === "section") {
        style.font = boldFont;
        style.fill = fillBlue;
      } else if (["total", "subtotal", "grand"].includes(row.kind)) {
        style.font = boldFont;
        style.fill = fillLight;
      }
      if (isTotalCol && ["date", "calc"].includes(row.kind)) style.font = boldFont;
      if (!isLabel && bordered && row.kind !== "header") style.alignment = { horizontal: "right" };
      if (isLabel && row.kind === "date") style.alignment = { horizontal: "left" };
      // Diferencias negativas en rojo (sin depender sólo del color: el signo '-' del número se conserva).
      if (isNumeric && row.kind === "grand" && cell.v < 0) style.font = { ...boldFont, color: { rgb: "C00000" } };
      cell.s = style;
    }
  });

  ws["!cols"] = [
    { wch: 2 },
    { wch: 26 },
    ...Array.from({ length: totalCol - FIRST_SITE_COL }, () => ({ wch: 14 })),
    { wch: 16 },
    { wch: 16 },
  ];
  ws["!rows"] = [];
  ws["!rows"][headerRow] = { hpt: 32 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  const fileName = `Finanzas_Kioscos_${args.year}-${String(args.month).padStart(2, "0")}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
};

/**
 * PDF (apaisado) de un elemento visible. Las áreas con scroll se expanden en el clon para
 * capturar tablas completas; los gráficos (canvas) se copian tal cual.
 */
export const downloadElementPdf = async (element, { title, filename }) => {
  if (!element) return false;
  const [{ jsPDF }, html2canvasModule] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const html2canvas = html2canvasModule.default || html2canvasModule;

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
    windowWidth: Math.max(element.scrollWidth, 1100),
    onclone: (doc) => {
      doc.querySelectorAll(".kfin-scroll").forEach((el) => {
        el.style.overflow = "visible";
        el.style.maxHeight = "none";
      });
      doc.querySelectorAll(".kfin-noprint").forEach((el) => {
        el.style.display = "none";
      });
      doc.querySelectorAll(".kfin-table th, .kfin-table td").forEach((el) => {
        el.style.position = "static";
      });
    },
  });

  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const headerH = title ? 22 : 0;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2 - headerH;
  const imgHeight = (canvas.height * usableWidth) / canvas.width;

  let offset = 0;
  let first = true;
  while (offset < imgHeight - 0.5) {
    if (!first) pdf.addPage();
    if (title) {
      pdf.setFontSize(11);
      pdf.setTextColor(60);
      pdf.text(title, margin, margin + 8);
    }
    // Recorta la porción de la imagen que corresponde a esta página.
    const sliceH = Math.min(usableHeight, imgHeight - offset);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = Math.max(1, Math.round((sliceH * canvas.width) / usableWidth));
    const ctx = slice.getContext("2d");
    ctx.drawImage(
      canvas,
      0,
      Math.round((offset * canvas.width) / usableWidth),
      canvas.width,
      slice.height,
      0,
      0,
      slice.width,
      slice.height
    );
    pdf.addImage(slice.toDataURL("image/png"), "PNG", margin, margin + headerH, usableWidth, sliceH);
    offset += usableHeight;
    first = false;
  }
  pdf.save(filename);
  return true;
};
