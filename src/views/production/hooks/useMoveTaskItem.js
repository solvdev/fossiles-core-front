import { useCallback } from "react";
import { moveTaskItem } from "services/taskService";
import { showError } from "utils/notificationHelper";

/**
 * Mueve un task_item entre mesas/fechas con UI optimista (estilo Jira).
 * No hace refetch global: aplica el cambio local inmediato y reconcilia
 * contra el response del backend al terminar (rollback en error).
 *
 * Extraído de TasksByTable para compartirlo con el Organizador de Tareas.
 *
 * @param setTasks setter del estado de tareas (lista de TaskResponse)
 * @returns callback onMove({taskItemId, targetDesk, targetDate})
 */
export default function useMoveTaskItem(setTasks) {
  return useCallback(async ({ taskItemId, targetDesk, targetDate }) => {
    const targetDeskNorm = targetDesk == null ? null : Number(targetDesk);
    const targetDateNorm = targetDate || null;

    let snapshot = null;
    setTasks((current) => {
      snapshot = current;

      let sourceIdx = -1;
      let theItem = null;
      for (let i = 0; i < current.length; i++) {
        const found = (current[i].items || []).find((x) => Number(x.id) === Number(taskItemId));
        if (found) { sourceIdx = i; theItem = found; break; }
      }
      if (sourceIdx === -1 || !theItem) return current;
      const sourceTask = current[sourceIdx];

      const sameContainer =
        (sourceTask.desk || null) === targetDeskNorm &&
        String(sourceTask.scheduledDate || "") === String(targetDateNorm || "");
      if (sameContainer) return current;

      const targetIdx = current.findIndex((t) =>
        Number(t.productionOrderId) === Number(sourceTask.productionOrderId) &&
        (t.desk || null) === targetDeskNorm &&
        String(t.scheduledDate || "") === String(targetDateNorm || "") &&
        t.status === "PENDING" &&
        t.id !== sourceTask.id
      );

      const newSourceItems = (sourceTask.items || []).filter((x) => Number(x.id) !== Number(taskItemId));
      const updatedSource = {
        ...sourceTask,
        items: newSourceItems,
        quantity: newSourceItems.reduce((s, x) => s + (Number(x.quantity) || 0), 0),
        estimatedHours: newSourceItems.reduce((s, x) => s + (Number(x.estimatedHours) || 0), 0),
      };

      let updatedTarget;
      if (targetIdx >= 0) {
        const tgt = current[targetIdx];
        const merged = [...(tgt.items || []), { ...theItem }];
        updatedTarget = {
          ...tgt,
          items: merged,
          quantity: merged.reduce((s, x) => s + (Number(x.quantity) || 0), 0),
          estimatedHours: merged.reduce((s, x) => s + (Number(x.estimatedHours) || 0), 0),
        };
      } else {
        updatedTarget = {
          id: `temp-${taskItemId}-${Date.now()}`,
          code: "…",
          productionOrderId: sourceTask.productionOrderId,
          productionOrderCode: sourceTask.productionOrderCode,
          desk: targetDeskNorm,
          scheduledDate: targetDateNorm,
          status: "PENDING",
          deliveryDate: sourceTask.deliveryDate,
          priority: sourceTask.priority,
          items: [{ ...theItem }],
          quantity: Number(theItem.quantity) || 0,
          estimatedHours: Number(theItem.estimatedHours) || 0,
          leatherDelivered: sourceTask.leatherDelivered,
          leatherDeliveredAt: sourceTask.leatherDeliveredAt,
          dieCutReady: sourceTask.dieCutReady,
          dieCutDate: sourceTask.dieCutDate,
          materialsDelivered: false,
          _optimistic: true,
        };
      }

      let next = current.map((t, i) => (i === sourceIdx ? updatedSource : t));
      if (targetIdx >= 0) {
        next = next.map((t, i) => (i === targetIdx ? updatedTarget : t));
      } else {
        next = [...next, updatedTarget];
      }

      const sourceEmpty =
        updatedSource.items.length === 0 &&
        updatedSource.status === "PENDING" &&
        !updatedSource.startedAt &&
        !updatedSource.completedAt;
      if (sourceEmpty) {
        next = next.filter((t) => t.id !== updatedSource.id);
      }

      return next;
    });

    try {
      const result = await moveTaskItem(taskItemId, targetDeskNorm, targetDateNorm);
      setTasks((current) => {
        let next = current;
        if (result?.sourceTaskDeletedId != null) {
          next = next.filter((t) => Number(t.id) !== Number(result.sourceTaskDeletedId));
        } else if (result?.sourceTask) {
          const sId = Number(result.sourceTask.id);
          const exists = next.some((t) => Number(t.id) === sId);
          next = exists
            ? next.map((t) => (Number(t.id) === sId ? result.sourceTask : t))
            : [...next, result.sourceTask];
        }
        if (result?.targetTask) {
          const tId = Number(result.targetTask.id);
          const exists = next.some((t) => Number(t.id) === tId);
          if (exists) {
            next = next.map((t) => (Number(t.id) === tId ? result.targetTask : t));
          } else {
            const tempIdx = next.findIndex((t) =>
              typeof t.id === "string" && t.id.startsWith("temp-") &&
              Number(t.productionOrderId) === Number(result.targetTask.productionOrderId) &&
              (t.desk || null) === (result.targetTask.desk || null) &&
              String(t.scheduledDate || "") === String(result.targetTask.scheduledDate || "")
            );
            next = tempIdx >= 0
              ? next.map((t, i) => (i === tempIdx ? result.targetTask : t))
              : [...next, result.targetTask];
          }
        }
        return next;
      });
    } catch (err) {
      if (snapshot) setTasks(snapshot);
      showError(err.message || "No se pudo redistribuir");
    }
  }, [setTasks]);
}
