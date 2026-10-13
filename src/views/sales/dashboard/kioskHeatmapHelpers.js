/**
 * Helpers puros (sin React ni DOM) del 'Mapa de calor de kioscos' de la pestaña Kioskos del Dashboard de ventas.
 * Contrato: docs/SALES-DASHBOARD-CONTRACT.md, 'Addendum 3'. Dinero en Q con 2 decimales. `growthPercent` y
 * `sharePercent` del backend vienen en PORCENTAJE (12.4 = +12.4 %); aquí las variaciones pasan a decimal (0.124), que es lo
 * que esperan fmtDeltaPct y DeltaChip. `category` = kiosk_site.sales_category: 'A' | 'B' | 'C' | null (sin clasificar).
 *
 * Reglas de sombreado (mismos umbrales HEAT_THRESHOLDS que la matriz de ventas diarias de Finanzas kioscos):
 *  - Kiosco × día: cada celda contra la MEDIANA de los días con venta de ese mismo kiosco. Un día sin venta se muestra
 *    como 0.00 y no se sombrea.
 *  - Kiosco × día de la semana: cada celda es el PROMEDIO por ocurrencia de ese día en el rango (los días sin venta
 *    cuentan como 0) y se sombrea contra el promedio de su fila (la media de sus siete celdas). El mejor día de cada fila
 *    lleva ★ (solo si destaca: una fila pareja no marca ninguno).
 *  - Las filas de totales (todos los kioscos mostrados) se sombrean contra su propia mediana / promedio.
 */
import { fmtDeltaPct, fmtMoney, fmtNumber, fmtPct, isNum } from "utils/financeFormat";
import { heatBucket, median } from "views/kiosks/finance/reports/financeReportHelpers";
import {
  WEEKDAYS,
  aggregateWeekdays,
  buildWeekdayInsight,
  categoryLabel,
  isValidYmd,
  normalizeCategory,
  percentToDecimal,
  shareOf,
  weekdayIndex,
} from "./salesDashboardHelpers";

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** Máximo de días que admite el endpoint (el backend responde 400 si se excede). */
export const MAX_HEATMAP_DAYS = 400;
/** La matriz kiosco × día solo se dibuja hasta este número de días (dos meses): más columnas no se leen. */
export const MAX_DAY_MATRIX_DAYS = 62;
/** Días con venta que hacen falta para listar los días más fuertes. */
export const MIN_TOP_DAYS = 3;
/** Días del rango que hacen falta para hablar de un patrón por día de la semana (cada día se observa ~2 veces). */
export const MIN_PATTERN_DAYS = 14;
/** Hasta cuántos kioscos sin venta se nombran en el insight (si son más solo se cuentan). */
export const MAX_IDLE_NAMES = 3;

export const FILTER_ALL = "ALL";
export const FILTER_NONE = "NONE";

const CATEGORY_KEYS = ["A", "B", "C", FILTER_NONE];

/** Opciones del filtro por clasificación. Los textos son los de la pantalla; `id` es el valor interno. */
export const CATEGORY_FILTERS = [
  { id: FILTER_ALL, label: "Todas" },
  { id: "A", label: "A" },
  { id: "B", label: "B" },
  { id: "C", label: "C" },
  { id: FILTER_NONE, label: "Sin clasificar" },
];

/* ------------------------------------------------------------------ */
/* Números y clasificación                                              */
/* ------------------------------------------------------------------ */

/** Número finito o null (tolera números en texto: Jackson puede serializar un BigDecimal como '12.40'). */
const num = (value) => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

const amt = (value) => num(value) ?? 0;

const sum = (values) => values.reduce((acc, v) => acc + v, 0);

/** 'A' | 'B' | 'C' | 'NONE': clave de filtro y de agrupación de una clasificación. */
export const categoryKey = (category) => normalizeCategory(category) || FILTER_NONE;

/** Orden de las clasificaciones: A, B, C y al final los kioscos sin clasificar. */
export const categoryRank = (category) => CATEGORY_KEYS.indexOf(categoryKey(category));

