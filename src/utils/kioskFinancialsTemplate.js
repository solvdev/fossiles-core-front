/**
 * Plantilla estándar mensual de ventas/costos por kiosco (.xlsx), en el MISMO layout que los
 * reportes originales para que el importador la lea sin cambios:
 * columna de etiquetas = B, encabezado = fila 8, primer kiosco = columna C, 31 filas de fecha,
 * Total, % Participacion, METAS, % DE META, COSTOS, tasas variables (fila de tasa + fila calculada)
 * y los 10 costos fijos. Los estilos siguen utils/kioskReportExcelStyle.js.
 */
import * as XLSX from "xlsx-js-style";
import { thinBorder, boldFont } from "./kioskReportExcelStyle";
import { MONTHS_ES, daysInMonth } from "./financeFormat";

export const TEMPLATE_LAYOUT = {
  labelCol: 1, // B
  headerRow: 7, // fila 8
  firstSiteCol: 2, // C
  firstDayRow: 8, // fila 9
  dayRows: 31,
};

/** Etiquetas alineadas con los prefijos que reconoce el importador del backend. */
export const FIXED_COST_LABELS = {
  ALQUILER: "Alquiler",
  LUZ: "Luz",
  TELEFONO_INTERNET_PROG: "Telefono, Internet y programacion",
  MANTENIMIENTO: "Mantenimiento",
  SALARIOS_MO_INDIRECTA: "Salarios M.O. indirecta",
  BONIFICACION: "Bonificacion",
  INDEMNIZACION_VACACIONES: "Indemnizacion y vacaciones",
  BONO_14: "Bono 14",
  AGUINALDO: "Aguinaldo",
  SALARIOS_MO_DIRECTA: "Salarios M.O. directa",
};

export const DEFAULT_COST_CATEGORIES = Object.keys(FIXED_COST_LABELS).map((code, i) => ({
  code,
  name: FIXED_COST_LABELS[code],
  sortOrder: i + 1,
}));

const fontBase = { name: "Calibri", sz: 11, color: { rgb: "000000" } };
const FILL_HEADER = { fgColor: { rgb: "D9D9D9" } };
const FILL_SECTION = { fgColor: { rgb: "EDEDED" } };
const FILL_INPUT = { fgColor: { rgb: "FFF9E5" } };
const FILL_OVERFLOW = { fgColor: { rgb: "F2F2F2" } };
const MONEY_FMT = "#,##0.00";
const PCT_FMT = "0.0%";
const DATE_FMT = "dd/mm/yyyy";

const excelSerial = (year, month, day) => Math.round((Date.UTC(year, month - 1, day) - Date.UTC(1899, 11, 30)) / 86400000);

const col = (c) => XLSX.utils.encode_col(c);
const addr = (r, c) => XLSX.utils.encode_cell({ r, c });

/**
 * Construye la hoja. Devuelve { ws, rows } donde `rows` mapea cada bloque a su índice de fila (0-based).
 * siteConfigs (opcional, paralelo a siteNames): { goal, productCostPct, salesCommissionPct,
 * cardCommissionPct, taxPct, costs: {CODE: n} } para prellenar metas, tasas y costos.
 */
