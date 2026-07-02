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
