/**
 * Helpers puros (sin React ni DOM) para los reportes de Finanzas por kiosco.
 * Contrato: montos en Q, porcentajes como decimales (0.18 = 18 %).
 */
import {
  EMPTY_VALUE,
  MONTHS_ES,
  MONTHS_ES_SHORT,
  fmtMoney,
  fmtNumber,
  growthArrow,
  growthTone,
  isNum,
} from "utils/financeFormat";
import { RESULT_LABELS } from "utils/kioskFinancialsGlossary";

const num = (v) => (isNum(v) ? v : null);

/* ------------------------------------------------------------------ */
/* Deltas y tono                                                       */
/* ------------------------------------------------------------------ */

/** Variación relativa (decimal) cur vs base. null si no hay base comparable. */
export const pctDelta = (cur, base) => {
  const c = num(cur);
  const b = num(base);
  if (c === null || b === null || b === 0) return null;
  return (c - b) / Math.abs(b);
};

/** Diferencia en puntos (decimal) entre dos porcentajes. */
export const ppDelta = (cur, base) => {
  const c = num(cur);
  const b = num(base);
  if (c === null || b === null) return null;
  return c - b;
};

/** '+2.3 pp' desde decimal 0.023. */
export const fmtPp = (decimal, digits = 1) => {
  const n = num(decimal);
  if (n === null) return EMPTY_VALUE;
  const scaled = n * 100;
  const fixed = Math.abs(scaled).toFixed(digits);
  if (Number(fixed) === 0) return `0.${"0".repeat(digits)} pp`;
  return `${scaled > 0 ? "+" : "-"}${fixed} pp`;
};

/**
 * Metadatos de presentación de una variación. Nunca depende sólo del color:
 * devuelve flecha, tono y etiqueta textual para lectores de pantalla.
 * goodWhen: 'up' (ventas, utilidad) | 'down' (costos).
 */
export const deltaMeta = (delta, { goodWhen = "up", epsilon = 0.0005 } = {}) => {
  const tone = growthTone(delta, epsilon);
  let good = null;
  if (tone === "up") good = goodWhen === "up";
  if (tone === "down") good = goodWhen === "down";
  const verdict = good === null ? "sin cambio relevante" : good ? "favorable" : "desfavorable";
  const direction = { up: "aumento", down: "disminución", flat: "sin cambio", na: "sin dato" }[tone];
  return {
    tone,
    good,
    arrow: growthArrow(tone),
    /** clase de estilo: good | bad | neutral */
    kind: good === null ? "neutral" : good ? "good" : "bad",
    srText: tone === "na" ? "Sin dato comparable" : `${direction}, ${verdict}`,
  };
};

/* ------------------------------------------------------------------ */
/* Formato compacto                                                    */
/* ------------------------------------------------------------------ */

/** 'Q 1.09 M', 'Q 845.3 K', 'Q 320.00'. Para KPIs y ejes. */
export const fmtCompactMoney = (value, { prefix = "Q " } = {}) => {
  const n = num(value);
  if (n === null) return EMPTY_VALUE;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}${prefix}${fmtNumber(abs / 1e6, 2)} M`;
  if (abs >= 1e4) return `${sign}${prefix}${fmtNumber(abs / 1e3, 1)} K`;
  return fmtMoney(n, { prefix });
};

/** Tick de eje: 1500 -> '1.5K', 2000000 -> '2M'. */
export const fmtAxisMoney = (value) => {
  const n = num(Number(value));
  if (n === null) return "";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${Number((n / 1e6).toFixed(2))}M`;
  if (abs >= 1e3) return `${Number((n / 1e3).toFixed(1))}K`;
  return String(n);
};

/* ------------------------------------------------------------------ */
/* Resumen: KPIs                                                       */
/* ------------------------------------------------------------------ */

/**
 * % de meta agregado = Σ ventas de kioscos con meta / Σ meta.
 * compare.sites sólo trae goalPct por sitio; la meta se deriva: meta = ventas / goalPct.
 */
