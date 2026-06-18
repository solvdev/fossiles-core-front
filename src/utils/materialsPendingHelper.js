/**
 * Helpers para entrega de materiales (alineados con GET materials-view).
 */

/** True si la vista de materiales aún tiene trabajo pendiente para la OP. */
export function orderHasPendingMaterialsTasks(materialsViewTasks) {
  if (!Array.isArray(materialsViewTasks) || materialsViewTasks.length === 0) {
    return false;
  }
  return materialsViewTasks.some((task) =>
    (task.products || []).some(
      (p) => p.requiresMaterials !== false && !p.materialsDelivered
    )
  );
}

/** Filtra ítems de tarea que aún requieren entrega de materiales. */
export function countPendingMaterialProducts(materialsViewTasks) {
  let pending = 0;
  (materialsViewTasks || []).forEach((task) => {
    (task.products || []).forEach((p) => {
      if (p.requiresMaterials !== false && !p.materialsDelivered) pending += 1;
    });
  });
  return pending;
}
