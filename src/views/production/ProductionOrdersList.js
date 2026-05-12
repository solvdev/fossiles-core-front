import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Badge,
  FormGroup,
  Label,
  Input,
  Alert,
} from "reactstrap";
import { 
  getProductionOrders, 
  deleteProductionOrder,
  getProductionOrdersByType,
  getProductionOrdersByStatus 
} from "services/productionOrderService";
import { getTasks } from "services/taskService";
import { formatDateGt, formatDateDdMmYyGt } from "utils/dateTimeHelper";
import { exportRowsToCsv } from "utils/reportExportHelper";
import ProductionOrderForm from "./ProductionOrderForm";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";

const OP_EXPORT_HEADERS = [
  { label: "OP", value: "opCode" },
  { label: "Tipo", value: "type" },
  { label: "Proceso", value: "process" },
  { label: "Estado", value: "status" },
  { label: "Cliente/Dist.", value: "customer" },
  { label: "Vendedor", value: "seller" },
  { label: "Inicio", value: "startDate" },
  { label: "Entrega", value: "deliveryDate" },
  { label: "Cod. Producto", value: "productCode" },
  { label: "Producto", value: "productName" },
  { label: "Color", value: "colorName" },
  { label: "Talla", value: "size" },
  { label: "Planificado", value: "plannedQty" },
  { label: "Observaciones", value: "observations" },
  { label: "Avance OP", value: "orderProgress" },
];

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

