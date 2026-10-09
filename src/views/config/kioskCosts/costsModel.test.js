import {
  applyPending,
  buildChanges,
  costField,
  effectiveValue,
  fixedTotal,
  indexConfig,
  isMonthComplete,
  summarizePending,
  fmtPctCell,
} from "./costsModel";
import { buildMonthGrid, buildSiteGrid } from "./gridBuilders";

const categories = [
  { code: "ALQUILER", name: "Alquiler", sortOrder: 1 },
  { code: "LUZ", name: "Luz", sortOrder: 2 },
];

const config = {
  year: 2026,
  categories,
  sites: [
    {
      siteId: 1,
      name: "MIRAFLORES II",
      status: "ACTIVE",
      months: [
        {
          month: 1,
          goal: 130000,
          productCostPct: 0.18,
          salesCommissionPct: 0.04,
          cardCommissionPct: 0.025,
          taxPct: 0.025,
          costs: { ALQUILER: 14674.89, LUZ: 0 },
          complete: true,
        },
        { month: 2, goal: null, productCostPct: null, salesCommissionPct: null, cardCommissionPct: null, taxPct: null, costs: {}, complete: false },
      ],
    },
    { siteId: 2, name: "ESKALA", status: "CLOSED", months: [] },
  ],
};

describe("costsModel", () => {
  const index = indexConfig(config);

  it("efectivo = pendiente sobre el valor del servidor", () => {
    expect(effectiveValue(index, {}, 1, 1, "goal")).toBe(130000);
    expect(effectiveValue(index, { "1|1|goal": 150000 }, 1, 1, "goal")).toBe(150000);
    expect(effectiveValue(index, { "1|1|goal": null }, 1, 1, "goal")).toBeNull();
    expect(effectiveValue(index, {}, 1, 3, costField("ALQUILER"))).toBeNull();
    expect(effectiveValue(index, {}, 2, 1, "goal")).toBeNull();
  });

  it("applyPending quita el cambio si vuelve al valor original", () => {
    const ref = { siteId: 1, month: 1, field: "goal" };
    let pending = applyPending({}, index, ref, 150000);
    expect(pending).toEqual({ "1|1|goal": 150000 });
    pending = applyPending(pending, index, ref, 130000);
    expect(pending).toEqual({});
    // borrar una celda con valor es un cambio (null explícito)
    pending = applyPending({}, index, ref, null);
    expect(pending).toEqual({ "1|1|goal": null });
    // borrar una celda ya vacía no es cambio
    expect(applyPending({}, index, { siteId: 1, month: 2, field: "goal" }, null)).toEqual({});
  });

  it("buildChanges agrupa por sitio y mes, sólo con lo modificado", () => {
    const pending = {
      "1|3|goal": 120000,
      "1|3|productCostPct": 0.18,
      "1|3|cost:ALQUILER": 15000,
      "1|3|cost:LUZ": null,
      "2|1|cost:LUZ": 50,
    };
    expect(buildChanges(pending)).toEqual([
      {
        siteId: 1,
        month: 3,
        goal: 120000,
        productCostPct: 0.18,
        costs: { ALQUILER: 15000, LUZ: null },
      },
      { siteId: 2, month: 1, costs: { LUZ: 50 } },
    ]);
  });

  it("completitud usa las reglas del contrato (0 cuenta como lleno)", () => {
    expect(isMonthComplete(index, {}, categories, 1, 1)).toBe(true);
    expect(isMonthComplete(index, {}, categories, 1, 2)).toBe(false);
    expect(isMonthComplete(index, { "1|1|cost:LUZ": null }, categories, 1, 1)).toBe(false);
    expect(fixedTotal(index, {}, categories, 1, 1)).toBeCloseTo(14674.89, 2);
    expect(fixedTotal(index, {}, categories, 1, 2)).toBeNull();
  });

  it("resume cambios por kiosco", () => {
    const summary = summarizePending({ "1|3|goal": 1, "1|4|goal": 2, "2|1|goal": 3 }, index);
    expect(summary).toEqual([
      { siteId: 2, name: "ESKALA", months: [1], cells: 1 },
      { siteId: 1, name: "MIRAFLORES II", months: [3, 4], cells: 2 },
    ]);
  });

  it("formato de tasas en celda", () => {
    expect(fmtPctCell(0.025)).toBe("2.5%");
    expect(fmtPctCell(0.18)).toBe("18%");
    expect(fmtPctCell(null)).toBe("");
  });
});

