/**
 * Helpers puros (sin React ni DOM) de 'Publicidad vs ventas' (pestaña Online del Dashboard de ventas).
 * Contrato del backend: docs/SALES-DASHBOARD-CONTRACT.md, addendum 'Inversión en publicidad vs venta online'.
 * Dinero en quetzales con 2 decimales. Resultado del día = venta − inversión; ROAS = venta ÷ inversión
 * (Q vendidos por cada Q1 invertido). No incluye costo de producción.
 */
import { MONTHS_ES, fmtDelta, fmtMoney, fmtNumber } from "utils/financeFormat";
import { parseLocaleNumber } from "utils/financeInput";
import { WEEKDAYS, fmtDayMonth, isValidYmd, weekdayIndex } from "./salesDashboardHelpers";

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** Mismo permiso que edita las ventas online (routes.js: Ventas Online). Ver = quien ve el dashboard. */
export const AD_SPEND_EDIT_PERMISSION = "VENTAS.VENTAS_ONLINE.EDITAR";
export const MAX_AMOUNT = 9999999.99;
export const MAX_NOTES_LENGTH = 255;
/** Máximo de días del reporte (el backend responde 400 si se excede). */
export const MAX_REPORT_DAYS = 400;
/** Máximo de entradas por POST /ad-spend/bulk. */
export const MAX_BULK_ENTRIES = 400;

/** Colores de la sección (verde / rojo iguales a las pastillas del dashboard). */
export const AD_COLORS = {
  sales: "#f0a63a",
  salesInk: "#c77d0a",
  spend: "#3b4a5a",
  win: "#17683f",
  loss: "#a1361a",
  even: "#6f7b88",
  line: "#8a8f94",
};

const FORMAT_ERROR = "Escribe un monto válido, por ejemplo 1500 o 1,500.50.";
const MAX_ERROR = "El monto no puede exceder Q9,999,999.99.";

/* ------------------------------------------------------------------ */
/* Números                                                             */
/* ------------------------------------------------------------------ */

/** Número o null (null, undefined, '' y NaN -> null). Tolera números en texto ('1500.50'). */
export const toNum = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Redondea a 2 decimales con HALF_UP (como el BigDecimal del backend). Pasa por notación exponencial para no
 * caer en el error binario de 1.005 * 100 = 100.49999999999999.
 */
export const roundMoney = (value) => {
  const n = toNum(value);
  if (n === null) return null;
  const abs = Math.abs(n);
  const shifted = Number(`${abs}e2`);
  const cents = Number.isFinite(shifted) ? Math.round(shifted) : Math.round(abs * 100);
  const result = cents / 100;
  return n < 0 && cents !== 0 ? -result : result;
};

const toCents = (value) => Math.round(value * 100);

/** Dos montos son iguales si coinciden al centavo; null solo es igual a null. */
export const sameAmount = (a, b) => {
  const x = toNum(a);
  const y = toNum(b);
  if (x === null || y === null) return x === y;
  return toCents(x) === toCents(y);
};

/**
 * Texto libre -> monto. Acepta '1,234.50', '1234.5', 'Q 800' (misma regla que Finanzas por kiosco).
 * Vacío = sin monto (borra la captura de ese día). Rechaza negativos, texto, más de 2 decimales y montos
 * mayores a Q9,999,999.99. Devuelve { ok, empty, value, error }.
 */
export const parseAmount = (raw) => {
  const fail = (error) => ({ ok: false, empty: false, value: null, error });
  const text = raw === null || raw === undefined ? "" : String(raw).trim();
  if (text === "") return { ok: true, empty: true, value: null, error: "" };
  // '-' solo vale 0 en las hojas de Finanzas (formato contable); aquí sería ambiguo.
  if (/^[-–−]+$/.test(text) || text.includes("%")) return fail(FORMAT_ERROR);
  const res = parseLocaleNumber(text);
  if (!res.valid || res.value === null || !Number.isFinite(res.value)) return fail(FORMAT_ERROR);
  if (res.value < 0) return fail("El monto no puede ser negativo.");
  const cents = Number((res.value * 100).toPrecision(12));
  if (Math.abs(cents - Math.round(cents)) > 1e-6) return fail("Máximo 2 decimales.");
  if (res.value > MAX_AMOUNT) return fail(MAX_ERROR);
  return { ok: true, empty: false, value: roundMoney(res.value), error: "" };
};

