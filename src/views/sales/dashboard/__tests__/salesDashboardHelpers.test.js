import {
  activeShortcut,
  aggregateWeekdays,
  applyRangeChange,
  barPct,
  buildCompositionSegments,
  buildDailyChartData,
  buildDetailRows,
  buildKioskOptions,
  buildKpiItems,
  buildMonthCalendars,
  buildMonthSelectOptions,
  buildSourceTable,
  buildStackedTrendData,
  buildWeekdayInsight,
  buildWeeklyBars,
  buildYearSelectOptions,
  compositionAriaLabel,
  consolidatedDailyAsPoints,
  CUSTOM_MONTH_LABEL,
  describePeriod,
  detectMonth,
  FIRST_SALES_YEAR,
  fmtCountOrDash,
  fmtQty,
  fmtSharePercent,
  groupBreakdownTail,
  growthDelta,
  hasHistoricalAmount,
  isEmptyKpis,
  isValidYmd,
  KPI_CONFIG,
  monthRange,
  monthYearOf,
  normalizeDaily,
  parseDashboardParams,
  peakPoint,
  percentToDecimal,
  previousRange,
  rangeForMonthPick,
  rangeForYearPick,
  segmentsFromBreakdown,
  shareOf,
  shiftMonth,
  shortcutRange,
  statusTone,
  stepMonth,
  topWeekdayIndexes,
  totalSalesLink,
  trendLabels,
  weekdayIndex,
} from "../salesDashboardHelpers";
import { median } from "views/kiosks/finance/reports/financeReportHelpers";

/** Serie diaria de septiembre 2026 (martes 1) con montos dados por día de la semana (lunes = 0). */
const septemberSeries = (amountFor) =>
  Array.from({ length: 30 }, (_, i) => {
    const date = `2026-09-${String(i + 1).padStart(2, "0")}`;
    return { date, amount: amountFor(weekdayIndex(date), i + 1), count: 1 };
  });

describe("porcentajes", () => {
  test("percentToDecimal divide el porcentaje del backend entre 100", () => {
    expect(percentToDecimal(12.4)).toBeCloseTo(0.124, 6);
    expect(percentToDecimal(-3.4)).toBeCloseTo(-0.034, 6);
    expect(percentToDecimal(null)).toBeNull();
    expect(percentToDecimal(undefined)).toBeNull();
    expect(percentToDecimal("12.4")).toBeCloseTo(0.124, 6);
    expect(percentToDecimal("")).toBeNull();
    expect(percentToDecimal("abc")).toBeNull();
  });

  test("growthDelta devuelve decimal solo si hay periodo anterior comparable", () => {
    expect(growthDelta({ growthPercent: 12.4, previousTotalAmount: 400 })).toBeCloseTo(0.124, 6);
    expect(growthDelta({ growthPercent: 0, previousTotalAmount: 400 })).toBe(0);
    expect(growthDelta({ growthPercent: 100, previousTotalAmount: 0 })).toBeNull();
    expect(growthDelta({ growthPercent: null, previousTotalAmount: 10 })).toBeNull();
    expect(growthDelta(null)).toBeNull();
  });

  test("fmtSharePercent formatea sharePercent como porcentaje", () => {
    expect(fmtSharePercent(55.6)).toBe("55.6%");
    expect(fmtSharePercent(0)).toBe("0.0%");
    expect(fmtSharePercent(null)).toBe("—");
  });

  test("shareOf y barPct", () => {
    expect(shareOf(25, 100)).toBe(0.25);
    expect(shareOf(5, 0)).toBe(0);
    expect(barPct(50, 100)).toBe(50);
    expect(barPct(0.5, 100)).toBe(2);
    expect(barPct(0, 100)).toBe(0);
    expect(barPct(10, 0)).toBe(0);
    expect(barPct(300, 100)).toBe(100);
  });

  test("fmtQty muestra unidades sin decimales", () => {
    expect(fmtQty(2310)).toBe("2,310");
    expect(fmtQty(12.0)).toBe("12");
    expect(fmtQty("1180.00")).toBe("1,180");
    expect(fmtQty(null)).toBe("—");
  });
});

