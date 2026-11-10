import {
  isCinchoOrderType,
  isMesaCinchosLineProduct,
  orderHasNonCinchoLineItem,
} from "./cinchoProductionHelper";

export const CINCHO_WORK_STATUS = {
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
};

const VENTA_EN_LINEA = "VENTA_EN_LINEA";
const CLIENTE_KIOSKO = "CLIENTE_KIOSKO";

function normalizeYmd(dateStr) {
  if (!dateStr) return "";
  return String(dateStr).slice(0, 10);
}

/**
 * Un solo día por OP en el cuadro de cinchos: evita que la misma OPL/OPCK salga en ayer, hoy y mañana
 * cuando inicio y entrega son distintos. Preferimos fecha de inicio (cuándo entra a planta);
 * si no hay inicio, usamos entrega.
 */
export function orderWorkAnchorYmd(order) {
  const start = normalizeYmd(order?.startDate);
  const delivery = normalizeYmd(order?.deliveryDate);
  return start || delivery || "";
}

/** La OP entra en el bloque del cronograma solo si ese día coincide con su fecha ancla. */
export function orderMatchesWorkDate(order, workDateYmd) {
  const d = normalizeYmd(workDateYmd);
  if (!d) return false;
  const anchor = orderWorkAnchorYmd(order);
  return Boolean(anchor) && anchor === d;
}

export function itemTotalQty(item) {
  if (!item) return 0;
  if (item.sizes && typeof item.sizes === "object") {
    return Object.values(item.sizes).reduce((sum, q) => sum + (Number(q) || 0), 0);
  }
  return Number(item.quantity || 0);
}

export function formatCinchoSizesText(item) {
  if (!item?.sizes || typeof item.sizes !== "object") return "";
  const parts = Object.entries(item.sizes)
    .filter(([, q]) => Number(q) > 0)
    .map(([size, q]) => `${size}: ${q}`);
  return parts.length ? parts.join(" · ") : "";
}

function familyForOrderType(orderType) {
  const t = String(orderType || "").trim().toUpperCase();
  if (t === VENTA_EN_LINEA) return "OPL";
  if (t === CLIENTE_KIOSKO) return "OPCK";
  if (t === "CINCHOS_FOSSILES") return "OPCF";
  if (t === "CINCHOS_MARCAS") return "OPCM";
  if (t === "CINCHOS") return "OPC";
  return null;
}

function isEligibleOrder(order) {
  const t = String(order?.orderType || "").trim().toUpperCase();
  if (t !== VENTA_EN_LINEA && t !== CLIENTE_KIOSKO && !isCinchoOrderType(t)) return false;
  if (String(order?.status || "").toUpperCase() === "CANCELLED") return false;
  return true;
}

/**
 * Filas del cuadro cinchos del día: una por línea cincho en OPL, OPCK u OPC.
 * @param {object[]} orders
 * @param {string} workDateYmd YYYY-MM-DD
 */
export function buildCinchoDayBoardRows(orders, workDateYmd) {
  const rows = [];
  (orders || []).forEach((order) => {
    if (!isEligibleOrder(order) || !orderMatchesWorkDate(order, workDateYmd)) return;
    const family = familyForOrderType(order.orderType);
    if (!family) return;
    const isOpcOrder = isCinchoOrderType(order.orderType);
    const mixed = isOpcOrder ? false : orderHasNonCinchoLineItem(order);
    (order.items || []).forEach((item) => {
      if (!isOpcOrder && !isMesaCinchosLineProduct(item?.productCode, item?.productName)) return;
      rows.push({
        key: `${family}-${order.id}-${item.id}`,
        family,
        order,
        item,
        orderCode: order.code,
        productCode: item.productCode,
        productName: item.productName,
        colorName: item.colorName,
        sizesText: formatCinchoSizesText(item),
        totalQty: itemTotalQty(item),
        mixedOrder: mixed,
        productionOrderId: order.id,
        productionOrderItemId: item.id,
        startDate: order.startDate,
        deliveryDate: order.deliveryDate,
      });
    });
  });
  return rows.sort((a, b) => {
    const c = (a.orderCode || "").localeCompare(b.orderCode || "");
    if (c !== 0) return c;
    return (a.productCode || "").localeCompare(b.productCode || "");
  });
}

/**
 * @param {import('../services/cinchoDayStatusService').CinchoDayStatusDayResponse|null|undefined} statusResponse
 */
export function deliveredStatusMapFromApi(statusResponse) {
  const map = {};
  (statusResponse?.statuses || []).forEach((s) => {
    if (s?.productionOrderItemId != null) {
      map[s.productionOrderItemId] = Boolean(s.delivered);
      map[String(s.productionOrderItemId)] = Boolean(s.delivered);
    }
  });
  return map;
}

export function workStatusMapFromApi(statusResponse) {
  const map = {};
  (statusResponse?.statuses || []).forEach((s) => {
    if (s?.productionOrderItemId == null) return;
    const st = String(s.workStatus || CINCHO_WORK_STATUS.PENDING).toUpperCase();
    map[s.productionOrderItemId] = st;
    map[String(s.productionOrderItemId)] = st;
  });
  return map;
}

