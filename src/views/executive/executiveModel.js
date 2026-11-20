/**
 * Cálculos y textos del tablero gerencial a partir de la respuesta de GET /executive-dashboard.
 * Todo lo que aparece como cifra o alerta sale de los datos; aquí no hay números fijos.
 */
import { STAGES } from "utils/orderProgressReport";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export const fN = (n, d = 0) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const fQ = (n) => `${n < 0 ? "−Q" : "Q"}${fN(Math.abs(Math.round(n || 0)))}`;
export const fK = (n) => {
  const v = Math.abs(n || 0);
  const sign = n < 0 ? "−Q" : "Q";
  if (v >= 1000000) return `${sign}${fN(v / 1000000, 2)}M`;
  if (v >= 1000) return `${sign}${fN(v / 1000, 1)}k`;
  return `${sign}${fN(v)}`;
};
export const pct = (n, d = 0) => `${fN((n || 0) * 100, d)} %`;
export const monthName = (m) => MONTHS_LONG[(m || 1) - 1];

const parseYmd = (ymd) => {
  if (!ymd) return null;
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const fDate = (ymd, withYear = true) => {
  const d = ymd instanceof Date ? ymd : parseYmd(ymd);
  if (!d) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
};
export const addDays = (ymd, days) => {
  const d = parseYmd(ymd);
  if (!d) return null;
  d.setDate(d.getDate() + Math.round(days));
  return d;
};
export const daysBetween = (fromYmd, toYmd) => {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
};

const titleCase = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/(^|\s|\/|·|-)([a-záéíóúñ])/g, (m, p, c) => p + c.toUpperCase());

/** "CUEROGLAM MIRAFLORES II" → "Miraflores II". */
export const kioskName = (name) =>
  titleCase(String(name || "").replace(/^CUEROGLAM\s+/i, "")).replace(/\bIi\b/g, "II").replace(/\bIii\b/g, "III");
export const productName = (name) => titleCase(name);

export const TYPE_LABELS = {
  VENTA_EN_LINEA: "Venta en línea",
  CINCHOS_FOSSILES: "Cinchos Fossiles",
  CLIENTE_KIOSKO: "Cliente kiosko",
  NORMAL: "Normal",
  INTERNA: "Interna",
};
export const TYPE_COLORS = ["#2F64E0", "#7C9FEA", "#D9631E", "#F2A86F", "#8A94A8", "#4B5A75"];

export const BAND_LABELS = {
  UP_TO_90: ["Hasta 3 meses", "#2F64E0"],
  UP_TO_180: ["3 a 6 meses", "#7C9FEA"],
  UP_TO_365: ["6 a 12 meses", "#F2A86F"],
  OVER_365: ["Más de 1 año", "#D9631E"],
  NO_SALES: ["Sin venta en 90 días", "#8A94A8"],
};

export const weekLabel = (ymd) => fDate(ymd, false);

/* ---------------------------------------------------------------- Producción */

export function productionModel(data) {
  const p = data.production;
  const hoursPerPiece = p.pieces ? p.hours / p.pieces : 0;
  const onTime = p.tasks ? 1 - p.delayedTasks / p.tasks : 0;
  // Ritmo en horas estándar (mismas horas por pieza que «Horas que faltan»); si no hay, por piezas.
  const weeksToFinish =
    p.avgWeekStdHours > 0 ? p.backlogHoursLeft / p.avgWeekStdHours : p.avgWeekPieces > 0 ? p.backlogPending / p.avgWeekPieces : null;
  const finishDate = weeksToFinish != null ? addDays(data.to, weeksToFinish * 7) : null;
  const totalDeskPieces = p.desks.reduce((a, d) => a + d.pieces, 0) || 1;
  const maxDesk = Math.max(1, ...p.desks.map((d) => d.pieces));
  const desks = p.desks.map((d) => {
    const hp = d.hours ? d.hours / d.pieces : null;
    return {
      ...d,
      label: d.desk == null ? "Sin mesa" : `Mesa ${d.desk}`,
      share: d.pieces / totalDeskPieces,
      w: (d.pieces / maxDesk) * 100,
      hp,
      slow: hp != null && hoursPerPiece > 0 && hp > hoursPerPiece * 1.6,
    };
  });
  const slowDesk = desks.filter((d) => d.slow).sort((a, b) => b.hp - a.hp)[0] || null;
  const noHours = desks.filter((d) => d.hours == null && d.desk != null && d.pieces > 0);
  const maxHours = Math.max(1, ...p.productTime.map((r) => r.hours));
  const productTime = p.productTime.map((r) => ({ ...r, hp: r.pieces ? r.hours / r.pieces : 0, w: (r.hours / maxHours) * 100 }));
  const top3 = productTime.slice(0, 3);
  const top3Hours = top3.reduce((a, r) => a + r.hours, 0);
  const top3Pieces = top3.reduce((a, r) => a + r.pieces, 0);
  return {
    ...p,
    hoursPerPiece,
    onTime,
    weeksToFinish,
    finishDate,
    desks,
    slowDesk,
    noHours,
    productTime,
    top3,
    top3Hours,
    top3Pieces,
    top3HoursShare: p.hours ? top3Hours / p.hours : 0,
    top3PiecesShare: p.pieces ? top3Pieces / p.pieces : 0,
    daysSinceStart: p.startedOn ? daysBetween(p.startedOn, data.to) : null,
    workDays: Math.max(1, Math.round((data.days * 6) / 7)),
  };
}