/** Texto de un monto en el campo editable: 1500 -> '1500.00'; null -> ''. */
export const amountToInput = (value) => {
  const n = toNum(value);
  return n === null ? "" : n.toFixed(2);
};

/** Notas sin espacios sobrantes; vacío = ''. */
export const normalizeNotes = (value) => (value === null || value === undefined ? "" : String(value).trim());

/* ------------------------------------------------------------------ */
/* Formato                                                             */
/* ------------------------------------------------------------------ */

/** '+Q 500.00' / '-Q 200.00' / 'Q 0.00'; null -> '—'. */
export const fmtSigned = (value) => fmtDelta(toNum(value));

/** '2.35' (Q vendidos por cada Q1 invertido); null -> '—'. */
export const fmtRoas = (value) => {
  const n = toNum(value);
  return n === null ? "—" : fmtNumber(n, 2);
};

export const plural = (count, singular, pluralText) => `${count} ${count === 1 ? singular : pluralText}`;

/** Aviso de días sin captura; null si no hay ninguno. */
export const noSpendWarning = (count) => {
  if (!(count > 0)) return null;
  return count === 1
    ? "1 día sin inversión capturada no entra al resultado."
    : `${count} días sin inversión capturada no entran al resultado.`;
};

/* ------------------------------------------------------------------ */
/* Fechas                                                              */
/* ------------------------------------------------------------------ */

export const isFutureDate = (ymd, today) => Boolean(ymd) && Boolean(today) && String(ymd) > String(today);

/** Días del rango (inclusive); 0 si alguna fecha es inválida o el rango está invertido. */
export const rangeDayCount = (startDate, endDate) => {
  if (!isValidYmd(startDate) || !isValidYmd(endDate)) return 0;
  const toUtc = (ymd) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
  const diff = Math.round((toUtc(endDate) - toUtc(startDate)) / 86400000);
  return diff < 0 ? 0 : diff + 1;
};

/** '3 de septiembre' (o '3 de septiembre de 2026'). */
export const longDateEs = (ymd, { withYear = false } = {}) => {
  if (!isValidYmd(ymd)) return "";
  const month = MONTHS_ES[Number(ymd.slice(5, 7)) - 1].toLowerCase();
  return `${Number(ymd.slice(8, 10))} de ${month}${withYear ? ` de ${ymd.slice(0, 4)}` : ""}`;
};

export const weekdayShort = (ymd) => (isValidYmd(ymd) ? WEEKDAYS[weekdayIndex(ymd)].short : "");
export const weekdayFull = (ymd) => (isValidYmd(ymd) ? WEEKDAYS[weekdayIndex(ymd)].name : "");

/** '03/09 jue' (con año si el rango abarca varios años: '03/09/26 jue'). */
export const dayLabel = (ymd, { withYear = false } = {}) => {
  if (!isValidYmd(ymd)) return "—";
  const base = `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}${withYear ? `/${ymd.slice(2, 4)}` : ""}`;
  return `${base} ${weekdayShort(ymd)}`;
};

/** Texto del campo de inversión de un día: 'Inversión del 3 de septiembre' (con año si no es el actual). */
export const spendInputLabel = (ymd, today) =>
  `Inversión del ${longDateEs(ymd, { withYear: String(ymd).slice(0, 4) !== String(today || "").slice(0, 4) })}`;

export const notesInputLabel = (ymd, today) =>
  `Nota de la inversión del ${longDateEs(ymd, { withYear: String(ymd).slice(0, 4) !== String(today || "").slice(0, 4) })}`;

/** true si el rango toca más de un año calendario (las etiquetas llevan año). */
export const spansYears = (days) =>
  Boolean(days && days.length && days[0].date.slice(0, 4) !== days[days.length - 1].date.slice(0, 4));

/* ------------------------------------------------------------------ */
/* Estado de un día (ganancia / pérdida)                                */
/* ------------------------------------------------------------------ */

/**
 * tone: good (verde) | bad (rojo) | neutral | none. El color nunca es la única señal: flecha y texto.
 * pill = variante de .sdash-status.
 */
