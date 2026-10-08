import {
  MAX_BULK_ENTRIES,
  amountToInput,
  applyDraftChange,
  applyDraftsToDays,
  bestWorstDays,
  buildAdSpendChartData,
  buildChartAriaLabel,
  buildChartTableRows,
  computeTotals,
  countNoSpendDays,
  cumulativeResult,
  dayLabel,
  deriveDay,
  describeBulkResult,
  displayStatus,
  fmtResultPct,
  fmtRoas,
  fmtSigned,
  indexDays,
  isFutureDate,
  longDateEs,
  noSpendWarning,
  normalizeReport,
  notesInputLabel,
  parseAmount,
  prunePristine,
  rangeDayCount,
  resultRatio,
  roundMoney,
  rowState,
  sameAmount,
  spansYears,
  spendInputLabel,
  statusFromNet,
  summarizeDrafts,
  validateQuickAdd,
} from "../adSpendHelpers";

/* Septiembre 2026: el 1 es martes. */
const day = (date, salesAmount, adSpend, extra = {}) => ({
  date,
  salesAmount,
  ordersCount: 2,
  ...deriveDay(salesAmount, adSpend),
  notes: null,
  ...extra,
});

const DAYS = [
  day("2026-09-01", 3000, 1000), // ganancia
  day("2026-09-02", 400, 900), // pérdida
  day("2026-09-03", 500, 500), // equilibrio
  day("2026-09-04", 1200, null), // sin captura
  day("2026-09-05", 800, 200, { notes: "Meta ads" }), // ganancia
];

describe("parseAmount", () => {
  test("acepta formatos habituales", () => {
    expect(parseAmount("1,234.50")).toMatchObject({ ok: true, empty: false, value: 1234.5 });
    expect(parseAmount("1234.5")).toMatchObject({ ok: true, value: 1234.5 });
    expect(parseAmount("Q 800")).toMatchObject({ ok: true, value: 800 });
    expect(parseAmount("Q800.00")).toMatchObject({ ok: true, value: 800 });
    expect(parseAmount("  1500  ")).toMatchObject({ ok: true, value: 1500 });
    expect(parseAmount("0")).toMatchObject({ ok: true, empty: false, value: 0 });
    expect(parseAmount("10.500")).toMatchObject({ ok: true, value: 10.5 });
    expect(parseAmount("9999999.99")).toMatchObject({ ok: true, value: 9999999.99 });
  });

  test("vacío = sin monto (borrar la captura)", () => {
    expect(parseAmount("")).toEqual({ ok: true, empty: true, value: null, error: "" });
    expect(parseAmount("   ")).toMatchObject({ ok: true, empty: true });
    expect(parseAmount(null)).toMatchObject({ ok: true, empty: true });
  });

  test("rechaza negativos, texto, porcentajes y '-'", () => {
    expect(parseAmount("-5")).toMatchObject({ ok: false, error: "El monto no puede ser negativo." });
    expect(parseAmount("(500)")).toMatchObject({ ok: false, error: "El monto no puede ser negativo." });
    expect(parseAmount("abc").ok).toBe(false);
    expect(parseAmount("12%").ok).toBe(false);
    expect(parseAmount("-").ok).toBe(false);
    expect(parseAmount("1.2.3").ok).toBe(false);
  });

  test("rechaza más de 2 decimales y montos sobre el máximo", () => {
    expect(parseAmount("10.999")).toMatchObject({ ok: false, error: "Máximo 2 decimales." });
    expect(parseAmount("1.001").ok).toBe(false);
    expect(parseAmount("0.001").ok).toBe(false);
    expect(parseAmount("1234.5678").ok).toBe(false);
    expect(parseAmount("10000000")).toMatchObject({ ok: false, error: "El monto no puede exceder Q9,999,999.99." });
  });
});