/** Kioscos por clasificación (y el total) para habilitar solo los filtros que tienen kioscos. */
export const categoryCounts = (sites) => {
  const counts = { [FILTER_ALL]: 0, A: 0, B: 0, C: 0, [FILTER_NONE]: 0 };
  (sites || []).forEach((s) => {
    counts[FILTER_ALL] += 1;
    counts[categoryKey(s.category)] += 1;
  });
  return counts;
};

/** Kioscos de una clasificación ('ALL' = todos). Conserva el orden. */
export const filterSites = (sites, filterId) =>
  !filterId || filterId === FILTER_ALL ? sites || [] : (sites || []).filter((s) => categoryKey(s.category) === filterId);

/** Rótulo de la fila de totales según el filtro activo. */
export const totalRowLabel = (filterId) => {
  if (!filterId || filterId === FILTER_ALL) return "Todos los kioscos";
  return filterId === FILTER_NONE ? "Total sin clasificar" : `Total ${categoryLabel(filterId)}`;
};

/** Texto de la clasificación dentro de una frase: '(Cat. A)' o '(sin clasificar)'. */
const inlineCategory = (category) => (normalizeCategory(category) ? categoryLabel(category) : "sin clasificar");

/* ------------------------------------------------------------------ */
/* Modelo desde la respuesta del backend                                */
/* ------------------------------------------------------------------ */

/** Variación (decimal) contra el periodo anterior; null si ese periodo no vendió (no hay base comparable). */
const growthOf = (total, previousTotal, growthPercent) => {
  if (!(previousTotal > 0)) return null;
  const given = percentToDecimal(growthPercent);
  return given !== null ? given : (total - previousTotal) / previousTotal;
};

const compareSites = (a, b) =>
  categoryRank(a.category) - categoryRank(b.category) ||
  b.total - a.total ||
  a.name.localeCompare(b.name, "es", { sensitivity: "base" }) ||
  a.position - b.position;

/**
 * Respuesta de GET /sales/dashboard/kiosks/heatmap -> modelo listo para pintar:
 *  { startDate, endDate, previousStartDate, previousEndDate, days: [yyyy-MM-dd], sites: [...], categories: [...],
 *    networkDaily, networkTotal, networkPrevious }.
 * - `days` conserva solo fechas válidas y `daily` de cada sitio se alinea con ellas (se rellena con 0 o se recorta).
 * - `sites` se ordena A, B, C y sin clasificar; dentro de cada una por venta (mayor primero) y nombre.
 * - Cada sitio trae `growth` (decimal, null sin base comparable) y `daysWithSales` calculados sobre `daily`.
 * Devuelve null si la respuesta no es un objeto.
 */
export const buildHeatmapModel = (response) => {
  if (!response || typeof response !== "object") return null;
  const slots = [];
  (Array.isArray(response.days) ? response.days : []).forEach((raw, index) => {
    const date = String(raw ?? "").slice(0, 10);
    if (isValidYmd(date)) slots.push({ date, index });
  });
  const days = slots.map((slot) => slot.date);

  const sites = (Array.isArray(response.sites) ? response.sites : [])
    .filter((s) => s && typeof s === "object")
    .map((s, position) => {
      const raw = Array.isArray(s.daily) ? s.daily : [];
      const daily = slots.map((slot) => amt(raw[slot.index]));
      const total = num(s.total) ?? sum(daily);
      const previousTotal = amt(s.previousTotal);
      const hasId = s.siteId !== null && s.siteId !== undefined;
      return {
        key: hasId ? String(s.siteId) : `sitio-${position}`,
        siteId: hasId ? s.siteId : null,
        name: String(s.name ?? "").trim() || (hasId ? `Kiosco ${s.siteId}` : "Sin nombre"),
        category: normalizeCategory(s.category),
        locationId: s.locationId ?? null,
        source: s.source || "NONE",
        total,
        previousTotal,
        growth: growthOf(total, previousTotal, s.growthPercent),
        daysWithSales: daily.filter((v) => v > 0).length,
        daily,
        position,
      };
    })
    .sort(compareSites);

  const categories = (Array.isArray(response.categories) ? response.categories : [])
    .filter((c) => c && typeof c === "object")
    .map((c) => ({
      category: normalizeCategory(c.category),
      kioskCount: num(c.kioskCount),
      total: num(c.total),
      previousTotal: num(c.previousTotal),
      growthPercent: c.growthPercent,
      sharePercent: num(c.sharePercent),
    }));

  return {
    startDate: response.startDate || days[0] || "",
    endDate: response.endDate || days[days.length - 1] || "",
    previousStartDate: response.previousStartDate || "",
    previousEndDate: response.previousEndDate || "",
    days,
    sites,
    categories,
    networkDaily: days.map((_, i) => sum(sites.map((s) => s.daily[i]))),
    networkTotal: sum(sites.map((s) => s.total)),
    networkPrevious: sum(sites.map((s) => s.previousTotal)),
  };
};