export function rowWorkStatus(row, workStatusMap) {
  const id = row?.productionOrderItemId;
  if (id == null) return CINCHO_WORK_STATUS.PENDING;
  const st = workStatusMap[id] ?? workStatusMap[String(id)];
  return st || CINCHO_WORK_STATUS.PENDING;
}

export function isRowDelivered(row, deliveredMap) {
  const id = row?.productionOrderItemId;
  if (id == null) return false;
  return Boolean(deliveredMap[id] ?? deliveredMap[String(id)]);
}

/** Línea terminada en mesa cinchos: completada y marcada como entregada. */
export function isCinchoRowFullyDone(row, deliveredMap, workStatusMap) {
  return (
    rowWorkStatus(row, workStatusMap) === CINCHO_WORK_STATUS.COMPLETED
    && isRowDelivered(row, deliveredMap)
  );
}

/** Solo filas con trabajo pendiente (no completadas+entregadas). */
export function filterPendingCinchoRows(rows, deliveredMap, workStatusMap) {
  return (rows || []).filter(
    (row) => !isCinchoRowFullyDone(row, deliveredMap, workStatusMap)
  );
}

/** Tallas del servidor ({ "32": 3, "34": 2 }) en texto corto. */
export function sizesMapText(sizes) {
  const parts = Object.entries(sizes || {}).filter(([, q]) => Number(q) > 0).map(([size, q]) => `${size}: ${q}`);
  return parts.join(" · ");
}

/**
 * Filas del cuadro desde `GET /production/cinchos/day`, con la misma forma que
 * `buildCinchoDayBoardRows`, y los mapas de entregado y estado de ese día.
 */
export function cinchoDayFromApi(day) {
  const rows = [];
  const deliveredMap = {};
  const workStatusMap = {};
  (day?.orders || []).forEach((order) => {
    (order.lines || []).forEach((line) => {
      const id = line.productionOrderItemId;
      rows.push({
        key: `${order.family}-${order.id}-${id}`,
        family: order.family,
        order,
        orderCode: order.code,
        customerName: order.customerName,
        productCode: line.productCode,
        productName: line.productName,
        colorName: line.colorName,
        sizes: line.sizes || {},
        sizesText: sizesMapText(line.sizes),
        totalQty: line.totalQty,
        mixedOrder: Boolean(order.mixedOrder),
        productionOrderId: order.id,
        productionOrderItemId: id,
        startDate: order.startDate,
        deliveryDate: order.deliveryDate,
        // De un día anterior: se arrastra mientras no quede completada y entregada.
        carriedFrom: order.carriedFrom || null,
      });
      deliveredMap[id] = Boolean(line.delivered);
      workStatusMap[id] = String(line.workStatus || CINCHO_WORK_STATUS.PENDING).toUpperCase();
    });
  });
  return { rows, deliveredMap, workStatusMap };
}

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL"];
const sizeNumber = (s) => {
  const n = Number(String(s).trim().replace(",", "."));
  return Number.isFinite(n) && String(s).trim() !== "" ? n : null;
};

/** Mismo orden de tallas que el servidor: numéricas, luego XS…XXXL, luego el resto. */
export function compareSizes(a, b) {
  const na = sizeNumber(a);
  const nb = sizeNumber(b);
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  const ia = SIZE_ORDER.indexOf(String(a).toUpperCase());
  const ib = SIZE_ORDER.indexOf(String(b).toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  return String(a).localeCompare(String(b), "es", { sensitivity: "base" });
}

/** Tallas de todas las líneas de una orden, ordenadas: las columnas de su tabla. */
export function sizeColumns(lines) {
  const set = new Set();
  (lines || []).forEach((l) => Object.keys(l.sizes || {}).forEach((k) => set.add(k)));
  return [...set].sort(compareSizes);
}

/**
 * Cuánto falta para la entrega, en días corridos, y el tono con que se pinta.
 * @returns {{ days: number|null, label: string, tone: "late"|"today"|"soon"|"ok"|"none" }}
 */
export function deliveryUrgency(deliveryYmd, todayYmd) {
  if (!deliveryYmd) return { days: null, label: "Sin fecha de entrega", tone: "none" };
  const d = new Date(`${String(deliveryYmd).slice(0, 10)}T12:00:00`);
  const t = new Date(`${String(todayYmd).slice(0, 10)}T12:00:00`);
  const days = Math.round((d - t) / 86400000);
  if (days < 0) return { days, label: `Atrasada ${-days} ${-days === 1 ? "día" : "días"}`, tone: "late" };
  if (days === 0) return { days, label: "Se entrega hoy", tone: "today" };
  if (days <= 7) return { days, label: `Faltan ${days} ${days === 1 ? "día" : "días"}`, tone: "soon" };
  return { days, label: `Faltan ${days} días`, tone: "ok" };
}
