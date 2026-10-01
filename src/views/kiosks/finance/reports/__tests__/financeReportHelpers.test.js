import {
  UNASSIGNED_SUPERVISOR,
  formatGrowth,
  goalOutlook,
  aggregateGoalPct,
  applySupervisorSelection,
  buildSupervisorOptions,
  describeComparison,
  selectedSupervisorOptions,
  buildCompletenessRows,
  buildGoalRows,
  buildKpis,
  buildMonthlyRows,
  buildPnlRowDefs,
  buildRankingRows,
  buildSiteMedians,
  buildYoYSeries,
  buildYoYTableRows,
  completenessCell,
  deltaMeta,
  filterRowsByName,
  fmtAxisMoney,
  fmtCompactMoney,
  fmtPp,
  goalAxisMax,
  heatBucket,
  median,
  orderFixedCategories,
  pctDelta,
  ppDelta,
  siteStatus,
  sortRows,
} from "../financeReportHelpers";

describe("deltas y tono", () => {
  test("pctDelta: null sin base o base 0", () => {
    expect(pctDelta(120, 100)).toBeCloseTo(0.2);
    expect(pctDelta(80, 100)).toBeCloseTo(-0.2);
    expect(pctDelta(100, 0)).toBeNull();
    expect(pctDelta(100, null)).toBeNull();
    expect(pctDelta(undefined, 100)).toBeNull();
  });

  test("ppDelta y fmtPp", () => {
    expect(ppDelta(0.31, 0.28)).toBeCloseTo(0.03);
    expect(fmtPp(0.03)).toBe("+3.0 pp");
    expect(fmtPp(-0.0125)).toBe("-1.3 pp");
    expect(fmtPp(0)).toBe("0.0 pp");
    expect(fmtPp(null)).toBe("—");
  });

  test("deltaMeta: el aumento de costos es desfavorable", () => {
    expect(deltaMeta(0.1, { goodWhen: "up" })).toMatchObject({ tone: "up", kind: "good", arrow: "▲" });
    expect(deltaMeta(0.1, { goodWhen: "down" })).toMatchObject({ tone: "up", kind: "bad", arrow: "▲" });
    expect(deltaMeta(-0.1, { goodWhen: "down" })).toMatchObject({ tone: "down", kind: "good", arrow: "▼" });
    expect(deltaMeta(-0.1)).toMatchObject({ kind: "bad" });
  });

  test("deltaMeta: plano y sin dato son neutros y traen texto accesible", () => {
    expect(deltaMeta(0)).toMatchObject({ tone: "flat", kind: "neutral" });
    const na = deltaMeta(null);
    expect(na).toMatchObject({ tone: "na", kind: "neutral" });
    expect(na.srText).toMatch(/sin dato/i);
    expect(deltaMeta(0.2).srText).toMatch(/aumento, favorable/);
  });
});

describe("formato compacto", () => {
  test("fmtCompactMoney", () => {
    expect(fmtCompactMoney(1090923.3)).toBe("Q 1.09 M");
    expect(fmtCompactMoney(845300)).toBe("Q 845.3 K");
    expect(fmtCompactMoney(9999.5)).toBe("Q 9,999.50");
    expect(fmtCompactMoney(-338270.93)).toBe("-Q 338.3 K");
    expect(fmtCompactMoney(null)).toBe("—");
  });

  test("fmtAxisMoney", () => {
    expect(fmtAxisMoney(0)).toBe("0");
    expect(fmtAxisMoney(1500)).toBe("1.5K");
    expect(fmtAxisMoney(2000000)).toBe("2M");
  });
});

const compare = {
  totals: {
    sales: 1200,
    baseSales: 1000,
    delta: 200,
    deltaPct: 0.2,
    margin: 0.35,
    baseMargin: 0.3,
    difference: 420,
    baseDifference: 300,
  },
  sites: [
    { siteId: 1, name: "A", sales: 800, baseSales: 600, goalPct: 0.8, baseGoalPct: 0.6 },
    { siteId: 2, name: "B", sales: 400, baseSales: 400, goalPct: 1, baseGoalPct: 1 },
    { siteId: 3, name: "C", sales: 0, baseSales: 0, goalPct: null, baseGoalPct: null },
  ],
  monthly: [
    { month: 2, sales: 500, baseSales: 450, margin: 0.3, baseMargin: 0.28 },
    { month: 1, sales: 700, baseSales: null, margin: null, baseMargin: 0.25 },
  ],
};

