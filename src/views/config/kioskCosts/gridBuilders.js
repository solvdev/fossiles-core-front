/**
 * Construye los modelos de grilla ("Por kiosco" y "Por mes") consumidos por CostGrid.
 * Cada modelo expone rows, cols y cellAt(r, c) -> descriptor de celda | null (fila de sección).
 */
import {
  GOAL_FIELD,
  RATE_FIELDS,
  SALES_COMMISSION_RATE,
  isFixedRateField,
  goalSourceOf,
  isGoalExternal,
  costField,
  cellKey,
  effectiveValue,
  fieldKind,
  fixedTotal,
  isMonthComplete,
  monthHasAnyData,
  sumPresent,
  avgPresent,
} from "./costsModel";

const MONTH_COUNT = 12;

const hasPending = (pending, ref) =>
  Object.prototype.hasOwnProperty.call(pending, cellKey(ref.siteId, ref.month, ref.field));

/** Filas = categorías + total fijos + meta + 4 tasas; columnas = Ene..Dic + Total/Prom. */
export const buildSiteGrid = ({ index, pending, categories, siteId }) => {
  const rows = [
    { id: "sec-fixed", type: "section", label: "Costos fijos" },
    ...categories.map((c) => ({
      id: costField(c.code),
      type: "row",
      label: c.name,
      kind: "money",
      field: costField(c.code),
    })),
    { id: "fixed-total", type: "calc", label: "Total costos fijos", kind: "money", calc: "fixedTotal" },
    { id: "sec-goal", type: "section", label: "Meta y tasas variables" },
    { id: GOAL_FIELD, type: "row", label: "Meta de ventas", kind: "money", field: GOAL_FIELD },
    ...RATE_FIELDS.map((r) => ({ id: r.field, type: "row", label: r.label, kind: "pct", field: r.field })),
  ];

  const cols = [];
  for (let m = 1; m <= MONTH_COUNT; m += 1) {
    cols.push({
      id: `m${m}`,
      month: m,
      complete: isMonthComplete(index, pending, categories, siteId, m),
      hasData: monthHasAnyData(index, pending, categories, siteId, m),
    });
  }
  cols.push({ id: "total", total: true, label: "Total / Prom." });

  const monthValue = (row, m) => {
    if (row.calc === "fixedTotal") return fixedTotal(index, pending, categories, siteId, m);
    return effectiveValue(index, pending, siteId, m, row.field);
  };

  const cellAt = (r, c) => {
    const row = rows[r];
    const col = cols[c];
    if (!row || row.type === "section") return null;
    if (col.total) {
      const values = [];
      for (let m = 1; m <= MONTH_COUNT; m += 1) values.push(monthValue(row, m));
      return {
        kind: row.kind,
        calc: true,
        value: row.kind === "pct" ? avgPresent(values) : sumPresent(values),
      };
    }
    if (row.type === "calc") {
      return { kind: row.kind, calc: true, value: monthValue(row, col.month) };
    }
    if (isFixedRateField(row.field)) {
      return { kind: row.kind, calc: true, fixedRate: true, value: SALES_COMMISSION_RATE };
    }
    if (row.field === GOAL_FIELD && isGoalExternal(index, siteId)) {
      return {
        kind: row.kind,
        calc: true,
        goalExternal: true,
        goalSource: goalSourceOf(index, siteId, col.month),
        value: effectiveValue(index, pending, siteId, col.month, row.field),
      };
    }
    const ref = { siteId, month: col.month, field: row.field };
    return {
      ref,
      kind: row.kind,
      value: effectiveValue(index, pending, siteId, col.month, row.field),
      dirty: hasPending(pending, ref),
    };
  };

  return { mode: "site", rows, cols, cellAt, rowCount: rows.length, colCount: cols.length };
};

/** Filas = kioscos (+ total); columnas = categorías + total fijos + meta + tasas para un mes. */
export const buildMonthGrid = ({ index, pending, categories, siteList, month }) => {
  const rows = siteList.map((s) => ({
    id: `site-${s.siteId}`,
    type: "row",
    siteId: s.siteId,
    label: s.name,
    status: s.status,
    complete: isMonthComplete(index, pending, categories, s.siteId, month),
    hasData: monthHasAnyData(index, pending, categories, s.siteId, month),
  }));
  rows.push({ id: "footer", type: "calc", label: "Total / Prom.", footer: true });

  const cols = [
    ...categories.map((c) => ({ id: costField(c.code), field: costField(c.code), label: c.name, kind: "money" })),
    { id: "fixed-total", calc: "fixedTotal", label: "Total costos fijos", kind: "money" },
    { id: GOAL_FIELD, field: GOAL_FIELD, label: "Meta de ventas", kind: "money" },
    ...RATE_FIELDS.map((r) => ({ id: r.field, field: r.field, label: r.label, kind: "pct" })),
  ];

  const siteValue = (row, col) => {
    if (col.calc === "fixedTotal") return fixedTotal(index, pending, categories, row.siteId, month);
    return effectiveValue(index, pending, row.siteId, month, col.field);
  };

  const cellAt = (r, c) => {
    const row = rows[r];
    const col = cols[c];
    if (!row || !col) return null;
    if (row.footer) {
      const values = rows.filter((x) => !x.footer).map((x) => siteValue(x, col));
      return { kind: col.kind, calc: true, value: col.kind === "pct" ? avgPresent(values) : sumPresent(values) };
    }
    if (col.calc) {
      return { kind: col.kind, calc: true, value: siteValue(row, col) };
    }
    if (isFixedRateField(col.field)) {
      return { kind: col.kind, calc: true, fixedRate: true, value: SALES_COMMISSION_RATE };
    }
    if (col.field === GOAL_FIELD && isGoalExternal(index, row.siteId)) {
      return {
        kind: col.kind,
        calc: true,
        goalExternal: true,
        goalSource: goalSourceOf(index, row.siteId, month),
        value: effectiveValue(index, pending, row.siteId, month, col.field),
      };
    }
    const ref = { siteId: row.siteId, month, field: col.field };
    return {
      ref,
      kind: fieldKind(col.field),
      value: effectiveValue(index, pending, row.siteId, month, col.field),
      dirty: hasPending(pending, ref),
    };
  };

  return { mode: "month", rows, cols, cellAt, rowCount: rows.length, colCount: cols.length, month };
};