describe("redondeo y comparación de montos", () => {
  test("roundMoney redondea HALF_UP a 2 decimales sin error binario", () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(1.004)).toBe(1);
    expect(roundMoney(-1.005)).toBe(-1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(-0.001)).toBe(0);
    expect(roundMoney(null)).toBeNull();
    expect(roundMoney("1500.456")).toBe(1500.46);
  });

  test("sameAmount compara al centavo y trata null como 'sin captura'", () => {
    expect(sameAmount(1500, "1500.00")).toBe(true);
    expect(sameAmount(0.1 + 0.2, 0.3)).toBe(true);
    expect(sameAmount(1500, 1500.01)).toBe(false);
    expect(sameAmount(null, null)).toBe(true);
    expect(sameAmount(0, null)).toBe(false);
  });

  test("amountToInput", () => {
    expect(amountToInput(1500)).toBe("1500.00");
    expect(amountToInput("800.5")).toBe("800.50");
    expect(amountToInput(null)).toBe("");
    expect(amountToInput(undefined)).toBe("");
  });
});

describe("resultado, estado y totales", () => {
  test("statusFromNet y deriveDay", () => {
    expect(statusFromNet(10)).toBe("WIN");
    expect(statusFromNet(-0.01)).toBe("LOSS");
    expect(statusFromNet(0)).toBe("EVEN");
    expect(statusFromNet(0.004)).toBe("EVEN");
    expect(statusFromNet(null)).toBe("NO_SPEND");
    expect(deriveDay(3000, 1000)).toEqual({ adSpend: 1000, netResult: 2000, resultPct: 2, roas: 3, status: "WIN" });
    expect(deriveDay(400, 900)).toMatchObject({ netResult: -500, status: "LOSS" });
    expect(deriveDay(500, 500)).toMatchObject({ netResult: 0, roas: 1, status: "EVEN" });
    expect(deriveDay(1200, null)).toEqual({ adSpend: null, netResult: null, resultPct: null, roas: null, status: "NO_SPEND" });
    expect(deriveDay(1200, 0)).toMatchObject({ netResult: 1200, resultPct: null, roas: null, status: "WIN" });
  });

  test("computeTotals excluye los días sin captura del resultado (regla del contrato)", () => {
    const t = computeTotals(DAYS);
    expect(t.salesAmount).toBe(5900);
    expect(t.ordersCount).toBe(10);
    expect(t.comparableSales).toBe(4700); // sin los 1,200 del día sin inversión
    expect(t.adSpend).toBe(2600);
    expect(t.netResult).toBe(2100);
    expect(t.roas).toBeCloseTo(4700 / 2600, 10);
    expect(t).toMatchObject({ daysWithSpend: 4, daysNoSpend: 1, daysWin: 2, daysLoss: 1, daysEven: 1 });
  });

  test("computeTotals sin inversión: ROAS null y resultado 0", () => {
    const t = computeTotals([day("2026-09-01", 100, null)]);
    expect(t).toMatchObject({ adSpend: 0, comparableSales: 0, netResult: 0, roas: null, daysNoSpend: 1, daysWithSpend: 0 });
  });

  test("formatos de resultado y ROAS", () => {
    expect(fmtSigned(2100)).toBe("+Q 2,100.00");
    expect(fmtSigned(-500)).toBe("-Q 500.00");
    expect(fmtSigned(0)).toBe("Q 0.00");
    expect(fmtSigned(null)).toBe("—");
    expect(fmtRoas(1.8076923)).toBe("1.81");
    expect(fmtRoas(null)).toBe("—");
  });

  test("avisos de días sin captura (singular y plural) sin contar fechas futuras", () => {
    expect(noSpendWarning(0)).toBeNull();
    expect(noSpendWarning(1)).toBe("1 día sin inversión capturada no entra al resultado.");
    expect(noSpendWarning(5)).toBe("5 días sin inversión capturada no entran al resultado.");
    const days = [day("2026-09-01", 1, null), day("2026-09-02", 1, 5), day("2026-09-03", 1, null), day("2026-09-04", 1, null)];
    expect(countNoSpendDays(days, "2026-09-03")).toBe(2);
    expect(countNoSpendDays(days, "2026-12-31")).toBe(3);
  });

  test("mejor y peor día", () => {
    expect(bestWorstDays(DAYS)).toEqual({
      best: { date: "2026-09-01", netResult: 2000 },
      worst: { date: "2026-09-02", netResult: -500 },
    });
    expect(bestWorstDays([day("2026-09-01", 5, null)])).toEqual({ best: null, worst: null });
  });
});

