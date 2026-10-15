import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  confirmDayPlan,
  getDayPlanOrderItems,
  getDayPlanOrders,
  getTasksByDate,
  previewDayPlan,
} from "services/taskService";
import { getProductionOrders } from "services/productionOrderService";
import { getDeskSupervisorsForDate } from "services/deskSupervisorService";
import { getDeskCountForDate } from "services/deskCountService";
import { getTaskBaseHours } from "utils/taskHoursHelper";
import { buildTableCenterTasks } from "utils/cinchoProductionHelper";
import { getOrganizerDayDeskTasks } from "utils/organizerDayTasks";
import { buildProductionTasksSheetPrintModel } from "utils/productionTasksSheetPrintData";
import {
  downloadProductionTasksSheetExcel,
  openProductionTasksSheetPrintWindow,
} from "utils/productionTasksSheetPrintHtml";
import { formatDateGt, getTodayYmdGuatemala, isWeekendYmd, shiftYmdGuatemala } from "utils/dateTimeHelper";
import { showError, showInfo, showSuccess } from "utils/notificationHelper";
import { contar } from "utils/textHelper";
import {
  buildDayPlanPayload,
  capacityStatus,
  clampTasksToRemaining,
  dayCapacity,
  leftoverQuantity,
  lineFromItem,
  orderPrioritiesFromSelection,
  packOrderLines,
  sortTasksBySelection,
  splitOverflow,
  suggestGrouping,
  taskBaseHours,
} from "utils/dayPlanHelper";

const DRAFT_KEY = "dayplanner.draft.v1";
/** El servidor devuelve a lo más 200 OPs por consulta (TaskOrganizerService). */
const ORDERS_PAGE_SIZE = 200;
/** Cuántas OPs piden sus ítems a la vez. */
const ITEMS_CONCURRENCY = 3;

/** Ítem del endpoint ligero → forma que usan los helpers del planificador. */
const toPlannerItem = (i) => ({
  productionOrderItemId: i.productionOrderItemId,
  productId: i.productId,
  productCode: i.productCode,
  productName: i.productName,
  colorId: i.colorId,
  colorName: i.colorName,
  totalQuantity: i.totalQuantity,
  assignedQuantity: i.assignedQuantity,
  remainingQuantity: i.remainingQuantity,
  prdTimePerUnit: i.prdTimePerUnit,
  unitsPerTask: i.unitsPerTask,
  observations: i.observations,
});

/** Trae todos los ítems con restante de UNA OP (por páginas, sin cargar las demás OPs). */
async function fetchOrderItems(orderId) {
  const out = [];
  for (let page = 0; page < 50; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await getDayPlanOrderItems(orderId, { page, size: 200 });
    out.push(...(res?.content || []).map(toPlannerItem).filter((i) => (i.remainingQuantity || 0) > 0));
    if (!res || res.last) break;
  }
  return out;
}

