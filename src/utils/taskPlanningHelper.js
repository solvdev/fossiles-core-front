/**
 * Helpers para envío selectivo de productos a mesas (centro de producción).
 * Modelo de "cantidad restante": un ítem de OP puede estar cubierto parcialmente
 * por tareas (organizador); restante = cantidad efectiva − SUM(task_item.quantity).
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

/**
 * Cantidad efectiva de un ítem de OP: quantity + suma de tallas, mínimo 1
 * (espejo de ProductionOrderItemQuantityHelper.effectiveQuantityForBom del backend).
 */
export function effectiveOrderItemQuantity(item) {
  if (!item) return 1;
  let total = Number(item.quantity) || 0;
  if (item.sizes && typeof item.sizes === "object") {
    total += Object.values(item.sizes).reduce((sum, q) => sum + (Number(q) || 0), 0);
  }
  return Math.max(total, 1);
}

/**
 * Map itemId → { assignedQty, tasks: [{taskCode, desk, scheduledDate, status, quantity}] }
 * sumando las cantidades de task_items de tareas no canceladas que cubren cada ítem de la OP.
 */
export function collectAssignedQuantities(tasks, orderId) {
  const assigned = new Map();
  const oid = Number(orderId);
  if (!oid) return assigned;

  (tasks || []).forEach((t) => {
    if (!t || t.status === "CANCELLED") return;
    (t.items || []).forEach((it) => {
      const itemId = Number(it?.productionOrderItemId);
      if (!Number.isFinite(itemId) || itemId <= 0) return;
      const qty = Number(it.quantity) || 0;
      const entry = assigned.get(itemId) || { assignedQty: 0, tasks: [] };
      entry.assignedQty += qty;
      entry.tasks.push({
        taskCode: t.code,
        desk: t.desk || t.workedDesk,
        scheduledDate: t.scheduledDate,
        status: t.status,
        quantity: qty,
      });
      assigned.set(itemId, entry);
    });
  });

  // Filtrar a ítems de esta OP se hace en los consumidores (que tienen order.items);
  // el map global no daña porque se consulta por id de ítem de la OP.
  return assigned;
}

/**
 * Ítems elegibles de la OP con cantidad restante > 0 (sin tarea o cubiertos
 * parcialmente). Cada ítem sale anotado con assignedQuantity/remainingQuantity.
 */
export function getPendingTableCenterItems(tasks, order) {
  if (!order?.id) return [];
  if (String(order?.status || "").toUpperCase() === "DRAFT") return [];
  const assigned = collectAssignedQuantities(tasks, order.id);
  return (order.items || [])
    .filter((it) => isOrderItemEligibleForTableCenter(order, it))
    .map((it) => {
      const total = effectiveOrderItemQuantity(it);
      const assignedQty = assigned.get(Number(it.id))?.assignedQty || 0;
      return {
        ...it,
        totalQuantity: total,
        assignedQuantity: assignedQty,
        remainingQuantity: Math.max(total - assignedQty, 0),
      };
    })
    .filter((it) => it.remainingQuantity > 0);
}

export function orderHasPendingItemsForTasks(tasks, order) {
  return getPendingTableCenterItems(tasks, order).length > 0;
}

/** Resumen por OP: onTable = ítems totalmente cubiertos; pending = con restante. */
export function countPlannedItemsForOrder(tasks, order) {
  const items = (order?.items || []).filter((it) => isOrderItemEligibleForTableCenter(order, it));
  const assigned = collectAssignedQuantities(tasks, order?.id);
  let onTable = 0;
  items.forEach((it) => {
    const total = effectiveOrderItemQuantity(it);
    const assignedQty = assigned.get(Number(it.id))?.assignedQty || 0;
    if (assignedQty >= total) onTable += 1;
  });
  return { onTable, total: items.length, pending: items.length - onTable };
}
