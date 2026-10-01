import * as XLSX from "xlsx-js-style";
import { boldFont, thinBorder } from "./kioskReportExcelStyle";
import { MONTHS_ES } from "./financeFormat";
import { FINANCE_GLOSSARY, RESULT_LABELS, breakEvenModeLabel } from "./kioskFinancialsGlossary";

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
  perSite("% Participación", "pct", "pct", (s) => P(s).participationPct, numOrNull(totals.participationPct));
  perSite("METAS", "money", "money", (s) => P(s).goal, numOrNull(totals.goal));
  perSite("% DE META", "pct", "pct", (s) => P(s).goalPct, numOrNull(totals.goalPct));

  push("blank", "text", {});
  push("section", "text", { 1: "COSTOS" });
  push("section", "text", { 1: "Costos Variables" });
  VARIABLE_BLOCKS.forEach((b) => {
    perSite(b.label, "rate", "pct", (s) => R(s)[b.rate], null);
    perSite("", "calc", "money", (s) => P(s).variable?.[b.calc], numOrNull(totals.variable?.[b.calc]));
  });
  perSite("Total costos variables", "subtotal", "money", (s) => P(s).variable?.total, numOrNull(totals.variable?.total));

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
  perSite("Total costos fijos", "subtotal", "money", (s) => P(s).fixed?.total, numOrNull(totals.fixed?.total));

  perSite(RESULT_LABELS.totalCost, "grand", "money", (s) => P(s).totalCost, numOrNull(totals.totalCost));
  perSite(
    `${RESULT_LABELS.profit} (${RESULT_LABELS.profitFormula})`,
    "grand",
    "money",
    (s) => P(s).difference,
    numOrNull(totals.difference)
  );
  perSite(
    `${RESULT_LABELS.margin} (${RESULT_LABELS.marginFormula})`,
    "grand",
    "pct",
    (s) => P(s).margin,
    numOrNull(totals.margin)
  );
  perSite(
    `${RESULT_LABELS.breakEven} (${breakEvenModeLabel(pnl?.breakEvenMode)})`,
    "grand",
    "money",
    (s) => P(s).breakEven,
    numOrNull(totals.breakEven)
  );
  perSite(RESULT_LABELS.breakEvenDaily, "grand", "money", (s) => P(s).breakEvenDaily, numOrNull(totals.breakEvenDaily));

  // Filas del reporte propiamente dicho; lo que sigue es el glosario.
  const coreRowCount = aoa.length;
  push("blank", "text", {});
  push("section", "text", { 1: "GLOSARIO" });
  FINANCE_GLOSSARY.forEach((g) => push("glossary", "text", { 1: g.term, [FIRST_SITE_COL]: g.definition }));

  return {
    coreRowCount,
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
      if (row.kind === "glossary") {
        style.alignment = { wrapText: true, vertical: "top" };
        if (isLabel) style.font = boldFont;
      }
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
    { wch: 48 },
    ...Array.from({ length: totalCol - FIRST_SITE_COL }, () => ({ wch: 14 })),
    { wch: 16 },
    { wch: 16 },
  ];
  ws["!rows"] = [];
  ws["!rows"][headerRow] = { hpt: 32 };
  // Glosario: la definición ocupa varias columnas combinadas (texto envuelto) y la fila se alta según su largo.
  const mergeEnd = Math.min(colCount - 1, FIRST_SITE_COL + 7);
  ws["!merges"] = [];
  rows.forEach((row, r) => {
    if (row.kind !== "glossary") return;
    ws["!merges"].push({ s: { r, c: FIRST_SITE_COL }, e: { r, c: mergeEnd } });
    const text = String(aoa[r][FIRST_SITE_COL] || "");
    ws["!rows"][r] = { hpt: 15 * Math.max(1, Math.ceil(text.length / 100)) };
  });

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

/* ------------------------------------------------------------------ */
/* Proyecciones (Excel)                                                */
/* ------------------------------------------------------------------ */

const MONTHS_SHORT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const GROWTH_SOURCE = { SITE: "propio", COMPANY: "global", OVERRIDE: "fijo", NONE: "sin base" };
const METHOD = { WEEKDAY: "Promedio por día de la semana", RUN_RATE: "Promedio diario del mes", INSUFFICIENT: "Sin historia suficiente" };