describe("fechas y URL", () => {
  test("isValidYmd rechaza años intermedios al teclear y fechas imposibles", () => {
    expect(isValidYmd("2026-09-30")).toBe(true);
    expect(isValidYmd("0002-09-30")).toBe(false);
    expect(isValidYmd("2026-02-30")).toBe(false);
    expect(isValidYmd("")).toBe(false);
    expect(isValidYmd("2026-9-3")).toBe(false);
  });

  test("shortcutRange", () => {
    expect(shortcutRange("today", "2026-10-07")).toEqual({ startDate: "2026-10-07", endDate: "2026-10-07" });
    expect(shortcutRange("7d", "2026-10-07")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-07" });
    expect(shortcutRange("month", "2026-10-07")).toEqual({ startDate: "2026-10-01", endDate: "2026-10-07" });
    expect(shortcutRange("prevMonth", "2026-10-07")).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
  });

  test("shortcutRange mes anterior cruza el año y años bisiestos", () => {
    expect(shortcutRange("prevMonth", "2026-01-15")).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
    expect(shortcutRange("prevMonth", "2028-03-02")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
  });

  test("activeShortcut detecta el atajo vigente", () => {
    expect(activeShortcut("2026-10-01", "2026-10-07", "2026-10-07")).toBe("7d");
    expect(activeShortcut("2026-09-01", "2026-09-30", "2026-10-07")).toBe("prevMonth");
    expect(activeShortcut("2026-09-05", "2026-09-30", "2026-10-07")).toBe("");
  });

  test("applyRangeChange ignora fechas incompletas y arrastra el otro extremo", () => {
    const range = { startDate: "2026-09-01", endDate: "2026-09-30" };
    expect(applyRangeChange(range, "startDate", "0002-09-01")).toBeNull();
    expect(applyRangeChange(range, "startDate", "")).toBeNull();
    expect(applyRangeChange(range, "startDate", "2026-09-10")).toEqual({ startDate: "2026-09-10", endDate: "2026-09-30" });
    expect(applyRangeChange(range, "startDate", "2026-10-05")).toEqual({ startDate: "2026-10-05", endDate: "2026-10-05" });
    expect(applyRangeChange(range, "endDate", "2026-08-15")).toEqual({ startDate: "2026-08-15", endDate: "2026-08-15" });
  });

  test("parseDashboardParams usa valores por defecto y sanea la URL", () => {
    const today = "2026-10-07";
    expect(parseDashboardParams(new URLSearchParams(""), today)).toEqual({
      tab: "consolidado",
      startDate: "2026-10-01",
      endDate: "2026-10-07",
      siteId: "",
    });
    expect(
      parseDashboardParams(
        new URLSearchParams("tab=kioskos&startDate=2026-09-01&endDate=2026-09-30&siteId=12"),
        today
      )
    ).toEqual({ tab: "kioskos", startDate: "2026-09-01", endDate: "2026-09-30", siteId: "12" });
    const bad = parseDashboardParams(
      new URLSearchParams("tab=xx&startDate=nope&endDate=2026-09-30&siteId=abc"),
      today
    );
    // startDate inválido -> inicio del mes en curso, que queda después de endDate: se intercambian
    expect(bad.tab).toBe("consolidado");
    expect(bad.startDate <= bad.endDate).toBe(true);
    expect(bad.siteId).toBe("");
  });

  test("parseDashboardParams ignora el ?kioskLocationId= de enlaces viejos", () => {
    const today = "2026-10-07";
    const legacy = parseDashboardParams(
      new URLSearchParams("tab=kioskos&startDate=2026-09-01&endDate=2026-09-30&kioskLocationId=12"),
      today
    );
    expect(legacy).toEqual({ tab: "kioskos", startDate: "2026-09-01", endDate: "2026-09-30", siteId: "" });
    expect(legacy).not.toHaveProperty("kioskLocationId");
    // si vienen ambos manda siteId
    expect(parseDashboardParams({ tab: "kioskos", siteId: "3", kioskLocationId: "12" }, today).siteId).toBe("3");
    // solo dígitos
    expect(parseDashboardParams({ siteId: "-1" }, today).siteId).toBe("");
    expect(parseDashboardParams({ siteId: "1e3" }, today).siteId).toBe("");
  });

  test("describePeriod muestra el mes completo por nombre", () => {
    expect(describePeriod("2026-09-01", "2026-09-30")).toBe("Septiembre 2026");
    expect(describePeriod("2026-09-05", "2026-09-30")).toBe("05/09/2026 – 30/09/2026");
    expect(describePeriod("2026-02-01", "2026-02-28")).toBe("Febrero 2026");
    expect(describePeriod("2026-09-01", "2026-09-01")).toBe("01/09/2026");
  });

  test("previousRange y totalSalesLink", () => {
    expect(previousRange("2026-09-01", "2026-09-30")).toEqual({ startDate: "2026-08-02", endDate: "2026-08-31" });
    expect(totalSalesLink("kiosko", "2026-09-01", "2026-09-30")).toBe(
      "/admin/total-sales?channel=kiosko&startDate=2026-09-01&endDate=2026-09-30"
    );
  });
});

describe("selectores de mes y año", () => {
  const TODAY = "2026-10-08";

  test("shiftMonth cruza el año en ambos sentidos", () => {
    expect(shiftMonth("2026-10", -1)).toBe("2026-09");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-10", -24)).toBe("2024-10");
    expect(shiftMonth("2026-03", 0)).toBe("2026-03");
  });

  test("monthRange: mes pasado completo, con febrero bisiesto y no bisiesto", () => {
    expect(monthRange("2026-09", TODAY)).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(monthRange("2026-07", TODAY)).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31" });
    expect(monthRange("2028-02", "2028-10-08")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    expect(monthRange("2026-02", TODAY)).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    // 2000 es bisiesto (divisible entre 400)
    expect(monthRange("2000-02", TODAY)).toEqual({ startDate: "2000-02-01", endDate: "2000-02-29" });
  });

  test("monthRange: el mes en curso llega hasta hoy (igual que el atajo Mes)", () => {
    expect(monthRange("2026-10", TODAY)).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    expect(monthRange("2026-10", TODAY)).toEqual(shortcutRange("month", TODAY));
    expect(monthRange("2026-10-20", TODAY)).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    expect(monthRange(shiftMonth("2026-10", -1), TODAY)).toEqual(shortcutRange("prevMonth", TODAY));
    // el mismo mes pero en otro año no es el mes en curso
    expect(monthRange("2025-10", TODAY)).toEqual({ startDate: "2025-10-01", endDate: "2025-10-31" });
  });

  test("monthRange rechaza valores que no son un mes", () => {
    expect(monthRange("", TODAY)).toBeNull();
    expect(monthRange("2026-13", TODAY)).toBeNull();
    expect(monthRange("2026-00", TODAY)).toBeNull();
    expect(monthRange("septiembre", TODAY)).toBeNull();
    expect(monthRange(undefined, TODAY)).toBeNull();
  });

  test("detectMonth reconoce el mes calendario completo y el mes en curso hasta hoy", () => {
    expect(detectMonth("2026-09-01", "2026-09-30", TODAY)).toBe("2026-09"); // exactamente el mes anterior
    expect(detectMonth("2026-10-01", TODAY, TODAY)).toBe("2026-10"); // mes en curso hasta hoy
    expect(detectMonth("2026-10-01", "2026-10-31", TODAY)).toBe("2026-10"); // mes en curso completo
    expect(detectMonth("2028-02-01", "2028-02-29", TODAY)).toBe("2028-02");
    expect(detectMonth("2026-02-01", "2026-02-28", TODAY)).toBe("2026-02");
    // hoy es el día 1: el mes en curso es de un solo día
    expect(detectMonth("2026-10-01", "2026-10-01", "2026-10-01")).toBe("2026-10");
  });

  test("detectMonth devuelve '' para rangos personalizados", () => {
    expect(detectMonth("2026-09-02", "2026-09-30", TODAY)).toBe("");
    expect(detectMonth("2026-09-01", "2026-09-29", TODAY)).toBe("");
    expect(detectMonth("2026-09-01", "2026-10-31", TODAY)).toBe("");
    expect(detectMonth("2026-08-15", "2026-09-14", TODAY)).toBe("");
    // un mes que ya pasó no se reconoce "hasta hoy"
    expect(detectMonth("2026-09-01", TODAY, TODAY)).toBe("");
    // mes en curso cortado en otro día
    expect(detectMonth("2026-10-01", "2026-10-07", TODAY)).toBe("");
    expect(detectMonth("0002-09-01", "0002-09-30", TODAY)).toBe("");
    expect(detectMonth("", "", TODAY)).toBe("");
  });

  test("detectMonth coincide con el resultado de monthRange para cualquier mes", () => {
    for (let i = 0; i < 30; i += 1) {
      const ym = shiftMonth("2026-10", -i);
      const range = monthRange(ym, TODAY);
      expect(detectMonth(range.startDate, range.endDate, TODAY)).toBe(ym);
    }
  });

  test("monthYearOf: mes completo -> mes y año; rango personalizado -> '' y el año de Desde", () => {
    expect(monthYearOf("2026-09-01", "2026-09-30", TODAY)).toEqual({ month: "09", year: 2026 });
    // mes en curso hasta hoy (atajo 'Mes') y mes en curso completo
    expect(monthYearOf("2026-10-01", TODAY, TODAY)).toEqual({ month: "10", year: 2026 });
    expect(monthYearOf("2026-10-01", "2026-10-31", TODAY)).toEqual({ month: "10", year: 2026 });
    // febrero bisiesto
    expect(monthYearOf("2028-02-01", "2028-02-29", TODAY)).toEqual({ month: "02", year: 2028 });
    // personalizado: el selector de mes queda en '' y el de año en el año de Desde
    expect(monthYearOf("2026-09-05", "2026-09-30", TODAY)).toEqual({ month: "", year: 2026 });
    expect(monthYearOf("2025-12-15", "2026-01-10", TODAY)).toEqual({ month: "", year: 2025 });
    expect(monthYearOf("2026-10-01", "2026-10-07", TODAY)).toEqual({ month: "", year: 2026 });
    // fechas inválidas: año en curso
    expect(monthYearOf("", "", TODAY)).toEqual({ month: "", year: 2026 });
  });

  test("buildYearSelectOptions: del año en curso a 2023, el más reciente primero y sin años futuros", () => {
    expect(FIRST_SALES_YEAR).toBe(2023);
    const options = buildYearSelectOptions(TODAY);
    expect(options.map((o) => o.value)).toEqual(["2026", "2025", "2024", "2023"]);
    expect(options.map((o) => o.label)).toEqual(["2026", "2025", "2024", "2023"]);
    expect(options.every((o) => o.disabled === false)).toBe(true);
    // la lista crece con el año en curso (2023 siempre es el último) y nunca pasa del año de hoy
    expect(buildYearSelectOptions("2027-01-05").map((o) => o.value)).toEqual(["2027", "2026", "2025", "2024", "2023"]);
    expect(buildYearSelectOptions("2023-06-01").map((o) => o.value)).toEqual(["2023"]);
    // reloj anterior a 2023: al menos el año en curso
    expect(buildYearSelectOptions("2022-06-01").map((o) => o.value)).toEqual(["2022"]);
    // orden descendente y sin duplicados
    const values = buildYearSelectOptions("2030-03-01").map((o) => Number(o.value));
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(new Set(values).size).toBe(values.length);
  });

  test("buildYearSelectOptions agrega, deshabilitado, el año de Desde si cae fuera de la ventana", () => {
    // dentro de la ventana: no se duplica
    expect(buildYearSelectOptions(TODAY, 2025).map((o) => o.value)).toEqual(["2026", "2025", "2024", "2023"]);
    // enlace viejo (2022) va al final; fecha futura tecleada (2027) va primero; ninguno se puede elegir a mano
    const old = buildYearSelectOptions(TODAY, 2022);
    expect(old.map((o) => o.value)).toEqual(["2026", "2025", "2024", "2023", "2022"]);
    expect(old[old.length - 1].disabled).toBe(true);
    expect(old.slice(0, -1).every((o) => o.disabled === false)).toBe(true);
    const future = buildYearSelectOptions(TODAY, 2027);
    expect(future.map((o) => o.value)).toEqual(["2027", "2026", "2025", "2024", "2023"]);
    expect(future[0].disabled).toBe(true);
    // un valor que no es un año se ignora
    expect(buildYearSelectOptions(TODAY, "basura")).toHaveLength(4);
    expect(buildYearSelectOptions(TODAY, null)).toHaveLength(4);
    expect(buildYearSelectOptions(TODAY, "")).toHaveLength(4);
    expect(buildYearSelectOptions(TODAY, undefined)).toHaveLength(4);
    expect(buildYearSelectOptions(TODAY, 0)).toHaveLength(4);
  });

  test("buildMonthSelectOptions: Personalizado + Enero…Diciembre", () => {
    const options = buildMonthSelectOptions(2025, TODAY, "03");
    expect(options).toHaveLength(13);
    expect(options[0]).toEqual({ value: "", label: CUSTOM_MONTH_LABEL, disabled: true });
    expect(CUSTOM_MONTH_LABEL).toBe("Personalizado");
    expect(options.slice(1).map((o) => o.value)).toEqual([
      "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12",
    ]);
    expect(options.slice(1).map((o) => o.label)).toEqual([
      "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
    ]);
  });

  test("buildMonthSelectOptions: 'Personalizado' solo se puede elegir cuando el rango no es un mes completo", () => {
    expect(buildMonthSelectOptions(2026, TODAY, "")[0]).toEqual({ value: "", label: "Personalizado", disabled: false });
    expect(buildMonthSelectOptions(2026, TODAY, "09")[0].disabled).toBe(true);
    expect(buildMonthSelectOptions(2026, TODAY)[0].disabled).toBe(false);
  });

  test("buildMonthSelectOptions deshabilita los meses posteriores al mes en curso", () => {
    const disabledMonths = (year) => buildMonthSelectOptions(year, TODAY, "").slice(1).filter((o) => o.disabled).map((o) => o.value);
    // año en curso (hoy = 8 de octubre): noviembre y diciembre
    expect(disabledMonths(2026)).toEqual(["11", "12"]);
    // años pasados: todos disponibles; año futuro (solo si viene de la URL): ninguno
    expect(disabledMonths(2025)).toEqual([]);
    expect(disabledMonths(2023)).toEqual([]);
    expect(disabledMonths(2027)).toHaveLength(12);
    // el mes en curso sí se puede elegir
    expect(buildMonthSelectOptions(2026, TODAY, "").find((o) => o.value === "10").disabled).toBe(false);
    // en enero solo está disponible enero
    expect(buildMonthSelectOptions(2027, "2027-01-05", "").slice(1).filter((o) => !o.disabled).map((o) => o.value)).toEqual(["01"]);
  });

  test("rangeForMonthPick: mes completo del año de Desde, con febrero bisiesto y no bisiesto", () => {
    expect(rangeForMonthPick("2026-03-01", TODAY, "09")).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(rangeForMonthPick("2026-09-01", TODAY, "07")).toEqual({ startDate: "2026-07-01", endDate: "2026-07-31" });
    expect(rangeForMonthPick("2026-09-01", TODAY, "02")).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
    // 2028 es bisiesto; 2100 no lo es (divisible entre 100 pero no entre 400); 2000 sí
    expect(rangeForMonthPick("2028-05-10", "2028-10-08", "02")).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    expect(rangeForMonthPick("2024-05-01", TODAY, "02")).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" });
    expect(rangeForMonthPick("2025-05-01", TODAY, "02")).toEqual({ startDate: "2025-02-01", endDate: "2025-02-28" });
    expect(rangeForMonthPick("2000-05-01", TODAY, "02")).toEqual({ startDate: "2000-02-01", endDate: "2000-02-29" });
    expect(rangeForMonthPick("2100-05-01", "2100-10-08", "02")).toEqual({ startDate: "2100-02-01", endDate: "2100-02-28" });
    // diciembre y enero: sin pasar al año siguiente
    expect(rangeForMonthPick("2025-06-15", TODAY, "12")).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
    expect(rangeForMonthPick("2025-06-15", TODAY, "01")).toEqual({ startDate: "2025-01-01", endDate: "2025-01-31" });
  });

  test("rangeForMonthPick: el mes en curso llega hasta hoy y los meses futuros se acotan al mes en curso", () => {
    expect(rangeForMonthPick("2026-03-01", TODAY, "10")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    expect(rangeForMonthPick("2026-03-01", TODAY, "10")).toEqual(shortcutRange("month", TODAY));
    // un mes posterior al actual (el selector no lo ofrece, pero la regla se mantiene) -> mes en curso
    expect(rangeForMonthPick("2026-03-01", TODAY, "12")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    expect(rangeForMonthPick("2026-03-01", TODAY, "11")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    // desde un año futuro de la URL también se acota
    expect(rangeForMonthPick("2027-03-01", TODAY, "05")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    // el mismo mes pero de un año pasado es completo
    expect(rangeForMonthPick("2025-03-01", TODAY, "10")).toEqual({ startDate: "2025-10-01", endDate: "2025-10-31" });
  });

  test("rangeForMonthPick: con rango personalizado usa el año de Desde y rechaza valores inválidos", () => {
    expect(rangeForMonthPick("2025-12-15", TODAY, "03")).toEqual({ startDate: "2025-03-01", endDate: "2025-03-31" });
    expect(rangeForMonthPick("2026-03-01", TODAY, "")).toBeNull(); // 'Personalizado' no es un mes
    expect(rangeForMonthPick("2026-03-01", TODAY, "13")).toBeNull();
    expect(rangeForMonthPick("2026-03-01", TODAY, "00")).toBeNull();
    expect(rangeForMonthPick("2026-03-01", TODAY, "3")).toBeNull();
    expect(rangeForMonthPick("2026-03-01", TODAY, undefined)).toBeNull();
    expect(rangeForMonthPick("", TODAY, "03")).toBeNull();
    expect(rangeForMonthPick("nope", TODAY, "03")).toBeNull();
  });

  test("rangeForYearPick: conserva el mes y calcula febrero según el año elegido", () => {
    // marzo 2026 -> 2025: marzo 2025 completo
    expect(rangeForYearPick("2026-03-01", TODAY, "2025")).toEqual({ startDate: "2025-03-01", endDate: "2025-03-31" });
    // febrero 2025 (28 días) -> 2024 (bisiesto, 29 días) -> 2023 (28)
    expect(rangeForYearPick("2025-02-01", TODAY, "2024")).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" });
    expect(rangeForYearPick("2024-02-01", TODAY, "2023")).toEqual({ startDate: "2023-02-01", endDate: "2023-02-28" });
    // enero y diciembre: el mes se conserva sin cruzar de año
    expect(rangeForYearPick("2025-12-01", TODAY, "2024")).toEqual({ startDate: "2024-12-01", endDate: "2024-12-31" });
    expect(rangeForYearPick("2024-01-01", TODAY, "2025")).toEqual({ startDate: "2025-01-01", endDate: "2025-01-31" });
    // cada mes del año recibe exactamente su rango: el mes de Desde se detecta de vuelta
    for (let m = 1; m <= 12; m += 1) {
      const mm = String(m).padStart(2, "0");
      const range = rangeForYearPick(`2025-${mm}-01`, TODAY, "2024");
      expect(detectMonth(range.startDate, range.endDate, TODAY)).toBe(`2024-${mm}`);
    }
  });

  test("rangeForYearPick: al pasar al año en curso, un mes posterior al actual se acota al mes en curso", () => {
    // diciembre 2025 -> 2026: no existe diciembre de 2026 todavía -> octubre 2026 hasta hoy
    expect(rangeForYearPick("2025-12-01", TODAY, "2026")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    expect(rangeForYearPick("2025-11-01", TODAY, "2026")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    // el mes actual y los anteriores se conservan
    expect(rangeForYearPick("2025-10-01", TODAY, "2026")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    expect(rangeForYearPick("2025-09-01", TODAY, "2026")).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    // inicio de año: en enero solo se llega a enero
    expect(rangeForYearPick("2025-07-01", "2027-01-05", "2027")).toEqual({ startDate: "2027-01-01", endDate: "2027-01-05" });
    // un año futuro (no está en la lista, pero la regla se mantiene) -> mes en curso
    expect(rangeForYearPick("2025-03-01", TODAY, "2027")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
  });

  test("rangeForYearPick con rango personalizado usa el mes de Desde en el año elegido", () => {
    // 15/03/2026 – 10/04/2026 -> 2025: marzo 2025 completo (el mes en que empieza)
    expect(rangeForYearPick("2026-03-15", TODAY, "2025")).toEqual({ startDate: "2025-03-01", endDate: "2025-03-31" });
    // 15/12/2025 – 10/01/2026 -> 2026: diciembre no existe aún -> mes en curso
    expect(rangeForYearPick("2025-12-15", TODAY, "2026")).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    // 29/02/2024 – ... -> 2023: febrero 2023 (sin día 29)
    expect(rangeForYearPick("2024-02-29", TODAY, "2023")).toEqual({ startDate: "2023-02-01", endDate: "2023-02-28" });
    // dentro del mes en curso: 03/10/2026 – 07/10/2026 -> 2025: octubre 2025 completo
    expect(rangeForYearPick("2026-10-03", TODAY, "2025")).toEqual({ startDate: "2025-10-01", endDate: "2025-10-31" });
  });

  test("rangeForYearPick rechaza años y fechas inválidos", () => {
    expect(rangeForYearPick("2026-03-01", TODAY, "")).toBeNull();
    expect(rangeForYearPick("2026-03-01", TODAY, "26")).toBeNull();
    expect(rangeForYearPick("2026-03-01", TODAY, "20x6")).toBeNull();
    expect(rangeForYearPick("2026-03-01", TODAY, undefined)).toBeNull();
    // fuera de 2000–2100
    expect(rangeForYearPick("2026-03-01", TODAY, "1999")).toBeNull();
    expect(rangeForYearPick("", TODAY, "2025")).toBeNull();
    expect(rangeForYearPick("nope", TODAY, "2025")).toBeNull();
  });

  test("diciembre/enero: ◀ ▶ cruzan el año y los selectores llegan al mismo rango", () => {
    // ◀ desde enero 2026 = diciembre 2025 = elegir el año 2025 y el mes 12
    expect(stepMonth("2026-01-01", "2026-01-31", TODAY, -1)).toEqual(rangeForMonthPick("2025-06-01", TODAY, "12"));
    expect(stepMonth("2026-01-01", "2026-01-31", TODAY, -1)).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
    // ▶ desde diciembre 2025 = enero 2026 = elegir el año 2026 y el mes 01
    expect(stepMonth("2025-12-01", "2025-12-31", TODAY, 1)).toEqual(rangeForMonthPick("2026-06-01", TODAY, "01"));
    expect(stepMonth("2025-12-01", "2025-12-31", TODAY, 1)).toEqual({ startDate: "2026-01-01", endDate: "2026-01-31" });
    // cambiar de año desde diciembre conserva diciembre; el selector de año no hace el salto de ▶
    expect(rangeForYearPick("2025-12-01", TODAY, "2024")).toEqual({ startDate: "2024-12-01", endDate: "2024-12-31" });
  });

  test("stepMonth retrocede desde el mes seleccionado y cruza el año", () => {
    expect(stepMonth("2026-09-01", "2026-09-30", TODAY, -1)).toEqual({ startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(stepMonth("2026-01-01", "2026-01-31", TODAY, -1)).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
    // desde el mes en curso (hasta hoy) al anterior
    expect(stepMonth("2026-10-01", TODAY, TODAY, -1)).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    // marzo -> febrero bisiesto y no bisiesto
    expect(stepMonth("2028-03-01", "2028-03-31", "2028-10-08", -1)).toEqual({ startDate: "2028-02-01", endDate: "2028-02-29" });
    expect(stepMonth("2026-03-01", "2026-03-31", TODAY, -1)).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  });

  test("stepMonth avanza, cruza diciembre -> enero y el mes en curso termina hoy", () => {
    expect(stepMonth("2025-12-01", "2025-12-31", TODAY, 1)).toEqual({ startDate: "2026-01-01", endDate: "2026-01-31" });
    expect(stepMonth("2026-09-01", "2026-09-30", TODAY, 1)).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    // enero de un año nuevo cuando hoy ya está en él
    expect(stepMonth("2025-12-01", "2025-12-31", "2026-01-05", 1)).toEqual({ startDate: "2026-01-01", endDate: "2026-01-05" });
  });

  test("stepMonth no pasa del mes en curso hacia adelante", () => {
    expect(stepMonth("2026-10-01", TODAY, TODAY, 1)).toBeNull();
    expect(stepMonth("2026-10-01", "2026-10-31", TODAY, 1)).toBeNull();
    expect(stepMonth("2026-12-01", "2026-12-31", TODAY, 1)).toBeNull();
    // hacia atrás sí se puede aunque el mes seleccionado sea futuro
    expect(stepMonth("2026-12-01", "2026-12-31", TODAY, -1)).toEqual({ startDate: "2026-11-01", endDate: "2026-11-30" });
  });

  test("stepMonth con rango personalizado parte del mes de Desde", () => {
    // 15/09 - 03/10: ◀ -> agosto completo, ▶ -> octubre hasta hoy
    expect(stepMonth("2026-09-15", "2026-10-03", TODAY, -1)).toEqual({ startDate: "2026-08-01", endDate: "2026-08-31" });
    expect(stepMonth("2026-09-15", "2026-10-03", TODAY, 1)).toEqual({ startDate: "2026-10-01", endDate: TODAY });
    // rango dentro del mes en curso: no hay siguiente, el anterior es septiembre
    expect(stepMonth("2026-10-03", "2026-10-07", TODAY, 1)).toBeNull();
    expect(stepMonth("2026-10-03", "2026-10-07", TODAY, -1)).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(stepMonth("2026-09-05", "2026-09-30", TODAY, -1)).toEqual({ startDate: "2026-08-01", endDate: "2026-08-31" });
  });

  test("stepMonth no sale del rango de años válido y rechaza fechas inválidas", () => {
    expect(stepMonth("2000-01-01", "2000-01-31", TODAY, -1)).toBeNull();
    expect(stepMonth("", "", TODAY, -1)).toBeNull();
    expect(stepMonth("nope", "2026-09-30", TODAY, 1)).toBeNull();
  });
});

describe("KPIs y composición", () => {
  const kpis = {
    totalAmount: 268400,
    productAmount: 252500,
    packagingAmount: 15900,
    shippingAmount: 0,
    historicalAmount: 0,
    previousTotalAmount: 244000,
    growthPercent: 10,
    dailyAmount: 8120,
    salesCount: 1046,
    unitsFinished: 2310,
    avgTicket: 256.6,
  };

  test("buildKpiItems para kioskos incluye unidades y la variación en decimal", () => {
    const items = buildKpiItems(kpis, KPI_CONFIG.KIOSKO, { compareNote: "vs agosto 2026" });
    expect(items.map((i) => i.key)).toEqual(["total", "today", "count", "avg", "units"]);
    expect(items[0].value).toBe("Q 268,400.00");
    expect(items[0].growth).toBeCloseTo(0.1, 6);
    expect(items[0].note).toBe("vs agosto 2026");
    expect(items[4].value).toBe("2,310");
  });

  test("kioskos rotula como (POS) lo que solo viene del POS: tickets, ticket promedio y unidades", () => {
    const items = buildKpiItems(kpis, KPI_CONFIG.KIOSKO);
    expect(items.map((i) => i.label)).toEqual([
      "Ventas de kioskos",
      "Ventas de hoy",
      "Tickets (POS)",
      "Ticket promedio (POS)",
      "Unidades terminadas (POS)",
    ]);
    expect(items[2].value).toBe("1,046");
    expect(items[3].value).toBe("Q 256.60");
    expect(items[3].note).toBe("venta POS ÷ tickets");
    // el total sigue siendo el de Finanzas kioscos (con histórico): sin rótulo (POS)
    expect(items[0].label).not.toMatch(/POS/);
    expect(items[1].label).not.toMatch(/POS/);
  });

  test("consolidado no muestra unidades y vendedor usa 'Órdenes'", () => {
    expect(buildKpiItems(kpis, KPI_CONFIG.consolidado).map((i) => i.key)).toEqual(["total", "today", "count", "avg"]);
    const vendor = buildKpiItems(kpis, KPI_CONFIG.VENDOR);
    expect(vendor[2].label).toBe("Órdenes");
    expect(vendor[3].label).toBe("Promedio por orden");
    // online y vendedor no usan el rótulo (POS)
    expect(buildKpiItems(kpis, KPI_CONFIG.ONLINE).map((i) => i.label).join("|")).not.toMatch(/POS/);
    expect(vendor.map((i) => i.label).join("|")).not.toMatch(/POS/);
  });

  test("el ticket promedio es '—' si no hay tickets (kiosko solo con histórico), no 'Q 0.00'", () => {
    const historicalOnly = { ...kpis, totalAmount: 5000, productAmount: 0, packagingAmount: 0, historicalAmount: 5000, salesCount: 0, unitsFinished: 0, avgTicket: 0 };
    const items = buildKpiItems(historicalOnly, KPI_CONFIG.KIOSKO);
    expect(items[2].value).toBe("0");
    expect(items[3].value).toBe("—");
    expect(items[4].value).toBe("0");
    expect(items[0].value).toBe("Q 5,000.00");
    // con tickets sí se muestra el promedio
    expect(buildKpiItems({ ...kpis, salesCount: 2, avgTicket: 150 }, KPI_CONFIG.KIOSKO)[3].value).toBe("Q 150.00");
  });

  test("la nota del ticket promedio del consolidado aclara que el histórico queda fuera", () => {
    expect(buildKpiItems(kpis, KPI_CONFIG.consolidado)[3].note).toBe("total ÷ operaciones");
    expect(buildKpiItems({ ...kpis, historicalAmount: 0 }, KPI_CONFIG.consolidado)[3].note).toBe("total ÷ operaciones");
    expect(buildKpiItems({ ...kpis, historicalAmount: 1200 }, KPI_CONFIG.consolidado)[3].note).toBe(
      "total sin histórico ÷ operaciones"
    );
  });

  test("hasHistoricalAmount y fmtCountOrDash", () => {
    expect(hasHistoricalAmount({ historicalAmount: 0.01 })).toBe(true);
    expect(hasHistoricalAmount({ historicalAmount: "1200.00" })).toBe(true);
    expect(hasHistoricalAmount({ historicalAmount: 0 })).toBe(false);
    expect(hasHistoricalAmount({ historicalAmount: null })).toBe(false);
    expect(hasHistoricalAmount({})).toBe(false);
    expect(hasHistoricalAmount(null)).toBe(false);
    expect(fmtCountOrDash(0)).toBe("—");
    expect(fmtCountOrDash(null)).toBe("—");
    expect(fmtCountOrDash(undefined)).toBe("—");
    expect(fmtCountOrDash(12)).toBe("12");
    expect(fmtCountOrDash(1046)).toBe("1,046");
  });

  test("nota de 'hoy' con kiosko filtrado", () => {
    const items = buildKpiItems(kpis, KPI_CONFIG.KIOSKO, { filtered: true });
    expect(items[1].note).toBe("kiosko seleccionado");
  });

  test("buildCompositionSegments omite montos en cero y suma 1", () => {
    const seg = buildCompositionSegments(kpis);
    expect(seg.map((s) => s.key)).toEqual(["product", "packaging"]);
    expect(seg.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 6);
    expect(seg[0].share).toBeCloseTo(252500 / 268400, 6);
    expect(buildCompositionSegments({ totalAmount: 0 })).toEqual([]);
    expect(buildCompositionSegments(null)).toEqual([]);
  });

  test("buildCompositionSegments con las tres partes", () => {
    const seg = buildCompositionSegments({
      productAmount: 442800,
      packagingAmount: 24600,
      shippingAmount: 14950,
      totalAmount: 482350,
    });
    expect(seg.map((s) => s.key)).toEqual(["product", "packaging", "shipping"]);
    expect(seg[0].share).toBeCloseTo(0.918, 3);
  });

  test("buildCompositionSegments agrega el 4.º segmento 'Histórico (sin desglose)' solo si historicalAmount > 0", () => {
    const seg = buildCompositionSegments({
      totalAmount: 100000,
      productAmount: 60000,
      packagingAmount: 15000,
      shippingAmount: 0,
      historicalAmount: 25000,
    });
    expect(seg.map((s) => s.key)).toEqual(["product", "packaging", "historical"]);
    const historical = seg[2];
    expect(historical.label).toBe("Histórico (sin desglose)");
    expect(historical.amount).toBe(25000);
    expect(historical.share).toBeCloseTo(0.25, 6);
    // gris claro con trama: no depende solo del color
    expect(historical.pattern).toBe("hatch");
    expect(historical.color).toBe("#e4e7eb");
    expect(seg.slice(0, 2).every((s) => s.pattern === undefined)).toBe(true);
    // las participaciones suman 100 % con las cuatro partes
    expect(seg.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 6);
    expect(seg[0].share).toBeCloseTo(0.6, 6);

    // sin histórico (0, ausente, nulo): los tres segmentos de siempre
    [0, undefined, null].forEach((historicalAmount) => {
      const none = buildCompositionSegments({ productAmount: 90, packagingAmount: 6, shippingAmount: 4, historicalAmount });
      expect(none.map((s) => s.key)).toEqual(["product", "packaging", "shipping"]);
      expect(none.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 6);
    });
  });

  test("buildCompositionSegments con las cuatro partes y un kiosko solo con histórico", () => {
    const all = buildCompositionSegments({
      totalAmount: 1000,
      productAmount: 400,
      packagingAmount: 100,
      shippingAmount: 100,
      historicalAmount: 400,
    });
    expect(all.map((s) => s.key)).toEqual(["product", "packaging", "shipping", "historical"]);
    expect(all.map((s) => s.share)).toEqual([0.4, 0.1, 0.1, 0.4]);
    // un sitio histórico (sin POS): un solo segmento al 100 %
    const only = buildCompositionSegments({ totalAmount: 5000, productAmount: 0, packagingAmount: 0, shippingAmount: 0, historicalAmount: 5000 });
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ key: "historical", amount: 5000, share: 1, pattern: "hatch" });
    // si el backend solo manda el total, se conserva el comportamiento anterior (no hay nada que repartir)
    expect(buildCompositionSegments({ totalAmount: 800 })).toEqual([]);
  });

  test("compositionAriaLabel incluye el histórico con su porcentaje", () => {
    const seg = buildCompositionSegments({ productAmount: 600, packagingAmount: 150, shippingAmount: 0, historicalAmount: 250 });
    expect(compositionAriaLabel(seg)).toBe("Producto terminado 60.0%, Empaque 15.0%, Histórico (sin desglose) 25.0%");
  });

  test("isEmptyKpis", () => {
    expect(isEmptyKpis({ salesCount: 0, totalAmount: 0 })).toBe(true);
    expect(isEmptyKpis({ salesCount: 3, totalAmount: 0 })).toBe(false);
    expect(isEmptyKpis(null)).toBe(true);
  });

  test("groupBreakdownTail agrupa lo sobrante en 'Otros'", () => {
    const rows = [1, 2, 3, 4, 5, 6].map((n) => ({ key: n, label: `r${n}`, count: n, amount: n * 10, sharePercent: n }));
    const grouped = groupBreakdownTail(rows, 4);
    expect(grouped).toHaveLength(5);
    expect(grouped[4]).toMatchObject({ label: "Otros", count: 11, amount: 110, sharePercent: 11 });
    expect(groupBreakdownTail(rows.slice(0, 3), 4)).toHaveLength(3);
  });

  test("segmentsFromBreakdown convierte sharePercent a decimal", () => {
    const seg = segmentsFromBreakdown([
      { key: "EFECTIVO", label: "Efectivo", count: 5, amount: 48, sharePercent: 48 },
      { key: "TARJETA", label: "Tarjeta", count: 4, amount: 41, sharePercent: 41 },
      { key: "VACIO", label: "Cero", count: 0, amount: 0, sharePercent: 0 },
    ]);
    expect(seg).toHaveLength(2);
    expect(seg[0].share).toBeCloseTo(0.48, 6);
    expect(seg[0].color).toBeTruthy();
  });

  test("buildSourceTable suma por fuente y calcula precio promedio por unidad", () => {
    const table = buildSourceTable([
      {
        channel: "KIOSKO",
        label: "Kioskos",
        kpis: { unitsFinished: 2310, productAmount: 252500, packagingAmount: 15900, shippingAmount: 0, totalAmount: 268400 },
      },
      {
        channel: "ONLINE",
        label: "Online",
        kpis: { unitsFinished: 540, productAmount: 111000, packagingAmount: 3500, shippingAmount: 7450, totalAmount: 121950 },
      },
      {
        channel: "VENDOR",
        label: "Vendedor LF",
        kpis: { unitsFinished: 0, productAmount: 0, packagingAmount: 0, shippingAmount: 0, totalAmount: 0 },
      },
    ]);
    expect(table.rows[0].avgPrice).toBeCloseTo(109.307, 2);
    expect(table.rows[1].avgPrice).toBeCloseTo(205.555, 2);
    expect(table.rows[2].avgPrice).toBeNull();
    expect(table.totals.units).toBe(2850);
    expect(table.totals.totalAmount).toBe(390350);
    expect(table.totals.shippingAmount).toBe(7450);
    // sin histórico en ninguna fuente: no hay columna extra y el monto histórico es 0
    expect(table.hasHistorical).toBe(false);
    expect(table.totals.historicalAmount).toBe(0);
    expect(table.rows.map((r) => r.historicalAmount)).toEqual([0, 0, 0]);
  });

  test("buildSourceTable suma la parte histórica: producto + empaque + envío + histórico = total", () => {
    const table = buildSourceTable([
      {
        channel: "KIOSKO",
        label: "Kioskos",
        kpis: { unitsFinished: 1000, productAmount: 100000, packagingAmount: 8000, shippingAmount: 0, historicalAmount: 42000, totalAmount: 150000 },
      },
      {
        channel: "ONLINE",
        label: "Online",
        kpis: { unitsFinished: 540, productAmount: 111000, packagingAmount: 3500, shippingAmount: 7450, historicalAmount: 0, totalAmount: 121950 },
      },
      {
        channel: "VENDOR",
        label: "Vendedor LF",
        kpis: { unitsFinished: 0, productAmount: 0, packagingAmount: 0, shippingAmount: 0, totalAmount: 0 },
      },
    ]);
    expect(table.hasHistorical).toBe(true);
    expect(table.rows[0].historicalAmount).toBe(42000);
    expect(table.rows[1].historicalAmount).toBe(0);
    expect(table.rows[2].historicalAmount).toBe(0); // ausente en el JSON -> 0
    expect(table.totals.historicalAmount).toBe(42000);
    // el precio promedio por unidad sigue siendo producto ÷ unidades del POS (el histórico no entra)
    expect(table.rows[0].avgPrice).toBe(100);
    // cada fila y el total cuadran contra su total
    [...table.rows, table.totals].forEach((r) => {
      expect(r.productAmount + r.packagingAmount + r.shippingAmount + r.historicalAmount).toBe(r.totalAmount);
    });
    expect(table.totals.totalAmount).toBe(271950);
    // basta con que una sola fuente traiga histórico
    const onlyOnline = buildSourceTable([
      { channel: "ONLINE", label: "Online", kpis: { productAmount: 10, historicalAmount: 3, totalAmount: 13 } },
    ]);
    expect(onlyOnline.hasHistorical).toBe(true);
  });

  test("statusTone clasifica por texto sin acentos", () => {
    expect(statusTone("Entregado")).toBe("ok");
    expect(statusTone("COMPLETADA")).toBe("ok");
    expect(statusTone("En producción")).toBe("warn");
    expect(statusTone("Devolución")).toBe("bad");
    expect(statusTone("Cancelado")).toBe("bad");
    expect(statusTone("Sin dato")).toBe("neutral");
    expect(statusTone(null)).toBe("neutral");
  });

  test("buildKioskOptions usa el id del sitio de Finanzas kioscos como valor", () => {
    const opts = buildKioskOptions(
      [
        { siteId: 22, kioskId: 2, kioskCode: "K2", kioskName: "Zeta" },
        { siteId: 11, kioskId: 1, kioskCode: "K1", kioskName: "Alfa" },
      ],
      "9"
    );
    expect(opts.map((o) => o.label)).toEqual(["Todos los kioskos", "Alfa", "Zeta", "Kiosko 9"]);
    expect(opts.map((o) => o.value)).toEqual(["", "11", "22", "9"]);
    expect(buildKioskOptions(null, "").length).toBe(1);
  });

  test("buildKioskOptions incluye los kioskos históricos (sin ubicación del POS) y no duplica el elegido", () => {
    const opts = buildKioskOptions(
      [
        { siteId: 5, kioskId: null, kioskCode: "", kioskName: "Plaza Antigua (histórico)" },
        { siteId: 3, kioskId: 30, kioskCode: "K30", kioskName: "Centro" },
        { siteId: 7, kioskId: null, kioskCode: "H7", kioskName: "" },
        { kioskId: 99, kioskCode: "X", kioskName: "Sin sitio" }, // sin siteId no se puede filtrar: se omite
        null,
      ],
      "5"
    );
    // ordenado por nombre (Centro, H7, Plaza…); el sitio elegido ya viene en la lista: no se agrega otra vez
    expect(opts.map((o) => o.value)).toEqual(["", "3", "7", "5"]);
    expect(opts.map((o) => o.label)).toEqual(["Todos los kioskos", "Centro", "H7", "Plaza Antigua (histórico)"]);
    // el valor es siteId aunque kioskId coincida con otro sitio
    expect(buildKioskOptions([{ siteId: 4, kioskId: 3, kioskName: "A" }, { siteId: 3, kioskId: 4, kioskName: "B" }], "").map((o) => o.value)).toEqual(["", "4", "3"]);
  });

  test("buildKioskOptions agrega 'Cat. A/B/C' al texto de los kioscos clasificados y ordena por nombre", () => {
    const opts = buildKioskOptions(
      [
        { siteId: 7, kioskId: 70, kioskCode: "S", kioskName: "Sur", category: "b" },
        { siteId: 3, kioskId: 30, kioskCode: "C", kioskName: "Centro", category: "A" },
        { siteId: 5, kioskId: null, kioskCode: "", kioskName: "Plaza", category: null },
        { siteId: 8, kioskId: 80, kioskCode: "N", kioskName: "Norte", category: "Z" },
        { siteId: 9, kioskId: 90, kioskCode: "O", kioskName: "Oeste" },
      ],
      "42"
    );
    expect(opts.map((o) => o.label)).toEqual([
      "Todos los kioskos",
      "Centro · Cat. A",
      "Norte",
      "Oeste",
      "Plaza",
      "Sur · Cat. B",
      "Kiosko 42",
    ]);
    // el valor sigue siendo el id del sitio y se conservan el nombre y la clasificación normalizada
    expect(opts.map((o) => o.value)).toEqual(["", "3", "8", "9", "5", "7", "42"]);
    expect(opts.map((o) => o.name)).toEqual(["Todos los kioskos", "Centro", "Norte", "Oeste", "Plaza", "Sur", "Kiosko 42"]);
    expect(opts.map((o) => o.category)).toEqual([null, "A", null, null, null, "B", null]);
  });
});

describe("series diarias, semanas y tendencia", () => {
  test("normalizeDaily ordena, une duplicados y descarta fechas inválidas", () => {
    const out = normalizeDaily([
      { date: "2026-09-02", amount: 5, count: 1 },
      { date: "2026-09-01", amount: 2, count: 1 },
      { date: "2026-09-02", amount: 3, count: 2 },
      { date: "bad", amount: 9, count: 9 },
    ]);
    expect(out).toEqual([
      { date: "2026-09-01", amount: 2, count: 1 },
      { date: "2026-09-02", amount: 8, count: 3 },
    ]);
  });

  test("consolidatedDailyAsPoints toma el total", () => {
    expect(consolidatedDailyAsPoints([{ date: "2026-09-01", kiosko: 1, online: 2, vendor: 3, total: 6 }])).toEqual([
      { date: "2026-09-01", amount: 6, count: undefined },
    ]);
  });

  test("peakPoint y dataset de línea resaltan el pico", () => {
    const points = [
      { date: "2026-09-01", amount: 10, count: 1 },
      { date: "2026-09-02", amount: 30, count: 2 },
      { date: "2026-09-03", amount: 0, count: 0 },
    ];
    expect(peakPoint(points)).toEqual({ index: 1, date: "2026-09-02", amount: 30 });
    expect(peakPoint([{ date: "2026-09-01", amount: 0, count: 0 }])).toBeNull();
    const data = buildDailyChartData(points, { color: "#000", fill: "#eee", label: "Ventas" });
    expect(data.labels).toEqual(["01/09", "02/09", "03/09"]);
    expect(data.datasets[0].data).toEqual([10, 30, 0]);
    expect(data.datasets[0].pointRadius[1]).toBe(5);
  });

  test("buildWeeklyBars agrupa de 7 en 7 desde el inicio del rango", () => {
    const series = septemberSeries(() => 100);
    const weeks = buildWeeklyBars(series);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toMatchObject({ label: "Semana 1", from: "2026-09-01", to: "2026-09-07", days: 7, amount: 700 });
    expect(weeks[4]).toMatchObject({ label: "Semana 5", from: "2026-09-29", to: "2026-09-30", days: 2, amount: 200 });
    expect(buildWeeklyBars([])).toEqual([]);
  });

  test("buildStackedTrendData arma tres series por fuente", () => {
    const trend = [
      { label: "ago", year: 2026, month: 8, kiosko: 1, online: 2, vendor: 3, total: 6 },
      { label: "sep", year: 2026, month: 9, kiosko: 4, online: 5, vendor: 6, total: 15 },
    ];
    const data = buildStackedTrendData(trend);
    expect(data.labels).toEqual(["ago", "sep"]);
    expect(data.datasets.map((d) => d.label)).toEqual(["Kioskos", "Online", "Vendedor LF"]);
    expect(data.datasets[2].data).toEqual([3, 6]);
  });

  test("trendLabels agrega el año si cruza más de uno", () => {
    expect(trendLabels([{ label: "dic", year: 2025 }, { label: "ene", year: 2026 }])).toEqual(["dic 25", "ene 26"]);
  });
});

describe("mapa de calor", () => {
  test("weekdayIndex usa lunes = 0", () => {
    expect(weekdayIndex("2026-09-01")).toBe(1); // martes
    expect(weekdayIndex("2026-09-06")).toBe(6); // domingo
    expect(weekdayIndex("2026-09-07")).toBe(0); // lunes
  });

  test("median de los días con venta", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  test("buildMonthCalendars alinea el primer día y completa semanas", () => {
    const [sep] = buildMonthCalendars(septemberSeries(() => 100));
    expect(sep.key).toBe("2026-09");
    expect(sep.label).toBe("Septiembre 2026");
    expect(sep.days).toHaveLength(30);
    // 1 sep 2026 = martes -> una celda vacía antes
    expect(sep.cells[0]).toBeNull();
    expect(sep.cells[1].day).toBe(1);
    expect(sep.cells.length % 7).toBe(0);
    expect(sep.weeks).toHaveLength(5);
    expect(sep.weeks.every((w) => w.length === 7)).toBe(true);
  });

  test("sombrea contra la mediana del mes con los umbrales de Finanzas y marca el mejor día", () => {
    // Mediana 100: el día 18 vale 300 (pico), los domingos 40, el día 10 queda en cero y el resto 100
    const series = septemberSeries((wd, day) => {
      if (day === 18) return 300;
      if (day === 10) return 0;
      if (wd === 6) return 40;
      return 100;
    });
    const [sep] = buildMonthCalendars(series);
    expect(sep.median).toBe(100);
    const by = Object.fromEntries(sep.days.map((d) => [d.day, d]));
    expect(by[18].bucket).toBe(5); // 3× la mediana >= 2
    expect(by[18].isBest).toBe(true);
    expect(by[2].bucket).toBe(2); // 1× -> 0.85-1.15
    expect(by[6].bucket).toBe(0); // 0.4× < 0.5
    expect(by[10].amount).toBe(0);
    expect(by[10].bucket).toBeNull();
    expect(sep.days.filter((d) => d.isBest)).toHaveLength(1);
    expect(sep.bestDate).toBe("2026-09-18");
    expect(by[18].ratio).toBeCloseTo(3, 6);
  });

  test("un rango de varios meses produce un calendario por mes, cada uno contra su mediana", () => {
    const series = [
      ...Array.from({ length: 5 }, (_, i) => ({ date: `2026-08-${String(27 + i).padStart(2, "0")}`, amount: 1000, count: 1 })),
      ...Array.from({ length: 3 }, (_, i) => ({ date: `2026-09-0${i + 1}`, amount: 10, count: 1 })),
    ];
    const cals = buildMonthCalendars(series);
    expect(cals.map((c) => c.key)).toEqual(["2026-08", "2026-09"]);
    expect(cals[0].median).toBe(1000);
    expect(cals[1].median).toBe(10);
    expect(cals[1].days.every((d) => d.bucket === 2)).toBe(true);
    const detail = buildDetailRows(cals);
    expect(detail).toHaveLength(8);
    expect(detail[7].cumulative).toBe(5030);
    expect(detail[0].label).toMatch(/^27\/08/);
  });

  test("buildDetailRows acumula y etiqueta con día y día de la semana", () => {
    const cals = buildMonthCalendars(septemberSeries(() => 100));
    const rows = buildDetailRows(cals);
    expect(rows).toHaveLength(30);
    expect(rows[0].label).toBe("1 mar");
    expect(rows[29].cumulative).toBe(3000);
    expect(rows[0].ratio).toBe(1);
  });

  test("rango vacío no genera calendarios", () => {
    expect(buildMonthCalendars([])).toEqual([]);
    expect(buildDetailRows([])).toEqual([]);
  });

  test("agregación por día de la semana cuenta los días sin venta como 0", () => {
    const series = septemberSeries((wd) => (wd === 4 ? 600 : 100));
    const wk = aggregateWeekdays(series);
    expect(wk).toHaveLength(7);
    expect(wk.reduce((a, w) => a + w.days, 0)).toBe(30);
    expect(wk[4].avg).toBe(600);
    expect(wk[0].avg).toBe(100);
    expect(topWeekdayIndexes(wk)[0]).toBe(4);
  });

  test("insight: viernes y lunes concentran más venta que su peso en días", () => {
    const series = septemberSeries((wd) => {
      if (wd === 4) return 600;
      if (wd === 0) return 500;
      if (wd === 6) return 20;
      return 100;
    });
    const insight = buildWeekdayInsight(aggregateWeekdays(series), "venta online");
    expect(insight.kind).toBe("concentrated");
    expect(insight.lead).toBe("Viernes y lunes");
    expect(insight.salesShare).toBeGreaterThan(insight.daysShare);
    expect(insight.rest).toContain("de la venta online");
    expect(insight.rest).toContain("Los domingos son el día más flojo.");
  });

  test("insight: ventas parejas o rango corto", () => {
    const even = buildWeekdayInsight(aggregateWeekdays(septemberSeries(() => 100)), "venta");
    expect(even.kind).toBe("even");
    expect(even.lead).toBe("");
    const short = septemberSeries(() => 100).slice(0, 7);
    expect(buildWeekdayInsight(aggregateWeekdays(short), "venta")).toBeNull();
    expect(buildWeekdayInsight(aggregateWeekdays(septemberSeries(() => 0)), "venta")).toBeNull();
  });
});
