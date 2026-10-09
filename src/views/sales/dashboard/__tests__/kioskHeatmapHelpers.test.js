import {
  CATEGORY_FILTERS,
  FILTER_ALL,
  FILTER_NONE,
  MAX_DAY_MATRIX_DAYS,
  MAX_HEATMAP_DAYS,
  buildCategorySummary,
  buildDayMatrix,
  buildHeatmapModel,
  buildKioskInsights,
  buildWeekdayMatrix,
  buildWeekdayRow,
  canShowDayMatrix,
  categoryCounts,
  categoryKey,
  categoryRank,
  filterSites,
  fmtCellAmount,
  heatClass,
  isHeatmapEmpty,
  totalRowLabel,
  weekdayOccurrences,
} from "../kioskHeatmapHelpers";
import { categoryLabel, normalizeCategory } from "../salesDashboardHelpers";
import { SEPT, rangeOf, septemberResponse, weekdayOf } from "../__fixtures__/kioskHeatmapFixtures";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

// septemberResponse(): cinco sitios (Cat. A ×2, B, C sin venta y sin clasificar) con la venta repetida por día de la
// semana; sus totales, mejores días y variaciones están documentados en __fixtures__/kioskHeatmapFixtures.js.
const septemberModel = () => buildHeatmapModel(septemberResponse());
const insightText = (insights, id) => (insights.find((i) => i.id === id) || {}).text;

/** Modelo mínimo con las filas dadas: [{ name, category, daily, previousTotal? }] sobre los días `days`. */
const miniModel = (days, sites, categories = []) =>
  buildHeatmapModel({
    startDate: days[0],
    endDate: days[days.length - 1],
    days,
    sites: sites.map((s, i) => ({
      siteId: i + 1,
      category: null,
      previousTotal: 0,
      growthPercent: 0,
      ...s,
      total: s.daily.reduce((a, v) => a + v, 0),
    })),
    categories,
  });

/* ------------------------------------------------------------------ */
/* Clasificación                                                        */
/* ------------------------------------------------------------------ */

describe("clasificación A, B o C", () => {
  test("normalizeCategory acepta A, B o C (con mayúsculas y espacios) y todo lo demás es sin clasificar", () => {
    expect(normalizeCategory("A")).toBe("A");
    expect(normalizeCategory(" b ")).toBe("B");
    expect(normalizeCategory("c")).toBe("C");
    ["", "D", "AB", null, undefined, 1, {}].forEach((v) => expect(normalizeCategory(v)).toBeNull());
  });

  test("categoryLabel usa el rótulo de Finanzas 'Cat. A' y 'Sin clasificar'", () => {
    expect(categoryLabel("A")).toBe("Cat. A");
    expect(categoryLabel("b")).toBe("Cat. B");
    expect(categoryLabel(null)).toBe("Sin clasificar");
    expect(categoryLabel("X")).toBe("Sin clasificar");
  });

  test("categoryKey y categoryRank ordenan A, B, C y al final los sin clasificar", () => {
    expect(["A", "B", "C", null, undefined, "z"].map(categoryKey)).toEqual(["A", "B", "C", "NONE", "NONE", "NONE"]);
    expect(["C", null, "A", "B"].sort((x, y) => categoryRank(x) - categoryRank(y))).toEqual(["A", "B", "C", null]);
  });

  test("CATEGORY_FILTERS: Todas / A / B / C / Sin clasificar", () => {
    expect(CATEGORY_FILTERS.map((f) => f.label)).toEqual(["Todas", "A", "B", "C", "Sin clasificar"]);
    expect(CATEGORY_FILTERS.map((f) => f.id)).toEqual([FILTER_ALL, "A", "B", "C", FILTER_NONE]);
  });

  test("categoryCounts y filterSites agrupan por clasificación y conservan el orden", () => {
    const model = septemberModel();
    expect(categoryCounts(model.sites)).toEqual({ ALL: 5, A: 2, B: 1, C: 1, NONE: 1 });
    expect(categoryCounts([])).toEqual({ ALL: 0, A: 0, B: 0, C: 0, NONE: 0 });
    expect(filterSites(model.sites, "A").map((s) => s.name)).toEqual(["Centro", "Norte"]);
    expect(filterSites(model.sites, "NONE").map((s) => s.name)).toEqual(["Plaza"]);
    expect(filterSites(model.sites, "ALL")).toBe(model.sites);
    expect(filterSites(model.sites, undefined)).toBe(model.sites);
    expect(filterSites(null, "A")).toEqual([]);
  });

  test("totalRowLabel nombra la fila de totales según el filtro", () => {
    expect(totalRowLabel(FILTER_ALL)).toBe("Todos los kioscos");
    expect(totalRowLabel("B")).toBe("Total Cat. B");
    expect(totalRowLabel(FILTER_NONE)).toBe("Total sin clasificar");
  });
});

/* ------------------------------------------------------------------ */
/* Modelo                                                               */
/* ------------------------------------------------------------------ */

