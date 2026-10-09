import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getTasks,
  getOrganizerOrders,
  createManualTask,
  getBacklogTasks,
  getUnfinishedTasks,
  getDieCutPending,
  clearAllDesks,
} from "services/taskService";
import { getProductionOrders } from "services/productionOrderService";
import { getDeskCountForDate } from "services/deskCountService";
import { buildTableCenterTasks } from "utils/cinchoProductionHelper";
import { getTodayYmdGuatemala, isWeekendYmd } from "utils/dateTimeHelper";
import { showSuccess, showError } from "utils/notificationHelper";
import {
  MAX_HOURS_PER_DESK,
  MAX_HOURS_PER_TASK_HARD_CAP,
  lineCountsAgainstCupo,
} from "utils/taskHoursHelper";

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
  const [page, setPage] = useState(0);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  // La búsqueda ya no filtra en memoria: cada tecla sería una consulta con LIKE.
  const [searchAplicado, setSearchAplicado] = useState("");

  // --- Cola del día: qué órdenes entran y en qué orden ---
  // Se guarda como lista de {id, code}, no como orden del arreglo visible: si se guardara
  // así, cambiar de página o de filtro destruiría la cola.
  const [colaDelDia, setColaDelDia] = useState([]);
  const alternarEnCola = useCallback((order) => {
    setColaDelDia((prev) => prev.some((o) => o.id === order.id)
      ? prev.filter((o) => o.id !== order.id)
      : [...prev, { id: order.id, code: order.code }]);
  }, []);
  const quitarDeCola = useCallback((id) => {
    setColaDelDia((prev) => prev.filter((o) => o.id !== id));
  }, []);
  const limpiarCola = useCallback(() => setColaDelDia([]), []);

  // --- Tarea borrador ---
  const [draftLines, setDraftLines] = useState([]);
  const [draftDesk, setDraftDesk] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftObservations, setDraftObservations] = useState("");
  const [creating, setCreating] = useState(false);

  // --- Tablero ---
  const [tasks, setTasks] = useState([]);
  const [productionOrders, setProductionOrders] = useState([]);
  const [boardDate, setBoardDate] = useState(getTodayYmdGuatemala());
  const [numDesks, setNumDesks] = useState(12);
  const [clearingDesks, setClearingDesks] = useState(false);

  // --- Backlog ---
  const [backlog, setBacklog] = useState([]);
  const [loadingBacklog, setLoadingBacklog] = useState(false);

  // --- No terminadas: IN_PROGRESS que se arrastran de días anteriores ---
  const [unfinished, setUnfinished] = useState([]);
  const [loadingUnfinished, setLoadingUnfinished] = useState(false);
  const [dieCutPending, setDieCutPending] = useState([]);
  const [loadingDieCut, setLoadingDieCut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchAplicado(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Al cambiar filtro o búsqueda se vuelve a la primera página: quedarse en la cuarta
  // con un filtro nuevo devolvía una pantalla vacía sin explicación.
  useEffect(() => { setPage(0); }, [typeFilter, searchAplicado]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const data = await getOrganizerOrders({
        type: typeFilter, search: searchAplicado, page, size: 30,
      });
      // El servidor devuelve una página, no un arreglo. Si esto se leyera como antes,
      // el listado quedaría vacío sin dar ningún error.
      setOrders(Array.isArray(data?.content) ? data.content : []);
      setTotalElements(Number(data?.totalElements) || 0);
      setTotalPages(Number(data?.totalPages) || 0);
    } catch (err) {
      showError(err.message);
      setOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  }, [typeFilter, searchAplicado, page]);

  const loadTasks = useCallback(async () => {
    try {
      const [data, orders] = await Promise.all([getTasks(), getProductionOrders()]);
      setProductionOrders(Array.isArray(orders) ? orders : []);
      setTasks(buildTableCenterTasks(Array.isArray(data) ? data : [], orders));
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

  /**
   * La lista por troquelar: tareas pendientes con algun producto sin cortar.
   *
   * Es el paso entre el borrador y la cola del dia. Se carga aparte de las demas porque
   * cambia cada vez que alguien marca un corte, y porque la pestana puede quedarse abierta
   * mientras el troquel trabaja.
   */
  const loadDieCutPending = useCallback(async () => {
    setLoadingDieCut(true);
    try {
      const data = await getDieCutPending();
      setDieCutPending(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingDieCut(false);
    }
  }, []);

  const loadUnfinished = useCallback(async () => {
    setLoadingUnfinished(true);
    try {
      const data = await getUnfinishedTasks();
      setUnfinished(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingUnfinished(false);
    }
  }, []);

  /**
   * Libera mesas para reorganizar.
   * @param {string} [date] si se indica, solo libera mesa de las tareas PENDING de ese
   *   día (conserva su fecha); sin fecha, reset completo (mesa+fecha de todas las PENDING).
   */
  const clearAllDesksAction = useCallback(async (date) => {
    setClearingDesks(true);
    try {
      const result = await clearAllDesks(date);
      showSuccess(result?.message || "Mesas liberadas.");
      await Promise.all([loadTasks(), loadBacklog(), loadUnfinished()]);
    } catch (err) {
      showError(err.message);
    } finally {
      setClearingDesks(false);
    }
  }, [loadTasks, loadBacklog, loadUnfinished]);

  const loadDesksForDate = useCallback(async (dateYmd) => {
    try {
      const res = await getDeskCountForDate(dateYmd || getTodayYmdGuatemala());
      if (res?.numDesks > 0) setNumDesks(res.numDesks);
    } catch {
      // mantener valor previo
    }
  }, []);

  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => {
    loadTasks();
    loadBacklog();
    loadUnfinished();
    loadDieCutPending();
  }, [loadTasks, loadBacklog, loadUnfinished, loadDieCutPending]);
  useEffect(() => { loadDesksForDate(boardDate); }, [boardDate, loadDesksForDate]);

  // --- Derivados del borrador ---
  // OPL never counts against cupo (same as daySaleExtra).
  const baseLines = useMemo(() => draftLines.filter((l) => lineCountsAgainstCupo(l)), [draftLines]);
  const extraLines = useMemo(() => draftLines.filter((l) => !lineCountsAgainstCupo(l)), [draftLines]);
  const baseHours = useMemo(
    () => baseLines.reduce((s, l) => s + (l.hours || 0), 0),
    [baseLines]
  );
  const totalHours = useMemo(
    () => draftLines.reduce((s, l) => s + (l.hours || 0), 0),
    [draftLines]
  );
  /** OP base de la tarea: la de la primera línea que cuenta cupo (o la primera línea). */
  const baseOrder = useMemo(() => {
    const first = baseLines[0] || draftLines[0];
    return first
      ? { id: first.productionOrderId, code: first.productionOrderCode }
      : null;
  }, [baseLines, draftLines]);

  /** Por encima de lo ideal (4h) pero todavía dentro del máximo permitido (5h): se deja crear. */
  const overIdeal = baseHours > MAX_HOURS_PER_DESK + 1e-9;
  /** Por encima del máximo permitido: se bloquea la creación. */
  const overCapacity = baseHours > MAX_HOURS_PER_TASK_HARD_CAP + 1e-9;

  /**
   * Agrega un ítem al borrador.
   * @param order  OrganizerProductionOrderResponse
   * @param item   OrganizerItemResponse
   * @param qty    cantidad (1..remainingQuantity)
   * @param extra  ignored for OPL (always excluded from cupo); for others, client may pass true
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
    const onlineSale = !!order.onlineSale;
    // OPL always daySaleExtra / zero cupo.
    const asExtra = onlineSale || !!extra;
    if (asExtra && !onlineSale) {
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
      const firstBase = prev.find((l) => lineCountsAgainstCupo(l));
      if (!asExtra && firstBase && firstBase.productionOrderId !== order.id) {
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
        onlineSale,
        productCode: item.productCode,
        productName: item.productName,
        colorName: item.colorName,
        quantity,
        remainingQuantity: item.remainingQuantity,
        prdTimePerUnit: item.prdTimePerUnit,
        hours,
        daySaleExtra: asExtra,
      }];
    });
    return ok;
  }, []);

  const removeDraftLine = useCallback((productionOrderItemId) => {
    setDraftLines((prev) => prev.filter((l) => l.productionOrderItemId !== productionOrderItemId));
  }, []);

  /** OPL stays daySaleExtra; toggle is a no-op for onlineSale lines. */
  const toggleDraftLineExtra = useCallback((productionOrderItemId) => {
    setDraftLines((prev) => prev.map((l) => {
      if (l.productionOrderItemId !== productionOrderItemId) return l;
      if (l.onlineSale) {
        return { ...l, daySaleExtra: true };
      }
      showError("Solo los productos de OPL pueden marcarse como extra.");
      return l;
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
      showError(`La carga base (${baseHours.toFixed(2)} h) excede el máximo de ${MAX_HOURS_PER_TASK_HARD_CAP} horas.`);
      return;
    }
    if (isWeekendYmd(draftDate)) {
      showError("Solo se trabaja de lunes a viernes: elige una fecha entre semana.");
      return;
    }
    setCreating(true);
    try {
      const created = await createManualTask({
        productionOrderId: baseOrder.id,
        items: draftLines.map((l) => ({
          productionOrderItemId: l.productionOrderItemId,
          quantity: l.quantity,
          daySaleExtra: !!(l.daySaleExtra || l.onlineSale),
        })),
        // Sin mesa a propósito: el sistema decide dónde, no el humano.
        desk: null,
        scheduledDate: draftDate || null,
        observations: draftObservations || null,
      });
      showSuccess(`Tarea ${created?.code || ""} creada. Ya aparece en el tablero para asignarla.`);
      clearDraft();
      await Promise.all([loadOrders(), loadTasks(), loadBacklog(), loadUnfinished()]);
      return created;
    } catch (err) {
      showError(err.message);
    } finally {
      setCreating(false);
    }
  }, [draftLines, baseOrder, overCapacity, baseHours, draftDesk, draftDate, draftObservations,
      clearDraft, loadOrders, loadTasks, loadBacklog, loadUnfinished]);

  /** Ids de ítems ya en el borrador (para deshabilitar "Agregar"). */
  const draftItemIds = useMemo(
    () => new Set(draftLines.map((l) => l.productionOrderItemId)),
    [draftLines]
  );

  return {
    // órdenes
    typeFilter, setTypeFilter, search, setSearch, orders, loadingOrders, loadOrders,
    page, setPage, totalElements, totalPages,
    colaDelDia, alternarEnCola, quitarDeCola, limpiarCola,
    // borrador
    draftLines, baseLines, extraLines, baseHours, totalHours, baseOrder, overCapacity, overIdeal,
    draftItemIds, addDraftLine, removeDraftLine, toggleDraftLineExtra, clearDraft,
    draftDesk, setDraftDesk, draftDate, setDraftDate, draftObservations, setDraftObservations,
    createDraftTask, creating,
    // tablero
    tasks, setTasks, productionOrders, boardDate, setBoardDate, numDesks, loadTasks,
    clearAllDesksAction, clearingDesks,
    // backlog
    backlog, loadingBacklog, loadBacklog,
    // no terminadas
    unfinished, loadingUnfinished, loadUnfinished,
    // lista por troquelar
    dieCutPending, loadingDieCut, loadDieCutPending,
  };
}