describe("normalizeReport", () => {
  test("convierte textos a números, ordena y descarta fechas inválidas", () => {
    const report = normalizeReport({
      startDate: "2026-09-01",
      endDate: "2026-09-02",
      totals: { salesAmount: "3400.00", ordersCount: 4, comparableSales: "3000", adSpend: "1000", netResult: "2000", roas: "3.00", daysWithSpend: 1, daysNoSpend: 1, daysWin: 1, daysLoss: 0, daysEven: 0 },
      days: [
        { date: "2026-09-02", salesAmount: "400.00", ordersCount: 1, adSpend: null, netResult: null, roas: null, status: "NO_SPEND", notes: null },
        { date: "no-es-fecha", salesAmount: 1 },
        { date: "2026-09-01", salesAmount: "3000.00", ordersCount: 3, adSpend: "1000.00", netResult: "2000.00", roas: "3.00", status: "WIN", notes: "" },
      ],
    });
    expect(report.days.map((d) => d.date)).toEqual(["2026-09-01", "2026-09-02"]);
    expect(report.days[0]).toMatchObject({ salesAmount: 3000, adSpend: 1000, netResult: 2000, roas: 3, status: "WIN", notes: null });
    expect(report.days[1]).toMatchObject({ adSpend: null, netResult: null, roas: null, status: "NO_SPEND" });
    expect(report.totals).toMatchObject({ salesAmount: 3400, comparableSales: 3000, adSpend: 1000, netResult: 2000, roas: 3, daysNoSpend: 1 });
  });

  test("sin totales los recalcula; null si la respuesta no es un objeto", () => {
    const report = normalizeReport({ days: DAYS.map((d) => ({ ...d })) });
    expect(report.totals.netResult).toBe(2100);
    expect(report.startDate).toBe("2026-09-01");
    expect(report.endDate).toBe("2026-09-05");
    expect(normalizeReport(null)).toBeNull();
    expect(normalizeReport("x")).toBeNull();
  });

  test("ROAS null si la inversión es 0 y estado derivado si falta", () => {
    const report = normalizeReport({ days: [{ date: "2026-09-01", salesAmount: 100, adSpend: 0, ordersCount: 1 }] });
    expect(report.days[0]).toMatchObject({ adSpend: 0, roas: null, netResult: 100, status: "WIN" });
  });
});

describe("fechas y etiquetas", () => {
  test("longDateEs y etiquetas accesibles", () => {
    expect(longDateEs("2026-09-03")).toBe("3 de septiembre");
    expect(longDateEs("2026-09-03", { withYear: true })).toBe("3 de septiembre de 2026");
    expect(longDateEs("nope")).toBe("");
    expect(spendInputLabel("2026-09-03", "2026-10-07")).toBe("Inversión del 3 de septiembre");
    expect(spendInputLabel("2025-12-31", "2026-10-07")).toBe("Inversión del 31 de diciembre de 2025");
    expect(notesInputLabel("2026-09-03", "2026-10-07")).toBe("Nota de la inversión del 3 de septiembre");
  });

  test("dayLabel con día de la semana", () => {
    expect(dayLabel("2026-09-03")).toBe("03/09 jue");
    expect(dayLabel("2026-09-01", { withYear: true })).toBe("01/09/26 mar");
    expect(dayLabel("x")).toBe("—");
  });

  test("rango, futuro y años", () => {
    expect(rangeDayCount("2026-09-01", "2026-09-30")).toBe(30);
    expect(rangeDayCount("2026-09-01", "2026-09-01")).toBe(1);
    expect(rangeDayCount("2026-09-02", "2026-09-01")).toBe(0);
    expect(rangeDayCount("2025-01-01", "2026-02-09")).toBe(405);
    expect(isFutureDate("2026-10-08", "2026-10-07")).toBe(true);
    expect(isFutureDate("2026-10-07", "2026-10-07")).toBe(false);
    expect(spansYears([{ date: "2025-12-31" }, { date: "2026-01-02" }])).toBe(true);
    expect(spansYears(DAYS)).toBe(false);
    expect(displayStatus(DAYS[0], "2026-08-31")).toBe("FUTURE");
    expect(displayStatus(DAYS[0], "2026-10-07")).toBe("WIN");
  });
});

