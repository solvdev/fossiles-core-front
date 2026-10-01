import {
  FIRST_SITE_COL,
  HEADER_ROW_INDEX,
  buildForecastSheets,
  buildOriginalSheetLayout,
  ratesBySiteFromConfig,
  roundSuggestedGoal,
} from "../kioskFinancialsExport";
import { FINANCE_GLOSSARY } from "../kioskFinancialsGlossary";

const categories = [
  { code: "ALQUILER", name: "Alquiler" },
  { code: "LUZ", name: "Luz" },
];

const matrix = {
  year: 2025,
  month: 1,
  sites: [
    { siteId: 1, name: "MIRAFLORES II" },
    { siteId: 2, name: "PERI" },
  ],
  days: [
    { date: "2025-01-01", values: { 1: null, 2: null }, total: 0, cumulative: 0 },
    { date: "2025-01-02", values: { 1: 100.5, 2: 0 }, total: 100.5, cumulative: 100.5 },
  ],
  siteTotals: { 1: 100.5, 2: 0 },
  grandTotal: 100.5,
};

const pnlSite = (siteId, sales) => ({
  siteId,
  sales,
  goal: 200,
  goalPct: sales / 200,
  participationPct: siteId === 1 ? 1 : 0,
  variable: { productCost: sales * 0.18, salesCommission: 1, cardCommission: 2, tax: 3, total: 6 + sales * 0.18 },
  fixed: { byCategory: { ALQUILER: 50, LUZ: 0 }, total: 50 },
  totalCost: 80,
  difference: sales - 80,
  margin: sales ? (sales - 80) / sales : null,
  breakEven: 90,
  breakEvenDaily: 2.9,
});

const pnl = {
  sites: [pnlSite(1, 100.5), pnlSite(2, 0)],
  totals: { ...pnlSite(1, 100.5), participationPct: 1 },
};

const config = {
  sites: [
    {
      siteId: 1,
      months: [
        { month: 1, productCostPct: 0.18, salesCommissionPct: 0.04, cardCommissionPct: 0.025, taxPct: 0.025 },
        { month: 2, productCostPct: 0.5 },
      ],
    },
  ],
};

const build = () => buildOriginalSheetLayout({ year: 2025, month: 1, matrix, pnl, config, categories });