export const aggregateGoalPct = (sites, { salesKey = "sales", pctKey = "goalPct" } = {}) => {
  let sales = 0;
  let goal = 0;
  (sites || []).forEach((s) => {
    const pct = num(s?.[pctKey]);
    const sv = num(s?.[salesKey]);
    if (pct === null || pct <= 0 || sv === null) return;
    sales += sv;
    goal += sv / pct;
  });
  return goal > 0 ? sales / goal : null;
};

/**
 * KPIs del Resumen desde la respuesta de /compare.
 * Costo operativo = ventas - diferencia (coherente con el P&L: Diferencia = V - costo).
 */
export const buildKpis = (compare) => {
  const t = compare?.totals;
  if (!t) return [];
  const sales = num(t.sales);
  const baseSales = num(t.baseSales);
  const diff = num(t.difference);
  const baseDiff = num(t.baseDifference);
  const cost = sales !== null && diff !== null ? sales - diff : null;
  const baseCost = baseSales !== null && baseDiff !== null ? baseSales - baseDiff : null;
  const goal = aggregateGoalPct(compare.sites);
  const baseGoal = aggregateGoalPct(compare.sites, { salesKey: "baseSales", pctKey: "baseGoalPct" });

  return [
    {
      key: "sales",
      label: "Ventas",
      kind: "money",
      value: sales,
      base: baseSales,
      delta: num(t.deltaPct) ?? pctDelta(sales, baseSales),
      deltaType: "pct",
      goodWhen: "up",
    },
    {
      key: "cost",
      label: "Costo operativo",
      kind: "money",
      value: cost,
      base: baseCost,
      delta: pctDelta(cost, baseCost),
      deltaType: "pct",
      goodWhen: "down",
    },
    {
      key: "profit",
      label: "Utilidad",
      kind: "money",
      value: diff,
      base: baseDiff,
      // Si la base es negativa/cero el % no es interpretable: se muestra el delta absoluto.
      delta: baseDiff !== null && baseDiff > 0 ? pctDelta(diff, baseDiff) : null,
      absDelta: diff !== null && baseDiff !== null ? diff - baseDiff : null,
      deltaType: "pct",
      goodWhen: "up",
    },
    {
      key: "margin",
      label: RESULT_LABELS.margin,
      kind: "pct",
      value: num(t.margin),
      base: num(t.baseMargin),
      delta: ppDelta(t.margin, t.baseMargin),
      deltaType: "pp",
      goodWhen: "up",
    },
    {
      key: "goal",
      label: "Cumplimiento de meta",
      kind: "pct",
      value: goal,
      base: baseGoal,
      delta: ppDelta(goal, baseGoal),
      deltaType: "pp",
      goodWhen: "up",
    },
  ];
};

/* ------------------------------------------------------------------ */
/* Resumen: series mensuales                                           */
/* ------------------------------------------------------------------ */

/**
 * Serie año vs año base desde compare.monthly. field: 'sales' | 'margin' | 'totalCost'.
 * Meses sin dato -> null (Chart.js deja hueco en líneas).
 */
export const buildYoYSeries = (monthly, field = "sales") => {
  const rows = [...(monthly || [])].sort((a, b) => a.month - b.month);
  const baseField = `base${field.charAt(0).toUpperCase()}${field.slice(1)}`;
  return {
    months: rows.map((r) => r.month),
    labels: rows.map((r) => MONTHS_ES_SHORT[r.month - 1] || String(r.month)),
    current: rows.map((r) => num(r[field])),
    base: rows.map((r) => num(r[baseField])),
  };
};

/** Filas de la vista 'Ver como tabla' del gráfico anual. */
export const buildYoYTableRows = (series, kind = "money") => {
  const f = kind === "pct" ? (v) => (v === null ? EMPTY_VALUE : `${(v * 100).toFixed(1)}%`) : (v) =>
    fmtMoney(v);
  return series.labels.map((label, i) => {
    const cur = series.current[i];
    const base = series.base[i];
    const d = kind === "pct" ? ppDelta(cur, base) : pctDelta(cur, base);
    return {
      label,
      current: f(cur),
      base: f(base),
      delta: d === null ? EMPTY_VALUE : kind === "pct" ? fmtPp(d) : `${d > 0 ? "+" : ""}${(d * 100).toFixed(1)}%`,
    };
  });
};