export const STATUS_META = {
  WIN: { key: "WIN", label: "Ganancia", arrow: "▲", tone: "good", pill: "ok" },
  LOSS: { key: "LOSS", label: "Pérdida", arrow: "▼", tone: "bad", pill: "bad" },
  EVEN: { key: "EVEN", label: "Equilibrio", arrow: "■", tone: "neutral", pill: "" },
  NO_SPEND: { key: "NO_SPEND", label: "Sin inversión capturada", arrow: "–", tone: "none", pill: "none" },
  FUTURE: { key: "FUTURE", label: "Fecha futura", arrow: "–", tone: "none", pill: "none" },
};

export const statusMeta = (status) => STATUS_META[status] || STATUS_META.NO_SPEND;

/** Estado a partir del resultado (venta − inversión); null = sin captura. */
export const statusFromNet = (net) => {
  const n = roundMoney(net);
  if (n === null) return "NO_SPEND";
  if (n > 0) return "WIN";
  return n < 0 ? "LOSS" : "EVEN";
};

/** Valores derivados de un día con una inversión dada (vista previa o recálculo). */
export const deriveDay = (salesAmount, adSpend) => {
  const sales = toNum(salesAmount) ?? 0;
  const spend = toNum(adSpend);
  if (spend === null) return { adSpend: null, netResult: null, roas: null, status: "NO_SPEND" };
  const netResult = roundMoney(sales - spend);
  return { adSpend: spend, netResult, roas: spend > 0 ? sales / spend : null, status: statusFromNet(netResult) };
};

/** Estado que se muestra en la tabla: los días futuros no admiten captura. */
export const displayStatus = (day, today) => (isFutureDate(day.date, today) ? "FUTURE" : day.status);

/* ------------------------------------------------------------------ */
/* Respuesta del backend                                               */
/* ------------------------------------------------------------------ */

const normalizeDay = (d) => {
  const spend = toNum(d.adSpend);
  const sales = toNum(d.salesAmount) ?? 0;
  const derived = deriveDay(sales, spend);
  const status = ["WIN", "LOSS", "EVEN", "NO_SPEND"].includes(d.status) ? d.status : derived.status;
  return {
    date: String(d.date).slice(0, 10),
    salesAmount: sales,
    ordersCount: Number(d.ordersCount) || 0,
    adSpend: spend,
    netResult: spend === null ? null : toNum(d.netResult) ?? derived.netResult,
    roas: spend === null || spend <= 0 ? null : toNum(d.roas) ?? derived.roas,
    status,
    notes: d.notes ? String(d.notes) : null,
  };
};

/**
 * Totales a partir de los días (misma regla que el backend): la venta y el resultado solo cuentan los días con
 * inversión capturada; los días sin captura (NO_SPEND) no entran al resultado.
 */
export const computeTotals = (days) => {
  const t = {
    salesAmount: 0,
    ordersCount: 0,
    comparableSales: 0,
    adSpend: 0,
    netResult: 0,
    roas: null,
    daysWithSpend: 0,
    daysNoSpend: 0,
    daysWin: 0,
    daysLoss: 0,
    daysEven: 0,
  };
  (days || []).forEach((d) => {
    const sales = toNum(d.salesAmount) ?? 0;
    const spend = toNum(d.adSpend);
    t.salesAmount += sales;
    t.ordersCount += Number(d.ordersCount) || 0;
    if (spend === null) {
      t.daysNoSpend += 1;
      return;
    }
    t.daysWithSpend += 1;
    t.comparableSales += sales;
    t.adSpend += spend;
    const status = statusFromNet(sales - spend);
    if (status === "WIN") t.daysWin += 1;
    else if (status === "LOSS") t.daysLoss += 1;
    else t.daysEven += 1;
  });
  t.salesAmount = roundMoney(t.salesAmount);
  t.comparableSales = roundMoney(t.comparableSales);
  t.adSpend = roundMoney(t.adSpend);
  t.netResult = roundMoney(t.comparableSales - t.adSpend);
  t.roas = t.adSpend > 0 ? t.comparableSales / t.adSpend : null;
  return t;
};