describe("rowState", () => {
  const server = day("2026-09-05", 800, 200, { notes: "Meta ads" });

  test("sin borrador no hay cambios", () => {
    expect(rowState(server, undefined)).toMatchObject({ dirty: false, valid: true, amount: 200, notes: "Meta ads", action: null });
  });

  test("monto distinto = guardar; mismo monto escrito de otra forma = sin cambios", () => {
    expect(rowState(server, { amount: "250", notes: "Meta ads" })).toMatchObject({ dirty: true, valid: true, amount: 250, action: "save" });
    expect(rowState(server, { amount: "Q 200.00", notes: "Meta ads" })).toMatchObject({ dirty: false, action: null });
    expect(rowState(server, { amount: "200", notes: "  Meta ads  " })).toMatchObject({ dirty: false });
  });

  test("solo cambia la nota", () => {
    expect(rowState(server, { amount: "200.00", notes: "Google" })).toMatchObject({ dirty: true, action: "save", notes: "Google" });
  });

  test("monto vacío borra la captura existente; si no había captura no es un cambio", () => {
    expect(rowState(server, { amount: "", notes: "Meta ads" })).toMatchObject({ dirty: true, valid: true, amount: null, action: "delete" });
    const empty = day("2026-09-04", 1200, null);
    expect(rowState(empty, { amount: "", notes: "texto suelto" })).toMatchObject({ dirty: false, action: null });
  });

  test("monto inválido bloquea", () => {
    expect(rowState(server, { amount: "abc", notes: "" })).toMatchObject({ dirty: true, valid: false, action: null });
    expect(rowState(server, { amount: "-1", notes: "" }).error).toBe("El monto no puede ser negativo.");
  });

  test("0 es una captura válida distinta de vacío", () => {
    const empty = day("2026-09-04", 1200, null);
    expect(rowState(empty, { amount: "0", notes: "" })).toMatchObject({ dirty: true, valid: true, amount: 0, action: "save" });
  });

  test("notas demasiado largas son inválidas", () => {
    const state = rowState(server, { amount: "200", notes: "x".repeat(256) });
    expect(state.valid).toBe(false);
    expect(state.notesError).toMatch(/255/);
  });

  test("referencia base para fechas fuera del rango", () => {
    const draft = { amount: "300", notes: "", baseAmount: 200, baseNotes: null };
    expect(rowState(undefined, draft)).toMatchObject({ dirty: true, action: "save", amount: 300 });
    expect(rowState(undefined, { ...draft, amount: "200" })).toMatchObject({ dirty: false });
  });
});