describe("KPIs del resumen", () => {
  test("aggregateGoalPct pondera por meta derivada", () => {
    // metas: A=1000, B=400 -> 1200/1400
    expect(aggregateGoalPct(compare.sites)).toBeCloseTo(1200 / 1400);
    expect(aggregateGoalPct([])).toBeNull();
    expect(aggregateGoalPct([{ sales: 10, goalPct: null }])).toBeNull();
  });

  test("buildKpis: costo = ventas - diferencia y tono por tipo", () => {
    const kpis = Object.fromEntries(buildKpis(compare).map((k) => [k.key, k]));
    expect(Object.keys(kpis)).toEqual(["sales", "cost", "profit", "margin", "goal"]);
    expect(kpis.cost.value).toBe(780);
    expect(kpis.cost.base).toBe(700);
    expect(kpis.cost.goodWhen).toBe("down");
    expect(kpis.cost.delta).toBeCloseTo(80 / 700);
    expect(kpis.sales.delta).toBe(0.2);
    expect(kpis.profit.delta).toBeCloseTo(0.4);
    expect(kpis.margin.deltaType).toBe("pp");
    expect(kpis.margin.delta).toBeCloseTo(0.05);
    expect(kpis.goal.value).toBeCloseTo(1200 / 1400);
  });

  test("buildKpis: utilidad con base negativa usa delta absoluto", () => {
    const k = buildKpis({
      totals: { sales: 100, baseSales: 100, difference: 20, baseDifference: -30, margin: 0.2, baseMargin: -0.3 },
      sites: [],
    }).find((x) => x.key === "profit");
    expect(k.delta).toBeNull();
    expect(k.absDelta).toBe(50);
  });

  test("buildKpis sin totales -> []", () => {
    expect(buildKpis(null)).toEqual([]);
    expect(buildKpis({})).toEqual([]);
  });
});

describe("series y tablas de gráficos", () => {
  test("buildYoYSeries ordena por mes y respeta nulos", () => {
    const s = buildYoYSeries(compare.monthly, "sales");
    expect(s.labels).toEqual(["Ene", "Feb"]);
    expect(s.current).toEqual([700, 500]);
    expect(s.base).toEqual([null, 450]);
    const m = buildYoYSeries(compare.monthly, "margin");
    expect(m.current).toEqual([null, 0.3]);
    expect(m.base).toEqual([0.25, 0.28]);
  });

  test("buildYoYTableRows formatea ventas y márgenes", () => {
    const rows = buildYoYTableRows(buildYoYSeries(compare.monthly, "sales"), "money");
    expect(rows[0]).toEqual({ label: "Ene", current: "Q 700.00", base: "—", delta: "—" });
    expect(rows[1].delta).toBe("+11.1%");
    const pct = buildYoYTableRows(buildYoYSeries(compare.monthly, "margin"), "pct");
    expect(pct[1]).toEqual({ label: "Feb", current: "30.0%", base: "28.0%", delta: "+2.0 pp" });
  });
});

describe("ranking", () => {
  const rows = buildRankingRows(compare.sites);

  test("marca kioscos sin base comparable", () => {
    expect(rows.find((r) => r.name === "C").hasBase).toBe(false);
    expect(rows.find((r) => r.name === "C").deltaPct).toBeNull();
    expect(rows.find((r) => r.name === "A").deltaPct).toBeCloseTo(200 / 600);
  });

  test("sortRows deja nulos al final en ambas direcciones", () => {
    expect(sortRows(rows, "deltaPct", "desc").map((r) => r.name)).toEqual(["A", "B", "C"]);
    expect(sortRows(rows, "deltaPct", "asc").map((r) => r.name)).toEqual(["B", "A", "C"]);
    expect(sortRows(rows, "name", "desc").map((r) => r.name)).toEqual(["C", "B", "A"]);
  });

  test("filterRowsByName ignora acentos y mayúsculas", () => {
    const list = [{ name: "SANTALÙ" }, { name: "Peri Roosevelt" }];
    expect(filterRowsByName(list, "santalu")).toHaveLength(1);
    expect(filterRowsByName(list, "  ")).toHaveLength(2);
    expect(filterRowsByName(list, "PERI")).toHaveLength(1);
  });
});