/** true si no hay nada que comparar: sin días, sin sitios o ningún kiosco con venta en el periodo. */
export const isHeatmapEmpty = (model) =>
  !model || model.days.length === 0 || model.sites.length === 0 || !(model.networkTotal > 0);

/* ------------------------------------------------------------------ */
/* Sombreado                                                            */
/* ------------------------------------------------------------------ */

/** Monto de una celda: sin 'Q' (el título de la matriz ya dice que son quetzales) y siempre con dos decimales. */
export const fmtCellAmount = (value) => fmtNumber(value, 2);

/** Clase del sombreado de una celda: sin venta = sdash-hzero (sin sombrear); si no, sdash-h0…h5 según el bucket. */
export const heatClass = (amount, bucket) => {
  if (!(amount > 0)) return "sdash-hzero";
  return bucket === null || bucket === undefined ? "" : `sdash-h${bucket}`;
};

/* ------------------------------------------------------------------ */
/* Promedio por día de la semana                                        */
/* ------------------------------------------------------------------ */

/** Veces que cae cada día de la semana en la lista de fechas (lunes = 0 … domingo = 6). */
export const weekdayOccurrences = (dates) => {
  const counts = Array(7).fill(0);
  (dates || []).forEach((date) => {
    counts[weekdayIndex(date)] += 1;
  });
  return counts;
};

/**
 * Una fila de la matriz por día de la semana. `values` va alineada con `dates`. Cada celda trae el total del día de la
 * semana, cuántas veces cae en el rango (`occurrences`) y el promedio por ocurrencia (`avg`, contando los días sin venta
 * como 0; null si ese día no cae en el rango). `mean` = media de los promedios presentes; `ratio` y `bucket` comparan
 * cada promedio con esa media. `bestIndex` = día con mayor promedio, solo si supera la media (una fila pareja, o con un
 * solo día observado, no tiene mejor día: -1).
 */
export const buildWeekdayRow = (dates, values, occurrences) => {
  const totals = Array(7).fill(0);
  (dates || []).forEach((date, i) => {
    totals[weekdayIndex(date)] += amt(values[i]);
  });
  const cells = totals.map((total, index) => ({
    index,
    total,
    occurrences: occurrences[index],
    avg: occurrences[index] > 0 ? total / occurrences[index] : null,
  }));
  const present = cells.filter((c) => c.avg !== null);
  const mean = present.length ? sum(present.map((c) => c.avg)) / present.length : null;
  let best = -1;
  present.forEach((c) => {
    if (c.avg > 0 && (best < 0 || c.avg > cells[best].avg)) best = c.index;
  });
  const bestIndex = best >= 0 && mean !== null && cells[best].avg > mean * (1 + 1e-9) ? best : -1;
  return {
    mean,
    bestIndex,
    cells: cells.map((c) => ({
      ...c,
      ratio: c.avg !== null && mean > 0 ? c.avg / mean : null,
      bucket: heatBucket(c.avg, mean),
      isBest: c.index === bestIndex,
    })),
  };
};

/**
 * Matriz kiosco × día de la semana de los `sites` dados (los del filtro activo): una fila por kiosco y la fila de
 * totales (suma de los kioscos mostrados), todas con la forma de buildWeekdayRow más `total` (venta del periodo).
 */
export const buildWeekdayMatrix = (model, sites) => {
  const occurrences = weekdayOccurrences(model.days);
  const rows = (sites || []).map((site) => ({
    site,
    total: site.total,
    ...buildWeekdayRow(model.days, site.daily, occurrences),
  }));
  const shownDaily = model.days.map((_, i) => sum((sites || []).map((s) => s.daily[i])));
  return {
    occurrences,
    rows,
    footer: { total: sum((sites || []).map((s) => s.total)), ...buildWeekdayRow(model.days, shownDaily, occurrences) },
  };
};