describe("borradores", () => {
  const byDate = indexDays(DAYS);

  test("applyDraftChange parte de lo guardado y se descarta al volver al valor original", () => {
    let drafts = applyDraftChange({}, "2026-09-05", "amount", "250", byDate.get("2026-09-05"));
    expect(drafts["2026-09-05"]).toEqual({ amount: "250", notes: "Meta ads", baseAmount: 200, baseNotes: "Meta ads" });
    drafts = applyDraftChange(drafts, "2026-09-05", "amount", "200.00", byDate.get("2026-09-05"));
    expect(drafts).toEqual({});
  });

  test("no crea borrador si lo escrito coincide con lo guardado y conserva la identidad", () => {
    const start = {};
    expect(applyDraftChange(start, "2026-09-05", "amount", "200.00", byDate.get("2026-09-05"))).toBe(start);
    const withDraft = applyDraftChange({}, "2026-09-01", "amount", "1100", byDate.get("2026-09-01"));
    expect(applyDraftChange(withDraft, "2026-09-01", "amount", "1100", byDate.get("2026-09-01"))).toBe(withDraft);
  });

  test("conserva los borradores inválidos y no toca los demás", () => {
    let drafts = applyDraftChange({}, "2026-09-01", "amount", "1100", byDate.get("2026-09-01"));
    const first = drafts["2026-09-01"];
    drafts = applyDraftChange(drafts, "2026-09-04", "amount", "12abc", byDate.get("2026-09-04"));
    expect(drafts["2026-09-04"].amount).toBe("12abc");
    expect(drafts["2026-09-01"]).toBe(first);
  });

  test("prunePristine quita lo que ya coincide con el reporte recargado", () => {
    const drafts = {
      "2026-09-01": { amount: "1000", notes: "", baseAmount: 900, baseNotes: null },
      "2026-09-02": { amount: "950", notes: "", baseAmount: 900, baseNotes: null },
    };
    expect(prunePristine(drafts, byDate)).toEqual({ "2026-09-02": drafts["2026-09-02"] });
    const stable = { "2026-09-02": drafts["2026-09-02"] };
    expect(prunePristine(stable, byDate)).toBe(stable);
  });

  test("summarizeDrafts arma el payload de bulk solo con lo que cambió", () => {
    let drafts = {};
    drafts = applyDraftChange(drafts, "2026-09-01", "amount", "1,100.456", byDate.get("2026-09-01")); // 3 decimales: inválido
    drafts = applyDraftChange(drafts, "2026-09-01", "amount", "1100.5", byDate.get("2026-09-01"));
    drafts = applyDraftChange(drafts, "2026-09-02", "amount", "", byDate.get("2026-09-02")); // borrar
    drafts = applyDraftChange(drafts, "2026-09-04", "amount", "Q 300", byDate.get("2026-09-04")); // nuevo
    drafts = applyDraftChange(drafts, "2026-09-04", "notes", "  Instagram  ", byDate.get("2026-09-04"));
    drafts = applyDraftChange(drafts, "2026-09-03", "amount", "500.00", byDate.get("2026-09-03")); // igual: no entra
    const summary = summarizeDrafts(drafts, byDate);
    expect(summary.entries).toEqual([
      { date: "2026-09-01", amount: 1100.5, notes: null },
      { date: "2026-09-02", amount: null },
      { date: "2026-09-04", amount: 300, notes: "Instagram" },
    ]);
    expect(summary).toMatchObject({ saves: 2, deletes: 1, pending: 3, canSave: true, invalid: [], outOfRange: [] });
  });

  test("una fila inválida bloquea el guardado", () => {
    const drafts = applyDraftChange({}, "2026-09-04", "amount", "abc", byDate.get("2026-09-04"));
    const summary = summarizeDrafts(drafts, byDate);
    expect(summary.entries).toEqual([]);
    expect(summary.invalid).toEqual([{ date: "2026-09-04", error: expect.stringMatching(/monto válido/) }]);
    expect(summary).toMatchObject({ pending: 1, canSave: false });
  });

  test("borradores de fechas fuera del rango visible se incluyen y se avisan", () => {
    const drafts = { "2026-08-30": { amount: "400", notes: "", baseAmount: null, baseNotes: null } };
    const summary = summarizeDrafts(drafts, byDate);
    expect(summary.entries).toEqual([{ date: "2026-08-30", amount: 400, notes: null }]);
    expect(summary.outOfRange).toEqual(["2026-08-30"]);
    expect(summary.canSave).toBe(true);
  });

  test("tope de entradas por solicitud", () => {
    const drafts = {};
    for (let i = 0; i < MAX_BULK_ENTRIES + 1; i += 1) {
      const date = `2020-01-${String((i % 28) + 1).padStart(2, "0")}-${i}`;
      drafts[date] = { amount: "1", notes: "", baseAmount: null, baseNotes: null };
    }
    expect(summarizeDrafts(drafts, byDate).canSave).toBe(false);
  });

  test("vista previa: aplicar borradores válidos recalcula los totales", () => {
    let drafts = applyDraftChange({}, "2026-09-04", "amount", "400", byDate.get("2026-09-04")); // el día sin captura entra
    drafts = applyDraftChange(drafts, "2026-09-02", "amount", "300", byDate.get("2026-09-02")); // pérdida -> ganancia
    drafts = applyDraftChange(drafts, "2026-09-03", "amount", "x", byDate.get("2026-09-03")); // inválido: se ignora
    const preview = applyDraftsToDays(DAYS, drafts);
    expect(preview.find((d) => d.date === "2026-09-04")).toMatchObject({ adSpend: 400, netResult: 800, status: "WIN" });
    expect(preview.find((d) => d.date === "2026-09-02")).toMatchObject({ netResult: 100, status: "WIN" });
    expect(preview.find((d) => d.date === "2026-09-03")).toBe(DAYS[2]);
    const totals = computeTotals(preview);
    expect(totals).toMatchObject({ daysNoSpend: 0, daysWin: 4, daysLoss: 0, daysEven: 1, adSpend: 2400 });
    expect(totals.comparableSales).toBe(5900);
    expect(totals.netResult).toBe(3500);
  });

  test("describeBulkResult", () => {
    expect(describeBulkResult({ saved: 3, deleted: 1 })).toBe("Se guardaron 3 días y se borró 1 captura.");
    expect(describeBulkResult({ saved: 1, deleted: 0 })).toBe("Se guardó 1 día.");
    expect(describeBulkResult({ saved: 0, deleted: 2 })).toBe("Se borraron 2 capturas.");
    expect(describeBulkResult({})).toBe("No hubo cambios que guardar.");
  });
});