describe("gridBuilders", () => {
  const index = indexConfig(config);

  it("grilla por kiosco: filas de categorías, total fijo, meta y 4 tasas; 12 meses + total", () => {
    const model = buildSiteGrid({ index, pending: {}, categories, siteId: 1 });
    expect(model.colCount).toBe(13);
    // sección + 2 categorías + total + sección + meta + 4 tasas
    expect(model.rowCount).toBe(1 + 2 + 1 + 1 + 1 + 4);
    expect(model.cellAt(0, 0)).toBeNull(); // sección
    const alquilerEne = model.cellAt(1, 0);
    expect(alquilerEne.value).toBeCloseTo(14674.89, 2);
    expect(alquilerEne.ref).toEqual({ siteId: 1, month: 1, field: "cost:ALQUILER" });
    const fixedEne = model.cellAt(3, 0);
    expect(fixedEne.calc).toBe(true);
    expect(fixedEne.value).toBeCloseTo(14674.89, 2);
    const goalTotal = model.cellAt(5, 12);
    expect(goalTotal.value).toBe(130000);
    const rateAvg = model.cellAt(6, 12);
    expect(rateAvg.value).toBeCloseTo(0.18, 6);
    expect(model.cols[0].complete).toBe(true);
    expect(model.cols[1].complete).toBe(false);
  });

  it("marca celdas modificadas", () => {
    const model = buildSiteGrid({ index, pending: { "1|2|goal": 99 }, categories, siteId: 1 });
    const cell = model.cellAt(5, 1);
    expect(cell.value).toBe(99);
    expect(cell.dirty).toBe(true);
    expect(model.cellAt(5, 0).dirty).toBe(false);
  });

  it("grilla por mes: una fila por kiosco más total, columnas por categoría/meta/tasas", () => {
    const siteList = [
      { siteId: 1, name: "MIRAFLORES II", status: "ACTIVE" },
      { siteId: 2, name: "ESKALA", status: "CLOSED" },
    ];
    const model = buildMonthGrid({ index, pending: {}, categories, siteList, month: 1 });
    expect(model.rowCount).toBe(3);
    expect(model.colCount).toBe(2 + 1 + 1 + 4);
    expect(model.cellAt(0, 0).value).toBeCloseTo(14674.89, 2);
    expect(model.cellAt(1, 0).value).toBeNull();
    const footer = model.cellAt(2, 0);
    expect(footer.calc).toBe(true);
    expect(footer.value).toBeCloseTo(14674.89, 2);
  });

  describe("meta administrada en Metas de Kioskos", () => {
    const linkedConfig = {
      year: 2026,
      categories,
      sites: [
        {
          siteId: 27,
          name: "MIRAFLORES II",
          status: "ACTIVE",
          goalManagedExternally: true,
          months: [{ month: 9, goal: 130000, goalSource: "METAS_KIOSCOS", costs: {}, complete: false }],
        },
        {
          siteId: 5,
          name: "MAJADAS 11",
          status: "CLOSED",
          goalManagedExternally: false,
          months: [{ month: 9, goal: 5000, goalSource: "CONFIG", costs: {}, complete: false }],
        },
      ],
    };

    it("la celda de meta de un kiosco real es de solo lectura y muestra el valor del módulo", () => {
      const index = indexConfig(linkedConfig);
      const model = buildSiteGrid({ index, pending: {}, categories, siteId: 27 });
      const goalRow = 5; // sección + 2 categorías + total + sección + meta
      const cell = model.cellAt(goalRow, 8); // septiembre
      expect(cell.calc).toBe(true); // calc = no editable en CostGrid
      expect(cell.ref).toBeUndefined();
      expect(cell.goalExternal).toBe(true);
      expect(cell.goalSource).toBe("METAS_KIOSCOS");
      expect(cell.value).toBe(130000);
    });

    it("la meta de un sitio histórico sí es editable", () => {
      const index = indexConfig(linkedConfig);
      const model = buildSiteGrid({ index, pending: {}, categories, siteId: 5 });
      const cell = model.cellAt(5, 8);
      expect(cell.calc).toBeUndefined();
      expect(cell.ref).toEqual({ siteId: 5, month: 9, field: "goal" });
      expect(cell.value).toBe(5000);
    });

    it("en la vista por mes la meta del kiosco real es solo lectura y la del histórico editable", () => {
      const index = indexConfig(linkedConfig);
      const siteList = [
        { siteId: 27, name: "MIRAFLORES II", status: "ACTIVE" },
        { siteId: 5, name: "MAJADAS 11", status: "CLOSED" },
      ];
      const model = buildMonthGrid({ index, pending: {}, categories, siteList, month: 9 });
      const goalCol = model.cols.findIndex((c) => c.field === "goal");
      expect(model.cellAt(0, goalCol).goalExternal).toBe(true);
      expect(model.cellAt(0, goalCol).ref).toBeUndefined();
      expect(model.cellAt(1, goalCol).ref).toEqual({ siteId: 5, month: 9, field: "goal" });
    });
  });

  describe("comisión de venta fija (4 %)", () => {
    const cfg = {
      year: 2026,
      categories,
      sites: [
        {
          siteId: 1,
          name: "MIRAFLORES II",
          status: "ACTIVE",
          months: [
            // la base pudo traer cualquier cosa (aquí 0.31 %): la pantalla no la usa ni la deja editar
            { month: 9, goal: 100000, productCostPct: 0.18, salesCommissionPct: 0.0031, cardCommissionPct: 0.025, taxPct: 0.025, costs: { ALQUILER: 1, LUZ: 1 } },
          ],
        },
      ],
    };

    it("la fila es de solo lectura y siempre muestra 4 %", () => {
      const index = indexConfig(cfg);
      const model = buildSiteGrid({ index, pending: {}, categories, siteId: 1 });
      const salesRateRow = 7; // sección + 2 categorías + total + sección + meta + costo producto + comisión de venta
      const cell = model.cellAt(salesRateRow, 8); // septiembre
      expect(model.rows[salesRateRow].field).toBe("salesCommissionPct");
      expect(cell.calc).toBe(true);
      expect(cell.fixedRate).toBe(true);
      expect(cell.ref).toBeUndefined();
      expect(cell.value).toBe(0.04);
      expect(model.cellAt(salesRateRow, 0).value).toBe(0.04); // enero, aunque no tenga configuración
    });

    it("la vista por mes también la muestra fija y de solo lectura", () => {
      const index = indexConfig(cfg);
      const model = buildMonthGrid({ index, pending: {}, categories, siteList: [{ siteId: 1, name: "MIRAFLORES II", status: "ACTIVE" }], month: 9 });
      const col = model.cols.findIndex((c) => c.field === "salesCommissionPct");
      const cell = model.cellAt(0, col);
      expect(cell.fixedRate).toBe(true);
      expect(cell.value).toBe(0.04);
      expect(cell.ref).toBeUndefined();
    });

    it("no cuenta para saber si un mes tiene datos ni si está completo", () => {
      const empty = indexConfig({ year: 2026, categories, sites: [{ siteId: 1, name: "X", status: "ACTIVE", months: [{ month: 1, salesCommissionPct: 0.04, costs: {} }] }] });
      // el servidor devuelve 4 % siempre; un mes sin nada más NO es "con datos"
      expect(buildSiteGrid({ index: empty, pending: {}, categories, siteId: 1 }).cols[0].hasData).toBe(false);
      // y un mes con meta + las otras 3 tasas + costos está completo aunque la comisión viniera vacía
      const full = indexConfig({ year: 2026, categories, sites: [{ siteId: 1, name: "X", status: "ACTIVE", months: [{ month: 1, goal: 1, productCostPct: 0.18, salesCommissionPct: null, cardCommissionPct: 0.02, taxPct: 0.025, costs: { ALQUILER: 1, LUZ: 0 } }] }] });
      expect(isMonthComplete(full, {}, categories, 1, 1)).toBe(true);
    });
  });
});