/* ------------------------------------------------------------------ */
/* Kiosco × día                                                         */
/* ------------------------------------------------------------------ */

/** true si el modelo cabe en la matriz kiosco × día (hasta MAX_DAY_MATRIX_DAYS días). */
export const canShowDayMatrix = (model) =>
  Boolean(model) && model.days.length > 0 && model.days.length <= MAX_DAY_MATRIX_DAYS;

/**
 * Matriz kiosco × día de los `sites` dados: columnas = cada día del rango (con día, día de la semana y etiqueta; con
 * varios meses la etiqueta lleva el mes) y una fila por kiosco con su mediana de días con venta y las celdas
 * { date, amount, ratio, bucket }. `footer` = suma de los kioscos mostrados, sombreada contra su propia mediana.
 */
export const buildDayMatrix = (model, sites) => {
  const first = model.days[0] || "";
  const last = model.days[model.days.length - 1] || "";
  const multiMonth = first.slice(0, 7) !== last.slice(0, 7);
  const columns = model.days.map((date) => {
    const weekday = weekdayIndex(date);
    return {
      date,
      day: Number(date.slice(8, 10)),
      month: Number(date.slice(5, 7)),
      weekday,
      wd: WEEKDAYS[weekday].short,
      weekdayName: WEEKDAYS[weekday].name,
      label: multiMonth ? `${date.slice(8, 10)}/${date.slice(5, 7)}` : String(Number(date.slice(8, 10))),
    };
  });
  const line = (values) => {
    const med = median(values.filter((v) => v > 0));
    return {
      median: med,
      cells: values.map((amount, i) => ({
        date: model.days[i],
        amount,
        ratio: isNum(med) && med > 0 && amount > 0 ? amount / med : null,
        bucket: heatBucket(amount, med),
      })),
    };
  };
  const rows = (sites || []).map((site) => ({ site, total: site.total, ...line(site.daily) }));
  const shownDaily = model.days.map((_, i) => sum((sites || []).map((s) => s.daily[i])));
  return {
    columns,
    multiMonth,
    rows,
    footer: { total: sum((sites || []).map((s) => s.total)), ...line(shownDaily) },
  };
};

/* ------------------------------------------------------------------ */
/* Resumen por clasificación                                            */
/* ------------------------------------------------------------------ */

/** Día de la semana con mayor promedio de un conjunto de kioscos: { index, name, avg } o null si no destaca ninguno. */
const strongestWeekday = (model, sites, occurrences) => {
  const values = model.days.map((_, i) => sum(sites.map((s) => s.daily[i])));
  const row = buildWeekdayRow(model.days, values, occurrences);
  if (row.bestIndex < 0) return null;
  const cell = row.cells[row.bestIndex];
  return { index: cell.index, name: WEEKDAYS[cell.index].name, avg: cell.avg };
};

/**
 * Tabla 'Por clasificación': una fila por clasificación presente (A, B, C y sin clasificar, en ese orden) más la fila de
 * total. Kioscos, venta, venta anterior, variación y participación salen de `categories[]` del backend (si falta una
 * clasificación se calcula desde los sitios); el promedio por kiosco y el día fuerte se calculan aquí.
 * `share` y `growth` son decimales (growth null sin base comparable); `strongest` = día de la semana con mayor promedio.
 */