describe("captura rápida", () => {
  const today = "2026-10-07";
  test("valida fecha y monto", () => {
    expect(validateQuickAdd({ date: today, amountText: "Q 1,250.50" }, today)).toMatchObject({ ok: true, amount: 1250.5, errors: {} });
    expect(validateQuickAdd({ date: "2026-10-08", amountText: "10" }, today).errors.date).toMatch(/futura/);
    expect(validateQuickAdd({ date: "", amountText: "10" }, today).errors.date).toBeTruthy();
    expect(validateQuickAdd({ date: today, amountText: "" }, today).errors.amount).toMatch(/Escribe el monto/);
    expect(validateQuickAdd({ date: today, amountText: "-3" }, today).ok).toBe(false);
    expect(validateQuickAdd({ date: today, amountText: "3.456" }, today).errors.amount).toBe("Máximo 2 decimales.");
  });
});

describe("gráfico", () => {
  test("acumulado solo de los días con inversión", () => {
    expect(cumulativeResult(DAYS)).toEqual([2000, 1500, 1500, null, 2100]);
  });

  test("barras de venta e inversión + línea de resultado con marcadores por forma", () => {
    const data = buildAdSpendChartData(DAYS, "daily");
    expect(data.labels).toEqual(["01/09", "02/09", "03/09", "04/09", "05/09"]);
    const [sales, spend, line] = data.datasets;
    expect(sales).toMatchObject({ type: "bar", label: "Venta del día", data: [3000, 400, 500, 1200, 800] });
    expect(spend).toMatchObject({ type: "bar", label: "Inversión en publicidad", data: [1000, 900, 500, null, 200] });
    expect(line).toMatchObject({ type: "line", label: "Resultado del día", data: [2000, -500, 0, null, 600], spanGaps: false });
    expect(line.pointStyle).toEqual(["triangle", "triangle", "rect", "triangle", "triangle"]);
    expect(line.pointRotation).toEqual([0, 180, 0, 0, 0]);
    expect(line.pointBackgroundColor[0]).not.toBe(line.pointBackgroundColor[1]);
  });

  test("modo acumulado une los huecos", () => {
    const line = buildAdSpendChartData(DAYS, "cumulative").datasets[2];
    expect(line).toMatchObject({ label: "Resultado acumulado", data: [2000, 1500, 1500, null, 2100], spanGaps: true });
  });

  test("filas de la tabla alternativa y texto accesible", () => {
    const rows = buildChartTableRows(DAYS, "2026-10-07");
    expect(rows[0]).toEqual({
      label: "01/09/2026",
      sales: "Q 3,000.00",
      spend: "Q 1,000.00",
      result: "▲ +Q 2,000.00",
      resultPct: "▲ +200.0%",
      status: "Ganancia",
    });
    expect(rows[1].result).toBe("▼ -Q 500.00");
    expect(rows[1].resultPct).toBe("▼ -55.6%");
    expect(rows[3]).toMatchObject({ spend: "—", result: "—", resultPct: "—", status: "Sin inversión capturada" });
    const label = buildChartAriaLabel(computeTotals(DAYS), DAYS);
    expect(label).toContain("2 días en ganancia, 1 día en pérdida y 1 día sin inversión capturada");
    expect(label).toContain("mejor día 1 de septiembre con +Q 2,000.00");
    expect(label).toContain("peor día 2 de septiembre con -Q 500.00");
    expect(label).toContain('Use "Ver como tabla"');
  });
});