/* ---------------------------------------------------------------- Órdenes */

/** Etapas y colores iguales a «Avance por orden» del Dashboard de Producción. */
export const ORDER_STAGES = STAGES;

const stageParts = (s) => {
  const units = Number(s?.units || 0);
  return STAGES.map((st) => ({ w: units ? (Number(s?.[st.key] || 0) / units) * 100 : 0, color: st.color }));
};

export function orderRow(o) {
  const s = o.stages || {};
  const units = Number(s.units || 0);
  const done = Math.min(Number(s.done || 0), units);
  return {
    ...o,
    customer: o.customer || "—",
    units,
    done,
    warehouse: Number(s.warehouse || 0),
    inProgress: Number(s.inProgress || 0),
    toStart: Number(s.pending || 0),
    noTask: Number(s.noTask || 0),
    progress: units ? done / units : 0,
    missing: Math.max(0, units - done),
    parts: stageParts(s),
  };
}

export function ordersModel(data) {
  const o = data.orders;
  const totalTypes = o.byType.reduce((a, t) => a + t.count, 0) || 1;
  const types = o.byType.map((t, i) => ({
    ...t,
    label: TYPE_LABELS[t.type] || t.type,
    color: TYPE_COLORS[i % TYPE_COLORS.length],
    w: (t.count / totalTypes) * 100,
  }));
  const rows = o.orders.map(orderRow);
  const notStarted = rows.filter((r) => r.done === 0 && r.inProgress === 0 && r.warehouse === 0);
  const b = data.production.backlog || {};
  return { ...o, types, rows, notStarted, totalParts: stageParts(b), backlog: b };
}

/* ---------------------------------------------------------------- Ventas */

export function salesModel(data) {
  const s = data.kioskSales;
  const delta = s.previousSales ? s.sales / s.previousSales - 1 : null;
  const kiosks = [...s.kiosks].sort((a, b) => b.sales - a.sales).map((k, i) => ({ ...k, rank: i + 1, label: kioskName(k.name) }));
  const maxSales = Math.max(1, ...kiosks.map((k) => k.sales));
  const active = kiosks.filter((k) => k.tickets > 0);
  const top = s.topProducts.map((t) => {
    const risk = t.kiosksWithout + t.kiosksLow;
    const coverDays = t.qty > 0 ? (t.kioskStock + t.warehouseStock) / (t.qty / data.days) : null;
    let action = ["Vigilar", "ok"];
    if (t.kiosksLow >= 5) action = t.warehouseStock >= risk * 2 ? ["Enviar desde bodega", "mid"] : ["Producir y enviar", "bad"];
    else if (risk >= 4) action = ["Reponer kioscos", "mid"];
    return { ...t, label: productName(t.name), risk, coverDays, action: action[0], tone: action[1] };
  });
  return {
    ...s,
    delta,
    kiosks: kiosks.map((k) => ({ ...k, w: (k.sales / maxSales) * 100 })),
    activeCount: active.length,
    ticketAvg: s.tickets ? s.sales / s.tickets : 0,
    top,
    lowStock: [...top].sort((a, b) => b.risk - a.risk || b.qty - a.qty),
  };
}

