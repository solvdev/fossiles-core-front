/**
 * Helpers para envío selectivo de productos a mesas (centro de producción).
 */

import {
  isCinchoOrderType,
  isMesaCinchosLineProduct,
} from "utils/cinchoProductionHelper";

/** Ítem de OP que puede generar tarea en mesas (no cincho en OP no-cincho). */
export function isOrderItemEligibleForTableCenter(order, item) {
  if (!item) return false;
  if (isCinchoOrderType(order?.orderType)) return false;
  return !isMesaCinchosLineProduct(item.productCode, item.productName);
}

/** Líneas cincho/pulsera de OP mixta: van a mesa cinchos, no al centro estándar. */
export function getExcludedCinchoItemsForTableCenter(order) {
  if (isCinchoOrderType(order?.orderType)) return [];
  return (order?.items || []).filter((it) =>
    isMesaCinchosLineProduct(it.productCode, it.productName)
  );
}

/** Map itemId → resumen de tarea que ya cubre ese ítem de OP. */
export function collectPlannedOrderItemIds(tasks, orderId) {
  const planned = new Map();
  const oid = Number(orderId);
  if (!oid) return planned;

  (tasks || []).forEach((t) => {
    if (!t || t.status === "CANCELLED") return;
    if (Number(t.productionOrderId) !== oid) return;

    const register = (itemId) => {
      if (itemId == null) return;
      const id = Number(itemId);
      if (!Number.isFinite(id) || planned.has(id)) return;
      planned.set(id, {
        taskCode: t.code,
        desk: t.desk || t.workedDesk,
        scheduledDate: t.scheduledDate,
        status: t.status,
      });
    };

    register(t.productionOrderItemId);
    (t.items || []).forEach((it) => register(it.productionOrderItemId));
  });

  return planned;
}

export function getPendingTableCenterItems(tasks, order) {
  if (!order?.id) return [];
  const planned = collectPlannedOrderItemIds(tasks, order.id);
  return (order.items || []).filter(
    (it) => isOrderItemEligibleForTableCenter(order, it) && !planned.has(Number(it.id))
  );
}

export function orderHasPendingItemsForTasks(tasks, order) {
  return getPendingTableCenterItems(tasks, order).length > 0;
}

export function countPlannedItemsForOrder(tasks, order) {
  const items = (order?.items || []).filter((it) => isOrderItemEligibleForTableCenter(order, it));
  const planned = collectPlannedOrderItemIds(tasks, order.id);
  let onTable = 0;
  items.forEach((it) => {
    if (planned.has(Number(it.id))) onTable += 1;
  });
  return { onTable, total: items.length, pending: items.length - onTable };
}