const normalizeTotals = (t) => ({
  salesAmount: toNum(t.salesAmount) ?? 0,
  ordersCount: Number(t.ordersCount) || 0,
  comparableSales: toNum(t.comparableSales) ?? 0,
  adSpend: toNum(t.adSpend) ?? 0,
  netResult: toNum(t.netResult) ?? 0,
  roas: toNum(t.roas),
  daysWithSpend: Number(t.daysWithSpend) || 0,
  daysNoSpend: Number(t.daysNoSpend) || 0,
  daysWin: Number(t.daysWin) || 0,
  daysLoss: Number(t.daysLoss) || 0,
  daysEven: Number(t.daysEven) || 0,
});

/** Respuesta de GET /ad-spend/report -> días ordenados, sin duplicados y con números (null si falta algo). */
export const normalizeReport = (raw) => {
  if (!raw || typeof raw !== "object") return null;
  const byDate = new Map();
  (raw.days || []).forEach((d) => {
    if (d && isValidYmd(String(d.date || "").slice(0, 10))) byDate.set(String(d.date).slice(0, 10), normalizeDay(d));
  });
  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return {
    startDate: raw.startDate || (days[0] && days[0].date) || "",
    endDate: raw.endDate || (days.length ? days[days.length - 1].date : ""),
    totals: raw.totals ? normalizeTotals(raw.totals) : computeTotals(days),
    days,
  };
};

export const indexDays = (days) => new Map((days || []).map((d) => [d.date, d]));

/** Días sin captura que ya pueden capturarse (los futuros no cuentan en el aviso). */
export const countNoSpendDays = (days, today) =>
  (days || []).filter((d) => d.adSpend === null && !isFutureDate(d.date, today)).length;

/** Mejor y peor día (solo entre los días con inversión): { best, worst } con {date, netResult} o null. */
export const bestWorstDays = (days) => {
  let best = null;
  let worst = null;
  (days || []).forEach((d) => {
    if (d.netResult === null || d.netResult === undefined) return;
    if (d.netResult > 0 && (!best || d.netResult > best.netResult)) best = { date: d.date, netResult: d.netResult };
    if (d.netResult < 0 && (!worst || d.netResult < worst.netResult)) worst = { date: d.date, netResult: d.netResult };
  });
  return { best, worst };
};

/* ------------------------------------------------------------------ */
/* Borradores de captura (por fecha)                                    */
/* ------------------------------------------------------------------ */

/**
 * drafts: { [yyyy-MM-dd]: { amount: string, notes: string, baseAmount, baseNotes } }
 * amount/notes = lo tecleado; baseAmount/baseNotes = lo guardado al empezar a editar (sirve de referencia si la
 * fecha sale del rango visible).
 */

const serverValues = (serverDay, draft) =>
  serverDay
    ? { amount: toNum(serverDay.adSpend), notes: normalizeNotes(serverDay.notes) }
    : { amount: draft ? toNum(draft.baseAmount) : null, notes: draft ? normalizeNotes(draft.baseNotes) : "" };

/**
 * Estado de una fila frente a lo guardado:
 * { dirty, valid, error, notesError, amount, notes, action: 'save' | 'delete' | null }.
 * Monto vacío = borrar la captura (y sus notas). Las notas solo viajan junto con un monto.
 */
export const rowState = (serverDay, draft) => {
  const base = serverValues(serverDay, draft);
  if (!draft) {
    return { dirty: false, valid: true, error: "", notesError: "", amount: base.amount, notes: base.notes, action: null };
  }
  const parsed = parseAmount(draft.amount);
  const notes = normalizeNotes(draft.notes);
  if (!parsed.ok) {
    return { dirty: true, valid: false, error: parsed.error, notesError: "", amount: null, notes, action: null };
  }
  if (parsed.value === null) {
    const dirty = base.amount !== null;
    return { dirty, valid: true, error: "", notesError: "", amount: null, notes: "", action: dirty ? "delete" : null };
  }
  if (notes.length > MAX_NOTES_LENGTH) {
    return {
      dirty: true,
      valid: false,
      error: "",
      notesError: `Las notas no pueden exceder ${MAX_NOTES_LENGTH} caracteres.`,
      amount: parsed.value,
      notes,
      action: null,
    };
  }
  const dirty = !sameAmount(parsed.value, base.amount) || notes !== base.notes;
  return { dirty, valid: true, error: "", notesError: "", amount: parsed.value, notes, action: dirty ? "save" : null };
};