/* ---------------------------------------------------------------- Finanzas */

export function financeModel(data) {
  const f = data.finance;
  const factor = f.projectionFactor;
  const pnlByLocation = new Map((f.pnl || []).filter((r) => r.locationId != null).map((r) => [r.locationId, r]));
  const rows = f.goals
    .filter((g) => g.goal > 0 || g.monthGoal > 0 || g.sales > 0 || pnlByLocation.has(g.locationId))
    .map((g) => {
      const proj = factor ? g.sales * factor : null;
      return {
        ...g,
        label: kioskName(g.name),
        proj,
        // Con proyección: contra la meta del mes. Sin ella: lo vendido contra la meta prorrateada del rango.
        projPct: proj != null && g.monthGoal > 0 ? proj / g.monthGoal : null,
        rangePct: g.goal > 0 ? g.sales / g.goal : null,
        pnl: pnlByLocation.get(g.locationId) || null,
      };
    });
  const withGoal = rows.filter((r) => r.goal > 0);
  const goalTotal = withGoal.reduce((a, r) => a + r.goal, 0);
  const monthGoalTotal = rows.reduce((a, r) => a + (r.monthGoal || 0), 0);
  const salesWithGoal = withGoal.reduce((a, r) => a + r.sales, 0);
  const projTotal = factor ? rows.filter((r) => r.monthGoal > 0).reduce((a, r) => a + r.proj, 0) : null;
  const pnl = f.pnl || [];
  const losers = pnl.filter((r) => r.profit < 0).sort((a, b) => a.profit - b.profit);
  const profitTotal = pnl.reduce((a, r) => a + r.profit, 0);
  const score = (r) => (factor ? r.projPct : r.rangePct);
  const reach = withGoal.filter((r) => (score(r) || 0) >= 1).length;
  const best = [...withGoal].sort((a, b) => (score(b) || 0) - (score(a) || 0))[0] || null;
  const yoy = f.lastYearSameRange > 0 ? f.sales / f.lastYearSameRange - 1 : null;
  const season = f.lastYearMonth > 0 && f.lastYearNextMonth > 0 ? f.lastYearNextMonth / f.lastYearMonth : null;
  const lastPnlSales = pnl.reduce((a, r) => a + r.sales, 0);
  return {
    ...f,
    rows,
    goalTotal,
    monthGoalTotal,
    salesWithGoal,
    projTotal,
    // Avance a la meta: proyectado al cierre si el rango es del mes; si no, lo vendido contra la meta del rango.
    goalPct: factor && monthGoalTotal > 0 ? projTotal / monthGoalTotal : goalTotal > 0 ? salesWithGoal / goalTotal : null,
    score,
    losers,
    profitTotal,
    reach,
    best,
    yoy,
    season,
    goalVsLastMonth: lastPnlSales > 0 && monthGoalTotal > 0 ? monthGoalTotal / lastPnlSales : null,
    hasPnl: pnl.length > 0,
    rangeLabel: `${fDate(f.from)} – ${fDate(f.to)}`,
  };
}

/* ---------------------------------------------------------------- Rentabilidad */