describe("sombreado por mediana", () => {
  test("median", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([null, undefined])).toBeNull();
  });

  test("heatBucket por múltiplos de la mediana", () => {
    expect(heatBucket(40, 100)).toBe(0);
    expect(heatBucket(50, 100)).toBe(1);
    expect(heatBucket(100, 100)).toBe(2);
    expect(heatBucket(120, 100)).toBe(3);
    expect(heatBucket(160, 100)).toBe(4);
    expect(heatBucket(250, 100)).toBe(5);
  });

  test("heatBucket: sin dato, cero o sin mediana no se sombrea", () => {
    expect(heatBucket(null, 100)).toBeNull();
    expect(heatBucket(0, 100)).toBeNull();
    expect(heatBucket(50, null)).toBeNull();
    expect(heatBucket(50, 0)).toBeNull();
  });

  test("buildSiteMedians ignora nulos y ceros", () => {
    const matrix = {
      sites: [{ siteId: 1 }, { siteId: 2 }],
      days: [
        { values: { 1: 10, 2: null } },
        { values: { 1: 0, 2: null } },
        { values: { 1: 30, 2: 5 } },
        { values: { 1: 20 } },
      ],
    };
    expect(buildSiteMedians(matrix)).toEqual({ 1: 20, 2: 5 });
  });
});

describe("P&L", () => {
  const pnl = {
    sites: [
      {
        siteId: 1,
        sales: 100,
        breakEven: 150,
        difference: -5,
        fixed: { byCategory: { ALQUILER: 10, RARA: 1 } },
        byMonth: [
          { month: 2, sales: 10, totalCost: 12, difference: -2, margin: -0.2 },
          { month: 1, sales: 20, totalCost: 10, difference: 10, margin: 0.5 },
        ],
      },
    ],
    totals: { fixed: { byCategory: { ALQUILER: 10 } } },
  };
  const catalog = [
    { code: "LUZ", name: "Luz", sortOrder: 2 },
    { code: "ALQUILER", name: "Alquiler", sortOrder: 1 },
  ];

  test("orderFixedCategories: catálogo por sortOrder y luego claves desconocidas", () => {
    expect(orderFixedCategories(pnl, catalog)).toEqual([
      { code: "ALQUILER", name: "Alquiler" },
      { code: "LUZ", name: "Luz" },
      { code: "RARA", name: "Rara" },
    ]);
    expect(orderFixedCategories(pnl, [])).toEqual([
      { code: "ALQUILER", name: "Alquiler" },
      { code: "RARA", name: "Rara" },
    ]);
  });

  test("buildPnlRowDefs replica el orden del Excel", () => {
    const keys = buildPnlRowDefs([{ code: "ALQUILER", name: "Alquiler" }]).map((r) => r.key);
    expect(keys).toEqual([
      "status",
      "sales",
      "hdr-var",
      "productCost",
      "salesCommission",
      "cardCommission",
      "tax",
      "variableTotal",
      "hdr-fix",
      "fixed:ALQUILER",
      "fixedTotal",
      "totalCost",
      "difference",
      "margin",
      "hdr-eq",
      "breakEven",
      "breakEvenDaily",
      "participationPct",
      "goal",
      "goalPct",
    ]);
  });

  test("siteStatus: equilibrio pesa más que pérdida", () => {
    expect(siteStatus({ sales: 100, breakEven: 150, difference: -5 })).toBe("below");
    expect(siteStatus({ sales: 200, breakEven: 150, difference: -5 })).toBe("negative");
    expect(siteStatus({ sales: 200, breakEven: 150, difference: 5 })).toBe("ok");
    expect(siteStatus({ sales: 0 })).toBe("nodata");
    expect(siteStatus(null)).toBe("nodata");
    expect(siteStatus({ sales: 50, breakEven: null, difference: 1 })).toBe("ok");
  });

  test("buildMonthlyRows ordena y marca meses en pérdida", () => {
    const rows = buildMonthlyRows(pnl.sites[0]);
    expect(rows.map((r) => r.month)).toEqual([1, 2]);
    expect(rows.map((r) => r.negative)).toEqual([false, true]);
  });
});