function ProductionOrdersList() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterProcess, setFilterProcess] = useState("ACTIVE");
  const [showForm, setShowForm] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    loadOrders();
  }, [filterType, filterStatus]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError("");
      let data;
      
      if (filterType !== "all" && filterStatus !== "all") {
        // Filtrar por ambos
        const typeData = await getProductionOrdersByType(filterType);
        data = typeData.filter(order => order.status === filterStatus);
      } else if (filterType !== "all") {
        data = await getProductionOrdersByType(filterType);
      } else if (filterStatus !== "all") {
        data = await getProductionOrdersByStatus(filterStatus);
      } else {
        data = await getProductionOrders();
      }
      const taskData = await getTasks();
      setOrders(data || []);
      setTasks(taskData || []);
    } catch (err) {
      setError(err.message || "Error al cargar las órdenes de producción");
      showError(err.message || "Error al cargar las órdenes de producción");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedOrderId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedOrderId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadOrders();
    setShowForm(false);
    setSelectedOrderId(null);
  };

  const handleDeleteClick = (id) => {
    const order = orders.find((o) => o.id === id);
    setOrderToDelete({ 
      id, 
      code: order?.code || "esta orden",
      type: order?.orderType || ""
    });
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!orderToDelete) return;
    
    try {
      await deleteProductionOrder(orderToDelete.id);
      showSuccess("Orden de producción eliminada correctamente");
      loadOrders();
    } catch (err) {
      showError(err.message || "Error al eliminar la orden de producción");
    } finally {
      setOrderToDelete(null);
    }
  };

  const goToProductionCenter = (orderId) => {
    const query = orderId ? `?orderId=${orderId}` : "";
    navigate(`/admin/tasks-by-station${query}`);
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      PENDING: { color: "warning", text: "Pendiente" },
      IN_PROGRESS: { color: "info", text: "En Progreso" },
      IN_QA: { color: "info", text: "En Progreso" },
      COMPLETED: { color: "success", text: "Completada" },
      CANCELLED: { color: "danger", text: "Cancelada" },
    };
    const statusInfo = statusMap[status] || { color: "secondary", text: status };
    return <Badge color={statusInfo.color}>{statusInfo.text}</Badge>;
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      PENDING: "Pendiente",
      IN_PROGRESS: "En Progreso",
      IN_QA: "En Progreso",
      COMPLETED: "Completada",
      CANCELLED: "Cancelada",
    };
    return statusMap[status] || status || "-";
  };

  const getTypeBadge = (type) => {
    const typeMap = {
      CINCHOS: { color: "primary", text: "CINCHOS" },
      MARCAS: { color: "info", text: "MARCAS" },
      NORMAL: { color: "success", text: "NORMAL" },
      DISTRIBUTION: { color: "warning", text: "DISTRIBUCIÓN" },
      VENTA_EN_LINEA: { color: "secondary", text: "VENTA EN LÍNEA" },
    };
    const typeInfo = typeMap[type] || { color: "secondary", text: type };
    return <Badge color={typeInfo.color}>{typeInfo.text}</Badge>;
  };

  const getTypeLabel = (type) => {
    const typeMap = {
      CINCHOS: "CINCHOS",
      MARCAS: "MARCAS",
      OPV: "OPV",
      NORMAL: "NORMAL",
      DISTRIBUTION: "DISTRIBUCIÓN",
      VENTA_EN_LINEA: "VENTA EN LÍNEA",
      INTERNA: "INTERNA",
    };
    return typeMap[type] || type || "-";
  };

  const getTotalQuantity = (items) => {
    if (!items || items.length === 0) return 0;
    return items.reduce((total, item) => {
      if (item.sizes) {
        // Para cinchos, sumar todas las tallas
        return total + Object.values(item.sizes).reduce((sum, qty) => sum + (qty || 0), 0);
      }
      return total + (item.quantity || 0);
    }, 0);
  };

  const getProducedQuantity = (items) => {
    if (!items || items.length === 0) return 0;
    return items.reduce((total, item) => {
      const planned = item.sizes
        ? Object.values(item.sizes).reduce((sum, qty) => sum + (qty || 0), 0)
        : Number(item.quantity || 0);
      const received = Number(item.warehouseReceivedQty || 0);
      return total + Math.min(Math.max(received, 0), Math.max(planned, 0));
    }, 0);
  };

  const getOrderQtyProgress = (items) => {
    const total = getTotalQuantity(items);
    const produced = getProducedQuantity(items);
    const pending = Math.max(total - produced, 0);
    const pct = total > 0 ? Math.round((produced / total) * 100) : 0;
    return { total, produced, pending, pct };
  };

  const getProcessStage = (order) => {
    const qty = getOrderQtyProgress(order?.items);
    if (order?.status === "CANCELLED") return { key: "CANCELLED", label: "Cancelada", color: "danger" };
    if (order?.status === "PENDING") return { key: "PENDING_PRODUCTION", label: "Pendiente en Producción", color: "warning" };
    if (order?.status === "IN_PROGRESS") return { key: "IN_PRODUCTION", label: "En Producción", color: "info" };
    if (order?.status === "COMPLETED" && qty.pending > 0) return { key: "IN_BODEGA", label: "Pendiente en Bodega PT", color: "primary" };
    if (order?.status === "COMPLETED" && qty.pending <= 0) return { key: "READY_DISPATCH", label: "Lista para Despacho", color: "success" };
    return { key: "OTHER", label: order?.status || "Sin estado", color: "secondary" };
  };

  const filteredOrders = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return orders.filter((order) => {
      const qty = getOrderQtyProgress(order.items);
      const stage = getProcessStage(order);
      const processMatches =
        filterProcess === "ALL" ||
        (filterProcess === "ACTIVE" && stage.key !== "READY_DISPATCH" && stage.key !== "CANCELLED") ||
        (filterProcess === "PRODUCTION" && (stage.key === "PENDING_PRODUCTION" || stage.key === "IN_PRODUCTION")) ||
        (filterProcess === "BODEGA" && stage.key === "IN_BODEGA") ||
        (filterProcess === "READY" && stage.key === "READY_DISPATCH") ||
        (filterProcess === "CANCELLED" && stage.key === "CANCELLED");
      if (!processMatches) return false;
      if (!term) return true;
      const searchText = `${order.code || ""} ${order.customerName || ""} ${order.sellerName || ""} ${order.distributionNumber || ""} ${formatDateDdMmYyGt(order.startDate)} ${formatDateDdMmYyGt(order.createdAt)} ${stage.label} ${qty.pct}%`.toLowerCase();
      return searchText.includes(term);
    });
  }, [orders, searchTerm, filterProcess]);

  const getOrderProcessDates = (orderId, fallbackStart, fallbackDelivery) => {
    const orderTasks = tasks.filter((task) => Number(task.productionOrderId) === Number(orderId));

    const toMs = (value) => {
      if (!value) return null;
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    };

    const startCandidates = [];
    orderTasks.forEach((task) => {
      const started = toMs(task.startedAt);
      const scheduled = toMs(task.scheduledDate);
      if (started != null) startCandidates.push(started);
      if (scheduled != null) startCandidates.push(scheduled);
    });

    const deliveryCandidates = [];
    orderTasks.forEach((task) => {
      const completed = toMs(task.completedAt);
      if (completed != null) deliveryCandidates.push(completed);
    });
    return {
      startValue: startCandidates.length ? new Date(Math.min(...startCandidates)).toISOString() : fallbackStart,
      deliveryValue: deliveryCandidates.length ? new Date(Math.max(...deliveryCandidates)).toISOString() : fallbackDelivery,
    };
  };

  const getItemExportLines = (item) => {
    const sizes = item?.sizes && typeof item.sizes === "object" ? item.sizes : null;
    const sizeEntries = sizes
      ? Object.entries(sizes).filter(([, qty]) => Number(qty || 0) > 0)
      : [];

    if (sizeEntries.length > 0) {
      return sizeEntries.map(([size, qty]) => ({
        size,
        plannedQty: Number(qty || 0),
      }));
    }

    const plannedQty = Number(item?.quantity || 0);
    return [{ size: item?.size || "", plannedQty }];
  };

  const buildExportRows = (sourceOrders = filteredOrders) => {
    const rows = [];

    sourceOrders.forEach((order) => {
      const processDates = getOrderProcessDates(order.id, order.startDate, order.deliveryDate);
      const qtyProgress = getOrderQtyProgress(order.items);
      const stage = getProcessStage(order);
      const customer =
        order.orderType === "DISTRIBUTION" && order.distributionNumber
          ? order.distributionNumber
          : order.customerName || "-";
      const baseRow = {
        opCode: order.code || "-",
        type: getTypeLabel(order.orderType),
        process: stage.label,
        status: getStatusLabel(order.status),
        customer,
        seller: order.orderType === "DISTRIBUTION" ? "-" : order.sellerName || "-",
        startDate: processDates.startValue ? formatDateGt(processDates.startValue) : "-",
        deliveryDate: processDates.deliveryValue ? formatDateGt(processDates.deliveryValue) : "-",
        orderTotalQty: qtyProgress.total,
        orderProgress: `${qtyProgress.pct}%`,
      };

      const items = Array.isArray(order.items) ? order.items : [];
      if (items.length === 0) {
        rows.push({
          ...baseRow,
          productCode: "-",
          productName: "-",
          colorName: "-",
          size: "-",
          plannedQty: 0,
          observations: "-",
        });
        return;
      }

      items.forEach((item) => {
        getItemExportLines(item).forEach((line) => {
          rows.push({
            ...baseRow,
            productCode: item.productCode || "-",
            productName: item.productName || "-",
            colorName: item.colorName || "-",
            size: line.size || "-",
            plannedQty: line.plannedQty,
            observations: item.observations || "-",
          });
        });
      });
    });

    return rows;
  };

  const buildOrderLineRows = (order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) {
      return [{
        productCode: "-",
        productName: "-",
        colorName: "-",
        size: "-",
        plannedQty: 0,
        observations: "-",
      }];
    }

    return items.flatMap((item) =>
      getItemExportLines(item).map((line) => ({
        productCode: item.productCode || "-",
        productName: item.productName || "-",
        colorName: item.colorName || "-",
        size: line.size || "-",
        plannedQty: line.plannedQty,
        observations: item.observations || "-",
      }))
    );
  };

  const exportProductionOrderExcel = (order) => {
    const rows = buildExportRows([order]);
    if (rows.length === 0) {
      showError("No hay órdenes para exportar");
      return;
    }
    exportRowsToCsv(`orden_produccion_${order.code || order.id}`, OP_EXPORT_HEADERS, rows);
  };

  const exportProductionOrderPdf = (order) => {
    if (!order) {
      showError("No hay órdenes para exportar");
      return;
    }

    const generatedAt = new Date().toLocaleString("es-GT");
    const processDates = getOrderProcessDates(order.id, order.startDate, order.deliveryDate);
    const qtyProgress = getOrderQtyProgress(order.items);
    const stage = getProcessStage(order);
    const customer =
      order.orderType === "DISTRIBUTION" && order.distributionNumber
        ? order.distributionNumber
        : order.customerName || "-";
    const lineRows = buildOrderLineRows(order);
    const bodyRows = lineRows.map((line, idx) => {
      const hasObservations = line.observations && line.observations !== "-";
      return `
        <tr>
          <td class="numeric">${idx + 1}</td>
          <td>${escapeHtml(line.productCode)}</td>
          <td>${escapeHtml(line.productName)}</td>
          <td>${escapeHtml(line.colorName)}</td>
          <td>${escapeHtml(line.size)}</td>
          <td class="numeric">${escapeHtml(line.plannedQty)}</td>
        </tr>
        ${
          hasObservations
            ? `<tr class="observation-row">
                <td></td>
                <td colspan="5"><strong>Observación:</strong> ${escapeHtml(line.observations)}</td>
              </tr>`
            : ""
        }
      `;
    }).join("");

    const section = `
        <section class="op-doc">
          <div class="op-title">
            <div>
              <div class="brand">FOSSILES</div>
              <h1>Orden de Producción</h1>
            </div>
            <div class="op-code">${escapeHtml(order.code || "-")}</div>
          </div>

          <table class="meta">
            <tbody>
              <tr>
                <th>Tipo</th>
                <td>${escapeHtml(getTypeLabel(order.orderType))}</td>
                <th>Estado</th>
                <td>${escapeHtml(getStatusLabel(order.status))}</td>
              </tr>
              <tr>
                <th>Proceso</th>
                <td>${escapeHtml(stage.label)}</td>
                <th>Avance</th>
                <td>${escapeHtml(`${qtyProgress.pct}%`)}</td>
              </tr>
              <tr>
                <th>Cliente/Distribución</th>
                <td>${escapeHtml(customer)}</td>
                <th>Vendedor</th>
                <td>${escapeHtml(order.orderType === "DISTRIBUTION" ? "-" : order.sellerName || "-")}</td>
              </tr>
              <tr>
                <th>Inicio</th>
                <td>${escapeHtml(processDates.startValue ? formatDateGt(processDates.startValue) : "-")}</td>
                <th>Entrega</th>
                <td>${escapeHtml(processDates.deliveryValue ? formatDateGt(processDates.deliveryValue) : "-")}</td>
              </tr>
              <tr>
                <th>Total planificado</th>
                <td>${escapeHtml(qtyProgress.total)}</td>
                <th>Generado</th>
                <td>${escapeHtml(generatedAt)}</td>
              </tr>
            </tbody>
          </table>

          <table class="lines">
            <thead>
              <tr>
                <th>#</th>
                <th>Código</th>
                <th>Producto</th>
                <th>Color</th>
                <th>Talla</th>
                <th>Planificado</th>
              </tr>
            </thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </section>
      `;

    const win = window.open("", "_blank");
    if (!win) return;

    win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Orden de Producción ${escapeHtml(order.code || "")}</title>
          <style>
            @page { size: letter; margin: 9mm; }
            body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 10.5px; }
            .print-meta { margin: 0 0 8px; color: #555; font-size: 10px; }
            .op-doc { border: 1px solid #111; padding: 10px; margin-bottom: 12px; }
            .op-title { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
            .brand { font-size: 12px; font-weight: 700; letter-spacing: 1px; }
            h1 { margin: 2px 0 0; font-size: 18px; }
            .op-code { font-size: 20px; font-weight: 700; border: 1px solid #111; padding: 6px 10px; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px solid #777; padding: 5px 6px; vertical-align: top; overflow-wrap: anywhere; }
            th { background: #f3f4f6; font-weight: 700; text-align: left; }
            .meta { margin-bottom: 10px; }
            .meta th { width: 18%; }
            .meta td { width: 32%; }
            .lines th { text-align: center; }
            .lines th:nth-child(1), .lines td:nth-child(1) { width: 5%; text-align: center; }
            .lines th:nth-child(2), .lines td:nth-child(2) { width: 14%; }
            .lines th:nth-child(3), .lines td:nth-child(3) { width: 36%; }
            .lines th:nth-child(4), .lines td:nth-child(4) { width: 15%; }
            .lines th:nth-child(5), .lines td:nth-child(5) { width: 12%; }
            .lines th:nth-child(6), .lines td:nth-child(6) { width: 18%; }
            .observation-row td {
              background: #fafafa;
              font-size: 10px;
              line-height: 1.25;
              padding: 4px 6px 6px;
            }
            .numeric { text-align: right; white-space: nowrap; }
            @media print { .no-print { display: none; } }
          </style>
        </head>
        <body>
          <div class="print-meta no-print">Generado: ${escapeHtml(generatedAt)} · OP: ${escapeHtml(order.code || "-")}</div>
          ${section}
          <script>
            window.onload = function () {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Órdenes de Producción (POs)</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="secondary" onClick={() => goToProductionCenter()} className="btn-round mr-2">
                    <i className="nc-icon nc-layout-11" /> Centro de Producción
                  </Button>
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva Orden
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              <Row className="mb-3">
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar por código, cliente o vendedor</Label>
                    <Input
                      type="search"
                      placeholder="Ej: A-187, KIOSCOS, MADELYN..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Filtrar por Tipo</Label>
                    <Input
                      type="select"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                    >
                      <option value="all">Todos los tipos</option>
                      <option value="CINCHOS">CINCHOS</option>
                      <option value="MARCAS">MARCAS</option>
                      <option value="NORMAL">NORMAL</option>
                      <option value="DISTRIBUTION">DISTRIBUCIÓN</option>
                      <option value="VENTA_EN_LINEA">VENTA EN LÍNEA</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Filtrar por Estado</Label>
                    <Input
                      type="select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all">Todos los estados</option>
                      <option value="PENDING">Pendiente</option>
                      <option value="IN_PROGRESS">En Progreso</option>
                      <option value="COMPLETED">Completada</option>
                      <option value="CANCELLED">Cancelada</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Proceso</Label>
                    <Input
                      type="select"
                      value={filterProcess}
                      onChange={(e) => setFilterProcess(e.target.value)}
                    >
                      <option value="ACTIVE">Activas del proceso</option>
                      <option value="ALL">Todas</option>
                      <option value="PRODUCTION">Producción</option>
                      <option value="BODEGA">Bodega PT</option>
                      <option value="READY">Listas despacho</option>
                      <option value="CANCELLED">Canceladas</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="12" className="d-flex justify-content-end">
                  <Button
                    color="secondary"
                    size="sm"
                    onClick={() => {
                      setFilterType("all");
                      setFilterStatus("all");
                      setFilterProcess("ACTIVE");
                      setSearchTerm("");
                    }}
                  >
                    Limpiar
                  </Button>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center"><p>Cargando órdenes de producción...</p></div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center">
                  <p>
                    {orders.length === 0
                      ? "No hay órdenes de producción registradas."
                      : "No se encontraron órdenes que coincidan con los filtros."}
                  </p>
                </div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Código</th>
                      <th>Proceso</th>
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Vendedor</th>
                      <th>Inicio</th>
                      <th>Entrega</th>
                      <th>Items</th>
                      <th>Cantidad Total</th>
                      <th>Hechos</th>
                      <th>Faltan</th>
                      <th>Avance %</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const processDates = getOrderProcessDates(order.id, order.startDate, order.deliveryDate);
                      const qtyProgress = getOrderQtyProgress(order.items);
                      const stage = getProcessStage(order);
                      const codeDate = formatDateDdMmYyGt(processDates.startValue || order.startDate || order.createdAt);
                      return (
                        <tr key={order.id}>
                          <td>
                            <Badge color="info">{order.code}{codeDate ? ` - ${codeDate}` : ""}</Badge>
                          </td>
                          <td><Badge color={stage.color}>{stage.label}</Badge></td>
                          <td>{getTypeBadge(order.orderType)}</td>
                          <td>
                            {order.orderType === "DISTRIBUTION" && order.distributionNumber
                              ? <><Badge color="warning" className="mr-1">Dist.</Badge>{order.distributionNumber}</>
                              : (order.customerName || "-")
                            }
                          </td>
                          <td>{order.orderType === "DISTRIBUTION" ? "-" : (order.sellerName || "-")}</td>
                          <td>
                            {processDates.startValue
                              ? formatDateGt(processDates.startValue)
                              : <span className="text-muted">-</span>}
                          </td>
                          <td>
                            {processDates.deliveryValue
                              ? formatDateGt(processDates.deliveryValue)
                              : "-"}
                          </td>
                          <td>
                            {order.items && order.items.length > 0 ? (
                              <span className="badge badge-secondary">
                                {order.items.length} producto(s)
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>
                            <strong>{getTotalQuantity(order.items)}</strong>
                          </td>
                          <td><strong className="text-success">{qtyProgress.produced}</strong></td>
                          <td><strong className={qtyProgress.pending > 0 ? "text-warning" : "text-success"}>{qtyProgress.pending}</strong></td>
                          <td>
                            <div style={{ minWidth: 90 }}>
                              <small className="d-block text-right">{qtyProgress.pct}%</small>
                              <div className="progress" style={{ height: 6 }}>
                                <div
                                  className={`progress-bar ${qtyProgress.pct >= 100 ? "bg-success" : qtyProgress.pct >= 50 ? "bg-info" : "bg-warning"}`}
                                  style={{ width: `${qtyProgress.pct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>{getStatusBadge(order.status)}</td>
                          <td className="text-right" style={{ minWidth: 190 }}>
                            <div className="d-flex flex-wrap justify-content-end" style={{ gap: 4 }}>
                              <Button
                                color="success"
                                outline
                                size="sm"
                                onClick={() => exportProductionOrderExcel(order)}
                                className="px-2 py-1 mb-1"
                                title="Descargar esta OP en Excel"
                              >
                                Excel
                              </Button>
                              <Button
                                color="secondary"
                                outline
                                size="sm"
                                onClick={() => exportProductionOrderPdf(order)}
                                className="px-2 py-1 mb-1"
                                title="Imprimir esta OP en PDF"
                              >
                                PDF
                              </Button>
                              <Button
                                color="secondary"
                                outline
                                size="sm"
                                onClick={() => goToProductionCenter(order.id)}
                                className="px-2 py-1 mb-1"
                                title="Ir al centro de producción con esta orden"
                              >
                                Tareas
                              </Button>
                              <Button
                                color="info"
                                outline
                                size="sm"
                                onClick={() => handleEdit(order.id)}
                                className="px-2 py-1 mb-1"
                                title="Editar orden"
                              >
                                Editar
                              </Button>
                              <Button
                                color="danger"
                                outline
                                size="sm"
                                onClick={() => handleDeleteClick(order.id)}
                                className="px-2 py-1 mb-1"
                                title="Eliminar orden"
                              >
                                Eliminar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <ProductionOrderForm
        orderId={selectedOrderId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedOrderId(null);
        }}
        onSuccess={handleFormSuccess}
      />

      <ConfirmModal
        isOpen={showDeleteModal}
        toggle={() => {
          setShowDeleteModal(false);
          setOrderToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Eliminar Orden de Producción"
        message={`¿Está seguro de eliminar la orden de producción "${orderToDelete?.code}"? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmColor="danger"
      />
    </div>
  );
}

export default ProductionOrdersList;
