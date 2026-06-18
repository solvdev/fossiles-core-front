import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
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
import {
  getTasks,
  updateTaskStatus,
  toggleDieCut,
  setLeatherDelivery,
  setTaskItemLeatherDelivery,
  scheduleTask,
  optimizePendingTasks,
  planTasksWindow,
  getDistributionQueueProductionOrders,
  generateTasksForOrder,
  generateTasksForSelectedItems,
  getDaySaleCandidates,
  addDaySaleItemsToTask,
  generateForPendingOnlineSales,
  moveTaskItem,
  updateTaskStartedAt,
} from "services/taskService";
import { getProductionOrders } from "services/productionOrderService";
import {
  isCinchoOrderType,
  orderHasOnlyCinchoLineItems,
  buildTableCenterTasks,
} from "utils/cinchoProductionHelper";
import {
  collectPlannedOrderItemIds,
  countPlannedItemsForOrder,
  orderHasPendingItemsForTasks,
} from "utils/taskPlanningHelper";
import { showSuccess, showError } from "utils/notificationHelper";
import TaskTicketPrint from "./TaskTicketPrint";
import DownloadOpsModal, { mergeOrdersForDownload } from "components/production/DownloadOpsModal";
import { taskSkipsMaterials } from "utils/materialRequirementHelper";
import { formatDateGt, formatDateTimeGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { formatProductionOrderSelectLabel } from "utils/productionOrderDisplayHelper";
import { openProductionTasksSheetPrintWindow } from "utils/productionTasksSheetPrintHtml";
import { buildProductionTasksSheetPrintModel } from "utils/productionTasksSheetPrintData";
import { getDeskSupervisorsForDate, replaceDeskSupervisorsForDate } from "services/deskSupervisorService";
import { getDeskCountForDate, replaceDeskCountForDate } from "services/deskCountService";
import { deskDisplayLabel } from "utils/deskSupervisorDisplay";
import {
  buildCinchoDayBoardRows,
  deliveredStatusMapFromApi,
  orderWorkAnchorYmd,
  workStatusMapFromApi,
} from "utils/cinchoDayBoardHelper";
import {
  getCinchoDayStatuses,
  setCinchoDayDelivered,
  setCinchoDayWorkStatus,
} from "services/cinchoDayStatusService";
import CinchosDayBoard from "./CinchosDayBoard";

const MAX_HOURS_PER_DESK = 4;

/** En tarjetas con fondo claro: Paper fuerza texto blanco en `.badge`, lo que deja cantidades ilegibles. */
const BADGE_READABLE_ON_LIGHT = {
  color: "#111827",
  backgroundColor: "#fff",
  border: "1px solid rgba(0,0,0,0.2)",
  fontWeight: 600,
};

/** Reordenar array por índice (para lista prioridad distribución). */
function reorderByIndex(prev, fromIndex, toIndex) {
  if (fromIndex === toIndex) return prev;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
  const next = [...prev];
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed);
  return next;
}

/** Para mostrar fecha de alta de OP en modal FIFO (acepta ISO string o array Jackson). */
function formatDistributionOpCreatedAt(createdAt) {
  if (createdAt == null) return "";
  if (typeof createdAt === "string") return formatDateTimeGt(createdAt);
  if (Array.isArray(createdAt) && createdAt.length >= 3) {
    const d = new Date(
      createdAt[0],
      (createdAt[1] || 1) - 1,
      createdAt[2] || 1,
      createdAt[3] || 0,
      createdAt[4] || 0,
      createdAt[5] || 0,
      createdAt[6] ? Math.floor(createdAt[6] / 1e6) : 0
    );
    return Number.isFinite(d.getTime()) ? formatDateTimeGt(d.toISOString()) : "";
  }
  return "";
}

/** Badges familia distribución — colores explícitos (evita texto blanco sobre fondo blanco con temas Badge). */
function DistribFamilyBadge({ family }) {
  const cfg = {
    OPV: { label: "OPV", short: "V", bg: "#0d47a1", fg: "#ffffff", subtle: "#e3f2fd" },
    OPK: { label: "OPK", short: "K", bg: "#37474f", fg: "#ffffff", subtle: "#eceff1" },
    OPI: { label: "OPI", short: "I", bg: "#6a1b9a", fg: "#ffffff", subtle: "#f3e5f5" },
  }[(family || "").toUpperCase()] || {
    label: family || "?",
    short: "?",
    bg: "#757575",
    fg: "#ffffff",
    subtle: "#f5f5f5",
  };
  return (
    <div
      className="d-flex align-items-center"
      title={cfg.label}
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: cfg.bg,
        color: cfg.fg,
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: -0.5,
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: "inset 0 -2px 0 rgba(0,0,0,0.15)",
      }}
      aria-hidden
    >
      {cfg.short}
    </div>
  );
}

const DroppableColumn = React.memo(function DroppableColumn({ id, header, count, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        width: 260,
        minWidth: 260,
        border: `1px solid ${isOver ? "#ffc107" : "#e0e0e0"}`,
        borderRadius: 8,
        background: isOver ? "#fff8e1" : "#fafafa",
      }}
    >
      <div style={{ padding: 10, borderBottom: "1px solid #eee", fontWeight: 700 }}>
        {header}
        <Badge color="light" className="ml-2 text-dark">{count}</Badge>
      </div>
      <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
});