export const buildCategorySummary = (model) => {
  if (!model) return { rows: [], total: null };
  const occurrences = weekdayOccurrences(model.days);
  const rows = CATEGORY_KEYS.map((key) => {
    const sites = model.sites.filter((s) => categoryKey(s.category) === key);
    // Solo se confía en la fila del backend si dice que la clasificación tiene kioscos; si no, se calcula desde los sitios
    const given = model.categories.find((c) => categoryKey(c.category) === key && c.kioskCount > 0);
    if (!sites.length && !given) return null;
    const kioskCount = given ? given.kioskCount : sites.length;
    const total = given && given.total !== null ? given.total : sum(sites.map((s) => s.total));
    const previousTotal =
      given && given.previousTotal !== null ? given.previousTotal : sum(sites.map((s) => s.previousTotal));
    const share =
      given && given.sharePercent !== null ? percentToDecimal(given.sharePercent) : shareOf(total, model.networkTotal);
    return {
      key,
      category: key === FILTER_NONE ? null : key,
      label: key === FILTER_NONE ? categoryLabel(null) : categoryLabel(key),
      kioskCount,
      total,
      previousTotal,
      share,
      growth: growthOf(total, previousTotal, given ? given.growthPercent : undefined),
      avgPerKiosk: kioskCount > 0 ? total / kioskCount : 0,
      strongest: strongestWeekday(model, sites, occurrences),
    };
  }).filter(Boolean);
  return {
    rows,
    total: {
      kioskCount: model.sites.length,
      total: model.networkTotal,
      previousTotal: model.networkPrevious,
      share: model.networkTotal > 0 ? 1 : 0,
      growth: growthOf(model.networkTotal, model.networkPrevious),
      avgPerKiosk: model.sites.length > 0 ? model.networkTotal / model.sites.length : 0,
      strongest: strongestWeekday(model, model.sites, occurrences),
    },
  };
};

/* ------------------------------------------------------------------ */
/* Insights                                                             */
/* ------------------------------------------------------------------ */

const joinList = (items) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;

const moneyRound = (value) => fmtMoney(value, { decimals: 0 });

