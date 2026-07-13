import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Badge,
  Input,
  Label,
  Button,
  FormGroup,
  Alert,
  Progress,
  Modal,
  ModalBody,
  ModalHeader,
  ModalFooter,
} from "reactstrap";
import Select from "react-select";
import {
  getTasks,
  updateTaskStatus,
  toggleDieCut,
  setLeatherDelivery,
  setTaskItemLeatherDelivery,
  scheduleTask,
  getDaySaleCandidates,
  addDaySaleItemsToTask,
  updateTaskStartedAt,
} from "services/taskService";
import { getProductionOrders } from "services/productionOrderService";
import {
  isCinchoOrderType,
  orderHasOnlyCinchoLineItems,
  buildTableCenterTasks,
} from "utils/cinchoProductionHelper";
import {
  countPlannedItemsForOrder,
  getPendingTableCenterItems,
} from "utils/taskPlanningHelper";
import { showSuccess, showError } from "utils/notificationHelper";
import TaskTicketPrint from "./TaskTicketPrint";
import DownloadOpsModal, { mergeOrdersForDownload } from "components/production/DownloadOpsModal";
import { taskSkipsMaterials } from "utils/materialRequirementHelper";
import { formatDateGt, formatDateTimeGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { formatProductionOrderSelectLabel } from "utils/productionOrderDisplayHelper";
import { openProductionTasksSheetPrintWindow, downloadProductionTasksSheetExcel } from "utils/productionTasksSheetPrintHtml";
import { buildProductionTasksSheetPrintModel } from "utils/productionTasksSheetPrintData";
import { getOrganizerDayDeskTasks, getOrganizerDayBoletaTasks } from "utils/organizerDayTasks";
import { getDeskSupervisorsForDate, replaceDeskSupervisorsForDate } from "services/deskSupervisorService";
import { getDeskCountForDate, replaceDeskCountForDate } from "services/deskCountService";
import { deskDisplayLabel } from "utils/deskSupervisorDisplay";
import {
  buildCinchoDayBoardRows,
  deliveredStatusMapFromApi,
  filterPendingCinchoRows,
  orderWorkAnchorYmd,
  workStatusMapFromApi,
} from "utils/cinchoDayBoardHelper";
import {
  getCinchoDayStatuses,
  setCinchoDayDelivered,
  setCinchoDayWorkStatus,
} from "services/cinchoDayStatusService";
import CinchosDayBoard from "./CinchosDayBoard";
import RedistributeBoard from "./components/RedistributeBoard";
import useMoveTaskItem from "./hooks/useMoveTaskItem";
import { MAX_HOURS_PER_DESK, getTaskBaseHours, getTaskExtraHours } from "utils/taskHoursHelper";

/** En tarjetas con fondo claro: Paper fuerza texto blanco en `.badge`, lo que deja cantidades ilegibles. */
const BADGE_READABLE_ON_LIGHT = {
  color: "#111827",
  backgroundColor: "#fff",
  border: "1px solid rgba(0,0,0,0.2)",
  fontWeight: 600,
};

function TasksByTable() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deskConfigWarning, setDeskConfigWarning] = useState("");
  const [viewMode, setViewMode] = useState("operation"); // "operation" | "schedule" | "redistribute"
  const [filterDesk, setFilterDesk] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProductionOrderId, setFilterProductionOrderId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDieCut, setFilterDieCut] = useState("all");
  const [printTaskId, setPrintTaskId] = useState(null);
  const [printBatchTaskIds, setPrintBatchTaskIds] = useState(null);
  const [printSupervisorByDesk, setPrintSupervisorByDesk] = useState(null);
  const [numDesks, setNumDesks] = useState(12);
  const [workingDesksCount, setWorkingDesksCount] = useState(12);
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [showDownloadOpsModal, setShowDownloadOpsModal] = useState(false);
  const [deskSupervisorsByDate, setDeskSupervisorsByDate] = useState({});
  const [showDeskSupervisorsModal, setShowDeskSupervisorsModal] = useState(false);
  const [deskSupervisorModalDate, setDeskSupervisorModalDate] = useState("");
  const [deskSupervisorDraft, setDeskSupervisorDraft] = useState([]);
  const [deskCountDraft, setDeskCountDraft] = useState(12);
  const [savingDeskSupervisors, setSavingDeskSupervisors] = useState(false);
  const [productionOrders, setProductionOrders] = useState([]);
  /** Todas las OP activas para filtro/búsqueda (sin excluir cinchos ni estados intermedios). */
  const [productionOrdersForFilter, setProductionOrdersForFilter] = useState([]);
  /** Órdenes activas OPL/OPCK/OPC (para cuadro cinchos del día). */
  const [productionOrdersForCinchos, setProductionOrdersForCinchos] = useState([]);
  const [cinchoDeliveredByDate, setCinchoDeliveredByDate] = useState({});
  const [cinchoWorkStatusByDate, setCinchoWorkStatusByDate] = useState({});
  const [cinchoStatusLoadingByDate, setCinchoStatusLoadingByDate] = useState({});
  const [cinchoSavingKey, setCinchoSavingKey] = useState(null);
  const [showDetailedList, setShowDetailedList] = useState(false);
  const [showDaySaleModal, setShowDaySaleModal] = useState(false);
  const [daySaleTask, setDaySaleTask] = useState(null);
  const [daySaleCandidates, setDaySaleCandidates] = useState([]);
  const [selectedDaySaleItems, setSelectedDaySaleItems] = useState([]);
  const [loadingDaySaleCandidates, setLoadingDaySaleCandidates] = useState(false);
  const [savingDaySaleItems, setSavingDaySaleItems] = useState(false);
  const [showLeatherModal, setShowLeatherModal] = useState(false);
  const [leatherTask, setLeatherTask] = useState(null);
  const [selectedLeatherItems, setSelectedLeatherItems] = useState([]);
  const [leatherSelectionCount, setLeatherSelectionCount] = useState("");
  const [savingLeatherItems, setSavingLeatherItems] = useState(false);

  // Redistribuir manual (aparte del cronograma)
  const [redistributeDate, setRedistributeDate] = useState(new Date().toISOString().split("T")[0]);
  const [editStartModal, setEditStartModal] = useState({ open: false, task: null, value: "" });

  const loadDesksCount = useCallback(async () => {
    try {
      const d = filterDate || getTodayYmdGuatemala();
      const res = await getDeskCountForDate(d);
      const count = res.numDesks ?? 12;
      setNumDesks(count);
      setWorkingDesksCount(count);
      if (res.isDefault) {
        setDeskConfigWarning(
          `No se pudo leer la configuración de mesas activas; se está usando ${count}. ` +
            `Revisa la configuración general (llaves: MANUFACTURING_NUMBER_OF_TABLES / PRODUCTION_TABLES_COUNT).`
        );
      } else {
        setDeskConfigWarning("");
      }
    } catch {
      /* use default */
    }
  }, [filterDate]);

  useEffect(() => {
    loadTasks();
    loadProductionOrders();
  }, []);

  useEffect(() => {
    loadDesksCount();
  }, [filterDate, loadDesksCount]);

  useEffect(() => {
    const orderIdFromUrl = searchParams.get("orderId");
    if (!orderIdFromUrl || productionOrdersForFilter.length === 0) return;
    const exists = productionOrdersForFilter.some((o) => Number(o.id) === Number(orderIdFromUrl));
    if (!exists) return;

    setFilterProductionOrderId(String(orderIdFromUrl));
    setViewMode("operation");
    setShowDetailedList(false);

    const next = new URLSearchParams(searchParams);
    next.delete("orderId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, productionOrdersForFilter]);

  useEffect(() => {
    if (!showLeatherModal) return;
    setLeatherSelectionCount(String(selectedLeatherItems.length));
  }, [selectedLeatherItems, showLeatherModal]);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getTasks();
      setTasks(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar tareas");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProductionOrders = async () => {
    try {
      const data = await getProductionOrders();
      const activeStatuses = new Set(["PENDING", "IN_PROGRESS", "DRAFT"]);
      const closedStatuses = new Set(["COMPLETED", "CANCELLED", "PRODUCED", "FINISHED", "TERMINATED", "DONE"]);
      const active = (data || []).filter((o) => {
        const status = String(o?.status || "").toUpperCase();
        if (closedStatuses.has(status)) return false;
        if (activeStatuses.size > 0 && status && !activeStatuses.has(status)) return false;
        return true;
      });
      setProductionOrdersForCinchos(
        active.filter((o) => {
          const orderType = String(o?.orderType || "").trim().toUpperCase();
          return (
            orderType === "VENTA_EN_LINEA"
            || orderType === "CLIENTE_KIOSKO"
            || isCinchoOrderType(orderType)
          );
        })
      );
      setProductionOrders(
        active.filter((o) => {
          const orderType = String(o?.orderType || "").trim().toUpperCase();
          const status = String(o?.status || "").toUpperCase();
          if (status === "DRAFT") return false;
          if (isCinchoOrderType(orderType)) return false;
          if (orderHasOnlyCinchoLineItems(o)) return false;
          return true;
        })
      );
      setProductionOrdersForFilter(
        (data || []).filter((o) => String(o?.status || "").toUpperCase() !== "CANCELLED")
      );
    } catch (err) {
      console.error("Error loading production orders:", err);
    }
  };

  const mapFromSupervisorResponse = useCallback((res) => {
    const m = {};
    (res?.assignments || []).forEach((a) => {
      if (a.desk != null) m[a.desk] = a.supervisorName || "";
    });
    return m;
  }, []);

  const normalizeSupervisorRowsForCount = useCallback((rows, num) => {
    const n = Math.max(1, Math.min(32, Number(num) || 1));
    const byDesk = new Map();
    (rows || []).forEach((r) => {
      const d = Number(r?.desk);
      if (!Number.isFinite(d) || d < 1) return;
      byDesk.set(d, { desk: d, supervisorName: r?.supervisorName || "" });
    });
    const next = [];
    for (let d = 1; d <= n; d++) {
      next.push(byDesk.get(d) || { desk: d, supervisorName: "" });
    }
    return next;
  }, []);

  const refreshDeskSupervisorsForDates = useCallback(
    async (dateStrList) => {
      const unique = [...new Set(dateStrList)].filter(Boolean);
      if (unique.length === 0) return;
      const next = {};
      await Promise.all(
        unique.map(async (d) => {
          try {
            const res = await getDeskSupervisorsForDate(d);
            next[d] = mapFromSupervisorResponse(res);
          } catch {
            // ignore per-date errors
          }
        })
      );
      if (Object.keys(next).length > 0) {
        setDeskSupervisorsByDate((prev) => ({ ...prev, ...next }));
      }
    },
    [mapFromSupervisorResponse]
  );

  // ==================== HANDLERS ====================

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      const updated = await updateTaskStatus(taskId, newStatus);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      if (newStatus === "COMPLETED" || updated?.status === "AWAITING_WAREHOUSE") {
        await loadTasks();
      }
      if (updated?.status === "AWAITING_WAREHOUSE") {
        showSuccess("Trabajo terminado en mesa. Pendiente recepción en bodega PT.");
      } else {
        showSuccess("Estado actualizado");
      }
    } catch (err) {
      showError(err.message);
    }
  };

  const openEditStartedAt = (task) => {
    if (!task?.id) return;
    const current = task.startedAt ? String(task.startedAt).slice(0, 19) : "";
    // datetime-local espera "YYYY-MM-DDTHH:mm"
    const normalized = current ? current.slice(0, 16) : "";
    setEditStartModal({ open: true, task, value: normalized });
  };

  const saveEditedStartedAt = async () => {
    const task = editStartModal.task;
    const value = editStartModal.value;
    if (!task?.id) return;
    if (!value) {
      showError("Seleccione fecha y hora.");
      return;
    }
    try {
      // Backend espera LocalDateTime ISO (segundos opcionales). Mandamos con ":00".
      const startedAt = `${value}:00`;
      const updated = await updateTaskStartedAt(task.id, startedAt);
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      showSuccess("Hora de inicio actualizada");
      setEditStartModal({ open: false, task: null, value: "" });
    } catch (err) {
      showError(err.message || "No se pudo actualizar la hora de inicio");
    }
  };

  // Drag & drop de ítems entre mesas/fechas (optimista + rollback), compartido con el Organizador.
  const handleMoveTaskItem = useMoveTaskItem(setTasks);

  const handleDieCutToggle = async (taskId, currentValue) => {
    if (currentValue) return;
    try {
      const updated = await toggleDieCut(taskId, true);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      showSuccess("Troquelado marcado");
    } catch (err) {
      showError(err.message);
    }
  };

  const handleLeatherDeliveryToggle = async (taskId, currentValue) => {
    if (currentValue) return;
    try {
      const updated = await setLeatherDelivery(taskId, true);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      showSuccess("Cuero entregado");
    } catch (err) {
      showError(err.message);
    }
  };

  const openLeatherDeliveryModal = (task) => {
    const query = task?.productionOrderId
      ? `?openDelivery=1&productionOrderId=${task.productionOrderId}`
      : "?openDelivery=1";
    navigate(`/admin/leather-inventory${query}`);
  };

  const toggleLeatherItemSelection = (taskItemId) => {
    setSelectedLeatherItems((prev) =>
      prev.includes(taskItemId)
        ? prev.filter((id) => id !== taskItemId)
        : [...prev, taskItemId]
    );
  };

  const applyLeatherSelectionCount = (rawCount) => {
    const pendingIds = (leatherTask?.items || [])
      .filter((item) => item?.id && !item?.leatherDelivered)
      .map((item) => item.id);
    const max = pendingIds.length;
    const parsed = Number.parseInt(rawCount, 10);
    const safeCount = Number.isFinite(parsed) ? Math.max(0, Math.min(max, parsed)) : 0;
    setSelectedLeatherItems(pendingIds.slice(0, safeCount));
    setLeatherSelectionCount(String(safeCount));
  };

  const handleConfirmLeatherDelivery = async () => {
    if (!leatherTask?.id) return;
    try {
      setSavingLeatherItems(true);
      const items = leatherTask.items || [];
      if (items.length === 0) {
        await handleLeatherDeliveryToggle(leatherTask.id, false);
      } else {
        const deliverableIds = items
          .filter((item) => item?.id && selectedLeatherItems.includes(item.id) && !item.leatherDelivered)
          .map((item) => item.id);
        if (deliverableIds.length === 0) {
          showError("Seleccione al menos un producto pendiente de cuero.");
          return;
        }
        await Promise.all(
          deliverableIds.map((itemId) => setTaskItemLeatherDelivery(leatherTask.id, itemId, true))
        );
        showSuccess(`Cuero entregado para ${deliverableIds.length} producto(s).`);
        await loadTasks();
      }
      setShowLeatherModal(false);
      setLeatherTask(null);
      setSelectedLeatherItems([]);
      setLeatherSelectionCount("");
    } catch (err) {
      showError(err.message || "No se pudo registrar la entrega de cuero");
    } finally {
      setSavingLeatherItems(false);
    }
  };

  const handleScheduleField = async (taskId, field, value) => {
    try {
      const data = { [field]: value || null };
      const updated = await scheduleTask(taskId, data);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      showSuccess("Actualizado");
    } catch (err) {
      showError(err.message);
    }
  };

  const handleAutoAssignDesk = async (taskId) => {
    const centerTasks = buildTableCenterTasks(tasks, productionOrders);
    const task = centerTasks.find((t) => t.id === taskId);
    const targetDate = task?.scheduledDate || new Date().toISOString().split("T")[0];

    let bestDesk = 1;
    let bestLoad = Infinity;

    for (let d = 1; d <= numDesks; d++) {
      const load = centerTasks
        .filter((t) => t.desk === d && t.scheduledDate === targetDate && t.status !== "CANCELLED" && t.status !== "COMPLETED")
        .reduce((sum, t) => sum + getTaskBaseHours(t), 0);
      if (load < bestLoad) {
        bestLoad = load;
        bestDesk = d;
      }
    }

    try {
      const data = { desk: bestDesk };
      if (!task?.scheduledDate) {
        data.scheduledDate = targetDate;
      }
      const updated = await scheduleTask(taskId, data);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      showSuccess(`Asignada a Mesa ${bestDesk} (${(bestLoad).toFixed(1)}h carga)`);
    } catch (err) {
      showError(err.message);
    }
  };

  const openDaySaleModal = async (task) => {
    if (!task?.id) return;
    try {
      setLoadingDaySaleCandidates(true);
      setDaySaleTask(task);
      setShowDaySaleModal(true);
      setSelectedDaySaleItems([]);
      const candidates = await getDaySaleCandidates(task.id);
      setDaySaleCandidates(candidates || []);
    } catch (err) {
      showError(err.message || "No se pudieron cargar productos de venta del dia");
      setShowDaySaleModal(false);
    } finally {
      setLoadingDaySaleCandidates(false);
    }
  };

  const toggleDaySaleItem = (productionOrderItemId) => {
    setSelectedDaySaleItems((prev) =>
      prev.includes(productionOrderItemId)
        ? prev.filter((id) => id !== productionOrderItemId)
        : [...prev, productionOrderItemId]
    );
  };

  const handleAddDaySaleItems = async () => {
    if (!daySaleTask?.id || selectedDaySaleItems.length === 0) {
      showError("Seleccione al menos un producto para agregar.");
      return;
    }
    try {
      setSavingDaySaleItems(true);
      const updated = await addDaySaleItemsToTask(daySaleTask.id, selectedDaySaleItems);
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      showSuccess(`Se agregaron ${selectedDaySaleItems.length} producto(s) de venta del dia.`);
      setShowDaySaleModal(false);
      setDaySaleTask(null);
      setDaySaleCandidates([]);
      setSelectedDaySaleItems([]);
    } catch (err) {
      showError(err.message || "No se pudieron agregar productos de venta del dia");
    } finally {
      setSavingDaySaleItems(false);
    }
  };

  const clearFilters = () => {
    setFilterDesk("");
    setFilterDate("");
    setFilterStatus("all");
    setFilterDieCut("all");
    setFilterProductionOrderId("");
    setSearchTerm("");
  };

  // ==================== COMPUTED ====================

  /** Tareas visibles en centro de producción (mesas): sin OPC/cinchos ni líneas cincho. */
  const tableCenterTasks = useMemo(
    () => buildTableCenterTasks(tasks, productionOrders),
    [tasks, productionOrders]
  );

  const ordersForDownload = useMemo(
    () => mergeOrdersForDownload(productionOrders, productionOrdersForCinchos),
    [productionOrders, productionOrdersForCinchos]
  );

  const uniqueDesks = useMemo(
    () => [...new Set(tableCenterTasks.map((t) => t.desk).filter(Boolean))].sort((a, b) => a - b),
    [tableCenterTasks]
  );

  const uniqueDates = useMemo(
    () => [...new Set(tableCenterTasks.map((t) => t.scheduledDate).filter(Boolean))].sort(),
    [tableCenterTasks]
  );

  const productionOrderFilterOptions = useMemo(() => {
    const map = new Map();
    (productionOrdersForFilter || []).forEach((o) => {
      if (o?.id != null) map.set(Number(o.id), o);
    });
    (tasks || []).forEach((t) => {
      if (t?.productionOrderId == null) return;
      const id = Number(t.productionOrderId);
      if (!map.has(id)) {
        map.set(id, {
          id: t.productionOrderId,
          code: t.productionOrderCode,
        });
      }
    });
    return Array.from(map.values()).sort(
      (a, b) => Number(b.id || 0) - Number(a.id || 0) || (a.code || "").localeCompare(b.code || "")
    );
  }, [productionOrdersForFilter, tasks]);

  const productionOrderSelectOptions = useMemo(() => (
    productionOrderFilterOptions.map((o) => {
      const counts = countPlannedItemsForOrder(tasks, o);
      const tableSuffix = counts.total > 0 ? ` (${counts.onTable}/${counts.total} en mesa)` : "";
      const pendingSuffix = counts.pending > 0 ? ` · ${counts.pending} pend.` : "";
      const status = String(o.status || "").toUpperCase();
      const statusSuffix = status === "DRAFT"
        ? " [BORRADOR]"
        : status && !["PENDING", "IN_PROGRESS", "DRAFT"].includes(status)
          ? ` [${status}]`
          : "";
      return {
        value: String(o.id),
        label: `${formatProductionOrderSelectLabel(o)}${tableSuffix}${pendingSuffix}${statusSuffix}`,
        searchText: [
          o.code,
          o.customerName,
          o.sellerName,
          o.orderType,
          o.distributionNumber,
          o.originLabel,
        ].filter(Boolean).join(" ").toLowerCase(),
      };
    })
  ), [productionOrderFilterOptions, tasks]);

  const selectedProductionOrderOption = useMemo(
    () => productionOrderSelectOptions.find((o) => o.value === String(filterProductionOrderId)) || null,
    [productionOrderSelectOptions, filterProductionOrderId]
  );

  const filterProductionOrderOption = useCallback((option, rawInput) => {
    if (!rawInput) return true;
    const q = rawInput.toLowerCase().trim();
    const haystack = `${option.data.searchText || ""} ${option.label || ""}`.toLowerCase();
    return haystack.includes(q);
  }, []);

  const filteredOrderForView = useMemo(() => {
    if (!filterProductionOrderId) return null;
    return productionOrderFilterOptions.find((o) => Number(o.id) === Number(filterProductionOrderId)) || null;
  }, [filterProductionOrderId, productionOrderFilterOptions]);

  const filteredOrderPendingItems = useMemo(() => {
    if (!filteredOrderForView) return [];
    return getPendingTableCenterItems(tasks, filteredOrderForView);
  }, [filteredOrderForView, tasks]);

  const filteredTasks = useMemo(() => {
    return tableCenterTasks.filter((task) => {
      if (filterProductionOrderId && Number(task.productionOrderId) !== Number(filterProductionOrderId)) {
        return false;
      }
      if (filterDesk && task.desk !== parseInt(filterDesk)) return false;
      if (filterDate && task.scheduledDate !== filterDate) return false;
      if (filterStatus !== "all" && task.status !== filterStatus) return false;
      if (filterDieCut === "yes" && !task.dieCutReady) return false;
      if (filterDieCut === "no" && task.dieCutReady) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const itemsText = (task.items || []).map(i => `${i.productCode || ""} ${i.productName || ""} ${i.colorName || ""}`).join(" ");
        const searchable = `${task.code || ""} ${task.productionOrderCode || ""} ${task.productName || ""} ${task.productCode || ""} ${task.colorName || ""} ${itemsText}`.toLowerCase();
        if (!searchable.includes(term)) return false;
      }
      return true;
    });
  }, [tableCenterTasks, filterProductionOrderId, filterDesk, filterDate, filterStatus, filterDieCut, searchTerm]);

  // "Pendientes de asignar" deben ser solo tareas activas sin mesa (no incluir COMPLETED/CANCELLED).
  // Cuando una tarea se completa, se limpia desk para liberar capacidad, pero queda el historial en workedDesk.
  const unassignedTasks = useMemo(
    () => tableCenterTasks.filter(
      (t) => !t.desk
        && t.status !== "CANCELLED"
        && t.status !== "COMPLETED"
        && t.status !== "AWAITING_WAREHOUSE"
    ),
    [tableCenterTasks]
  );

  const awaitingWarehouseTasks = useMemo(
    () => tableCenterTasks.filter((t) => t.status === "AWAITING_WAREHOUSE"),
    [tableCenterTasks]
  );

  const scheduleByDate = useMemo(() => {
    const map = {};
    filteredTasks
      .filter((t) => t.desk && t.scheduledDate)
      .forEach((task) => {
        const date = task.scheduledDate;
        if (!map[date]) map[date] = {};
        const desk = task.desk;
        if (!map[date][desk]) map[date][desk] = [];
        map[date][desk].push(task);
      });
    return map;
  }, [filteredTasks]);

  const supervisorMapForDate = useCallback(
    (dateYmd) => (dateYmd ? deskSupervisorsByDate[dateYmd] : null) || {},
    [deskSupervisorsByDate]
  );

  const openPrintForTask = (task) => {
    const dateKey = task.scheduledDate || getTodayYmdGuatemala();
    setPrintSupervisorByDesk(supervisorMapForDate(dateKey));
    setPrintBatchTaskIds(null);
    setPrintTaskId(task.id);
  };

  const openPrintBoletasForDate = (date) => {
    setPrintTaskId(null);
    setPrintSupervisorByDesk(supervisorMapForDate(date));
    const ids = getOrganizerDayBoletaTasks(tableCenterTasks, date)
      .map((t) => t.id)
      .filter(Boolean);
    if (!ids.length) {
      showError("No hay boletas del organizador (con mesa) para esta fecha.");
      return;
    }
    setPrintBatchTaskIds(ids);
  };

  const closePrintModal = () => {
    setPrintTaskId(null);
    setPrintBatchTaskIds(null);
    setPrintSupervisorByDesk(null);
  };

  const scheduleDateKeysStr = useMemo(
    () => Object.keys(scheduleByDate || {}).sort().join(","),
    [scheduleByDate]
  );

  const cinchoRowsByDate = useMemo(() => {
    const orders = productionOrdersForCinchos || [];
    const map = {};
    const addForDate = (dateYmd) => {
      if (!dateYmd) return;
      const rows = buildCinchoDayBoardRows(orders, dateYmd);
      if (rows.length) map[dateYmd] = rows;
    };
    if (filterDate) {
      addForDate(filterDate);
      return map;
    }
    const dates = new Set(Object.keys(scheduleByDate || {}));
    dates.add(getTodayYmdGuatemala());
    orders.forEach((order) => {
      const anchor = orderWorkAnchorYmd(order);
      if (anchor) dates.add(anchor);
    });
    [...dates].forEach(addForDate);
    return map;
  }, [productionOrdersForCinchos, scheduleByDate, filterDate]);

  const pendingCinchoRowsByDate = useMemo(() => {
    const map = {};
    Object.entries(cinchoRowsByDate).forEach(([date, rows]) => {
      const pending = filterPendingCinchoRows(
        rows,
        cinchoDeliveredByDate[date] || {},
        cinchoWorkStatusByDate[date] || {}
      );
      if (pending.length) map[date] = pending;
    });
    return map;
  }, [cinchoRowsByDate, cinchoDeliveredByDate, cinchoWorkStatusByDate]);

  const scheduleViewDates = useMemo(() => {
    const dateHasVisibleWork = (date) => {
      if (Object.keys(scheduleByDate[date] || {}).length > 0) return true;
      if ((pendingCinchoRowsByDate[date] || []).length > 0) return true;
      if (
        cinchoStatusLoadingByDate[date]
        && (cinchoRowsByDate[date] || []).length > 0
      ) {
        return true;
      }
      return false;
    };

    if (filterDate) {
      return dateHasVisibleWork(filterDate) ? [filterDate] : [];
    }

    const dates = new Set(Object.keys(scheduleByDate || {}));
    Object.keys(cinchoRowsByDate).forEach((d) => dates.add(d));
    return [...dates].filter(dateHasVisibleWork).sort();
  }, [
    scheduleByDate,
    cinchoRowsByDate,
    pendingCinchoRowsByDate,
    cinchoStatusLoadingByDate,
    filterDate,
  ]);

  const refreshCinchoDayStatusesForDates = useCallback(async (dateStrList) => {
    const unique = [...new Set(dateStrList)].filter(Boolean);
    if (!unique.length) return;
    setCinchoStatusLoadingByDate((prev) => {
      const next = { ...prev };
      unique.forEach((d) => {
        next[d] = true;
      });
      return next;
    });
    await Promise.all(
      unique.map(async (d) => {
        try {
          const res = await getCinchoDayStatuses(d);
          setCinchoDeliveredByDate((prev) => ({
            ...prev,
            [d]: deliveredStatusMapFromApi(res),
          }));
          setCinchoWorkStatusByDate((prev) => ({
            ...prev,
            [d]: workStatusMapFromApi(res),
          }));
        } catch {
          // ignore per-date errors
        } finally {
          setCinchoStatusLoadingByDate((prev) => ({ ...prev, [d]: false }));
        }
      })
    );
  }, []);

  const handleCinchoWorkStatusChange = async (row, workStatus, workDateYmd) => {
    const workDate =
      workDateYmd || filterDate || orderWorkAnchorYmd(row.order);
    if (!workDate) return;
    setCinchoSavingKey(row.key);
    try {
      await setCinchoDayWorkStatus({
        workDate,
        productionOrderId: row.productionOrderId,
        productionOrderItemId: row.productionOrderItemId,
        workStatus,
      });
      setCinchoWorkStatusByDate((prev) => {
        const map = { ...(prev[workDate] || {}) };
        map[row.productionOrderItemId] = workStatus;
        map[String(row.productionOrderItemId)] = workStatus;
        return { ...prev, [workDate]: map };
      });
    } catch (e) {
      showError(e.message || "No se pudo guardar el estado de la línea");
    } finally {
      setCinchoSavingKey(null);
    }
  };

  const handleToggleCinchoDelivered = async (row, delivered, workDateYmd) => {
    const workDate =
      workDateYmd || filterDate || orderWorkAnchorYmd(row.order);
    if (!workDate) return;
    setCinchoSavingKey(row.key);
    try {
      await setCinchoDayDelivered({
        workDate,
        productionOrderId: row.productionOrderId,
        productionOrderItemId: row.productionOrderItemId,
        delivered,
      });
      setCinchoDeliveredByDate((prev) => {
        const map = { ...(prev[workDate] || {}) };
        map[row.productionOrderItemId] = delivered;
        map[String(row.productionOrderItemId)] = delivered;
        return { ...prev, [workDate]: map };
      });
    } catch (e) {
      showError(e.message || "No se pudo guardar el estado de entregado");
    } finally {
      setCinchoSavingKey(null);
    }
  };

  useEffect(() => {
    const dates = new Set();
    dates.add(getTodayYmdGuatemala());
    if (filterDate) dates.add(filterDate);
    if (viewMode === "redistribute" && redistributeDate) dates.add(redistributeDate);
    if (viewMode === "schedule" && scheduleDateKeysStr) {
      scheduleDateKeysStr.split(",").filter(Boolean).forEach((d) => dates.add(d));
    }
    if (viewMode === "schedule") {
      Object.keys(cinchoRowsByDate).forEach((d) => dates.add(d));
    }
    const dateList = [...dates];
    refreshDeskSupervisorsForDates(dateList);
    refreshCinchoDayStatusesForDates(dateList);
  }, [
    filterDate,
    viewMode,
    redistributeDate,
    scheduleDateKeysStr,
    cinchoRowsByDate,
    refreshDeskSupervisorsForDates,
    refreshCinchoDayStatusesForDates,
  ]);

  const printWorkDateYmd = filterDate || getTodayYmdGuatemala();

  const organizerDayDeskTasks = useMemo(
    () => getOrganizerDayDeskTasks(tableCenterTasks, printWorkDateYmd),
    [tableCenterTasks, printWorkDateYmd]
  );

  const tasksSheetPrintModel = useMemo(() => {
    return buildProductionTasksSheetPrintModel(organizerDayDeskTasks, productionOrders, {
      workDateYmd: printWorkDateYmd,
      deskSupervisorByDesk: supervisorMapForDate(printWorkDateYmd),
      numDesksForLegend: workingDesksCount,
    });
  }, [organizerDayDeskTasks, productionOrders, supervisorMapForDate, workingDesksCount, printWorkDateYmd]);

  const handlePrintTasksSheet = useCallback(() => {
    openProductionTasksSheetPrintWindow(
      tasksSheetPrintModel,
      `Hoja de mesas — organizador ${formatDateGt(printWorkDateYmd)}`
    );
  }, [tasksSheetPrintModel, printWorkDateYmd]);

  const handleExcelTasksSheet = useCallback(() => {
    downloadProductionTasksSheetExcel(
      tasksSheetPrintModel,
      `hoja_mesas_${String(printWorkDateYmd).replace(/-/g, "")}.xlsx`
    );
  }, [tasksSheetPrintModel, printWorkDateYmd]);

  const supervisorMapForUi = useMemo(
    () => supervisorMapForDate(filterDate || getTodayYmdGuatemala()),
    [supervisorMapForDate, filterDate]
  );

  const openDeskSupervisorsModal = async () => {
    const d = filterDate || getTodayYmdGuatemala();
    setDeskSupervisorModalDate(d);
    try {
      const [countRes, supRes] = await Promise.all([getDeskCountForDate(d), getDeskSupervisorsForDate(d)]);
      const count = Number(countRes?.numDesks ?? 12);
      setDeskCountDraft(count);
      setDeskSupervisorDraft(
        normalizeSupervisorRowsForCount(
          (supRes.assignments || []).map((a) => ({ desk: a.desk, supervisorName: a.supervisorName || "" })),
          count
        )
      );
      setShowDeskSupervisorsModal(true);
    } catch (e) {
      showError(e.message || "No se pudieron cargar encargados");
    }
  };

  const saveDeskSupervisorsModal = async () => {
    try {
      setSavingDeskSupervisors(true);
      const nextCount = Math.max(1, Math.min(32, Number(deskCountDraft) || 1));
      await replaceDeskCountForDate(deskSupervisorModalDate, nextCount);
      // Ajustar draft a 1..N (evitar enviar mesas fuera de rango)
      const normalizedDraft = normalizeSupervisorRowsForCount(deskSupervisorDraft, nextCount);
      const body = normalizedDraft.map((r) => ({
        desk: Number(r.desk),
        supervisorName: (r.supervisorName || "").trim(),
      }));
      await replaceDeskSupervisorsForDate(deskSupervisorModalDate, body);
      const toRefresh = new Set([
        deskSupervisorModalDate,
        getTodayYmdGuatemala(),
        filterDate,
        ...scheduleViewDates,
        ...Object.keys(deskSupervisorsByDate),
      ].filter(Boolean));
      await refreshDeskSupervisorsForDates([...toRefresh]);
      await loadDesksCount();
      showSuccess("Configuración de mesas guardada. Aplica desde esta fecha en adelante hasta un nuevo cambio.");
      setShowDeskSupervisorsModal(false);
    } catch (e) {
      showError(e.message || "No se pudieron guardar");
    } finally {
      setSavingDeskSupervisors(false);
    }
  };

  const stats = useMemo(() => {
    const active = tableCenterTasks.filter((t) => t.status !== "CANCELLED" && t.status !== "COMPLETED");
    const pending = active.filter((t) => t.status === "PENDING").length;
    const inProgress = active.filter((t) => t.status === "IN_PROGRESS").length;
    const dieCut = active.filter((t) => t.dieCutReady).length;
    const unassigned = active.filter((t) => !t.desk).length;
    const totalMin = active.reduce((sum, t) => sum + Math.round((t.estimatedHours || 0) * 60), 0);
    return { pending, inProgress, completed: 0, dieCut, unassigned, totalMin, total: active.length };
  }, [tableCenterTasks]);

  const daySaleModalOrderCodes = useMemo(() => {
    const unique = [...new Set((daySaleCandidates || []).map((c) => c.productionOrderCode).filter(Boolean))];
    return unique;
  }, [daySaleCandidates]);

  // ==================== HELPERS ====================

  const getStatusBadge = (status) => {
    const map = {
      PENDING: { color: "warning", text: "Pendiente" },
      IN_PROGRESS: { color: "info", text: "En Proceso" },
      AWAITING_WAREHOUSE: { color: "primary", text: "Pendiente bodega PT" },
      COMPLETED: { color: "success", text: "Completada" },
      CANCELLED: { color: "danger", text: "Cancelada" },
    };
    const info = map[status] || { color: "secondary", text: status };
    return <Badge color={info.color}>{info.text}</Badge>;
  };

  const hasPhaseReached = (task, phaseKey) => {
    const ws = task.workflowStatus || "";
    if (phaseKey === "LEATHER") {
      return Boolean(task.leatherDelivered) || [
        "PENDING_DIE_CUT",
        "PENDING_TABLE_ENTRY",
        "PENDING_MATERIAL_DELIVERY",
        "READY_TO_START",
        "IN_PRODUCTION",
        "COMPLETED",
      ].includes(ws);
    }
    if (phaseKey === "DIE_CUT") {
      return Boolean(task.dieCutReady) || [
        "PENDING_TABLE_ENTRY",
        "PENDING_MATERIAL_DELIVERY",
        "READY_TO_START",
        "IN_PRODUCTION",
        "COMPLETED",
      ].includes(ws);
    }
    if (phaseKey === "MATERIALS") {
      if (taskSkipsMaterials(task)) {
        return true;
      }
      return Boolean(task.materialsDelivered) || [
        "READY_TO_START",
        "IN_PRODUCTION",
        "COMPLETED",
      ].includes(ws);
    }
    return false;
  };

  const renderPhaseControl = (task, phaseKey, compact = false) => {
    const small = compact ? "sm" : "sm";
    const style = compact ? { padding: "1px 6px", fontSize: "10px" } : { fontSize: "11px" };

    if (phaseKey === "LEATHER") {
      const done = hasPhaseReached(task, "LEATHER");
      if (done) return <Badge color="success">Cuero OK</Badge>;
      const totalItems = (task.items || []).length;
      const deliveredItems = (task.items || []).filter((item) => item.leatherDelivered).length;
      const actionLabel = totalItems > 0 ? "Seleccionar piezas de cuero" : "Entregar cuero";
      return (
        <div className="d-flex align-items-center" style={{ gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
          <Button
            color={compact ? "outline-secondary" : "dark"}
            size={small}
            style={compact ? style : { fontWeight: 700, minWidth: 220 }}
            onClick={() => openLeatherDeliveryModal(task)}
            title="Registrar entrega de cuero por producto"
          >
            {compact ? "Cuero" : actionLabel}
          </Button>
          {totalItems > 0 && (
            <Badge
              color="light"
              className="text-dark border"
              style={{ ...BADGE_READABLE_ON_LIGHT, fontSize: compact ? "10px" : "11px", padding: compact ? "1px 6px" : undefined }}
            >
              {deliveredItems}/{totalItems}
            </Badge>
          )}
        </div>
      );
    }

    if (phaseKey === "DIE_CUT") {
      const done = hasPhaseReached(task, "DIE_CUT");
      const leatherDone = hasPhaseReached(task, "LEATHER");
      if (done) return <Badge color="success">Troquel OK</Badge>;
      return (
        <Button
          color="outline-secondary"
          size={small}
          style={style}
          onClick={() => handleDieCutToggle(task.id, false)}
          title={!leatherDone ? "Aviso: cuero aún no registrado; puede marcar troquel si ya aplica" : "Registrar troquelado"}
        >
          Marcar troquel
        </Button>
      );
    }

    const done = hasPhaseReached(task, "MATERIALS");
    if (taskSkipsMaterials(task)) return <Badge color="info">No requiere</Badge>;
    if (done) return <Badge color="success">Materiales OK</Badge>;
    return <Badge color="warning">Pendiente en Vista Materiales</Badge>;
  };

  const renderStatusActions = (task, compact = false) => {
    if (task.status === "AWAITING_WAREHOUSE") {
      return (
        <Badge color="primary" style={{ fontSize: compact ? "10px" : "11px", whiteSpace: "normal" }}>
          Pendiente bodega PT
        </Badge>
      );
    }
    if (task.status === "COMPLETED" || task.status === "CANCELLED") {
      return getStatusBadge(task.status);
    }

    const buttonSize = "sm";
    const commonStyle = compact
      ? { fontSize: "10px", padding: "1px 4px", height: "22px" }
      : { fontSize: "11px", padding: "2px 6px" };

    if (task.status === "PENDING") {
      return (
        <div className="d-flex align-items-center" style={{ gap: 4, flexWrap: "wrap" }}>
          <Button
            color="info"
            size={buttonSize}
            style={commonStyle}
            onClick={() => handleStatusChange(task.id, "IN_PROGRESS")}
            title="Iniciar tarea (puede iniciar sin esperar otros estados)"
          >
            Iniciar
          </Button>
          <Button
            color="danger"
            outline
            size={buttonSize}
            style={commonStyle}
            onClick={() => handleStatusChange(task.id, "CANCELLED")}
            title="Cancelar tarea"
          >
            Cancelar
          </Button>
        </div>
      );
    }

    if (task.status === "IN_PROGRESS") {
      return (
        <div className="d-flex align-items-center" style={{ gap: 4, flexWrap: "wrap" }}>
          <Button
            color="secondary"
            outline
            size={buttonSize}
            style={commonStyle}
            onClick={() => openEditStartedAt(task)}
            title="Editar hora de inicio"
          >
            Hora
          </Button>
          <Button
            color="success"
            size={buttonSize}
            style={commonStyle}
            onClick={() => handleStatusChange(task.id, "COMPLETED")}
            title="Completar tarea"
          >
            Completar
          </Button>
          <Button
            color="warning"
            outline
            size={buttonSize}
            style={commonStyle}
            onClick={() => handleStatusChange(task.id, "PENDING")}
            title="Pausar y volver a pendiente"
          >
            Pausar
          </Button>
        </div>
      );
    }

    return getStatusBadge(task.status);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    const d = new Date(dateStr + "T00:00:00");
    const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return `${days[d.getDay()]} ${formatDateGt(dateStr)}`;
  };

  const deskOptions = [];
  for (let i = 1; i <= numDesks; i++) deskOptions.push(i);

  const getTaskItems = (task) =>
    task.items && task.items.length > 0
      ? task.items
      : [{ productCode: task.productCode, productName: task.productName, colorName: task.colorName, quantity: task.quantity }];

  const renderTaskItems = (task, showName = true) => {
    const items = getTaskItems(task);
    return items.map((item, i) => (
      <div key={i} style={{ fontSize: "11px", lineHeight: "1.3" }}>
        <strong>{item.productCode}</strong>
        {showName && item.productName && <span className="text-muted"> {item.productName}</span>}
        {item.colorName && <Badge color="dark" className="ml-1" style={{ fontSize: "9px" }}>{item.colorName}</Badge>}
        {item.daySaleExtra && <Badge color="warning" className="ml-1" style={{ fontSize: "9px" }}>DIA</Badge>}
        {items.length > 1 && <span className="text-muted"> ×{item.quantity}</span>}
      </div>
    ));
  };

  const renderTaskTimeBadge = (task) => {
    const totalMin = Math.round((task.estimatedHours || 0) * 60);
    const extraMin = Math.round(getTaskExtraHours(task) * 60);
    const baseMin = Math.max(totalMin - extraMin, 0);
    const tone =
      baseMin >= 210 ? "danger" :
      baseMin >= 120 ? "warning" : "success";
    return (
      <Badge
        color={tone}
        className="font-weight-bold"
        style={{
          fontSize: "10px",
          color: "#111827",
          border: "1px solid rgba(0,0,0,0.12)",
          backgroundColor: tone === "danger" ? "#fecaca" : tone === "warning" ? "#fef3c7" : "#bbf7d0",
        }}
        title="Base 4h + extra venta del dia"
      >
        {extraMin > 0 ? `${baseMin}+${extraMin}min` : `${baseMin}min`}
      </Badge>
    );
  };

  // ==================== RENDER ====================

  return (
    <div className="content">
      {/* ========== STATS ========== */}
      <Row className="mb-3">
        <Col>
          <Card className="mb-0">
            <CardBody className="py-2">
              <div className="d-flex justify-content-around text-center flex-wrap">
                <div className="px-3">
                  <small className="text-muted d-block">Sin Asignar</small>
                  <strong style={{ fontSize: "20px", color: stats.unassigned > 0 ? "#e74c3c" : "#28a745" }}>
                    {stats.unassigned}
                  </strong>
                </div>
                <div className="px-3">
                  <small className="text-muted d-block">Pendientes</small>
                  <strong style={{ fontSize: "20px", color: "#ffc107" }}>{stats.pending}</strong>
                </div>
                <div className="px-3">
                  <small className="text-muted d-block">En Proceso</small>
                  <strong style={{ fontSize: "20px", color: "#17a2b8" }}>{stats.inProgress}</strong>
                </div>
                <div className="px-3">
                  <small className="text-muted d-block">Completadas</small>
                  <strong style={{ fontSize: "20px", color: "#28a745" }}>{stats.completed}</strong>
                </div>
                <div className="px-3">
                  <small className="text-muted d-block">✂️ Troqueladas</small>
                  <strong style={{ fontSize: "20px" }}>{stats.dieCut}/{stats.total}</strong>
                </div>
                <div className="px-3">
                  <small className="text-muted d-block">Tiempo Total</small>
                  <strong style={{ fontSize: "20px" }}>
                    {stats.totalMin} min
                  </strong>
                </div>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* ========== MAIN CARD ========== */}
      <Row>
        <Col>
          <Card>
            <CardHeader className="pb-3">
              <div className="d-flex flex-wrap align-items-center justify-content-between mb-3" style={{ gap: 12 }}>
                <CardTitle tag="h4" className="mb-0">
                  <i className="nc-icon nc-layout-11 mr-1" />
                  Estación de Tareas
                </CardTitle>
                <div className="btn-group mb-0 flex-shrink-0" role="group" aria-label="Vista del tablero">
                    <Button
                      color={viewMode === "operation" ? "danger" : "outline-secondary"}
                      size="sm"
                      onClick={() => setViewMode("operation")}
                    >
                      <i className="nc-icon nc-settings-gear-65 mr-1" />
                      Operación del día
                      {stats.unassigned > 0 && (
                        <Badge color="light" className="ml-1 text-dark">{stats.unassigned}</Badge>
                      )}
                    </Button>
                    <Button
                      color={viewMode === "schedule" ? "primary" : "outline-secondary"}
                      size="sm"
                      onClick={() => setViewMode("schedule")}
                    >
                      <i className="nc-icon nc-calendar-60 mr-1" />
                      Cronograma
                    </Button>
                    <Button
                      color={viewMode === "redistribute" ? "warning" : "outline-secondary"}
                      size="sm"
                      onClick={() => setViewMode("redistribute")}
                      title="Mover productos entre mesas y fechas"
                    >
                      <i className="nc-icon nc-send mr-1" />
                      Redistribuir
                    </Button>
                </div>
              </div>

              <div
                className="d-flex flex-wrap align-items-center"
                style={{ gap: 10 }}
                role="toolbar"
                aria-label="Acciones de estación"
              >
                <div
                  className="d-flex flex-wrap align-items-center px-2 py-1"
                  style={{ gap: 6, background: "#f8f9fa", borderRadius: 6, border: "1px solid #e9ecef" }}
                >
                  <span className="text-muted text-uppercase font-weight-bold" style={{ fontSize: 10, letterSpacing: "0.05em" }}>
                    Ir a
                  </span>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    className="mb-0"
                    onClick={() => navigate("/admin/leather-inventory?openDelivery=1")}
                    title="Entrega de cuero"
                  >
                    <i className="nc-icon nc-ruler-pencil mr-1" />
                    Cuero
                  </Button>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    className="mb-0"
                    onClick={() => navigate("/admin/materials-tasks")}
                    title="Entrega de materiales"
                  >
                    <i className="nc-icon nc-box-2 mr-1" />
                    Materiales
                  </Button>
                </div>

                <div
                  className="d-flex flex-wrap align-items-center px-2 py-1"
                  style={{ gap: 6, background: "#f8f9fa", borderRadius: 6, border: "1px solid #e9ecef" }}
                >
                  <span className="text-muted text-uppercase font-weight-bold" style={{ fontSize: 10, letterSpacing: "0.05em" }}>
                    Ayuda
                  </span>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    className="mb-0"
                    onClick={() => setShowQuickGuide(true)}
                    title="Guía paso a paso"
                  >
                    <i className="nc-icon nc-bulb-63 mr-1" />
                    Guía rápida
                  </Button>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    className="mb-0"
                    onClick={handlePrintTasksSheet}
                    disabled={loading}
                    title="PDF solo con tareas del organizador (mesa + fecha de trabajo)"
                  >
                    <i className="nc-icon nc-paper mr-1" />
                    Hoja PDF
                  </Button>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    className="mb-0"
                    onClick={handleExcelTasksSheet}
                    disabled={loading}
                    title="Excel solo con tareas del organizador (mesa + fecha de trabajo)"
                  >
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    Hoja Excel
                  </Button>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    className="mb-0"
                    onClick={() => setShowDownloadOpsModal(true)}
                    disabled={loading || organizerDayDeskTasks.length === 0}
                    title="Imprimir/Excel de OPs solo con líneas del organizador del día"
                  >
                    <i className="nc-icon nc-single-copy-04 mr-1" />
                    Descargar OPs
                  </Button>
                </div>

                <div
                  className="d-flex flex-wrap align-items-center px-2 py-1"
                  style={{ gap: 6, background: "#f8f9fa", borderRadius: 6, border: "1px solid #e9ecef" }}
                >
                  <span className="text-muted text-uppercase font-weight-bold" style={{ fontSize: 10, letterSpacing: "0.05em" }}>
                    Mesa
                  </span>
                  <Button
                    color="primary"
                    outline
                    size="sm"
                    className="mb-0"
                    onClick={openDeskSupervisorsModal}
                    disabled={loading}
                    title="Encargados por mesa (vigentes desde la fecha elegida)"
                  >
                    <i className="nc-icon nc-badge mr-1" />
                    Encargados
                  </Button>
                  <Button color="info" size="sm" className="mb-0" onClick={loadTasks} disabled={loading}>
                    <i className="nc-icon nc-refresh-69 mr-1" />
                    Actualizar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {deskConfigWarning && <Alert color="warning" className="mb-2">{deskConfigWarning}</Alert>}
              <Card className="mb-3" style={{ border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                <CardBody className="py-2">
                  <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: 8 }}>
                    <span style={{ fontSize: 13 }}>
                      <strong>Las tareas se arman en el Organizador de Tareas</strong>
                      <span className="text-muted"> — busca OPs, suma productos hasta las {MAX_HOURS_PER_DESK}h (extras OPL encima) y crea la tarea; luego asígnala a mesa aquí o en su tablero.</span>
                    </span>
                    <Button
                      color="success"
                      size="sm"
                      className="mb-0"
                      onClick={() => navigate("/admin/task-organizer")}
                    >
                      <i className="nc-icon nc-simple-add mr-1" /> Ir al Organizador de Tareas
                    </Button>
                  </div>
                </CardBody>
              </Card>

              <Row className="mb-3 align-items-end">
                <Col md="4">
                  <FormGroup className="mb-0">
                    <Label><small>Orden de producción</small></Label>
                    <Select
                      className="react-select"
                      classNamePrefix="react-select"
                      placeholder="Buscar OP por código, cliente..."
                      isClearable
                      isSearchable
                      filterOption={filterProductionOrderOption}
                      options={productionOrderSelectOptions}
                      value={selectedProductionOrderOption}
                      onChange={(selected) => setFilterProductionOrderId(selected ? selected.value : "")}
                      styles={{
                        control: (base) => ({ ...base, minHeight: 31, fontSize: 13 }),
                        valueContainer: (base) => ({ ...base, padding: "0 8px" }),
                        input: (base) => ({ ...base, margin: 0, padding: 0 }),
                        indicatorsContainer: (base) => ({ ...base, height: 29 }),
                      }}
                      noOptionsMessage={() => "Sin coincidencias"}
                    />
                  </FormGroup>
                </Col>
                <Col md="8">
                  {filteredOrderForView && filteredOrderPendingItems.length > 0 && (
                    <Alert color="warning" className="mb-0 py-2" style={{ fontSize: 13 }}>
                      <div className="d-flex flex-wrap align-items-center justify-content-between" style={{ gap: 8 }}>
                        <span>
                          <strong>{filteredOrderForView.code}</strong>
                          {" — "}
                          {filteredOrderPendingItems.length} producto
                          {filteredOrderPendingItems.length !== 1 ? "s" : ""} sin tarea en mesas
                          {filteredOrderPendingItems.length <= 3 && (
                            <span className="text-muted">
                              {": "}
                              {filteredOrderPendingItems.map((it) => it.productName || it.productCode).join(", ")}
                            </span>
                          )}
                        </span>
                        <Button
                          color="success"
                          size="sm"
                          onClick={() => navigate("/admin/task-organizer")}
                        >
                          Armar tarea en el Organizador
                        </Button>
                      </div>
                    </Alert>
                  )}
                  {filteredOrderForView && filteredOrderPendingItems.length === 0 && (
                    <Alert color="success" className="mb-0 py-2" style={{ fontSize: 13 }}>
                      <strong>{filteredOrderForView.code}</strong>
                      {" — todos los productos elegibles ya tienen tarea en mesas."}
                    </Alert>
                  )}
                </Col>
              </Row>

              {/* ========== FILTERS ========== */}
              {(viewMode === "schedule" || (viewMode === "operation" && showDetailedList)) && (
                <Row className="mb-3">
                  <Col md="3">
                    <FormGroup className="mb-0">
                      <Label><small>Buscar</small></Label>
                      <Input
                        type="search"
                        bsSize="sm"
                        placeholder="Código, producto, orden..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </FormGroup>
                  </Col>
                  <Col md="2">
                    <FormGroup className="mb-0">
                      <Label><small>Mesa</small></Label>
                      <Input type="select" bsSize="sm" value={filterDesk} onChange={(e) => setFilterDesk(e.target.value)}>
                        <option value="">Todas</option>
                        {uniqueDesks.map((d) => (
                          <option key={d} value={d}>
                            {deskDisplayLabel(d, supervisorMapForUi)}
                          </option>
                        ))}
                      </Input>
                    </FormGroup>
                  </Col>
                  <Col md="2">
                    <FormGroup className="mb-0">
                      <Label><small>Fecha</small></Label>
                      <Input type="select" bsSize="sm" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
                        <option value="">Todas</option>
                        {uniqueDates.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
                      </Input>
                    </FormGroup>
                  </Col>
                  <Col md="2">
                    <FormGroup className="mb-0">
                      <Label><small>Estado</small></Label>
                      <Input type="select" bsSize="sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                        <option value="all">Todos</option>
                        <option value="PENDING">Pendiente</option>
                        <option value="IN_PROGRESS">En Proceso</option>
                        <option value="COMPLETED">Completada</option>
                        <option value="CANCELLED">Cancelada</option>
                      </Input>
                    </FormGroup>
                  </Col>
                  <Col md="2">
                    <FormGroup className="mb-0">
                      <Label><small>Troquelado</small></Label>
                      <Input type="select" bsSize="sm" value={filterDieCut} onChange={(e) => setFilterDieCut(e.target.value)}>
                        <option value="all">Todos</option>
                        <option value="yes">✂️ Troquelados</option>
                        <option value="no">Sin troquelar</option>
                      </Input>
                    </FormGroup>
                  </Col>
                  <Col md="1" className="d-flex align-items-end">
                    <Button
                      color="secondary"
                      size="sm"
                      block
                      title="Limpiar Filtros"
                      onClick={clearFilters}
                    >
                      <i className="nc-icon nc-simple-remove" />
                    </Button>
                  </Col>
                </Row>
              )}

              {loading ? (
                <div className="text-center py-4"><p>Cargando tareas...</p></div>
              ) : tableCenterTasks.length === 0 ? (
                <div className="text-center py-5">
                  <i className="nc-icon nc-box-2" style={{ fontSize: "48px", color: "#ccc" }} />
                  <p className="mt-2 text-muted">
                    No hay tareas para el centro de producción (mesas). Las líneas de cinchos (OPL, OPCK y OPC) aparecen en la mesa cinchos del cronograma.
                  </p>
                </div>
              ) : (
                <>
                  {/* ============================================================ */}
                  {/* ============ UNASSIGNED VIEW ============ */}
                  {/* ============================================================ */}
                  {viewMode === "operation" && (
                    <div>
                      {awaitingWarehouseTasks.length > 0 && (
                        <>
                          <Alert color="info" className="py-2">
                            <strong>Pendiente bodega PT ({awaitingWarehouseTasks.length}):</strong>{" "}
                            trabajo terminado en mesa; el ciclo se cierra cuando Michelle recibe la pieza en bodega.
                          </Alert>
                          <Row className="mb-3">
                            {awaitingWarehouseTasks.map((task) => (
                              <Col key={task.id} md="6" xl="4" className="mb-3">
                                <Card style={{ border: "1px solid #b8daff", backgroundColor: "#f0f7ff" }}>
                                  <CardBody className="py-3">
                                    <div className="d-flex justify-content-between align-items-start mb-2">
                                      <div>
                                        <Badge color="dark" className="mr-1">{task.code}</Badge>
                                        <Badge color="primary">Pendiente bodega PT</Badge>
                                      </div>
                                      {getStatusBadge(task.status)}
                                    </div>
                                    <div style={{ fontSize: 13, fontWeight: 600 }}>{task.productionOrderCode}</div>
                                    <div className="text-muted" style={{ fontSize: 12 }}>
                                      {task.productName || (task.items || []).map((i) => i.productName).filter(Boolean).join(", ")}
                                    </div>
                                    {task.workedDesk != null && (
                                      <small className="text-muted d-block mt-1">
                                        Mesa {task.workedDesk}
                                        {task.startedAt && ` · inició ${formatDateTimeGt(task.startedAt)}`}
                                      </small>
                                    )}
                                  </CardBody>
                                </Card>
                              </Col>
                            ))}
                          </Row>
                        </>
                      )}
                      {unassignedTasks.length === 0 && awaitingWarehouseTasks.length === 0 ? (
                        <div className="text-center py-4">
                          <i className="nc-icon nc-check-2" style={{ fontSize: "48px", color: "#28a745" }} />
                          <p className="mt-2 text-success">
                            <strong>¡Todas las tareas están asignadas!</strong>
                          </p>
                          <Button color="primary" size="sm" onClick={() => setViewMode("schedule")}>
                            Ver Cronograma →
                          </Button>
                        </div>
                      ) : unassignedTasks.length > 0 ? (
                        <>
                          {/* Capacity overview */}
                          <Card className="mb-3" style={{ backgroundColor: "#f8f9fa" }}>
                            <CardBody className="py-2">
                              <small className="text-muted d-block mb-2">
                                <strong>Carga base por mesa (hoy y próximos días)</strong> — Máx {MAX_HOURS_PER_DESK}h por mesa/día (sin extras de venta del dia)
                              </small>
                              <Row>
                                {deskOptions.slice(0, numDesks).map((d) => {
                                  const todayStr = filterDate || new Date().toISOString().split("T")[0];
                                  const load = tableCenterTasks
                                    .filter((t) => t.desk === d && t.scheduledDate === todayStr && t.status !== "CANCELLED")
                                    .reduce((sum, t) => sum + getTaskBaseHours(t), 0);
                                  const pct = Math.min((load / MAX_HOURS_PER_DESK) * 100, 100);
                                  const totalLoad = tableCenterTasks
                                    .filter((t) => t.desk === d && t.status !== "CANCELLED" && t.status !== "COMPLETED")
                                    .reduce((sum, t) => sum + getTaskBaseHours(t), 0);

                                  return (
                                    <Col key={d} className="text-center px-1" style={{ minWidth: "60px" }}>
                                      <small className="d-block"><strong>M{d}</strong></small>
                                      <Progress
                                        value={pct}
                                        color={pct >= 90 ? "danger" : pct >= 60 ? "warning" : "success"}
                                        style={{ height: "8px", marginBottom: "2px" }}
                                      />
                                      <small className="text-muted" style={{ fontSize: "10px" }}>
                                        {Math.round(load * 60)}min inicio
                                        {totalLoad > load && ` · ${Math.round(totalLoad * 60)}min total`}
                                      </small>
                                    </Col>
                                  );
                                })}
                              </Row>
                            </CardBody>
                          </Card>

                          <Alert color="warning" className="py-2">
                            <strong>Pendientes de asignar:</strong> elija mesa y fecha por tarjeta, o use autoasignar.
                          </Alert>
                          <Row>
                            {unassignedTasks.map((task) => (
                              <Col key={task.id} md="6" xl="4" className="mb-3">
                                <Card
                                  className="h-100"
                                  style={{
                                    border: "1px solid #ffe8a1",
                                    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                                  }}
                                >
                                  <CardBody className="py-3">
                                    <div className="d-flex justify-content-between align-items-start mb-2">
                                      <div>
                                        <Badge color="dark" className="mr-1">{task.code}</Badge>
                                        <Badge
                                          color="light"
                                          className="text-dark border"
                                          style={{ ...BADGE_READABLE_ON_LIGHT, fontSize: "11px" }}
                                        >
                                          {task.productionOrderCode}
                                        </Badge>
                                      </div>
                                      <div className="text-right">
                                        <Badge
                                          color="light"
                                          className="text-dark border"
                                          style={{ ...BADGE_READABLE_ON_LIGHT, fontSize: "10px" }}
                                        >
                                          {task.quantity} uds
                                        </Badge>
                                      </div>
                                    </div>

                                    <div className="mb-2">
                                      {renderTaskItems(task, true)}
                                    </div>

                                    <div className="d-flex align-items-center justify-content-between mb-2">
                                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                        {renderPhaseControl(task, "LEATHER", true)}
                                        {renderPhaseControl(task, "DIE_CUT", true)}
                                        {renderPhaseControl(task, "MATERIALS", true)}
                                      </div>
                                      {renderTaskTimeBadge(task)}
                                    </div>

                                    <Row className="mb-2">
                                      <Col xs="6">
                                        <Label className="mb-1"><small>Mesa</small></Label>
                                        <Input
                                          type="select"
                                          bsSize="sm"
                                          value={task.desk || ""}
                                          onChange={(e) => handleScheduleField(task.id, "desk", e.target.value ? parseInt(e.target.value) : null)}
                                        >
                                          <option value="">—</option>
                                          {deskOptions.map((d) => (
                                            <option key={d} value={d}>
                                              {deskDisplayLabel(d, supervisorMapForDate(task.scheduledDate || getTodayYmdGuatemala()))}
                                            </option>
                                          ))}
                                        </Input>
                                      </Col>
                                      <Col xs="6">
                                        <Label className="mb-1"><small>F. Inicio</small></Label>
                                        <Input
                                          type="date"
                                          bsSize="sm"
                                          value={task.scheduledDate || ""}
                                          onChange={(e) => handleScheduleField(task.id, "scheduledDate", e.target.value)}
                                        />
                                      </Col>
                                    </Row>

                                    <div className="d-flex justify-content-between align-items-center">
                                      <small className="text-muted">
                                        Hora: {task.startTime || "Auto al iniciar"}
                                      </small>
                                      <div className="d-flex" style={{ gap: 6 }}>
                                        <Button
                                          color="warning"
                                          size="sm"
                                          onClick={() => openDaySaleModal(task)}
                                          title="Agregar productos de venta del dia"
                                          style={{ fontWeight: 700 }}
                                        >
                                          + Del Dia
                                        </Button>
                                        <Button
                                          color="success"
                                          size="sm"
                                          onClick={() => handleAutoAssignDesk(task.id)}
                                          title="Asignar automáticamente a la mesa con menor carga"
                                        >
                                          <i className="nc-icon nc-send" /> Auto
                                        </Button>
                                      </div>
                                    </div>
                                  </CardBody>
                                </Card>
                              </Col>
                            ))}
                          </Row>
                          <div className="text-right mt-2">
                            <Button
                              color="info"
                              outline
                              size="sm"
                              onClick={() => setShowDetailedList((prev) => !prev)}
                            >
                              <i className="nc-icon nc-bullet-list-67 mr-1" />
                              {showDetailedList ? "Ocultar lista detallada" : "Ver lista detallada"}
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  )}

                  {/* ============================================================ */}
                  {/* ============ REDISTRIBUTE (MANUAL) VIEW ============ */}
                  {/* ============================================================ */}
                  {viewMode === "redistribute" && (
                    <RedistributeBoard
                      tasks={tableCenterTasks}
                      numDesks={workingDesksCount}
                      date={redistributeDate}
                      setDate={setRedistributeDate}
                      onMove={handleMoveTaskItem}
                      deskTitleFor={(d) => deskDisplayLabel(d, supervisorMapForDate(redistributeDate))}
                    />
                  )}

                  {/* ============================================================ */}
                  {/* ============ SCHEDULE VIEW ============ */}
                  {/* ============================================================ */}
                  {viewMode === "schedule" && (
                    <div>
                      {scheduleViewDates.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-muted">No hay tareas programadas con los filtros actuales.</p>
                          {unassignedTasks.length > 0 && (
                            <Button color="warning" size="sm" onClick={() => setViewMode("operation")}>
                              Ver {unassignedTasks.length} tarea(s) sin asignar →
                            </Button>
                          )}
                        </div>
                      ) : (
                        scheduleViewDates.map((date) => {
                          const cinchoRows = pendingCinchoRowsByDate[date] || [];
                          const deskMap = scheduleByDate[date] || {};
                          const deskKeys = Object.keys(deskMap);
                          const taskCount = Object.values(deskMap).flat().length;
                          return (
                            <Card key={date} className="mb-3" style={{ border: "1px solid #e0e0e0" }}>
                              <CardHeader style={{ backgroundColor: "#f8f9fa", padding: "8px 16px" }}>
                                <div className="d-flex justify-content-between align-items-center">
                                  <div>
                                    <strong style={{ fontSize: "14px" }}>{formatDate(date)}</strong>
                                    {date === getTodayYmdGuatemala() && (
                                      <Button
                                        color="default"
                                        size="sm"
                                        className="ml-2"
                                        outline
                                        onClick={() => openPrintBoletasForDate(date)}
                                        title="Imprimir boletas del organizador (solo tareas con mesa de esta fecha)"
                                      >
                                        <i className="nc-icon nc-paper" /> Boletas del día
                                      </Button>
                                    )}
                                    {deskKeys.length > 0 && (
                                      <Badge color="info" className="ml-2">
                                        {deskKeys.length} mesa(s)
                                      </Badge>
                                    )}
                                    {cinchoRows.length > 0 && (
                                      <Badge color="warning" className="ml-2">
                                        {cinchoRows.length} cincho(s) en mesa
                                      </Badge>
                                    )}
                                  </div>
                                  {taskCount > 0 && (
                                    <small className="text-muted">{taskCount} tarea(s)</small>
                                  )}
                                </div>
                              </CardHeader>
                              <CardBody className="p-2">
                                {deskKeys.length > 0 && (
                                  <>
                                    <div
                                      className="small font-weight-bold text-muted mb-2 text-uppercase"
                                      style={{ letterSpacing: "0.04em" }}
                                    >
                                      Tareas (mesas)
                                    </div>
                                    <Row>
                                  {deskKeys
                                    .sort((a, b) => parseInt(a) - parseInt(b))
                                    .map((desk) => {
                                      const deskTasks = deskMap[desk];
                                      const totalHours = deskTasks
                                        .filter((t) => t.status !== "CANCELLED")
                                        .reduce((sum, t) => sum + getTaskBaseHours(t), 0);
                                      const capacityPct = Math.min((totalHours / MAX_HOURS_PER_DESK) * 100, 100);

                                      const supMap = supervisorMapForDate(date);
                                      return (
                                        <Col key={desk} md="4" lg="3" className="mb-2">
                                          <Card
                                            className="m-0"
                                            style={{
                                              border: "1px solid #dee2e6",
                                              borderLeft: `4px solid ${
                                                capacityPct >= 90 ? "#dc3545" :
                                                capacityPct >= 60 ? "#ffc107" : "#28a745"
                                              }`,
                                            }}
                                          >
                                            <CardBody className="p-2">
                                              <div className="d-flex justify-content-between align-items-center mb-1">
                                                <strong>{deskDisplayLabel(Number(desk), supMap)}</strong>
                                                <small className="text-muted">
                                                  {Math.round(totalHours * 60)}min / {MAX_HOURS_PER_DESK * 60}min
                                                </small>
                                              </div>
                                              <Progress
                                                value={capacityPct}
                                                color={capacityPct >= 90 ? "danger" : capacityPct >= 60 ? "warning" : "success"}
                                                style={{ height: "6px", marginBottom: "8px" }}
                                              />
                                              {deskTasks.map((task) => {
                                                const items = getTaskItems(task);
                                                return (
                                                  <div
                                                    key={task.id}
                                                    className="p-2 mb-1"
                                                    style={{
                                                      backgroundColor:
                                                        task.status === "COMPLETED" ? "#d4edda" :
                                                        task.status === "IN_PROGRESS" ? "#cce5ff" :
                                                        task.status === "CANCELLED" ? "#f8d7da" :
                                                        !task.dieCutReady ? "#fce4ec" : "#fff3cd",
                                                      borderRadius: "4px",
                                                      fontSize: "12px",
                                                    }}
                                                  >
                                                    {/* Row 1: Products + qty */}
                                                    <div className="d-flex justify-content-between align-items-start">
                                                      <div>
                                                        <span style={{ marginRight: 4 }}>{renderPhaseControl(task, "LEATHER", true)}</span>
                                                        <span style={{ marginRight: 4 }}>{renderPhaseControl(task, "DIE_CUT", true)}</span>
                                                        <span style={{ marginRight: 6 }}>{renderPhaseControl(task, "MATERIALS", true)}</span>
                                                        {items.map((item, i) => (
                                                          <span key={i}>
                                                            {i > 0 && ", "}
                                                            <strong>{item.productCode}</strong>
                                                            {item.colorName && <small className="text-dark">({item.colorName})</small>}
                                                          </span>
                                                        ))}
                                                      </div>
                                                      <div className="d-flex align-items-center" style={{ gap: 4 }}>
                                                        <Badge
                                                          color="light"
                                                          className="text-dark border"
                                                          style={{ ...BADGE_READABLE_ON_LIGHT, fontSize: "10px" }}
                                                        >
                                                          {task.quantity} uds
                                                        </Badge>
                                                        <Button
                                                          color="warning"
                                                          size="sm"
                                                          className="px-2"
                                                          title="Agregar productos de venta del dia"
                                                          onClick={() => openDaySaleModal(task)}
                                                          style={{ fontSize: "11px", lineHeight: 1.5, fontWeight: 600 }}
                                                        >
                                                          + Del Dia
                                                        </Button>
                                                      </div>
                                                    </div>

                                                    {/* Row 2: Time + PO */}
                                                    <div className="d-flex justify-content-between mt-1">
                                                      <small className="text-dark">
                                                        {(() => {
                                                          const totalMin = Math.round((task.estimatedHours || 0) * 60);
                                                          const extraMin = Math.round(getTaskExtraHours(task) * 60);
                                                          const baseMin = Math.max(totalMin - extraMin, 0);
                                                          return extraMin > 0 ? `${baseMin}+${extraMin}min` : `${baseMin}min`;
                                                        })()}
                                                        {task.startTime && (
                                                          <span className="ml-1">🕐 {task.startTime}</span>
                                                        )}
                                                      </small>
                                                      <Badge
                                                        color="light"
                                                        className="text-dark border"
                                                        style={{ ...BADGE_READABLE_ON_LIGHT, fontSize: "10px" }}
                                                      >
                                                        {task.productionOrderCode}
                                                      </Badge>
                                                    </div>

                                                    {/* Row 3: Actions */}
                                                    <div className="d-flex align-items-center mt-1" style={{ gap: "4px" }}>
                                                      <small className="text-dark" title="Hora de inicio automática">
                                                        {task.startTime || "Auto al iniciar"}
                                                      </small>
                                                      <div style={{ flex: 1, minWidth: 120 }}>
                                                        {renderStatusActions(task, true)}
                                                      </div>
                                                      <Button
                                                        color="link"
                                                        size="sm"
                                                        className="p-0"
                                                        title="Imprimir boleta"
                                                        onClick={() => openPrintForTask(task)}
                                                        style={{ fontSize: "14px", lineHeight: 1 }}
                                                      >
                                                        <i className="nc-icon nc-single-copy-04" />
                                                      </Button>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </CardBody>
                                          </Card>
                                        </Col>
                                      );
                                    })}
                                    </Row>
                                  </>
                                )}
                                {deskKeys.length === 0 &&
                                  cinchoRows.length === 0 &&
                                  !cinchoStatusLoadingByDate[date] && (
                                    <p className="text-muted small mb-0 text-center py-2">
                                      Sin actividad en mesas para este día.
                                    </p>
                                  )}
                                {(cinchoRows.length > 0 || cinchoStatusLoadingByDate[date]) && (
                                  <div
                                    className={deskKeys.length > 0 ? "mt-4 pt-3" : ""}
                                    style={
                                      deskKeys.length > 0
                                        ? { borderTop: "2px solid #adb5bd" }
                                        : undefined
                                    }
                                  >
                                    <CinchosDayBoard
                                      rows={cinchoRows}
                                      workDateYmd={date}
                                      deliveredMap={cinchoDeliveredByDate[date] || {}}
                                      workStatusMap={cinchoWorkStatusByDate[date] || {}}
                                      loading={!!cinchoStatusLoadingByDate[date]}
                                      savingKey={cinchoSavingKey}
                                      onToggleDelivered={(row, delivered) =>
                                        handleToggleCinchoDelivered(row, delivered, date)
                                      }
                                      onWorkStatusChange={(row, workStatus) =>
                                        handleCinchoWorkStatusChange(row, workStatus, date)
                                      }
                                    />
                                  </div>
                                )}
                              </CardBody>
                            </Card>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* ============================================================ */}
                  {/* ============ LIST VIEW ============ */}
                  {/* ============================================================ */}
                  {viewMode === "operation" && showDetailedList && (
                    <>
                      {filteredTasks.length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-muted">No se encontraron tareas con los filtros seleccionados.</p>
                        </div>
                      ) : (
                        <Table responsive size="sm">
                          <thead className="text-primary">
                            <tr>
                              <th>#</th>
                              <th>Código</th>
                              <th>Cuero</th>
                              <th>Troquel</th>
                              <th>Materiales</th>
                              <th>Orden</th>
                              <th>Productos</th>
                              <th>Cant.</th>
                              <th>Tiempo</th>
                              <th style={{ width: "100px" }}>Mesa</th>
                              <th style={{ width: "130px" }}>F. Inicio</th>
                              <th style={{ width: "85px" }}>Hora</th>
                              <th>Estado</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTasks
                              .sort((a, b) => {
                                if (a.scheduledDate !== b.scheduledDate)
                                  return (a.scheduledDate || "zzz").localeCompare(b.scheduledDate || "zzz");
                                return (a.desk || 999) - (b.desk || 999);
                              })
                              .map((task, idx) => {
                                return (
                                  <tr
                                    key={task.id}
                                    style={{
                                      backgroundColor:
                                        task.status === "COMPLETED" ? "#f0fff0" :
                                        task.status === "IN_PROGRESS" ? "#f0f8ff" :
                                        task.status === "CANCELLED" ? "#fff0f0" :
                                        !task.desk ? "#fff8e1" : "transparent",
                                    }}
                                  >
                                    <td>{idx + 1}</td>
                                    <td><Badge color="dark">{task.code}</Badge></td>
                                    <td className="text-center">{renderPhaseControl(task, "LEATHER")}</td>
                                    <td className="text-center">{renderPhaseControl(task, "DIE_CUT")}</td>
                                    <td className="text-center">{renderPhaseControl(task, "MATERIALS")}</td>
                                    <td><Badge color="info">{task.productionOrderCode}</Badge></td>
                                    <td>{renderTaskItems(task, false)}</td>
                                    <td><strong>{task.quantity}</strong></td>
                                    <td>{renderTaskTimeBadge(task)}</td>
                                    <td>
                                      <Input
                                        type="select"
                                        bsSize="sm"
                                        value={task.desk || ""}
                                        style={{ fontSize: "12px" }}
                                        onChange={(e) => handleScheduleField(task.id, "desk", e.target.value ? parseInt(e.target.value) : null)}
                                      >
                                        <option value="">—</option>
                                        {deskOptions.map((d) => (
                                          <option
                                            key={d}
                                            value={d}
                                            title={deskDisplayLabel(
                                              d,
                                              supervisorMapForDate(task.scheduledDate || getTodayYmdGuatemala())
                                            )}
                                          >
                                            {deskDisplayLabel(
                                              d,
                                              supervisorMapForDate(task.scheduledDate || getTodayYmdGuatemala())
                                            )}
                                          </option>
                                        ))}
                                      </Input>
                                    </td>
                                    <td>
                                      <Input
                                        type="date"
                                        bsSize="sm"
                                        value={task.scheduledDate || ""}
                                        style={{ fontSize: "11px" }}
                                        onChange={(e) => handleScheduleField(task.id, "scheduledDate", e.target.value)}
                                      />
                                    </td>
                                    <td>
                                      <small className="text-muted">{task.startTime || "Auto al iniciar"}</small>
                                    </td>
                                    <td>{renderStatusActions(task, false)}</td>
                                    <td>
                                      <div className="d-flex" style={{ gap: 4 }}>
                                        <Button
                                          color="warning"
                                          size="sm"
                                          title="Agregar productos de venta del dia"
                                          onClick={() => openDaySaleModal(task)}
                                          style={{ padding: "4px 10px", fontSize: "12px", fontWeight: 600 }}
                                        >
                                          + Del Dia
                                        </Button>
                                        <Button
                                          color="info"
                                          size="sm"
                                          title="Imprimir boleta"
                                          onClick={() => openPrintForTask(task)}
                                          style={{ padding: "2px 6px" }}
                                        >
                                          <i className="nc-icon nc-single-copy-04" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </Table>
                      )}
                    </>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <DownloadOpsModal
        isOpen={showDownloadOpsModal}
        toggle={() => setShowDownloadOpsModal(false)}
        orders={ordersForDownload}
        tasks={organizerDayDeskTasks}
        dayDeskTasks={organizerDayDeskTasks}
        workDateYmd={printWorkDateYmd}
      />

      {/* Print Ticket Modal */}
      <Modal
        isOpen={!!printTaskId || (printBatchTaskIds?.length > 0)}
        toggle={closePrintModal}
        size="lg"
      >
        <ModalBody className="p-0">
          {printBatchTaskIds?.length > 0 ? (
            <TaskTicketPrint
              taskIds={printBatchTaskIds}
              supervisorByDesk={printSupervisorByDesk}
              autoPrintOnLoad
              onClose={closePrintModal}
            />
          ) : (
            printTaskId && (
              <TaskTicketPrint
                taskId={printTaskId}
                supervisorByDesk={printSupervisorByDesk}
                onClose={closePrintModal}
              />
            )
          )}
        </ModalBody>
      </Modal>

      {/* Edit startedAt Modal */}
      <Modal
        isOpen={editStartModal.open}
        toggle={() => setEditStartModal({ open: false, task: null, value: "" })}
      >
        <ModalHeader toggle={() => setEditStartModal({ open: false, task: null, value: "" })}>
          Editar hora de inicio {editStartModal.task?.code ? `· ${editStartModal.task.code}` : ""}
        </ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>Inicio (fecha + hora)</Label>
            <Input
              type="datetime-local"
              value={editStartModal.value || ""}
              onChange={(e) => setEditStartModal((p) => ({ ...p, value: e.target.value }))}
            />
            <small className="text-muted">
              Solo aplica para tareas en proceso o completadas.
            </small>
          </FormGroup>
          <div className="d-flex justify-content-end" style={{ gap: 8 }}>
            <Button
              color="secondary"
              outline
              onClick={() => setEditStartModal({ open: false, task: null, value: "" })}
            >
              Cancelar
            </Button>
            <Button color="primary" onClick={saveEditedStartedAt}>
              Guardar
            </Button>
          </div>
        </ModalBody>
      </Modal>

      <Modal
        isOpen={showDaySaleModal}
        toggle={() => {
          if (savingDaySaleItems) return;
          setShowDaySaleModal(false);
          setDaySaleTask(null);
          setDaySaleCandidates([]);
          setSelectedDaySaleItems([]);
        }}
        size="lg"
        modalClassName="day-sale-products-modal"
      >
        <ModalHeader
          toggle={() => {
            if (savingDaySaleItems) return;
            setShowDaySaleModal(false);
            setDaySaleTask(null);
            setDaySaleCandidates([]);
            setSelectedDaySaleItems([]);
          }}
        >
          Agregar productos de venta del dia
          {daySaleTask?.code ? ` · ${daySaleTask.code}` : ""}
        </ModalHeader>
        <ModalBody>
          {loadingDaySaleCandidates ? (
            <div className="text-center py-3">Cargando productos disponibles...</div>
          ) : daySaleCandidates.length === 0 ? (
            <Alert color="info" className="mb-0">
              No hay productos de venta del dia disponibles para agregar.
            </Alert>
          ) : (
            <>
              <small className="text-muted d-block mb-2">
                Los productos que ya se agregan a una tarea no vuelven a aparecer en otras.
              </small>
              <div className="mb-2">
                <small className="text-muted">
                  <strong>PO:</strong>{" "}
                  {daySaleModalOrderCodes.length > 0 ? daySaleModalOrderCodes.join(", ") : "—"}
                </small>
              </div>
              <Table responsive size="sm" bordered>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Sel</th>
                    <th>Codigo</th>
                    <th>Producto</th>
                    <th>Color</th>
                    <th className="text-right">Cant.</th>
                    <th className="text-right">Tiempo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {daySaleCandidates.map((item) => {
                    const assigned = Boolean(item.assignedTaskId);
                    return (
                      <tr key={item.productionOrderItemId} style={assigned ? { backgroundColor: "#f8f9fa", opacity: 0.8 } : undefined}>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={selectedDaySaleItems.includes(item.productionOrderItemId)}
                            onChange={() => toggleDaySaleItem(item.productionOrderItemId)}
                            disabled={savingDaySaleItems || assigned}
                            title={assigned ? "Ya fue agregado a otra tarea" : "Seleccionar producto"}
                          />
                        </td>
                        <td><strong>{item.productCode || "—"}</strong></td>
                        <td>{item.productName || "—"}</td>
                        <td>{item.colorName || "—"}</td>
                        <td className="text-right">{item.quantity || 0}</td>
                        <td className="text-right">{Math.round((item.estimatedHours || 0) * 60)}min</td>
                        <td>
                          {assigned ? (
                            <small className="text-muted">
                              En {item.assignedTaskCode || "tarea"}
                              {item.assignedDesk
                                ? ` · ${deskDisplayLabel(
                                    item.assignedDesk,
                                    supervisorMapForDate(daySaleTask?.scheduledDate || getTodayYmdGuatemala())
                                  )}`
                                : " · Sin mesa"}
                            </small>
                          ) : (
                            <small className="text-success">Disponible</small>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <div className="d-flex justify-content-between align-items-center mt-2">
                <small className="text-muted">
                  Base actual: <strong>{Math.round(getTaskBaseHours(daySaleTask || {}) * 60)}min</strong> ·
                  Extra seleccionado: <strong>{daySaleCandidates
                    .filter((c) => selectedDaySaleItems.includes(c.productionOrderItemId))
                    .reduce((sum, c) => sum + Math.round((c.estimatedHours || 0) * 60), 0)}min</strong>
                </small>
                <div>
                  <Button
                    color="secondary"
                    className="mr-2"
                    onClick={() => {
                      if (savingDaySaleItems) return;
                      setShowDaySaleModal(false);
                      setDaySaleTask(null);
                      setDaySaleCandidates([]);
                      setSelectedDaySaleItems([]);
                    }}
                    disabled={savingDaySaleItems}
                  >
                    Cancelar
                  </Button>
                  <Button
                    color="warning"
                    onClick={handleAddDaySaleItems}
                    disabled={savingDaySaleItems || selectedDaySaleItems.length === 0}
                  >
                    {savingDaySaleItems ? "Agregando..." : `Agregar (${selectedDaySaleItems.length})`}
                  </Button>
                </div>
              </div>
            </>
          )}
        </ModalBody>
      </Modal>

      <Modal
        isOpen={showLeatherModal}
        toggle={() => {
          if (savingLeatherItems) return;
          setShowLeatherModal(false);
          setLeatherTask(null);
          setSelectedLeatherItems([]);
          setLeatherSelectionCount("");
        }}
        size="lg"
      >
        <ModalHeader
          toggle={() => {
            if (savingLeatherItems) return;
            setShowLeatherModal(false);
            setLeatherTask(null);
            setSelectedLeatherItems([]);
            setLeatherSelectionCount("");
          }}
        >
          Entrega de cuero por producto
          {leatherTask?.code ? ` · ${leatherTask.code}` : ""}
        </ModalHeader>
        <ModalBody>
          <Alert color="info">
            Seleccione los productos a los que se les entregará cuero para esta tarea. Se autocompletan los pendientes.
          </Alert>
          <div className="mb-2">
            <strong>OP:</strong> {leatherTask?.productionOrderCode || "—"}
          </div>
          <Row className="mb-2 align-items-end">
            <Col md="4">
              <Label className="mb-1">
                <strong>Entregar para cuántos productos</strong>
              </Label>
              <Input
                type="number"
                min="0"
                max={Math.max(
                  0,
                  (leatherTask?.items || []).filter((item) => !item.leatherDelivered).length
                )}
                value={leatherSelectionCount}
                disabled={savingLeatherItems}
                onChange={(e) => applyLeatherSelectionCount(e.target.value)}
              />
            </Col>
            <Col md="8">
              <Alert color="light" className="mb-0 py-2">
                Pendientes:{" "}
                <strong>
                  {(leatherTask?.items || []).filter((item) => !item.leatherDelivered).length}
                </strong>
                {" · "}Seleccionados: <strong>{selectedLeatherItems.length}</strong>
              </Alert>
            </Col>
          </Row>
          {(leatherTask?.items || []).length > 0 && (
            <div className="d-flex justify-content-end mb-2" style={{ gap: 8 }}>
              <Button
                size="sm"
                color="outline-dark"
                disabled={savingLeatherItems}
                onClick={() => applyLeatherSelectionCount((leatherTask?.items || []).filter((item) => !item.leatherDelivered).length)}
              >
                Seleccionar pendientes
              </Button>
              <Button
                size="sm"
                color="outline-secondary"
                disabled={savingLeatherItems}
                onClick={() => applyLeatherSelectionCount(0)}
              >
                Limpiar selección
              </Button>
            </div>
          )}
          <Table responsive size="sm" bordered>
            <thead>
              <tr>
                <th style={{ width: 40 }}>Sel</th>
                <th>Producto</th>
                <th>Color</th>
                <th className="text-right">Cant.</th>
                <th>Estado cuero</th>
              </tr>
            </thead>
            <tbody>
              {(leatherTask?.items || []).map((item) => (
                <tr key={item.id}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={selectedLeatherItems.includes(item.id)}
                      disabled={savingLeatherItems || item.leatherDelivered}
                      onChange={() => toggleLeatherItemSelection(item.id)}
                    />
                  </td>
                  <td>
                    <strong>{item.productCode || "—"}</strong>
                    {item.productName ? <span className="text-muted"> {item.productName}</span> : null}
                  </td>
                  <td>{item.colorName || "—"}</td>
                  <td className="text-right">{item.quantity || 0}</td>
                  <td>
                    {item.leatherDelivered ? (
                      <Badge color="success">Entregado</Badge>
                    ) : (
                      <Badge color="warning">Pendiente</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="d-flex justify-content-end mt-3">
            <Button
              color="secondary"
              className="mr-2"
              disabled={savingLeatherItems}
              onClick={() => {
                if (savingLeatherItems) return;
                setShowLeatherModal(false);
                setLeatherTask(null);
                setSelectedLeatherItems([]);
                setLeatherSelectionCount("");
              }}
            >
              Cancelar
            </Button>
            <Button
              color="dark"
              disabled={savingLeatherItems || selectedLeatherItems.length === 0}
              onClick={handleConfirmLeatherDelivery}
            >
              {savingLeatherItems ? "Guardando..." : `Entregar cuero (${selectedLeatherItems.length})`}
            </Button>
          </div>
        </ModalBody>
      </Modal>

      <Modal isOpen={showDeskSupervisorsModal} toggle={() => !savingDeskSupervisors && setShowDeskSupervisorsModal(false)}>
        <ModalHeader toggle={() => !savingDeskSupervisors && setShowDeskSupervisorsModal(false)}>
          Encargados por mesa
        </ModalHeader>
        <ModalBody>
          <p className="text-muted small mb-2">
            Vigencia desde: <strong>{formatDateGt(deskSupervisorModalDate)}</strong>
            {" "}(filtro del tablero o hoy). Los nombres se mantienen en todos los días siguientes hasta que
            guardes un cambio con otra fecha efectiva.
          </p>
          <Row className="mb-2">
            <Col md="6">
              <FormGroup className="mb-0">
                <Label className="mb-1">Cantidad de mesas activas</Label>
                <Input
                  bsSize="sm"
                  type="number"
                  min="1"
                  max="32"
                  value={deskCountDraft}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDeskCountDraft(v);
                    setDeskSupervisorDraft((prev) => normalizeSupervisorRowsForCount(prev, v));
                  }}
                />
                <div className="text-muted small mt-1">
                  Si reduces la cantidad, las tareas en mesas fuera de rango se moverán a <strong>Sin asignar</strong>.
                </div>
              </FormGroup>
            </Col>
          </Row>
          <Table size="sm" bordered responsive>
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Encargado</th>
              </tr>
            </thead>
            <tbody>
              {deskSupervisorDraft.map((row) => (
                <tr key={row.desk}>
                  <td className="align-middle">{row.desk}</td>
                  <td>
                    <Input
                      bsSize="sm"
                      value={row.supervisorName}
                      placeholder="Nombre"
                      onChange={(e) => {
                        const v = e.target.value;
                        setDeskSupervisorDraft((prev) =>
                          prev.map((r) => (r.desk === row.desk ? { ...r, supervisorName: v } : r))
                        );
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" disabled={savingDeskSupervisors} onClick={() => setShowDeskSupervisorsModal(false)}>
            Cancelar
          </Button>
          <Button color="primary" disabled={savingDeskSupervisors} onClick={saveDeskSupervisorsModal}>
            {savingDeskSupervisors ? "Guardando..." : "Guardar"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={showQuickGuide} toggle={() => setShowQuickGuide(false)} size="lg">
        <ModalHeader toggle={() => setShowQuickGuide(false)}>
          Guia Rapida: Flujo de Tareas por Estacion
        </ModalHeader>
        <ModalBody>
          <Alert color="info" className="mb-2">
            Diseñado para usuarios nuevos: siga estos 4 pasos para trabajar sin errores.
          </Alert>
          <ol className="mb-2" style={{ paddingLeft: "18px" }}>
            <li className="mb-1"><strong>Armar y crear tareas</strong> en el Organizador de Tareas (cantidades por producto hasta 4h; extras OPL encima del cupo).</li>
            <li className="mb-1"><strong>Asignar mesas</strong> arrastrando en el tablero del Organizador o aquí en Redistribuir.</li>
            <li className="mb-1"><strong>Completar prerequisitos</strong>: cuero y troquelado (materiales se entrega en Vista Materiales).</li>
            <li className="mb-1"><strong>Monitorear cronograma</strong> y cambiar estados (iniciar, pausar, completar).</li>
          </ol>
          <Alert color="light" style={{ border: "1px solid #e2e8f0" }}>
            Consejo: las tareas que queden sin mesa o de días anteriores se retoman en la pestaña Pendientes del Organizador.
          </Alert>
        </ModalBody>
      </Modal>

    </div>
  );
}

export default TasksByTable;