const DraggableCard = React.memo(function DraggableCard({ id, title, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  const style = {
    background: "#fff",
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: 10,
    cursor: isDragging ? "grabbing" : "grab",
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    boxShadow: isDragging ? "0 10px 20px rgba(0,0,0,0.15)" : undefined,
  };
  return (
    <div ref={setNodeRef} style={style} title={title} {...listeners} {...attributes}>
      {children}
    </div>
  );
});

const DraggablePriorityRow = React.memo(function DraggablePriorityRow({ rowId, disabled, children }) {
  const droppableId = `prio-drop-${rowId}`;
  const draggableId = `prio-drag-${rowId}`;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: droppableId });
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: draggableId });

  return (
    <div
      ref={setDropRef}
      style={{
        outline: isOver ? "2px solid #f59e0b" : "none",
        outlineOffset: 2,
        borderRadius: 10,
        transition: "outline-color 120ms ease",
      }}
    >
      <div
        style={{
          transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
          transition: isDragging ? "none" : "transform 140ms ease",
          opacity: isDragging ? 0.4 : 1,
        }}
      >
        <div
          ref={setDragRef}
          {...listeners}
          {...attributes}
          role="presentation"
          aria-label="Arrastrar para reordenar"
          style={{
            cursor: disabled ? "not-allowed" : (isDragging ? "grabbing" : "grab"),
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
});

function RedistributeBoard({
  tasks,
  numDesks,
  date,
  setDate,
  onMove,
  deskTitleFor,
}) {
  const [activeItemId, setActiveItemId] = useState(null);

  const activeTasks = useMemo(() => (tasks || []).filter((t) => t && t.status !== "CANCELLED" && t.status !== "COMPLETED"), [tasks]);

  const items = useMemo(() => {
    const out = [];
    activeTasks.forEach((t) => {
      (t.items || []).forEach((it) => {
        if (!it?.id) return;
        out.push({
          taskId: t.id,
          taskCode: t.code,
          productionOrderCode: t.productionOrderCode,
          taskStatus: t.status,
          desk: t.desk || null,
          scheduledDate: t.scheduledDate || null,
          taskItemId: it.id,
          productCode: it.productCode,
          productName: it.productName,
          colorName: it.colorName,
          quantity: it.quantity,
          estimatedHours: it.estimatedHours,
        });
      });
    });
    return out;
  }, [activeTasks]);

  const containers = useMemo(() => {
    const list = [{ id: "unassigned", title: "Sin asignar" }];
    for (let d = 1; d <= (numDesks || 12); d++) {
      const title = typeof deskTitleFor === "function" ? deskTitleFor(d) : `Mesa ${d}`;
      list.push({ id: `desk-${d}`, title, desk: d });
    }
    return list;
  }, [numDesks, deskTitleFor]);

  const itemsByContainer = useMemo(() => {
    const map = {};
    containers.forEach((c) => { map[c.id] = []; });
    items.forEach((it) => {
      const isSameDate = !date || String(it.scheduledDate || "") === String(date || "");
      if (!isSameDate) return;
      const key = it.desk ? `desk-${it.desk}` : "unassigned";
      if (!map[key]) map[key] = [];
      map[key].push(it);
    });
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => (a.productionOrderCode || "").localeCompare(b.productionOrderCode || "") || (a.productCode || "").localeCompare(b.productCode || ""));
    });
    return map;
  }, [items, containers, date]);

  const findContainerForTaskItem = useCallback((taskItemId) => {
    const it = items.find((x) => String(x.taskItemId) === String(taskItemId));
    if (!it) return "unassigned";
    return it.desk ? `desk-${it.desk}` : "unassigned";
  }, [items]);

  const handleDragStart = useCallback((event) => {
    const id = event?.active?.id;
    if (!id) return;
    setActiveItemId(id);
  }, []);

  const handleDragEnd = useCallback(async (event) => {
    setActiveItemId(null);
    const activeId = event?.active?.id;
    const overId = event?.over?.id;
    if (!activeId || !overId) return;

    const taskItemId = String(activeId).startsWith("item-") ? Number(String(activeId).slice(5)) : null;
    if (!taskItemId) return;

    const from = findContainerForTaskItem(taskItemId);
    const to = String(overId);
    if (from === to) return;

    const targetDesk = to.startsWith("desk-") ? Number(to.slice(5)) : null;
    // Sin mesa: igual mantener la fecha del tablero para que los ítems queden en "Sin asignar" de ese día.
    const targetDate = date || null;
    await onMove({ taskItemId, targetDesk, targetDate });
  }, [date, findContainerForTaskItem, onMove]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const activeItem = useMemo(() => {
    if (!activeItemId) return null;
    const rawId = String(activeItemId).startsWith("item-") ? Number(String(activeItemId).slice(5)) : null;
    if (!rawId) return null;
    return items.find((x) => Number(x.taskItemId) === rawId) || null;
  }, [activeItemId, items]);

  return (
    <div>
      <Alert color="warning" className="mb-3">
        <strong>Redistribuir (manual)</strong>: mueve productos entre mesas para la fecha seleccionada. Esto no es el cronograma automático.
      </Alert>
      <Row className="mb-3">
        <Col md="3">
          <FormGroup className="mb-0">
            <Label><small>Fecha</small></Label>
            <Input type="date" bsSize="sm" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormGroup>
        </Col>
        <Col className="d-flex align-items-end">
          {activeItem?.taskItemId && <small className="text-muted">Moviendo item #{activeItem.taskItemId}…</small>}
        </Col>
      </Row>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div style={{ overflowX: "auto", paddingBottom: 8 }}>
          <div style={{ display: "flex", gap: 12, minWidth: 900 }}>
            {containers.map((c) => (
              <DroppableColumn
                key={c.id}
                id={c.id}
                header={c.title}
                count={(itemsByContainer[c.id] || []).length}
              >
                {(itemsByContainer[c.id] || []).map((it) => (
                  <DraggableCard
                    key={it.taskItemId}
                    id={`item-${it.taskItemId}`}
                    title={`Task ${it.taskCode} / OP ${it.productionOrderCode}`}
                  >
                      <div style={{ fontSize: 12 }}>
                        <Badge color="info" className="mr-1">{it.productionOrderCode}</Badge>
                        <Badge color="dark">{it.taskCode}</Badge>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <strong>{it.productCode}</strong> {it.productName}
                        {it.colorName && <span className="text-muted"> · {it.colorName}</span>}
                      </div>
                      <div className="text-muted" style={{ fontSize: 12, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                        <span>{it.quantity} uds</span>
                        <span>{Math.round((it.estimatedHours || 0) * 60)} min</span>
                      </div>
                  </DraggableCard>
                ))}
                {(itemsByContainer[c.id] || []).length === 0 && (
                  <div className="text-muted" style={{ fontSize: 12 }}>Arrastra aquí.</div>
                )}
              </DroppableColumn>
            ))}
          </div>
        </div>

        <DragOverlay>
          {activeItem ? (
            <div
              style={{
                background: "#fff",
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 10,
                width: 240,
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
              }}
            >
              <div style={{ fontSize: 12 }}>
                <Badge color="info" className="mr-1">{activeItem.productionOrderCode}</Badge>
                <Badge color="dark">{activeItem.taskCode}</Badge>
              </div>
              <div style={{ marginTop: 6 }}>
                <strong>{activeItem.productCode}</strong> {activeItem.productName}
                {activeItem.colorName && <span className="text-muted"> · {activeItem.colorName}</span>}
              </div>
              <div className="text-muted" style={{ fontSize: 12, marginTop: 4, display: "flex", justifyContent: "space-between" }}>
                <span>{activeItem.quantity} uds</span>
                <span>{Math.round((activeItem.estimatedHours || 0) * 60)} min</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

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
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDieCut, setFilterDieCut] = useState("all");
  const [printTaskId, setPrintTaskId] = useState(null);
  const [printBatchTaskIds, setPrintBatchTaskIds] = useState(null);
  const [printSupervisorByDesk, setPrintSupervisorByDesk] = useState(null);
  const [numDesks, setNumDesks] = useState(12);
  const [workingDesksCount, setWorkingDesksCount] = useState(12);
  const [distributionDate, setDistributionDate] = useState(new Date().toISOString().split("T")[0]);
  const [showDistributionPriorityModal, setShowDistributionPriorityModal] = useState(false);
  const [distributionPriorityRows, setDistributionPriorityRows] = useState([]);
  const [distributionModalLoading, setDistributionModalLoading] = useState(false);
  const [distributionApplying, setDistributionApplying] = useState(false);
  const [activePriorityRowId, setActivePriorityRowId] = useState(null);
  const [showQuickGuide, setShowQuickGuide] = useState(false);
  const [showDownloadOpsModal, setShowDownloadOpsModal] = useState(false);
  const [deskSupervisorsByDate, setDeskSupervisorsByDate] = useState({});
  const [showDeskSupervisorsModal, setShowDeskSupervisorsModal] = useState(false);
  const [deskSupervisorModalDate, setDeskSupervisorModalDate] = useState("");
  const [deskSupervisorDraft, setDeskSupervisorDraft] = useState([]);
  const [deskCountDraft, setDeskCountDraft] = useState(12);
  const [savingDeskSupervisors, setSavingDeskSupervisors] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [productionOrders, setProductionOrders] = useState([]);
  /** Órdenes activas OPL/OPCK/OPC (para cuadro cinchos del día). */
  const [productionOrdersForCinchos, setProductionOrdersForCinchos] = useState([]);
  const [cinchoDeliveredByDate, setCinchoDeliveredByDate] = useState({});
  const [cinchoWorkStatusByDate, setCinchoWorkStatusByDate] = useState({});
  const [cinchoStatusLoadingByDate, setCinchoStatusLoadingByDate] = useState({});
  const [cinchoSavingKey, setCinchoSavingKey] = useState(null);
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
  const [showOnlineSalesModal, setShowOnlineSalesModal] = useState(false);
  const [selectedModalItemIds, setSelectedModalItemIds] = useState(new Set());
  const [orderPickerSearch, setOrderPickerSearch] = useState("");
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
          if (isCinchoOrderType(orderType)) return false;
          if (orderHasOnlyCinchoLineItems(o)) return false;
          return true;
        })
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

  // Mueve un task_item entre mesas/fechas con UI optimista (estilo Jira).
  // No hace refetch global: aplica el cambio local inmediato y reconcilia
  // contra el response del backend al terminar (rollback en error).
  const handleMoveTaskItem = useCallback(async ({ taskItemId, targetDesk, targetDate }) => {
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
  }, []);

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

  const openDistributionPriorityModal = async () => {
    const start = distributionDate || filterDate || new Date().toISOString().split("T")[0];
    setShowDistributionPriorityModal(true);
    setDistributionModalLoading(true);
    setDistributionPriorityRows([]);
    try {
      const list = await getDistributionQueueProductionOrders(start, 5);
      const opCreatedMs = (r) => {
        const c = r.createdAt;
        if (c == null) return Number.MAX_SAFE_INTEGER;
        if (typeof c === "string") {
          const t = Date.parse(c);
          return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
        }
        if (Array.isArray(c) && c.length >= 3) {
          return new Date(c[0], (c[1] || 1) - 1, c[2] || 1, c[3] || 0, c[4] || 0, c[5] || 0, c[6] ? Math.floor(c[6] / 1e6) : 0).getTime();
        }
        return Number.MAX_SAFE_INTEGER;
      };
      const sorted = [...list].sort((a, b) => {
        const pa = a.schedulingPriority != null && a.schedulingPriority > 0 ? a.schedulingPriority : null;
        const pb = b.schedulingPriority != null && b.schedulingPriority > 0 ? b.schedulingPriority : null;
        if (pa != null && pb != null && pa !== pb) return pa - pb;
        if (pa != null && pb == null) return -1;
        if (pa == null && pb != null) return 1;
        const ta = opCreatedMs(a);
        const tb = opCreatedMs(b);
        if (ta !== tb) return ta - tb;
        return (Number(a.id) || 0) - (Number(b.id) || 0);
      });
      setDistributionPriorityRows(sorted.map((r) => ({ ...r })));
    } catch (err) {
      showError(err.message || "No se pudo cargar la cola de ordenes");
    } finally {
      setDistributionModalLoading(false);
    }
  };

  const distributionDndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handlePriorityDragStart = useCallback((event) => {
    const id = String(event?.active?.id || "");
    if (!id.startsWith("prio-drag-")) return;
    const rowId = id.slice("prio-drag-".length);
    setActivePriorityRowId(rowId || null);
  }, []);

  const handlePriorityDragEnd = useCallback((event) => {
    setActivePriorityRowId(null);
    const activeId = String(event?.active?.id || "");
    const overId = String(event?.over?.id || "");
    if (!activeId.startsWith("prio-drag-") || !overId.startsWith("prio-drop-")) return;

    const fromRowId = activeId.slice("prio-drag-".length);
    const toRowId = overId.slice("prio-drop-".length);
    if (!fromRowId || !toRowId || fromRowId === toRowId) return;

    setDistributionPriorityRows((prev) => {
      const fromIndex = prev.findIndex((r) => String(r?.id) === String(fromRowId));
      const toIndex = prev.findIndex((r) => String(r?.id) === String(toRowId));
      return reorderByIndex(prev, fromIndex, toIndex);
    });
  }, []);

  const handleApplyDistributionPriorities = async () => {
    const start = distributionDate || filterDate || new Date().toISOString().split("T")[0];
    const desksToUse = Math.max(1, Math.min(numDesks, parseInt(workingDesksCount, 10) || numDesks));
    const pri = {};
    distributionPriorityRows.forEach((r, idx) => {
      pri[String(r.id)] = idx + 1;
    });
    setDistributionApplying(true);
    try {
      const result = await planTasksWindow(
        start,
        desksToUse,
        5,
        undefined,
        Object.keys(pri).length > 0 ? pri : undefined
      );
      showSuccess(result.message || "Distribucion completada");
      setShowDistributionPriorityModal(false);
      await loadTasks();
    } catch (err) {
      showError(err.message || "No se pudo distribuir tareas del dia");
    } finally {
      setDistributionApplying(false);
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

  const closeGenerateModal = () => {
    setShowGenerateModal(false);
    setSelectedOrderId("");
    setSelectedModalItemIds(new Set());
    setOrderPickerSearch("");
  };

  const handleGenerateTasksFromOrder = async () => {
    if (!selectedOrderId) {
      showError("Seleccione una orden de produccion");
      return;
    }
    if (selectedModalItemIds.size === 0) {
      showError("Seleccione al menos un producto para enviar a mesas");
      return;
    }
    try {
      setGeneratingOrderTasks(true);
      const productionOrderId = parseInt(selectedOrderId, 10);
      const desksToUse = Math.max(1, Math.min(numDesks, parseInt(workingDesksCount, 10) || numDesks));
      const startDate = distributionDate || filterDate || new Date().toISOString().split("T")[0];

      const planned = collectPlannedOrderItemIds(tasks, productionOrderId);
      const itemIds = Array.from(selectedModalItemIds).filter((id) => !planned.has(Number(id)));
      if (itemIds.length === 0) {
        showError("Los productos seleccionados ya tienen tareas en mesas");
        return;
      }
      const result = await generateTasksForSelectedItems(productionOrderId, itemIds);
      showSuccess(`Se generaron ${result.length || 0} tarea(s) para ${itemIds.length} producto(s)`);

      await planTasksWindow(startDate, desksToUse, 5, productionOrderId);

      closeGenerateModal();
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
      setShowOnlineSalesModal(false);
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

  /** Tareas visibles en centro de producción (mesas): sin OPC/cinchos ni líneas cincho. */
  const tableCenterTasks = useMemo(
    () => buildTableCenterTasks(tasks, productionOrders),
    [tasks, productionOrders]
  );

  const ordersForDownload = useMemo(
    () => mergeOrdersForDownload(productionOrders, productionOrdersForCinchos),
    [productionOrders, productionOrdersForCinchos]
  );

  /** Órdenes que aún tienen al menos un producto sin tarea en mesas. */
  const ordersWithPendingItems = useMemo(() => {
    return (productionOrders || []).filter((o) => {
      if (!o?.id) return false;
      if (isCinchoOrderType(o.orderType)) return false;
      return orderHasPendingItemsForTasks(tasks, o);
    });
  }, [productionOrders, tasks]);

  /** OPs con al menos una tarea activa (p. ej. ventas online generadas por orden completa). */
  const ordersWithActiveTasks = useMemo(() => {
    const ids = new Set();
    (tasks || []).forEach((t) => {
      if (!t || t.status === "CANCELLED") return;
      if (t.productionOrderId != null) ids.add(Number(t.productionOrderId));
    });
    return ids;
  }, [tasks]);

  const uniqueDesks = useMemo(
    () => [...new Set(tableCenterTasks.map((t) => t.desk).filter(Boolean))].sort((a, b) => a - b),
    [tableCenterTasks]
  );

  const uniqueDates = useMemo(
    () => [...new Set(tableCenterTasks.map((t) => t.scheduledDate).filter(Boolean))].sort(),
    [tableCenterTasks]
  );

  const filteredTasks = useMemo(() => {
    return tableCenterTasks.filter((task) => {
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
  }, [tableCenterTasks, filterDesk, filterDate, filterStatus, filterDieCut, searchTerm]);

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
    const desks = scheduleByDate[date] || {};
    const ids = Object.values(desks)
      .flat()
      .filter((t) => t.status !== "CANCELLED" && t.status !== "COMPLETED")
      .map((t) => t.id)
      .filter(Boolean);
    if (!ids.length) {
      showError("No hay tareas para imprimir en esta fecha.");
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

  const scheduleViewDates = useMemo(() => {
    if (filterDate) return [filterDate];
    const dates = new Set(Object.keys(scheduleByDate || {}));
    Object.keys(cinchoRowsByDate).forEach((d) => dates.add(d));
    return [...dates].sort();
  }, [scheduleByDate, cinchoRowsByDate, filterDate]);

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

  const tasksSheetPrintModel = useMemo(() => {
    const todayGt = getTodayYmdGuatemala();
    return buildProductionTasksSheetPrintModel(tableCenterTasks, productionOrders, {
      deskSupervisorByDesk: supervisorMapForDate(todayGt),
      numDesksForLegend: workingDesksCount,
    });
  }, [tableCenterTasks, productionOrders, supervisorMapForDate, workingDesksCount]);

  const handlePrintTasksSheet = useCallback(() => {
    openProductionTasksSheetPrintWindow(tasksSheetPrintModel, "Hoja de tareas (centro de producción)");
  }, [tasksSheetPrintModel]);

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
                    title="PDF del subconjunto actual (filtros aplicados)"
                  >
                    <i className="nc-icon nc-paper mr-1" />
                    Hoja PDF
                  </Button>
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    className="mb-0"
                    onClick={() => setShowDownloadOpsModal(true)}
                    disabled={loading || ordersForDownload.length === 0}
                    title="Imprimir o descargar OPs seleccionadas (mismo formato que orden individual)"
                  >
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
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
                          onClick={() => setShowOnlineSalesModal(true)}
                          disabled={generatingOnlineSalesTasks}
                          title="Ver órdenes de venta online pendientes y generar sus tareas"
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
                      <Button
                        color="warning"
                        size="sm"
                        block
                        onClick={openDistributionPriorityModal}
                        disabled={loading || distributionModalLoading || distributionApplying}
                      >
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
                                  const todayStr = distributionDate || filterDate || new Date().toISOString().split("T")[0];
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
                          const cinchoRows = cinchoRowsByDate[date] || [];
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
                                        title="Imprimir todas las boletas de tarea del día"
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
        tasks={tasks}
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
            <li className="mb-1"><strong>Generar tareas</strong> desde la orden de produccion.</li>
            <li className="mb-1"><strong>Completar prerequisitos</strong>: cuero y troquelado (materiales se entrega en Vista Materiales).</li>
            <li className="mb-1"><strong>Distribuir dia</strong>: abre prioridad por OP (OPV/OPK/OPI) y luego planifica mesas.</li>
            <li className="mb-1"><strong>Monitorear cronograma</strong> y cambiar estados (iniciar, pausar, completar).</li>
          </ol>
          <Alert color="light" style={{ border: "1px solid #e2e8f0" }}>
            Consejo: Distribuir mesas respeta esta prioridad por OP (podés reordenar con arrastre) y reparte tareas de la OP #1 en todas las mesas posibles antes de pasar a la siguiente. Se toman todas las tareas PENDING (aunque tengan fecha vieja o futura).
          </Alert>
        </ModalBody>
      </Modal>

      <Modal
        isOpen={showDistributionPriorityModal}
        toggle={() => {
          if (!distributionApplying) setShowDistributionPriorityModal(false);
        }}
        size="xl"
        contentClassName="border-0 shadow"
        style={{ maxWidth: 980 }}
      >
        <div
          style={{
            borderBottom: "1px solid #e2e8f0",
            background: "linear-gradient(135deg, #fafbfc 0%, #f1f5f9 100%)",
            padding: "14px 20px 12px",
            borderRadius: "0.3rem 0.3rem 0 0",
          }}
        >
          <button
            type="button"
            className="close float-right mt-1"
            aria-label="Cerrar"
            disabled={distributionApplying}
            onClick={() => {
              if (!distributionApplying) setShowDistributionPriorityModal(false);
            }}
          >
            <span aria-hidden>&times;</span>
          </button>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Planificar día
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#1e293b" }}>Prioridad entre órdenes (FIFO)</div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, maxWidth: 560 }}>
            <strong style={{ color: "#334155" }}>Cola tipo FIFO:</strong> la OP creada hace más tiempo va arriba; debajo las más nuevas.
            Arrastra solo si necesitas cambiar ese orden estándar. Arriba = primero en el reparto del día.
          </div>
        </div>
        <ModalBody className="pt-3" style={{ background: "#f8fafc", maxHeight: "min(78vh, 720px)", overflowY: "auto" }}>
          <div
            className="mb-3 pb-3"
            style={{
              borderBottom: "1px solid #e2e8f0",
              padding: "10px 12px",
              background: "#ffffff",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 8 }}>
              Familias
            </div>
            <div className="d-flex flex-column" style={{ gap: 10 }}>
              <span className="d-flex align-items-start" style={{ gap: 10, fontSize: 13, color: "#334155", lineHeight: 1.4 }}>
                <DistribFamilyBadge family="OPV" />
                <span>
                  <strong>OPV</strong> — órdenes <strong>Luis Felipe</strong> (marcas conocidas); incluye la lógica de OP marcas como en el alta de orden.
                </span>
              </span>
              <span className="d-flex align-items-start" style={{ gap: 10, fontSize: 13, color: "#334155", lineHeight: 1.4 }}>
                <DistribFamilyBadge family="OPK" />
                <span>
                  <strong>OPK</strong> — productos tipo normal (corr. OP estándar).
                </span>
              </span>
              <span className="d-flex align-items-start" style={{ gap: 10, fontSize: 13, color: "#334155", lineHeight: 1.4 }}>
                <DistribFamilyBadge family="OPI" />
                <span>
                  <strong>OPI</strong> — producción interna.
                </span>
              </span>
            </div>
          </div>
          {distributionModalLoading ? (
            <div className="text-center py-5 px-3">
              <Progress striped animated color="warning" value={80} style={{ height: 6 }} className="mb-3 mx-auto rounded-pill" />
              <div className="text-muted small font-weight-semibold">Cargando órdenes elegibles…</div>
            </div>
          ) : distributionPriorityRows.length === 0 ? (
            <div
              className="text-center py-4 px-3 rounded mb-0"
              style={{ background: "#fff", border: "1px dashed #cbd5e1", color: "#64748b" }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
                Lista vacía para este criterio
              </div>
              <p className="small mb-0" style={{ lineHeight: 1.55 }}>
                No aparecen OPV, OPK u OPI con tareas pendientes en la ventana y sin proceso iniciado.
                Puede igualmente <strong>distribuir</strong> para planificar el resto de tareas (OPL u otras).
              </p>
            </div>
          ) : (
            <>
              <p className="small mb-2" style={{ fontWeight: 600, color: "#475569" }}>
                Orden inicial <strong>FIFO</strong> por fecha de alta de la OP. Arrastra desde <span className="text-muted font-weight-normal">(≡)</span> si quieres saltar esa cola estándar. El número refleja el lugar que se aplicará al guardar.
              </p>
              <DndContext
                sensors={distributionDndSensors}
                onDragStart={handlePriorityDragStart}
                onDragEnd={handlePriorityDragEnd}
              >
                <div role="list" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {distributionPriorityRows.map((r, idx) => (
                    <DraggablePriorityRow key={r.id} rowId={String(r.id)} disabled={distributionApplying}>
                      <div
                        role="listitem"
                        className="d-flex align-items-stretch rounded"
                        style={{
                          background: "#fff",
                          border: "1px solid #e2e8f0",
                          overflow: "hidden",
                          boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
                        }}
                      >
                        <div
                          className="d-flex align-items-center justify-content-center flex-shrink-0"
                          title="Arrastrar para reordenar"
                          style={{
                            width: 40,
                            background: "#e2e8f0",
                            color: "#475569",
                            cursor: distributionApplying ? "not-allowed" : "grab",
                            fontSize: 16,
                            lineHeight: 1,
                            userSelect: "none",
                            borderRight: "1px solid #cbd5e1",
                            fontFamily: "system-ui, sans-serif",
                          }}
                        >
                          ≡
                        </div>
                        <div
                          style={{
                            width: 48,
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#f8fafc",
                            borderRight: "1px solid #e2e8f0",
                            fontWeight: 800,
                            fontSize: 18,
                            color: "#0f172a",
                          }}
                        >
                          {idx + 1}
                        </div>
                        <div
                          style={{
                            width: 4,
                            flexShrink: 0,
                            background:
                              r.family === "OPV" ? "#0d47a1" : r.family === "OPK" ? "#37474f" : "#6a1b9a",
                          }}
                        />
                        <div className="d-flex align-items-center flex-grow-1 flex-wrap px-3 py-2" style={{ gap: 12, minWidth: 0 }}>
                          <DistribFamilyBadge family={r.family} />
                          <div className="flex-grow-1" style={{ minWidth: 140 }}>
                            <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", letterSpacing: "-0.02em" }}>
                              {r.code}
                            </div>
                            <div className="d-flex align-items-center flex-wrap" style={{ gap: 6, marginTop: 4 }}>
                              <span
                                className="text-uppercase"
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#64748b",
                                  background: "#f1f5f9",
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                }}
                              >
                                {r.orderType}
                              </span>
                              {r.family === "OPV" && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#0d47a1",
                                    background: "#e3f2fd",
                                    padding: "2px 6px",
                                    borderRadius: 4,
                                  }}
                                >
                                  Luis Felipe
                                </span>
                              )}
                              {r.customerName && (
                                <span className="text-muted small text-truncate" style={{ maxWidth: 220 }} title={r.customerName}>
                                  {r.customerName}
                                </span>
                              )}
                              {formatDistributionOpCreatedAt(r.createdAt) && (
                                <span className="text-muted small ml-1" title="orden FIFO por creación">
                                  Alta: {formatDistributionOpCreatedAt(r.createdAt)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </DraggablePriorityRow>
                  ))}
                </div>

                <DragOverlay>
                  {activePriorityRowId ? (
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        padding: 10,
                        width: 520,
                        boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
                      }}
                    >
                      <div className="text-muted small" style={{ fontWeight: 700 }}>
                        Reordenando…
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            </>
          )}
          {!distributionModalLoading && distributionPriorityRows.length > 0 && (
            <p className="small text-muted mb-0 mt-3" style={{ lineHeight: 1.45 }}>
              Otras órdenes (p. ej. ventas en línea OPL) se planifican después, con la lógica habitual de fechas y carga.
            </p>
          )}
        </ModalBody>
        <ModalFooter style={{ background: "#fff", borderTop: "1px solid #e2e8f0" }} className="justify-content-between">
          <small className="text-muted mr-2 d-none d-md-block">
            Fecha de trabajo según pantalla principal
          </small>
          <div>
            <Button
              color="link"
              className="text-secondary mr-md-2 p-2"
              onClick={() => setShowDistributionPriorityModal(false)}
              disabled={distributionApplying}
            >
              Cerrar
            </Button>
            <Button
              style={{
                fontWeight: 700,
                background: "#f59e0b",
                border: "none",
                color: "#1c1917",
                borderRadius: 8,
              }}
              onClick={handleApplyDistributionPriorities}
              disabled={distributionApplying || distributionModalLoading}
            >
              {distributionApplying ? "Distribuyendo…" : "Aplicar y distribuir día"}
            </Button>
          </div>
        </ModalFooter>
      </Modal>

      <Modal isOpen={showGenerateModal} toggle={() => { if (!generatingOrderTasks) closeGenerateModal(); }} size="lg">
        {/* Header limpio sin bordes */}
        <div style={{ padding: "24px 28px 0" }}>
          <div className="d-flex align-items-start justify-content-between">
            <div>
              <h4 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Enviar a mesas</h4>
              <p style={{ color: "#64748b", fontSize: 13, margin: "4px 0 0" }}>
                Seleccioná los productos de la orden que irán a producción
              </p>
            </div>
            <button
              type="button"
              onClick={() => { if (!generatingOrderTasks) closeGenerateModal(); }}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "#94a3b8", fontSize: 20, lineHeight: 1, padding: 4,
              }}
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>

          {/* Order picker con búsqueda */}
          {(() => {
            const availableOrders = ordersWithPendingItems;
            const q = orderPickerSearch.trim().toLowerCase();
            const filteredOrders = q
              ? availableOrders.filter(
                  (o) =>
                    (o.code || "").toLowerCase().includes(q) ||
                    (o.customerName || "").toLowerCase().includes(q) ||
                    (o.sellerName || "").toLowerCase().includes(q)
                )
              : availableOrders;

            const getBadge = (order) => {
              const code = (order.code || "").toUpperCase();
              if (code.startsWith("OPCK")) return { label: "KIOSC", color: "#92400e", bg: "#fef3c7", border: "#fcd34d" };
              if (order.orderType === "VENTA_EN_LINEA") return { label: "WEB", color: "#065f46", bg: "#d1fae5", border: "#6ee7b7" };
              if (order.orderType === "DISTRIBUTION") return { label: "DIST", color: "#1e40af", bg: "#dbeafe", border: "#93c5fd" };
              if (code.startsWith("OPV")) return { label: "VENTA", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" };
              if (code.startsWith("OPI")) return { label: "INTER", color: "#6d28d9", bg: "#ede9fe", border: "#c4b5fd" };
              return { label: "OP", color: "#374151", bg: "#f3f4f6", border: "#d1d5db" };
            };

            const selectedOrder = availableOrders.find((o) => String(o.id) === String(selectedOrderId));

            return (
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                  Orden de Producción
                </label>

                {/* Si hay una seleccionada, mostrar resumen compacto con opción de cambiar */}
                {selectedOrder ? (
                  <div style={{
                    border: "2px solid #6366f1", borderRadius: 12, padding: "12px 16px",
                    background: "#f5f3ff", display: "flex", alignItems: "center", gap: 12,
                  }}>
                    {(() => { const b = getBadge(selectedOrder); return (
                      <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: b.bg, color: b.color, border: `1px solid ${b.border}`, flexShrink: 0 }}>
                        {b.label}
                      </span>
                    ); })()}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {selectedOrder.customerName || selectedOrder.code}
                      </div>
                      <div style={{ fontSize: 11, color: "#6366f1", fontWeight: 600 }}>
                        {selectedOrder.code}
                        {selectedOrder.deliveryDate && (
                          <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 8 }}>
                            Entrega: {formatDateGt ? formatDateGt(selectedOrder.deliveryDate) : selectedOrder.deliveryDate}
                          </span>
                        )}
                        {(() => {
                          const { onTable, total } = countPlannedItemsForOrder(tasks, selectedOrder);
                          if (onTable <= 0) return null;
                          return (
                            <span style={{ color: "#059669", fontWeight: 600, marginLeft: 8 }}>
                              · {onTable}/{total} en mesa
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedOrderId(""); setSelectedModalItemIds(new Set()); setOrderPickerSearch(""); }}
                      disabled={generatingOrderTasks}
                      style={{ background: "none", border: "1.5px solid #a5b4fc", borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 600, color: "#4f46e5", cursor: "pointer" }}
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  /* Buscador + lista */
                  <div>
                    <div style={{ position: "relative", marginBottom: 8 }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 16, pointerEvents: "none" }}>
                        🔍
                      </span>
                      <input
                        type="text"
                        placeholder="Buscar por código, cliente o vendedor..."
                        value={orderPickerSearch}
                        onChange={(e) => setOrderPickerSearch(e.target.value)}
                        disabled={generatingOrderTasks}
                        style={{
                          width: "100%", padding: "10px 14px 10px 38px",
                          borderRadius: 10, border: "1.5px solid #e2e8f0",
                          fontSize: 13, color: "#1e293b", outline: "none",
                          background: "#f8fafc",
                        }}
                      />
                      {orderPickerSearch && (
                        <button type="button" onClick={() => setOrderPickerSearch("")}
                          style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1 }}>
                          ×
                        </button>
                      )}
                    </div>

                    <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, paddingRight: 2 }}>
                      {filteredOrders.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "24px 0", color: "#94a3b8", fontSize: 13 }}>
                          {q ? `Sin resultados para "${orderPickerSearch}"` : "No hay órdenes disponibles"}
                        </div>
                      ) : filteredOrders.map((order) => {
                        const badge = getBadge(order);
                        const itemCount = (order.items || []).length;
                        const { onTable, total } = countPlannedItemsForOrder(tasks, order);
                        return (
                          <div
                            key={order.id}
                            onClick={() => !generatingOrderTasks && (setSelectedOrderId(String(order.id)), setSelectedModalItemIds(new Set()), setOrderPickerSearch(""))}
                            style={{
                              border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "10px 14px",
                              cursor: generatingOrderTasks ? "default" : "pointer",
                              background: "#fff", display: "flex", alignItems: "center", gap: 12,
                              transition: "border-color 0.12s, background 0.12s",
                            }}
                            onMouseEnter={(e) => { if (!generatingOrderTasks) { e.currentTarget.style.borderColor = "#6366f1"; e.currentTarget.style.background = "#fafafe"; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#fff"; }}
                          >
                            {/* Badge tipo */}
                            <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0, letterSpacing: "0.04em" }}>
                              {badge.label}
                            </span>

                            {/* Info principal */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {order.customerName || order.code}
                              </div>
                              <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                                <span style={{ fontWeight: 600, color: "#475569" }}>{order.code}</span>
                                {order.sellerName && <span style={{ marginLeft: 6 }}>· {order.sellerName}</span>}
                              </div>
                            </div>

                            {/* Fecha + items */}
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              {order.deliveryDate && (
                                <div style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>
                                  {formatDateGt ? formatDateGt(order.deliveryDate) : order.deliveryDate}
                                </div>
                              )}
                              {itemCount > 0 && (
                                <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                                  {onTable > 0 ? `${onTable}/${total} en mesa · ` : ""}{itemCount} prod.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {availableOrders.length > 0 && filteredOrders.length > 0 && (
                      <p style={{ fontSize: 11, color: "#94a3b8", margin: "6px 0 0", textAlign: "right" }}>
                        {filteredOrders.length} de {availableOrders.length} órdenes
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#f1f5f9", margin: "4px 0 0" }} />

        <ModalBody style={{ padding: "20px 28px", maxHeight: "44vh", overflowY: "auto" }}>
          {!selectedOrderId ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📦</div>
              <p style={{ fontWeight: 500, color: "#64748b", marginBottom: 4 }}>Ninguna orden seleccionada</p>
              <p style={{ fontSize: 13, margin: 0 }}>Elige una orden arriba para ver sus productos</p>
            </div>
          ) : (() => {
            const order = productionOrders.find((o) => Number(o.id) === Number(selectedOrderId));
            if (!order) return null;
            const items = order.items || [];
            const plannedMap = collectPlannedOrderItemIds(tasks, order.id);
            const pendingItems = items.filter((it) => !plannedMap.has(Number(it.id)));
            const onTableItems = items.filter((it) => plannedMap.has(Number(it.id)));
            const allSelected = pendingItems.length > 0 && pendingItems.every((it) => selectedModalItemIds.has(it.id));

            const renderItemChips = (item, variant) => {
              const isPending = variant === "pending";
              const checked = isPending && selectedModalItemIds.has(item.id);
              return (
                <>
                  <div style={{
                    fontWeight: 700, fontSize: 14, paddingRight: isPending ? 32 : 0,
                    color: checked ? "#15803d" : "#1e293b",
                    marginBottom: 8, lineHeight: 1.3,
                  }}>
                    {item.productName || `Producto #${item.productId}`}
                  </div>
                  <div className="d-flex align-items-center" style={{ gap: 6, flexWrap: "wrap" }}>
                    {item.colorName && (
                      <span style={{
                        display: "inline-flex", alignItems: "center",
                        padding: "3px 10px",
                        background: checked ? "#dcfce7" : "#f1f5f9",
                        borderRadius: 20, fontSize: 11,
                        color: checked ? "#15803d" : "#475569",
                        fontWeight: 500,
                      }}>
                        {item.colorName}
                      </span>
                    )}
                    <span style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "3px 10px",
                      background: checked ? "#dcfce7" : "#f8fafc",
                      border: `1px solid ${checked ? "#86efac" : "#e2e8f0"}`,
                      borderRadius: 20, fontSize: 11,
                      color: checked ? "#15803d" : "#64748b",
                      fontWeight: 600,
                    }}>
                      × {item.quantity} uds.
                    </span>
                  </div>
                </>
              );
            };

            const toggleItem = (itemId) => {
              setSelectedModalItemIds((prev) => {
                const next = new Set(prev);
                if (next.has(itemId)) next.delete(itemId);
                else next.add(itemId);
                return next;
              });
            };

            const toggleAll = () => {
              if (allSelected) {
                setSelectedModalItemIds(new Set());
              } else {
                setSelectedModalItemIds(new Set(pendingItems.map((it) => it.id)));
              }
            };

            if (items.length === 0) {
              return (
                <div style={{ textAlign: "center", padding: "32px 0", color: "#94a3b8" }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>⚠️</div>
                  <p style={{ color: "#64748b", fontWeight: 500 }}>Esta orden no tiene productos registrados</p>
                </div>
              );
            }

            return (
              <div>
                {onTableItems.length > 0 && (
                  <div style={{ marginBottom: pendingItems.length > 0 ? 22 : 0 }}>
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: "#64748b",
                      textTransform: "uppercase", letterSpacing: "0.04em",
                      marginBottom: 10, display: "flex", alignItems: "center", gap: 8,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#94a3b8" }} />
                      Ya en mesas ({onTableItems.length})
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                      {onTableItems.map((item) => {
                        const info = plannedMap.get(Number(item.id)) || {};
                        const statusLabels = {
                          PENDING: "Pendiente",
                          IN_PROGRESS: "En proceso",
                          COMPLETED: "Completada",
                        };
                        return (
                          <div
                            key={item.id}
                            style={{
                              border: "1.5px solid #cbd5e1",
                              borderRadius: 12,
                              padding: "14px 16px",
                              background: "#f8fafc",
                              opacity: 0.92,
                            }}
                          >
                            {renderItemChips(item, "onTable")}
                            <div style={{
                              marginTop: 10, paddingTop: 10,
                              borderTop: "1px dashed #cbd5e1",
                              fontSize: 11, color: "#64748b", lineHeight: 1.5,
                            }}>
                              {info.taskCode && <div><strong style={{ color: "#475569" }}>{info.taskCode}</strong></div>}
                              <div>
                                {info.desk != null && <span>Mesa {info.desk}</span>}
                                {info.scheduledDate && (
                                  <span>{info.desk != null ? " · " : ""}{formatDateGt ? formatDateGt(info.scheduledDate) : info.scheduledDate}</span>
                                )}
                              </div>
                              {info.status && (
                                <div style={{ marginTop: 2, color: "#059669", fontWeight: 600 }}>
                                  {statusLabels[info.status] || info.status}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {pendingItems.length > 0 ? (
                  <div>
                    <div className="d-flex align-items-center justify-content-between" style={{ marginBottom: 14 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: "#15803d",
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} />
                        Pendientes ({pendingItems.length})
                      </div>
                      <button
                        type="button"
                        onClick={toggleAll}
                        disabled={generatingOrderTasks}
                        style={{
                          background: allSelected ? "#f1f5f9" : "#eff6ff",
                          border: `1.5px solid ${allSelected ? "#cbd5e1" : "#bfdbfe"}`,
                          borderRadius: 20,
                          padding: "4px 14px",
                          fontSize: 12,
                          fontWeight: 600,
                          color: allSelected ? "#475569" : "#2563eb",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        {allSelected ? "✕ Quitar todos" : "✓ Seleccionar todos"}
                      </button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                      {pendingItems.map((item) => {
                        const checked = selectedModalItemIds.has(item.id);
                        return (
                          <div
                            key={item.id}
                            onClick={() => !generatingOrderTasks && toggleItem(item.id)}
                            style={{
                              border: `2px solid ${checked ? "#16a34a" : "#e2e8f0"}`,
                              borderRadius: 12,
                              padding: "14px 16px",
                              cursor: generatingOrderTasks ? "default" : "pointer",
                              background: checked ? "#f0fdf4" : "#ffffff",
                              transition: "border-color 0.15s, background 0.15s, box-shadow 0.15s",
                              boxShadow: checked ? "0 0 0 3px rgba(22,163,74,0.12)" : "0 1px 3px rgba(0,0,0,0.06)",
                              position: "relative",
                              userSelect: "none",
                            }}
                          >
                            <div style={{
                              position: "absolute", top: 12, right: 12,
                              width: 22, height: 22, borderRadius: "50%",
                              background: checked ? "#16a34a" : "#e2e8f0",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "background 0.15s",
                              flexShrink: 0,
                            }}>
                              {checked && (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                  <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                            {renderItemChips(item, "pending")}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <Alert color="success" className="mb-0" style={{ fontSize: 13 }}>
                    Todos los productos de esta orden ya tienen tareas en mesas.
                  </Alert>
                )}
              </div>
            );
          })()}
        </ModalBody>

        {/* Footer con resumen */}
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "16px 28px" }}>
          {selectedModalItemIds.size > 0 && (
            <div style={{
              background: "#f0fdf4", border: "1px solid #bbf7d0",
              borderRadius: 10, padding: "10px 16px",
              fontSize: 13, color: "#15803d", fontWeight: 500,
              marginBottom: 14,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="#16a34a" strokeWidth="1.5"/>
                <path d="M5 8l2 2 4-4" stroke="#16a34a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {selectedModalItemIds.size} producto{selectedModalItemIds.size !== 1 ? "s" : ""} seleccionado{selectedModalItemIds.size !== 1 ? "s" : ""} — se generarán tareas para estos productos
            </div>
          )}
          <div className="d-flex justify-content-end" style={{ gap: 10 }}>
            <Button
              color="secondary"
              outline
              onClick={closeGenerateModal}
              disabled={generatingOrderTasks}
              style={{ borderRadius: 8, padding: "8px 20px", fontWeight: 600 }}
            >
              Cancelar
            </Button>
            <Button
              color="success"
              onClick={handleGenerateTasksFromOrder}
              disabled={generatingOrderTasks || !selectedOrderId || selectedModalItemIds.size === 0}
              style={{
                borderRadius: 8, padding: "8px 24px", fontWeight: 700,
                minWidth: 180, fontSize: 14,
                background: selectedModalItemIds.size > 0 ? "#16a34a" : undefined,
                borderColor: selectedModalItemIds.size > 0 ? "#16a34a" : undefined,
              }}
            >
              {generatingOrderTasks ? (
                <span>⏳ Generando...</span>
              ) : selectedModalItemIds.size > 0 ? (
                <span>Enviar a mesas ({selectedModalItemIds.size})</span>
              ) : (
                <span style={{ opacity: 0.7 }}>Seleccioná productos</span>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showOnlineSalesModal}
        toggle={() => { if (!generatingOnlineSalesTasks) setShowOnlineSalesModal(false); }}
        size="lg"
      >
        <ModalHeader toggle={() => { if (!generatingOnlineSalesTasks) setShowOnlineSalesModal(false); }}>
          Generar Tareas — Ventas Online
        </ModalHeader>
        <ModalBody>
          {(() => {
            const onlineOrders = productionOrders.filter(
              (o) => String(o.orderType || "").toUpperCase() === "VENTA_EN_LINEA"
            );
            const pendingOrders = onlineOrders.filter((o) => !ordersWithActiveTasks.has(Number(o.id)));
            const doneOrders = onlineOrders.filter((o) => ordersWithActiveTasks.has(Number(o.id)));

            if (onlineOrders.length === 0) {
              return (
                <Alert color="info">
                  No hay órdenes de venta online activas sin completar.
                </Alert>
              );
            }

            return (
              <>
                {pendingOrders.length > 0 && (
                  <>
                    <h6 className="text-success mb-2">
                      <i className="nc-icon nc-check-2 mr-1" />
                      Se generarán tareas para ({pendingOrders.length}):
                    </h6>
                    {pendingOrders.map((order) => {
                      const items = order.items || [];
                      return (
                        <div
                          key={order.id}
                          className="border rounded p-2 mb-2"
                          style={{ borderColor: "#28a745" }}
                        >
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <strong>{order.code}</strong>
                            <span className="text-muted" style={{ fontSize: 12 }}>
                              {order.customerName}
                            </span>
                          </div>
                          {items.length > 0 && (
                            <Table size="sm" bordered className="mb-0">
                              <thead>
                                <tr>
                                  <th>Producto</th>
                                  <th>Color</th>
                                  <th style={{ textAlign: "right" }}>Cant.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item) => (
                                  <tr key={item.id}>
                                    <td>{item.productName || `#${item.productId}`}</td>
                                    <td>{item.colorName || "—"}</td>
                                    <td style={{ textAlign: "right" }}>{item.quantity}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          )}
                          {items.length === 0 && (
                            <small className="text-muted">Sin productos registrados.</small>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}

                {doneOrders.length > 0 && (
                  <>
                    <h6 className="text-muted mt-3 mb-2">
                      Ya tienen tareas — se omitirán ({doneOrders.length}):
                    </h6>
                    {doneOrders.map((order) => (
                      <div
                        key={order.id}
                        className="border rounded p-2 mb-2"
                        style={{ opacity: 0.55, background: "#f8f8f8" }}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <strong>{order.code}</strong>
                          <span className="text-muted" style={{ fontSize: 12 }}>
                            {order.customerName}
                          </span>
                          <Badge color="secondary" style={{ fontSize: 10 }}>
                            Ya en producción
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {pendingOrders.length === 0 && (
                  <Alert color="warning" className="mt-2">
                    Todas las órdenes de venta online ya tienen tareas generadas.
                  </Alert>
                )}
              </>
            );
          })()}
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            onClick={() => setShowOnlineSalesModal(false)}
            disabled={generatingOnlineSalesTasks}
          >
            Cancelar
          </Button>
          <Button
            color="info"
            onClick={handleGenerateOnlineSalesTasks}
            disabled={
              generatingOnlineSalesTasks ||
              productionOrders.filter(
                (o) =>
                  String(o.orderType || "").toUpperCase() === "VENTA_EN_LINEA" &&
                  !ordersWithActiveTasks.has(Number(o.id))
              ).length === 0
            }
          >
            {generatingOnlineSalesTasks ? "Generando..." : "Generar Tareas"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default TasksByTable;
