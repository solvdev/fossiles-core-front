import {
  FIRST_SITE_COL,
  HEADER_ROW_INDEX,
  buildOriginalSheetLayout,
  ratesBySiteFromConfig,
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
      "Punto de equilibrio",
      "Punto de equilibrio diario",
    ]);
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
