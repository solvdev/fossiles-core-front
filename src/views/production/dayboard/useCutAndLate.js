import { useCallback, useEffect, useState } from "react";
import { getBacklogTasks, getDieCutPending, getUnfinishedTasks } from "services/taskService";
import { showError } from "utils/notificationHelper";

/**
 * Datos del Tablero del día que no vienen en la lista de tareas: lo que espera corte
 * y lo atrasado (pendientes de días anteriores y tareas empezadas que no se terminaron).
 */
export default function useCutAndLate({ autoLoad = true } = {}) {
  const [dieCutPending, setDieCutPending] = useState([]);
  const [loadingDieCut, setLoadingDieCut] = useState(false);
  const [backlog, setBacklog] = useState([]);
  const [loadingBacklog, setLoadingBacklog] = useState(false);
  const [unfinished, setUnfinished] = useState([]);
  const [loadingUnfinished, setLoadingUnfinished] = useState(false);

  const load = async (service, setItems, setLoading) => {
    setLoading(true);
    try {
      const data = await service();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadDieCutPending = useCallback(() => load(getDieCutPending, setDieCutPending, setLoadingDieCut), []);
  const loadBacklog = useCallback(() => load(getBacklogTasks, setBacklog, setLoadingBacklog), []);
  const loadUnfinished = useCallback(() => load(getUnfinishedTasks, setUnfinished, setLoadingUnfinished), []);

  const loadAll = useCallback(
    () => Promise.all([loadDieCutPending(), loadBacklog(), loadUnfinished()]),
    [loadDieCutPending, loadBacklog, loadUnfinished]
  );

  useEffect(() => { if (autoLoad) loadAll(); }, [autoLoad, loadAll]);

  return {
    dieCutPending, loadingDieCut, loadDieCutPending,
    backlog, loadingBacklog, loadBacklog,
    unfinished, loadingUnfinished, loadUnfinished,
    loadAll,
  };
}