const numOrBlank = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
/** Meta sugerida: la proyección redondeada al múltiplo de 100 más cercano (Q). */
export const roundSuggestedGoal = (value) => (value === null || value === undefined ? null : Math.round(Number(value) / 100) * 100);
const growthText = (factor) => {
  const pct = (Number(factor) - 1) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)} %`;
};

/**
 * Hojas del Excel de proyecciones (función pura): cierre del mes, proyección del año siguiente, metas sugeridas y
 * notas del método. Cada hoja trae `aoa`, `header` (índice de la fila de encabezado), `pctCols` (columnas en %) y
 * `widths`.
 */
export const buildForecastSheets = ({ monthEnd, nextYear }) => {
  const sheets = [];
  const note = "Proyección sencilla y explicable: no considera feriados, promociones, cierres extraordinarios, cambios de precio ni inflación.";

  if (monthEnd) {
    const monthName = MONTHS_ES[monthEnd.month - 1] || "";
    const aoa = [
      ["CIERRE PROYECTADO DEL MES"],
      [`${monthName} ${monthEnd.year} · datos al ${monthEnd.asOf} · ${monthEnd.daysElapsed} días completos, ${monthEnd.daysRemaining} por proyectar (incluye hoy)`],
      ["Cada día esperado = promedio de ese día de la semana en las últimas 8 semanas. Rango del 80 %. P&L con los costos y tasas vigentes de cada kiosco."],
      [note],
      [],
      ["Kiosco", "Ventas al día", "Cierre proyectado", "Rango bajo (80 %)", "Rango alto (80 %)", "Meta", "% meta al cierre", "Utilidad proyectada", "Margen proyectado", "Método"],
    ];
    const header = aoa.length - 1;
    (monthEnd.sites || []).forEach((s) => {
      aoa.push([
        s.name, numOrBlank(s.actualToDate), numOrBlank(s.projected), numOrBlank(s.low), numOrBlank(s.high),
        numOrBlank(s.goal), numOrBlank(s.goalPctProjected), numOrBlank(s.difference), numOrBlank(s.margin), METHOD[s.method] || s.method,
      ]);
    });
    const t = monthEnd.totals || {};
    aoa.push([
      "Total", numOrBlank(t.actualToDate), numOrBlank(t.projected), null, null, numOrBlank(t.goal),
      numOrBlank(t.goalPctProjected), numOrBlank(t.difference), numOrBlank(t.margin), null,
    ]);
    sheets.push({ name: "Cierre del mes", aoa, header, pctCols: [6, 8], widths: [30, 16, 18, 18, 18, 14, 16, 18, 16, 32] });
  }

  if (nextYear) {
    const aoa = [
      [`PROYECCIÓN DE VENTAS ${nextYear.targetYear}`],
      [`Cada mes de ${nextYear.targetYear} = el mismo mes de ${nextYear.baseYear} (real; proyectado en el mes en curso y los que faltan) × el crecimiento. Datos al ${nextYear.asOf}.`],
      [
        nextYear.growthMode === "OVERRIDE"
          ? `Crecimiento fijo para todos los kioscos: ${growthText(1 + Number(nextYear.overrideGrowthPct) / 100)}.`
          : `Crecimiento por kiosco (mismas fechas contra ${nextYear.baseYear}); sin base comparable se usa el global: ${
              nextYear.companyGrowthFactor === null || nextYear.companyGrowthFactor === undefined ? "—" : growthText(nextYear.companyGrowthFactor)
            }.`,
      ],
      ["Los meses marcados con * se estimaron con el nivel del kiosco × el índice estacional (el kiosco aún no tenía ese mes el año anterior)."],
      [note],
      [],
      ["Kiosco", "Crecimiento", "Origen", ...MONTHS_SHORT, `Total ${nextYear.targetYear}`, `Real + proy. ${nextYear.baseYear}`, "Utilidad proyectada", "Margen proyectado"],
    ];
    const header = aoa.length - 1;
    (nextYear.sites || []).forEach((s) => {
      aoa.push([
        s.name, numOrBlank(s.growthFactor) === null ? null : Number(s.growthFactor) - 1,
        `${GROWTH_SOURCE[s.growthSource] || s.growthSource}${s.growthCapped ? " (limitado)" : ""}`,
        ...(s.months || []).map((m) => numOrBlank(m.sales)),
        numOrBlank(s.sales), numOrBlank(s.baseSales), numOrBlank(s.difference), numOrBlank(s.margin),
      ]);
    });
    const t = nextYear.totals;
    aoa.push([
      "Total", null, null, ...((t && t.months) || []).map((m) => numOrBlank(m.sales)),
      t ? numOrBlank(t.sales) : null, t ? numOrBlank(t.baseSales) : null, t ? numOrBlank(t.difference) : null, t ? numOrBlank(t.margin) : null,
    ]);
    // Los meses estimados llevan * en una columna aparte de notas (el valor se mantiene numérico)
    const estimatedNotes = (nextYear.sites || [])
      .filter((s) => (s.months || []).some((m) => m.estimated))
      .map((s) => `${s.name}: ${(s.months || []).filter((m) => m.estimated).map((m) => MONTHS_SHORT[m.month - 1]).join(", ")}`);
    if (estimatedNotes.length) {
      aoa.push([]);
      aoa.push(["* Meses estimados"]);
      estimatedNotes.forEach((line) => aoa.push([line]));
    }
    if (nextYear.skippedSites && nextYear.skippedSites.length) {
      aoa.push([]);
      aoa.push([`Sin historia suficiente (menos de 2 meses), no se proyectan: ${nextYear.skippedSites.join(", ")}`]);
    }
    sheets.push({
      name: `Proyección ${nextYear.targetYear}`, aoa, header, pctCols: [1, 3 + 12 + 3],
      widths: [30, 13, 16, ...Array(12).fill(13), 16, 18, 18, 16],
    });

    const goals = [
      [`METAS SUGERIDAS ${nextYear.targetYear}`],
      [`Proyección de ventas redondeada a Q100. Punto de partida para capturar en Metas de Kioskos; revísala kiosco por kiosco.`],
      [],
      ["Kiosco", ...MONTHS_SHORT, `Total ${nextYear.targetYear}`],
    ];
    const goalsHeader = goals.length - 1;
    const totalsByMonth = new Array(12).fill(0);
    (nextYear.sites || []).forEach((s) => {
      const rounded = (s.months || []).map((m) => roundSuggestedGoal(m.sales));
      rounded.forEach((v, i) => {
        totalsByMonth[i] += v || 0;
      });
      goals.push([s.name, ...rounded, rounded.reduce((a, v) => a + (v || 0), 0)]);
    });
    goals.push(["Total", ...totalsByMonth, totalsByMonth.reduce((a, v) => a + v, 0)]);
    sheets.push({ name: "Metas sugeridas", aoa: goals, header: goalsHeader, pctCols: [], widths: [30, ...Array(12).fill(12), 16] });
  }
  return sheets;
};

/** Escribe y descarga el Excel de proyecciones. */
export const exportForecastExcel = ({ monthEnd, nextYear }) => {
  const sheets = buildForecastSheets({ monthEnd, nextYear });
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    const ws = XLSX.utils.aoa_to_sheet(sheet.aoa);
    sheet.aoa.forEach((row, r) => {
      row.forEach((value, c) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = ws[addr];
        if (!cell) return;
        if (r === 0) {
          cell.s = { font: { ...boldFont, sz: 14 } };
        } else if (r === sheet.header) {
          cell.s = { font: boldFont, fill: fillGray, border: thinBorder, alignment: { horizontal: c === 0 ? "left" : "center", wrapText: true } };
        } else if (r > sheet.header && row.length > 1) {
          const isTotal = row[0] === "Total";
          const style = { border: thinBorder, font: isTotal ? boldFont : baseFont };
          if (cell.t === "n") {
            cell.z = sheet.pctCols.includes(c) ? pctFmt : moneyFmt;
            style.alignment = { horizontal: "right" };
          }
          if (isTotal) style.fill = fillLight;
          cell.s = style;
        } else if (r > 0 && r < sheet.header) {
          cell.s = { font: { ...baseFont, italic: true, color: { rgb: "666666" } } };
        }
      });
    });
    ws["!cols"] = sheet.widths.map((wch) => ({ wch }));
    ws["!rows"] = [];
    ws["!rows"][sheet.header] = { hpt: 32 };
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  });
  const year = nextYear ? nextYear.targetYear : monthEnd ? monthEnd.year : "";
  const fileName = `Finanzas_Kioscos_Proyeccion_${year}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return fileName;
};