describe("buildHeatmapModel", () => {
  test("ordena los sitios A, B, C y sin clasificar; dentro de cada una por venta y nombre", () => {
    const model = septemberModel();
    expect(model.sites.map((s) => [s.name, s.category])).toEqual([
      ["Centro", "A"],
      ["Norte", "A"],
      ["Sur", "B"],
      ["Cerrado", "C"],
      ["Plaza", null],
    ]);
    const tie = buildHeatmapModel({
      days: ["2026-09-01"],
      sites: [
        { siteId: 1, name: "Zeta", category: "B", total: 10, daily: [10] },
        { siteId: 2, name: "Alfa", category: "B", total: 10, daily: [10] },
        { siteId: 3, name: "Mayor", category: "B", total: 50, daily: [50] },
      ],
    });
    expect(tie.sites.map((s) => s.name)).toEqual(["Mayor", "Alfa", "Zeta"]);
  });

  test("totales de la red, días y datos del rango", () => {
    const model = septemberModel();
    expect(model.days).toHaveLength(30);
    expect(model.startDate).toBe("2026-09-01");
    expect(model.previousStartDate).toBe("2026-08-02");
    expect(model.networkTotal).toBe(9680);
    expect(model.networkPrevious).toBe(13200);
    expect(model.networkDaily).toHaveLength(30);
    expect(model.networkDaily[3]).toBe(860); // viernes 4: 500 + 250 + 90 + 20
    expect(model.networkDaily.reduce((a, v) => a + v, 0)).toBe(9680);
  });

  test("normaliza la clasificación (minúscula o valor raro = sin clasificar)", () => {
    const model = buildHeatmapModel({
      days: ["2026-09-01"],
      sites: [
        { siteId: 1, name: "a", category: "a", total: 3, daily: [3] },
        { siteId: 2, name: "b", category: "X", total: 2, daily: [2] },
        { siteId: 3, name: "c", total: 1, daily: [1] },
      ],
    });
    expect(model.sites.map((s) => s.category)).toEqual(["A", null, null]);
  });

  test("alinea daily con los días: rellena con 0, recorta y convierte lo que no es número", () => {
    const model = buildHeatmapModel({
      days: ["2026-09-01", "2026-09-02", "2026-09-03"],
      sites: [
        { siteId: 1, name: "Corto", total: 5, daily: [5] },
        { siteId: 2, name: "Largo", total: 3, daily: [1, 2, 0, 99, 99] },
        { siteId: 3, name: "Texto", total: "7.50", daily: ["2.50", null, "x"] },
        { siteId: 4, name: "Sin daily", total: 4 },
      ],
    });
    const byName = Object.fromEntries(model.sites.map((s) => [s.name, s]));
    expect(byName.Corto.daily).toEqual([5, 0, 0]);
    expect(byName.Largo.daily).toEqual([1, 2, 0]);
    expect(byName.Texto.daily).toEqual([2.5, 0, 0]);
    expect(byName.Texto.total).toBe(7.5);
    expect(byName["Sin daily"].daily).toEqual([0, 0, 0]);
    expect(byName.Corto.daysWithSales).toBe(1);
  });

  test("descarta fechas inválidas sin desalinear las ventas de las demás", () => {
    const model = buildHeatmapModel({
      days: ["2026-09-01", "no-es-fecha", "2026-09-03"],
      sites: [{ siteId: 1, name: "A", total: 6, daily: [1, 2, 3] }],
    });
    expect(model.days).toEqual(["2026-09-01", "2026-09-03"]);
    expect(model.sites[0].daily).toEqual([1, 3]);
  });

  test("total faltante se calcula desde daily; nombre faltante usa el id", () => {
    const model = buildHeatmapModel({
      days: ["2026-09-01", "2026-09-02"],
      sites: [
        { siteId: 8, daily: [4, 6] },
        { daily: [1, 1] },
      ],
    });
    expect(model.sites.map((s) => [s.name, s.total])).toEqual([
      ["Kiosco 8", 10],
      ["Sin nombre", 2],
    ]);
  });

  test("growth: decimal si el periodo anterior vendió, null si no hay base comparable", () => {
    const model = septemberModel();
    const byName = Object.fromEntries(model.sites.map((s) => [s.name, s]));
    expect(byName.Centro.growth).toBeCloseTo(0.25, 6);
    expect(byName.Norte.growth).toBeCloseTo(-0.167, 6);
    expect(byName.Cerrado.growth).toBeCloseTo(-1, 6);
    // el backend manda 100 % cuando el periodo anterior es 0: no es una variación real
    expect(byName.Plaza.growth).toBeNull();
    const fallback = buildHeatmapModel({
      days: ["2026-09-01"],
      sites: [{ siteId: 1, name: "X", total: 150, previousTotal: 100, daily: [150] }],
    });
    expect(fallback.sites[0].growth).toBeCloseTo(0.5, 6);
  });

  test("daysWithSales cuenta los días con venta > 0", () => {
    const model = septemberModel();
    const byName = Object.fromEntries(model.sites.map((s) => [s.name, s]));
    expect(byName.Centro.daysWithSales).toBe(26); // todos menos los 4 domingos
    expect(byName.Cerrado.daysWithSales).toBe(0);
    expect(byName.Plaza.daysWithSales).toBe(30);
  });

  test("respuestas inválidas", () => {
    expect(buildHeatmapModel(null)).toBeNull();
    expect(buildHeatmapModel(undefined)).toBeNull();
    expect(buildHeatmapModel("x")).toBeNull();
    const empty = buildHeatmapModel({});
    expect(empty.days).toEqual([]);
    expect(empty.sites).toEqual([]);
    expect(isHeatmapEmpty(empty)).toBe(true);
  });

  test("isHeatmapEmpty: sin sitios, sin días o sin venta en el periodo", () => {
    expect(isHeatmapEmpty(null)).toBe(true);
    expect(isHeatmapEmpty(septemberModel())).toBe(false);
    expect(isHeatmapEmpty(buildHeatmapModel({ days: ["2026-09-01"], sites: [] }))).toBe(true);
    expect(isHeatmapEmpty(buildHeatmapModel({ days: [], sites: [{ siteId: 1, name: "A", total: 5, daily: [] }] }))).toBe(
      true
    );
    // vendió solo en el periodo anterior: no hay nada que mapear en este
    expect(
      isHeatmapEmpty(
        buildHeatmapModel({ days: ["2026-09-01"], sites: [{ siteId: 1, name: "A", total: 0, previousTotal: 50, daily: [0] }] })
      )
    ).toBe(true);
  });

  test("límites del contrato", () => {
    expect(MAX_HEATMAP_DAYS).toBe(400);
    expect(MAX_DAY_MATRIX_DAYS).toBe(62);
  });
});

