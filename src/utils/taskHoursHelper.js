/**
 * Cupo de horas del centro de producción (espejo de
 * ProductionPlanningConstants.MAX_HOURS_PER_DESK_PER_DAY en el backend).
 * Los ítems daySaleExtra (extras OPL / venta del día) no cuentan contra el cupo.
 */

export const MAX_HOURS_PER_DESK = 4;

/**
 * Tope duro al crear una tarea manual en el Organizador: 4h es lo ideal, pero se
 * permite hasta este límite para que el usuario decida cuánto mandar. Por encima
 * de esto sí se bloquea (espejo de ProductionPlanningConstants.MAX_HOURS_PER_TASK_HARD_CAP).
 */
export const MAX_HOURS_PER_TASK_HARD_CAP = 5;

/** Horas de los ítems extra (daySaleExtra) de una tarea. */
export function getTaskExtraHours(task) {
  const items = task?.items || [];
  return items
    .filter((item) => item?.daySaleExtra)
    .reduce((sum, item) => sum + (item?.estimatedHours || 0), 0);
}

/** Carga base de la tarea (total − extras): lo que cuenta contra el cupo de 4h. */
export function getTaskBaseHours(task) {
  const total = task?.estimatedHours || 0;
  const extra = getTaskExtraHours(task);
  return Math.max(total - extra, 0);
}