/* ------------------------------------------------------------------ */
/* Resumen: ranking                                                    */
/* ------------------------------------------------------------------ */

const stripAccents = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const buildRankingRows = (sites) =>
  (sites || []).map((s) => {
    const sales = num(s.sales);
    const baseSales = num(s.baseSales);
    const hasBase = baseSales !== null && baseSales > 0;
    return {
      siteId: s.siteId,
      name: s.name || `Kiosco ${s.siteId}`,
      periodFrom: s.periodFrom || null,
      periodTo: s.periodTo || null,
      basePeriodFrom: s.basePeriodFrom || null,
      basePeriodTo: s.basePeriodTo || null,
      sales,
      baseSales,
      delta: num(s.delta) ?? (sales !== null && baseSales !== null ? sales - baseSales : null),
      deltaPct: hasBase ? num(s.deltaPct) ?? pctDelta(sales, baseSales) : null,
      hasBase,
      goalPct: num(s.goalPct),
      margin: num(s.margin),
      baseMargin: num(s.baseMargin),
    };
  });

/** Ordena por clave; nulos siempre al final, sin importar la dirección. */
export const sortRows = (rows, key, dir = "desc") => {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    const an = av === null || av === undefined;
    const bn = bv === null || bv === undefined;
    if (an && bn) return 0;
    if (an) return 1;
    if (bn) return -1;
    if (typeof av === "string" || typeof bv === "string") {
      return mult * String(av).localeCompare(String(bv), "es", { sensitivity: "base" });
    }
    return mult * (av - bv);
  });
};

export const filterRowsByName = (rows, search) => {
  const q = stripAccents(search).trim();
  if (!q) return rows;
  return rows.filter((r) => stripAccents(r.name).includes(q));
};

/* ------------------------------------------------------------------ */
/* Ventas diarias: sombreado por mediana propia                        */
/* ------------------------------------------------------------------ */