describe("buildOriginalSheetLayout", () => {
  const layout = build();
  const { aoa } = layout;
  const labelAt = (r) => aoa[r][1];

  test("encabezado en la fila 8: Fecha en B y kioscos desde C", () => {
    expect(layout.headerRow).toBe(HEADER_ROW_INDEX);
    expect(HEADER_ROW_INDEX).toBe(7);
    const header = aoa[HEADER_ROW_INDEX];
    expect(header[0]).toBeNull();
    expect(header[1]).toBe("Fecha");
    expect(header[FIRST_SITE_COL]).toBe("MIRAFLORES II");
    expect(header[FIRST_SITE_COL + 1]).toBe("PERI");
    expect(header[layout.totalCol]).toBe("Total por día");
    expect(header[layout.cumCol]).toBe("Acumulado");
    expect(layout.rows[HEADER_ROW_INDEX].kind).toBe("header");
  });

  test("título con mes y año en el bloque superior", () => {
    expect(aoa[3][1]).toBe("MES: ENERO 2025");
  });

  test("filas de días: fecha serial de Excel; un día sin operación se escribe como 0, no en blanco", () => {
    const d1 = aoa[HEADER_ROW_INDEX + 1];
    const d2 = aoa[HEADER_ROW_INDEX + 2];
    // 2025-01-01 -> serial 45658
    expect(d1[1]).toBe(45658);
    expect(d2[1]).toBe(45659);
    expect(d1[FIRST_SITE_COL]).toBe(0); // sin dato = no operó = 0
    expect(d1[layout.totalCol]).toBe(0);
    expect(d1[layout.cumCol]).toBe(0);
    expect(d2[FIRST_SITE_COL]).toBe(100.5);
    expect(d2[FIRST_SITE_COL + 1]).toBe(0);
    expect(d2[layout.totalCol]).toBe(100.5);
    expect(d2[layout.cumCol]).toBe(100.5);
  });

  test("secuencia de etiquetas idéntica al Excel original", () => {
    const start = HEADER_ROW_INDEX + 1 + matrix.days.length;
    const labels = aoa.slice(start, layout.coreRowCount).map((r) => r[1]);
    expect(labels).toEqual([
      "Total",
      "% Participación",
      "METAS",
      "% DE META",
      null, // fila en blanco
      "COSTOS",
      "Costos Variables",
      "Costo del Pdcto",
      "",
      "Comision de venta",
      "",
      "Comision tarjeta",
      "",
      "IVA",
      "",
      "Total costos variables",
      "Costos Fijos",
      "Alquiler",
      "Luz",
      "Total costos fijos",
      "Total costo operativo",
      "Utilidad o pérdida (Ventas − Total costo operativo)",
      "Margen de utilidad (Utilidad ÷ Ventas)",
      "Punto de equilibrio (tasas de cada kiosco)",
      "Punto de equilibrio diario",
    ]);
  });

  test("la fila del punto de equilibrio dice el método con que se midió", () => {
    const flatLayout = buildOriginalSheetLayout({
      year: 2025, month: 1, matrix, pnl: { ...pnl, breakEvenMode: "FLAT" }, config, categories,
    });
    const labels = flatLayout.aoa.slice(0, flatLayout.coreRowCount).map((r) => r[1]);
    expect(labels).toContain("Punto de equilibrio (27 % fijo)");
  });

  test("agrega un glosario debajo del reporte sin mover las filas anteriores", () => {
    const glossaryRows = aoa.slice(layout.coreRowCount + 2);
    expect(aoa[layout.coreRowCount + 1][1]).toBe("GLOSARIO");
    expect(glossaryRows.length).toBe(FINANCE_GLOSSARY.length);
    glossaryRows.forEach((row, i) => {
      expect(row[1]).toBe(FINANCE_GLOSSARY[i].term);
      expect(row[FIRST_SITE_COL]).toBe(FINANCE_GLOSSARY[i].definition);
    });
    const terms = glossaryRows.map((r) => r[1]);
    expect(terms).toEqual(expect.arrayContaining(["Utilidad o pérdida", "Margen de utilidad", "Punto de equilibrio"]));
    expect(layout.rows[layout.coreRowCount + 2].kind).toBe("glossary");
  });

  test("filas de tasa traen el porcentaje del mes y la calculada el monto", () => {
    const start = HEADER_ROW_INDEX + 1 + matrix.days.length;
    const rateRow = aoa[start + 7];
    const calcRow = aoa[start + 8];
    expect(labelAt(start + 7)).toBe("Costo del Pdcto");
    expect(rateRow[FIRST_SITE_COL]).toBe(0.18);
    expect(rateRow[FIRST_SITE_COL + 1]).toBeNull(); // sin config para el kiosco 2
    expect(calcRow[FIRST_SITE_COL]).toBeCloseTo(18.09);
    expect(layout.rows[start + 7]).toMatchObject({ kind: "rate", fmt: "pct" });
    expect(layout.rows[start + 8]).toMatchObject({ kind: "calc", fmt: "money" });
  });

  test("totales y resultado por kiosco y en la columna de total", () => {
    const last = layout.coreRowCount - 1;
    expect(labelAt(last)).toBe("Punto de equilibrio diario");
    expect(aoa[last - 1][FIRST_SITE_COL]).toBe(90);
    const diff = aoa[last - 3];
    expect(diff[1]).toBe("Utilidad o pérdida (Ventas − Total costo operativo)");
    expect(diff[FIRST_SITE_COL]).toBeCloseTo(20.5);
    expect(diff[layout.totalCol]).toBeCloseTo(20.5);
  });

  test("todas las filas tienen el mismo ancho", () => {
    const widths = new Set(aoa.map((r) => r.length));
    expect(widths.size).toBe(1);
    expect([...widths][0]).toBe(layout.colCount);
  });

  test("sin matriz usa los sitios del P&L", () => {
    const l = buildOriginalSheetLayout({ year: 2025, month: 1, matrix: null, pnl, config: null, categories });
    expect(l.siteCount).toBe(2);
    expect(l.aoa[HEADER_ROW_INDEX][1]).toBe("Fecha");
  });
});

