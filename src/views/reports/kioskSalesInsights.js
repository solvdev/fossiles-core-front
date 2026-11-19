/** Cálculos del reporte de ventas de kioscos por categoría: empaque aparte, comparación y lecturas. */

export const PACKAGING_CODE = "EMPAQUE";

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const isPackagingRow = (row) => row?.subgroupCode === PACKAGING_CODE;

/** Cantidad con hasta 3 decimales y sin ceros a la derecha (igual que NUMERIC(12,3) del servidor). */
export const formatQty = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(3)));
};

/**
 * Separa el empaque (bolsas y cajas SUM-) del producto. El empaque se cobra pero no es una pieza
 * vendida: sumarlo inflaba «Accesorios» con cientos de bolsas.
 */
export const splitPackaging = (rows) => {
  const productRows = [];
  const packaging = { units: 0, totalAmount: 0, totalAmountNoIva: 0, present: false };
  (rows || []).forEach((row) => {
    if (isPackagingRow(row)) {
      packaging.present = true;
      packaging.units += num(row.units);
      packaging.totalAmount += num(row.totalAmount);
      packaging.totalAmountNoIva += num(row.totalAmountNoIva);
    } else {
      productRows.push(row);
    }
  });
  return { productRows, packaging };
};

/** Variación porcentual; null si el periodo anterior no tiene base (0 o negativo). */
export const pctChange = (current, previous) => {
  const prev = num(previous);
  if (!(prev > 0)) return null;
  return ((num(current) - prev) / prev) * 100;
};

export const deltaTone = (pct) => {
  if (pct == null) return "none";
  if (pct > 0.05) return "up";
  if (pct < -0.05) return "down";
  return "flat";
};

export const formatDelta = (pct) => {
  if (pct == null) return "—";
  const tone = deltaTone(pct);
  const text = `${Math.abs(pct).toFixed(1)}%`;
  if (tone === "up") return `▲ ${text}`;
  if (tone === "down") return `▼ ${text}`;
  return "= 0%";
};

const categoryKeyOf = (row) => (row?.categoryId == null ? "null" : String(row.categoryId));

/** categoryKey → { units, totalAmount } del periodo anterior, sin empaque. */
export const previousByCategory = (previousReport) => {
  const map = new Map();
  splitPackaging(previousReport?.rows).productRows.forEach((row) => {
    const key = categoryKeyOf(row);
    const acc = map.get(key) || { units: 0, totalAmount: 0 };
    acc.units += num(row.units);
    acc.totalAmount += num(row.totalAmount);
    map.set(key, acc);
  });
  return map;
};

/** "categoryKey|subgroupCode" → { units, totalAmount } del periodo anterior. */
export const previousBySubgroup = (previousReport) => {
  const map = new Map();
  splitPackaging(previousReport?.rows).productRows.forEach((row) => {
    if (!row?.subgroupCode) return;
    map.set(`${categoryKeyOf(row)}|${row.subgroupCode}`, {
      units: num(row.units),
      totalAmount: num(row.totalAmount),
    });
  });
  return map;
};

const MIN_PREVIOUS_UNITS = 5;

/**
 * Lecturas para decidir: dónde está el dinero, qué sube más y qué cae más.
 * Solo compara categorías con una base mínima de piezas en el periodo anterior (evita «+300%» de 1 a 4).
 */
export const buildInsights = (groups, previousMap) => {
  const insights = [];
  const list = (groups || []).filter((group) => num(group.totalAmount) > 0);
  const total = list.reduce((acc, group) => acc + num(group.totalAmount), 0);
  if (total > 0 && list.length >= 2) {
    const top = [...list].sort((a, b) => num(b.totalAmount) - num(a.totalAmount)).slice(0, 2);
    const share = (top.reduce((acc, group) => acc + num(group.totalAmount), 0) / total) * 100;
    insights.push({
      kind: "concentration",
      title: "Concentración",
      text: `${top[0].label} y ${top[1].label} son el ${Math.round(share)}% de las ventas.`,
    });
  }
  if (previousMap && previousMap.size) {
    const moves = (groups || [])
      .map((group) => {
        const before = previousMap.get(group.key);
        if (!before || before.units < MIN_PREVIOUS_UNITS) return null;
        return {
          label: group.label,
          from: before.units,
          to: num(group.units),
          pct: pctChange(group.units, before.units),
        };
      })
      .filter((move) => move && move.pct != null);
    const rise = moves.filter((move) => move.pct > 0).sort((a, b) => b.pct - a.pct)[0];
    const fall = moves.filter((move) => move.pct < 0).sort((a, b) => a.pct - b.pct)[0];
    if (rise) {
      insights.push({
        kind: "rise",
        title: "Mayor alza",
        text: `${rise.label} pasó de ${formatQty(rise.from)} a ${formatQty(rise.to)} piezas (+${Math.round(rise.pct)}%).`,
      });
    }
    if (fall) {
      insights.push({
        kind: "fall",
        title: "Mayor caída",
        text: `${fall.label} bajó de ${formatQty(fall.from)} a ${formatQty(fall.to)} piezas (−${Math.round(
          Math.abs(fall.pct)
        )}%).`,
      });
    }
  }
  return insights;
};

/** Cuántos modelos (de mayor a menor) hacen falta para juntar `target` (0–1) de las piezas. */
export const modelsToReach = (sortedUnits, target = 0.5) => {
  const total = sortedUnits.reduce((acc, value) => acc + Math.max(0, num(value)), 0);
  if (total <= 0) return { count: 0, share: 0 };
  let acc = 0;
  for (let i = 0; i < sortedUnits.length; i += 1) {
    acc += Math.max(0, num(sortedUnits[i]));
    if (acc / total >= target) return { count: i + 1, share: (acc / total) * 100 };
  }
  return { count: sortedUnits.length, share: 100 };
};