export const median = (values) => {
  const v = (values || []).filter((x) => isNum(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

/** Límites (múltiplos de la mediana propia) que separan las 6 tonalidades. */
export const HEAT_THRESHOLDS = [0.5, 0.85, 1.15, 1.5, 2];

/**
 * Rampa secuencial de un solo tono (azul, claro -> oscuro; segura para daltonismo
 * porque varía en luminosidad). 'dark' = el texto debe ir en blanco.
 */
export const HEAT_STEPS = [
  { bg: "#f5f8fd", dark: false },
  { bg: "#e4eefb", dark: false },
  { bg: "#cde2fb", dark: false },
  { bg: "#86b6ef", dark: false },
  { bg: "#256abf", dark: true },
  { bg: "#184f95", dark: true },
];

/** Índice 0..5 según valor / mediana; null si no aplica (sin dato, cero o sin mediana). */
export const heatBucket = (value, med) => {
  if (!isNum(value) || value <= 0 || !isNum(med) || med <= 0) return null;
  const r = value / med;
  let i = 0;
  while (i < HEAT_THRESHOLDS.length && r >= HEAT_THRESHOLDS[i]) i += 1;
  return i;
};

/** Medianas (sólo días con venta > 0) por siteId. */
export const buildSiteMedians = (matrix) => {
  const out = {};
  (matrix?.sites || []).forEach((s) => {
    const vals = (matrix.days || []).map((d) => d.values?.[s.siteId] ?? d.values?.[String(s.siteId)]);
    out[s.siteId] = median(vals.filter((v) => isNum(v) && v > 0));
  });
  return out;
};

export const cellValue = (day, siteId) => {
  const v = day?.values?.[siteId] ?? day?.values?.[String(siteId)];
  return v === undefined ? null : v;
};

/** 'dd' + día de semana corto para la matriz. */
export const dayLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return { day: "", wd: "", full: iso || EMPTY_VALUE };
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const wd = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][d.getDay()];
  return { day: m[3], wd, full: `${m[3]}/${m[2]}/${m[1]}` };
};

/* ------------------------------------------------------------------ */
/* P&L                                                                 */
/* ------------------------------------------------------------------ */

const prettifyCode = (code) =>
  String(code || "")
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");

/**
 * Categorías fijas presentes en el P&L, con nombre para mostrar:
 * primero las del catálogo (por sortOrder) que aparezcan; luego cualquier clave desconocida.
 */
export const orderFixedCategories = (pnl, configCategories) => {
  const present = new Set();
  [...(pnl?.sites || []), pnl?.totals].forEach((s) =>
    Object.keys(s?.fixed?.byCategory || {}).forEach((k) => present.add(k))
  );
  const catalog = [...(configCategories || [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
  );
  const out = [];
  const seen = new Set();
  catalog.forEach((c) => {
    // El catálogo manda: se muestran las 10 categorías aunque estén en cero.
    out.push({ code: c.code, name: c.name || prettifyCode(c.code) });
    seen.add(c.code);
  });
  [...present]
    .filter((k) => !seen.has(k))
    .sort()
    .forEach((k) => out.push({ code: k, name: prettifyCode(k) }));
  return out;
};

export const isBelowBreakEven = (site) =>
  !!site && isNum(site.breakEven) && site.breakEven > 0 && isNum(site.sales) && site.sales < site.breakEven;

export const isNegativeDifference = (site) => !!site && isNum(site.difference) && site.difference < -0.005;

/**
 * Filas de la tabla P&L (tipo hoja de Excel). cell(site) extrae el valor de un sitio o del total.
 * kind: money | pct | section | status.
 */
export const buildPnlRowDefs = (categories) => {
  const rows = [
    { key: "status", label: "Estado", kind: "status" },
    { key: "sales", label: "Ventas", kind: "money", strong: true, get: (s) => s.sales },
    { key: "hdr-var", label: "Costos variables", kind: "section" },
    { key: "productCost", label: "Costo del producto", kind: "money", get: (s) => s.variable?.productCost },
    { key: "salesCommission", label: "Comisión de venta", kind: "money", get: (s) => s.variable?.salesCommission },
    { key: "cardCommission", label: "Comisión de tarjeta", kind: "money", get: (s) => s.variable?.cardCommission },
    { key: "tax", label: "IVA", kind: "money", get: (s) => s.variable?.tax },
    { key: "variableTotal", label: "Total costos variables", kind: "money", subtotal: true, get: (s) => s.variable?.total },
    { key: "hdr-fix", label: "Costos fijos", kind: "section" },
    ...(categories || []).map((c) => ({
      key: `fixed:${c.code}`,
      label: c.name,
      kind: "money",
      get: (s) => s.fixed?.byCategory?.[c.code] ?? null,
    })),
    { key: "fixedTotal", label: "Total costos fijos", kind: "money", subtotal: true, get: (s) => s.fixed?.total },
    {
      key: "totalCost",
      label: RESULT_LABELS.totalCost,
      sub: "Costos variables + costos fijos",
      kind: "money",
      total: true,
      get: (s) => s.totalCost,
    },
    {
      key: "difference",
      label: RESULT_LABELS.profit,
      sub: RESULT_LABELS.profitFormula,
      kind: "money",
      total: true,
      signed: true,
      get: (s) => s.difference,
    },
    {
      key: "margin",
      label: RESULT_LABELS.margin,
      sub: RESULT_LABELS.marginFormula,
      kind: "pct",
      strong: true,
      get: (s) => s.margin,
    },
    { key: "hdr-eq", label: "Equilibrio y metas", kind: "section" },
    {
      key: "breakEven",
      label: RESULT_LABELS.breakEven,
      sub: "Ventas mínimas para no perder",
      kind: "money",
      help: "pe",
      get: (s) => s.breakEven,
    },
    {
      key: "breakEvenDaily",
      label: RESULT_LABELS.breakEvenDaily,
      sub: "Equilibrio ÷ días del mes",
      kind: "money",
      get: (s) => s.breakEvenDaily,
    },
    {
      key: "participationPct",
      label: "% participación",
      sub: "Ventas del kiosco ÷ total",
      kind: "pct",
      get: (s) => s.participationPct,
    },
    { key: "goal", label: "Meta", kind: "money", get: (s) => s.goal },
    { key: "goalPct", label: "% de meta", sub: "Ventas ÷ meta", kind: "pct", get: (s) => s.goalPct },
  ];
  return rows;
};

/** Estado de un sitio en el P&L: below | negative | ok | nodata. Prioridad: equilibrio > diferencia. */
export const siteStatus = (site) => {
  if (!site || !isNum(site.sales) || site.sales === 0) return "nodata";
  if (isBelowBreakEven(site)) return "below";
  if (isNegativeDifference(site)) return "negative";
  return "ok";
};

/** Filas mes a mes de un kiosco (pnl sin `month`). */
export const buildMonthlyRows = (site) =>
  [...(site?.byMonth || [])]
    .sort((a, b) => a.month - b.month)
    .map((m) => ({
      month: m.month,
      sales: num(m.sales),
      totalCost: num(m.totalCost),
      difference: num(m.difference),
      margin: num(m.margin),
      negative: isNum(m.difference) && m.difference < -0.005,
    }));

/* ------------------------------------------------------------------ */
/* Metas y equilibrio                                                  */
/* ------------------------------------------------------------------ */

/**
 * Filas para las barras horizontales. Cada barra se escala contra SU meta (100 % = meta),
 * de modo que la línea de meta cae en la misma columna para todos los kioscos.
 * Los kioscos sin meta van aparte (no hay escala válida).
 */
export const buildGoalRows = (sites) => {
  const withGoal = [];
  const noGoal = [];
  (sites || []).forEach((s) => {
    const sales = num(s.sales) ?? 0;
    const goal = num(s.goal);
    const breakEven = num(s.breakEven);
    const base = {
      siteId: s.siteId,
      name: s.name,
      sales,
      goal,
      breakEven,
      complete: s.complete !== false,
    };
    if (goal === null || goal <= 0) {
      noGoal.push({ ...base, goalPct: null, salesRatio: null, peRatio: null, status: "nogoal" });
      return;
    }
    const goalPct = num(s.goalPct) ?? sales / goal;
    const peRatio = breakEven !== null && breakEven > 0 ? breakEven / goal : null;
    let status = "between";
    if (sales >= goal) status = "met";
    else if (peRatio !== null && sales < breakEven) status = "below";
    withGoal.push({ ...base, goalPct, salesRatio: sales / goal, peRatio, status });
  });
  withGoal.sort((a, b) => b.goalPct - a.goalPct);
  noGoal.sort((a, b) => b.sales - a.sales);
  return { withGoal, noGoal };
};

/** Máximo del eje (en múltiplos de la meta), redondeado a 0.25 y acotado a [1.25, 3]. */
export const goalAxisMax = (rows) => {
  let max = 1.25;
  (rows || []).forEach((r) => {
    if (isNum(r.salesRatio)) max = Math.max(max, r.salesRatio);
    if (isNum(r.peRatio)) max = Math.max(max, r.peRatio);
  });
  return Math.min(3, Math.ceil(max * 4) / 4);
};

/* ------------------------------------------------------------------ */
/* Completitud                                                         */
/* ------------------------------------------------------------------ */

/** Estado de una celda kiosco x mes: complete | partial | empty, con lo que falta. */
export const completenessCell = (m) => {
  const hasSales = !!m?.hasSales;
  const hasCosts = !!m?.hasCosts;
  const hasGoal = !!m?.hasGoal;
  const missing = [];
  if (!hasSales) missing.push("ventas");
  if (!hasCosts) missing.push("costos");
  if (!hasGoal) missing.push("meta");
  const status = missing.length === 0 ? "complete" : missing.length === 3 ? "empty" : "partial";
  return { status, hasSales, hasCosts, hasGoal, missing };
};

/** Matriz de completitud para la tabla; filtra por siteIds si se indican. */
export const buildCompletenessRows = (data, siteIds) => {
  const wanted = new Set((siteIds || []).map(Number));
  return (data?.sites || [])
    .filter((s) => !wanted.size || wanted.has(Number(s.siteId)))
    .map((s) => {
      const byMonth = {};
      (s.months || []).forEach((m) => {
        byMonth[m.month] = completenessCell(m);
      });
      const cells = Array.from({ length: 12 }, (_, i) => byMonth[i + 1] || completenessCell(null));
      return {
        siteId: s.siteId,
        name: s.name,
        cells,
        gaps: cells.filter((c) => c.status === "partial").length,
      };
    });
};

/** Normaliza la lista de ids seleccionados a números únicos. */
export const normalizeSiteIds = (ids) => [...new Set((ids || []).map(Number).filter(Number.isFinite))];

/* ------------------------------------------------------------------ */
/* Filtro por supervisora (módulo "Supervisoras y kioscos")            */
/* ------------------------------------------------------------------ */

export const UNASSIGNED_SUPERVISOR = "none";

/**
 * Opciones del selector de supervisoras desde GET /supervisors: una por supervisora con kioscos visibles y, si
 * existen, "Sin supervisora" (kioscos con POS que nadie tiene asignados).
 */
export const buildSupervisorOptions = (data) => {
  const options = ((data && data.supervisors) || [])
    .filter((s) => Array.isArray(s.siteIds) && s.siteIds.length > 0)
    .map((s) => ({ value: s.userId, label: `${s.name} (${s.siteIds.length})`, siteIds: s.siteIds }));
  const unassigned = (data && data.unassignedSiteIds) || [];
  if (unassigned.length > 0) {
    options.push({ value: UNASSIGNED_SUPERVISOR, label: `Sin supervisora (${unassigned.length})`, siteIds: unassigned });
  }
  return options;
};

/**
 * Supervisoras que se muestran marcadas: las que tienen TODOS sus kioscos dentro de la selección de kioscos.
 * Selección vacía = todos los kioscos = ninguna marcada (así no hay un segundo estado que desincronizar).
 */
export const selectedSupervisorOptions = (options, siteIds) =>
  siteIds && siteIds.length ? options.filter((o) => o.siteIds.every((id) => siteIds.includes(id))) : [];

/**
 * Nueva selección de kioscos al marcar/desmarcar supervisoras: se agregan los kioscos de las marcadas y se quitan los
 * de las desmarcadas (salvo los que sigan pertenciendo a una marcada). Si no queda ninguno, queda vacío = todos.
 */
export const applySupervisorSelection = (siteIds, previous, next) => {
  const nextValues = new Set(next.map((o) => o.value));
  const ids = new Set(normalizeSiteIds(siteIds));
  previous.filter((o) => !nextValues.has(o.value)).forEach((o) => o.siteIds.forEach((id) => ids.delete(id)));
  next.forEach((o) => o.siteIds.forEach((id) => ids.add(id)));
  return normalizeSiteIds([...ids]).sort((a, b) => a - b);
};

/* ------------------------------------------------------------------ */
/* Texto del modo de comparación                                       */
/* ------------------------------------------------------------------ */

const monthName = (m) => (MONTHS_ES[m - 1] || "").toLowerCase();

/**
 * Frase que explica, con las fechas reales, qué se está comparando en el Resumen.
 * today: "yyyy-mm-dd" (hora de Guatemala).
 */
export const describeComparison = ({ year, baseYear, fromMonth, toMonth, mode, today }) => {
  const cy = Number(String(today).slice(0, 4));
  const cm = Number(String(today).slice(5, 7));
  const cd = Number(String(today).slice(8, 10));
  const inProgress = year === cy && toMonth >= cm;
  if (mode === "SAME_PERIOD") {
    const end = inProgress ? `hoy (${cd} de ${monthName(cm)})` : `el fin de ${monthName(toMonth)}`;
    return (
      `Mismos días en ambos años: del 1 de ${monthName(fromMonth)} hasta ${end} de ${year}, contra esas mismas fechas de ` +
      `${baseYear}. Un kiosco que arrancó en el POS después empieza en su primera venta.`
    );
  }
  const range = fromMonth === toMonth ? monthName(fromMonth) : `${monthName(fromMonth)} a ${monthName(toMonth)}`;
  return (
    `Meses completos de ${range}: ${year} contra ${baseYear}.` +
    (inProgress ? ` ${MONTHS_ES[cm - 1]} ${year} aún no termina, por eso se ve más bajo que ${baseYear}.` : "")
  );
};