/* ------------------------------------------------------------------ */
/* Sombreado                                                            */
/* ------------------------------------------------------------------ */

describe("formato y clases de sombreado", () => {
  test("fmtCellAmount muestra siempre dos decimales y 0.00 sin venta", () => {
    expect(fmtCellAmount(0)).toBe("0.00");
    expect(fmtCellAmount(1234.5)).toBe("1,234.50");
    expect(fmtCellAmount(14200)).toBe("14,200.00");
  });

  test("heatClass: sin venta = hzero (no se sombrea); con venta, el tono del bucket", () => {
    expect(heatClass(0, null)).toBe("sdash-hzero");
    expect(heatClass(-5, 2)).toBe("sdash-hzero");
    expect(heatClass(10, 0)).toBe("sdash-h0");
    expect(heatClass(10, 5)).toBe("sdash-h5");
    expect(heatClass(10, null)).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* Kiosco × día de la semana                                            */
/* ------------------------------------------------------------------ */

describe("promedio por día de la semana", () => {
  test("weekdayOccurrences cuenta cuántas veces cae cada día (lunes = 0)", () => {
    expect(weekdayOccurrences(SEPT)).toEqual([4, 5, 5, 4, 4, 4, 4]);
    expect(weekdayOccurrences(rangeOf("2026-09-01", 3))).toEqual([0, 1, 1, 1, 0, 0, 0]);
    expect(weekdayOccurrences([])).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(weekdayOccurrences(null)).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test("buildWeekdayRow promedia por ocurrencia contando los días sin venta como 0", () => {
    // Cuatro martes (1, 8, 15, 22): 100 + 0 + 200 + 0 → promedio 75, no 150
    const days = rangeOf("2026-09-01", 22).filter((d) => weekdayOf(d) === 1);
    expect(days).toEqual(["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]);
    const row = buildWeekdayRow(days, [100, 0, 200, 0], weekdayOccurrences(days));
    const tuesday = row.cells[1];
    expect(tuesday.total).toBe(300);
    expect(tuesday.occurrences).toBe(4);
    expect(tuesday.avg).toBe(75);
    // los demás días no caen en esas fechas: sin promedio
    expect(row.cells[0].avg).toBeNull();
    expect(row.cells[0].occurrences).toBe(0);
  });

  test("cada celda se sombrea contra el promedio de la fila y el mejor día lleva ★", () => {
    const row = buildWeekdayRow(SEPT, septemberResponse().sites[3].daily, weekdayOccurrences(SEPT)); // Centro
    expect(row.cells.map((c) => c.avg)).toEqual([100, 100, 100, 100, 500, 300, 0]);
    expect(row.mean).toBeCloseTo(1200 / 7, 6);
    expect(row.bestIndex).toBe(4); // viernes
    expect(row.cells.map((c) => c.isBest)).toEqual([false, false, false, false, true, false, false]);
    // viernes 500 / 171.43 = 2.92× → ≥ 2× (bucket 5); sábado 1.75× → 1.5–2× (4); lunes 0.58× → 0.5–0.85× (1)
    expect(row.cells[4].bucket).toBe(5);
    expect(row.cells[5].bucket).toBe(4);
    expect(row.cells[0].bucket).toBe(1);
    expect(row.cells[4].ratio).toBeCloseTo(500 / (1200 / 7), 6);
    // domingo sin venta: 0.00 y sin sombrear
    expect(row.cells[6].avg).toBe(0);
    expect(row.cells[6].bucket).toBeNull();
    expect(row.cells[6].ratio).toBe(0);
  });

  test("un día de la semana que no cae en el rango no tiene promedio y no cuenta en la media", () => {
    const days = rangeOf("2026-09-01", 3); // martes, miércoles y jueves
    const row = buildWeekdayRow(days, [10, 30, 20], weekdayOccurrences(days));
    expect(row.cells.map((c) => c.avg)).toEqual([null, 10, 30, 20, null, null, null]);
    expect(row.mean).toBe(20);
    expect(row.bestIndex).toBe(2);
    expect(row.cells[1].bucket).toBe(1); // 0.5×
    expect(row.cells[3].bucket).toBe(2); // 1.0×
    expect(row.cells[0].bucket).toBeNull();
    expect(row.cells[0].ratio).toBeNull();
  });

  test("una fila pareja, con un solo día observado o sin venta no marca mejor día ni sombrea de más", () => {
    const flat = buildWeekdayRow(SEPT, SEPT.map(() => 100), weekdayOccurrences(SEPT));
    expect(flat.mean).toBe(100);
    expect(flat.bestIndex).toBe(-1);
    expect(flat.cells.some((c) => c.isBest)).toBe(false);
    expect(flat.cells.every((c) => c.bucket === 2)).toBe(true); // 1.0× la media

    const single = buildWeekdayRow(["2026-09-02"], [500], weekdayOccurrences(["2026-09-02"]));
    expect(single.bestIndex).toBe(-1);

    const none = buildWeekdayRow(SEPT, SEPT.map(() => 0), weekdayOccurrences(SEPT));
    expect(none.mean).toBe(0);
    expect(none.bestIndex).toBe(-1);
    expect(none.cells.every((c) => c.bucket === null && c.ratio === null)).toBe(true);
  });

  test("ante un empate gana el primer día de la semana", () => {
    const row = buildWeekdayRow(SEPT, SEPT.map((d) => (weekdayOf(d) === 4 || weekdayOf(d) === 5 ? 300 : 100)), weekdayOccurrences(SEPT));
    expect(row.bestIndex).toBe(4);
  });

  test("buildWeekdayMatrix: una fila por kiosco y la fila de totales de los kioscos mostrados", () => {
    const model = septemberModel();
    const matrix = buildWeekdayMatrix(model, model.sites);
    expect(matrix.occurrences).toEqual([4, 5, 5, 4, 4, 4, 4]);
    expect(matrix.rows.map((r) => r.site.name)).toEqual(["Centro", "Norte", "Sur", "Cerrado", "Plaza"]);
    expect(matrix.rows.map((r) => r.total)).toEqual([5000, 2500, 1260, 0, 920]);
    expect(matrix.rows.map((r) => r.bestIndex)).toEqual([4, 4, 4, -1, 5]);
    // totales: viernes 500 + 250 + 90 + 0 + 20 = 860, sábado 590, domingo 70, resto 200
    expect(matrix.footer.cells.map((c) => c.avg)).toEqual([200, 200, 200, 200, 860, 590, 70]);
    expect(matrix.footer.total).toBe(9680);
    expect(matrix.footer.bestIndex).toBe(4);
    expect(matrix.footer.cells[4].isBest).toBe(true);
  });

  test("buildWeekdayMatrix con el filtro aplicado solo suma los kioscos mostrados", () => {
    const model = septemberModel();
    const onlyA = buildWeekdayMatrix(model, filterSites(model.sites, "A"));
    expect(onlyA.rows).toHaveLength(2);
    expect(onlyA.footer.total).toBe(7500);
    expect(onlyA.footer.cells.map((c) => c.avg)).toEqual([150, 150, 150, 150, 750, 450, 0]);
    const nobody = buildWeekdayMatrix(model, []);
    expect(nobody.rows).toEqual([]);
    expect(nobody.footer.total).toBe(0);
    expect(nobody.footer.bestIndex).toBe(-1);
  });
});

/* ------------------------------------------------------------------ */
/* Kiosco × día                                                         */
/* ------------------------------------------------------------------ */

describe("matriz kiosco × día", () => {
  const days = rangeOf("2026-09-01", 5); // martes a sábado
  const model = miniModel(days, [
    { name: "A", category: "A", daily: [100, 0, 200, 300, 50] },
    { name: "B", category: "B", daily: [10, 10, 10, 10, 10] },
  ]);

  test("cada kiosco se sombrea contra la mediana de SUS días con venta; el día sin venta no se sombrea", () => {
    const matrix = buildDayMatrix(model, model.sites);
    const [a, b] = matrix.rows;
    // días con venta de A: 50, 100, 200, 300 → mediana 150
    expect(a.median).toBe(150);
    expect(a.cells.map((c) => c.bucket)).toEqual([1, null, 3, 5, 0]);
    expect(a.cells.map((c) => c.ratio)).toEqual([100 / 150, null, 200 / 150, 2, 50 / 150]);
    expect(a.cells.map((c) => c.amount)).toEqual([100, 0, 200, 300, 50]);
    expect(a.cells.map((c) => heatClass(c.amount, c.bucket))).toEqual([
      "sdash-h1",
      "sdash-hzero",
      "sdash-h3",
      "sdash-h5",
      "sdash-h0",
    ]);
    // B vende lo mismo todos los días: cada día es 1.0× su mediana
    expect(b.median).toBe(10);
    expect(b.cells.every((c) => c.bucket === 2)).toBe(true);
    expect(a.total).toBe(650);
  });

  test("la fila de totales suma los kioscos mostrados y se sombrea contra su propia mediana", () => {
    const matrix = buildDayMatrix(model, model.sites);
    expect(matrix.footer.cells.map((c) => c.amount)).toEqual([110, 10, 210, 310, 60]);
    expect(matrix.footer.median).toBe(110); // mediana de [10, 60, 110, 210, 310]
    // 110 / 110 = 1.0× (2), 10 → 0.09× (0), 210 → 1.91× (4), 310 → 2.82× (5), 60 → 0.55× (1)
    expect(matrix.footer.cells.map((c) => c.bucket)).toEqual([2, 0, 4, 5, 1]);
    expect(matrix.footer.total).toBe(700);
    const onlyB = buildDayMatrix(model, [model.sites[1]]);
    expect(onlyB.footer.cells.map((c) => c.amount)).toEqual([10, 10, 10, 10, 10]);
  });

  test("columnas: día, día de la semana y etiqueta (con mes solo si el rango cruza de mes)", () => {
    const matrix = buildDayMatrix(model, model.sites);
    expect(matrix.multiMonth).toBe(false);
    expect(matrix.columns.map((c) => c.label)).toEqual(["1", "2", "3", "4", "5"]);
    expect(matrix.columns.map((c) => c.wd)).toEqual(["mar", "mié", "jue", "vie", "sáb"]);
    expect(matrix.columns[0]).toMatchObject({ date: "2026-09-01", day: 1, month: 9, weekday: 1, weekdayName: "Martes" });

    const crossing = rangeOf("2026-09-29", 4); // 29, 30 de septiembre y 1, 2 de octubre
    const multi = buildDayMatrix(
      miniModel(crossing, [{ name: "A", daily: [1, 2, 3, 4] }]),
      miniModel(crossing, [{ name: "A", daily: [1, 2, 3, 4] }]).sites
    );
    expect(multi.multiMonth).toBe(true);
    expect(multi.columns.map((c) => c.label)).toEqual(["29/09", "30/09", "01/10", "02/10"]);
  });

  test("un kiosco sin ninguna venta queda todo en 0.00 y sin sombrear; sin kioscos no hay filas", () => {
    const quiet = miniModel(days, [{ name: "Q", daily: [0, 0, 0, 0, 0] }]);
    const matrix = buildDayMatrix(quiet, quiet.sites);
    expect(matrix.rows[0].median).toBeNull();
    expect(matrix.rows[0].cells.every((c) => c.bucket === null && c.ratio === null)).toBe(true);
    expect(buildDayMatrix(model, []).rows).toEqual([]);
  });

  test("canShowDayMatrix solo hasta 62 días", () => {
    expect(canShowDayMatrix(null)).toBe(false);
    expect(canShowDayMatrix(model)).toBe(true);
    const days62 = rangeOf("2026-08-01", 62);
    const days63 = rangeOf("2026-08-01", 63);
    expect(canShowDayMatrix(miniModel(days62, [{ name: "A", daily: days62.map(() => 1) }]))).toBe(true);
    expect(canShowDayMatrix(miniModel(days63, [{ name: "A", daily: days63.map(() => 1) }]))).toBe(false);
    expect(canShowDayMatrix({ days: [] })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Resumen por clasificación                                            */
/* ------------------------------------------------------------------ */

describe("buildCategorySummary", () => {
  test("una fila por clasificación presente en el orden A, B, C y sin clasificar, más el total", () => {
    const summary = buildCategorySummary(septemberModel());
    expect(summary.rows.map((r) => [r.key, r.label, r.kioskCount])).toEqual([
      ["A", "Cat. A", 2],
      ["B", "Cat. B", 1],
      ["C", "Cat. C", 1],
      ["NONE", "Sin clasificar", 1],
    ]);
    const [a, b, c, none] = summary.rows;
    expect(a).toMatchObject({ category: "A", total: 7500, previousTotal: 7000, avgPerKiosk: 3750 });
    expect(a.share).toBeCloseTo(0.775, 6);
    expect(a.growth).toBeCloseTo(0.071, 6);
    expect(b.avgPerKiosk).toBe(1260);
    expect(c).toMatchObject({ total: 0, avgPerKiosk: 0 });
    expect(c.growth).toBeCloseTo(-1, 6);
    expect(none.category).toBeNull();
    // sin periodo anterior no hay variación aunque el backend mande 100
    expect(none.growth).toBeNull();
    expect(summary.total).toMatchObject({ kioskCount: 5, total: 9680, previousTotal: 13200, avgPerKiosk: 1936, share: 1 });
    expect(summary.total.growth).toBeCloseTo((9680 - 13200) / 13200, 6);
  });

  test("día fuerte: el día de la semana de mayor venta promedio de la clasificación; sin venta no hay", () => {
    const [a, b, c, none] = buildCategorySummary(septemberModel()).rows;
    expect(a.strongest).toEqual({ index: 4, name: "Viernes", avg: 750 });
    expect(b.strongest).toEqual({ index: 4, name: "Viernes", avg: 90 });
    expect(c.strongest).toBeNull();
    expect(none.strongest).toEqual({ index: 5, name: "Sábado", avg: 80 });
    expect(buildCategorySummary(septemberModel()).total.strongest).toEqual({ index: 4, name: "Viernes", avg: 860 });
  });

  test("sin categories[] se calcula todo desde los sitios y se omiten las clasificaciones ausentes", () => {
    const response = { ...septemberResponse(), categories: undefined };
    const summary = buildCategorySummary(buildHeatmapModel(response));
    expect(summary.rows.map((r) => r.key)).toEqual(["A", "B", "C", "NONE"]);
    const a = summary.rows[0];
    expect(a).toMatchObject({ kioskCount: 2, total: 7500, previousTotal: 7000 });
    expect(a.share).toBeCloseTo(7500 / 9680, 6);
    expect(a.growth).toBeCloseTo((7500 - 7000) / 7000, 6);

    const onlyB = buildCategorySummary(
      miniModel(rangeOf("2026-09-01", 14), [{ name: "B1", category: "B", daily: Array(14).fill(10) }])
    );
    expect(onlyB.rows.map((r) => r.key)).toEqual(["B"]);
  });

  test("categories[] del backend manda en kioscos, venta y participación; una fila suya sin kioscos se calcula desde los sitios", () => {
    const model = buildHeatmapModel({
      ...septemberResponse(),
      categories: [
        { category: "A", kioskCount: 2, total: 7500, previousTotal: 7000, growthPercent: 7.1, sharePercent: 50 },
        { category: "B", kioskCount: 0, total: 0, previousTotal: 0, growthPercent: 0, sharePercent: 0 },
      ],
    });
    const summary = buildCategorySummary(model);
    const a = summary.rows.find((r) => r.key === "A");
    expect(a.share).toBeCloseTo(0.5, 6); // se respeta lo que manda el backend
    // B existe en los sitios (Sur): se calcula desde ellos porque categories[] no la trae con kioscos
    expect(summary.rows.find((r) => r.key === "B")).toMatchObject({ kioskCount: 1, total: 1260 });
  });

  test("modelo nulo y total cero", () => {
    expect(buildCategorySummary(null)).toEqual({ rows: [], total: null });
    const zero = buildCategorySummary(miniModel(rangeOf("2026-09-01", 3), [{ name: "Z", category: "A", daily: [0, 0, 0] }]));
    expect(zero.total).toMatchObject({ total: 0, share: 0, avgPerKiosk: 0, growth: null, strongest: null });
    expect(zero.rows[0].share).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/* Insights                                                             */
/* ------------------------------------------------------------------ */

describe("buildKioskInsights", () => {
  const insights = buildKioskInsights(septemberModel());

  test("devuelve las frases en orden, con tono good | neutral | warn", () => {
    expect(insights.map((i) => i.id)).toEqual([
      "topDays",
      "concentration",
      "leader",
      "categoryA",
      "growth",
      "decline",
      "pattern",
      "idle",
    ]);
    expect(Object.fromEntries(insights.map((i) => [i.id, i.tone]))).toEqual({
      topDays: "neutral",
      concentration: "neutral",
      leader: "good",
      categoryA: "neutral",
      growth: "good",
      decline: "warn",
      pattern: "neutral",
      idle: "warn",
    });
    insights.forEach((i) => expect(["good", "neutral", "warn"]).toContain(i.tone));
  });

  test("días con más venta: los tres mayores de la red con día de la semana y monto", () => {
    // los viernes empatan en Q 860: gana el día más temprano
    expect(insightText(insights, "topDays")).toBe(
      "Los días con más venta fueron el 4 (vie) Q 860, 11 (vie) Q 860 y 18 (vie) Q 860."
    );
  });

  test("días con más venta: con varios meses el día lleva el mes, con varios años el año", () => {
    const crossing = rangeOf("2026-09-25", 12); // hasta el 6 de octubre
    const model = miniModel(crossing, [{ name: "A", daily: crossing.map((_, i) => (i === 2 ? 900 : i === 9 ? 800 : 100 + i)) }]);
    expect(insightText(buildKioskInsights(model), "topDays")).toBe(
      "Los días con más venta fueron el 27/09 (dom) Q 900, 04/10 (dom) Q 800 y 06/10 (mar) Q 111."
    );
    const years = rangeOf("2026-12-30", 5);
    const modelYears = miniModel(years, [{ name: "A", daily: [50, 40, 30, 20, 10] }]);
    expect(insightText(buildKioskInsights(modelYears), "topDays")).toBe(
      "Los días con más venta fueron el 30/12/26 (mié) Q 50, 31/12/26 (jue) Q 40 y 01/01/27 (vie) Q 30."
    );
  });

  test("concentración por día de la semana: misma frase que el calendario", () => {
    expect(insightText(insights, "concentration")).toBe(
      "Viernes y sábado concentran el 60% de la venta de kioscos en el 27% de los días. Los domingos son el día más flojo."
    );
  });

  test("kiosco líder con su clasificación y su peso en el total", () => {
    expect(insightText(insights, "leader")).toBe("Kiosco líder: Centro (Cat. A) con Q 5,000 (51.7% del total).");
    const plaza = miniModel(rangeOf("2026-09-01", 5), [
      { name: "Plaza", daily: [500, 0, 0, 0, 0] },
      { name: "Otro", category: "B", daily: [100, 0, 0, 0, 0] },
    ]);
    expect(insightText(buildKioskInsights(plaza), "leader")).toBe(
      "Kiosco líder: Plaza (sin clasificar) con Q 500 (83.3% del total)."
    );
  });

  test("peso de los kioscos Cat. A: plural y singular", () => {
    expect(insightText(insights, "categoryA")).toBe("Los kioscos Cat. A (2 de 5) venden el 77.5% del total.");
    const days = rangeOf("2026-09-01", 5);
    const one = miniModel(days, [
      { name: "Uno", category: "A", daily: [300, 0, 0, 0, 0] },
      { name: "Dos", category: "B", daily: [100, 0, 0, 0, 0] },
    ]);
    expect(insightText(buildKioskInsights(one), "categoryA")).toBe("El kiosco Cat. A (1 de 2) vende el 75.0% del total.");
  });

  test("mayor crecimiento y mayor caída contra el periodo anterior, con los montos", () => {
    expect(insightText(insights, "growth")).toBe(
      "Mayor crecimiento: Centro +25.0% vs periodo anterior (de Q 4,000 a Q 5,000)."
    );
    expect(insightText(insights, "decline")).toBe(
      "Mayor caída: Cerrado -100.0% vs periodo anterior (de Q 5,000 a Q 0)."
    );
  });

  test("patrón común: el mejor día de la semana que más se repite entre los kioscos", () => {
    // Centro, Norte y Sur tienen su mejor día el viernes; Plaza, el sábado; Cerrado no vendió
    expect(insightText(insights, "pattern")).toBe(
      "Patrón común: en 3 de 4 kioscos el mejor día de la semana es el viernes."
    );
  });

  test("kioscos sin venta: singular, plural, con nombres si son pocos", () => {
    expect(insightText(insights, "idle")).toBe("1 kiosco sin venta en el periodo: Cerrado.");
    const days = rangeOf("2026-09-01", 5);
    const many = (n) =>
      miniModel(days, [
        { name: "Activo", daily: [100, 50, 0, 0, 0] },
        ...Array.from({ length: n }, (_, i) => ({ name: `Quieto ${i + 1}`, daily: [0, 0, 0, 0, 0], previousTotal: 10 })),
      ]);
    expect(insightText(buildKioskInsights(many(2)), "idle")).toBe("2 kioscos sin venta en el periodo: Quieto 1 y Quieto 2.");
    expect(insightText(buildKioskInsights(many(3)), "idle")).toBe(
      "3 kioscos sin venta en el periodo: Quieto 1, Quieto 2 y Quieto 3."
    );
    // más de tres solo se cuentan
    expect(insightText(buildKioskInsights(many(4)), "idle")).toBe("4 kioscos sin venta en el periodo.");
    expect(insightText(buildKioskInsights(many(0)), "idle")).toBeUndefined();
  });

  test("ningún texto trae NaN, Infinity ni undefined", () => {
    insights.forEach((i) => expect(i.text).not.toMatch(/NaN|Infinity|undefined|null/));
  });

  test("sin datos suficientes se omiten: menos de 3 días con venta no lista días fuertes", () => {
    const days = rangeOf("2026-09-01", 5);
    const model = miniModel(days, [
      { name: "A", daily: [100, 0, 200, 0, 0] },
      { name: "B", daily: [50, 0, 0, 0, 0] },
    ]);
    expect(buildKioskInsights(model).map((i) => i.id)).not.toContain("topDays");
    // con 3 días con venta ya aparece
    const three = miniModel(days, [{ name: "A", daily: [100, 50, 200, 0, 0] }]);
    expect(buildKioskInsights(three).map((i) => i.id)).toContain("topDays");
  });

  test("sin datos suficientes se omiten: rango corto no habla de días de la semana ni de patrón", () => {
    const days = rangeOf("2026-09-01", 13);
    const model = miniModel(days, [
      { name: "A", daily: days.map((d) => (weekdayOf(d) === 4 ? 500 : 100)) },
      { name: "B", daily: days.map((d) => (weekdayOf(d) === 4 ? 400 : 50)) },
      { name: "C", daily: days.map((d) => (weekdayOf(d) === 4 ? 300 : 20)) },
    ]);
    const ids = buildKioskInsights(model).map((i) => i.id);
    expect(ids).not.toContain("concentration");
    expect(ids).not.toContain("pattern");
    expect(ids).toContain("leader");
    // con 14 días ya hay patrón (cada día de la semana se observa dos veces)
    const days14 = rangeOf("2026-09-01", 14);
    const model14 = miniModel(days14, [
      { name: "A", daily: days14.map((d) => (weekdayOf(d) === 4 ? 500 : 100)) },
      { name: "B", daily: days14.map((d) => (weekdayOf(d) === 4 ? 400 : 50)) },
      { name: "C", daily: days14.map((d) => (weekdayOf(d) === 4 ? 300 : 20)) },
    ]);
    expect(insightText(buildKioskInsights(model14), "pattern")).toBe(
      "Patrón común: en 3 de 3 kioscos el mejor día de la semana es el viernes."
    );
  });

  test("sin datos suficientes se omiten: un solo kiosco no tiene líder, peso de la A ni crecimiento comparado", () => {
    const days = rangeOf("2026-09-01", 20);
    const model = miniModel(days, [{ name: "Solo", category: "A", daily: days.map((_, i) => 100 + i), previousTotal: 1000, growthPercent: 40 }]);
    const ids = buildKioskInsights(model).map((i) => i.id);
    expect(ids).not.toContain("leader");
    expect(ids).not.toContain("categoryA");
    expect(ids).not.toContain("growth");
    expect(ids).not.toContain("decline");
    expect(ids).not.toContain("pattern");
    expect(ids).toContain("topDays");
  });

  test("el peso de la Cat. A se omite si no hay A o si todos los kioscos son A", () => {
    const days = rangeOf("2026-09-01", 5);
    const noA = miniModel(days, [
      { name: "A1", category: "B", daily: [100, 0, 0, 0, 0] },
      { name: "A2", daily: [100, 0, 0, 0, 0] },
    ]);
    expect(buildKioskInsights(noA).map((i) => i.id)).not.toContain("categoryA");
    const allA = miniModel(days, [
      { name: "A1", category: "A", daily: [100, 0, 0, 0, 0] },
      { name: "A2", category: "A", daily: [100, 0, 0, 0, 0] },
    ]);
    expect(buildKioskInsights(allA).map((i) => i.id)).not.toContain("categoryA");
  });

  test("crecimiento y caída: solo kioscos comparables (el periodo anterior vendió) y al menos dos", () => {
    const days = rangeOf("2026-09-01", 5);
    // solo uno tiene periodo anterior: no hay con quién comparar
    const one = miniModel(days, [
      { name: "A", daily: [100, 0, 0, 0, 0], previousTotal: 50, growthPercent: 100 },
      { name: "B", daily: [100, 0, 0, 0, 0], previousTotal: 0, growthPercent: 100 },
    ]);
    const idsOne = buildKioskInsights(one).map((i) => i.id);
    expect(idsOne).not.toContain("growth");
    expect(idsOne).not.toContain("decline");
    // todos crecieron: no hay caída
    const allUp = miniModel(days, [
      { name: "A", daily: [150, 0, 0, 0, 0], previousTotal: 100, growthPercent: 50 },
      { name: "B", daily: [120, 0, 0, 0, 0], previousTotal: 100, growthPercent: 20 },
    ]);
    const up = buildKioskInsights(allUp);
    expect(insightText(up, "growth")).toBe("Mayor crecimiento: A +50.0% vs periodo anterior (de Q 100 a Q 150).");
    expect(up.map((i) => i.id)).not.toContain("decline");
    // todos cayeron: no hay crecimiento
    const allDown = miniModel(days, [
      { name: "A", daily: [50, 0, 0, 0, 0], previousTotal: 100, growthPercent: -50 },
      { name: "B", daily: [90, 0, 0, 0, 0], previousTotal: 100, growthPercent: -10 },
    ]);
    const down = buildKioskInsights(allDown);
    expect(insightText(down, "decline")).toBe("Mayor caída: A -50.0% vs periodo anterior (de Q 100 a Q 50).");
    expect(down.map((i) => i.id)).not.toContain("growth");
    // sin cambio: ni una ni otra
    const flat = miniModel(days, [
      { name: "A", daily: [100, 0, 0, 0, 0], previousTotal: 100, growthPercent: 0 },
      { name: "B", daily: [100, 0, 0, 0, 0], previousTotal: 100, growthPercent: 0 },
    ]);
    const ids = buildKioskInsights(flat).map((i) => i.id);
    expect(ids).not.toContain("growth");
    expect(ids).not.toContain("decline");
  });

  test("patrón común: pide al menos tres kioscos con mejor día y que coincida la mitad", () => {
    const days = rangeOf("2026-09-01", 28);
    const best = (weekday) => days.map((d) => (weekdayOf(d) === weekday ? 500 : 100));
    // dos kioscos coinciden: no alcanza (hacen falta tres con mejor día)
    const two = miniModel(days, [
      { name: "A", daily: best(4) },
      { name: "B", daily: best(4) },
    ]);
    expect(buildKioskInsights(two).map((i) => i.id)).not.toContain("pattern");
    // cuatro kioscos, cada uno con un mejor día distinto: ningún día llega a la mitad
    const spread = miniModel(days, [
      { name: "A", daily: best(0) },
      { name: "B", daily: best(1) },
      { name: "C", daily: best(2) },
      { name: "D", daily: best(3) },
    ]);
    expect(buildKioskInsights(spread).map((i) => i.id)).not.toContain("pattern");
    // dos de cuatro coinciden = la mitad: ya es un patrón
    const half = miniModel(days, [
      { name: "A", daily: best(5) },
      { name: "B", daily: best(5) },
      { name: "C", daily: best(1) },
      { name: "D", daily: best(2) },
    ]);
    expect(insightText(buildKioskInsights(half), "pattern")).toBe(
      "Patrón común: en 2 de 4 kioscos el mejor día de la semana es el sábado."
    );
    // un kiosco con la venta pareja no tiene mejor día y no vota
    const flatOne = miniModel(days, [
      { name: "A", daily: best(2) },
      { name: "B", daily: best(2) },
      { name: "C", daily: best(2) },
      { name: "Parejo", daily: days.map(() => 100) },
    ]);
    expect(insightText(buildKioskInsights(flatOne), "pattern")).toBe(
      "Patrón común: en 3 de 3 kioscos el mejor día de la semana es el miércoles."
    );
  });

  test("patrón común: ante un empate de votos gana el día de la semana que más vende en la red", () => {
    const days = rangeOf("2026-09-01", 28);
    const best = (weekday, amount) => days.map((d) => (weekdayOf(d) === weekday ? amount : 100));
    // dos kioscos con mejor día el lunes (Q 400) y dos con el sábado (Q 900): empatan en votos, el sábado vende más
    const tied = miniModel(days, [
      { name: "A", daily: best(0, 400) },
      { name: "B", daily: best(0, 400) },
      { name: "C", daily: best(5, 900) },
      { name: "D", daily: best(5, 900) },
    ]);
    expect(insightText(buildKioskInsights(tied), "pattern")).toBe(
      "Patrón común: en 2 de 4 kioscos el mejor día de la semana es el sábado."
    );
    // si el empate se invierte (el lunes vende más en la red) gana el lunes, no el primero de la lista por casualidad
    const flipped = miniModel(days, [
      { name: "A", daily: best(0, 900) },
      { name: "B", daily: best(0, 900) },
      { name: "C", daily: best(5, 400) },
      { name: "D", daily: best(5, 400) },
    ]);
    expect(insightText(buildKioskInsights(flipped), "pattern")).toBe(
      "Patrón común: en 2 de 4 kioscos el mejor día de la semana es el lunes."
    );
  });

  test("la concentración dice 'repartida de forma pareja' cuando no hay días fuertes", () => {
    const days = rangeOf("2026-09-01", 28);
    const model = miniModel(days, [{ name: "A", daily: days.map(() => 100) }]);
    expect(insightText(buildKioskInsights(model), "concentration")).toMatch(
      /^La venta de kioscos está repartida de forma pareja entre los días de la semana\./
    );
  });

  test("modelo vacío o sin venta no genera insights", () => {
    expect(buildKioskInsights(null)).toEqual([]);
    expect(buildKioskInsights(buildHeatmapModel({}))).toEqual([]);
    expect(buildKioskInsights(miniModel(rangeOf("2026-09-01", 5), [{ name: "A", daily: [0, 0, 0, 0, 0], previousTotal: 10 }]))).toEqual([]);
  });

  test("con montos en cero o textos raros nunca aparece NaN ni Infinity", () => {
    const days = rangeOf("2026-09-01", 20);
    const model = buildHeatmapModel({
      days,
      sites: [
        { siteId: 1, name: "A", category: "A", total: "abc", previousTotal: "x", growthPercent: "y", daily: days.map(() => "10") },
        { siteId: 2, name: "B", category: null, total: null, previousTotal: null, growthPercent: null, daily: days.map(() => null) },
        { siteId: 3, name: "C", category: "B", total: 5, previousTotal: 0, growthPercent: 100, daily: days.map((_, i) => (i === 0 ? 5 : 0)) },
      ],
    });
    const texts = buildKioskInsights(model).map((i) => i.text);
    texts.forEach((t) => expect(t).not.toMatch(/NaN|Infinity|undefined/));
    const summary = buildCategorySummary(model);
    summary.rows.forEach((r) => {
      [r.total, r.share, r.avgPerKiosk].forEach((v) => expect(Number.isFinite(v)).toBe(true));
    });
  });
});
