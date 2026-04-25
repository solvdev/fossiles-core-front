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
} from "reactstrap";
import {
  getTasks,
  updateTaskStatus,
  toggleDieCut,
  setLeatherDelivery,
  setTaskItemLeatherDelivery,
  scheduleTask,
  getDesksCount,
  optimizePendingTasks,
  planTasksWindow,
  generateTasksForOrder,
  getDaySaleCandidates,
  addDaySaleItemsToTask,
  generateForPendingOnlineSales,
} from "services/taskService";
import { getProductionOrders } from "services/productionOrderService";
import { showSuccess, showError } from "utils/notificationHelper";
import TaskTicketPrint from "./TaskTicketPrint";
import { taskMaterialsReady, taskSkipsMaterials } from "utils/materialRequirementHelper";
import { formatDateGt } from "utils/dateTimeHelper";
import { formatProductionOrderSelectLabel } from "utils/productionOrderDisplayHelper";

const MAX_HOURS_PER_DESK = 4;

function TasksByTable() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deskConfigWarning, setDeskConfigWarning] = useState("");
  const [viewMode, setViewMode] = useState("operation"); // "operation" | "schedule"
  const [filterDesk, setFilterDesk] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDieCut, setFilterDieCut] = useState("all");
  const [printTaskId, setPrintTaskId] = useState(null);
  const [numDesks, setNumDesks] = useState(12);
  const [workingDesksCount, setWorkingDesksCount] = useState(12);
  const [distributionDate, setDistributionDate] = useState(new Date().toISOString().split("T")[0]);
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [productionOrders, setProductionOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [generatingOrderTasks, setGeneratingOrderTasks] = useState(false);
  const [showDetailedList, setShowDetailedList] = useState(false);
  const [showDaySaleModal, setShowDaySaleModal] = useState(false);
  const [daySaleTask, setDaySaleTask] = useState(null);
  const [daySaleCandidates, setDaySaleCandidates] = useState([]);
  const [selectedDaySaleItems, setSelectedDaySaleItems] = useState([]);
  const [loadingDaySaleCandidates, setLoadingDaySaleCandidates] = useState(false);
  const [savingDaySaleItems, setSavingDaySaleItems] = useState(false);
  const [showLeatherModal, setShowLeatherModal] = useState(false);
  const [leatherTask, setLeatherTask] = useState(null);
  const [generatingOnlineSalesTasks, setGeneratingOnlineSalesTasks] = useState(false);
  const [selectedLeatherItems, setSelectedLeatherItems] = useState([]);
  const [leatherSelectionCount, setLeatherSelectionCount] = useState("");
  const [savingLeatherItems, setSavingLeatherItems] = useState(false);

  useEffect(() => {
    loadTasks();
    loadDesksCount();
    loadProductionOrders();
  }, []);

  useEffect(() => {
    const orderIdFromUrl = searchParams.get("orderId");
    if (!orderIdFromUrl || productionOrders.length === 0) return;
    const exists = productionOrders.some((o) => Number(o.id) === Number(orderIdFromUrl));
    if (!exists) return;

    setSelectedOrderId(String(orderIdFromUrl));
    setShowGenerateModal(true);
    setViewMode("operation");
    setShowDetailedList(false);

    const next = new URLSearchParams(searchParams);
    next.delete("orderId");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, productionOrders]);

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

  const loadDesksCount = async () => {
    try {
      const res = await getDesksCount();
      const count = res.count ?? 12;
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
    } catch { /* use default */ }
  };

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
      setProductionOrders(active);
    } catch (err) {
      console.error("Error loading production orders:", err);
    }
  };

  const getTaskExtraHours = (task) => {
    const items = task?.items || [];
    return items
      .filter((item) => item?.daySaleExtra)
      .reduce((sum, item) => sum + (item?.estimatedHours || 0), 0);
  };

  const getTaskBaseHours = (task) => {
    const total = task?.estimatedHours || 0;
    const extra = getTaskExtraHours(task);
    return Math.max(total - extra, 0);
  };

  // ==================== HANDLERS ====================

  const handleStatusChange = async (taskId, newStatus) => {
    const task = tasks.find((t) => t.id === taskId);
    if (newStatus === "IN_PROGRESS" && !taskMaterialsReady(task)) {
      showError("No puedes iniciar: primero entrega cuero, troquela, entra a mesa y entrega materiales (si aplica).");
      return;
    }
    try {
      const updated = await updateTaskStatus(taskId, newStatus);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      showSuccess("Estado actualizado");
    } catch (err) {
      showError(err.message);
    }
  };

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
    // Find the desk with least load for today or the task's scheduled date
    const task = tasks.find((t) => t.id === taskId);
    const targetDate = task?.scheduledDate || new Date().toISOString().split("T")[0];

    let bestDesk = 1;
    let bestLoad = Infinity;

    for (let d = 1; d <= numDesks; d++) {
      const load = tasks
        .filter((t) => t.desk === d && t.scheduledDate === targetDate && t.status !== "CANCELLED")
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

  const handleOptimizePending = async () => {
    try {
      const result = await optimizePendingTasks(filterDate || undefined, false);
      showSuccess(result.message || "Optimización completada");
      await loadTasks();
    } catch (err) {
      showError(err.message || "No se pudo optimizar tareas pendientes");
    }
  };

  const handleRebalanceByDay = async () => {
    try {
      const targetDate = distributionDate || filterDate || new Date().toISOString().split("T")[0];
      const desksToUse = Math.max(1, Math.min(numDesks, parseInt(workingDesksCount, 10) || numDesks));
      const result = await planTasksWindow(targetDate, desksToUse, 5);
      showSuccess(result.message || "Redistribucion completada");
      await loadTasks();
    } catch (err) {
      showError(err.message || "No se pudo redistribuir tareas del dia");
    }
  };

  const handleGenerateTasksFromOrder = async () => {
    if (!selectedOrderId) {
      showError("Seleccione una orden de produccion");
      return;
    }
    try {
      setGeneratingOrderTasks(true);
      const productionOrderId = parseInt(selectedOrderId, 10);
      const desksToUse = Math.max(1, Math.min(numDesks, parseInt(workingDesksCount, 10) || numDesks));
      const startDate = distributionDate || filterDate || new Date().toISOString().split("T")[0];

      const result = await generateTasksForOrder(productionOrderId);
      showSuccess(`Se generaron ${result.length || 0} tarea(s) para la orden seleccionada`);

      // Replanificar multi-día desde la fecha de trabajo seleccionada.
      await planTasksWindow(startDate, desksToUse, 5, productionOrderId);

      setShowGenerateModal(false);
      setSelectedOrderId("");
      await loadTasks();
    } catch (err) {
      showError(err.message || "No se pudieron generar tareas");
    } finally {
      setGeneratingOrderTasks(false);
    }
  };

  /**
   * Genera tareas para todas las OPs VENTA_EN_LINEA que aún no las tienen.
   * Permite tener tareas del día solo de ventas online, sin necesitar otras OPs.
   */
  const handleGenerateOnlineSalesTasks = async () => {
    try {
      setGeneratingOnlineSalesTasks(true);
      const result = await generateForPendingOnlineSales();
      if (result.ordersProcessed === 0) {
        showSuccess(result.message || "No hay órdenes de venta en línea pendientes de generar tareas");
      } else {
        showSuccess(`${result.message} — ${result.tasksGenerated} tarea(s) creada(s)`);
      }
      if (result.ordersProcessed > 0) {
        await loadTasks();
      }
    } catch (err) {
      showError(err.message || "No se pudieron generar tareas de ventas online");
    } finally {
      setGeneratingOnlineSalesTasks(false);
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
    setSearchTerm("");
  };

  // ==================== COMPUTED ====================

  const uniqueDesks = useMemo(
    () => [...new Set(tasks.map((t) => t.desk).filter(Boolean))].sort((a, b) => a - b),
    [tasks]
  );

  const uniqueDates = useMemo(
    () => [...new Set(tasks.map((t) => t.scheduledDate).filter(Boolean))].sort(),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
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
  }, [tasks, filterDesk, filterDate, filterStatus, filterDieCut, searchTerm]);

  const unassignedTasks = useMemo(
    () => tasks.filter((t) => !t.desk && t.status !== "CANCELLED"),
    [tasks]
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

  const stats = useMemo(() => {
    const active = tasks.filter((t) => t.status !== "CANCELLED");
    const pending = active.filter((t) => t.status === "PENDING").length;
    const inProgress = active.filter((t) => t.status === "IN_PROGRESS").length;
    const completed = active.filter((t) => t.status === "COMPLETED").length;
    const dieCut = active.filter((t) => t.dieCutReady).length;
    const unassigned = active.filter((t) => !t.desk).length;
    const totalMin = active.reduce((sum, t) => sum + Math.round((t.estimatedHours || 0) * 60), 0);
    return { pending, inProgress, completed, dieCut, unassigned, totalMin, total: active.length };
  }, [tasks]);

  const daySaleModalOrderCodes = useMemo(() => {
    const unique = [...new Set((daySaleCandidates || []).map((c) => c.productionOrderCode).filter(Boolean))];
    return unique;
  }, [daySaleCandidates]);

  // ==================== HELPERS ====================

  const getStatusBadge = (status) => {
    const map = {
      PENDING: { color: "warning", text: "Pendiente" },
      IN_PROGRESS: { color: "info", text: "En Proceso" },
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
            <Badge color={deliveredItems > 0 ? "info" : "secondary"}>
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
          disabled={!leatherDone}
          onClick={() => handleDieCutToggle(task.id, false)}
          title={!leatherDone ? "Primero debe completarse cuero" : "Registrar troquelado"}
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
            disabled={!taskMaterialsReady(task)}
            onClick={() => handleStatusChange(task.id, "IN_PROGRESS")}
            title={!taskMaterialsReady(task) ? "Primero debe tener materiales entregados (si aplica)" : "Iniciar tarea"}
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
        {item.colorName && <Badge color="secondary" className="ml-1" style={{ fontSize: "9px" }}>{item.colorName}</Badge>}
        {item.daySaleExtra && <Badge color="warning" className="ml-1" style={{ fontSize: "9px" }}>DIA</Badge>}
        {items.length > 1 && <span className="text-muted"> ×{item.quantity}</span>}
      </div>
    ));
  };

  const renderTaskTimeBadge = (task) => {
    const totalMin = Math.round((task.estimatedHours || 0) * 60);
    const extraMin = Math.round(getTaskExtraHours(task) * 60);
    const baseMin = Math.max(totalMin - extraMin, 0);
    return (
      <Badge
        color={
          baseMin >= 210 ? "danger" :
          baseMin >= 120 ? "warning" : "success"
        }
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
            <CardHeader>
              <Row className="align-items-center">
                <Col md="3">
                  <CardTitle tag="h4" className="mb-0">
                    <i className="nc-icon nc-layout-11 mr-1" />
                    Estación de Tareas
                  </CardTitle>
                </Col>
                <Col md="6" className="text-center">
                  <div className="btn-group">
                    <Button
                      color={viewMode === "operation" ? "danger" : "outline-secondary"}
                      size="sm"
                      onClick={() => setViewMode("operation")}
                    >
                      <i className="nc-icon nc-settings-gear-65 mr-1" />
                      Operacion del Dia {stats.unassigned > 0 && <Badge color="light" className="ml-1">{stats.unassigned}</Badge>}
                    </Button>
                    <Button
                      color={viewMode === "schedule" ? "primary" : "outline-secondary"}
                      size="sm"
                      onClick={() => setViewMode("schedule")}
                    >
                      <i className="nc-icon nc-calendar-60 mr-1" />
                      Cronograma
                    </Button>
                  </div>
                </Col>
                <Col md="3" className="text-right">
                  <Button
                    color="dark"
                    size="sm"
                    className="mr-2"
                    onClick={() => navigate("/admin/leather-inventory?openDelivery=1")}
                    title="Abrir entrega de cuero"
                  >
                    <i className="nc-icon nc-ruler-pencil" /> Entrega de Cuero
                  </Button>
                  <Button
                    color="primary"
                    outline
                    size="sm"
                    className="mr-2"
                    onClick={() => navigate("/admin/materials-tasks")}
                    title="Ir a Entrega de Materiales"
                  >
                    <i className="nc-icon nc-box-2" /> Vista Materiales
                  </Button>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    className="mr-2"
                    onClick={() => setShowQuickGuide(true)}
                    title="Guia paso a paso para nuevos usuarios"
                  >
                    <i className="nc-icon nc-bulb-63" /> Guia Rapida
                  </Button>
                  <Button color="info" size="sm" onClick={loadTasks} disabled={loading}>
                    <i className="nc-icon nc-refresh-69" /> Actualizar
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {deskConfigWarning && <Alert color="warning" className="mb-2">{deskConfigWarning}</Alert>}
              <Card className="mb-3" style={{ border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                <CardBody className="py-2">
                  <Row className="align-items-end">
                    <Col md="3">
                      <Label><small>1) Generar tareas</small></Label>
                      <div className="d-flex" style={{ gap: 4 }}>
                        <Button color="success" size="sm" style={{ flex: 1 }} onClick={() => setShowGenerateModal(true)}>
                          <i className="nc-icon nc-simple-add mr-1" /> Desde OP
                        </Button>
                        <Button
                          color="info"
                          size="sm"
                          style={{ flex: 1, fontSize: 11 }}
                          onClick={handleGenerateOnlineSalesTasks}
                          disabled={generatingOnlineSalesTasks}
                          title="Genera tareas para todas las órdenes de venta online pendientes (sin requerir otra tarea existente)"
                        >
                          {generatingOnlineSalesTasks ? "..." : "🛒 Ventas Online"}
                        </Button>
                      </div>
                    </Col>
                    <Col md="2">
                      <Label><small>2) Fecha de trabajo</small></Label>
                      <Input
                        type="date"
                        bsSize="sm"
                        value={distributionDate}
                        onChange={(e) => setDistributionDate(e.target.value)}
                      />
                    </Col>
                    <Col md="2">
                      <Label><small>Mesas activas</small></Label>
                      <Input
                        type="number"
                        bsSize="sm"
                        min="1"
                        max={numDesks}
                        value={workingDesksCount}
                        onChange={(e) => setWorkingDesksCount(e.target.value)}
                      />
                    </Col>
                    <Col md="3">
                      <Label><small>3) Distribuir</small></Label>
                      <Button color="warning" size="sm" block onClick={handleRebalanceByDay} disabled={loading}>
                        <i className="nc-icon nc-chart-bar-32 mr-1" /> Distribuir Dia
                      </Button>
                    </Col>
                    <Col md="2">
                      <Label><small>4) Optimizar</small></Label>
                      <Button color="primary" outline size="sm" block onClick={handleOptimizePending} disabled={loading}>
                        Optimizar
                      </Button>
                    </Col>
                  </Row>
                </CardBody>
              </Card>

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
                        {uniqueDesks.map((d) => <option key={d} value={d}>Mesa {d}</option>)}
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
              ) : tasks.length === 0 ? (
                <div className="text-center py-5">
                  <i className="nc-icon nc-box-2" style={{ fontSize: "48px", color: "#ccc" }} />
                  <p className="mt-2 text-muted">
                    No hay tareas generadas. Genere tareas desde una Orden de Producción.
                  </p>
                </div>
              ) : (
                <>
                  {/* ============================================================ */}
                  {/* ============ UNASSIGNED VIEW ============ */}
                  {/* ============================================================ */}
                  {viewMode === "operation" && (
                    <div>
                      {unassignedTasks.length === 0 ? (
                        <div className="text-center py-4">
                          <i className="nc-icon nc-check-2" style={{ fontSize: "48px", color: "#28a745" }} />
                          <p className="mt-2 text-success">
                            <strong>¡Todas las tareas están asignadas!</strong>
                          </p>
                          <Button color="primary" size="sm" onClick={() => setViewMode("schedule")}>
                            Ver Cronograma →
                          </Button>
                        </div>
                      ) : (
                        <>
                          {/* Capacity overview */}
                          <Card className="mb-3" style={{ backgroundColor: "#f8f9fa" }}>
                            <CardBody className="py-2">
                              <small className="text-muted d-block mb-2">
                                <strong>Carga base por mesa (hoy y próximos días)</strong> — Máx {MAX_HOURS_PER_DESK}h por mesa/día (sin extras de venta del dia)
                              </small>
                              <Row>
                                {deskOptions.slice(0, numDesks).map((d) => {
                                  const todayStr = distributionDate || filterDate || new Date().toISOString().split("T")[0];
                                  const load = tasks
                                    .filter((t) => t.desk === d && t.scheduledDate === todayStr && t.status !== "CANCELLED")
                                    .reduce((sum, t) => sum + getTaskBaseHours(t), 0);
                                  const pct = Math.min((load / MAX_HOURS_PER_DESK) * 100, 100);
                                  const totalLoad = tasks
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
                                        <Badge color="info">{task.productionOrderCode}</Badge>
                                      </div>
                                      <div className="text-right">
                                        <Badge color="secondary">{task.quantity} uds</Badge>
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
                                          disabled={!task.dieCutReady}
                                          onChange={(e) => handleScheduleField(task.id, "desk", e.target.value ? parseInt(e.target.value) : null)}
                                        >
                                          <option value="">—</option>
                                          {deskOptions.map((d) => (
                                            <option key={d} value={d}>Mesa {d}</option>
                                          ))}
                                        </Input>
                                      </Col>
                                      <Col xs="6">
                                        <Label className="mb-1"><small>F. Inicio</small></Label>
                                        <Input
                                          type="date"
                                          bsSize="sm"
                                          value={task.scheduledDate || ""}
                                          disabled={!task.dieCutReady}
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
                      )}
                    </div>
                  )}

                  {/* ============================================================ */}
                  {/* ============ SCHEDULE VIEW ============ */}
                  {/* ============================================================ */}
                  {viewMode === "schedule" && (
                    <div>
                      {Object.keys(scheduleByDate).length === 0 ? (
                        <div className="text-center py-4">
                          <p className="text-muted">No hay tareas programadas con los filtros actuales.</p>
                          {unassignedTasks.length > 0 && (
                            <Button color="warning" size="sm" onClick={() => setViewMode("operation")}>
                              Ver {unassignedTasks.length} tarea(s) sin asignar →
                            </Button>
                          )}
                        </div>
                      ) : (
                        Object.keys(scheduleByDate)
                          .sort()
                          .map((date) => (
                            <Card key={date} className="mb-3" style={{ border: "1px solid #e0e0e0" }}>
                              <CardHeader style={{ backgroundColor: "#f8f9fa", padding: "8px 16px" }}>
                                <div className="d-flex justify-content-between align-items-center">
                                  <div>
                                    <strong style={{ fontSize: "14px" }}>{formatDate(date)}</strong>
                                    <Badge color="info" className="ml-2">
                                      {Object.keys(scheduleByDate[date]).length} mesa(s)
                                    </Badge>
                                  </div>
                                  <small className="text-muted">
                                    {Object.values(scheduleByDate[date]).flat().length} tarea(s)
                                  </small>
                                </div>
                              </CardHeader>
                              <CardBody className="p-2">
                                <Row>
                                  {Object.keys(scheduleByDate[date])
                                    .sort((a, b) => parseInt(a) - parseInt(b))
                                    .map((desk) => {
                                      const deskTasks = scheduleByDate[date][desk];
                                      const totalHours = deskTasks
                                        .filter((t) => t.status !== "CANCELLED")
                                        .reduce((sum, t) => sum + getTaskBaseHours(t), 0);
                                      const capacityPct = Math.min((totalHours / MAX_HOURS_PER_DESK) * 100, 100);

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
                                                <strong>Mesa {desk}</strong>
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
                                                            {item.colorName && <small className="text-muted">({item.colorName})</small>}
                                                          </span>
                                                        ))}
                                                      </div>
                                                      <div className="d-flex align-items-center" style={{ gap: 4 }}>
                                                        <Badge color="dark" style={{ fontSize: "10px" }}>
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
                                                      <small className="text-muted">
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
                                                      <Badge color="light" style={{ fontSize: "10px", color: "#666" }}>
                                                        {task.productionOrderCode}
                                                      </Badge>
                                                    </div>

                                                    {/* Row 3: Actions */}
                                                    <div className="d-flex align-items-center mt-1" style={{ gap: "4px" }}>
                                                      <small className="text-muted" title="Hora de inicio automática">
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
                                                        onClick={() => setPrintTaskId(task.id)}
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
                              </CardBody>
                            </Card>
                          ))
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
                                        disabled={!task.dieCutReady}
                                        onChange={(e) => handleScheduleField(task.id, "desk", e.target.value ? parseInt(e.target.value) : null)}
                                      >
                                        <option value="">—</option>
                                        {deskOptions.map((d) => (
                                          <option key={d} value={d}>M{d}</option>
                                        ))}
                                      </Input>
                                    </td>
                                    <td>
                                      <Input
                                        type="date"
                                        bsSize="sm"
                                        value={task.scheduledDate || ""}
                                        style={{ fontSize: "11px" }}
                                        disabled={!task.dieCutReady}
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
                                          onClick={() => setPrintTaskId(task.id)}
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

      {/* Print Ticket Modal */}
      <Modal isOpen={!!printTaskId} toggle={() => setPrintTaskId(null)} size="lg">
        <ModalBody className="p-0">
          {printTaskId && (
            <TaskTicketPrint
              taskId={printTaskId}
              onClose={() => setPrintTaskId(null)}
            />
          )}
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
                              {item.assignedDesk ? ` · Mesa ${item.assignedDesk}` : " · Sin mesa"}
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

      <Modal isOpen={showQuickGuide} toggle={() => setShowQuickGuide(false)} size="lg">
        <ModalHeader toggle={() => setShowQuickGuide(false)}>
          Guia Rapida: Flujo de Tareas por Estacion
        </ModalHeader>
        <ModalBody>
          <Alert color="info" className="mb-2">
            Diseñado para usuarios nuevos: siga estos 4 pasos para trabajar sin errores.
          </Alert>
          <ol className="mb-2" style={{ paddingLeft: "18px" }}>
            <li className="mb-1"><strong>Generar tareas</strong> desde la orden de produccion.</li>
            <li className="mb-1"><strong>Completar prerequisitos</strong>: cuero y troquelado (materiales se entrega en Vista Materiales).</li>
            <li className="mb-1"><strong>Distribuir dia</strong> eligiendo fecha y mesas activas.</li>
            <li className="mb-1"><strong>Monitorear cronograma</strong> y cambiar estados (iniciar, pausar, completar).</li>
          </ol>
          <Alert color="light" style={{ border: "1px solid #e2e8f0" }}>
            Consejo: use "Distribuir dia" al iniciar jornada para balancear carga automaticamente.
          </Alert>
        </ModalBody>
      </Modal>

      <Modal isOpen={showGenerateModal} toggle={() => setShowGenerateModal(false)} size="md">
        <ModalHeader toggle={() => setShowGenerateModal(false)}>
          Generar Tareas desde Orden
        </ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>Orden de Produccion</Label>
            <Input
              type="select"
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              disabled={generatingOrderTasks}
            >
              <option value="">Seleccione una orden</option>
              {productionOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {formatProductionOrderSelectLabel(order)}
                </option>
              ))}
            </Input>
            <small className="text-muted">
              Al generar, la planificacion de mesas se realiza aqui en Tareas por Estacion.
            </small>
          </FormGroup>
          <div className="d-flex justify-content-end">
            <Button color="secondary" className="mr-2" onClick={() => setShowGenerateModal(false)} disabled={generatingOrderTasks}>
              Cancelar
            </Button>
            <Button color="success" onClick={handleGenerateTasksFromOrder} disabled={generatingOrderTasks}>
              {generatingOrderTasks ? "Generando..." : "Generar"}
            </Button>
          </div>
        </ModalBody>
      </Modal>
    </div>
  );
}

export default TasksByTable;
