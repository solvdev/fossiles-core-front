import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getTasks,
  getOrganizerOrders,
  createManualTask,
  getBacklogTasks,
} from "services/taskService";
import { getDeskCountForDate } from "services/deskCountService";
import { buildTableCenterTasks } from "utils/cinchoProductionHelper";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showSuccess, showError } from "utils/notificationHelper";
import { MAX_HOURS_PER_DESK } from "utils/taskHoursHelper";

/**
 * Estado del Organizador de Tareas: órdenes con restantes, tarea borrador
 * (carrito en memoria), tablero de mesas y backlog de pendientes atrasadas.
 */
export default function useTaskOrganizer() {
  // --- Filtros / órdenes ---
  const [typeFilter, setTypeFilter] = useState("ALL"); // ALL | OPL | REGULAR
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // --- Tarea borrador ---
  const [draftLines, setDraftLines] = useState([]);
  const [draftDesk, setDraftDesk] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftObservations, setDraftObservations] = useState("");
  const [creating, setCreating] = useState(false);

  // --- Tablero ---
  const [tasks, setTasks] = useState([]);
  const [boardDate, setBoardDate] = useState(getTodayYmdGuatemala());
  const [numDesks, setNumDesks] = useState(12);

  // --- Backlog ---
  const [backlog, setBacklog] = useState([]);
  const [loadingBacklog, setLoadingBacklog] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await getOrganizerOrders({ type: typeFilter, search });
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingOrders(false);
    }
  }, [typeFilter, search]);

  const loadTasks = useCallback(async () => {
    try {
      const data = await getTasks();
      setTasks(buildTableCenterTasks(Array.isArray(data) ? data : []));
    } catch (err) {
      showError(err.message);
    }
  }, []);

  const loadBacklog = useCallback(async () => {
    setLoadingBacklog(true);
    try {
      const data = await getBacklogTasks();
      setBacklog(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingBacklog(false);
    }
  }, []);

  const loadDesksForDate = useCallback(async (dateYmd) => {
    try {
      const res = await getDeskCountForDate(dateYmd || getTodayYmdGuatemala());
      if (res?.numDesks > 0) setNumDesks(res.numDesks);
    } catch {
      // mantener valor previo
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { loadTasks(); loadBacklog(); }, [loadTasks, loadBacklog]);
  useEffect(() => { loadDesksForDate(boardDate); }, [boardDate, loadDesksForDate]);

  // --- Derivados del borrador ---
  const baseLines = useMemo(() => draftLines.filter((l) => !l.daySaleExtra), [draftLines]);
  const extraLines = useMemo(() => draftLines.filter((l) => l.daySaleExtra), [draftLines]);
  const baseHours = useMemo(
    () => baseLines.reduce((s, l) => s + (l.hours || 0), 0),
    [baseLines]
  );
  const totalHours = useMemo(
    () => draftLines.reduce((s, l) => s + (l.hours || 0), 0),
    [draftLines]
  );
  /** OP base de la tarea: la de la primera línea no-extra (o la primera línea). */
  const baseOrder = useMemo(() => {
    const first = baseLines[0] || draftLines[0];
    return first
      ? { id: first.productionOrderId, code: first.productionOrderCode }
      : null;
  }, [baseLines, draftLines]);

  const overCapacity = baseHours > MAX_HOURS_PER_DESK + 1e-9;

  /**
   * Agrega un ítem al borrador.
   * @param order  OrganizerProductionOrderResponse
   * @param item   OrganizerItemResponse
   * @param qty    cantidad (1..remainingQuantity)
   * @param extra  true = extra OPL sobre el cupo
   */
  const addDraftLine = useCallback((order, item, qty, extra) => {
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      showError("Ingrese una cantidad válida.");
      return false;
    }
    if (quantity > item.remainingQuantity) {
      showError(`Cantidad no disponible: restante ${item.remainingQuantity}.`);
      return false;
    }
    if (extra && !order.onlineSale) {
      showError("Solo los productos de OPL (venta en línea) pueden ir como extra.");
      return false;
    }
    let ok = true;
    setDraftLines((prev) => {
      if (prev.some((l) => l.productionOrderItemId === item.productionOrderItemId)) {
        showError("Ese producto ya está en la tarea borrador.");
        ok = false;
        return prev;
      }
      const firstBase = prev.find((l) => !l.daySaleExtra);
      if (!extra && firstBase && firstBase.productionOrderId !== order.id) {
        showError(`La tarea ya tiene productos de ${firstBase.productionOrderCode}. ` +
          "Solo los extras OPL pueden mezclar órdenes; cree otra tarea para esta OP.");
        ok = false;
        return prev;
      }
      const hours = Math.round(quantity * (item.prdTimePerUnit || 0.1) * 100) / 100;
      return [...prev, {
        productionOrderItemId: item.productionOrderItemId,
        productionOrderId: order.id,
        productionOrderCode: order.code,
        onlineSale: order.onlineSale,
        productCode: item.productCode,
        productName: item.productName,
        colorName: item.colorName,
        quantity,
        remainingQuantity: item.remainingQuantity,
        prdTimePerUnit: item.prdTimePerUnit,
        hours,
        daySaleExtra: !!extra,
      }];
    });
    return ok;
  }, []);

  const removeDraftLine = useCallback((productionOrderItemId) => {
    setDraftLines((prev) => prev.filter((l) => l.productionOrderItemId !== productionOrderItemId));
  }, []);

  const toggleDraftLineExtra = useCallback((productionOrderItemId) => {
    setDraftLines((prev) => prev.map((l) => {
      if (l.productionOrderItemId !== productionOrderItemId) return l;
      if (!l.onlineSale) {
        showError("Solo los productos de OPL pueden marcarse como extra.");
        return l;
      }
      return { ...l, daySaleExtra: !l.daySaleExtra };
    }));
  }, []);

  const clearDraft = useCallback(() => {
    setDraftLines([]);
    setDraftDesk("");
    setDraftDate("");
    setDraftObservations("");
  }, []);

  const createDraftTask = useCallback(async () => {
    if (draftLines.length === 0) {
      showError("Agregue al menos un producto a la tarea.");
      return;
    }
    if (!baseOrder?.id) {
      showError("No se pudo determinar la orden base de la tarea.");
      return;
    }
    if (overCapacity) {
      showError(`La carga base (${baseHours.toFixed(2)} h) excede las ${MAX_HOURS_PER_DESK} horas.`);
      return;
    }
    setCreating(true);
    try {
      const created = await createManualTask({
        productionOrderId: baseOrder.id,
        items: draftLines.map((l) => ({
          productionOrderItemId: l.productionOrderItemId,
          quantity: l.quantity,
          daySaleExtra: l.daySaleExtra,
        })),
        desk: draftDesk ? Number(draftDesk) : null,
        scheduledDate: draftDate || null,
        observations: draftObservations || null,
      });
      showSuccess(`Tarea ${created?.code || ""} creada. Ya aparece en el tablero para asignarla.`);
      clearDraft();
      await Promise.all([loadOrders(), loadTasks(), loadBacklog()]);
      return created;
    } catch (err) {
      showError(err.message);
    } finally {
      setCreating(false);
    }
  }, [draftLines, baseOrder, overCapacity, baseHours, draftDesk, draftDate, draftObservations,
      clearDraft, loadOrders, loadTasks, loadBacklog]);

  /** Ids de ítems ya en el borrador (para deshabilitar "Agregar"). */
  const draftItemIds = useMemo(
    () => new Set(draftLines.map((l) => l.productionOrderItemId)),
    [draftLines]
  );

  return {
    // órdenes
    typeFilter, setTypeFilter, search, setSearch, orders, loadingOrders, loadOrders,
    // borrador
    draftLines, baseLines, extraLines, baseHours, totalHours, baseOrder, overCapacity,
    draftItemIds, addDraftLine, removeDraftLine, toggleDraftLineExtra, clearDraft,
    draftDesk, setDraftDesk, draftDate, setDraftDate, draftObservations, setDraftObservations,
    createDraftTask, creating,
    // tablero
    tasks, setTasks, boardDate, setBoardDate, numDesks, loadTasks,
    // backlog
    backlog, loadingBacklog, loadBacklog,
  };
}