describe("metas y equilibrio", () => {
  const sites = [
    { siteId: 1, name: "Cumple", sales: 120, goal: 100, goalPct: 1.2, breakEven: 60 },
    { siteId: 2, name: "Medio", sales: 70, goal: 100, goalPct: 0.7, breakEven: 60 },
    { siteId: 3, name: "Bajo", sales: 40, goal: 100, goalPct: 0.4, breakEven: 60 },
    { siteId: 4, name: "SinMeta", sales: 500, goal: null, goalPct: null, breakEven: 10 },
    { siteId: 5, name: "MetaCero", sales: 5, goal: 0, breakEven: null },
  ];

  test("clasifica estado y ordena por % de meta", () => {
    const { withGoal, noGoal } = buildGoalRows(sites);
    expect(withGoal.map((r) => [r.name, r.status])).toEqual([
      ["Cumple", "met"],
      ["Medio", "between"],
      ["Bajo", "below"],
    ]);
    expect(noGoal.map((r) => r.name)).toEqual(["SinMeta", "MetaCero"]);
    expect(withGoal[0].salesRatio).toBeCloseTo(1.2);
    expect(withGoal[2].peRatio).toBeCloseTo(0.6);
  });

  test("goalAxisMax redondea a 0.25 y acota entre 1.25 y 3", () => {
    expect(goalAxisMax([])).toBe(1.25);
    expect(goalAxisMax([{ salesRatio: 1.2, peRatio: null }])).toBe(1.25);
    expect(goalAxisMax([{ salesRatio: 1.31, peRatio: 0.5 }])).toBe(1.5);
    expect(goalAxisMax([{ salesRatio: 9, peRatio: 0.5 }])).toBe(3);
  });
});

describe("completitud", () => {
  test("completenessCell", () => {
    expect(completenessCell({ hasSales: true, hasCosts: true, hasGoal: true }).status).toBe("complete");
    const partial = completenessCell({ hasSales: true, hasCosts: false, hasGoal: false });
    expect(partial.status).toBe("partial");
    expect(partial.missing).toEqual(["costos", "meta"]);
    expect(completenessCell({}).status).toBe("empty");
    expect(completenessCell(null).status).toBe("empty");
  });

  test("buildCompletenessRows completa 12 meses y filtra por sitio", () => {
    const data = {
      sites: [
        { siteId: 1, name: "A", months: [{ month: 3, hasSales: true, hasCosts: false, hasGoal: true }] },
        { siteId: 2, name: "B", months: [] },
      ],
    };
    const all = buildCompletenessRows(data, []);
    expect(all).toHaveLength(2);
    expect(all[0].cells).toHaveLength(12);
    expect(all[0].cells[2].status).toBe("partial");
    expect(all[0].gaps).toBe(1);
    expect(all[1].gaps).toBe(0);
    expect(buildCompletenessRows(data, [2]).map((r) => r.name)).toEqual(["B"]);
  });
});

