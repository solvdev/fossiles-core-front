/**
 * Modelo puro de la grilla de costos: índices sobre GET /config, cambios pendientes,
 * completitud local y armado del payload de PUT /config/bulk. Sin React.
 */
import { fmtAmount } from "utils/financeFormat";
import { parseMoneyInput, parsePercentInput, moneyToEditText, pctToEditText } from "utils/financeInput";

export const GOAL_FIELD = "goal";

export const RATE_FIELDS = [
  { field: "productCostPct", label: "Costo del producto", short: "Costo prod." },
  { field: "salesCommissionPct", label: "Comisión de venta", short: "Com. venta" },
  { field: "cardCommissionPct", label: "Comisión de tarjeta", short: "Com. tarjeta" },
  { field: "taxPct", label: "IVA (carga)", short: "IVA" },
];

const COST_PREFIX = "cost:";
export const costField = (code) => `${COST_PREFIX}${code}`;
export const isCostField = (field) => typeof field === "string" && field.startsWith(COST_PREFIX);
export const costCode = (field) => field.slice(COST_PREFIX.length);
export const isRateField = (field) => RATE_FIELDS.some((r) => r.field === field);

export const fieldKind = (field) => (isRateField(field) ? "pct" : "money");

export const cellKey = (siteId, month, field) => `${siteId}|${month}|${field}`;

export const parseCellKey = (key) => {
  const [siteId, month, ...rest] = key.split("|");
  return { siteId: Number(siteId), month: Number(month), field: rest.join("|") };
};

/** Índice: siteId -> { siteId, name, status, months: { [month]: monthObj } }. */
export const indexConfig = (config) => {
  const map = new Map();
  ((config && config.sites) || []).forEach((site) => {
    const months = {};
    (site.months || []).forEach((m) => {
      months[m.month] = m;
    });
    map.set(site.siteId, { siteId: site.siteId, name: site.name, status: site.status, months });
  });
  return map;
};

export const serverValue = (index, siteId, month, field) => {
  const site = index.get(siteId);
  const m = site && site.months[month];
  if (!m) return null;
  if (isCostField(field)) {
    const v = m.costs ? m.costs[costCode(field)] : null;
    return v === undefined ? null : v;
  }
  const v = m[field];
  return v === undefined ? null : v;
};

export const effectiveValue = (index, pending, siteId, month, field) => {
  const key = cellKey(siteId, month, field);
  if (Object.prototype.hasOwnProperty.call(pending, key)) return pending[key];
  return serverValue(index, siteId, month, field);
};

const sameValue = (a, b) => {
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  return Math.abs(a - b) < 1e-9;
};

/** Devuelve un nuevo objeto pending con el valor aplicado (o quitado si coincide con el servidor). */
export const applyPending = (pending, index, ref, value) => {
  const key = cellKey(ref.siteId, ref.month, ref.field);
  const original = serverValue(index, ref.siteId, ref.month, ref.field);
  const next = { ...pending };
  if (sameValue(original, value)) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return next;
};

/** Suma de valores presentes (null si ninguno). */
export const sumPresent = (values) => {
  let total = 0;
  let any = false;
  values.forEach((v) => {
    if (v !== null && v !== undefined) {
      total += v;
      any = true;
    }
  });
  return any ? total : null;
};

export const avgPresent = (values) => {
  const present = values.filter((v) => v !== null && v !== undefined);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
};

export const fixedTotal = (index, pending, categories, siteId, month) =>
  sumPresent(categories.map((c) => effectiveValue(index, pending, siteId, month, costField(c.code))));

/** Misma regla que el contrato: meta + 4 tasas + 10 categorías con valor (0 cuenta). */
export const isMonthComplete = (index, pending, categories, siteId, month) => {
  const has = (field) => effectiveValue(index, pending, siteId, month, field) !== null;
  if (!has(GOAL_FIELD)) return false;
  if (!RATE_FIELDS.every((r) => has(r.field))) return false;
  return categories.every((c) => has(costField(c.code)));
};

/** true si el mes tiene al menos algún dato capturado. */
export const monthHasAnyData = (index, pending, categories, siteId, month) => {
  if (effectiveValue(index, pending, siteId, month, GOAL_FIELD) !== null) return true;
  if (RATE_FIELDS.some((r) => effectiveValue(index, pending, siteId, month, r.field) !== null)) return true;
  return categories.some((c) => effectiveValue(index, pending, siteId, month, costField(c.code)) !== null);
};

/** Formato de tasa para celda: 0.025 -> '2.5%', 0.18 -> '18%'. */
export const fmtPctCell = (decimal) => {
  if (decimal === null || decimal === undefined) return "";
  return `${parseFloat((decimal * 100).toFixed(2))}%`;
};

export const formatCellValue = (kind, value) => {
  if (value === null || value === undefined) return "";
  return kind === "pct" ? fmtPctCell(value) : fmtAmount(value, 2);
};

export const editTextFor = (kind, value) => (kind === "pct" ? pctToEditText(value) : moneyToEditText(value));

export const parseFor = (kind, text) => (kind === "pct" ? parsePercentInput(text) : parseMoneyInput(text));

/** pending -> [{ siteId, month, goal?, productCostPct?..., costs?: {CODE: n|null} }] para PUT /config/bulk. */
export const buildChanges = (pending) => {
  const byMonth = new Map();
  Object.entries(pending).forEach(([key, value]) => {
    const { siteId, month, field } = parseCellKey(key);
    const groupKey = `${siteId}|${month}`;
    if (!byMonth.has(groupKey)) byMonth.set(groupKey, { siteId, month });
    const change = byMonth.get(groupKey);
    if (isCostField(field)) {
      change.costs = change.costs || {};
      change.costs[costCode(field)] = value;
    } else {
      change[field] = value;
    }
  });
  return Array.from(byMonth.values()).sort((a, b) => a.siteId - b.siteId || a.month - b.month);
};

/** Resumen legible: [{ siteId, name, months: number[], cells }]. */
export const summarizePending = (pending, index) => {
  const bySite = new Map();
  Object.keys(pending).forEach((key) => {
    const { siteId, month } = parseCellKey(key);
    if (!bySite.has(siteId)) {
      const site = index.get(siteId);
      bySite.set(siteId, { siteId, name: site ? site.name : `Sitio ${siteId}`, months: new Set(), cells: 0 });
    }
    const entry = bySite.get(siteId);
    entry.months.add(month);
    entry.cells += 1;
  });
  return Array.from(bySite.values())
    .map((e) => ({ ...e, months: Array.from(e.months).sort((a, b) => a - b) }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
