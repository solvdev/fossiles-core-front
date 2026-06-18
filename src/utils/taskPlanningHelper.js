/**
 * Helpers para envío selectivo de productos a mesas (centro de producción).
 */

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

export function orderHasPendingItemsForTasks(tasks, order) {
  const items = order?.items || [];
  if (items.length === 0) return false;
  const planned = collectPlannedOrderItemIds(tasks, order.id);
  return items.some((it) => !planned.has(Number(it.id)));
}

export function countPlannedItemsForOrder(tasks, order) {
  const items = order?.items || [];
  const planned = collectPlannedOrderItemIds(tasks, order.id);
  let onTable = 0;
  items.forEach((it) => {
    if (planned.has(Number(it.id))) onTable += 1;
  });
  return { onTable, total: items.length, pending: items.length - onTable };
}
