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
  ButtonGroup,
  FormGroup,
  Alert,
  Progress,
  Modal,
  ModalBody,
  ModalHeader,
  ModalFooter,
  Spinner,
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
  runAutoPlan,
  getBlockedLeatherLines,
  getDaySalesSummary,
  getOplDispatchSummary,
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
import { openOplDispatchSummaryPrintWindow, downloadOplDispatchSummaryExcel } from "utils/oplDispatchSummaryExport";
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
import { formatProductionDuration } from "utils/productionTimeHelper";

/** En tarjetas con fondo claro: Paper fuerza texto blanco en `.badge`, lo que deja cantidades ilegibles. */
const BADGE_READABLE_ON_LIGHT = {
  color: "#111827",
  backgroundColor: "#fff",
  border: "1px solid rgba(0,0,0,0.2)",
  fontWeight: 600,
};

/**
 * Estilos del tablero de mesas. Se aislan bajo `.tbs` para no alterar otras vistas y
 * conviven con Paper Dashboard: solo ajustan densidad, jerarquia y estados.
 */
const STATION_STYLESHEET = `
  .tbs {
    --tbs-line: #e9ecef;
    --tbs-line-soft: #f1f3f5;
    --tbs-muted: #8b9096;
    --tbs-ink: #32363b;
    --tbs-accent: #51cbce;
  }

  /* ---------- Tablero ----------
     Columnas CSS en vez de rejilla: con la rejilla, todas las mesas de una fila
     adoptan la altura de la más cargada y dejan huecos enormes. Aquí las tarjetas
     fluyen y rellenan el espacio, sin filas y sin coste de reflow. */
  .tbs-board { column-gap: 16px; column-count: 1; }
  .tbs-board-item { break-inside: avoid; page-break-inside: avoid; margin-bottom: 16px; }
  @media (min-width: 768px)  { .tbs-board { column-count: 2; } }
  @media (min-width: 1200px) { .tbs-board { column-count: 3; } }
  @media (min-width: 1600px) { .tbs-board { column-count: 4; } }

  /* ---------- Tarjeta de mesa ---------- */
  .tbs-desk {
    border: 1px solid var(--tbs-line);
    border-radius: 10px;
    background: #fff;
    box-shadow: 0 1px 2px rgba(16,24,40,.04);
    overflow: hidden;
    transition: box-shadow .18s ease;
  }
  .tbs-desk:hover { box-shadow: 0 4px 14px rgba(16,24,40,.07); }
  .tbs-desk-top {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 9px 12px 8px;
    border-bottom: 1px solid var(--tbs-line-soft);
  }
  .tbs-desk-name { font-size: 12.5px; font-weight: 700; color: var(--tbs-ink); letter-spacing: -.01em; }
  .tbs-desk-load { font-size: 10.5px; color: var(--tbs-muted); white-space: nowrap; }
  .tbs-desk-load b { color: var(--tbs-ink); font-weight: 700; }
  .tbs-desk-bar { height: 3px; background: var(--tbs-line-soft); }
  .tbs-desk-bar > i { display: block; height: 100%; transition: width .35s ease; }
  .tbs-desk-body { padding: 9px; }

  /* ---------- Tarjeta de tarea ---------- */
  .tbs-task {
    position: relative;
    border: 1px solid var(--tbs-line);
    border-radius: 8px;
    background: #fff;
    padding: 9px 11px 9px 13px;
    margin-bottom: 7px;
    cursor: pointer;
    transition: box-shadow .16s ease, transform .16s ease, border-color .16s ease;
  }
  .tbs-task::before {
    content: ""; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px;
    border-radius: 0 3px 3px 0; background: var(--tbs-state, #ced4da);
  }
  .tbs-task:last-child { margin-bottom: 0; }
  .tbs-task:hover { border-color: #d3dade; box-shadow: 0 3px 12px rgba(16,24,40,.08); transform: translateY(-1px); }
  .tbs-task:focus-visible { outline: 2px solid var(--tbs-accent); outline-offset: 2px; }
  .tbs-task--cancelled { opacity: .6; }

  .tbs-task-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 4px 8px; }
  .tbs-task-prod {
    font-size: 12.5px; font-weight: 700; color: var(--tbs-ink);
    line-height: 1.3; min-width: 0; letter-spacing: -.01em;
  }
  .tbs-task-prod .tbs-color { font-weight: 500; color: var(--tbs-muted); }
  .tbs-qty {
    flex-shrink: 0; font-size: 10px; font-weight: 700; color: var(--tbs-ink);
    background: #f4f6f7; border: 1px solid var(--tbs-line);
    border-radius: 5px; padding: 2px 7px; white-space: nowrap;
  }
  .tbs-task-sub {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    margin-top: 3px; font-size: 10px; color: var(--tbs-muted);
  }
  .tbs-op {
    font-weight: 700; color: #5b6167; background: #f4f6f7;
    border-radius: 4px; padding: 1px 6px; letter-spacing: .01em;
  }

  /* Paper Dashboard pone margin: 10px 1px a .btn (_buttons.scss:9) y margin-bottom: 5px
     a .badge (_badges.scss:11). Dentro de la tarjeta eso separa las filas hasta 20px y
     rompe la densidad del tablero. */
  .tbs-task .btn,
  .tbs-task .badge,
  .tbs-desk .btn,
  .tbs-desk .badge { margin: 0; }

  /* Fases */
  .tbs-phases { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 8px; }
  .tbs-phases > * { display: inline-flex; align-items: center; gap: 4px; }
  .tbs-phases .badge { font-size: 9px; padding: 3px 7px; border-radius: 5px; font-weight: 600; }
  .tbs-phases .btn { font-size: 9px; padding: 2px 8px; line-height: 1.5; border-radius: 5px; font-weight: 600; }

  /* Pie en dos filas: la columna de mesa es estrecha y una sola fila recortaba
     los botones de estado en cuanto entraban tres o mas. */
  .tbs-task-foot { margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--tbs-line-soft); }
  /* Todo puede envolverse: en columnas muy estrechas los controles bajan de línea
     en lugar de salirse de la tarjeta. */
  .tbs-foot-top {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 6px 8px; margin-bottom: 7px;
  }
  .tbs-time { font-size: 11px; font-weight: 700; color: var(--tbs-ink); white-space: nowrap; }
  .tbs-time small { font-weight: 500; color: var(--tbs-muted); }
  .tbs-side { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-left: auto; }

  /* Acciones de estado: ocupan el ancho y reparten, nunca se salen */
  .tbs-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
  .tbs-actions > div { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; width: 100%; }
  .tbs-actions .btn {
    font-size: 10px; padding: 4px 10px; line-height: 1.45; border-radius: 5px;
    font-weight: 600; flex: 1 1 auto; min-width: 0; white-space: nowrap;
  }

  /* Botón "Del día": accion frecuente, necesita etiqueta legible */
  .tbs-day-btn {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: 9.5px; font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
    color: #8a6a00; background: #fff8e6; border: 1px solid #f2dfa8;
    border-radius: 5px; padding: 3px 8px; line-height: 1.5; white-space: nowrap;
    transition: background .15s ease, border-color .15s ease;
  }
  .tbs-day-btn:hover { background: #fdefc9; border-color: #e8cd85; color: #7a5d00; }

  .tbs-icon-btn {
    border: 1px solid var(--tbs-line); background: #fff; color: #7a8085;
    border-radius: 5px; width: 25px; height: 23px; padding: 0; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center; font-size: 11px;
    transition: background .15s ease, color .15s ease, border-color .15s ease;
  }
  .tbs-icon-btn:hover { background: #f4f6f7; color: var(--tbs-ink); border-color: #d3dade; }

  /* Pie de carga progresiva: señala que faltan tareas y las trae al acercarse */
  .tbs-more {
    display: flex; align-items: center; justify-content: center; gap: 7px;
    width: 100%; border: 1px dashed var(--tbs-line); border-radius: 7px;
    background: transparent; color: var(--tbs-muted); padding: 7px; margin-top: 2px;
    font-size: 10.5px; font-weight: 600;
    transition: background .15s ease, color .15s ease, border-color .15s ease;
  }
  .tbs-more:hover { background: #f7f9fa; color: var(--tbs-ink); border-color: #ccd2d7; }
  .tbs-spin {
    width: 11px; height: 11px; border-radius: 50%;
    border: 2px solid var(--tbs-line); border-top-color: var(--tbs-accent);
    animation: tbs-rot .7s linear infinite;
  }
  @keyframes tbs-rot { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .tbs-spin { animation: none; } }

  /* ---------- Selector de jornada ---------- */
  .tbs-days { display: flex; gap: 7px; overflow-x: auto; padding: 2px 0 6px; scrollbar-width: none; }
  .tbs-days::-webkit-scrollbar { height: 0; }
  .tbs-day {
    flex: 0 0 auto; min-width: 66px; border: 1px solid var(--tbs-line); background: #fff;
    border-radius: 9px; padding: 6px 10px; text-align: center; cursor: pointer;
    box-shadow: 0 1px 2px rgba(16,24,40,.03);
    transition: border-color .16s ease, background .16s ease, box-shadow .16s ease, transform .16s ease;
  }
  .tbs-day:hover { border-color: #bfe2e3; background: #f8fdfd; transform: translateY(-1px); }
  .tbs-day--on {
    border-color: var(--tbs-accent); background: #edfafa;
    box-shadow: 0 0 0 1px var(--tbs-accent) inset, 0 2px 8px rgba(81,203,206,.18);
  }
  .tbs-day--today .tbs-day-dow { color: var(--tbs-accent); }
  .tbs-day-dow { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: var(--tbs-muted); }
  .tbs-day-num { font-size: 16px; font-weight: 700; line-height: 1.2; color: var(--tbs-ink); }
  .tbs-day-count { font-size: 9px; color: var(--tbs-muted); white-space: nowrap; }

  /* ---------- Detalle ---------- */
  .tbs-modal .modal-content { border: 0; border-radius: 12px; overflow: hidden; box-shadow: 0 18px 50px rgba(16,24,40,.18); }
  .tbs-modal .modal-header { border-bottom: 0; padding: 0; display: block; }
  .tbs-modal .modal-body { padding: 18px 22px 22px; }
  .tbs-modal .modal-footer { border-top: 1px solid var(--tbs-line-soft); padding: 12px 22px; }

  .tbs-dtl-head { padding: 16px 22px 14px; border-bottom: 1px solid var(--tbs-line-soft); position: relative; }
  .tbs-dtl-head::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: var(--tbs-state, #ced4da); }
  .tbs-dtl-code { font-size: 19px; font-weight: 700; letter-spacing: -.02em; color: var(--tbs-ink); line-height: 1.2; }
  .tbs-dtl-sub { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; }
  .tbs-pill {
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em;
    border-radius: 20px; padding: 3px 11px; border: 1px solid transparent;
  }

  .tbs-detail-sec {
    font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .09em;
    color: var(--tbs-muted); margin: 20px 0 10px; display: flex; align-items: center; gap: 8px;
  }
  .tbs-detail-sec::after { content: ""; flex: 1; height: 1px; background: var(--tbs-line-soft); }
  .tbs-detail-sec:first-child { margin-top: 0; }

  .tbs-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px 22px; }
  .tbs-detail-grid .lbl { font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: var(--tbs-muted); margin-bottom: 1px; }
  .tbs-detail-grid .val { font-size: 13px; font-weight: 600; color: var(--tbs-ink); overflow-wrap: anywhere; }

  .tbs-item-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    background: #f8fafb; border: 1px solid var(--tbs-line-soft);
    border-radius: 7px; padding: 8px 11px; margin-bottom: 6px; font-size: 12.5px;
  }
  .tbs-item-row:last-child { margin-bottom: 0; }

  .tbs-flag { display: flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 600; color: var(--tbs-ink); }
  .tbs-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

  @media (max-width: 576px) {
    .tbs-detail-grid { grid-template-columns: minmax(0,1fr); }
    .tbs-task-foot { flex-wrap: wrap; }
  }
`;