describe("filtro por supervisora", () => {
  const data = {
    supervisors: [
      { userId: 7, name: "Ana", siteIds: [1, 2] },
      { userId: 8, name: "Beatriz", siteIds: [2, 3] },
      { userId: 9, name: "Sin kioscos", siteIds: [] },
    ],
    unassignedSiteIds: [4],
  };
  const options = buildSupervisorOptions(data);

  test("una opción por supervisora con kioscos + 'Sin supervisora'", () => {
    expect(options.map((o) => o.label)).toEqual(["Ana (2)", "Beatriz (2)", "Sin supervisora (1)"]);
    expect(options[2].value).toBe(UNASSIGNED_SUPERVISOR);
    expect(buildSupervisorOptions(null)).toEqual([]);
    expect(buildSupervisorOptions({ supervisors: [], unassignedSiteIds: [] })).toEqual([]);
  });

  test("marcar una u otra o ambas; quitar una conserva los kioscos de la otra", () => {
    const [ana, beatriz] = options;
    let sites = applySupervisorSelection([], [], [ana]);
    expect(sites).toEqual([1, 2]);
    expect(selectedSupervisorOptions(options, sites)).toEqual([ana]);

    sites = applySupervisorSelection(sites, [ana], [ana, beatriz]);
    expect(sites).toEqual([1, 2, 3]);
    expect(selectedSupervisorOptions(options, sites)).toEqual([ana, beatriz]);

    // el kiosco 2 es de las dos: al quitar a Ana se queda porque Beatriz sigue marcada
    sites = applySupervisorSelection(sites, [ana, beatriz], [beatriz]);
    expect(sites).toEqual([2, 3]);

    // sin ninguna marcada la selección queda vacía = todos los kioscos
    sites = applySupervisorSelection(sites, [beatriz], []);
    expect(sites).toEqual([]);
    expect(selectedSupervisorOptions(options, sites)).toEqual([]);
  });

  test("conserva los kioscos sueltos que el usuario ya había elegido", () => {
    const [ana] = options;
    expect(applySupervisorSelection([4], [], [ana])).toEqual([1, 2, 4]);
    expect(applySupervisorSelection([4, 1, 2], [ana], [])).toEqual([4]);
  });

  test("'Sin supervisora' marca los kioscos sin asignar", () => {
    const none = options[2];
    expect(applySupervisorSelection([], [], [none])).toEqual([4]);
  });
});

describe("texto del modo de comparación", () => {
  const base = { year: 2026, baseYear: 2025, fromMonth: 1, toMonth: 9 };

  test("mismas fechas: llega hasta hoy si el rango incluye el mes en curso", () => {
    const t = describeComparison({ ...base, mode: "SAME_PERIOD", today: "2026-09-30" });
    expect(t).toContain("del 1 de enero hasta hoy (30 de septiembre) de 2026");
    expect(t).toContain("esas mismas fechas de 2025");
    expect(t).toContain("primera venta");
  });

  test("mismas fechas con un año cerrado llega al fin del último mes", () => {
    const t = describeComparison({ ...base, year: 2025, baseYear: 2024, toMonth: 12, mode: "SAME_PERIOD", today: "2026-09-30" });
    expect(t).toContain("hasta el fin de diciembre de 2025");
  });

  test("meses completos avisa que el mes en curso aún no termina", () => {
    const t = describeComparison({ ...base, mode: "FULL_MONTH", today: "2026-09-30" });
    expect(t).toContain("Meses completos de enero a septiembre: 2026 contra 2025.");
    expect(t).toContain("Septiembre 2026 aún no termina");
    const closed = describeComparison({ ...base, toMonth: 8, mode: "FULL_MONTH", today: "2026-09-30" });
    expect(closed).not.toContain("aún no termina");
    expect(describeComparison({ ...base, fromMonth: 3, toMonth: 3, mode: "FULL_MONTH", today: "2026-09-30" })).toContain(
      "Meses completos de marzo:"
    );
  });
});

describe("proyecciones", () => {
  test("formatGrowth: factor año sobre año a porcentaje con signo", () => {
    expect(formatGrowth(1.1)).toBe("+10.0 %");
    expect(formatGrowth(0.95)).toBe("-5.0 %");
    expect(formatGrowth("1.0000")).toBe("+0.0 %");
  });

  test("goalOutlook: la comisión de venta se activa al 70 % de la meta", () => {
    expect(goalOutlook(null).key).toBe("nogoal");
    expect(goalOutlook(1.02)).toMatchObject({ key: "met", cls: "good" });
    expect(goalOutlook(1)).toMatchObject({ key: "met" });
    expect(goalOutlook(0.85)).toMatchObject({ key: "commission", cls: "mid" });
    expect(goalOutlook(0.7)).toMatchObject({ key: "commission" });
    expect(goalOutlook(0.69)).toMatchObject({ key: "below", cls: "bad" });
  });
});