describe("porcentaje de ganancia o pérdida sobre la inversión", () => {
  test("resultRatio: resultado ÷ inversión; null sin inversión o con inversión 0", () => {
    expect(resultRatio(2000, 1000)).toBe(2);
    expect(resultRatio(-500, 900)).toBeCloseTo(-0.5556, 4);
    expect(resultRatio(0, 500)).toBe(0);
    expect(resultRatio(1200, 0)).toBeNull();
    expect(resultRatio(null, 500)).toBeNull();
    expect(resultRatio(500, null)).toBeNull();
  });

  test("fmtResultPct: signo explícito y un decimal", () => {
    expect(fmtResultPct(2)).toBe("+200.0%");
    expect(fmtResultPct(-0.3525)).toBe("-35.3%");
    expect(fmtResultPct(0)).toBe("0.0%");
    expect(fmtResultPct(null)).toBe("—");
  });

  test("normalizeReport y computeTotals traen el % de cada día y del total (solo días con inversión)", () => {
    const report = normalizeReport({
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      days: [
        { date: "2026-09-01", salesAmount: 3000, ordersCount: 2, adSpend: 1000, netResult: 2000, roas: 3, status: "WIN" },
        { date: "2026-09-02", salesAmount: 400, ordersCount: 1, adSpend: 900, netResult: -500, roas: 0.44, status: "LOSS" },
        { date: "2026-09-03", salesAmount: 800, ordersCount: 1, adSpend: null, netResult: null, roas: null, status: "NO_SPEND" },
      ],
    });
    expect(report.days[0].resultPct).toBe(2);
    expect(report.days[1].resultPct).toBeCloseTo(-0.5556, 4);
    expect(report.days[2].resultPct).toBeNull();
    const totals = computeTotals(report.days);
    expect(totals.resultPct).toBeCloseTo(1500 / 1900, 6);
    expect(computeTotals([{ date: "2026-09-03", salesAmount: 800, adSpend: null }]).resultPct).toBeNull();
  });
});