function TasksByTable() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tasks, setTasks] = useState([]);
  /**
   * `loading` es solo la primera carga, cuando todavia no hay nada que pintar.
   * `refreshing` es el refresco en segundo plano: el tablero se queda en pantalla
   * y el aviso va en la cabecera, para no perder la vista ni el scroll.
   */
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** { [taskId]: nuevoEstado } mientras el cambio esta en vuelo. */
  const [statusChanging, setStatusChanging] = useState({});
  /** Carga de órdenes de producción: alimenta las mesas de cinchos y el filtro por OP. */
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState("");
  const [deskConfigWarning, setDeskConfigWarning] = useState("");
  const [viewMode, setViewMode] = useState("operation"); // "operation" | "schedule" | "redistribute"
  const [filterDesk, setFilterDesk] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProductionOrderId, setFilterProductionOrderId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterDieCut, setFilterDieCut] = useState("all");
  /** Preset rápido: hoy | atrasadas | opl | sin_mesa */
  const [quickPreset, setQuickPreset] = useState(null);
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
  const [autoPlanning, setAutoPlanning] = useState(false);
  const [blockedLeather, setBlockedLeather] = useState([]);
  const [daySalesSummary, setDaySalesSummary] = useState(null);
  const [oplDispatchSummary, setOplDispatchSummary] = useState(null);

  // Redistribuir manual (aparte del cronograma)
  const [redistributeDate, setRedistributeDate] = useState(getTodayYmdGuatemala());
  /** Tarea abierta en el panel de detalle; la tarjeta solo muestra lo esencial. */
  const [detailTask, setDetailTask] = useState(null);
  /**
   * Cuántas tareas se pintan por mesa. Crece sola al acercarse el final de la columna,
   * de modo que una jornada con muchas tareas no monta cientos de tarjetas de golpe
   * ni necesita barras de scroll internas.
   */
  const [deskVisible, setDeskVisible] = useState({});
  const DESK_PAGE = 5;
  /**
   * Tope de la carga automática: a partir de aquí hace falta un clic, para que una mesa
   * muy cargada no estire el tablero varias pantallas sin que el usuario lo pida. El valor
   * es una decisión de interfaz, no una medida: en la copia de coretest hay mesa-días de
   * hasta 20 tareas, así que en esos casos el pie "ver N más" si aparece.
   */
  const DESK_AUTO_MAX = 8;

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

  /**
   * `GET /api/tasks` devuelve el listado completo y tarda; por eso hay dos modos.
   * En segundo plano (`background`) el tablero no se desmonta: se actualiza en su
   * sitio cuando llegan los datos y el usuario no pierde la vista ni el scroll.
   */
  const loadTasks = useCallback(async ({ background = false } = {}) => {
    const marcar = background ? setRefreshing : setLoading;
    try {
      marcar(true);
      setError("");
      const data = await getTasks();
      setTasks(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar tareas");
    } finally {
      marcar(false);
    }
  }, []);

  const loadDayPlanPanels = useCallback(async () => {
    const day = filterDate || getTodayYmdGuatemala();
    try {
      const [blocked, summary, opl] = await Promise.all([
        getBlockedLeatherLines(),
        getDaySalesSummary(day),
        getOplDispatchSummary(day),
      ]);
      setBlockedLeather(blocked || []);
      setDaySalesSummary(summary || null);
      setOplDispatchSummary(opl || null);
    } catch (err) {
      console.error("Error loading day plan panels:", err);
    }
  }, [filterDate]);

  /**
   * `GET /api/production-orders` tarda decenas de segundos (33,8 s con 1.266 órdenes en
   * la copia de coretest). De el dependen las mesas de cinchos y el filtro por orden, así
   * que el tablero se pinta antes y esos bloques aparecen después: hay que avisarlo o
   * parece que la pantalla ya terminó de cargar.
   */
  const loadProductionOrders = async () => {
    setLoadingOrders(true);
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
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Primero pintar: el tablero aparece con lo que ya hay en la base en vez de
      // dejar la pantalla vacia mientras el planificador automático hace su pasada.
      await Promise.all([loadTasks(), loadProductionOrders(), loadDayPlanPanels()]);
      if (cancelled) return;

      // Y después el auto-plan, en segundo plano. Puede crear tareas, así que al
      // terminar se refresca sin desmontar lo que el usuario ya esta viendo.
      setAutoPlanning(true);
      try {
        await runAutoPlan();
      } catch (err) {
        console.error("Auto-plan al abrir centro:", err);
      } finally {
        if (!cancelled) setAutoPlanning(false);
      }
      if (cancelled) return;
      await Promise.all([loadTasks({ background: true }), loadDayPlanPanels()]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadDayPlanPanels();
  }, [loadDayPlanPanels]);

  useEffect(() => {
    loadDesksCount();
  }, [filterDate, loadDesksCount]);

  // "Esperando bodega" solo se ofrece en la lista detallada. Si estaba elegido y el usuario
  // pasa al cronograma, el desplegable se quedaria con un valor sin opcion: se vuelve a Todos.
  useEffect(() => {
    if (viewMode !== "operation" && filterStatus === "AWAITING_WAREHOUSE") {
      setFilterStatus("all");
    }
  }, [viewMode, filterStatus]);

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
    // Un segundo clic mientras el primero viaja duplicaria la petición.
    if (statusChanging[taskId]) return;
    setStatusChanging((prev) => ({ ...prev, [taskId]: newStatus }));
    try {
      const updated = await updateTaskStatus(taskId, newStatus);
      // La tarjeta cambia de estado en cuanto responde el backend (~150 ms).
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      if (updated?.status === "AWAITING_WAREHOUSE") {
        showSuccess("Trabajo terminado en mesa. Pendiente recepción en bodega PT.");
      } else {
        showSuccess("Estado actualizado");
      }
      // Completar libera la mesa y el backend reasígna otras tareas pendientes, así que
      // hace falta releer el listado. Va en segundo plano y sin await: el aviso ya se dio
      // y el tablero sigue en pantalla mientras llega.
      if (newStatus === "COMPLETED" || updated?.status === "AWAITING_WAREHOUSE") {
        loadTasks({ background: true });
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setStatusChanging((prev) => {
        const siguiente = { ...prev };
        delete siguiente[taskId];
        return siguiente;
      });
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
        await loadTasks({ background: true });
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
    const targetDate = task?.scheduledDate || getTodayYmdGuatemala();

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
    setQuickPreset(null);
  };

  const isOplTask = useCallback((task) => {
    const code = String(task?.productionOrderCode || "").toUpperCase();
    if (code.startsWith("OPL")) return true;
    const orderId = Number(task?.productionOrderId);
    if (!Number.isFinite(orderId)) return false;
    const order =
      productionOrdersForFilter.find((o) => Number(o.id) === orderId)
      || productionOrders.find((o) => Number(o.id) === orderId);
    return String(order?.orderType || "").toUpperCase() === "VENTA_EN_LINEA";
  }, [productionOrdersForFilter, productionOrders]);

  const matchesQuickPreset = useCallback((task) => {
    if (!quickPreset) return true;
    const today = getTodayYmdGuatemala();
    if (quickPreset === "hoy") {
      return String(task.scheduledDate || "").slice(0, 10) === today;
    }
    if (quickPreset === "atrasadas") {
      if (["COMPLETED", "CANCELLED"].includes(task.status)) return false;
      const sched = String(task.scheduledDate || "").slice(0, 10);
      return !!sched && sched < today;
    }
    if (quickPreset === "opl") return isOplTask(task);
    if (quickPreset === "sin_mesa") return task.desk == null;
    return true;
  }, [quickPreset, isOplTask]);

  const matchesSearchTerm = useCallback((task) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const itemsText = (task.items || [])
      .map((i) => `${i.productCode || ""} ${i.productName || ""} ${i.colorName || ""}`)
      .join(" ");
    const searchable = `${task.code || ""} ${task.productionOrderCode || ""} ${task.productName || ""} ${task.productCode || ""} ${task.colorName || ""} ${itemsText}`.toLowerCase();
    return searchable.includes(term);
  }, [searchTerm]);

  const applyQuickPreset = (key) => {
    const next = quickPreset === key ? null : key;
    setQuickPreset(next);
    if (next === "hoy") setFilterDate("");
    if (next === "sin_mesa") setFilterDesk("");
    if (next && next !== "sin_mesa" && viewMode === "operation") {
      setShowDetailedList(true);
    }
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

  /**
   * Días con actividad y su carga, para el selector superior. Convive con el desplegable
   * "Fecha" de la fila de filtros: los dos escriben el mismo estado `filterDate`, así que
   * se mantienen sincronizados. El chip añade lo que el desplegable no da: ver de un vistazo
   * cuanta carga tiene cada jornada sin tener que abrirlo.
   */
  const dayChips = useMemo(() => {
    const hoy = getTodayYmdGuatemala();
    const acc = new Map();
    tableCenterTasks.forEach((t) => {
      if (!t.scheduledDate) return;
      const cur = acc.get(t.scheduledDate) || { tareas: 0, horas: 0, pendientes: 0 };
      cur.tareas += 1;
      if (t.status !== "CANCELLED") cur.horas += getTaskBaseHours(t);
      if (t.status === "PENDING") cur.pendientes += 1;
      acc.set(t.scheduledDate, cur);
    });
    const DOW = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return uniqueDates.map((ymd) => {
      const [y, m, d] = ymd.split("-").map(Number);
      const fecha = new Date(y, m - 1, d);
      const datos = acc.get(ymd) || { tareas: 0, horas: 0, pendientes: 0 };
      return { ymd, dow: DOW[fecha.getDay()], dia: d, esHoy: ymd === hoy, ...datos };
    });
  }, [tableCenterTasks, uniqueDates]);

  /**
   * Carga progresiva por mesa: cuando el pie de una columna se acerca a la pantalla,
   * se añade otro bloque de tarjetas. Antes se pintaban todas de golpe.
   */
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const alcanzados = entries
          .filter((e) => e.isIntersecting)
          .map((e) => ({ key: e.target.dataset.tbsKey, total: Number(e.target.dataset.tbsTotal) || 0 }))
          .filter((x) => x.key);
        if (!alcanzados.length) return;
        setDeskVisible((prev) => {
          const siguiente = { ...prev };
          let cambio = false;
          alcanzados.forEach(({ key, total }) => {
            const actual = siguiente[key] || DESK_PAGE;
            // Más allá del tope automático el usuario decide con un clic.
            if (actual < total && actual < DESK_AUTO_MAX) {
              siguiente[key] = Math.min(actual + DESK_PAGE, total, DESK_AUTO_MAX);
              cambio = true;
            }
          });
          return cambio ? siguiente : prev;
        });
      },
      { rootMargin: "150px 0px" }
    );
    document.querySelectorAll("[data-tbs-key]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [tasks, filterDate, viewMode, deskVisible]);

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
      if (!matchesSearchTerm(task)) return false;
      if (!matchesQuickPreset(task)) return false;
      return true;
    });
  }, [
    tableCenterTasks,
    filterProductionOrderId,
    filterDesk,
    filterDate,
    filterStatus,
    filterDieCut,
    matchesSearchTerm,
    matchesQuickPreset,
  ]);

  // "Pendientes de asignar" deben ser solo tareas activas sin mesa (no incluir COMPLETED/CANCELLED).
  // Cuando una tarea se completa, se limpia desk para liberar capacidad, pero queda el historial en workedDesk.
  const unassignedTasks = useMemo(
    () => tableCenterTasks.filter(
      (t) => !t.desk
        && t.status !== "CANCELLED"
        && t.status !== "COMPLETED"
        && t.status !== "AWAITING_WAREHOUSE"
        && matchesSearchTerm(t)
        && matchesQuickPreset(t)
    ).sort((a, b) => {
      const aOpl = String(a.productionOrderCode || "").toUpperCase().startsWith("OPL") ? 0 : 1;
      const bOpl = String(b.productionOrderCode || "").toUpperCase().startsWith("OPL") ? 0 : 1;
      if (aOpl !== bOpl) return aOpl - bOpl;
      return (a.id || 0) - (b.id || 0);
    }),
    [tableCenterTasks, matchesSearchTerm, matchesQuickPreset]
  );

  const awaitingWarehouseTasks = useMemo(
    () => tableCenterTasks.filter(
      (t) => t.status === "AWAITING_WAREHOUSE"
        && matchesSearchTerm(t)
        && matchesQuickPreset(t)
    ),
    [tableCenterTasks, matchesSearchTerm, matchesQuickPreset]
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

  /**
   * La boleta solo se imprime a partir del arranque: lleva la hora de inicio real y la
   * entrega estimada calculada desde ella, datos que no existen mientras está pendiente.
   */
  const taskYaIniciada = (task) => Boolean(task?.startedAt);

  /**
   * Ids de las boletas imprimibles de una fecha: con mesa y ya iniciadas. Mismo criterio
   * que la boleta individual, para que el botón de lote se oculte cuando no hay nada que
   * imprimir en vez de abrir y avisar después.
   */
  const boletasImprimiblesEnFecha = (date) =>
    getOrganizerDayBoletaTasks(tableCenterTasks, date)
      .filter(taskYaIniciada)
      .map((t) => t.id)
      .filter(Boolean);

  const openPrintForTask = (task) => {
    const dateKey = task.scheduledDate || getTodayYmdGuatemala();
    setPrintSupervisorByDesk(supervisorMapForDate(dateKey));
    setPrintBatchTaskIds(null);
    setPrintTaskId(task.id);
  };

  const openPrintBoletasForDate = (date) => {
    setPrintTaskId(null);
    setPrintSupervisorByDesk(supervisorMapForDate(date));
    const ids = boletasImprimiblesEnFecha(date);
    if (!ids.length) {
      showError("No hay tareas iniciadas con mesa en esta fecha; la boleta se imprime desde que la tarea arranca.");
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

  // OPs/OPL del día (con o sin mesa); excluye CANCELLED/COMPLETED. Alimenta hoja + descarga.
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

  /**
   * Contadores de la cabecera. Solo cuentan tareas vivas: `tableCenterTasks` ya descarta
   * COMPLETED y CANCELLED en el origen (cinchoProductionHelper.buildTableCenterTasks), así
   * que esta pantalla no puede contar completadas — antes se devolvia `completed: 0` fijo.
   * En su lugar se expone "esperando bodega", que si esta en los datos y hoy no se veia.
   */
  const stats = useMemo(() => {
    const active = tableCenterTasks.filter((t) => t.status !== "CANCELLED" && t.status !== "COMPLETED");
    const pending = active.filter((t) => t.status === "PENDING").length;
    const inProgress = active.filter((t) => t.status === "IN_PROGRESS").length;
    const awaitingWarehouse = active.filter((t) => t.status === "AWAITING_WAREHOUSE").length;
    const dieCut = active.filter((t) => t.dieCutReady).length;
    const unassigned = active.filter((t) => !t.desk).length;
    const totalMin = active.reduce((sum, t) => sum + Math.round((t.estimatedHours || 0) * 60), 0);
    return { pending, inProgress, awaitingWarehouse, dieCut, unassigned, totalMin, total: active.length };
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
    // En compacto el chip convive con otros dos: el texto largo rompe la fila.
    return (
      <Badge color="warning" title="Pendiente en Vista Materiales">
        {compact ? "Materiales" : "Pendiente en Vista Materiales"}
      </Badge>
    );
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

    // Estado al que se esta cambiando esta tarea, si hay una petición en vuelo.
    const enCurso = statusChanging[task.id];

    /**
     * Botón de cambio de estado con acuse inmedíato: el que se pulsa muestra el spinner
     * del sistema y sus compañeros se bloquean, para que no haya dudas de que el clic
     * entro ni margen para pulsar dos veces.
     */
    const botonEstado = ({ estado, color, outline, etiqueta, enMarcha, title }) => (
      <Button
        color={color}
        outline={outline}
        size={buttonSize}
        style={commonStyle}
        disabled={!!enCurso}
        onClick={() => handleStatusChange(task.id, estado)}
        title={enCurso ? "Aplicando el cambio…" : title}
      >
        {enCurso === estado ? (
          <>
            <Spinner size="sm" style={{ width: 10, height: 10, borderWidth: 1.5 }} className="mr-1" />
            {enMarcha}
          </>
        ) : (
          etiqueta
        )}
      </Button>
    );

    if (task.status === "PENDING") {
      return (
        <div className="d-flex align-items-center" style={{ gap: 4, flexWrap: "wrap" }}>
          {botonEstado({
            estado: "IN_PROGRESS",
            color: "info",
            etiqueta: "Iniciar",
            enMarcha: "Iniciando…",
            title: "Iniciar tarea (puede iniciar sin esperar otros estados)",
          })}
          {botonEstado({
            estado: "CANCELLED",
            color: "danger",
            outline: true,
            etiqueta: "Cancelar",
            enMarcha: "Cancelando…",
            title: "Cancelar tarea",
          })}
        </div>
      );
    }

    if (task.status === "IN_PROGRESS") {
      return (
        <div className="d-flex align-items-center" style={{ gap: 4, flexWrap: "wrap" }}>
          {botonEstado({
            estado: "COMPLETED",
            color: "success",
            etiqueta: "Completar",
            enMarcha: "Completando…",
            title: "Completar tarea",
          })}
          {botonEstado({
            estado: "PENDING",
            color: "warning",
            outline: true,
            etiqueta: "Pausar",
            enMarcha: "Pausando…",
            title: "Pausar y volver a pendiente",
          })}
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
    const totalHours = task.estimatedHours || 0;
    const extraHours = getTaskExtraHours(task);
    const baseHours = Math.max(totalHours - extraHours, 0);
    const baseMin = Math.round(baseHours * 60);
    const tone =
      baseMin >= 210 ? "danger" :
      baseMin >= 120 ? "warning" : "success";
    const label =
      extraHours > 0
        ? `${formatProductionDuration(baseHours)}+${formatProductionDuration(extraHours)}`
        : formatProductionDuration(baseHours);
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
        {label}
      </Badge>
    );
  };

  // ==================== RENDER ====================

  return (
    <div className="content tbs">
      <style>{STATION_STYLESHEET}</style>
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
                  <small className="text-muted d-block">Esperando bodega</small>
                  <strong style={{ fontSize: "20px", color: "#6c757d" }}>{stats.awaitingWarehouse}</strong>
                </div>
                <div className="px-3">
                  <small className="text-muted d-block">✂️ Troqueladas</small>
                  <strong style={{ fontSize: "20px" }}>{stats.dieCut}/{stats.total}</strong>
                </div>
                <div className="px-3">
                  <small className="text-muted d-block">Tiempo Total</small>
                  <strong style={{ fontSize: "20px" }}>
                    {formatProductionDuration(stats.totalMin / 60)}
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
                    title="PDF con tareas del organizador del día (con o sin mesa; excluye canceladas/completadas)"
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
                    title="Excel con tareas del organizador del día (con o sin mesa; excluye canceladas/completadas)"
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
                  <Button
                    color="info"
                    size="sm"
                    className="mb-0"
                    onClick={() => loadTasks({ background: true })}
                    disabled={loading || refreshing || autoPlanning}
                    title={refreshing ? "Actualizando el listado…" : "Volver a leer las tareas"}
                  >
                    {refreshing ? (
                      <Spinner size="sm" className="mr-1" />
                    ) : (
                      <i className="nc-icon nc-refresh-69 mr-1" />
                    )}
                    {refreshing ? "Actualizando…" : "Actualizar"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {deskConfigWarning && <Alert color="warning" className="mb-2">{deskConfigWarning}</Alert>}
              {autoPlanning && (
                <Alert color="info" className="mb-2 py-2 d-flex align-items-center" style={{ gap: 8 }}>
                  <Spinner size="sm" color="info" style={{ width: 14, height: 14, borderWidth: 2 }} />
                  Generando y asignando las tareas del día…
                </Alert>
              )}
              {viewMode === "operation" && (
                <>
                  <Card className="mb-3" style={{ border: "1px solid #c5e1a5", background: "#f8fff4" }}>
                    <CardBody className="py-2">
                      <div className="d-flex flex-wrap align-items-start justify-content-between" style={{ gap: 8 }}>
                        <div>
                          <small className="text-muted d-block mb-1">
                            <strong>Ventas de ayer a despachar hoy</strong>
                            {oplDispatchSummary?.saleDate && oplDispatchSummary?.dispatchDate
                              ? ` — todas las ventas pedidas el ${formatDateGt(oplDispatchSummary.saleDate)}, salen el ${formatDateGt(oplDispatchSummary.dispatchDate)}`
                              : ""}
                          </small>
                          <small className="d-block">
                            {(oplDispatchSummary?.saleCount || 0)} ventas · {(oplDispatchSummary?.oplSaleCount || 0)} con OPL · {(oplDispatchSummary?.stockSaleCount || 0)} sin OPL · {(oplDispatchSummary?.unitCount || 0)} unidades
                            {oplDispatchSummary?.excludedCount
                              ? ` · ${oplDispatchSummary.excludedCount} anuladas/devueltas`
                              : ""}
                          </small>
                        </div>
                        <div className="d-flex" style={{ gap: 6 }}>
                          <Button
                            color="secondary"
                            outline
                            size="sm"
                            className="mb-0"
                            disabled={!oplDispatchSummary}
                            onClick={() => openOplDispatchSummaryPrintWindow(oplDispatchSummary)}
                          >
                            Imprimir
                          </Button>
                          <Button
                            color="success"
                            size="sm"
                            className="mb-0"
                            disabled={!oplDispatchSummary}
                            onClick={() => downloadOplDispatchSummaryExcel(oplDispatchSummary)}
                          >
                            Descargar Excel
                          </Button>
                        </div>
                      </div>
                      {(oplDispatchSummary?.sales || []).length === 0 ? (
                        <small className="text-muted d-block mt-2">No hay ventas en línea del día anterior.</small>
                      ) : (
                        <Table size="sm" className="mb-0 mt-2" responsive>
                          <thead>
                            <tr>
                              <th>Venta</th>
                              <th>Cliente</th>
                              <th>Salida</th>
                              <th>OPL</th>
                              <th>Productos</th>
                              <th className="text-center">Cant.</th>
                              <th>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(oplDispatchSummary.sales || []).slice(0, 40).map((sale) => {
                              const qty = (sale.lines || []).reduce((s, l) => s + Number(l.quantity || 0), 0);
                              return (
                                <tr key={sale.onlineSaleId}>
                                  <td>{sale.saleNumber || sale.onlineSaleId}</td>
                                  <td>
                                    {sale.customerName || "—"}
                                    {sale.phone ? <small className="d-block text-muted">{sale.phone}</small> : null}
                                  </td>
                                  <td>
                                    {sale.dispatchKind === "OPL" && "Genera OPL"}
                                    {sale.dispatchKind === "STOCK" && "Sin OPL (stock)"}
                                    {sale.dispatchKind === "MIXTA" && "Mixta"}
                                    {sale.dispatchKind === "ANULADA" && "Anulada"}
                                    {sale.dispatchKind === "PENDIENTE" && "Pendiente"}
                                    {!sale.dispatchKind && "—"}
                                  </td>
                                  <td>{sale.productionOrderCode || "—"}</td>
                                  <td style={{ fontSize: 12 }}>
                                    {(sale.lines || []).map((l, i) => (
                                      <div key={`${sale.onlineSaleId}-${i}`}>
                                        {[l.productCode, l.productName, l.colorName, l.size].filter(Boolean).join(" · ")}
                                      </div>
                                    ))}
                                  </td>
                                  <td className="text-center font-weight-bold">{qty}</td>
                                  <td>{sale.status || "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      )}
                      {(oplDispatchSummary?.sales || []).length > 40 && (
                        <small className="text-muted d-block mt-1">
                          Mostrando 40 de {oplDispatchSummary.sales.length}. El Excel trae todas.
                        </small>
                      )}
                    </CardBody>
                  </Card>
                  <Row className="mb-3">
                    <Col md="6">
                      <Card className="mb-0" style={{ border: "1px solid #ffe8a3" }}>
                        <CardBody className="py-2">
                          <small className="text-muted d-block mb-1"><strong>Cola sin cuero</strong></small>
                          {(blockedLeather || []).length === 0 ? (
                            <small className="text-muted">No hay líneas bloqueadas por receta o ft².</small>
                          ) : (
                            <ul className="mb-0 pl-3" style={{ fontSize: 12 }}>
                              {blockedLeather.slice(0, 12).map((row) => (
                                <li key={`${row.productionOrderItemId}-${row.productCode}`}>
                                  {row.productionOrderCode} · {row.productCode} × {row.remainingQuantity}
                                  {row.reason ? ` — ${row.reason}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}
                        </CardBody>
                      </Card>
                    </Col>
                    <Col md="6">
                      <Card className="mb-0">
                        <CardBody className="py-2">
                          <small className="text-muted d-block mb-1">
                            <strong>OP de venta del día</strong>
                            {daySalesSummary?.date ? ` (${formatDateGt(daySalesSummary.date)})` : ""}
                          </small>
                          <Row>
                            <Col>
                              <small className="d-block font-weight-bold">Van a producción</small>
                              {(daySalesSummary?.goingToProduction || []).length === 0 ? (
                                <small className="text-muted">Ninguna</small>
                              ) : (
                                <ul className="mb-0 pl-3" style={{ fontSize: 12 }}>
                                  {(daySalesSummary.goingToProduction || []).map((row) => (
                                    <li key={`go-${row.productionOrderId}`}>
                                      {row.onlineSale ? "OPL " : ""}{row.code}
                                      {row.reason ? ` — ${row.reason}` : ""}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </Col>
                            <Col>
                              <small className="d-block font-weight-bold">No van</small>
                              {(daySalesSummary?.notGoingToProduction || []).length === 0 ? (
                                <small className="text-muted">Ninguna</small>
                              ) : (
                                <ul className="mb-0 pl-3" style={{ fontSize: 12 }}>
                                  {(daySalesSummary.notGoingToProduction || []).map((row) => (
                                    <li key={`no-${row.productionOrderId}`}>
                                      {row.code}{row.reason ? ` — ${row.reason}` : ""}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </Col>
                          </Row>
                        </CardBody>
                      </Card>
                    </Col>
                  </Row>
                </>
              )}
              <Card className="mb-3" style={{ border: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                <CardBody className="py-2">
                  <span style={{ fontSize: 13 }}>
                    <strong>Las tareas se generan solas</strong>
                    <span className="text-muted">
                      {" "}— al iniciar el día (00:05 GT) y al abrir este centro. Se parten por unidades por tarea y se asignan a mesa. Lo que falte de cuero queda en la cola.
                    </span>
                  </span>
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
                      <strong>{filteredOrderForView.code}</strong>
                      {" — "}
                      {filteredOrderPendingItems.length} producto
                      {filteredOrderPendingItems.length !== 1 ? "s" : ""} sin tarea
                      {filteredOrderPendingItems.length <= 3 && (
                        <span className="text-muted">
                          {": "}
                          {filteredOrderPendingItems.map((it) => it.productName || it.productCode).join(", ")}
                        </span>
                      )}
                      <span className="text-muted">. Entran al plan automático cuando haya cuero.</span>
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

              {/* ========== FILTERS / PRESETS ========== */}
              {(viewMode === "operation" || viewMode === "schedule") && dayChips.length > 1 && (
                <div className="mb-3">
                  <Label className="d-block mb-1"><small>Jornada</small></Label>
                  <div className="tbs-days">
                    <button
                      type="button"
                      className={`tbs-day ${filterDate === "" ? "tbs-day--on" : ""}`}
                      onClick={() => setFilterDate("")}
                      title="Ver todas las jornadas"
                    >
                      <div className="tbs-day-dow">Todas</div>
                      <div className="tbs-day-num">{dayChips.length}</div>
                      <div className="tbs-day-count">días</div>
                    </button>
                    {dayChips.map((d) => (
                      <button
                        key={d.ymd}
                        type="button"
                        className={`tbs-day ${filterDate === d.ymd ? "tbs-day--on" : ""} ${d.esHoy ? "tbs-day--today" : ""}`}
                        onClick={() => setFilterDate(filterDate === d.ymd ? "" : d.ymd)}
                        title={`${formatDate(d.ymd)} · ${d.tareas} tarea(s) · ${formatProductionDuration(d.horas)}${d.pendientes ? ` · ${d.pendientes} pendiente(s)` : ""}`}
                      >
                        <div className="tbs-day-dow">{d.esHoy ? "Hoy" : d.dow}</div>
                        <div className="tbs-day-num">{d.dia}</div>
                        <div className="tbs-day-count">{d.tareas} · {formatProductionDuration(d.horas)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(viewMode === "operation" || viewMode === "schedule") && (
                <Row className="mb-3 align-items-end">
                  <Col md={viewMode === "operation" ? "5" : "3"} className="mb-2 mb-md-0">
                    <FormGroup className="mb-0">
                      <Label><small>{viewMode === "operation" ? "Buscar tarea / OP / producto" : "Buscar"}</small></Label>
                      <Input
                        type="search"
                        bsSize={viewMode === "operation" ? undefined : "sm"}
                        placeholder="Código, producto, orden..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </FormGroup>
                  </Col>
                  <Col md="auto" className="mb-2 mb-md-0">
                    <FormGroup className="mb-0">
                      <Label className="d-block"><small>Atajos</small></Label>
                      <ButtonGroup size="sm">
                        {[
                          { key: "hoy", label: "Hoy" },
                          { key: "atrasadas", label: "Atrasadas" },
                          { key: "opl", label: "OPL" },
                          { key: "sin_mesa", label: "Sin mesa" },
                        ].map((p) => (
                          <Button
                            key={p.key}
                            color={quickPreset === p.key ? "primary" : "secondary"}
                            outline={quickPreset !== p.key}
                            onClick={() => applyQuickPreset(p.key)}
                          >
                            {p.label}
                          </Button>
                        ))}
                      </ButtonGroup>
                    </FormGroup>
                  </Col>
                  {(viewMode === "schedule" || (viewMode === "operation" && showDetailedList)) && (
                    <>
                      <Col md="2" className="mb-2 mb-md-0">
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
                      <Col md="2" className="mb-2 mb-md-0">
                        <FormGroup className="mb-0">
                          <Label><small>Fecha</small></Label>
                          <Input type="select" bsSize="sm" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
                            <option value="">Todas</option>
                            {uniqueDates.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
                          </Input>
                        </FormGroup>
                      </Col>
                      <Col md="2" className="mb-2 mb-md-0">
                        <FormGroup className="mb-0">
                          <Label><small>Estado</small></Label>
                          <Input type="select" bsSize="sm" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                            <option value="all">Todos</option>
                            <option value="PENDING">Pendiente</option>
                            <option value="IN_PROGRESS">En Proceso</option>
                            {/* Completada y Cancelada no se ofrecen: buildTableCenterTasks las
                                descarta antes de que llegue el filtro, asi que nunca podian dar
                                resultados. El historico esta en Trazabilidad por OP y en Bandejas
                                por Fase.
                                "Esperando bodega" solo se ofrece en la lista detallada: esas
                                tareas se quedan sin mesa al completarse y el cronograma agrupa
                                por mesa, asi que alli tampoco podrian aparecer. */}
                            {viewMode === "operation" && (
                              <option value="AWAITING_WAREHOUSE">Esperando bodega</option>
                            )}
                          </Input>
                        </FormGroup>
                      </Col>
                      <Col md="2" className="mb-2 mb-md-0">
                        <FormGroup className="mb-0">
                          <Label><small>Troquelado</small></Label>
                          <Input type="select" bsSize="sm" value={filterDieCut} onChange={(e) => setFilterDieCut(e.target.value)}>
                            <option value="all">Todos</option>
                            <option value="yes">✂️ Troquelados</option>
                            <option value="no">Sin troquelar</option>
                          </Input>
                        </FormGroup>
                      </Col>
                    </>
                  )}
                  <Col md="auto" className="d-flex align-items-end">
                    <Button
                      color="secondary"
                      size="sm"
                      title="Limpiar Filtros"
                      onClick={clearFilters}
                    >
                      <i className="nc-icon nc-simple-remove" /> Limpiar
                    </Button>
                  </Col>
                </Row>
              )}
              {(searchTerm || quickPreset) && (viewMode === "operation" || viewMode === "schedule") && (
                <small className="text-muted d-block mb-2">
                  Mostrando {filteredTasks.length} tarea{filteredTasks.length === 1 ? "" : "s"}
                  {quickPreset === "hoy" ? " de hoy" : ""}
                  {quickPreset === "atrasadas" ? " atrasadas" : ""}
                  {quickPreset === "opl" ? " OPL" : ""}
                  {quickPreset === "sin_mesa" ? " sin mesa" : ""}
                  {searchTerm ? ` · búsqueda “${searchTerm}”` : ""}
                </small>
              )}

              {/* Aviso de refresco: ocupa una línea fija encima del tablero, no lo tapa.
                  Se usa tras completar una tarea o al pulsar Actualizar. */}
              {refreshing && tasks.length > 0 && (
                <div
                  className="d-flex align-items-center mb-2"
                  style={{ gap: 8, fontSize: 12, color: "#8b9096" }}
                  role="status"
                  aria-live="polite"
                >
                  <Spinner size="sm" color="info" style={{ width: 13, height: 13, borderWidth: 2 }} />
                  Actualizando el listado…
                </div>
              )}

              {/* Las órdenes de producción llegan mucho más tarde que las tareas y de ellas
                  dependen las mesas de cinchos y el filtro por OP. Sin este aviso la pantalla
                  parece terminada y de pronto aparecen bloques nuevos. */}
              {loadingOrders && (
                <div
                  className="d-flex align-items-center mb-2"
                  style={{ gap: 8, fontSize: 12, color: "#8b9096" }}
                  role="status"
                  aria-live="polite"
                >
                  <Spinner size="sm" color="info" style={{ width: 13, height: 13, borderWidth: 2 }} />
                  Cargando órdenes de producción y mesas de cinchos…
                </div>
              )}

              {/* Solo se bloquea la vista cuando aun no hay nada que enseñar. Con tareas ya
                  cargadas el refresco ocurre debajo y el tablero permanece en pantalla. */}
              {loading && tasks.length === 0 ? (
                <div className="text-center py-5">
                  <Spinner color="info" />
                  <p className="mt-3 mb-0 text-muted" style={{ fontSize: 13 }}>Cargando tareas…</p>
                </div>
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
                          {(searchTerm || quickPreset) ? (
                            <>
                              <p className="mt-2 text-muted">
                                Ninguna tarea sin mesa coincide con búsqueda/atajo.
                              </p>
                              <Button color="secondary" size="sm" outline onClick={clearFilters}>
                                Limpiar filtros
                              </Button>
                            </>
                          ) : (
                            <>
                              <i className="nc-icon nc-check-2" style={{ fontSize: "48px", color: "#28a745" }} />
                              <p className="mt-2 text-success">
                                <strong>¡Todas las tareas están asignadas!</strong>
                              </p>
                              <Button color="primary" size="sm" onClick={() => setViewMode("schedule")}>
                                Ver Cronograma →
                              </Button>
                            </>
                          )}
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
                                  const todayStr = filterDate || getTodayYmdGuatemala();
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
                                        {formatProductionDuration(load)} inicio
                                        {totalLoad > load && ` · ${formatProductionDuration(totalLoad)} total`}
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
                                          title="Agregar productos de venta del día"
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
                          // El botón de lote sigue la misma regla que la boleta individual:
                          // si no hay ningúna tarea iniciada esa fecha, no se muestra.
                          const esHoy = date === getTodayYmdGuatemala();
                          const boletasDelDia = esHoy ? boletasImprimiblesEnFecha(date) : [];
                          return (
                            <Card key={date} className="mb-3" style={{ border: "1px solid #e0e0e0" }}>
                              <CardHeader style={{ backgroundColor: "#f8f9fa", padding: "8px 16px" }}>
                                <div className="d-flex justify-content-between align-items-center">
                                  <div>
                                    <strong style={{ fontSize: "14px" }}>{formatDate(date)}</strong>
                                    {esHoy && boletasDelDia.length > 0 && (
                                      <Button
                                        color="default"
                                        size="sm"
                                        className="ml-2"
                                        outline
                                        onClick={() => openPrintBoletasForDate(date)}
                                        title="Imprimir las boletas de esta fecha (solo tareas con mesa y ya iniciadas)"
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
                                    <div className="tbs-board">
                                  {deskKeys
                                    .sort((a, b) => parseInt(a) - parseInt(b))
                                    .map((desk) => {
                                      const deskTasks = deskMap[desk];
                                      const totalHours = deskTasks
                                        .filter((t) => t.status !== "CANCELLED")
                                        .reduce((sum, t) => sum + getTaskBaseHours(t), 0);
                                      const capacityPct = Math.min((totalHours / MAX_HOURS_PER_DESK) * 100, 100);

                                      const supMap = supervisorMapForDate(date);
                                      const cupoColor =
                                        capacityPct >= 90 ? "#ef8157" : capacityPct >= 60 ? "#fbc658" : "#6bd098";
                                      const claveMesa = date + "|" + desk;
                                      const tope = deskVisible[claveMesa] || DESK_PAGE;
                                      const visibles = deskTasks.slice(0, tope);
                                      const ocultas = deskTasks.length - visibles.length;
                                      return (
                                        <div key={desk} className="tbs-board-item">
                                          <div className="tbs-desk">
                                            <div className="tbs-desk-top">
                                              <span className="tbs-desk-name">
                                                {deskDisplayLabel(Number(desk), supMap)}
                                              </span>
                                              <span className="tbs-desk-load">
                                                <b>{formatProductionDuration(totalHours)}</b>
                                                {" / "}{formatProductionDuration(MAX_HOURS_PER_DESK)}
                                                {"  \u00b7  "}{deskTasks.length}
                                              </span>
                                            </div>
                                            <div className="tbs-desk-bar">
                                              <i style={{ width: capacityPct + "%", background: cupoColor }} />
                                            </div>
                                            <div className="tbs-desk-body">
                                              {visibles.map((task) => {
                                                const items = getTaskItems(task);
                                                const totalTaskHours = task.estimatedHours || 0;
                                                const extraHours = getTaskExtraHours(task);
                                                const baseTaskHours = Math.max(totalTaskHours - extraHours, 0);
                                                const tiempo = extraHours > 0
                                                  ? formatProductionDuration(baseTaskHours) + " + " + formatProductionDuration(extraHours)
                                                  : formatProductionDuration(baseTaskHours);
                                                const tono =
                                                  task.status === "COMPLETED" ? { mod: "", line: "#6bd098" } :
                                                  task.status === "IN_PROGRESS" ? { mod: "", line: "#51bcda" } :
                                                  task.status === "CANCELLED" ? { mod: "tbs-task--cancelled", line: "#ef8157" } :
                                                  !task.dieCutReady ? { mod: "", line: "#f5a3c7" } : { mod: "", line: "#fbc658" };
                                                // Cualquier punto de la tarjeta abre el detalle salvo los controles
                                                // reales; filtrar por el destino evita zonas muertas en los huecos.
                                                const abrirDetalle = (e) => {
                                                  if (e.target.closest("button, a, input, select, textarea, label, .btn")) return;
                                                  setDetailTask(task);
                                                };
                                                return (
                                                  <div
                                                    key={task.id}
                                                    className={"tbs-task " + tono.mod}
                                                    style={{ "--tbs-state": tono.line }}
                                                    role="button"
                                                    tabIndex={0}
                                                    title="Ver detalle de la tarea"
                                                    onClick={abrirDetalle}
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter" || e.key === " ") {
                                                        e.preventDefault();
                                                        setDetailTask(task);
                                                      }
                                                    }}
                                                  >
                                                    <div className="tbs-task-head">
                                                      <div className="tbs-task-prod">
                                                        {items.map((item, i) => (
                                                          <span key={i}>
                                                            {i > 0 && <span className="tbs-color">, </span>}
                                                            {item.productCode}
                                                            {item.colorName && (
                                                              <span className="tbs-color"> {"\u00b7"} {item.colorName}</span>
                                                            )}
                                                          </span>
                                                        ))}
                                                      </div>
                                                      <span className="tbs-qty">{task.quantity} uds</span>
                                                    </div>

                                                    <div className="tbs-task-sub">
                                                      <span className="tbs-op">{task.productionOrderCode}</span>
                                                      {task.startTime && <span>Inicio {task.startTime}</span>}
                                                    </div>

                                                    <div className="tbs-phases">
                                                      {renderPhaseControl(task, "LEATHER", true)}
                                                      {renderPhaseControl(task, "DIE_CUT", true)}
                                                      {renderPhaseControl(task, "MATERIALS", true)}
                                                    </div>

                                                    <div className="tbs-task-foot">
                                                      <div className="tbs-foot-top">
                                                        <span className="tbs-time" title="Tiempo base + extra de venta del día">
                                                          {tiempo}
                                                        </span>
                                                        <div className="tbs-side">
                                                          <button
                                                            type="button"
                                                            className="tbs-day-btn"
                                                            title="Agregar productos de venta del día"
                                                            onClick={() => openDaySaleModal(task)}
                                                          >
                                                            <i className="nc-icon nc-simple-add" /> Del día
                                                          </button>
                                                          {taskYaIniciada(task) && (
                                                            <button
                                                              type="button"
                                                              className="tbs-icon-btn"
                                                              title="Imprimir boleta"
                                                              onClick={() => openPrintForTask(task)}
                                                            >
                                                              <i className="nc-icon nc-single-copy-04" />
                                                            </button>
                                                          )}
                                                        </div>
                                                      </div>
                                                      <div className="tbs-actions">
                                                        {renderStatusActions(task, true)}
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                              {ocultas > 0 && (
                                                <button
                                                  type="button"
                                                  className="tbs-more"
                                                  data-tbs-key={claveMesa}
                                                  data-tbs-total={deskTasks.length}
                                                  title={
                                                    tope >= DESK_AUTO_MAX
                                                      ? "Mesa muy cargada: pulsa para ver el resto"
                                                      : "Se cargan solas al desplazar; púlsalo para verlas ya"
                                                  }
                                                  onClick={() =>
                                                    setDeskVisible((prev) => ({
                                                      ...prev,
                                                      [claveMesa]: deskTasks.length,
                                                    }))
                                                  }
                                                >
                                                  {tope < DESK_AUTO_MAX && <span className="tbs-spin" />}
                                                  {tope >= DESK_AUTO_MAX ? "Ver las " : ""}
                                                  {ocultas} tarea{ocultas === 1 ? "" : "s"} más
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                    </div>
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
                                          title="Agregar productos de venta del día"
                                          onClick={() => openDaySaleModal(task)}
                                          style={{ padding: "4px 10px", fontSize: "12px", fontWeight: 600 }}
                                        >
                                          + Del Dia
                                        </Button>
                                        {taskYaIniciada(task) && (
                                          <Button
                                            color="info"
                                            size="sm"
                                            title="Imprimir boleta"
                                            onClick={() => openPrintForTask(task)}
                                            style={{ padding: "2px 6px" }}
                                          >
                                            <i className="nc-icon nc-single-copy-04" />
                                          </Button>
                                        )}
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

      {/* Detalle de tarea: concentra los campos que la tarjeta ya no muestra */}
      <Modal
        isOpen={!!detailTask}
        toggle={() => setDetailTask(null)}
        size="lg"
        scrollable
        centered
        fade
        className="tbs-modal"
      >
        <ModalHeader toggle={() => setDetailTask(null)} tag="div" close={<span />}>
          {(() => {
            const est = {
              PENDING: { txt: "Pendiente", bg: "#fff6e0", fg: "#8a6a00", bd: "#f2dfa8", line: "#fbc658" },
              IN_PROGRESS: { txt: "En proceso", bg: "#e8f6fb", fg: "#1f7d99", bd: "#bde3f0", line: "#51bcda" },
              COMPLETED: { txt: "Completada", bg: "#e9f8ef", fg: "#1e7f45", bd: "#bde8cd", line: "#6bd098" },
              CANCELLED: { txt: "Cancelada", bg: "#fdeeea", fg: "#a2432a", bd: "#f5cfc3", line: "#ef8157" },
              AWAITING_WAREHOUSE: { txt: "Esperando bodega", bg: "#f0f1f3", fg: "#54595f", bd: "#dfe2e5", line: "#9aa0a6" },
            }[detailTask?.status] || { txt: detailTask?.status || "-", bg: "#f0f1f3", fg: "#54595f", bd: "#dfe2e5", line: "#ced4da" };
            return (
              <div className="tbs-dtl-head" style={{ "--tbs-state": est.line }}>
                <div className="d-flex align-items-start justify-content-between" style={{ gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="tbs-dtl-code">{detailTask?.code || "Tarea"}</div>
                    <div className="tbs-dtl-sub">
                      <span className="tbs-pill" style={{ background: est.bg, color: est.fg, borderColor: est.bd }}>
                        {est.txt}
                      </span>
                      {detailTask?.productionOrderCode && (
                        <span className="tbs-op">{detailTask.productionOrderCode}</span>
                      )}
                      {detailTask?.desk && (
                        <span className="text-muted" style={{ fontSize: 11.5 }}>
                          {deskDisplayLabel(detailTask.desk, supervisorMapForUi)}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="tbs-icon-btn"
                    onClick={() => setDetailTask(null)}
                    title="Cerrar"
                    aria-label="Cerrar"
                  >
                    <i className="nc-icon nc-simple-remove" />
                  </button>
                </div>
              </div>
            );
          })()}
        </ModalHeader>
        <ModalBody>
          {detailTask && (() => {
            const items = getTaskItems(detailTask);
            const extraHours = getTaskExtraHours(detailTask);
            const totalHours = detailTask.estimatedHours || 0;
            const baseHours = Math.max(totalHours - extraHours, 0);
            const dato = (label, valor) => (
              <div>
                <div className="lbl">{label}</div>
                <div className="val">{valor === null || valor === undefined || valor === "" ? "-" : valor}</div>
              </div>
            );
            const si = (v) => (v ? "Sí" : "No");
            /** Fase con indicador de color: se lee más rápido que un "Sí/No". */
            const fase = (label, hecho, textoFijo) => (
              <div>
                <div className="lbl">{label}</div>
                <div className="tbs-flag">
                  <span
                    className="tbs-dot"
                    style={{ background: textoFijo ? "#adb5bd" : hecho ? "#6bd098" : "#f0ad4e" }}
                  />
                  {textoFijo || si(hecho)}
                </div>
              </div>
            );
            return (
              <>
                <div className="tbs-detail-sec">Identificación</div>
                <div className="tbs-detail-grid">
                  {dato("Código de tarea", detailTask.code)}
                  {dato("Orden de producción", detailTask.productionOrderCode)}
                  {dato("Cantidad", detailTask.quantity ? detailTask.quantity + " uds" : null)}
                  {dato("Productos", items.length)}
                </div>
                {items.length > 0 && (
                  <div className="mt-3">
                    {items.map((item, i) => (
                      <div key={i} className="tbs-item-row">
                        <strong>{item.productCode}</strong>
                        {item.productName && <span className="text-muted">{item.productName}</span>}
                        {item.colorName && (
                          <span className="tbs-op" style={{ textTransform: "none" }}>{item.colorName}</span>
                        )}
                        {item.daySaleExtra && (
                          <span className="tbs-pill" style={{ background: "#fff8e6", color: "#8a6a00", borderColor: "#f2dfa8" }}>
                            Del día
                          </span>
                        )}
                        <span className="ml-auto font-weight-bold">×{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="tbs-detail-sec">Planificación</div>
                <div className="tbs-detail-grid">
                  {dato("Mesa asignada", detailTask.desk ? deskDisplayLabel(detailTask.desk, supervisorMapForUi) : "Sin mesa")}
                  {dato("Fecha programada", detailTask.scheduledDate ? formatDate(detailTask.scheduledDate) : null)}
                  {dato("Fecha de entrega", detailTask.deliveryDate ? formatDate(detailTask.deliveryDate) : null)}
                  {dato("Tiempo estimado", extraHours > 0
                    ? formatProductionDuration(baseHours) + " + " + formatProductionDuration(extraHours) + " del dia"
                    : formatProductionDuration(baseHours))}
                </div>

                <div className="tbs-detail-sec">Ejecución</div>
                <div className="tbs-detail-grid">
                  {dato("Hora de inicio", detailTask.startedAt ? formatDateTimeGt(detailTask.startedAt) : (detailTask.startTime || null))}
                  {dato("Hora de fin", detailTask.completedAt ? formatDateTimeGt(detailTask.completedAt) : null)}
                  {dato("Duración real", detailTask.actualDurationMinutes
                    ? formatProductionDuration(detailTask.actualDurationMinutes / 60)
                    : null)}
                  {dato("Mesa trabajada", detailTask.workedDesk || null)}
                </div>

                <div className="tbs-detail-sec">Avance de fases</div>
                <div className="tbs-detail-grid">
                  {fase("Cuero entregado", detailTask.leatherDelivered)}
                  {fase(
                    "Materiales entregados",
                    taskSkipsMaterials(detailTask) ? null : detailTask.materialsDelivered,
                    taskSkipsMaterials(detailTask) ? "No requiere" : null
                  )}
                  {fase("Troquel listo", detailTask.dieCutReady)}
                  {dato("Fecha de troquel", detailTask.dieCutDate ? formatDate(detailTask.dieCutDate) : null)}
                </div>

                {(detailTask.wasteQuantity || detailTask.wasteNotes) && (
                  <>
                    <div className="tbs-detail-sec">Merma</div>
                    <div className="tbs-detail-grid">
                      {dato("Cantidad", detailTask.wasteQuantity)}
                      {dato("Motivo", detailTask.wasteNotes)}
                    </div>
                  </>
                )}

                {detailTask.observations && (
                  <>
                    <div className="tbs-detail-sec">Observaciones</div>
                    <div style={{ fontSize: 12.5 }}>{detailTask.observations}</div>
                  </>
                )}
              </>
            );
          })()}
        </ModalBody>
        <ModalFooter>
          {taskYaIniciada(detailTask) && (
            <Button
              color="info"
              size="sm"
              onClick={() => {
                const t = detailTask;
                setDetailTask(null);
                if (t) openPrintForTask(t);
              }}
            >
              <i className="nc-icon nc-single-copy-04 mr-1" /> Imprimir boleta
            </Button>
          )}
          <Button color="secondary" outline size="sm" onClick={() => setDetailTask(null)}>
            Cerrar
          </Button>
        </ModalFooter>
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
                        <td className="text-right">{formatProductionDuration(item.estimatedHours || 0)}</td>
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
                  Base actual: <strong>{formatProductionDuration(getTaskBaseHours(daySaleTask || {}))}</strong> ·
                  Extra seleccionado: <strong>{formatProductionDuration(daySaleCandidates
                    .filter((c) => selectedDaySaleItems.includes(c.productionOrderItemId))
                    .reduce((sum, c) => sum + (c.estimatedHours || 0), 0))}</strong>
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
            <li className="mb-1"><strong>Tareas automáticas</strong> al inicio del día y al abrir el centro (partidas y asignadas a mesa).</li>
            <li className="mb-1"><strong>Redistribuir</strong> solo si hay que mover una línea entre mesas o fechas.</li>
            <li className="mb-1"><strong>Completar prerequisitos</strong>: cuero y troquelado (materiales se entrega en Vista Materiales).</li>
            <li className="mb-1"><strong>Monitorear cronograma</strong> y cambiar estados (iniciar, pausar, completar).</li>
          </ol>
          <Alert color="light" style={{ border: "1px solid #e2e8f0" }}>
            Consejo: las líneas sin cuero esperan en la cola; al ingresar cuero el plan las toma solo.
          </Alert>
        </ModalBody>
      </Modal>

    </div>
  );
}

export default TasksByTable;