export const buildKioskTemplateSheet = ({ year, month, siteNames, categories, siteConfigs = [] }) => {
  const cats = categories && categories.length ? categories : DEFAULT_COST_CATEGORIES;
  const L = TEMPLATE_LAYOUT;
  const nSites = siteNames.length;
  const firstCol = L.firstSiteCol;
  const lastSiteCol = firstCol + nSites - 1;
  const totalCol = lastSiteCol + 1;
  const dim = daysInMonth(year, month);
  const ws = {};

  const style = (extra = {}) => ({
    font: fontBase,
    border: thinBorder,
    alignment: { vertical: "center" },
    ...extra,
  });
  const put = (r, c, cell) => {
    ws[addr(r, c)] = cell;
  };
  const text = (r, c, v, s) => put(r, c, { t: "s", v, s: s || style() });
  const num = (r, c, v, z, s) => put(r, c, { t: "n", v, z, s: s || style({ alignment: { horizontal: "right" } }) });
  const formula = (r, c, f, z, s) =>
    put(r, c, { t: "n", v: 0, f, z, s: s || style({ alignment: { horizontal: "right" } }) });
  const inputCell = (r, c, v, z) => {
    const s = style({ fill: FILL_INPUT, alignment: { horizontal: "right" } });
    if (v === null || v === undefined) put(r, c, { t: "z", v: undefined, s, z });
    else num(r, c, v, z, s);
  };

  // ---- Título (filas 1-7)
  const monthName = MONTHS_ES[month - 1].toUpperCase();
  put(1, L.labelCol, { t: "s", v: "REPORTE DE VENTAS Y COSTOS POR KIOSCO", s: { font: { ...boldFont, sz: 14 } } });
  put(2, L.labelCol, { t: "s", v: `VENTAS ${monthName} ${year}`, s: { font: { ...boldFont, sz: 12 } } });
  put(3, L.labelCol, { t: "s", v: "Formato estandar de importacion (Finanzas por kiosco).", s: { font: fontBase } });
  put(4, L.labelCol, {
    t: "s",
    v: "Capture las ventas diarias en quetzales con IVA. Deje vacio el dia sin datos; 0 significa sin ventas.",
    s: { font: fontBase },
  });
  put(5, L.labelCol, {
    t: "s",
    v: "Las celdas amarillas son de captura. Las demas se calculan; el sistema recalcula al importar.",
    s: { font: fontBase },
  });

  // ---- Encabezado (fila 8)
  const hs = style({ font: boldFont, fill: FILL_HEADER, alignment: { horizontal: "center", vertical: "center", wrapText: true } });
  text(L.headerRow, L.labelCol, "Fecha", hs);
  siteNames.forEach((name, i) => text(L.headerRow, firstCol + i, name, hs));
  text(L.headerRow, totalCol, "Total por dia", hs);

  // ---- Filas de fecha (31, desbordan al mes siguiente como en los originales)
  const day1 = L.firstDayRow;
  const dayN = L.firstDayRow + L.dayRows - 1;
  for (let d = 0; d < L.dayRows; d += 1) {
    const r = day1 + d;
    const date = new Date(Date.UTC(year, month - 1, 1 + d));
    const inMonth = d < dim;
    num(
      r,
      L.labelCol,
      excelSerial(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()),
      DATE_FMT,
      style({ alignment: { horizontal: "center" }, ...(inMonth ? {} : { fill: FILL_OVERFLOW }) })
    );
    for (let i = 0; i < nSites; i += 1) {
      const s = style({ fill: inMonth ? FILL_INPUT : FILL_OVERFLOW, alignment: { horizontal: "right" } });
      put(r, firstCol + i, { t: "z", v: undefined, s, z: MONEY_FMT });
    }
    formula(r, totalCol, `SUM(${col(firstCol)}${r + 1}:${col(lastSiteCol)}${r + 1})`, MONEY_FMT);
  }

  // ---- Bloques inferiores
  let r = dayN + 1;
  const rows = { header: L.headerRow, firstDay: day1, lastDay: dayN };
  const labelStyle = style({ font: boldFont });
  const sectionStyle = style({ font: boldFont, fill: FILL_SECTION });
  const rangeSum = (row, c1 = firstCol, c2 = lastSiteCol) => `SUM(${col(c1)}${row + 1}:${col(c2)}${row + 1})`;
  const cfg = (i) => siteConfigs[i] || null;

  const eachSite = (fn) => {
    for (let i = 0; i < nSites; i += 1) fn(firstCol + i, i);
  };
  const filler = (row, fillStyle) => {
    for (let c = L.labelCol + 1; c <= totalCol; c += 1) {
      if (!ws[addr(row, c)]) put(row, c, { t: "s", v: "", s: fillStyle || style() });
    }
  };

  rows.total = r;
  text(r, L.labelCol, "Total", labelStyle);
  eachSite((c) => formula(r, c, `SUM(${col(c)}${day1 + 1}:${col(c)}${dayN + 1})`, MONEY_FMT, style({ font: boldFont, alignment: { horizontal: "right" } })));
  formula(r, totalCol, rangeSum(r), MONEY_FMT, style({ font: boldFont, alignment: { horizontal: "right" } }));
  const totalRowNum = r + 1;

  r += 1;
  rows.participation = r;
  text(r, L.labelCol, "% Participacion", labelStyle);
  eachSite((c) => formula(r, c, `IF($${col(totalCol)}$${totalRowNum}=0,0,${col(c)}${totalRowNum}/$${col(totalCol)}$${totalRowNum})`, PCT_FMT));
  filler(r);

  r += 1;
  rows.goals = r;
  text(r, L.labelCol, "METAS", labelStyle);
  eachSite((c, i) => inputCell(r, c, cfg(i) ? cfg(i).goal : null, MONEY_FMT));
  formula(r, totalCol, rangeSum(r), MONEY_FMT);
  const goalsNum = r + 1;

  r += 1;
  rows.goalPct = r;
  text(r, L.labelCol, "% DE META", labelStyle);
  eachSite((c) => formula(r, c, `IF(${col(c)}${goalsNum}=0,0,${col(c)}${totalRowNum}/${col(c)}${goalsNum})`, PCT_FMT));
  formula(r, totalCol, `IF(${col(totalCol)}${goalsNum}=0,0,${col(totalCol)}${totalRowNum}/${col(totalCol)}${goalsNum})`, PCT_FMT);

  r += 1;
  rows.costsTitle = r;
  text(r, L.labelCol, "COSTOS", sectionStyle);
  filler(r, sectionStyle);

  r += 1;
  rows.variableTitle = r;
  text(r, L.labelCol, "Costos Variables", sectionStyle);
  filler(r, sectionStyle);

  const variableDefs = [
    { key: "product", label: "Costo del Pdcto", field: "productCostPct", calc: (c, rate) => `${col(c)}${totalRowNum}*${col(c)}${rate + 1}` },
    { key: "sales", label: "Comision de venta", field: "salesCommissionPct", calc: (c, rate) => `${col(c)}${totalRowNum}/1.12*${col(c)}${rate + 1}` },
    { key: "card", label: "Comision tarjeta", field: "cardCommissionPct", calc: (c, rate) => `${col(c)}${totalRowNum}*${col(c)}${rate + 1}` },
    { key: "tax", label: "IVA", field: "taxPct", calc: (c, rate) => `${col(c)}${totalRowNum}*${col(c)}${rate + 1}` },
  ];
  rows.rates = {};
  rows.rateCalc = {};
  variableDefs.forEach((def) => {
    r += 1;
    rows.rates[def.key] = r;
    text(r, L.labelCol, def.label, labelStyle);
    const rateRow = r;
    eachSite((c, i) => inputCell(rateRow, c, cfg(i) ? cfg(i)[def.field] : null, PCT_FMT));
    filler(r);
    r += 1;
    rows.rateCalc[def.key] = r;
    text(r, L.labelCol, "", style());
    const calcRow = r;
    eachSite((c) => formula(calcRow, c, def.calc(c, rateRow), MONEY_FMT));
    formula(calcRow, totalCol, rangeSum(calcRow), MONEY_FMT);
  });

  r += 1;
  rows.variableTotal = r;
  text(r, L.labelCol, "Total CI", labelStyle);
  const variableTotalRow = r;
  const calcRefs = (c) => variableDefs.map((d) => `${col(c)}${rows.rateCalc[d.key] + 1}`).join("+");
  eachSite((c) => formula(variableTotalRow, c, calcRefs(c), MONEY_FMT, style({ font: boldFont, alignment: { horizontal: "right" } })));
  formula(variableTotalRow, totalCol, rangeSum(variableTotalRow), MONEY_FMT, style({ font: boldFont, alignment: { horizontal: "right" } }));

  r += 1;
  rows.fixedTitle = r;
  text(r, L.labelCol, "Costos Fijos", sectionStyle);
  filler(r, sectionStyle);

  rows.costs = {};
  cats.forEach((cat) => {
    r += 1;
    rows.costs[cat.code] = r;
    text(r, L.labelCol, FIXED_COST_LABELS[cat.code] || cat.name, style());
    const costRow = r;
    eachSite((c, i) => inputCell(costRow, c, cfg(i) && cfg(i).costs ? cfg(i).costs[cat.code] ?? null : null, MONEY_FMT));
    formula(costRow, totalCol, rangeSum(costRow), MONEY_FMT);
  });
  const firstCostRow = rows.costs[cats[0].code];
  const lastCostRow = r;

  r += 1;
  rows.fixedTotal = r;
  text(r, L.labelCol, "Total CI", labelStyle);
  const fixedTotalRow = r;
  const boldNum = style({ font: boldFont, alignment: { horizontal: "right" } });
  eachSite((c) => formula(fixedTotalRow, c, `SUM(${col(c)}${firstCostRow + 1}:${col(c)}${lastCostRow + 1})`, MONEY_FMT, boldNum));
  formula(fixedTotalRow, totalCol, rangeSum(fixedTotalRow), MONEY_FMT, boldNum);

  r += 1;
  rows.operating = r;
  text(r, L.labelCol, "Total Cto Oper.", labelStyle);
  const opRow = r;
  [...Array(nSites).keys(), "total"].forEach((k) => {
    const c = k === "total" ? totalCol : firstCol + k;
    formula(opRow, c, `${col(c)}${variableTotalRow + 1}+${col(c)}${fixedTotalRow + 1}`, MONEY_FMT, boldNum);
  });

  r += 1;
  rows.difference = r;
  text(r, L.labelCol, "Diferencia Vta", labelStyle);
  const diffRow = r;
  [...Array(nSites).keys(), "total"].forEach((k) => {
    const c = k === "total" ? totalCol : firstCol + k;
    formula(diffRow, c, `${col(c)}${totalRowNum}-${col(c)}${opRow + 1}`, MONEY_FMT, boldNum);
  });

  r += 1;
  rows.margin = r;
  text(r, L.labelCol, "MARGEN", labelStyle);
  const marginRow = r;
  [...Array(nSites).keys(), "total"].forEach((k) => {
    const c = k === "total" ? totalCol : firstCol + k;
    formula(marginRow, c, `IF(${col(c)}${totalRowNum}=0,0,${col(c)}${diffRow + 1}/${col(c)}${totalRowNum})`, PCT_FMT, boldNum);
  });

  r += 1;
  rows.breakEven = r;
  text(r, L.labelCol, "Punto de Equilibrio", labelStyle);
  const beRow = r;
  eachSite((c) => {
    const denom = `(1-(${col(c)}${rows.rates.sales + 1}+${col(c)}${rows.rates.product + 1}+${col(c)}${rows.rates.card + 1}+${col(c)}${rows.rates.tax + 1}))`;
    formula(beRow, c, `IF(${denom}<=0,0,${col(c)}${fixedTotalRow + 1}/${denom})`, MONEY_FMT, boldNum);
  });
  filler(r);

  r += 1;
  rows.breakEvenDaily = r;
  text(r, L.labelCol, "PE DIARIO", labelStyle);
  eachSite((c) => formula(r, c, `${col(c)}${beRow + 1}/${dim}`, MONEY_FMT, boldNum));
  filler(r);

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r, c: totalCol } });
  ws["!cols"] = [
    { wch: 2 },
    { wch: 34 },
    ...siteNames.map(() => ({ wch: 15 })),
    { wch: 16 },
  ];
  ws["!rows"] = [];
  ws["!rows"][L.headerRow] = { hpt: 32 };

  return { ws, rows, layout: { ...L, totalCol, lastSiteCol, daysInMonth: dim } };
};

export const kioskTemplateFileName = (year, month) => `VENTAS ${MONTHS_ES[month - 1].toUpperCase()} ${year}.xlsx`;

export const buildKioskTemplateWorkbook = (opts) => {
  const { ws } = buildKioskTemplateSheet(opts);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reporte de Vtas");
  return wb;
};

/** Genera y descarga la plantilla en el navegador. */
export const downloadKioskTemplate = (opts) => {
  const wb = buildKioskTemplateWorkbook(opts);
  XLSX.writeFile(wb, kioskTemplateFileName(opts.year, opts.month));
};