describe("ratesBySiteFromConfig", () => {
  test("toma sólo el mes pedido", () => {
    const rates = ratesBySiteFromConfig(config, 2);
    expect(rates[1].productCostPct).toBe(0.5);
    expect(ratesBySiteFromConfig(config, 5)).toEqual({});
    expect(ratesBySiteFromConfig(null, 1)).toEqual({});
  });
});

describe("exportOriginalSheetExcel", () => {
  test("escribe la hoja con celdas B8/C8, formatos y nombre de archivo", () => {
    jest.resetModules();
    const spy = jest.fn();
    jest.doMock("xlsx-js-style", () => ({ ...jest.requireActual("xlsx-js-style"), writeFile: spy }));
    // eslint-disable-next-line global-require
    const { exportOriginalSheetExcel } = require("../kioskFinancialsExport");
    const name = exportOriginalSheetExcel({ year: 2025, month: 1, matrix, pnl, config, categories });
    expect(name).toBe("Finanzas_Kioscos_2025-01.xlsx");
    expect(spy).toHaveBeenCalledTimes(1);
    const [wb, file] = spy.mock.calls[0];
    expect(file).toBe(name);
    const ws = wb.Sheets[wb.SheetNames[0]];
    expect(ws.B8.v).toBe("Fecha");
    expect(ws.C8.v).toBe("MIRAFLORES II");
    expect(ws.B9.z).toBe("dd/mm/yyyy");
    expect(ws.C10.v).toBe(100.5);
    expect(ws.C10.z).toBe('"Q"#,##0.00;-"Q"#,##0.00'); // moneda con quetzales
    expect(ws.C9.v).toBe(0); // día sin operación: 0, no vacío
    expect(ws.D10.v).toBe(0); // cero explícito
    expect(ws.C8.s.fill.fgColor.rgb).toBe("D9D9D9");
    expect(ws["!cols"][1].wch).toBeGreaterThan(20);
    jest.dontMock("xlsx-js-style");
  });
});

