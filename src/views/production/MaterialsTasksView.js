import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Badge,
  Button, Input, Collapse, Spinner, Alert, Nav, NavItem, NavLink,
  TabContent, TabPane, Modal, ModalHeader, ModalBody, ModalFooter,
} from "reactstrap";
import { getMaterialsView, getMaterialsViewByOrder, setMaterialsDelivery, setTaskItemMaterialsDelivery, setTaskItemMaterialPick } from "../../services/taskService";
import { getProductionOrders, getProductionOrderById } from "../../services/productionOrderService";
import { getBomsByProductId } from "../../services/bomService";
import { getMaterials } from "../../services/materialService";
import { taskMaterialsReady, taskSkipsMaterials } from "utils/materialRequirementHelper";
import { orderHasPendingMaterialsTasks } from "utils/materialsPendingHelper";
import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import {
  buildCinchoReadOnlyRecipeBlocks,
  CINCHO_MATERIALS_READONLY_SUB,
  CINCHO_MATERIALS_READONLY_TITLE,
} from "utils/cinchoMaterialsRecipeHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";
import { openMaterialsDayRecipesPrintWindow } from "utils/materialsDayRecipesPrintHtml";

const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En Progreso",
  AWAITING_WAREHOUSE: "Pendiente bodega PT",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const STATUS_STYLES = {
  PENDING: { backgroundColor: "#ffc107", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  IN_PROGRESS: { backgroundColor: "#17a2b8", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  AWAITING_WAREHOUSE: { backgroundColor: "#6f42c1", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  COMPLETED: { backgroundColor: "#28a745", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  CANCELLED: { backgroundColor: "#dc3545", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
};

const DEFAULT_BADGE = { backgroundColor: "#6c757d", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" };

const WORKFLOW_LABELS = {
  PENDING_LEATHER: "Pendiente Cuero",
  PENDING_DIE_CUT: "Pendiente Troquelado",
  PENDING_TABLE_ENTRY: "Pendiente Entrada a Mesa",
  PENDING_MATERIAL_DELIVERY: "Pendiente Entrega Materiales",
  READY_TO_START: "Lista para Iniciar",
  IN_PRODUCTION: "En Producción",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const WORKFLOW_STYLES = {
  PENDING_LEATHER: { backgroundColor: "#8d6e63", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75em", fontWeight: 700, display: "inline-block" },
  PENDING_DIE_CUT: { backgroundColor: "#5d4037", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75em", fontWeight: 700, display: "inline-block" },
  PENDING_TABLE_ENTRY: { backgroundColor: "#fb8c00", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75em", fontWeight: 700, display: "inline-block" },
  PENDING_MATERIAL_DELIVERY: { backgroundColor: "#fdd835", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75em", fontWeight: 700, display: "inline-block" },
  READY_TO_START: { backgroundColor: "#00acc1", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75em", fontWeight: 700, display: "inline-block" },
  IN_PRODUCTION: { backgroundColor: "#1e88e5", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75em", fontWeight: 700, display: "inline-block" },
  COMPLETED: { backgroundColor: "#43a047", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75em", fontWeight: 700, display: "inline-block" },
  CANCELLED: { backgroundColor: "#e53935", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75em", fontWeight: 700, display: "inline-block" },
};

const ORDER_TYPE_LABELS = {
  NORMAL: "Kiosko",
  DISTRIBUTION: "Distribución",
  VENTA_EN_LINEA: "Venta en Línea",
  CLIENTE_KIOSKO: "Cliente Kiosko",
  CINCHOS: "Cinchos",
  CINCHOS_FOSSILES: "Cinchos Fossiles",
  CINCHOS_MARCAS: "Cinchos Marcas",
  MARCAS: "Marcas",
  INTERNA: "Interna (OPI)",
};

const ORDER_TYPE_STYLES = {
  NORMAL: { backgroundColor: "#e9ecef", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  DISTRIBUTION: { backgroundColor: "#28a745", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  VENTA_EN_LINEA: { backgroundColor: "#17a2b8", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  CLIENTE_KIOSKO: { backgroundColor: "#dc3545", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  CINCHOS: { backgroundColor: "#007bff", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  CINCHOS_FOSSILES: { backgroundColor: "#007bff", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  CINCHOS_MARCAS: { backgroundColor: "#343a40", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  MARCAS: { backgroundColor: "#343a40", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
  INTERNA: { backgroundColor: "#6f42c1", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600, display: "inline-block" },
};

const taskRecipeHasStockWarning = (task) => {
  if (!task?.products) return false;
  return task.products.some((p) => (p.recipe || []).some((m) => m.sufficientStock === false));
};

const MaterialsTasksView = () => {
  // Tab state: "orders" (primary) or "history" (by date)
  const [activeTab, setActiveTab] = useState("orders");

  // === Orders tab state ===
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [orderTasks, setOrderTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [cinchoRecipeBlocks, setCinchoRecipeBlocks] = useState([]);
  const [loadingCinchoRecipes, setLoadingCinchoRecipes] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [orderTypeFilter, setOrderTypeFilter] = useState("");
  const [workflowFilter, setWorkflowFilter] = useState("NOT_PRODUCED");

  // === History tab state ===
  const [historyTasks, setHistoryTasks] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [expandedHistoryTasks, setExpandedHistoryTasks] = useState({});
  const [printingDayRecipes, setPrintingDayRecipes] = useState(false);

  const [error, setError] = useState(null);
  /** @type {null | { kind: 'task' | 'item', taskId: number, taskItemId?: number, isHistory: boolean }} */
  const [forceModal, setForceModal] = useState(null);

  // ─── Fetch active production orders ───
  const fetchOrders = useCallback(async () => {
    setLoadingOrders(true);
    setError(null);
    try {
      const all = await getProductionOrders();
      const activeOrders = (all || []).filter(
        (o) => o.status !== "CANCELLED" && o.status !== "COMPLETED"
      );
      const ordersWithPendingMaterials = await Promise.all(
        activeOrders.map(async (order) => {
          try {
            const tasks = await getMaterialsViewByOrder(order.id);
            return orderHasPendingMaterialsTasks(tasks) ? order : null;
          } catch {
            return null;
          }
        })
      );
      const visible = ordersWithPendingMaterials.filter(Boolean);
      // Sort: active first, completed at the end
      visible.sort((a, b) => {
        const statusOrder = { IN_PROGRESS: 0, PENDING: 1 };
        const sa = statusOrder[a.status] ?? 2;
        const sb = statusOrder[b.status] ?? 2;
        if (sa !== sb) return sa - sb;
        if (a.deliveryDate && b.deliveryDate) return a.deliveryDate.localeCompare(b.deliveryDate);
        if (a.deliveryDate) return -1;
        if (b.deliveryDate) return 1;
        return 0;
      });
      setOrders(visible);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ─── Fetch tasks for selected order ───
  const fetchOrderTasks = useCallback(async (orderId, orderRow) => {
    if (!orderId) return;
    setLoadingTasks(true);
    setLoadingCinchoRecipes(false);
    setCinchoRecipeBlocks([]);
    setError(null);
    const resolved = orderRow || orders.find((o) => o.id === orderId);
    const cincho = resolved && isCinchoOrderType(resolved.orderType);
    try {
      const data = await getMaterialsViewByOrder(orderId);
      const list = data || [];
      if (list.length === 0 && cincho) {
        setOrderTasks([]);
        setExpandedTasks({});
        setLoadingCinchoRecipes(true);
        try {
          const po = await getProductionOrderById(orderId);
          const materials = await getMaterials();
          const blocks = await buildCinchoReadOnlyRecipeBlocks(
            po.items,
            (pid) => getBomsByProductId(pid),
            materials
          );
          setCinchoRecipeBlocks(blocks);
        } catch (err) {
          setError(err.message);
          setCinchoRecipeBlocks([]);
        } finally {
          setLoadingCinchoRecipes(false);
        }
        return;
      }
      if (list.length === 0) {
        setOrders((prev) => prev.filter((order) => order.id !== orderId));
        setSelectedOrderId(null);
        setOrderTasks([]);
        return;
      }
      setOrderTasks(list);
      // Auto-expand all tasks
      const expanded = {};
      list.forEach((t) => (expanded[t.taskId] = true));
      setExpandedTasks(expanded);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingTasks(false);
    }
  }, [orders]);

  const handleSelectOrder = (orderId, orderRow) => {
    if (selectedOrderId === orderId) {
      setSelectedOrderId(null);
      setOrderTasks([]);
      setCinchoRecipeBlocks([]);
    } else {
      setSelectedOrderId(orderId);
      fetchOrderTasks(orderId, orderRow);
    }
  };

  // ─── History tab ───
  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    setError(null);
    try {
      const data = await getMaterialsView(selectedDate, { scheduleDay: true });
      setHistoryTasks(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  // ─── Toggle helpers ───
  const toggleTask = (taskId, isHistory = false) => {
    if (isHistory) {
      setExpandedHistoryTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
    } else {
      setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
    }
  };

  const handleDeliverMaterials = async (taskId, isHistory = false, force = false) => {
    const sourceList = isHistory ? historyTasks : orderTasks;
    const sourceTask = (sourceList || []).find((t) => t.taskId === taskId);
    if (taskSkipsMaterials(sourceTask)) {
      return;
    }
    if (!force && taskRecipeHasStockWarning(sourceTask)) {
      setForceModal({ kind: "task", taskId, isHistory });
      return;
    }
    try {
      const updated = await setMaterialsDelivery(taskId, true, force);
      const normalized = {
        taskId: updated.id,
        status: updated.status,
        leatherDelivered: updated.leatherDelivered,
        leatherDeliveredAt: updated.leatherDeliveredAt,
        dieCutReady: updated.dieCutReady,
        dieCutDate: updated.dieCutDate,
        materialsDelivered: updated.materialsDelivered,
        materialsDeliveredAt: updated.materialsDeliveredAt,
        workflowStatus: updated.workflowStatus,
        canDeliverMaterials: updated.canDeliverMaterials,
      };
      if (isHistory) {
        await fetchHistory();
      } else {
        setOrderTasks((prev) => {
          const next = prev.filter((t) => t.taskId !== taskId);
          if (next.length === 0) {
            setOrders((current) => current.filter((order) => order.id !== selectedOrderId));
            setSelectedOrderId(null);
          }
          return next;
        });
      }
      if (sourceTask) {
        printMaterialsDeliveryReceipt({ ...sourceTask, ...normalized });
      }
    } catch (err) {
      setError(err.message || "No se pudo entregar materiales");
    }
  };

  const handleDeliverMaterialsForProduct = async (taskId, taskItemId, isHistory = false, force = false) => {
    const sourceList = isHistory ? historyTasks : orderTasks;
    const sourceTask = (sourceList || []).find((t) => t.taskId === taskId);
    const product = (sourceTask?.products || []).find((p) => p.taskItemId === taskItemId);
    if (!force && product && (product.recipe || []).some((m) => m.sufficientStock === false)) {
      setForceModal({ kind: "item", taskId, taskItemId, isHistory });
      return;
    }
    try {
      const updated = await setTaskItemMaterialsDelivery(taskId, taskItemId, true, force);
      const consumed = Number(updated?.lastItemMaterialsConsumed ?? 0);
      if (product?.requiresMaterials !== false && consumed === 0) {
        setError(
          "Entrega registrada, pero no se descontó inventario. Revise BOM del producto o consumo previo de la OP."
        );
      }
      if (isHistory) {
        await fetchHistory();
      } else {
        setOrderTasks((prev) => {
          const next = prev
            .map((t) => {
              if (t.taskId !== taskId) return t;
              const products = (t.products || []).map((p) =>
                p.taskItemId === taskItemId ? { ...p, materialsDelivered: true } : p
              );
              const allDelivered = products.every(
                (p) => p.requiresMaterials === false || p.materialsDelivered
              );
              return { ...t, products, materialsDelivered: allDelivered };
            })
            .filter((t) =>
              (t.products || []).some((p) => p.requiresMaterials !== false && !p.materialsDelivered)
            );
          if (next.length === 0) {
            setOrders((current) => current.filter((order) => order.id !== selectedOrderId));
            setSelectedOrderId(null);
          }
          return next;
        });
      }
    } catch (err) {
      setError(err.message || "No se pudo entregar materiales para el producto");
    }
  };

  const handleMaterialLinePick = async (taskId, taskItemId, materialId, picked, isHistory) => {
    try {
      await setTaskItemMaterialPick(taskId, taskItemId, materialId, picked);
      if (isHistory) {
        await fetchHistory();
      } else if (selectedOrderId) {
        const row = orders.find((o) => o.id === selectedOrderId);
        await fetchOrderTasks(selectedOrderId, row);
      }
    } catch (err) {
      setError(err.message || "No se pudo actualizar la línea de receta");
    }
  };

  const confirmForceDelivery = async () => {
    if (!forceModal) return;
    const { kind, taskId, taskItemId, isHistory } = forceModal;
    setForceModal(null);
    if (kind === "task") {
      await handleDeliverMaterials(taskId, isHistory, true);
    } else {
      await handleDeliverMaterialsForProduct(taskId, taskItemId, isHistory, true);
    }
  };

  const handlePrintDayRecipes = async () => {
    setPrintingDayRecipes(true);
    setError(null);
    try {
      const data = await getMaterialsView(selectedDate, { scheduleDay: true });
      openMaterialsDayRecipesPrintWindow(data || [], selectedDate);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las recetas del día");
    } finally {
      setPrintingDayRecipes(false);
    }
  };

  const printDayDeliveriesReport = () => {
    const tasks = historyTasks || [];
    if (!tasks.length) return;
    const fmtDateTime = (value) => {
      if (!value) return "—";
      try { return formatDateTimeGt(value); } catch { return String(value); }
    };
    const fmtN = (n) => {
      const v = Number(n || 0);
      return Number.isFinite(v)
        ? v.toLocaleString("es-GT", { minimumFractionDigits: 0, maximumFractionDigits: 3 })
        : String(n);
    };
    const blocks = tasks.map((task) => {
      const lines = [];
      (task.products || []).forEach((p) => {
        (p.recipe || []).forEach((m) => {
          if (!m.picked) return;
          lines.push(`<tr><td>${task.taskCode || "—"}</td><td>${task.productionOrderCode || "—"}</td><td>${p.productCode || ""}</td><td>${m.materialSku || "—"}</td><td>${m.materialName || "—"}</td><td style="text-align:right">${fmtN(m.totalQuantity)}</td><td>${m.measurementUnit || "-"}</td><td>${fmtDateTime(m.pickedAt)}</td></tr>`);
        });
      });
      if (!lines.length) return "";
      return `<h3 style="margin:16px 0 6px">${task.taskCode} — ${task.productionOrderCode}</h3><table class="t"><thead><tr><th>Tarea</th><th>OP</th><th>Producto</th><th>SKU</th><th>Material</th><th>Cant.</th><th>U.</th><th>Marcado</th></tr></thead><tbody>${lines.join("")}</tbody></table>`;
    }).filter(Boolean).join("");
    const html = `<!DOCTYPE html><html><head><title>Entregas ${selectedDate}</title><style>body{font-family:Arial;padding:16px} .t{width:100%;border-collapse:collapse;font-size:12px} .t th,.t td{border:1px solid #ccc;padding:6px}</style></head><body><h1>Resumen líneas marcadas — ${selectedDate}</h1>${blocks || "<p>Sin líneas marcadas como despachadas en las tareas listadas.</p>"}<script>window.onload=function(){window.print();}</script></body></html>`;
    const w = window.open("", "_blank", "width=1000,height=760");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const printMaterialsDeliveryReceipt = (task) => {
    const fmtDateTime = (value) => {
      if (!value) return "—";
      try { return formatDateTimeGt(value); } catch { return String(value); }
    };
    const fmtN = (n) => {
      const v = Number(n || 0);
      return Number.isFinite(v)
        ? v.toLocaleString("es-GT", { minimumFractionDigits: 0, maximumFractionDigits: 3 })
        : String(n);
    };

    const aggregate = {};
    (task.products || []).forEach((p) => {
      (p.recipe || []).forEach((m) => {
        const key = `${m.materialId || ""}-${m.materialSku || ""}`;
        if (!aggregate[key]) {
          aggregate[key] = {
            materialSku: m.materialSku || "",
            materialName: m.materialName || "",
            required: 0,
            stock: m.availableStock != null ? Number(m.availableStock) : null,
            unit: m.measurementUnit || "-",
            sufficient: m.sufficientStock !== false,
          };
        }
        aggregate[key].required += Number(m.totalQuantity || 0);
        if (m.sufficientStock === false) aggregate[key].sufficient = false;
      });
    });
    const materials = Object.values(aggregate);
    const rows = materials.map((m, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${m.materialSku || "—"}</td>
        <td>${m.materialName || "—"}</td>
        <td style="text-align:right;font-weight:700;">${fmtN(m.required)}</td>
        <td style="text-align:right;">${m.stock != null ? fmtN(m.stock) : "—"}</td>
        <td>${m.unit}</td>
        <td style="color:${m.sufficient ? "#2e7d32" : "#c62828"};font-weight:700;">${m.sufficient ? "OK" : "SIN STOCK"}</td>
      </tr>
    `).join("");

    const html = `<!DOCTYPE html><html><head><title>Entrega Materiales ${task.taskCode || ""}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;padding:18px;color:#222}
        h1{margin:0 0 6px;font-size:20px}
        .muted{color:#666;font-size:12px}
        .box{border:1px solid #d6d6d6;border-radius:6px;padding:10px;margin-top:10px}
        table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12px}
        th,td{border:1px solid #d6d6d6;padding:6px 8px} th{background:#f3f4f6;text-align:left}
        .sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:30px}
        .line{border-top:1px solid #333;padding-top:4px;text-align:center;font-size:12px}
      </style></head><body>
      <h1>Comprobante de Entrega de Materiales</h1>
      <div class="muted">Certificación de despacho a producción</div>
      <div class="box">
        <div><strong>Tarea:</strong> ${task.taskCode || "—"} | <strong>OP:</strong> ${task.productionOrderCode || "—"}</div>
        <div><strong>Estado:</strong> ${task.status || "—"} | <strong>Workflow:</strong> ${task.workflowStatus || "—"}</div>
        <div><strong>Fecha/Hora:</strong> ${fmtDateTime(task.materialsDeliveredAt || new Date().toISOString())}</div>
      </div>
      <table>
        <thead><tr><th>#</th><th>SKU</th><th>Material</th><th>Total Requerido</th><th>Stock Disponible</th><th>Unidad</th><th>Estado</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="7" style="text-align:center">Sin materiales</td></tr>`}</tbody>
      </table>
      <div class="sign"><div class="line">Entrega Materiales</div><div class="line">Recibe Producción</div></div>
      <script>window.onload=function(){window.print();};</script>
    </body></html>`;

    const w = window.open("", "_blank", "width=1000,height=760");
    if (!w) return;
    w.document.write(html);
    w.document.close();
  };

  const expandAll = (tasks, isHistory = false) => {
    const allExpanded = {};
    tasks.forEach((t) => (allExpanded[t.taskId] = true));
    if (isHistory) setExpandedHistoryTasks(allExpanded);
    else setExpandedTasks(allExpanded);
  };

  const collapseAll = (isHistory = false) => {
    if (isHistory) setExpandedHistoryTasks({});
    else setExpandedTasks({});
  };

  // ─── Filter orders by type ───
  const filteredOrders = orderTypeFilter
    ? orders.filter((o) => o.orderType === orderTypeFilter)
    : orders;

  const filteredOrderTasks = useMemo(() => {
    const tasks = orderTasks || [];
    if (workflowFilter === "NOT_PRODUCED") {
      return tasks.filter((t) => t.workflowStatus !== "COMPLETED" && t.status !== "COMPLETED" && t.status !== "CANCELLED");
    }
    if (workflowFilter === "MATERIALS_ACTIONABLE") {
      return tasks.filter((t) => (
        t.workflowStatus === "PENDING_MATERIAL_DELIVERY"
        && t.status !== "CANCELLED"
        && !taskSkipsMaterials(t)
      ));
    }
    if (workflowFilter === "PREPARATION") {
      return tasks.filter((t) =>
        (t.workflowStatus === "PENDING_LEATHER"
          || t.workflowStatus === "PENDING_DIE_CUT"
          || t.workflowStatus === "PENDING_TABLE_ENTRY")
        && t.status !== "CANCELLED"
      );
    }
    if (workflowFilter === "PRODUCED") {
      return tasks.filter((t) => t.workflowStatus === "COMPLETED" || t.status === "COMPLETED");
    }
    return tasks.filter((t) => t.status !== "CANCELLED");
  }, [orderTasks, workflowFilter]);

  const selectedOrder = useMemo(
    () => (orders || []).find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  const showCinchoReadonlyRecipes = Boolean(
    selectedOrderId &&
    selectedOrder &&
    isCinchoOrderType(selectedOrder.orderType) &&
    (orderTasks || []).length === 0
  );

  // ─── Render task card (reusable for both tabs) ───
  const renderTaskCard = (task, expanded, isHistory) => (
    <Card key={task.taskId} className="mb-2 border">
      <CardHeader
        className="py-2"
        onClick={() => toggleTask(task.taskId, isHistory)}
        style={{ cursor: "pointer", backgroundColor: expanded ? "#eef6ff" : "#f8f9fa" }}
      >
        <Row className="align-items-center">
          <Col md="2">
            <strong>{task.taskCode}</strong>
            {isHistory && (
              <>
                <br />
                <small className="text-muted">OP: {task.productionOrderCode}</small>
              </>
            )}
          </Col>
          <Col md="2">
            <span style={STATUS_STYLES[task.status] || DEFAULT_BADGE}>
              {STATUS_LABELS[task.status] || task.status}
            </span>
            {task.workflowStatus && (
              <span style={{ ...(WORKFLOW_STYLES[task.workflowStatus] || DEFAULT_BADGE), marginLeft: 4 }}>
                {WORKFLOW_LABELS[task.workflowStatus] || task.workflowStatus}
              </span>
            )}
            {task.orderType && (
              <span style={{ ...(ORDER_TYPE_STYLES[task.orderType] || DEFAULT_BADGE), marginLeft: 4 }}>
                {ORDER_TYPE_LABELS[task.orderType] || task.orderType}
              </span>
            )}
          </Col>
          <Col md="2">
            {task.desk != null && <span>Mesa {task.desk}</span>}
            {task.startTime && (
              <span className="ml-2 text-muted">{task.startTime}</span>
            )}
          </Col>
          <Col md="2">
            <small className="text-muted">
              {task.estimatedHours ? `${task.estimatedHours}h est.` : ""}
            </small>
          </Col>
          <Col md="4">
            {task.products &&
              task.products.map((p, idx) => (
                <Badge key={idx} color="light" className="mr-1 text-dark" style={{ fontSize: "0.8em" }}>
                  {p.productName || p.productCode}{" "}
                  {p.colorName ? `(${p.colorName})` : ""} x{p.quantity}
                </Badge>
              ))}
            <div className="mt-1">
              {taskRecipeHasStockWarning(task) && !task.materialsDelivered && (
                <Alert color="warning" className="py-1 px-2 mb-2" style={{ fontSize: "12px" }}>
                  <strong>Stock:</strong> hay materiales bajo el requerido. Puede entregar igual; se pedirá confirmación forzada.
                </Alert>
              )}
              {taskSkipsMaterials(task) ? (
                <Badge color="info">No requiere materiales</Badge>
              ) : (
                <Button
                  size="md"
                  color={taskMaterialsReady(task) ? "success" : "warning"}
                  disabled={
                    task.materialsDelivered
                    || task.status === "CANCELLED"
                    || task.status === "COMPLETED"
                  }
                  style={{ fontWeight: 700, minWidth: 220 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeliverMaterials(task.taskId, isHistory, false);
                  }}
                >
                  {task.materialsDelivered ? "✓ Materiales entregados" : "Entregar materiales de la tarea"}
                </Button>
              )}
            </div>
          </Col>
        </Row>
      </CardHeader>

      <Collapse isOpen={!!expanded}>
        <CardBody className="pt-2">
          {task.products &&
            task.products.map((product, pIdx) => (
              <div key={pIdx} className="mb-3">
                <h6 className="mb-2">
                  <i className="nc-icon nc-bag-16 mr-1" />
                  {product.productName || product.productCode}
                  {product.colorName && (
                    <span className="text-muted"> - {product.colorName}</span>
                  )}
                  <Badge color="primary" className="ml-2">x{product.quantity}</Badge>
                </h6>

                {product.recipe && product.recipe.length > 0 ? (
                  <Table size="sm" bordered striped responsive>
                    <thead>
                      <tr>
                        <th className="text-center" style={{ width: 42 }}>✓</th>
                        <th>SKU</th>
                        <th>Material</th>
                        <th className="text-right">Qty/Unidad</th>
                        <th className="text-right">Total Requerido</th>
                        <th className="text-right">Stock Disponible</th>
                        <th className="text-center">Stock</th>
                        <th>Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.recipe.map((mat, mIdx) => (
                        <tr
                          key={mIdx}
                          className={mat.picked ? "table-success" : undefined}
                        >
                          <td className="text-center align-middle">
                            <Input
                              type="checkbox"
                              checked={Boolean(mat.picked)}
                              disabled={
                                product.materialsDelivered
                                || !product.taskItemId
                                || task.status === "CANCELLED"
                                || task.status === "COMPLETED"
                              }
                              onChange={(e) => {
                                e.stopPropagation();
                                handleMaterialLinePick(
                                  task.taskId,
                                  product.taskItemId,
                                  mat.materialId,
                                  e.target.checked,
                                  isHistory
                                );
                              }}
                              title="Marcar material como despachado / preparado"
                            />
                          </td>
                          <td><code>{mat.materialSku}</code></td>
                          <td>{mat.materialName}</td>
                          <td className="text-right">{mat.quantityPerUnit}</td>
                          <td className="text-right font-weight-bold">{mat.totalQuantity}</td>
                          <td className="text-right">{mat.availableStock ?? "-"}</td>
                          <td className="text-center">
                            {mat.sufficientStock ? <Badge color="success">OK</Badge> : <Badge color="danger">Sin stock</Badge>}
                          </td>
                          <td>{mat.measurementUnit || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <Alert color="light" className="py-2 mb-0">
                    <small>
                      <i className="nc-icon nc-alert-circle-i mr-1" />
                      Sin receta (BOM) configurada para este producto
                    </small>
                  </Alert>
                )}
                <div className="mt-2">
                  {product.requiresMaterials === false ? (
                    <Badge color="info">Producto sin materiales (solo cuero)</Badge>
                  ) : (
                    <>
                      {(product.recipe || []).some((m) => m.sufficientStock === false) && !product.materialsDelivered && (
                        <Alert color="warning" className="py-1 px-2 mb-2" style={{ fontSize: "12px" }}>
                          Stock insuficiente en receta; la entrega puede forzarse.
                        </Alert>
                      )}
                      <Button
                        size="md"
                        color={product.materialsDelivered ? "success" : "warning"}
                        disabled={
                          product.materialsDelivered
                          || !product.taskItemId
                          || task.status === "CANCELLED"
                          || task.status === "COMPLETED"
                        }
                        style={{ fontWeight: 700, minWidth: 280 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeliverMaterialsForProduct(task.taskId, product.taskItemId, isHistory, false);
                        }}
                      >
                        {product.materialsDelivered ? "✓ Materiales del producto entregados" : "Entregar materiales de este producto"}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
        </CardBody>
      </Collapse>
    </Card>
  );

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="6">
                  <CardTitle tag="h4">
                    <i className="nc-icon nc-box-2 mr-2" />
                    Vista de Materiales
                  </CardTitle>
                  <p className="text-muted mb-0">
                    Recetas (BOM) por orden de producción para despacho de materiales
                  </p>
                </Col>
                <Col md="6" className="text-right">
                  <Nav pills className="justify-content-end">
                    <NavItem>
                      <NavLink
                        className={activeTab === "orders" ? "active" : ""}
                        onClick={() => setActiveTab("orders")}
                        style={{ cursor: "pointer" }}
                      >
                        <i className="nc-icon nc-single-copy-04 mr-1" />
                        Órdenes Activas
                      </NavLink>
                    </NavItem>
                    <NavItem>
                      <NavLink
                        className={activeTab === "history" ? "active" : ""}
                        onClick={() => setActiveTab("history")}
                        style={{ cursor: "pointer" }}
                      >
                        <i className="nc-icon nc-calendar-60 mr-1" />
                        Historial por Fecha
                      </NavLink>
                    </NavItem>
                  </Nav>
                </Col>
              </Row>
            </CardHeader>

            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              <TabContent activeTab={activeTab}>
                {/* ═══════ TAB 1: ORDERS ═══════ */}
                <TabPane tabId="orders">
                  {/* Filters */}
                  <Row className="mb-3 align-items-center">
                    <Col md="3">
                      <Input
                        type="select"
                        value={orderTypeFilter}
                        onChange={(e) => setOrderTypeFilter(e.target.value)}
                        bsSize="sm"
                      >
                        <option value="">Todos los tipos</option>
                        <option value="NORMAL">Kiosko</option>
                        <option value="DISTRIBUTION">Distribución</option>
                        <option value="VENTA_EN_LINEA">Venta en Línea</option>
                        <option value="CLIENTE_KIOSKO">Cliente Kiosko</option>
                        <option value="CINCHOS">Cinchos</option>
                        <option value="CINCHOS_FOSSILES">Cinchos Fossiles</option>
                        <option value="CINCHOS_MARCAS">Cinchos Marcas</option>
                        <option value="MARCAS">Marcas</option>
                      </Input>
                    </Col>
                    {!showCinchoReadonlyRecipes ? (
                    <Col md="4">
                      <Input
                        type="select"
                        value={workflowFilter}
                        onChange={(e) => setWorkflowFilter(e.target.value)}
                        bsSize="sm"
                      >
                        <option value="NOT_PRODUCED">No producidas (general)</option>
                        <option value="MATERIALS_ACTIONABLE">Listas para entrega de materiales</option>
                        <option value="PREPARATION">Previas (cuero/troquel/mesa) para preparar</option>
                        <option value="PRODUCED">Producidas</option>
                        <option value="ALL">Todas</option>
                      </Input>
                    </Col>
                    ) : null}
                    <Col md={showCinchoReadonlyRecipes ? "9" : "5"} className="text-right">
                      <Badge color="primary" className="mr-2 p-2">
                        {filteredOrders.length} órdenes visibles
                      </Badge>
                      <Button size="sm" color="primary" onClick={fetchOrders}>
                        <i className="nc-icon nc-refresh-69 mr-1" />
                        Actualizar
                      </Button>
                    </Col>
                  </Row>

                  {loadingOrders ? (
                    <div className="text-center py-4">
                      <Spinner color="primary" />
                      <p className="mt-2">Cargando órdenes...</p>
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <Alert color="info">No hay órdenes de producción activas.</Alert>
                  ) : (
                    <>
                      <Row>
                        {filteredOrders.map((order) => {
                          const isSelected = selectedOrderId === order.id;
                          return (
                            <Col md="6" lg="4" key={order.id} className="mb-3">
                              <Card
                                onClick={() => handleSelectOrder(order.id, order)}
                                style={{
                                  cursor: "pointer",
                                  border: isSelected ? "2px solid #007bff" : "1px solid #e9ecef",
                                  boxShadow: isSelected ? "0 0 0 2px rgba(0,123,255,0.1)" : "none",
                                }}
                              >
                                <CardBody className="py-3">
                                  <div className="d-flex justify-content-between align-items-start mb-2">
                                    <strong style={{ fontSize: 18 }}>{formatProductionOrderCodeDate(order)}</strong>
                                    <span style={STATUS_STYLES[order.status] || DEFAULT_BADGE}>
                                      {STATUS_LABELS[order.status] || order.status}
                                    </span>
                                  </div>
                                  <div className="mb-1">
                                    <span style={ORDER_TYPE_STYLES[order.orderType] || DEFAULT_BADGE}>
                                      {ORDER_TYPE_LABELS[order.orderType] || order.orderType}
                                    </span>
                                  </div>
                                  <div className="text-muted" style={{ fontSize: 13 }}>
                                    Cliente: {order.customerName || "-"}
                                  </div>
                                  <div className="text-muted" style={{ fontSize: 13 }}>
                                    Productos: {order.items ? order.items.length : 0}
                                  </div>
                                  <div className="text-muted mb-3" style={{ fontSize: 13 }}>
                                    Entrega: {order.deliveryDate || "Sin fecha"}
                                  </div>
                                  <Button
                                    color={isSelected ? "primary" : "outline-primary"}
                                    block
                                    style={{ fontSize: 16, fontWeight: 700, padding: "10px 12px" }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSelectOrder(order.id, order);
                                    }}
                                  >
                                    {isSelected
                                      ? "Ocultar orden"
                                      : isCinchoOrderType(order.orderType)
                                        ? "Abrir orden (recetas cincho)"
                                        : "Abrir orden y entregar materiales"}
                                  </Button>
                                </CardBody>
                              </Card>
                            </Col>
                          );
                        })}
                      </Row>

                      {/* Selected order tasks */}
                      {selectedOrderId && (
                        <Card className="mt-3 border-top border-primary" style={{ borderTopWidth: "3px" }}>
                          <CardHeader className="py-2" style={{ backgroundColor: "#f0f7ff" }}>
                            <Row className="align-items-center">
                              <Col md="6">
                                <h5 className="mb-0">
                                  <i className="nc-icon nc-ruler-pencil mr-2" />
                                  {showCinchoReadonlyRecipes
                                    ? "Recetas (cincho)"
                                    : "Tareas y Recetas"}{" "}
                                  — {formatProductionOrderCodeDate(orders.find(o => o.id === selectedOrderId)) || "—"}
                                </h5>
                              </Col>
                              <Col md="6" className="text-right">
                                {orderTasks.length > 0 && (
                                  <>
                                    <Badge color="primary" className="mr-2 p-2">
                                      {filteredOrderTasks.length} tareas (filtro)
                                    </Badge>
                                    <Button size="sm" color="info" onClick={() => expandAll(orderTasks)} className="mr-1">
                                      Expandir todo
                                    </Button>
                                    <Button size="sm" color="secondary" onClick={() => collapseAll()}>
                                      Colapsar
                                    </Button>
                                  </>
                                )}
                              </Col>
                            </Row>
                          </CardHeader>
                          <CardBody>
                            {loadingTasks || loadingCinchoRecipes ? (
                              <div className="text-center py-3">
                                <Spinner color="primary" size="sm" />
                                <span className="ml-2">
                                  {loadingCinchoRecipes ? "Cargando recetas cincho…" : "Cargando tareas..."}
                                </span>
                              </div>
                            ) : showCinchoReadonlyRecipes ? (
                              <>
                                <h6 className="text-primary font-weight-bold">{CINCHO_MATERIALS_READONLY_TITLE}</h6>
                                <p className="text-muted small mb-3">{CINCHO_MATERIALS_READONLY_SUB}</p>
                                {cinchoRecipeBlocks.map((block) => (
                                  <div key={block.key} className="mb-4 pb-3 border-bottom">
                                    <div className="d-flex justify-content-between align-items-start flex-wrap mb-2">
                                      <div>
                                        <strong>{(block.productCode || "").trim() || "—"}</strong>
                                        <span className="ml-2">{block.productName || "Producto"}</span>
                                        {block.colorName ? (
                                          <span className="text-muted ml-1">— {block.colorName}</span>
                                        ) : null}
                                      </div>
                                      <Badge color="info">Piezas {block.pieceQty}</Badge>
                                    </div>
                                    {block.recipe.length === 0 ? (
                                      <Alert color="light" className="py-2 mb-0">
                                        <small>Sin receta (BOM) configurada para este producto/color.</small>
                                      </Alert>
                                    ) : (
                                      <Table size="sm" bordered striped responsive className="mb-0">
                                        <thead>
                                          <tr>
                                            <th>SKU</th>
                                            <th>Material</th>
                                            <th className="text-right">Qty / unidad</th>
                                            <th className="text-right">Total req.</th>
                                            <th className="text-right">Stock</th>
                                            <th className="text-center">Estado</th>
                                            <th>Unidad</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {block.recipe.map((m) => (
                                            <tr key={m.materialId}>
                                              <td><code>{m.materialSku || "—"}</code></td>
                                              <td>{m.materialName || "—"}</td>
                                              <td className="text-right">{m.quantityPerUnit}</td>
                                              <td className="text-right font-weight-bold">{m.totalQuantity}</td>
                                              <td className="text-right">{m.availableStock}</td>
                                              <td className="text-center">
                                                {m.sufficientStock ? (
                                                  <Badge color="success">OK</Badge>
                                                ) : (
                                                  <Badge color="danger">Sin stock</Badge>
                                                )}
                                              </td>
                                              <td>{m.measurementUnit || "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </Table>
                                    )}
                                    <p className="text-muted small mb-0 mt-2">
                                      Referencia de materiales; sin entrega por tarea en órdenes cincho.
                                    </p>
                                  </div>
                                ))}
                              </>
                            ) : filteredOrderTasks.length === 0 ? (
                              <Alert color="warning" className="mb-0">
                                <i className="nc-icon nc-alert-circle-i mr-1" />
                                No hay tareas para el filtro seleccionado en esta orden.
                              </Alert>
                            ) : (
                              filteredOrderTasks
                                .filter((t) => t.status !== "CANCELLED")
                                .map((task) => renderTaskCard(task, expandedTasks[task.taskId], false))
                            )}
                          </CardBody>
                        </Card>
                      )}
                    </>
                  )}
                </TabPane>

                {/* ═══════ TAB 2: HISTORY ═══════ */}
                <TabPane tabId="history">
                  <Row className="mb-3 align-items-center">
                    <Col md="3">
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        bsSize="sm"
                      />
                    </Col>
                    <Col md="9" className="text-right">
                      <Badge color="primary" className="mr-2 p-2">
                        {historyTasks.length} tareas
                      </Badge>
                      <Badge color="info" className="mr-2 p-2">
                        {historyTasks.filter((t) => t.status === "IN_PROGRESS").length} en progreso
                      </Badge>
                      <Badge color="warning" className="p-2 mr-2">
                        {historyTasks.filter((t) => t.status === "PENDING").length} pendientes
                      </Badge>
                      <Button size="sm" color="info" onClick={() => expandAll(historyTasks, true)} className="mr-1">
                        Expandir todo
                      </Button>
                      <Button size="sm" color="secondary" onClick={() => collapseAll(true)}>
                        Colapsar
                      </Button>
                      <Button size="sm" color="success" className="ml-1" onClick={printDayDeliveriesReport}>
                        Imprimir líneas marcadas
                      </Button>
                      <Button
                        size="sm"
                        color="dark"
                        className="ml-1"
                        disabled={printingDayRecipes}
                        onClick={() => void handlePrintDayRecipes()}
                      >
                        {printingDayRecipes ? (
                          <>
                            <Spinner size="sm" className="mr-1" />
                            Cargando…
                          </>
                        ) : (
                          <>
                            <i className="nc-icon nc-paper mr-1" />
                            Imprimir recetas del día
                          </>
                        )}
                      </Button>
                    </Col>
                  </Row>
                  <Alert color="light" className="py-2 mb-3" style={{ fontSize: "13px" }}>
                    Lista las tareas con <strong>fecha de programación</strong> en el día elegido (incluye ya entregadas
                    o en otro estado). Si el día es <strong>hoy</strong>, también aparecen tareas sin fecha o atrasadas
                    que sigan activas. <strong>Imprimir recetas del día</strong> usa la misma base:{" "}
                    <strong>todas</strong> las tareas del día con su receta (las ya entregadas van marcadas).
                  </Alert>

                  {loadingHistory ? (
                    <div className="text-center py-4">
                      <Spinner color="primary" />
                      <p className="mt-2">Cargando tareas...</p>
                    </div>
                  ) : historyTasks.length === 0 ? (
                    <Alert color="info">
                      No hay tareas programadas para esta fecha (ni cola activa sin fecha si es hoy).
                    </Alert>
                  ) : (
                    historyTasks.map((task) =>
                      renderTaskCard(task, expandedHistoryTasks[task.taskId], true)
                    )
                  )}
                </TabPane>
              </TabContent>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Modal isOpen={Boolean(forceModal)} toggle={() => setForceModal(null)}>
        <ModalHeader toggle={() => setForceModal(null)}>Confirmar entrega forzada</ModalHeader>
        <ModalBody>
          Hay materiales con stock por debajo del requerido. Si continúa, el inventario puede quedar negativo y quedará
          registrado en el consumo. ¿Desea continuar?
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setForceModal(null)}>Cancelar</Button>
          <Button color="warning" onClick={() => void confirmForceDelivery()}>Sí, forzar entrega</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default MaterialsTasksView;