const omit = (obj, keys) => {
  const drop = new Set(keys);
  const out = {};
  Object.keys(obj).forEach((k) => {
    if (!drop.has(k)) out[k] = obj[k];
  });
  return out;
};

/**
 * Aplica un cambio de campo ('amount' | 'notes') al borrador de una fecha. Si el resultado coincide con lo
 * guardado el borrador se descarta. Devuelve el mismo objeto si nada cambia (evita renders).
 */
export const applyDraftChange = (drafts, date, field, value, serverDay) => {
  const prev = drafts[date];
  const current = prev || {
    amount: amountToInput(serverDay ? serverDay.adSpend : null),
    notes: serverDay && serverDay.notes ? String(serverDay.notes) : "",
    baseAmount: serverDay ? toNum(serverDay.adSpend) : null,
    baseNotes: serverDay && serverDay.notes ? String(serverDay.notes) : null,
  };
  if (prev && prev[field] === value) return drafts;
  const next = { ...current, [field]: value };
  const state = rowState(serverDay, next);
  if (!state.dirty && state.valid) return prev ? omit(drafts, [date]) : drafts;
  return { ...drafts, [date]: next };
};

/** Quita los borradores que ya coinciden con lo guardado (p. ej. tras recargar el reporte). */
export const prunePristine = (drafts, byDate) => {
  const stale = Object.keys(drafts).filter((date) => {
    const state = rowState(byDate.get(date), drafts[date]);
    return state.valid && !state.dirty;
  });
  return stale.length ? omit(drafts, stale) : drafts;
};

export const dropDrafts = (drafts, dates) => omit(drafts, dates);

/**
 * Resumen de los borradores: entradas para POST /ad-spend/bulk (solo filas que cambian y son válidas),
 * filas inválidas y fechas fuera del rango visible.
 * entries: [{ date, amount: number|null, notes?: string|null }] (amount null = borrar esa captura).
 */
export const summarizeDrafts = (drafts, byDate) => {
  const entries = [];
  const invalid = [];
  const outOfRange = [];
  Object.keys(drafts)
    .sort()
    .forEach((date) => {
      const state = rowState(byDate.get(date), drafts[date]);
      if (!byDate.has(date)) outOfRange.push(date);
      if (!state.valid) {
        invalid.push({ date, error: state.error || state.notesError });
      } else if (state.action === "delete") {
        entries.push({ date, amount: null });
      } else if (state.action === "save") {
        entries.push({ date, amount: roundMoney(state.amount), notes: state.notes || null });
      }
    });
  return {
    entries,
    invalid,
    outOfRange,
    saves: entries.filter((e) => e.amount !== null).length,
    deletes: entries.filter((e) => e.amount === null).length,
    pending: entries.length + invalid.length,
    canSave: entries.length > 0 && invalid.length === 0 && entries.length <= MAX_BULK_ENTRIES,
  };
};

/** Días con las capturas pendientes (válidas) aplicadas: vista previa de los totales. */
export const applyDraftsToDays = (days, drafts) =>
  (days || []).map((day) => {
    const draft = drafts[day.date];
    if (!draft) return day;
    const state = rowState(day, draft);
    if (!state.valid || !state.dirty) return day;
    const derived = deriveDay(day.salesAmount, state.amount);
    return { ...day, ...derived, notes: state.amount === null ? null : state.notes || null };
  });