const readDraft = () => {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeDraft = (draft) => {
  try {
    if (draft) window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* sin almacenamiento, la pantalla funciona igual */
  }
};

/** Primer día de lunes a viernes desde `ymd`, inclusive. */
export const nextWorkdayYmd = (ymd) => {
  let d = ymd;
  for (let i = 0; i < 7 && isWeekendYmd(d); i += 1) d = shiftYmdGuatemala(d, 1);
  return d;
};

const supervisorMap = (res) => {
  const m = {};
  (res?.assignments || []).forEach((a) => {
    if (a.desk != null) m[a.desk] = a.supervisorName || "";
  });
  return m;
};

/**
 * Estado de «Armar el día»: elegir OPs → armar tareas → revisar → confirmar.
 *
 * Una sola pantalla, un paso abierto a la vez. Nada se guarda hasta confirmar; el borrador
 * vive en sessionStorage para que recargar o volver con «Atrás» no lo pierda.
 */
export default function useDayPlanner() {
  const draft = useRef(readDraft()).current;

  const [date, setDateState] = useState(draft?.date || getTodayYmdGuatemala());
  const [step, setStep] = useState(draft?.tasks?.length ? 2 : 1);
  const [reached, setReached] = useState(draft?.tasks?.length ? 2 : 1);

  // --- Paso 1 ---
  const [orders, setOrdersState] = useState([]);
  const ordersRef = useRef([]);
  const setOrders = useCallback((next) => {
    ordersRef.current = typeof next === "function" ? next(ordersRef.current) : next;
    setOrdersState(ordersRef.current);
  }, []);
  /** OPs cuyos productos se están pidiendo al servidor. */
  const [itemsLoading, setItemsLoading] = useState(0);
  const itemsInFlight = useRef(new Map());
  const [totalElements, setTotalElements] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  /** null = todavía no se decidió: al cargar se premarcan las OPL. */
  const [selectedIds, setSelectedIds] = useState(draft?.selectedIds ?? null);
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("ALL");
  /** Unidades de cada producto que van hoy: { productionOrderItemId: n }. Sin dato = automático. */
  const [picks, setPicks] = useState(draft?.picks || {});
  /** Mesas activas de la fecha y horas ya planificadas ese día (null = aún no se sabe). */
  const [dayLoad, setDayLoad] = useState(null);

  // --- Paso 2 ---
  const [tasks, setTasks] = useState(draft?.tasks || []);
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const restoredCheck = useRef(false);
  const [selKey, setSelKey] = useState(draft?.selKey || "");
  const [notice, setNotice] = useState(null);

  // --- Paso 3 ---
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  /** Día que el jefe eligió para una tarea (clientId → yyyy-MM-dd). */
  const [dates, setDates] = useState({});
  const previewSeq = useRef(0);

  // --- Paso 4 ---
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState(null);
  const [result, setResult] = useState(null);
  const sheetCache = useRef({});

  const weekend = isWeekendYmd(date);

  // ------------------------------------------------------- Capacidad del día
  useEffect(() => {
    let cancelled = false;
    setDayLoad(null);
    Promise.all([
      getDeskCountForDate(date),
      getTasksByDate(date).catch(() => []),
    ]).then(([count, dayTasks]) => {
      if (cancelled) return;
      const plannedHours = (Array.isArray(dayTasks) ? dayTasks : [])
        .filter((t) => t.status !== "CANCELLED")
        .reduce((sum, t) => sum + getTaskBaseHours(t), 0);
      setDayLoad({ numDesks: Number(count?.numDesks) || 0, plannedHours });
    }).catch(() => { if (!cancelled) setDayLoad(null); });
    return () => { cancelled = true; };
  }, [date, result]);

  // ---------------------------------------------------------------- OPs
  /**
   * Pide los productos de las OPs indicadas (una petición por OP, pocas a la vez) y los deja en
   * `orders`. Devuelve la lista de OPs ya con esos productos. Lo ya cargado no se vuelve a pedir.
   */
  const ensureItems = useCallback(async (orderIds) => {
    const missing = Array.from(new Set(orderIds || []))
      .filter((id) => ordersRef.current.some((o) => o.id === id && o.items === null));
    const queue = [...missing];
    const worker = async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        let pending = itemsInFlight.current.get(id);
        if (!pending) {
          setItemsLoading((n) => n + 1);
          pending = fetchOrderItems(id).finally(() => {
            itemsInFlight.current.delete(id);
            setItemsLoading((n) => Math.max(0, n - 1));
          });
          itemsInFlight.current.set(id, pending);
        }
        try {
          // eslint-disable-next-line no-await-in-loop
          const items = await pending;
          setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, items } : o)));
        } catch (err) {
          showError(err.message);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(ITEMS_CONCURRENCY, queue.length) }, worker));
    return ordersRef.current;
  }, [setOrders]);

  /**
   * Lee el resumen de las OPs (sin productos). `withItemsFor` trae además los productos de esas
   * OPs, para quien necesita compararlos con lo que ya armó (borrador, cantidades tomadas).
   */
  const loadOrders = useCallback(async (opts) => {
    const withItemsFor = Array.isArray(opts?.withItemsFor) ? opts.withItemsFor : [];
    setLoading(true);
    setLoadError(false);
    try {
      const data = await getDayPlanOrders({ type: "ALL", size: ORDERS_PAGE_SIZE });
      // El resumen ya viene solo con OPs que tienen algo por repartir.
      let list = (Array.isArray(data?.content) ? data.content : []).map((o) => ({ ...o, items: null }));
      setOrders(list);
      setTotalElements(Number(data?.totalElements) || list.length);
      setSelectedIds((prev) => (prev === null
        ? list.filter((o) => o.onlineSale).map((o) => o.id)
        : prev.filter((id) => list.some((o) => o.id === id))));
      // Un borrador restaurado puede haberse quedado atrás: alguien más pudo tomar unidades.
      const draftOrderIds = !restoredCheck.current
        ? Array.from(new Set(tasksRef.current.map((t) => t.orderId)))
        : [];
      const need = Array.from(new Set([...withItemsFor, ...draftOrderIds]));
      if (need.length > 0) {
        list = await ensureItems(need);
      }
      if (!restoredCheck.current) {
        restoredCheck.current = true;
        if (tasksRef.current.length > 0) {
          const clamped = clampTasksToRemaining(tasksRef.current, list);
          if (clamped.changed) {
            setTasks(clamped.tasks);
            setNotice("Mientras tanto otra persona tomó unidades de algunos productos. Actualicé las cantidades.");
          }
        }
      }
      return list;
    } catch (err) {
      setLoadError(true);
      showError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [ensureItems, setOrders]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  const ids = useMemo(() => selectedIds || [], [selectedIds]);
  // Lo que se marca trae sus productos (las OPL vienen premarcadas, así que sus productos van primero).
  useEffect(() => {
    if (ids.length > 0 && orders.length > 0) ensureItems(ids);
  }, [ids, orders.length, ensureItems]);
  const oplOrders = useMemo(() => orders.filter((o) => o.onlineSale), [orders]);
  const otherOrdersAll = useMemo(() => orders.filter((o) => !o.onlineSale), [orders]);
  const families = useMemo(
    () => ["ALL", ...Array.from(new Set(otherOrdersAll.map((o) => o.family).filter(Boolean)))],
    [otherOrdersAll]
  );
  const otherOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return otherOrdersAll
      .filter((o) => familyFilter === "ALL" || o.family === familyFilter)
      .filter((o) => !q
        || String(o.code || "").toLowerCase().includes(q)
        || String(o.customerName || "").toLowerCase().includes(q));
  }, [otherOrdersAll, search, familyFilter]);

  const toggleOrder = useCallback((id) => {
    setSelectedIds((prev) => {
      const cur = prev || [];
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  }, []);

  const markSection = useCallback((onlineSale) => {
    const sectionIds = (onlineSale ? oplOrders : otherOrders).map((o) => o.id);
    setSelectedIds((prev) => {
      const cur = prev || [];
      const all = sectionIds.length > 0 && sectionIds.every((id) => cur.includes(id));
      return all
        ? cur.filter((id) => !sectionIds.includes(id))
        : [...cur, ...sectionIds.filter((id) => !cur.includes(id))];
    });
  }, [oplOrders, otherOrders]);

  const selectedOrders = useMemo(
    () => ids.map((id) => orders.find((o) => o.id === id)).filter(Boolean),
    [ids, orders]
  );
  const orderPriorities = useMemo(
    () => orderPrioritiesFromSelection(orders, ids),
    [orders, ids]
  );

  // -------------------------------------------------------------- Fecha
  const setDate = useCallback((ymd) => {
    if (!ymd || ymd === date) return;
    setDateState(ymd);
    setDates({});
    setPreview(null);
    setPreviewError(null);
    setConfirmError(null);
    setStep((s) => (s > 2 ? 2 : s));
  }, [date]);

  const goToMonday = useCallback(() => setDate(nextWorkdayYmd(date)), [date, setDate]);

  const capacity = useMemo(() => (dayLoad ? dayCapacity(dayLoad) : null), [dayLoad]);

  /** Fija cuántas unidades de un producto van hoy (null = automático, 0 = nada hoy). */
  const setPick = useCallback((itemId, qty) => {
    setPicks((prev) => {
      const next = { ...prev };
      if (qty === null || qty === undefined || Number.isNaN(qty)) delete next[itemId];
      else next[itemId] = Math.max(0, Math.floor(qty));
      return next;
    });
  }, []);
  const clearPicks = useCallback(() => setPicks({}), []);

  // ------------------------------------------------------------- Tareas
  const itemById = useCallback((itemId) => {
    for (const o of orders) {
      const it = (o.items || []).find((i) => i.productionOrderItemId === itemId);
      if (it) return it;
    }
    return null;
  }, [orders]);

  const invalidatePreview = useCallback(() => {
    previewSeq.current += 1;
    setPreview(null);
    setPreviewError(null);
    setConfirmError(null);
  }, []);

  /** Aplica un cambio a las tareas; las que se quedan sin productos desaparecen. */
  const editTasks = useCallback((fn, { keepEmpty = false } = {}) => {
    setTasks((prev) => {
      const next = fn(prev);
      return keepEmpty ? next : next.filter((t) => t.lines.length > 0);
    });
    invalidatePreview();
  }, [invalidatePreview]);

  /** Horas base que caben todavía en el día (Infinity si no se conoce la capacidad). */
  const budgetHours = capacity && capacity.hardHours ? capacity.remainingIdeal : undefined;

  const buildTasks = useCallback(async () => {
    // Los productos de las OPs marcadas tienen que estar cargados antes de repartirlos.
    const loadedOrders = await ensureItems(ids);
    const key = [[...ids].sort((a, b) => a - b).join(","), JSON.stringify(picks)].join("|");
    if (tasks.length === 0 || key !== selKey) {
      const hadTasks = tasks.length > 0;
      setTasks(suggestGrouping(loadedOrders, ids, [], { budgetHours, picks }));
      setSelKey(key);
      if (hadTasks) showInfo("Se volvieron a armar las tareas porque cambió la selección.");
    } else {
      setTasks((prev) => sortTasksBySelection(prev, loadedOrders, ids));
    }
    invalidatePreview();
    setDates({});
    setNotice(null);
    setStep(2);
    setReached((r) => Math.max(r, 2));
  }, [ids, picks, budgetHours, tasks.length, selKey, ensureItems, invalidatePreview]);

  const rebuildTasks = useCallback(() => {
    setTasks(suggestGrouping(orders, ids, [], { budgetHours, picks }));
    setSelKey([[...ids].sort((a, b) => a - b).join(","), JSON.stringify(picks)].join("|"));
    invalidatePreview();
  }, [orders, ids, picks, budgetHours, invalidatePreview]);

  const changeQty = useCallback((clientId, itemId, delta) => {
    const item = itemById(itemId);
    editTasks((prev) => prev.map((t) => {
      if (t.clientId !== clientId) return t;
      const lines = t.lines
        .map((l) => {
          if (l.productionOrderItemId !== itemId) return l;
          if (delta > 0 && item && leftoverQuantity(item, prev) <= 0) return l;
          return { ...l, quantity: l.quantity + delta };
        })
        .filter((l) => l.quantity > 0);
      return { ...t, lines };
    }), { keepEmpty: false });
  }, [editTasks, itemById]);

  const removeLine = useCallback((clientId, itemId) => {
    editTasks((prev) => prev.map((t) => (t.clientId === clientId
      ? { ...t, lines: t.lines.filter((l) => l.productionOrderItemId !== itemId) }
      : t)));
  }, [editTasks]);

  /** Mueve la línea entera a otra tarea de la misma OP (o a una nueva con target = "new"). */
  const moveLine = useCallback((clientId, itemId, target) => {
    editTasks((prev) => {
      const from = prev.find((t) => t.clientId === clientId);
      const line = from?.lines.find((l) => l.productionOrderItemId === itemId);
      if (!from || !line) return prev;
      let next = prev.map((t) => (t.clientId === clientId
        ? { ...t, lines: t.lines.filter((l) => l !== line) }
        : t));
      if (target === "new") {
        const order = orders.find((o) => o.id === from.orderId);
        // Si la línea sola pasa de 4 h, se parte en varias tareas en vez de perder unidades.
        next = [...next, ...packOrderLines(order, [{ item: { ...line }, quantity: line.quantity }])];
      } else {
        next = next.map((t) => {
          if (t.clientId !== target) return t;
          const same = t.lines.find((l) => l.productionOrderItemId === itemId);
          return same
            ? { ...t, lines: t.lines.map((l) => (l === same ? { ...l, quantity: l.quantity + line.quantity } : l)) }
            : { ...t, lines: [...t.lines, line] };
        });
      }
      return sortTasksBySelection(next, orders, ids);
    });
  }, [editTasks, orders, ids]);

  /** Agrega a una tarea todo lo que queda de un producto de su OP. */
  const addItem = useCallback((clientId, itemId) => {
    const item = itemById(itemId);
    if (!item) return;
    editTasks((prev) => {
      const qty = leftoverQuantity(item, prev);
      if (qty <= 0) return prev;
      return prev.map((t) => {
        if (t.clientId !== clientId) return t;
        const same = t.lines.find((l) => l.productionOrderItemId === itemId);
        if (same) return { ...t, lines: t.lines.map((l) => (l === same ? { ...l, quantity: l.quantity + qty } : l)) };
        return { ...t, lines: [...t.lines, lineFromItem(item, qty)] };
      });
    }, { keepEmpty: true });
  }, [editTasks, itemById]);

  /** Tarea vacía para una OP marcada. Devuelve su clientId para abrirla. */
  const newTask = useCallback((orderId) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return null;
    const clientId = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const task = {
      clientId, orderId: order.id, orderCode: order.code, family: order.family || null,
      onlineSale: !!order.onlineSale, customerName: order.customerName || null, lines: [],
    };
    editTasks((prev) => sortTasksBySelection([...prev, task], orders, ids), { keepEmpty: true });
    return clientId;
  }, [orders, ids, editTasks]);

  /** «Arreglar sola»: deja la tarea en 4 h y pasa el excedente a tareas nuevas. */
  const fixTask = useCallback((clientId) => {
    editTasks((prev) => {
      const task = prev.find((t) => t.clientId === clientId);
      const order = orders.find((o) => o.id === task?.orderId);
      if (!task || !order) return prev;
      const { task: fixed, extra } = splitOverflow(task, order);
      return sortTasksBySelection(prev.map((t) => (t.clientId === clientId ? fixed : t)).concat(extra), orders, ids);
    });
  }, [editTasks, orders, ids]);

  /** Lo que se quitó de las tareas y sigue sin repartir. */
  const leftovers = useMemo(() => {
    const out = [];
    selectedOrders.forEach((o) => (o.items || []).forEach((it) => {
      const qty = leftoverQuantity(it, tasks);
      if (qty > 0) out.push({ order: o, item: it, quantity: qty });
    }));
    return out;
  }, [selectedOrders, tasks]);

  const buildFromLeftovers = useCallback(() => {
    editTasks((prev) => {
      const orderIds = Array.from(new Set(leftovers.map((l) => l.order.id)));
      // Solo lo que todavía cabe en el día; lo demás sigue esperando en «Para otro día».
      const used = prev.reduce((sum, t) => sum + taskBaseHours(t), 0);
      const room = budgetHours === undefined ? undefined : Math.max(0, budgetHours - used);
      return sortTasksBySelection([...prev, ...suggestGrouping(orders, orderIds, prev, { budgetHours: room, picks })], orders, ids);
    });
  }, [editTasks, leftovers, orders, ids, budgetHours, picks]);

  /** Qué tan lleno queda el día con las tareas armadas. */
  const planLoad = useMemo(
    () => capacityStatus(tasks.reduce((sum, t) => sum + taskBaseHours(t), 0), capacity),
    [tasks, capacity]
  );

  // ------------------------------------------------------------ Revisar
  const runPreview = useCallback(async (datesOverride) => {
    const seq = ++previewSeq.current;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const body = buildDayPlanPayload(tasks, {
        anchorDate: date, orderPriorities, dates: datesOverride || dates,
      });
      const res = await previewDayPlan(body);
      if (seq === previewSeq.current) setPreview(res);
    } catch (err) {
      if (seq === previewSeq.current) setPreviewError(err.message);
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false);
    }
  }, [tasks, date, orderPriorities, dates]);

  const goReview = useCallback(async () => {
    setStep(3);
    setReached((r) => Math.max(r, 3));
    setConfirmError(null);
    await runPreview();
  }, [runPreview]);

  const changeTaskDate = useCallback((clientId, ymd) => {
    const next = { ...dates, [clientId]: ymd };
    setDates(next);
    runPreview(next);
  }, [dates, runPreview]);

  const previewByClientId = useMemo(() => {
    const m = {};
    (preview?.tasks || []).forEach((t) => { m[t.clientId] = t; });
    return m;
  }, [preview]);

  // ------------------------------------------------------------ Confirmar
  const confirm = useCallback(async ({ acceptChanges = false } = {}) => {
    setConfirming(true);
    setConfirmError(null);
    try {
      const body = buildDayPlanPayload(tasks, {
        anchorDate: date, orderPriorities, dates,
        planFingerprint: preview?.planFingerprint, acceptChanges,
      });
      const res = await confirmDayPlan(body);
      setResult(res);
      setStep(4);
      setReached(4);
      writeDraft(null);
      sheetCache.current = {};
      showSuccess(`${contar(res?.created?.length || tasks.length, "tarea creada", "tareas creadas")}.`);
      loadOrders();
    } catch (err) {
      const code = err.body?.code;
      if (err.status === 409 && code === "PLAN_CHANGED") {
        if (err.body?.preview) setPreview(err.body.preview);
        setConfirmError({
          code,
          message: "La carga de las mesas cambió mientras revisaba. Recalculé la propuesta: revísela y confirme otra vez.",
        });
      } else if (err.status === 409 && code === "QTY_UNAVAILABLE") {
        const list = await loadOrders({ withItemsFor: Array.from(new Set(tasksRef.current.map((t) => t.orderId))) });
        if (list) setTasks((prev) => clampTasksToRemaining(prev, list).tasks);
        invalidatePreview();
        setNotice("Alguien más ya tomó unidades de algunos productos. Actualicé las cantidades: revise las tareas.");
        setStep(2);
      } else if (err.status === 409 && code === "CAPACITY_EXCEEDED") {
        setConfirmError({
          code,
          message: err.message || "El plan pasa de la capacidad de las mesas de ese día. Quite productos o déjelos para otro día.",
        });
      } else if (err.status === 409 && code === "LOCK_TIMEOUT") {
        setConfirmError({ code, message: "El sistema está ocupado con otro reparto. No se creó ninguna tarea; intente otra vez." });
      } else {
        setConfirmError({ code: code || "ERROR", message: err.message || "No se pudieron crear las tareas." });
      }
    } finally {
      setConfirming(false);
    }
  }, [tasks, date, orderPriorities, dates, preview, loadOrders, invalidatePreview]);

  // -------------------------------------------------------------- Otro grupo
  const startOver = useCallback(() => {
    setTasks([]);
    setSelKey("");
    setDates({});
    setResult(null);
    setConfirmError(null);
    invalidatePreview();
    setNotice(null);
    setSelectedIds(null);
    setStep(1);
    setReached(1);
    writeDraft(null);
    loadOrders();
  }, [loadOrders, invalidatePreview]);

  const goTo = useCallback((n) => {
    if (n < step || n <= reached) setStep(n);
  }, [step, reached]);

  // ------------------------------------------------------------ Hoja del día
  /** Modelo de la hoja con las tareas ya guardadas de ese día (lo mismo que arma el Centro). */
  const loadSheetModel = useCallback(async (ymd) => {
    const [tasksOfDay, productionOrders, countRes, supRes] = await Promise.all([
      getTasksByDate(ymd),
      getProductionOrders({ cached: true }),
      getDeskCountForDate(ymd).catch(() => null),
      getDeskSupervisorsForDate(ymd).catch(() => null),
    ]);
    const center = buildTableCenterTasks(Array.isArray(tasksOfDay) ? tasksOfDay : [], productionOrders);
    return buildProductionTasksSheetPrintModel(getOrganizerDayDeskTasks(center, ymd), productionOrders, {
      workDateYmd: ymd,
      deskSupervisorByDesk: supervisorMap(supRes),
      numDesksForLegend: countRes?.numDesks,
    });
  }, []);

  const sheetFor = useCallback(async (ymd, { fresh = false } = {}) => {
    if (!fresh && sheetCache.current[ymd]) return sheetCache.current[ymd];
    const model = await loadSheetModel(ymd);
    sheetCache.current[ymd] = model;
    return model;
  }, [loadSheetModel]);

  const downloadSheet = useCallback(async (ymd = date) => {
    try {
      const model = await sheetFor(ymd, { fresh: true });
      downloadProductionTasksSheetExcel(model, `hoja_mesas_${String(ymd).replace(/-/g, "")}.xlsx`);
    } catch (err) {
      showError(err.message || "No se pudo preparar la hoja.");
    }
  }, [date, sheetFor]);

  const printSheet = useCallback(async (ymd = date) => {
    try {
      const model = await sheetFor(ymd);
      openProductionTasksSheetPrintWindow(model, `Hoja de mesas — organizador ${formatDateGt(ymd)}`);
    } catch (err) {
      showError(err.message || "No se pudo preparar la hoja.");
    }
  }, [date, sheetFor]);

  // Con las tareas recién creadas, la hoja se prepara de antemano: abrir la ventana de
  // impresión después de esperar al servidor lo bloquea el navegador.
  useEffect(() => {
    if (!result) return;
    const days = new Set([date, ...((result.created || []).map((c) => c.scheduledDate).filter(Boolean))]);
    days.forEach((d) => { sheetFor(d, { fresh: true }).catch(() => {}); });
  }, [result, date, sheetFor]);

  // ------------------------------------------------------------ Borrador
  useEffect(() => {
    if (step === 4) return;
    if (tasks.length === 0 && selectedIds === null) return;
    writeDraft({ date, selectedIds, tasks, selKey, picks });
  }, [date, selectedIds, tasks, selKey, picks, step]);

  return {
    // fecha
    date, setDate, weekend, goToMonday,
    // pasos
    step, reached, goTo,
    // paso 1
    orders, oplOrders, otherOrders, families, hasMoreOrders: totalElements > ORDERS_PAGE_SIZE,
    loading, loadError, loadOrders, ensureItems, itemsLoading,
    selectedIds: ids, selectedOrders, toggleOrder, markSection,
    search, setSearch, familyFilter, setFamilyFilter,
    picks, setPick, clearPicks,
    // capacidad del día
    capacity, planLoad,
    // paso 2
    tasks, notice, setNotice, leftovers,
    buildTasks, rebuildTasks, changeQty, removeLine, moveLine, addItem, newTask, fixTask,
    buildFromLeftovers, itemById,
    // paso 3
    preview, previewLoading, previewError, previewByClientId, dates, goReview, runPreview, changeTaskDate,
    // paso 4
    confirm, confirming, confirmError, result, startOver,
    // hoja
    downloadSheet, printSheet,
  };
}