export function profitabilityModel(data, mode) {
  const pr = data.profitability;
  const days = data.days;
  const maxQ = Math.max(1, ...pr.producedVsSold.map((r) => Math.max(r.producedForKiosks, r.soldKiosks)));
  const pv = pr.producedVsSold.map((r) => {
    const stock = r.warehouseStock + r.kioskStock;
    const over = r.producedForKiosks >= 30 && r.producedForKiosks >= r.soldKiosks * 2;
    const under = r.soldKiosks >= 10 && r.producedForKiosks < r.soldKiosks * 0.5;
    return {
      ...r,
      label: productName(r.name),
      stock,
      coverMonths: r.soldKiosks > 0 ? stock / (r.soldKiosks / days) / 30 : null,
      kind: over ? "over" : under ? "under" : "ok",
      verdict: over ? "Se produce de más" : under ? "Falta producir" : "Parejo",
      tone: over ? "mid" : under ? "bad" : "ok",
      wP: (r.producedForKiosks / maxQ) * 100,
      wS: (r.soldKiosks / maxQ) * 100,
    };
  });
  const margins = pr.margins
    .map((m) => {
      const hours = mode === "std" ? m.standardHours : m.realHours;
      const net = m.price / 1.12;
      const cost = m.materialsCost + m.leatherCost;
      const margin = net - cost;
      return { ...m, label: productName(m.name), hours, cost, margin, perHour: hours > 0 ? margin / hours : null };
    })
    .filter((m) => m.perHour != null)
    .sort((a, b) => b.perHour - a.perHour);
  const maxPh = Math.max(1, ...margins.map((m) => m.perHour));
  margins.forEach((m, i) => {
    m.rank = i + 1;
    m.w = (m.perHour / maxPh) * 100;
    m.tone = i < 5 ? "fill" : i >= margins.length - 5 ? "fillo" : "fill2";
  });
  const bandTotal = pr.bands.reduce((a, b) => a + b.value, 0) || 1;
  const bands = pr.bands.map((b) => ({
    ...b,
    label: (BAND_LABELS[b.key] || [b.key])[0],
    color: (BAND_LABELS[b.key] || [null, "#8A94A8"])[1],
    share: b.value / bandTotal,
    w: (b.value / bandTotal) * 100,
  }));
  const slowShare = bands
    .filter((b) => ["UP_TO_365", "OVER_365", "NO_SALES"].includes(b.key))
    .reduce((a, b) => a + b.share, 0);
  const over365 = bands.find((b) => b.key === "OVER_365");
  return {
    pv,
    over: pv.filter((r) => r.kind === "over"),
    under: pv.filter((r) => r.kind === "under"),
    margins,
    bands,
    bandTotal,
    bandPieces: pr.bands.reduce((a, b) => a + b.pieces, 0),
    slowShare,
    over365,
    slow: pr.slowMovers.map((s) => ({ ...s, label: productName(s.name) })),
  };
}

/* ---------------------------------------------------------------- Cuero, cartera, publicidad */

export function leatherModel(data) {
  const rows = data.leather.map((l) => ({
    ...l,
    label: productName(l.material),
    missing: Math.max(0, l.needed - l.available),
    covered: l.needed > 0 ? Math.min(1, l.available / l.needed) : 1,
  }));
  const short = rows.filter((r) => r.missing > 0);
  return { rows, short, missing: short.reduce((a, r) => a + r.missing, 0) };
}

export function receivablesModel(data) {
  const r = data.receivables;
  const maxB = Math.max(1, ...r.top.map((d) => d.balance));
  const top = r.top.map((d) => {
    const daysSince = d.lastPayment ? daysBetween(d.lastPayment, data.to) : null;
    return { ...d, label: titleCase(d.name), w: (d.balance / maxB) * 100, daysSince, late: daysSince == null || daysSince > 60 };
  });
  return { ...r, top };
}

export function adsModel(data) {
  return data.ads.map((a, i) => {
    const ratio = a.adSpend > 0 ? a.onlineSales / a.adSpend : null;
    const current = i === data.ads.length - 1;
    return {
      ...a,
      label: `${monthName(a.month)[0].toUpperCase()}${monthName(a.month).slice(1)}${current ? " (en curso)" : ""}`,
      ratio,
      tone: ratio == null ? "ok" : ratio >= 3 ? "ok" : ratio >= 2 ? "mid" : "bad",
    };
  });
}

/* ---------------------------------------------------------------- Alertas */

const row = (c0, c1, c2, c3, bad = false) => ({ c0, c1, c2, c3, bad });

/**
 * «Qué atender»: cada alerta solo aparece si los datos la justifican. Orden = impacto aproximado.
 * `page` = página a la que lleva «Ver …»; `goState` = filtros que se aplican al llegar.
 */