/** '18 (vie)'; con varios meses '18/09 (vie)'; con varios años '18/09/26 (vie)'. */
const fmtInsightDay = (ymd, { multiMonth, multiYear }) => {
  const wd = WEEKDAYS[weekdayIndex(ymd)].short;
  if (multiYear) return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(2, 4)} (${wd})`;
  if (multiMonth) return `${ymd.slice(8, 10)}/${ymd.slice(5, 7)} (${wd})`;
  return `${Number(ymd.slice(8, 10))} (${wd})`;
};

/**
 * Frases del panel de insights, en este orden (cada una se omite si no hay datos suficientes):
 *  1. topDays        Los días con más venta (≥ 3 días con venta).
 *  2. concentration  Qué días de la semana concentran la venta (≥ 14 días en el rango; misma frase que el calendario).
 *  3. leader         Kiosco líder y su peso en el total (≥ 2 kioscos con venta).
 *  4. categoryA      Peso de los kioscos Cat. A (hay A y no son todos los kioscos).
 *  5. growth         Mayor crecimiento contra el periodo anterior (≥ 2 kioscos comparables).
 *  6. decline        Mayor caída contra el periodo anterior (≥ 2 kioscos comparables).
 *  7. pattern        Mejor día de la semana más repetido (≥ 14 días, ≥ 3 kioscos con mejor día y la mitad coincide).
 *  8. idle           Kioscos sin venta en el periodo.
 * Cada insight = { id, tone: 'good' | 'neutral' | 'warn', text }. Nunca produce NaN ni Infinity: toda división se
 * protege con el total o el periodo anterior en cero.
 */
export const buildKioskInsights = (model) => {
  if (isHeatmapEmpty(model)) return [];
  const insights = [];
  const { days, sites, networkTotal } = model;
  const sellers = sites.filter((s) => s.total > 0);
  const multiMonth = days[0].slice(0, 7) !== days[days.length - 1].slice(0, 7);
  const multiYear = days[0].slice(0, 4) !== days[days.length - 1].slice(0, 4);

  // 1. Días con más venta de toda la red
  const withSales = days.map((date, i) => ({ date, amount: model.networkDaily[i] })).filter((d) => d.amount > 0);
  if (withSales.length >= MIN_TOP_DAYS) {
    const top = [...withSales]
      .sort((a, b) => b.amount - a.amount || a.date.localeCompare(b.date))
      .slice(0, MIN_TOP_DAYS)
      .map((d) => `${fmtInsightDay(d.date, { multiMonth, multiYear })} ${moneyRound(d.amount)}`);
    insights.push({ id: "topDays", tone: "neutral", text: `Los días con más venta fueron el ${joinList(top)}.` });
  }

  // 2. Concentración por día de la semana (misma regla y frase que el calendario)
  const weekdays = aggregateWeekdays(days.map((date, i) => ({ date, amount: model.networkDaily[i], count: 0 })));
  const concentration = buildWeekdayInsight(weekdays, "venta de kioscos");
  if (concentration) {
    insights.push({
      id: "concentration",
      tone: "neutral",
      text: `${concentration.lead}${concentration.rest}`.trim(),
    });
  }

  // 3. Kiosco líder
  if (sellers.length >= 2) {
    const leader = [...sellers].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"))[0];
    insights.push({
      id: "leader",
      tone: "good",
      text: `Kiosco líder: ${leader.name} (${inlineCategory(leader.category)}) con ${moneyRound(leader.total)} (${fmtPct(
        leader.total / networkTotal,
        1
      )} del total).`,
    });
  }

  // 4. Peso de la categoría A
  const categoryA = sites.filter((s) => s.category === "A");
  if (categoryA.length > 0 && categoryA.length < sites.length) {
    const share = sum(categoryA.map((s) => s.total)) / networkTotal;
    const counts = `${categoryA.length} de ${sites.length}`;
    insights.push({
      id: "categoryA",
      tone: "neutral",
      text:
        categoryA.length === 1
          ? `El kiosco Cat. A (${counts}) vende el ${fmtPct(share, 1)} del total.`
          : `Los kioscos Cat. A (${counts}) venden el ${fmtPct(share, 1)} del total.`,
    });
  }

  // 5 y 6. Quién crece y quién cae contra el periodo anterior (solo kioscos que vendieron en ese periodo)
  const comparable = sites.filter((s) => s.growth !== null);
  if (comparable.length >= 2) {
    const against = (s) =>
      `${s.name} ${fmtDeltaPct(s.growth, 1)} vs periodo anterior (de ${moneyRound(s.previousTotal)} a ${moneyRound(s.total)})`;
    const grew = comparable
      .filter((s) => s.growth > 0)
      .sort((a, b) => b.growth - a.growth || b.total - a.total)[0];
    const fell = comparable
      .filter((s) => s.growth < 0)
      .sort((a, b) => a.growth - b.growth || b.previousTotal - a.previousTotal)[0];
    if (grew) insights.push({ id: "growth", tone: "good", text: `Mayor crecimiento: ${against(grew)}.` });
    if (fell) insights.push({ id: "decline", tone: "warn", text: `Mayor caída: ${against(fell)}.` });
  }

  // 7. Mejor día de la semana que se repite entre los kioscos
  if (days.length >= MIN_PATTERN_DAYS) {
    const occurrences = weekdayOccurrences(days);
    const bestDays = sellers
      .map((s) => buildWeekdayRow(days, s.daily, occurrences).bestIndex)
      .filter((index) => index >= 0);
    if (bestDays.length >= 3) {
      const votes = Array(7).fill(0);
      bestDays.forEach((index) => {
        votes[index] += 1;
      });
      // ante un empate de votos gana el día de la semana que más vende en la red (y, si también empatan, el primero)
      const top = Math.max(...votes);
      const winner = votes
        .map((count, index) => (count === top ? index : -1))
        .filter((index) => index >= 0)
        .sort((a, b) => weekdays[b].avg - weekdays[a].avg || a - b)[0];
      if (votes[winner] >= 2 && votes[winner] / bestDays.length >= 0.5) {
        insights.push({
          id: "pattern",
          tone: "neutral",
          text: `Patrón común: en ${votes[winner]} de ${bestDays.length} kioscos el mejor día de la semana es el ${WEEKDAYS[
            winner
          ].name.toLowerCase()}.`,
        });
      }
    }
  }

  // 8. Kioscos sin venta en el periodo
  const idle = sites.filter((s) => s.total <= 0);
  if (idle.length > 0) {
    const names = idle.length <= MAX_IDLE_NAMES ? `: ${joinList(idle.map((s) => s.name))}` : "";
    insights.push({
      id: "idle",
      tone: "warn",
      text: `${idle.length} ${idle.length === 1 ? "kiosco sin venta" : "kioscos sin venta"} en el periodo${names}.`,
    });
  }

  return insights;
};