describe("buildForecastSheets", () => {
  const month = (m, sales, estimated = false) => ({ month: m, baseSales: sales / 1.1, sales, estimated });
  const months = (fn) => Array.from({ length: 12 }, (_, i) => month(i + 1, fn(i)));
  const monthEnd = {
    asOf: "2026-09-16", year: 2026, month: 9, daysElapsed: 15, daysRemaining: 15, daysInMonth: 30,
    sites: [
      { siteId: 1, name: "MIRAFLORES II", actualToDate: 1650, projected: 3300, low: 3100, high: 3500, goal: 3000, goalPctProjected: 1.1,
        difference: 1528.79, margin: 0.4633, method: "WEEKDAY" },
      { siteId: 2, name: "NUEVO", actualToDate: 300, projected: null, low: null, high: null, goal: null, goalPctProjected: null,
        difference: null, margin: null, method: "INSUFFICIENT" },
    ],
    totals: { actualToDate: 1950, projected: 3300, goal: 3000, goalPctProjected: 1.1, difference: 1528.79, margin: 0.4633 },
  };
  const nextYear = {
    asOf: "2026-09-16", baseYear: 2026, targetYear: 2027, growthMode: "SITE_OR_COMPANY", companyGrowthFactor: 1.1,
    sites: [{
      siteId: 1, name: "MIRAFLORES II", growthFactor: 1.1, growthSource: "SITE", growthCapped: false, baseSales: 40150, sales: 44165,
      difference: 10000, margin: 0.2264, months: months((i) => 3000 + i * 130.4),
    }, {
      siteId: 4, name: "ABRIL", growthFactor: 1.2, growthSource: "COMPANY", growthCapped: true, baseSales: 20000, sales: 24000,
      difference: 1000, margin: 0.04, months: months((i) => 2000).map((m, i) => ({ ...m, estimated: i < 2 })),
    }],
    skippedSites: ["MUY NUEVO"],
    totals: { sales: 68165, baseSales: 60150, difference: 11000, margin: 0.16, months: months((i) => 5000 + i * 100) },
  };

  test("cierre del mes: una fila por kiosco, vacío donde no hay proyección y total", () => {
    const [sheet] = buildForecastSheets({ monthEnd, nextYear: null });
    expect(sheet.name).toBe("Cierre del mes");
    const header = sheet.aoa[sheet.header];
    expect(header.slice(0, 3)).toEqual(["Kiosco", "Ventas al día", "Cierre proyectado"]);
    const rows = sheet.aoa.slice(sheet.header + 1);
    expect(rows[0].slice(0, 3)).toEqual(["MIRAFLORES II", 1650, 3300]);
    expect(rows[0][6]).toBe(1.1); // % meta al cierre como fracción (el formato lo muestra en %)
    expect(rows[1].slice(0, 4)).toEqual(["NUEVO", 300, null, null]);
    expect(rows[1][9]).toBe("Sin historia suficiente");
    expect(rows[2][0]).toBe("Total");
    expect(sheet.pctCols).toEqual([6, 8]);
    expect(sheet.aoa.every((r) => r.length === 0 || r.length <= header.length)).toBe(true);
  });

  test("año siguiente: crecimiento, 12 meses, totales y notas de meses estimados y kioscos omitidos", () => {
    const sheets = buildForecastSheets({ monthEnd: null, nextYear });
    const sheet = sheets[0];
    expect(sheet.name).toBe("Proyección 2027");
    const header = sheet.aoa[sheet.header];
    expect(header.slice(0, 6)).toEqual(["Kiosco", "Crecimiento", "Origen", "Ene", "Feb", "Mar"]);
    expect(header).toHaveLength(3 + 12 + 4);
    const first = sheet.aoa[sheet.header + 1];
    expect(first[0]).toBe("MIRAFLORES II");
    expect(first[1]).toBeCloseTo(0.1); // +10 %
    expect(first[2]).toBe("propio");
    expect(first).toHaveLength(header.length);
    expect(sheet.aoa[sheet.header + 2][2]).toBe("global (limitado)");
    const flat = sheet.aoa.flat().filter((v) => typeof v === "string");
    expect(flat).toContain("ABRIL: Ene, Feb");
    expect(flat.some((v) => v.includes("MUY NUEVO"))).toBe(true);
    expect(sheet.pctCols).toEqual([1, 18]);
  });

  test("metas sugeridas: la proyección redondeada a Q100 y su total", () => {
    const goals = buildForecastSheets({ monthEnd: null, nextYear })[1];
    expect(goals.name).toBe("Metas sugeridas");
    const first = goals.aoa[goals.header + 1];
    expect(first.slice(0, 3)).toEqual(["MIRAFLORES II", 3000, 3100]); // 3000 y 3130.4 -> 3100
    expect(first[13]).toBe(first.slice(1, 13).reduce((a, v) => a + v, 0));
    const total = goals.aoa[goals.aoa.length - 1];
    expect(total[0]).toBe("Total");
    expect(total[13]).toBe(total.slice(1, 13).reduce((a, v) => a + v, 0));
    expect(roundSuggestedGoal(1249.9)).toBe(1200);
    expect(roundSuggestedGoal(1250)).toBe(1300);
    expect(roundSuggestedGoal(null)).toBeNull();
  });

  test("crecimiento fijo: la nota lo dice", () => {
    const sheet = buildForecastSheets({ monthEnd: null, nextYear: { ...nextYear, growthMode: "OVERRIDE", overrideGrowthPct: 8 } })[0];
    expect(sheet.aoa[2][0]).toBe("Crecimiento fijo para todos los kioscos: +8.0 %.");
  });
});