export function buildAlerts(m) {
  const { prod, orders, sales, fin, rent, leather, recv, ads, data } = m;
  const out = [];

  // Orden más grande por horas que faltan; el ritmo es en horas estándar por semana (o piezas si no hay horas).
  const big = [...orders.rows].filter((o) => o.missing > 0).sort((a, b) => b.hoursLeft - a.hoursLeft || b.missing - a.missing)[0];
  const byHours = prod.avgWeekStdHours > 0;
  const rate = byHours ? prod.avgWeekStdHours : prod.avgWeekPieces;
  const need = big ? (byHours ? big.hoursLeft : big.missing) : 0;
  if (big && rate > 0 && need >= rate * 2) {
    const weeks = need / rate;
    const unit = byHours ? "h" : "piezas";
    out.push({
      id: "big-order",
      tag: "Producción",
      tone: "prod",
      title: `${big.code}${big.customer && big.customer !== "—" ? ` (${big.customer})` : ""}: faltan ${fN(big.missing)} piezas · ${fN(big.hoursLeft, 1)} h (${pct(big.missing / big.units)})`,
      detail: `Al ritmo de ${fN(rate)} ${unit} por semana, con toda la planta en esa orden, termina en ${fN(weeks, 1)} semanas (≈ ${fDate(addDays(data.to, weeks * 7))}).`,
      action: "Decidir maquila, horas extra o bajar la cantidad.",
      dTitle: "Cuándo termina según cuánta planta se le dedica",
      head: ["Planta dedicada", byHours ? "Horas/semana" : "Piezas/semana", "Semanas", "Termina ≈"],
      rows: [1, 0.75, 0.5].map((f) =>
        row(pct(f), fN(rate * f), fN(need / (rate * f), 1), fDate(addDays(data.to, (need / (rate * f)) * 7)), f < 1)
      ),
      note: `Pedidas ${fN(big.units)} · terminadas ${fN(big.done)} · en bodega/QA ${fN(big.warehouse)} · en mesa ${fN(big.inProgress)} · por iniciar ${fN(big.toStart)} · sin tarea ${fN(big.noTask)}. Las demás órdenes usan la misma planta.`,
      page: "ordenes",
      goLabel: "Ver avance de órdenes",
    });
  }

  if (rent.over.length || rent.under.length) {
    const over = [...rent.over].sort((a, b) => b.producedForKiosks - a.producedForKiosks).slice(0, 3);
    const under = [...rent.under].sort((a, b) => b.soldKiosks - a.soldKiosks).slice(0, 3);
    const parts = [];
    if (over.length) parts.push(`Para kioscos se hicieron ${over.map((r) => `${fN(r.producedForKiosks)} ${r.code}`).join(", ")}, que venden ${over.map((r) => fN(r.soldKiosks)).join(", ")}.`);
    if (under.length) parts.push(`${under.map((r) => r.code).join(", ")}, de los más vendidos, casi no tuvieron producción para kioscos.`);
    out.push({
      id: "pv",
      tag: "Producción",
      tone: "prod",
      title: "Se produce para kioscos lo que no se vende",
      detail: parts.join(" "),
      action: "Armar las próximas OPK con lo que se vende.",
      dTitle: `Producido para kioscos contra vendido (${data.days} días)`,
      head: ["Producto", "Hecho kiosco", "Vendido", "Lectura"],
      rows: [...over, ...under].map((r) => row(`${r.code} ${r.label}`, fN(r.producedForKiosks), fN(r.soldKiosks), r.verdict, r.kind === "under")),
      note: fin.season && fin.season > 1.3
        ? `Parte de lo que sobra puede ser para la temporada: el año pasado ${monthName(fin.month === 12 ? 1 : fin.month + 1)} vendió ${fN(fin.season, 1)} veces lo de ${monthName(fin.month)}.`
        : "Lo producido para clientes (OPV, OPC) no se cuenta: ya está vendido.",
      page: "rentabilidad",
      goLabel: "Ver producido contra vendido",
    });
  }

  if (leather.missing > 0) {
    out.push({
      id: "leather",
      tag: "Compras",
      tone: "inv",
      title: `Faltan ${fN(leather.missing)} pies² de cuero para lo que está pedido`,
      detail: `${leather.short.slice(0, 4).map((r) => `${r.label} (${pct(r.covered)} cubierto)`).join(", ")}.`,
      action: "Definir la compra de cuero o qué parte de las órdenes se pospone.",
      dTitle: "Cuero para órdenes abiertas (pies²)",
      head: ["Cuero", "Se necesita", "Hay", "Falta"],
      rows: leather.short.slice(0, 5).map((r) => row(r.label, fN(r.needed), fN(r.available), fN(r.missing), true)),
      note: "Calculado con la receta de cuero por color y las piezas que aún no empiezan.",
      page: "produccion",
      goLabel: "Ver cuero en Producción",
    });
  }

  const low = sales.lowStock.filter((t) => t.kiosksLow >= 5);
  if (low.length) {
    out.push({
      id: "low-stock",
      tag: "Inventario",
      tone: "inv",
      title: `${low.slice(0, 2).map((t) => `${t.code} ${t.label}`).join(" y ")} ${low.length === 1 ? "se está acabando" : "se están acabando"} en kioscos`,
      detail: low.slice(0, 3).map((t) => `${t.code}: ${t.kiosksLow} kioscos con 1–2 u, ${fN(t.warehouseStock)} en bodega`).join(" · "),
      action: low.map((t) => `${t.code}: ${t.action.toLowerCase()}`).slice(0, 3).join(" · "),
      dTitle: "Más vendidos con kioscos en riesgo",
      head: ["Producto", "Bodega PT", "Sin stock", "Con 1–2 u"],
      rows: sales.lowStock.slice(0, 5).map((t) => row(`${t.code} ${t.label}`, fN(t.warehouseStock), String(t.kiosksWithout), String(t.kiosksLow), t.kiosksLow >= 5)),
      note: "«Sin stock» incluye kioscos que abrieron hace poco.",
      page: "ventas",
      goLabel: "Ver inventario bajo",
    });
  }

  const adLast = ads.filter((a) => a.ratio != null).slice(-1)[0];
  if (adLast && adLast.ratio < 2) {
    out.push({
      id: "ads",
      tag: "Ventas",
      tone: "ven",
      title: `La publicidad devuelve Q${fN(adLast.ratio, 2)} por cada Q1 en ${monthName(adLast.month)}`,
      detail: `Se invirtieron ${fQ(adLast.adSpend)} y las ventas en línea fueron ${fQ(adLast.onlineSales)}.`,
      action: "Medir por campaña y cortar las que no traen ventas.",
      dTitle: "Publicidad contra ventas en línea",
      head: ["Mes", "Publicidad", "Ventas", "Por Q1"],
      rows: ads.map((a) => row(a.label, fQ(a.adSpend), fQ(a.onlineSales), a.ratio == null ? "—" : `Q${fN(a.ratio, 2)}`, a.ratio != null && a.ratio < 2)),
      note: "Por debajo de Q2 por cada Q1, después de producto, envío y comisiones casi no queda ganancia.",
      page: "finanzas",
      goLabel: "Ver publicidad",
    });
  }

  if (fin.losers.length) {
    out.push({
      id: "losses",
      tag: "Finanzas",
      tone: "fin",
      title: `${fin.losers.length === 1 ? "1 kiosco no cubrió" : `${fin.losers.length} kioscos no cubrieron`} sus costos en ${monthName(fin.pnlMonth)}`,
      detail: `Pérdida conjunta de ${fQ(fin.losers.reduce((a, r) => a + r.profit, 0))}. Los más bajos: ${fin.losers.slice(0, 3).map((r) => kioskName(r.name)).join(", ")}.`,
      action: "Revisar renta y personal, o un plan de ventas por kiosco.",
      dTitle: `Kioscos con pérdida en ${monthName(fin.pnlMonth)} (P&L de Finanzas)`,
      head: ["Kiosco", "Venta", "Equilibrio", "Utilidad"],
      rows: fin.losers.slice(0, 6).map((r) => row(kioskName(r.name), fK(r.sales), fK(r.breakEven), fK(r.profit), true)),
      note: "Equilibrio = lo que tendría que vender al mes para cubrir todos sus costos.",
      page: "finanzas",
      goLabel: "Ver finanzas por kiosco",
    });
  }

  if (prod.top3.length === 3 && prod.top3HoursShare >= 0.2 && prod.top3HoursShare >= prod.top3PiecesShare * 2.5) {
    out.push({
      id: "hours",
      tag: "Costos",
      tone: "prod",
      title: `${prod.top3.map((r) => r.code).join(", ")} se llevan ${fN(prod.top3Hours)} horas por ${fN(prod.top3Pieces)} piezas`,
      detail: `Son el ${pct(prod.top3HoursShare)} de las horas de producción con el ${pct(prod.top3PiecesShare)} de las piezas.`,
      action: "Revisar si su precio cubre ese tiempo, simplificar el modelo o mandarlo a maquila.",
      dTitle: `Productos que más tiempo consumen (${data.days} días)`,
      head: ["Producto", "Piezas", "Horas", "h/pieza"],
      rows: prod.productTime.slice(0, 5).map((r) => row(r.code, fN(r.pieces), fN(r.hours), fN(r.hp, 1), r.hp > prod.hoursPerPiece * 2)),
      note: `Promedio de la planta: ${fN(prod.hoursPerPiece, 1)} h por pieza. El tiempo se mide de inicio a fin de la tarea.`,
      page: "produccion",
      goLabel: "Ver dónde se va el tiempo",
    });
  }

  // Kioscos casi sin venta en el rango de Finanzas (días cerrados), contra su meta prorrateada.
  const dead = fin.days >= 10 ? fin.rows.filter((r) => r.goal > 0 && r.rangePct < 0.1).sort((a, b) => a.rangePct - b.rangePct) : [];
  if (dead.length) {
    const k = dead[0];
    const s = sales.kiosks.find((x) => x.locationId === k.locationId);
    out.push({
      id: "dead-kiosk",
      tag: "Ventas",
      tone: "ven",
      title: `${k.label} lleva ${fQ(k.sales)} del ${fDate(fin.from, false)} al ${fDate(fin.to, false)}`,
      detail: `Su meta para esos días es ${fQ(k.goal)} (${pct(k.rangePct)}).${s ? ` En ${data.days} días hizo ${fN(s.tickets)} ventas.` : ""}`,
      action: "Confirmar si estuvo cerrado o si hay ventas sin registrar.",
      dTitle: "Kioscos con menos del 10 % de su meta",
      head: ["Kiosco", "Vendido", "Meta del rango", "Avance"],
      rows: dead.slice(0, 5).map((r) => row(r.label, fQ(r.sales), fQ(r.goal), pct(r.rangePct), true)),
      note: "Un cambio tan brusco suele ser cierre, falta de personal o ventas sin registrar.",
      page: "ventas",
      goLabel: "Ver este kiosco",
      goState: { kiosk: k.locationId },
    });
  }

  const lateDebt = recv.top.filter((d) => d.late && d.balance > 5000);
  if (lateDebt.length) {
    out.push({
      id: "debt",
      tag: "Finanzas",
      tone: "fin",
      title: `${lateDebt.length === 1 ? "1 cliente debe" : `${lateDebt.length} clientes deben`} ${fQ(lateDebt.reduce((a, d) => a + d.balance, 0))} sin pagar en más de 2 meses`,
      detail: lateDebt.slice(0, 3).map((d) => `${d.label} (${fQ(d.balance)})`).join(", "),
      action: "Llamar para cobrar o frenar nuevos pedidos a crédito.",
      dTitle: "Clientes que más deben",
      head: ["Cliente", "Debe", "Último pago", "Días"],
      rows: recv.top.slice(0, 6).map((d) => row(d.label, fQ(d.balance), d.lastPayment ? fDate(d.lastPayment) : "sin pagos", d.daysSince == null ? "—" : fN(d.daysSince), d.late)),
      note: recv.creditDaysConfigured ? "" : "Ningún cliente tiene días de crédito configurados: con eso se puede separar lo vencido de lo que aún no toca cobrar.",
      page: "finanzas",
      goLabel: "Ver cartera",
    });
  }

  // Lo necesario, no todo: como máximo 8 puntos.
  return out.slice(0, 8);
}

export function buildModel(data, { marginMode = "real" } = {}) {
  const prod = productionModel(data);
  const orders = ordersModel(data);
  const sales = salesModel(data);
  const fin = financeModel(data);
  const rent = profitabilityModel(data, marginMode);
  const leather = leatherModel(data);
  const recv = receivablesModel(data);
  const ads = adsModel(data);
  const m = { data, prod, orders, sales, fin, rent, leather, recv, ads };
  return { ...m, alerts: buildAlerts(m) };
}