/** 'Se guardaron 3 días y se borró 1 captura.' */
export const describeBulkResult = ({ saved = 0, deleted = 0 } = {}) => {
  const parts = [];
  if (saved > 0) parts.push(`se ${saved === 1 ? "guardó" : "guardaron"} ${plural(saved, "día", "días")}`);
  if (deleted > 0) parts.push(`se ${deleted === 1 ? "borró" : "borraron"} ${plural(deleted, "captura", "capturas")}`);
  if (!parts.length) return "No hubo cambios que guardar.";
  const text = parts.join(" y ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
};

/* ------------------------------------------------------------------ */
/* Captura rápida                                                      */
/* ------------------------------------------------------------------ */

/** Valida el formulario de captura rápida. today = hoy en Guatemala (yyyy-MM-dd). */
export const validateQuickAdd = ({ date, amountText }, today) => {
  const errors = {};
  if (!isValidYmd(date)) errors.date = "Elige una fecha válida.";
  else if (isFutureDate(date, today)) errors.date = "No se puede registrar inversión de una fecha futura.";
  const parsed = parseAmount(amountText);
  if (!parsed.ok) errors.amount = parsed.error;
  else if (parsed.empty) errors.amount = "Escribe el monto de la inversión.";
  return { ok: Object.keys(errors).length === 0, errors, amount: parsed.ok ? parsed.value : null };
};

/* ------------------------------------------------------------------ */
/* Gráfico                                                             */
/* ------------------------------------------------------------------ */

const markerColor = (value) => (value > 0 ? AD_COLORS.win : value < 0 ? AD_COLORS.loss : AD_COLORS.even);
const markerStyle = (value) => (value === 0 ? "rect" : "triangle");
const markerRotation = (value) => (value < 0 ? 180 : 0);

/** Resultado acumulado de los días con inversión (los días sin captura quedan en null). */
export const cumulativeResult = (days) => {
  let acc = 0;
  return (days || []).map((d) => {
    if (d.netResult === null || d.netResult === undefined) return null;
    acc = roundMoney(acc + d.netResult);
    return acc;
  });
};

/**
 * Barras de venta e inversión por día + línea de resultado (del día o acumulado). Los marcadores llevan forma
 * (▲ ganancia, ▼ pérdida, ■ equilibrio) además de color.
 */
export const buildAdSpendChartData = (days, mode = "daily") => {
  const list = days || [];
  const cumulative = mode === "cumulative";
  const line = cumulative ? cumulativeResult(list) : list.map((d) => (d.netResult === undefined ? null : d.netResult));
  const dense = list.length > 45;
  return {
    labels: list.map((d) => fmtDayMonth(d.date)),
    datasets: [
      {
        type: "bar",
        label: "Venta del día",
        data: list.map((d) => d.salesAmount),
        backgroundColor: AD_COLORS.sales,
        borderRadius: 2,
        maxBarThickness: 26,
        order: 2,
      },
      {
        type: "bar",
        label: "Inversión en publicidad",
        data: list.map((d) => d.adSpend),
        backgroundColor: AD_COLORS.spend,
        borderRadius: 2,
        maxBarThickness: 26,
        order: 2,
      },
      {
        type: "line",
        label: cumulative ? "Resultado acumulado" : "Resultado del día",
        data: line,
        borderColor: AD_COLORS.line,
        borderWidth: 1.5,
        backgroundColor: "rgba(0,0,0,0)",
        fill: false,
        tension: 0,
        spanGaps: cumulative,
        order: 1,
        pointStyle: line.map((v) => markerStyle(v)),
        pointRotation: line.map((v) => markerRotation(v)),
        pointBackgroundColor: line.map((v) => markerColor(v)),
        pointBorderColor: "#ffffff",
        pointBorderWidth: 1,
        pointRadius: dense ? 3 : 6,
        pointHoverRadius: 7,
      },
    ],
  };
};

/** Filas de 'Ver como tabla' del gráfico. */
export const buildChartTableRows = (days, today) =>
  (days || []).map((d) => {
    const meta = statusMeta(displayStatus(d, today));
    return {
      label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)}`,
      sales: fmtMoney(d.salesAmount),
      spend: d.adSpend === null ? "—" : fmtMoney(d.adSpend),
      result: d.netResult === null ? "—" : `${meta.arrow} ${fmtSigned(d.netResult)}`,
      status: meta.label,
    };
  });

/** Texto accesible del gráfico. */
export const buildChartAriaLabel = (totals, days) => {
  const { best, worst } = bestWorstDays(days);
  const parts = [
    "Barras de venta e inversión en publicidad por día, con una línea de resultado",
    `${plural(totals.daysWin, "día", "días")} en ganancia, ${plural(totals.daysLoss, "día", "días")} en pérdida` +
      (totals.daysNoSpend > 0 ? ` y ${plural(totals.daysNoSpend, "día", "días")} sin inversión capturada` : ""),
  ];
  if (best) parts.push(`mejor día ${longDateEs(best.date)} con ${fmtSigned(best.netResult)}`);
  if (worst) parts.push(`peor día ${longDateEs(worst.date)} con ${fmtSigned(worst.netResult)}`);
  return `${parts.join("; ")}. Use "Ver como tabla" para leer los valores.`;
};

