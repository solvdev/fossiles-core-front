/**
 * Cupo de horas del centro de producción (espejo de
 * ProductionPlanningConstants en el backend).
 * Las líneas OPL (VENTA_EN_LINEA / OPL-*) y los ítems daySaleExtra
 * nunca cuentan contra el cupo de mesa/día.
 */

export const MAX_HOURS_PER_DESK = 4;

/**
 * Tope duro al crear una tarea manual en el Organizador: 4h es lo ideal, pero se
 * permite hasta este límite para que el usuario decida cuánto mandar. Por encima
 * de esto sí se bloquea (espejo de ProductionPlanningConstants.MAX_HOURS_PER_TASK_HARD_CAP).
 */
export const MAX_HOURS_PER_TASK_HARD_CAP = 5;

/** Venta en línea: orderType VENTA_EN_LINEA o código OPL-*. */
export function isOnlineSaleOrder(orderType, code) {
  const ot = String(orderType || "").trim().toUpperCase();
  if (ot === "VENTA_EN_LINEA") return true;
  const c = String(code || "").trim().toUpperCase();
  return c.startsWith("OPL-") || c === "OPL";
}

/** Línea de borrador/tarea: no consume cupo si es OPL o daySaleExtra. */
export function lineCountsAgainstCupo(line) {
  if (!line) return false;
  if (line.daySaleExtra || line.onlineSale) return false;
  if (isOnlineSaleOrder(line.orderType, line.productionOrderCode)) return false;
  return true;
}

/** Horas de los ítems extra (daySaleExtra u OPL) de una tarea. */
export function getTaskExtraHours(task) {
  if (isOnlineSaleOrder(task?.orderType, task?.productionOrderCode)) {
    return task?.estimatedHours || 0;
  }
  const items = task?.items || [];
  return items
    .filter((item) => item?.daySaleExtra || isOnlineSaleOrder(item?.orderType, item?.productionOrderCode))
    .reduce((sum, item) => sum + (item?.estimatedHours || 0), 0);
}

/** Carga base de la tarea: lo que cuenta contra el cupo de 4h/5h (OPL → 0). */
export function getTaskBaseHours(task) {
  if (isOnlineSaleOrder(task?.orderType, task?.productionOrderCode)) {
    return 0;
  }
  const total = task?.estimatedHours || 0;
  const extra = getTaskExtraHours(task);
  return Math.max(total - extra, 0);
}
