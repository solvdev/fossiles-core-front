import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  ButtonGroup,
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
  UncontrolledDropdown,
  DropdownToggle,
  DropdownMenu,
  DropdownItem,
} from "reactstrap";
import {
  deleteProductionOrder,
  getProductionOrderById,
} from "services/productionOrderService";
import { getTasksByProductionOrder } from "services/taskService";
import useProductionOrdersList from "./useProductionOrdersList";
import { useAuth } from "contexts/AuthContext";
import { formatDateGt, formatDateDdMmYyGt } from "utils/dateTimeHelper";
import { exportRowsToCsv } from "utils/reportExportHelper";
import ProductionOrderForm from "./ProductionOrderForm";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";
import {
  escapeHtml,
  buildCinchoDetailTableHtml,
  buildNormalColorMatrixTableHtml,
} from "utils/productionOrderPrintHtml";
import { isManagedCinchoOrderType, isCinchoOrderType } from "utils/cinchoProductionHelper";

const OP_EXPORT_HEADERS = [
  { label: "OP", value: "opCode" },
  { label: "Tipo", value: "type" },
  { label: "Proceso", value: "process" },
  { label: "Estado", value: "status" },
  { label: "Cliente/Dist.", value: "customer" },
  { label: "Vendedor", value: "seller" },
  { label: "Marca", value: "brandName" },
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

// Familias como botones. El codigo de la orden dice OPK-18 pero el desplegable decia
// "KIOSKO": el auxiliar tenia que saberse la equivalencia de memoria.
const PROCESOS = [
  { key: "ACTIVE", label: "Activas" },
  { key: "PRODUCTION", label: "Producción" },
  { key: "BODEGA", label: "Bodega PT" },
  { key: "READY", label: "Listas despacho" },
  { key: "CANCELLED", label: "Canceladas" },
  // "Todas las etapas" y no "Todas" a secas: Familia tiene su propio botón "Todas" y dos
  // botones con la misma etiqueta en filtros contiguos no dicen cuál de los dos se pulsó.
  { key: "ALL", label: "Todas las etapas" },
];

const FAMILIES = [
  { key: "ALL", label: "Todas las familias", color: "dark" },
  { key: "OPL", label: "OPL · Venta en línea", color: "secondary" },
  { key: "OPK", label: "OPK · Kiosko", color: "success" },
  { key: "OPV", label: "OPV · Marcas", color: "info" },
  { key: "OPCK", label: "OPCK · Cliente kiosko", color: "danger" },
  { key: "OPI", label: "OPI · Interna", color: "primary" },
  { key: "OPD", label: "OPD · Distribución", color: "warning" },
  { key: "OPC", label: "OPC · Cinchos", color: "dark" },
];

function ProductionOrdersList() {
  const navigate = useNavigate();
  const {
    family, setFamily,
    status, setStatus,
    process, setProcess,
    search, setSearch,
    from, setFrom,
    to, setTo,
    page, goToPage,
    rows, totalElements, totalPages,
    loading, error,
    outsideCount, showAllProcesses,
    applyFilters,
    refresh,
  } = useProductionOrdersList();

  // Los cinco botones de cada fila se mostraban siempre, sin mirar permisos.
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("PRODUCCION.ORDENES_PRODUCCION.CREAR");
  const canEdit = hasPermission("PRODUCCION.ORDENES_PRODUCCION.EDITAR");
  const canDelete = hasPermission("PRODUCCION.ORDENES_PRODUCCION.ELIMINAR");

  const [showForm, setShowForm] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [exporting, setExporting] = useState(null);

  const handleNew = () => {
    setSelectedOrderId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedOrderId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    refresh();
    setShowForm(false);
    setSelectedOrderId(null);
  };

  const handleDeleteClick = (id) => {
    const order = rows.find((o) => o.id === id);
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
      refresh();
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

  const goToTasksOrCinchosView = (order) => {
    if (order && isManagedCinchoOrderType(order.orderType)) {
      navigate("/admin/cinchos-production");
      return;
    }
    goToProductionCenter(order?.id);
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      DRAFT: { color: "secondary", text: "Borrador" },
      PENDING: { color: "warning", text: "Pendiente" },
      IN_PROGRESS: { color: "info", text: "En Progreso" },
      IN_QA: { color: "info", text: "En Control de Calidad" },
      COMPLETED: { color: "success", text: "Completada" },
      CANCELLED: { color: "danger", text: "Cancelada" },
    };
    const statusInfo = statusMap[status] || { color: "secondary", text: status };
    return <Badge color={statusInfo.color}>{statusInfo.text}</Badge>;
  };

  const getStatusLabel = (status) => {
    const statusMap = {
      DRAFT: "Borrador",
      PENDING: "Pendiente",
      IN_PROGRESS: "En Progreso",
      IN_QA: "En Control de Calidad",
      COMPLETED: "Completada",
      CANCELLED: "Cancelada",
    };
    return statusMap[status] || status || "-";
  };

  const getTypeBadge = (type) => {
    const typeMap = {
      CINCHOS: { color: "primary", text: "CINCHOS" },
      CINCHOS_FOSSILES: { color: "primary", text: "CINCHOS FOSSILES" },
      CINCHOS_MARCAS: { color: "dark", text: "CINCHOS MARCAS" },
      MARCAS: { color: "info", text: "MARCAS" },
      NORMAL: { color: "success", text: "KIOSKO" },
      DISTRIBUTION: { color: "warning", text: "DISTRIBUCIÓN" },
      VENTA_EN_LINEA: { color: "secondary", text: "VENTA EN LÍNEA" },
      CLIENTE_KIOSKO: { color: "danger", text: "CLIENTE KIOSKO" },
    };
    const typeInfo = typeMap[type] || { color: "secondary", text: type };
    return <Badge color={typeInfo.color}>{typeInfo.text}</Badge>;
  };

  const getTypeLabel = (type) => {
    const typeMap = {
      CINCHOS: "CINCHOS",
      CINCHOS_FOSSILES: "CINCHOS FOSSILES",
      CINCHOS_MARCAS: "CINCHOS MARCAS",
      MARCAS: "MARCAS",
      OPV: "OPV",
      NORMAL: "KIOSKO",
      DISTRIBUTION: "DISTRIBUCIÓN",
      VENTA_EN_LINEA: "VENTA EN LÍNEA",
      CLIENTE_KIOSKO: "CLIENTE KIOSKO",
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
    if (order?.status === "DRAFT") return { key: "DRAFT", label: "Borrador (pend. autorización)", color: "secondary" };
    if (order?.status === "PENDING") return { key: "PENDING_PRODUCTION", label: "Pendiente en Producción", color: "warning" };
    if (order?.status === "IN_PROGRESS") return { key: "IN_PRODUCTION", label: "En Producción", color: "info" };
    if (order?.status === "COMPLETED" && qty.pending > 0) return { key: "IN_BODEGA", label: "Pendiente en Bodega PT", color: "primary" };
    if (order?.status === "COMPLETED" && qty.pending <= 0) return { key: "READY_DISPATCH", label: "Lista para Despacho", color: "success" };
    return { key: "OTHER", label: order?.status || "Sin estado", color: "secondary" };
  };

  // El filtrado y el recorte los hace el servidor. Filtrar aqui mientras la paginacion
  // es de servidor haria que una pagina de 30 mostrara 3 filas y el contador mintiera.

  const clearListFilters = () => {
    applyFilters({ family: "ALL", status: "ALL", process: "ACTIVE", search: "", from: "", to: "" });
  };

  // Recibe las tareas ya filtradas: el listado dejo de traerse TODAS las del sistema
  // para pintar dos columnas. Solo la exportacion y el PDF de una fila las piden, y
  // piden unicamente las de esa orden.
  const getOrderProcessDates = (orderTasks, fallbackStart, fallbackDelivery) => {

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

  const getOrderBrandDisplay = (order) => {
    if (order?.orderType !== "MARCAS") return "-";
    const brands = Array.from(new Set(
      (order.items || [])
        .map((item) => item.brandName)
        .filter(Boolean)
    ));
    return brands.length > 0 ? brands.join(", ") : "-";
  };

  const buildExportRows = (sourceOrders, orderTasks = []) => {
    const rows = [];

    sourceOrders.forEach((order) => {
      const processDates = getOrderProcessDates(orderTasks, order.startDate, order.deliveryDate);
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
        brandName: "-",
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
          brandName: "-",
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
            brandName: order.orderType === "MARCAS" ? item.brandName || "-" : "-",
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

  // El listado ya no trae los items de cada orden, asi que Excel y PDF piden la orden
  // completa y sus tareas al pulsarlos. Es una peticion por clic, en vez de traerlo
  // todo en cada carga de pantalla para algo que casi nunca se usa.
  const loadOrderForExport = async (orderId) => {
    const [full, orderTasks] = await Promise.all([
      getProductionOrderById(orderId),
      getTasksByProductionOrder(orderId).catch(() => []),
    ]);
    return { full, orderTasks: Array.isArray(orderTasks) ? orderTasks : [] };
  };

  const exportProductionOrderExcel = async (order) => {
    try {
      setExporting(`excel-${order.id}`);
      const { full, orderTasks } = await loadOrderForExport(order.id);
      const exportRows = buildExportRows([full], orderTasks);
      if (exportRows.length === 0) {
        showError("No hay órdenes para exportar");
        return;
      }
      exportRowsToCsv(`orden_produccion_${full.code || full.id}`, OP_EXPORT_HEADERS, exportRows);
    } catch (err) {
      showError(err.message || "No se pudo preparar la exportación");
    } finally {
      setExporting(null);
    }
  };

  const exportProductionOrderPdf = async (listRow) => {
    if (!listRow) {
      showError("No hay órdenes para exportar");
      return;
    }

    let order;
    let orderTasks;
    try {
      setExporting(`pdf-${listRow.id}`);
      const loaded = await loadOrderForExport(listRow.id);
      order = loaded.full;
      orderTasks = loaded.orderTasks;
    } catch (err) {
      showError(err.message || "No se pudo preparar el PDF");
      return;
    } finally {
      setExporting(null);
    }

    const generatedAt = new Date().toLocaleString("es-GT");
    const processDates = getOrderProcessDates(orderTasks, order.startDate, order.deliveryDate);
    const qtyProgress = getOrderQtyProgress(order.items);
    const stage = getProcessStage(order);
    const customer =
      order.orderType === "DISTRIBUTION" && order.distributionNumber
        ? order.distributionNumber
        : order.customerName || "-";
    const brands = order.orderType === "MARCAS" ? getOrderBrandDisplay(order) : null;
    const detailTableHtml = isCinchoOrderType(order.orderType)
      ? buildCinchoDetailTableHtml(order)
      : buildNormalColorMatrixTableHtml(order);
    const orderObservation = String(order.observations || "").trim();

    // Solo se pintan los campos que tienen valor. El diseno anterior rellenaba los huecos
    // con <th></th><td></td>, que salian como celdas vacias en la hoja impresa.
    const campos = [
      ["Tipo", getTypeLabel(order.orderType)],
      ["Estado", getStatusLabel(order.status)],
      ["Proceso", stage.label],
      [order.orderType === "DISTRIBUTION" ? "Distribución" : "Cliente", customer],
      ["Vendedor", order.orderType === "DISTRIBUTION" ? null : order.sellerName],
      ["Marcas", brands && brands !== "-" ? brands : null],
      ["Creada", order.createdAt ? formatDateGt(order.createdAt) : null],
      ["Inicio", processDates.startValue ? formatDateGt(processDates.startValue) : null],
      ["Entrega", processDates.deliveryValue ? formatDateGt(processDates.deliveryValue) : null],
    ].filter(([, valor]) => valor !== null && valor !== undefined && String(valor).trim() !== "");

    const camposHtml = campos
      .map(
        ([etiqueta, valor]) => `
            <div class="campo">
              <span class="campo-et">${escapeHtml(etiqueta)}</span>
              <span class="campo-val">${escapeHtml(valor)}</span>
            </div>`
      )
      .join("");

    // El avance no estaba en la hoja impresa aunque si en el listado y en el CSV: quien
    // imprimia la orden perdia cuanto se habia recibido y cuanto faltaba.
    const resumenHtml = `
          <div class="resumen">
            <div class="cifra">
              <span class="n">${escapeHtml(qtyProgress.total)}</span>
              <span class="l">Planificado</span>
            </div>
            <div class="cifra">
              <span class="n ok">${escapeHtml(qtyProgress.produced)}</span>
              <span class="l">Recibido en bodega</span>
            </div>
            <div class="cifra">
              <span class="n ${qtyProgress.pending > 0 ? "pend" : "ok"}">${escapeHtml(qtyProgress.pending)}</span>
              <span class="l">Pendiente</span>
            </div>
            <div class="cifra avance">
              <span class="n">${escapeHtml(qtyProgress.pct)}%</span>
              <span class="l">Avance</span>
              <span class="barra"><span class="relleno" style="width:${Math.max(0, Math.min(100, qtyProgress.pct))}%"></span></span>
            </div>
          </div>`;

    const observacionHtml = orderObservation
      ? `
          <section class="observacion">
            <span class="obs-et">Observación</span>
            <p>${escapeHtml(orderObservation)}</p>
          </section>`
      : "";

    const win = window.open("", "_blank");
    if (!win) {
      // Antes era un return en silencio: se pulsaba PDF y no pasaba nada.
      showError("El navegador bloqueó la ventana del PDF. Permite las ventanas emergentes para este sitio.");
      return;
    }

    win.document.write(`
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="utf-8" />
          <title>Orden de Producción ${escapeHtml(order.code || "")}</title>
          <style id="print-page-size"></style>
          <style>
            :root {
              --tinta: #14181f;
              --suave: #5b6675;
              --linea: #d9dee6;
              --fondo: #f1f3f7;
              --acento: #1f5fbf;
              --ok: #1a7f52;
              --pend: #b06a00;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              background: var(--fondo);
              color: var(--tinta);
              font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 12px;
              line-height: 1.45;
            }

            /* ----- barra de herramientas (no se imprime) ----- */
            .barra-sup {
              position: sticky; top: 0; z-index: 10;
              display: flex; align-items: center; justify-content: space-between;
              gap: 16px; flex-wrap: wrap;
              padding: 10px 16px;
              background: #fff;
              border-bottom: 1px solid var(--linea);
            }
            .grupo { display: flex; align-items: center; gap: 10px; }
            .grupo-et { font-size: 11px; color: var(--suave); text-transform: uppercase; letter-spacing: .06em; }
            .formato { font-size: 11px; color: var(--suave); }
            .segmentado { display: inline-flex; border: 1px solid var(--linea); border-radius: 8px; overflow: hidden; }
            .seg {
              appearance: none; border: 0; background: #fff; color: var(--tinta);
              padding: 7px 16px; font: inherit; cursor: pointer;
            }
            .seg + .seg { border-left: 1px solid var(--linea); }
            .seg:hover { background: #eef2f8; }
            .seg[aria-pressed="true"] { background: var(--acento); color: #fff; }
            .btn-imprimir {
              appearance: none; border: 0; border-radius: 8px; cursor: pointer;
              background: var(--acento); color: #fff; font: inherit; font-weight: 600;
              padding: 8px 20px;
            }
            .btn-imprimir:hover { filter: brightness(1.08); }

            /* ----- la hoja ----- */
            /* La vista previa respeta la proporcion de la hoja real: carta vertical es
               mas estrecha y alta, horizontal mas ancha. Antes las dos se veian iguales
               porque el ancho era fijo, y el boton parecia no hacer nada. */
            .hoja {
              width: 100%; max-width: 780px; min-height: 1010px;
              margin: 20px auto 40px; padding: 30px 32px;
              background: #fff; border: 1px solid var(--linea); border-radius: 10px;
              transition: max-width .18s ease;
            }
            body.horizontal .hoja { max-width: 1120px; min-height: 780px; padding: 26px 30px; }
            .cabecera {
              display: flex; align-items: flex-start; justify-content: space-between;
              gap: 20px; padding-bottom: 14px; margin-bottom: 16px;
              border-bottom: 2px solid var(--tinta);
            }
            .marca { font-size: 11px; letter-spacing: .28em; color: var(--suave); font-weight: 700; }
            .cabecera h1 { margin: 2px 0 0; font-size: 20px; letter-spacing: -.01em; }
            .generado { margin-top: 4px; font-size: 10.5px; color: var(--suave); }
            .codigo {
              font-size: 22px; font-weight: 700; letter-spacing: -.01em;
              padding: 6px 14px; border: 2px solid var(--tinta); border-radius: 8px;
              white-space: nowrap;
            }

            .campos {
              display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
              gap: 10px 18px; margin-bottom: 16px;
            }
            .campo { display: flex; flex-direction: column; min-width: 0; }
            .campo-et {
              font-size: 9.5px; text-transform: uppercase; letter-spacing: .07em;
              color: var(--suave); font-weight: 600;
            }
            .campo-val { font-size: 12.5px; word-break: break-word; }

            .resumen {
              display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
              gap: 12px; padding: 12px 14px; margin-bottom: 16px;
              background: #f7f9fc; border: 1px solid var(--linea); border-radius: 8px;
            }
            .cifra { display: flex; flex-direction: column; }
            .cifra .n { font-size: 19px; font-weight: 700; line-height: 1.1; }
            .cifra .n.ok { color: var(--ok); }
            .cifra .n.pend { color: var(--pend); }
            .cifra .l {
              font-size: 9.5px; text-transform: uppercase; letter-spacing: .06em;
              color: var(--suave); font-weight: 600; margin-top: 2px;
            }
            .barra {
              display: block; height: 5px; margin-top: 6px; border-radius: 3px;
              background: #dde3ec; overflow: hidden;
            }
            .relleno { display: block; height: 100%; background: var(--acento); }

            .observacion {
              padding: 10px 12px; margin-bottom: 16px;
              background: #fffbf0; border: 1px solid #f0e0b8; border-left: 3px solid #d9a521;
              border-radius: 6px;
            }
            .obs-et {
              display: block; font-size: 9.5px; text-transform: uppercase;
              letter-spacing: .07em; color: #8a6a12; font-weight: 700;
            }
            .observacion p { margin: 3px 0 0; }

            /* ----- tabla de detalle ----- */
            table { width: 100%; border-collapse: collapse; }
            .lines-cincho, .lines-color-matrix { table-layout: auto; font-size: 10.5px; }
            .lines-cincho thead { display: table-header-group; }
            .lines-color-matrix thead { display: table-header-group; }
            .lines-cincho th, .lines-cincho td,
            .lines-color-matrix th, .lines-color-matrix td {
              padding: 6px 8px; text-align: center; border: 1px solid var(--linea);
            }
            .lines-cincho thead th, .lines-color-matrix thead th {
              background: #eef2f8; font-size: 9.5px; text-transform: uppercase;
              letter-spacing: .05em; color: var(--suave);
            }
            .lines-cincho .col-code, .lines-cincho .col-comments,
            .lines-cincho .col-comments-h, .lines-color-matrix .col-comments { text-align: left; }
            .lines-color-matrix td:nth-child(1), .lines-color-matrix td:nth-child(2) { text-align: left; }
            tbody tr:nth-child(even) td { background: #fafbfd; }
            .total-row td, .total-row th { background: #eef2f8 !important; font-weight: 700; }
            .numeric { text-align: right; white-space: nowrap; }

            /* ----- impresion ----- */
            @media print {
              html, body { height: auto; background: #fff; }
              body { font-size: 10px; }
              .no-print { display: none !important; }
              /* El min-height de .hoja existe solo para que la VISTA PREVIA tenga la
                 proporcion de la pagina. Al imprimir hay que anularlo o sobra papel: en
                 horizontal, 780px superan el alto util de una carta apaisada y empujaban
                 una segunda hoja en blanco. Se repite el selector 'body.horizontal .hoja'
                 porque pesa mas que '.hoja' y si no, no se deja anular. */
              .hoja,
              body.horizontal .hoja {
                max-width: none; min-height: 0; height: auto;
                margin: 0; padding: 0; border: 0; border-radius: 0;
              }
              .resumen, .observacion { break-inside: avoid; }
              thead { display: table-header-group; }
              tr { break-inside: avoid; }
            }
            /* En horizontal sobra ancho: mas columnas de campos y tipografia algo mayor
               en la tabla, que es donde se agradece. En vertical prima el alto. */
            body.horizontal .campos { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            body.horizontal .lines-cincho,
            body.horizontal .lines-color-matrix { font-size: 11.5px; }
            body.horizontal .cabecera { padding-bottom: 12px; margin-bottom: 14px; }
            body.horizontal .resumen { padding: 10px 16px; }
          </style>
        </head>
        <body>
          <div class="barra-sup no-print">
            <div class="grupo">
              <span class="grupo-et">Orientación</span>
              <div class="segmentado" role="group">
                <button type="button" class="seg" id="op-vertical" aria-pressed="true">Vertical</button>
                <button type="button" class="seg" id="op-horizontal" aria-pressed="false">Horizontal</button>
              </div>
              <span class="formato" id="op-formato">Carta vertical · 21.6 × 27.9 cm</span>
            </div>
            <button type="button" class="btn-imprimir" id="op-imprimir">Imprimir</button>
          </div>

          <main class="hoja">
            <header class="cabecera">
              <div>
                <div class="marca">FOSSILES</div>
                <h1>Orden de Producción</h1>
                <div class="generado">Generado ${escapeHtml(generatedAt)}</div>
              </div>
              <div class="codigo">${escapeHtml(order.code || "-")}</div>
            </header>

            <section class="campos">${camposHtml}</section>

            ${resumenHtml}
            ${observacionHtml}

            <section class="detalle">${detailTableHtml}</section>
          </main>
        </body>
      </html>
    `);
    win.document.close();

    // Los botones se enganchan DESDE AQUI, no con un <script> dentro del documento escrito.
    // El anterior iba inyectado por document.write y no llegaba a ejecutarse: por eso
    // Vertical y Horizontal no hacian nada y ninguno aparecia marcado como activo.
    const doc = win.document;
    const estilo = doc.getElementById("print-page-size");
    const bVertical = doc.getElementById("op-vertical");
    const bHorizontal = doc.getElementById("op-horizontal");
    const bImprimir = doc.getElementById("op-imprimir");

    const aplicarOrientacion = (horizontal) => {
      if (estilo) {
        estilo.textContent = horizontal
          ? "@page { size: letter landscape; margin: 9mm; }"
          : "@page { size: letter portrait; margin: 9mm; }";
      }
      doc.body.classList.toggle("horizontal", !!horizontal);
      if (bVertical) bVertical.setAttribute("aria-pressed", String(!horizontal));
      if (bHorizontal) bHorizontal.setAttribute("aria-pressed", String(!!horizontal));
      const etiqueta = doc.getElementById("op-formato");
      if (etiqueta) {
        etiqueta.textContent = horizontal
          ? "Carta horizontal · 27.9 × 21.6 cm"
          : "Carta vertical · 21.6 × 27.9 cm";
      }
    };

    if (bVertical) bVertical.addEventListener("click", () => aplicarOrientacion(false));
    if (bHorizontal) bHorizontal.addEventListener("click", () => aplicarOrientacion(true));
    if (bImprimir) bImprimir.addEventListener("click", () => win.print());
    aplicarOrientacion(false);
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
                  {/* El contador estaba debajo de los cinco filtros, en letra pequena, y
                      su total era el ya filtrado por proceso: nunca se veia cuantas
                      ordenes habia de verdad. Ahora viene del servidor. */}
                  <small className="text-muted">
                    {loading
                      ? "Cargando…"
                      : totalElements === 0
                        ? "Sin órdenes con estos filtros"
                        : `${totalElements} ${totalElements === 1 ? "orden" : "órdenes"} · página ${page + 1} de ${Math.max(totalPages, 1)}`}
                  </small>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="secondary" onClick={() => goToProductionCenter()} className="btn-round mr-2">
                    <i className="nc-icon nc-layout-11" /> Centro de Producción
                  </Button>
                  {canCreate && (
                    <Button color="primary" onClick={handleNew} className="btn-round">
                      <i className="nc-icon nc-simple-add" /> Nueva Orden
                    </Button>
                  )}
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              {/* Antes habia dos filas de botones oscuros casi identicas, "Atajos" y
                  "Familia", mas un desplegable "Proceso". Los atajos y ese desplegable
                  hacian lo MISMO (ambos movian el filtro de proceso), y OPL y Cinchos
                  salian dos veces: como atajo y como familia. Queda un control por eje:
                  Proceso (en que punto del flujo esta) y Familia (que tipo de orden es). */}
              <div className="p-3 mb-3" style={{ background: "#f7f8fa", borderRadius: 8 }}>
                <Row className="mb-2">
                  <Col md="12">
                    <Label className="d-block mb-1">
                      <small className="text-muted font-weight-bold">PROCESO</small>
                    </Label>
                    {/* Sueltos y no en ButtonGroup: al envolverse, el grupo estiraba los
                        botones de la segunda linea a todo el ancho. Rectos, frente a las
                        pildoras redondeadas de Familia, para que se lean como dos ejes. */}
                    <div className="d-flex flex-wrap" style={{ gap: 6 }}>
                      {PROCESOS.map((p) => (
                        <Button
                          key={p.key}
                          size="sm"
                          color={process === p.key ? "primary" : "secondary"}
                          outline={process !== p.key}
                          className="px-3"
                          onClick={() => setProcess(p.key)}
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </Col>
                </Row>

                <Row>
                  <Col md="12">
                    <Label className="d-block mb-1">
                      <small className="text-muted font-weight-bold">FAMILIA</small>
                    </Label>
                    {/* Sueltos y no en ButtonGroup: pegados formaban un bloque solido
                        indistinguible de la fila de arriba. */}
                    <div className="d-flex flex-wrap" style={{ gap: 6 }}>
                      {FAMILIES.map((f) => (
                        <Button
                          key={f.key}
                          size="sm"
                          color={family === f.key ? f.color : "secondary"}
                          outline={family !== f.key}
                          className="px-3"
                          style={{ borderRadius: 999 }}
                          onClick={() => setFamily(f.key)}
                        >
                          {f.label}
                        </Button>
                      ))}
                    </div>
                  </Col>
                </Row>
              </div>

              <Row className="mb-2">
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar por código, cliente, vendedor, envío o distribución</Label>
                    <Input
                      type="search"
                      placeholder="Ej: A-187, KIOSCOS, MADELYN…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Estado</Label>
                    <Input
                      type="select"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="ALL">Todos los estados</option>
                      <option value="DRAFT">Borrador</option>
                      <option value="PENDING">Pendiente</option>
                      <option value="IN_PROGRESS">En Progreso</option>
                      <option value="IN_QA">En Control de Calidad</option>
                      <option value="COMPLETED">Completada</option>
                      <option value="CANCELLED">Cancelada</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Creadas desde</Label>
                    <Input
                      type="date"
                      value={from}
                      max={to || undefined}
                      onChange={(e) => setFrom(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Hasta</Label>
                    <Input
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(e) => setTo(e.target.value)}
                    />
                  </FormGroup>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="12" className="d-flex justify-content-between align-items-center flex-wrap">
                  {/* El filtro de proceso arranca en "Activas", que esconde lo despachado
                      y lo cancelado: buscar una orden ya despachada devolvia "no se
                      encontraron ordenes" sin explicar por que. Se avisa en vez de
                      cambiar el arranque, porque "Activas" es la lista del dia. */}
                  {outsideCount > 0 ? (
                    <small className="text-muted mr-2">
                      Hay <strong>{outsideCount}</strong>{" "}
                      {outsideCount === 1 ? "orden que coincide" : "órdenes que coinciden"}{" "}
                      fuera del filtro de proceso.{" "}
                      <Button color="link" size="sm" className="p-0 align-baseline" onClick={showAllProcesses}>
                        Verlas todas
                      </Button>
                    </small>
                  ) : (
                    <span />
                  )}
                  <Button color="secondary" size="sm" onClick={clearListFilters}>
                    Limpiar
                  </Button>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center"><p>Cargando órdenes de producción…</p></div>
              ) : rows.length === 0 ? (
                <div className="text-center">
                  <p>No se encontraron órdenes que coincidan con los filtros.</p>
                </div>
              ) : (
                <>
                {/* El contenedor de scroll se monta a mano en vez de usar <Table responsive>
                    porque el tema pisa la regla de Bootstrap con '.table-responsive { overflow:
                    scroll }', que fuerza las DOS barras siempre visibles. Eso le daba scroll
                    vertical propio a la tabla y la rueda del raton se quedaba atrapada ahi en vez
                    de mover la pagina. El sobrante vertical no era contenido: eran los menus
                    desplegables cerrados, que este tema deja en el layout (los oculta con
                    visibility, no con display) y al ser absolutos inflaban el alto de scroll.
                    Horizontal en auto -la tabla es ancha y lo necesita-, vertical en hidden: la
                    ultima fila entra entera, y popper voltea hacia arriba los menus de abajo. */}
                <div className="table-responsive" style={{ overflowX: "auto", overflowY: "hidden" }}>
                <Table>
                  <thead className="text-primary">
                    <tr>
                      <th className="text-left">Acciones</th>
                      <th>Código</th>
                      {/* La columna que manda el orden, visible y etiquetada: sin ella
                          el orden de las filas parece aleatorio. */}
                      <th>Creada</th>
                      <th>Proceso</th>
                      <th>Tipo</th>
                      <th>Cliente</th>
                      <th>Vendedor</th>
                      <th title="Fecha de inicio de la propia orden, no de sus tareas">Inicio</th>
                      <th title="Fecha de entrega de la propia orden, no de sus tareas">Entrega</th>
                      <th>Items</th>
                      <th title="Suma planificada; en cinchos sale de las tallas">Cantidad Total</th>
                      <th title="Recibido en Bodega PT, no producido en el taller">Hechos</th>
                      <th title="Lo que falta por recibir en Bodega PT">Faltan</th>
                      <th>Avance %</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((order) => {
                      const stage = order.processStage || {};
                      const codeDate = formatDateDdMmYyGt(order.createdAt);
                      const busy = exporting === `excel-${order.id}` || exporting === `pdf-${order.id}`;
                      return (
                        <tr key={order.id}>
                          {/* Eran cinco botones sueltos con ancho minimo 190 al final de
                              quince columnas: en un portatil hay scroll horizontal y
                              "Tareas" y "Editar" quedaban fuera de vista. */}
                          <td className="text-left">
                            <UncontrolledDropdown>
                              <DropdownToggle caret color="secondary" outline size="sm" disabled={busy}>
                                {busy ? "Preparando…" : "Acciones"}
                              </DropdownToggle>
                              {/* El menu se renderiza en <body>, fuera de la tabla. Dos motivos:
                                  1) .table-responsive recorta, y con pocas filas el contenedor
                                     es corto: el menu no cabia debajo, popper lo volteaba hacia
                                     arriba y quedaba sobre la cabecera con casi todas sus
                                     opciones cortadas.
                                  2) El tema fuerza la posicion de los desplegables con
                                     '.dropdown.show .dropdown-menu[x-placement=...] { transform:
                                     translate3d(-20px,...) !important; top:auto; bottom:0 }',
                                     que ningun estilo inline puede vencer. Al sacarlo de
                                     .dropdown.show ese selector deja de aplicar y popper vuelve
                                     a mandar. */}
                              <DropdownMenu
                                container="body"
                                modifiers={{
                                  preventOverflow: { boundariesElement: "viewport" },
                                  flip: { boundariesElement: "viewport" },
                                }}
                              >
                                <DropdownItem onClick={() => exportProductionOrderExcel(order)}>
                                  Excel
                                </DropdownItem>
                                <DropdownItem onClick={() => exportProductionOrderPdf(order)}>
                                  PDF
                                </DropdownItem>
                                <DropdownItem onClick={() => goToTasksOrCinchosView(order)}>
                                  <span title={isManagedCinchoOrderType(order.orderType)
                                    ? "Ir a vista de cinchos en producción"
                                    : "Ir al centro de producción con esta orden"}>
                                    Tareas
                                  </span>
                                </DropdownItem>
                                {canEdit && (
                                  <DropdownItem onClick={() => handleEdit(order.id)}>Editar</DropdownItem>
                                )}
                                {canDelete && <DropdownItem divider />}
                                {canDelete && (
                                  <DropdownItem className="text-danger" onClick={() => handleDeleteClick(order.id)}>
                                    Eliminar
                                  </DropdownItem>
                                )}
                              </DropdownMenu>
                            </UncontrolledDropdown>
                          </td>
                          <td>
                            <Badge color="info">{order.code}{codeDate ? ` - ${codeDate}` : ""}</Badge>
                          </td>
                          <td>{order.createdAt ? formatDateGt(order.createdAt) : "-"}</td>
                          <td><Badge color={stage.color || "secondary"}>{stage.label || "-"}</Badge></td>
                          <td>{getTypeBadge(order.orderType)}</td>
                          <td>
                            {order.orderType === "DISTRIBUTION" && order.distributionNumber
                              ? <><Badge color="warning" className="mr-1">Dist.</Badge>{order.distributionNumber}</>
                              : (order.customerName || "-")
                            }
                          </td>
                          <td>{order.orderType === "DISTRIBUTION" ? "-" : (order.sellerName || "-")}</td>
                          <td title="Fecha de inicio de la orden, no de sus tareas">
                            {order.startDate ? formatDateGt(order.startDate) : <span className="text-muted">-</span>}
                          </td>
                          <td title="Fecha de entrega de la orden, no de sus tareas">
                            {order.deliveryDate ? formatDateGt(order.deliveryDate) : "-"}
                          </td>
                          <td>
                            {order.itemCount > 0
                              ? <span className="badge badge-secondary">{order.itemCount} producto(s)</span>
                              : "-"}
                          </td>
                          <td><strong>{order.totalQty}</strong></td>
                          <td title="Recibido en Bodega PT, no producido">
                            <strong className="text-success">{order.receivedQty}</strong>
                          </td>
                          <td title="Lo que falta por recibir en Bodega PT">
                            <strong className={order.pendingQty > 0 ? "text-warning" : "text-success"}>{order.pendingQty}</strong>
                          </td>
                          <td>
                            <div style={{ minWidth: 90 }}>
                              <small className="d-block text-right">{order.progressPct}%</small>
                              <div className="progress" style={{ height: 6 }}>
                                <div
                                  className={`progress-bar ${order.progressPct >= 100 ? "bg-success" : order.progressPct >= 50 ? "bg-info" : "bg-warning"}`}
                                  style={{ width: `${order.progressPct}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td>{getStatusBadge(order.status)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
                </div>
                {/* "Cargar mas" solo crecia: para volver atras habia que tocar un filtro
                    y que se reseteara. Para recorrer historico es el peor patron. */}
                {totalPages > 1 && (
                  <div className="d-flex justify-content-between align-items-center mt-3">
                    <Button
                      color="secondary"
                      outline
                      size="sm"
                      disabled={page <= 0}
                      onClick={() => goToPage(page - 1)}
                    >
                      ← Anterior
                    </Button>
                    <small className="text-muted">
                      Página {page + 1} de {totalPages} · {totalElements} órdenes
                    </small>
                    <Button
                      color="secondary"
                      outline
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => goToPage(page + 1)}
                    >
                      Siguiente →
                    </Button>
                  </div>
                )}
                </>
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
