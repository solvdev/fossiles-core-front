import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Badge,
  Button, Input, Collapse, Spinner, Alert, Progress, Modal, ModalHeader,
  ModalBody, ModalFooter, FormGroup, Label
} from "reactstrap";
import {
  getWarehouseView,
  dispatchCustomerShipment,
  receiveWarehouseProducts,
} from "../../services/productionOrderService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";

const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En Progreso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const STATUS_STYLES = {
  PENDING: { backgroundColor: "#ffc107", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  IN_PROGRESS: { backgroundColor: "#17a2b8", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  COMPLETED: { backgroundColor: "#28a745", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  CANCELLED: { backgroundColor: "#dc3545", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
};

const DEFAULT_BADGE_STYLE = { backgroundColor: "#6c757d", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 };

const SALE_STATUS_STYLES = {
  PENDIENTE: { backgroundColor: "#ffc107", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  EN_PRODUCCION: { backgroundColor: "#17a2b8", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  PRODUCIDO: { backgroundColor: "#007bff", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  ENVIADO: { backgroundColor: "#28a745", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  ENTREGADO: { backgroundColor: "#343a40", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  CANCELADO: { backgroundColor: "#dc3545", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  DEVOLUCION: { backgroundColor: "#dc3545", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  ANULADA: { backgroundColor: "#6c757d", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
};

const DISPATCH_TYPE_LABELS = {
  KIOSK_DISTRIBUTION: "Distribución a Kioscos",
  CUSTOMER_SHIPMENTS: "Envíos a Clientes",
  DIRECT: "Producción Directa",
};

const DISPATCH_TYPE_STYLES = {
  KIOSK_DISTRIBUTION: { backgroundColor: "#28a745", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  CUSTOMER_SHIPMENTS: { backgroundColor: "#17a2b8", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  DIRECT: { backgroundColor: "#e9ecef", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
};

const REJECTION_REASON_OPTIONS = [
  "Costura defectuosa",
  "Color incorrecto",
  "Acabado defectuoso",
  "Medida incorrecta",
];

const WarehouseView = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [orderTypeFilter, setOrderTypeFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedOrders, setExpandedOrders] = useState({});
  const [dispatchModal, setDispatchModal] = useState({ open: false, poId: null, sale: null });
  const [dispatchData, setDispatchData] = useState({ guideNumber: "", shippingCarrier: "" });
  const [dispatching, setDispatching] = useState(false);
  const [itemStatusFilter, setItemStatusFilter] = useState("ALL");
  const [receiptDraftByOrder, setReceiptDraftByOrder] = useState({});
  const [expandedOrderIds, setExpandedOrderIds] = useState({});
  const [expandedItemIds, setExpandedItemIds] = useState({});
  const [receiptModal, setReceiptModal] = useState({ open: false, order: null });
  const [receiptRows, setReceiptRows] = useState([]);
  const [receiving, setReceiving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getWarehouseView(statusFilter || undefined);
      setOrders(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleOrder = (orderId) => {
    setExpandedOrders((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
  };

  const openDispatchModal = (poId, sale) => {
    setDispatchData({
      guideNumber: sale.guideNumber || "",
      shippingCarrier: sale.shippingCarrier || "",
    });
    setDispatchModal({ open: true, poId, sale });
  };

  const handleDispatch = async () => {
    setDispatching(true);
    try {
      await dispatchCustomerShipment(
        dispatchModal.poId,
        dispatchModal.sale.onlineSaleId,
        dispatchData
      );
      setDispatchModal({ open: false, poId: null, sale: null });
      fetchData();
    } catch (err) {
      showError(err.message || "Error al despachar envío");
    } finally {
      setDispatching(false);
    }
  };

  const getProgressPercent = (order) => {
    if (!order.totalTasks || order.totalTasks === 0) return 0;
    return Math.round((order.completedTasks / order.totalTasks) * 100);
  };

  const getPendingReceiptQty = (order) => {
    return (order.items || []).reduce((sum, item) => {
      const planned = Number(item.quantity || 0);
      const received = Number(item.warehouseReceivedQty || 0);
      return sum + Math.max(planned - received, 0);
    }, 0);
  };

  const getOrderQtyProgress = (order) => {
    const total = Number(order?.totalQuantity || 0);
    const produced = (order?.items || []).reduce((sum, item) => {
      const planned = Number(item?.quantity || 0);
      const received = Number(item?.warehouseReceivedQty || 0);
      return sum + Math.min(Math.max(received, 0), Math.max(planned, 0));
    }, 0);
    const pending = Math.max(total - produced, 0);
    const pct = total > 0 ? Math.round((produced / total) * 100) : 0;
    return { total, produced, pending, pct };
  };

  const initializeOrderDraft = useCallback((order) => {
    const rows = (order.items || []).map((item) => {
      const planned = Number(item.quantity || 0);
      const received = Number(item.warehouseReceivedQty || 0);
      const pending = Math.max(planned - received, 0);
      return {
        productionOrderItemId: item.id,
        productCode: item.productCode,
        productName: item.productName,
        colorName: item.colorName,
        plannedQty: planned,
        receivedQty: received,
        pendingQty: pending,
        approvedQty: pending,
        rejectedQty: 0,
        rejectionReason: "",
      };
    }).filter((r) => r.pendingQty > 0);
    return rows;
  }, []);

  const ensureOrderDraft = useCallback((order) => {
    const key = String(order.productionOrderId);
    setReceiptDraftByOrder((prev) => {
      if (prev[key]) return prev;
      return { ...prev, [key]: initializeOrderDraft(order) };
    });
  }, [initializeOrderDraft]);

  const updateDraftRow = useCallback((orderId, rowIdx, updater) => {
    const key = String(orderId);
    setReceiptDraftByOrder((prev) => {
      const rows = prev[key] || [];
      const nextRows = rows.map((row, idx) => (idx === rowIdx ? updater(row) : row));
      return { ...prev, [key]: nextRows };
    });
  }, []);

  const setDraftQuantities = useCallback((orderId, rowIdx, approvedQty, rejectedQty) => {
    updateDraftRow(orderId, rowIdx, (row) => {
      const approved = Math.max(0, Math.min(Number(approvedQty || 0), row.pendingQty));
      const rejected = Math.max(0, Math.min(Number(rejectedQty || 0), row.pendingQty));
      const total = approved + rejected;
      if (total === row.pendingQty) {
        return {
          ...row,
          approvedQty: approved,
          rejectedQty: rejected,
          rejectionReason: rejected === 0 ? "" : row.rejectionReason,
        };
      }
      const normalizedApproved = Math.max(0, Math.min(approved, row.pendingQty));
      const normalizedRejected = Math.max(0, row.pendingQty - normalizedApproved);
      return {
        ...row,
        approvedQty: normalizedApproved,
        rejectedQty: normalizedRejected,
        rejectionReason: normalizedRejected === 0 ? "" : row.rejectionReason,
      };
    });
  }, [updateDraftRow]);

  const applyDraftAction = useCallback((orderId, rowIdx, action) => {
    const key = String(orderId);
    const rows = receiptDraftByOrder[key] || [];
    const row = rows[rowIdx];
    if (!row) return;
    if (action === "APPROVE_ALL") return setDraftQuantities(orderId, rowIdx, row.pendingQty, 0);
    if (action === "REJECT_ALL") return setDraftQuantities(orderId, rowIdx, 0, row.pendingQty);
    if (action === "APPROVE_PLUS_ONE") {
      const nextApproved = Math.min(row.pendingQty, Number(row.approvedQty || 0) + 1);
      return setDraftQuantities(orderId, rowIdx, nextApproved, row.pendingQty - nextApproved);
    }
    if (action === "APPROVE_MINUS_ONE") {
      const nextApproved = Math.max(0, Number(row.approvedQty || 0) - 1);
      return setDraftQuantities(orderId, rowIdx, nextApproved, row.pendingQty - nextApproved);
    }
    if (action === "REJECT_PLUS_ONE") {
      const nextRejected = Math.min(row.pendingQty, Number(row.rejectedQty || 0) + 1);
      return setDraftQuantities(orderId, rowIdx, row.pendingQty - nextRejected, nextRejected);
    }
    if (action === "REJECT_MINUS_ONE") {
      const nextRejected = Math.max(0, Number(row.rejectedQty || 0) - 1);
      return setDraftQuantities(orderId, rowIdx, row.pendingQty - nextRejected, nextRejected);
    }
  }, [receiptDraftByOrder, setDraftQuantities]);

  const getOrderTypeGroup = useCallback((order) => {
    if (order?.orderType === "VENTA_EN_LINEA") return "VENTA_EN_LINEA";
    if (order?.orderType === "DISTRIBUTION") return "DISTRIBUTION";
    return "NORMAL";
  }, []);

  const filteredOrders = useMemo(() => {
    const term = String(searchTerm || "").trim().toLowerCase();
    return (orders || []).filter((order) => {
      if (orderTypeFilter !== "ALL" && getOrderTypeGroup(order) !== orderTypeFilter) {
        return false;
      }
      if (!term) return true;
      const haystack = `${order.productionOrderCode || ""} ${order.orderType || ""} ${order.distributionNumber || ""} ${order.deliveryDate || ""}`
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [orders, orderTypeFilter, searchTerm, getOrderTypeGroup]);

  const totals = useMemo(() => ({
    all: orders.length,
    normal: orders.filter((o) => getOrderTypeGroup(o) === "NORMAL").length,
    online: orders.filter((o) => getOrderTypeGroup(o) === "VENTA_EN_LINEA").length,
    distribution: orders.filter((o) => getOrderTypeGroup(o) === "DISTRIBUTION").length,
    pendingReceipt: filteredOrders.filter((o) => getPendingReceiptQty(o) > 0).length,
  }), [orders, filteredOrders, getOrderTypeGroup]);

  const receiptOrders = useMemo(
    () => filteredOrders.filter((o) => getPendingReceiptQty(o) > 0),
    [filteredOrders]
  );

  const visibleOrderRows = useMemo(() => {
    const term = String(searchTerm || "").trim().toLowerCase();
    return receiptOrders.map((order) => {
      const draftRows = receiptDraftByOrder[String(order.productionOrderId)] || initializeOrderDraft(order);
      const rows = draftRows.filter((row) => {
        const rowStatus = Number(row.rejectedQty || 0) > 0
          ? "REJECTED"
          : Number(row.approvedQty || 0) >= Number(row.pendingQty || 0)
            ? "APPROVED"
            : "PENDING";
        if (itemStatusFilter !== "ALL" && itemStatusFilter !== rowStatus) return false;
        if (!term) return true;
        const rowText = `${row.productCode || ""} ${row.productName || ""} ${row.colorName || ""} ${order.productionOrderCode || ""}`.toLowerCase();
        return rowText.includes(term);
      });
      return { order, rows };
    }).filter((entry) => entry.rows.length > 0);
  }, [receiptOrders, receiptDraftByOrder, initializeOrderDraft, itemStatusFilter, searchTerm]);

  const summary = useMemo(() => {
    const rows = visibleOrderRows.flatMap((x) => x.rows);
    const totalsLocal = rows.reduce((acc, row) => ({
      total: acc.total + Number(row.pendingQty || 0),
      approved: acc.approved + Number(row.approvedQty || 0),
      rejected: acc.rejected + Number(row.rejectedQty || 0),
    }), { total: 0, approved: 0, rejected: 0 });
    return {
      totalItems: rows.length,
      totalQty: totalsLocal.total,
      approvedQty: totalsLocal.approved,
      rejectedQty: totalsLocal.rejected,
      pendingQty: Math.max(totalsLocal.total - totalsLocal.approved - totalsLocal.rejected, 0),
    };
  }, [visibleOrderRows]);

  const handleSaveOrderReceipt = async (order) => {
    const key = String(order.productionOrderId);
    const rows = receiptDraftByOrder[key] || initializeOrderDraft(order);
    const rowsToSend = rows
      .filter((row) => Number(row.approvedQty || 0) > 0 || Number(row.rejectedQty || 0) > 0)
      .map((row) => ({
        productionOrderItemId: row.productionOrderItemId,
        approvedQuantity: Number(row.approvedQty || 0),
        rejectedQuantity: Number(row.rejectedQty || 0),
        rejectionReason: row.rejectedQty > 0 ? String(row.rejectionReason || "").trim() : "",
      }));
    if (!rowsToSend.length) {
      showError("No hay cantidades para aprobar/rechazar en esta orden.");
      return;
    }
    const missingReason = rowsToSend.some((r) => r.rejectedQuantity > 0 && !r.rejectionReason);
    if (missingReason) {
      showError("Ingrese motivo para todos los rechazos.");
      return;
    }
    setReceiving(true);
    try {
      await receiveWarehouseProducts(order.productionOrderId, { items: rowsToSend });
      showSuccess(`Recepción registrada para ${order.productionOrderCode || "la orden"}.`);
      setReceiptDraftByOrder((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await fetchData();
    } catch (err) {
      showError(err.message || "Error al registrar recepción");
    } finally {
      setReceiving(false);
    }
  };

  const openReceiptModal = (order) => {
    const rows = (order.items || []).map((item) => {
      const planned = Number(item.quantity || 0);
      const received = Number(item.warehouseReceivedQty || 0);
      const pending = Math.max(planned - received, 0);
      return {
        productionOrderItemId: item.id,
        productCode: item.productCode,
        productName: item.productName,
        colorName: item.colorName,
        plannedQty: planned,
        receivedQty: received,
        pendingQty: pending,
        approvedQty: pending,
        rejectedQty: 0,
        rejectionReason: "",
      };
    }).filter((r) => r.pendingQty > 0);

    setReceiptRows(rows);
    setReceiptModal({ open: true, order });
  };

  const updateReceiptRow = (rowIdx, field, value) => {
    setReceiptRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIdx) return row;
        const next = { ...row };
        if (field === "approvedQty") {
          const approved = Math.max(0, Math.min(Number(value || 0), row.pendingQty));
          next.approvedQty = approved;
          next.rejectedQty = Math.max(0, row.pendingQty - approved);
        } else if (field === "rejectedQty") {
          const rejected = Math.max(0, Math.min(Number(value || 0), row.pendingQty));
          next.rejectedQty = rejected;
          next.approvedQty = Math.max(0, row.pendingQty - rejected);
        } else {
          next[field] = value;
        }
        return next;
      })
    );
  };

  const setReceiptRowQuantities = (rowIdx, approvedQty, rejectedQty) => {
    setReceiptRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== rowIdx) return row;
        const approved = Math.max(0, Math.min(Number(approvedQty || 0), row.pendingQty));
        const rejected = Math.max(0, Math.min(Number(rejectedQty || 0), row.pendingQty));
        const total = approved + rejected;
        if (total === row.pendingQty) {
          return {
            ...row,
            approvedQty: approved,
            rejectedQty: rejected,
            rejectionReason: rejected === 0 ? "" : row.rejectionReason,
          };
        }
        const normalizedApproved = Math.max(0, Math.min(approved, row.pendingQty));
        const normalizedRejected = Math.max(0, row.pendingQty - normalizedApproved);
        return {
          ...row,
          approvedQty: normalizedApproved,
          rejectedQty: normalizedRejected,
          rejectionReason: normalizedRejected === 0 ? "" : row.rejectionReason,
        };
      })
    );
  };

  const applyRowAction = (rowIdx, action) => {
    const row = receiptRows[rowIdx];
    if (!row) return;
    if (action === "APPROVE_ALL") {
      setReceiptRowQuantities(rowIdx, row.pendingQty, 0);
      return;
    }
    if (action === "REJECT_ALL") {
      setReceiptRowQuantities(rowIdx, 0, row.pendingQty);
      return;
    }
    if (action === "APPROVE_PLUS_ONE") {
      const nextApproved = Math.min(row.pendingQty, Number(row.approvedQty || 0) + 1);
      setReceiptRowQuantities(rowIdx, nextApproved, row.pendingQty - nextApproved);
      return;
    }
    if (action === "APPROVE_MINUS_ONE") {
      const nextApproved = Math.max(0, Number(row.approvedQty || 0) - 1);
      setReceiptRowQuantities(rowIdx, nextApproved, row.pendingQty - nextApproved);
      return;
    }
    if (action === "REJECT_PLUS_ONE") {
      const nextRejected = Math.min(row.pendingQty, Number(row.rejectedQty || 0) + 1);
      setReceiptRowQuantities(rowIdx, row.pendingQty - nextRejected, nextRejected);
      return;
    }
    if (action === "REJECT_MINUS_ONE") {
      const nextRejected = Math.max(0, Number(row.rejectedQty || 0) - 1);
      setReceiptRowQuantities(rowIdx, row.pendingQty - nextRejected, nextRejected);
    }
  };

  const applyApproveAllPending = () => {
    setReceiptRows((prev) => prev.map((row) => ({
      ...row,
      approvedQty: row.pendingQty,
      rejectedQty: 0,
      rejectionReason: "",
    })));
  };

  const handleConfirmReceipt = async () => {
    const order = receiptModal.order;
    if (!order?.productionOrderId) return;

    const rowsToSend = receiptRows
      .filter((row) => Number(row.approvedQty || 0) > 0 || Number(row.rejectedQty || 0) > 0)
      .map((row) => ({
        productionOrderItemId: row.productionOrderItemId,
        approvedQuantity: Number(row.approvedQty || 0),
        rejectedQuantity: Number(row.rejectedQty || 0),
        rejectionReason: row.rejectedQty > 0 ? String(row.rejectionReason || "").trim() : "",
      }));

    if (rowsToSend.length === 0) {
      showError("No hay cantidades para aprobar/rechazar.");
      return;
    }
    const missingReason = rowsToSend.some((r) => r.rejectedQuantity > 0 && !r.rejectionReason);
    if (missingReason) {
      showError("Ingrese motivo para todos los rechazos.");
      return;
    }

    setReceiving(true);
    try {
      await receiveWarehouseProducts(order.productionOrderId, { items: rowsToSend });
      showSuccess("Recepción de bodega registrada.");
      setReceiptModal({ open: false, order: null });
      setReceiptRows([]);
      await fetchData();
    } catch (err) {
      showError(err.message || "Error al registrar recepción");
    } finally {
      setReceiving(false);
    }
  };

  if (loading) {
    return (
      <div className="content">
        <div className="text-center py-5">
          <Spinner color="primary" />
          <p className="mt-2">Cargando vista de bodega...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="5">
                  <CardTitle tag="h4">
                    <i className="nc-icon nc-box mr-2" />
                    Recepción en bodega PT
                  </CardTitle>
                  <p className="text-muted mb-0">
                    Revisa y aprueba los artículos terminados antes de ingresar al inventario.
                  </p>
                </Col>
                <Col md="2">
                  <Input
                    type="select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">Todos los estados activos</option>
                    <option value="PENDING">Pendiente</option>
                    <option value="IN_PROGRESS">En Progreso</option>
                    <option value="COMPLETED">Completada</option>
                  </Input>
                </Col>
                <Col md="5" className="text-right">
                  <Badge color="primary" className="mr-2 p-2">
                    {filteredOrders.length} órdenes visibles
                  </Badge>
                  <Badge color="warning" className="mr-2 p-2">
                    {totals.pendingReceipt} con recepción pendiente
                  </Badge>
                  <Button size="sm" color="primary" onClick={fetchData}>
                    <i className="nc-icon nc-refresh-69 mr-1" />
                    Actualizar
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              <Row className="mb-2">
                <Col md="7">
                  <div className="d-flex flex-wrap" style={{ gap: 8 }}>
                    <Button size="sm" color={orderTypeFilter === "ALL" ? "primary" : "secondary"} outline={orderTypeFilter !== "ALL"} onClick={() => setOrderTypeFilter("ALL")}>
                      Todas ({totals.all})
                    </Button>
                    <Button size="sm" color={orderTypeFilter === "NORMAL" ? "primary" : "secondary"} outline={orderTypeFilter !== "NORMAL"} onClick={() => setOrderTypeFilter("NORMAL")}>
                      Producción normal ({totals.normal})
                    </Button>
                    <Button size="sm" color={orderTypeFilter === "VENTA_EN_LINEA" ? "primary" : "secondary"} outline={orderTypeFilter !== "VENTA_EN_LINEA"} onClick={() => setOrderTypeFilter("VENTA_EN_LINEA")}>
                      Venta en línea ({totals.online})
                    </Button>
                    <Button size="sm" color={orderTypeFilter === "DISTRIBUTION" ? "primary" : "secondary"} outline={orderTypeFilter !== "DISTRIBUTION"} onClick={() => setOrderTypeFilter("DISTRIBUTION")}>
                      Distribución ({totals.distribution})
                    </Button>
                  </div>
                </Col>
                <Col md="5">
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por código de OP..."
                  />
                </Col>
              </Row>

              <Row className="mb-3 text-center">
                <Col md="3">
                  <Card className="mb-0">
                    <CardBody className="py-2">
                      <small className="text-muted d-block">Pendientes</small>
                      <strong style={{ fontSize: 22 }}>{summary.pendingQty}</strong>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="3">
                  <Card className="mb-0">
                    <CardBody className="py-2">
                      <small className="text-muted d-block">Aprobados</small>
                      <strong style={{ fontSize: 22, color: "#28a745" }}>{summary.approvedQty}</strong>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="3">
                  <Card className="mb-0">
                    <CardBody className="py-2">
                      <small className="text-muted d-block">Rechazados</small>
                      <strong style={{ fontSize: 22, color: "#dc3545" }}>{summary.rejectedQty}</strong>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="3">
                  <Card className="mb-0">
                    <CardBody className="py-2">
                      <small className="text-muted d-block">Total artículos</small>
                      <strong style={{ fontSize: 22 }}>{summary.totalItems}</strong>
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              <Row className="mb-2">
                <Col md="8">
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar por nombre, código o PO..."
                  />
                </Col>
                <Col md="4">
                  <div className="d-flex justify-content-end" style={{ gap: 8 }}>
                    <Button size="sm" color={itemStatusFilter === "ALL" ? "primary" : "secondary"} outline={itemStatusFilter !== "ALL"} onClick={() => setItemStatusFilter("ALL")}>Todos</Button>
                    <Button size="sm" color={itemStatusFilter === "PENDING" ? "warning" : "secondary"} outline={itemStatusFilter !== "PENDING"} onClick={() => setItemStatusFilter("PENDING")}>Pendientes</Button>
                    <Button size="sm" color={itemStatusFilter === "APPROVED" ? "success" : "secondary"} outline={itemStatusFilter !== "APPROVED"} onClick={() => setItemStatusFilter("APPROVED")}>Aprobados</Button>
                    <Button size="sm" color={itemStatusFilter === "REJECTED" ? "danger" : "secondary"} outline={itemStatusFilter !== "REJECTED"} onClick={() => setItemStatusFilter("REJECTED")}>Rechazados</Button>
                  </div>
                </Col>
              </Row>

              {visibleOrderRows.length === 0 && !error && (
                <Alert color="info">No hay órdenes con artículos pendientes para los filtros seleccionados.</Alert>
              )}

              {visibleOrderRows.map(({ order, rows }) => {
                const orderId = order.productionOrderId;
                const isExpanded = !!expandedOrderIds[orderId];
                return (
                <Card key={orderId} className="mb-2 border">
                  <CardHeader
                    className="py-2"
                    style={{ cursor: "pointer", backgroundColor: "#f8f9fa" }}
                    onClick={() => {
                      ensureOrderDraft(order);
                      setExpandedOrderIds((prev) => ({ ...prev, [orderId]: !prev[orderId] }));
                    }}
                  >
                    <Row className="align-items-center">
                      <Col md="7">
                        <strong>{formatProductionOrderCodeDate(order)}</strong>
                        <Badge color="info" className="ml-2">
                          {getOrderTypeGroup(order) === "VENTA_EN_LINEA"
                            ? "Venta en línea"
                            : getOrderTypeGroup(order) === "DISTRIBUTION"
                              ? "Distribución"
                              : "Prod. normal"}
                        </Badge>
                      </Col>
                      <Col md="2" className="text-right">
                        <small>{rows.length} artículos</small>
                      </Col>
                      <Col md="3" className="text-right">
                        <Button
                          size="sm"
                          color="success"
                          disabled={receiving}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveOrderReceipt(order);
                          }}
                        >
                          Guardar recepción
                        </Button>
                      </Col>
                    </Row>
                  </CardHeader>
                  <Collapse isOpen={isExpanded}>
                    <CardBody className="pt-2">
                      {rows.map((row, idx) => {
                        const itemKey = `${orderId}-${row.productionOrderItemId}`;
                        const itemExpanded = !!expandedItemIds[itemKey];
                        const statusText = Number(row.rejectedQty || 0) > 0 ? "Rechazado" : Number(row.approvedQty || 0) >= Number(row.pendingQty || 0) ? "Aprobado" : "Pendiente";
                        const statusColor = statusText === "Rechazado" ? "danger" : statusText === "Aprobado" ? "success" : "warning";
                        return (
                          <Card key={itemKey} className="mb-2 border-0" style={{ backgroundColor: "#fafafa" }}>
                            <CardBody className="py-2">
                              <Row className="align-items-center">
                                <Col md="7">
                                  <small className="text-muted">{row.productCode}</small>
                                  <div style={{ fontWeight: 700 }}>{row.productName}</div>
                                  <small className="text-muted">{row.colorName || "-"}</small>
                                </Col>
                                <Col md="2" className="text-right">
                                  <small>Plan: <strong>{row.pendingQty}</strong></small>
                                </Col>
                                <Col md="2" className="text-right">
                                  <Badge color={statusColor}>{statusText}</Badge>
                                </Col>
                                <Col md="1" className="text-right">
                                  <Button size="sm" color="link" onClick={() => setExpandedItemIds((prev) => ({ ...prev, [itemKey]: !prev[itemKey] }))}>
                                    {itemExpanded ? "▾" : "▸"}
                                  </Button>
                                </Col>
                              </Row>
                              <Collapse isOpen={itemExpanded}>
                                <Row className="mt-2">
                                  <Col md="6">
                                    <Card className="mb-0">
                                      <CardBody className="py-2">
                                        <small className="text-muted d-block mb-2">APROBAR</small>
                                        <div className="d-flex align-items-center" style={{ gap: 8 }}>
                                          <Button size="sm" color="secondary" onClick={() => applyDraftAction(orderId, idx, "APPROVE_MINUS_ONE")}>-</Button>
                                          <strong>{row.approvedQty}</strong>
                                          <Button size="sm" color="secondary" onClick={() => applyDraftAction(orderId, idx, "APPROVE_PLUS_ONE")}>+</Button>
                                          <Button size="sm" color="success" outline onClick={() => applyDraftAction(orderId, idx, "APPROVE_ALL")}>Aprobar todo</Button>
                                        </div>
                                      </CardBody>
                                    </Card>
                                  </Col>
                                  <Col md="6">
                                    <Card className="mb-0">
                                      <CardBody className="py-2">
                                        <small className="text-muted d-block mb-2">RECHAZAR</small>
                                        <div className="d-flex align-items-center" style={{ gap: 8 }}>
                                          <Button size="sm" color="secondary" onClick={() => applyDraftAction(orderId, idx, "REJECT_MINUS_ONE")}>-</Button>
                                          <strong>{row.rejectedQty}</strong>
                                          <Button size="sm" color="secondary" onClick={() => applyDraftAction(orderId, idx, "REJECT_PLUS_ONE")}>+</Button>
                                          <Button size="sm" color="danger" outline onClick={() => applyDraftAction(orderId, idx, "REJECT_ALL")}>Rechazar todo</Button>
                                        </div>
                                        {Number(row.rejectedQty || 0) > 0 && (
                                          <Input
                                            type="select"
                                            bsSize="sm"
                                            className="mt-2"
                                            value={row.rejectionReason}
                                            onChange={(e) => updateDraftRow(orderId, idx, (old) => ({ ...old, rejectionReason: e.target.value }))}
                                          >
                                            <option value="">Motivo de rechazo...</option>
                                            {REJECTION_REASON_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                                          </Input>
                                        )}
                                      </CardBody>
                                    </Card>
                                  </Col>
                                </Row>
                              </Collapse>
                            </CardBody>
                          </Card>
                        );
                      })}
                    </CardBody>
                  </Collapse>
                </Card>
              );
              })}

              {false && filteredOrders.map((order) => (
                <Card key={order.productionOrderId} className="mb-3 border">
                  <CardHeader
                    className="py-2"
                    style={{ cursor: "pointer", backgroundColor: "#f8f9fa" }}
                    onClick={() => toggleOrder(order.productionOrderId)}
                  >
                    <Row className="align-items-center">
                      <Col md="2">
                        <strong>{formatProductionOrderCodeDate(order)}</strong>
                        <br />
                        <span style={STATUS_STYLES[order.status] || DEFAULT_BADGE_STYLE}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </Col>
                      <Col md="2">
                        <span style={DISPATCH_TYPE_STYLES[order.dispatchType] || DISPATCH_TYPE_STYLES.DIRECT}>
                          {DISPATCH_TYPE_LABELS[order.dispatchType] || order.dispatchType}
                        </span>
                        <br />
                        <small className="text-muted">{order.orderType}</small>
                      </Col>
                      <Col md="2">
                        <small>Items: {order.totalItems}</small>
                        <br />
                        <small>Cantidad: {order.totalQuantity}</small>
                        <br />
                        <small style={{ fontWeight: 700 }}>
                          Hechos: {getOrderQtyProgress(order).produced}
                        </small>
                      </Col>
                      <Col md="3">
                        <small className="d-block mb-1">
                          Tareas: {order.completedTasks}/{order.totalTasks}
                        </small>
                        <Progress
                          value={getProgressPercent(order)}
                          color={
                            getProgressPercent(order) === 100 ? "success" : "info"
                          }
                          style={{ height: "8px" }}
                        />
                        <small className="d-block mt-1 text-muted">
                          Artículos: {getOrderQtyProgress(order).produced}/{getOrderQtyProgress(order).total} ({getOrderQtyProgress(order).pct}%)
                        </small>
                        <Progress
                          value={getOrderQtyProgress(order).pct}
                          color={getOrderQtyProgress(order).pct >= 100 ? "success" : getOrderQtyProgress(order).pct >= 50 ? "info" : "warning"}
                          style={{ height: "6px", marginTop: 4 }}
                        />
                      </Col>
                      <Col md="3" className="text-right">
                        <small className="d-block text-muted">
                          Entrega: {order.deliveryDate || "Sin fecha"}
                        </small>
                        {getPendingReceiptQty(order) > 0 && (
                          <Button
                            size="sm"
                            color="warning"
                            className="mt-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              openReceiptModal(order);
                            }}
                          >
                            <i className="nc-icon nc-check-2 mr-1" />
                            Recibir en Bodega
                          </Button>
                        )}
                        {order.distributionNumber && (
                          <small className="d-block">
                            Dist: {order.distributionNumber}
                          </small>
                        )}
                      </Col>
                    </Row>
                  </CardHeader>

                  <Collapse isOpen={!!expandedOrders[order.productionOrderId]}>
                    <CardBody className="pt-2">
                      <Alert color={getPendingReceiptQty(order) > 0 ? "warning" : "success"} className="py-2">
                        <strong>Recepción Bodega PT:</strong>{" "}
                        {getOrderQtyProgress(order).produced}/{getOrderQtyProgress(order).total} hechas ·
                        {" "}faltan {getOrderQtyProgress(order).pending} ·
                        {" "}avance {getOrderQtyProgress(order).pct}%.
                      </Alert>
                      {/* CUSTOMER SHIPMENTS VIEW */}
                      {order.dispatchType === "CUSTOMER_SHIPMENTS" &&
                        order.customerShipments && (
                          <div>
                            <h6 className="mb-3">
                              <i className="nc-icon nc-delivery-fast mr-1" />
                              Envíos por Cliente ({order.customerShipments.length})
                            </h6>
                            {order.customerShipments.map((shipment, sIdx) => (
                              <Card key={sIdx} className="mb-2 border-left border-primary" style={{ borderLeftWidth: "3px" }}>
                                <CardBody className="py-2 px-3">
                                  <Row className="align-items-center">
                                    <Col md="3">
                                      <strong>{shipment.customerName}</strong>
                                      <br />
                                      <small className="text-muted">
                                        Venta #{shipment.saleNumber}
                                      </small>
                                      <br />
                                      <span style={SALE_STATUS_STYLES[shipment.saleStatus] || DEFAULT_BADGE_STYLE}>
                                        {shipment.saleStatus}
                                      </span>
                                    </Col>
                                    <Col md="3">
                                      <small>
                                        <i className="nc-icon nc-pin-3 mr-1" />
                                        {shipment.address || "Sin dirección"}
                                      </small>
                                      <br />
                                      <small>
                                        <i className="nc-icon nc-mobile mr-1" />
                                        {shipment.phone}
                                        {shipment.phone2 && ` / ${shipment.phone2}`}
                                      </small>
                                    </Col>
                                    <Col md="3">
                                      <small>
                                        Transporte: {shipment.shippingCarrier || "No asignado"}
                                      </small>
                                      <br />
                                      <small>
                                        Guía: {shipment.guideNumber || "Pendiente"}
                                      </small>
                                      <br />
                                      <small>
                                        {shipment.packaging ? "📦 Con empaque" : "Sin empaque"}
                                      </small>
                                    </Col>
                                    <Col md="3" className="text-right">
                                      {shipment.saleStatus !== "ENVIADO" &&
                                        shipment.saleStatus !== "ENTREGADO" && (
                                          <Button
                                            size="sm"
                                            color="success"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              openDispatchModal(
                                                order.productionOrderId,
                                                shipment
                                              );
                                            }}
                                          >
                                            <i className="nc-icon nc-send mr-1" />
                                            Despachar
                                          </Button>
                                        )}
                                      {shipment.saleStatus === "ENVIADO" && (
                                        <Badge color="success" className="p-2">
                                          ✓ Despachado
                                        </Badge>
                                      )}
                                    </Col>
                                  </Row>
                                  {/* Items of this shipment */}
                                  <Table size="sm" className="mt-2 mb-0" bordered>
                                    <thead>
                                      <tr>
                                        <th>Producto</th>
                                        <th>Color</th>
                                        <th>Talla</th>
                                        <th className="text-right">Cantidad</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {shipment.items.map((item, iIdx) => (
                                        <tr key={iIdx}>
                                          <td>
                                            <code>{item.productCode}</code>{" "}
                                            {item.productName}
                                          </td>
                                          <td>{item.colorName || "-"}</td>
                                          <td>{item.size || "-"}</td>
                                          <td className="text-right">
                                            {item.quantity}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </Table>
                                </CardBody>
                              </Card>
                            ))}
                          </div>
                        )}

                      {/* KIOSK DISTRIBUTION VIEW */}
                      {order.dispatchType === "KIOSK_DISTRIBUTION" &&
                        order.kioskShipments && (
                          <div>
                            <h6 className="mb-3">
                              <i className="nc-icon nc-shop mr-1" />
                              Envíos por Kiosco ({order.kioskShipments.length})
                            </h6>
                            {order.kioskShipments.map((shipment, sIdx) => (
                              <Card key={sIdx} className="mb-2 border-left border-success" style={{ borderLeftWidth: "3px" }}>
                                <CardBody className="py-2 px-3">
                                  <Row>
                                    <Col md="4">
                                      <strong>
                                        {shipment.locationName || "Kiosco"}
                                      </strong>
                                      <br />
                                      <small className="text-muted">
                                        Envío: {shipment.shipmentNumber}
                                      </small>
                                      <br />
                                      <span style={STATUS_STYLES[shipment.status] || DEFAULT_BADGE_STYLE}>
                                        {shipment.status}
                                      </span>
                                    </Col>
                                    <Col md="8">
                                      <Table size="sm" className="mb-0" bordered>
                                        <thead>
                                          <tr>
                                            <th>Producto</th>
                                            <th>Color</th>
                                            <th className="text-right">
                                              Cantidad
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {shipment.products &&
                                            shipment.products.map((p, pIdx) => (
                                              <tr key={pIdx}>
                                                <td>
                                                  {p.productName || p.productCode}
                                                </td>
                                                <td>{p.colorName || "-"}</td>
                                                <td className="text-right">
                                                  {p.quantity}
                                                </td>
                                              </tr>
                                            ))}
                                        </tbody>
                                      </Table>
                                    </Col>
                                  </Row>
                                </CardBody>
                              </Card>
                            ))}
                          </div>
                        )}

                      {/* DIRECT PRODUCTION VIEW */}
                      {order.dispatchType === "DIRECT" && order.items && (
                        <div>
                          <h6 className="mb-3">
                            <i className="nc-icon nc-single-copy-04 mr-1" />
                            Items de la Orden ({order.items.length})
                          </h6>
                          <Table size="sm" bordered striped>
                            <thead>
                              <tr>
                                <th>Producto</th>
                                <th>Color</th>
                                <th className="text-right">Cantidad</th>
                                <th className="text-right">Recibido</th>
                                <th className="text-right">Pendiente</th>
                                <th>Observaciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items.map((item, iIdx) => (
                                <tr key={iIdx}>
                                  <td>
                                    <code>{item.productCode}</code>{" "}
                                    {item.productName}
                                  </td>
                                  <td>{item.colorName || "-"}</td>
                                  <td className="text-right">{item.quantity}</td>
                                  <td className="text-right">{item.warehouseReceivedQty || 0}</td>
                                  <td className="text-right">
                                    {Math.max(Number(item.quantity || 0) - Number(item.warehouseReceivedQty || 0), 0)}
                                  </td>
                                  <td>
                                    <small>{item.observations || "-"}</small>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </Table>
                        </div>
                      )}

                      {order.observations && (
                        <Alert color="light" className="mt-2 mb-0">
                          <small>
                            <strong>Observaciones:</strong> {order.observations}
                          </small>
                        </Alert>
                      )}
                    </CardBody>
                  </Collapse>
                </Card>
              ))}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Modal
        isOpen={receiptModal.open}
        toggle={() => {
          if (receiving) return;
          setReceiptModal({ open: false, order: null });
          setReceiptRows([]);
        }}
        size="xl"
      >
        <ModalHeader
          toggle={() => {
            if (receiving) return;
            setReceiptModal({ open: false, order: null });
            setReceiptRows([]);
          }}
        >
          Recepción en Bodega PT - {formatProductionOrderCodeDate(receiptModal.order) || receiptModal.order?.productionOrderCode || "—"}
        </ModalHeader>
        <ModalBody>
          <Row className="mb-2">
            <Col md="8">
              <small className="text-muted">
                Apruebe lo que sí ingresa a inventario PT. Rechazos generan tarea de reproceso.
              </small>
            </Col>
            <Col md="4" className="text-right">
              <Button size="sm" color="secondary" onClick={applyApproveAllPending}>
                Aprobar todo pendiente
              </Button>
            </Col>
          </Row>
          {receiptRows.length === 0 ? (
            <Alert color="success" className="mb-0">
              No hay productos pendientes para recibir en esta orden.
            </Alert>
          ) : (
            <Row>
              {receiptRows.map((row, idx) => (
                <Col md="6" key={row.productionOrderItemId} className="mb-3">
                  <Card className="h-100 border">
                    <CardBody className="py-3">
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div style={{ fontWeight: 700 }}>
                          <code>{row.productCode}</code> {row.productName}
                        </div>
                        <Badge color="warning" pill>
                          Pendiente: {row.pendingQty}
                        </Badge>
                      </div>
                      <small className="text-muted d-block mb-2">
                        Color: {row.colorName || "-"}
                      </small>

                      <Row className="mb-2">
                        <Col xs="4">
                          <small className="text-muted d-block">Plan</small>
                          <strong>{row.plannedQty}</strong>
                        </Col>
                        <Col xs="4">
                          <small className="text-muted d-block">Recibido</small>
                          <strong>{row.receivedQty}</strong>
                        </Col>
                        <Col xs="4">
                          <small className="text-muted d-block">Pendiente</small>
                          <strong>{row.pendingQty}</strong>
                        </Col>
                      </Row>

                      <Row className="mb-2">
                        <Col xs="6">
                          <Label className="mb-1">Aprobar</Label>
                          <div className="d-flex" style={{ gap: 6 }}>
                            <Button size="sm" color="secondary" onClick={() => applyRowAction(idx, "APPROVE_MINUS_ONE")}>-1</Button>
                            <Button size="sm" color="success" onClick={() => applyRowAction(idx, "APPROVE_PLUS_ONE")}>+1</Button>
                            <Button size="sm" color="success" outline onClick={() => applyRowAction(idx, "APPROVE_ALL")}>
                              Aprobar todo
                            </Button>
                          </div>
                          <div className="mt-1">
                            <Badge color="success" pill>Aprobado: {row.approvedQty}</Badge>
                          </div>
                        </Col>
                        <Col xs="6">
                          <Label className="mb-1">Rechazar</Label>
                          <div className="d-flex" style={{ gap: 6 }}>
                            <Button size="sm" color="secondary" onClick={() => applyRowAction(idx, "REJECT_MINUS_ONE")}>-1</Button>
                            <Button size="sm" color="danger" onClick={() => applyRowAction(idx, "REJECT_PLUS_ONE")}>+1</Button>
                            <Button size="sm" color="danger" outline onClick={() => applyRowAction(idx, "REJECT_ALL")}>
                              Rechazar todo
                            </Button>
                          </div>
                          <div className="mt-1">
                            <Badge color={Number(row.rejectedQty || 0) > 0 ? "danger" : "secondary"} pill>
                              Rechazado: {row.rejectedQty}
                            </Badge>
                          </div>
                        </Col>
                      </Row>

                      <Label className="mb-1">Motivo rechazo</Label>
                      <div className="mb-2 d-flex flex-wrap" style={{ gap: 6 }}>
                        {REJECTION_REASON_OPTIONS.map((reason) => (
                          <Button
                            key={reason}
                            size="sm"
                            color={row.rejectionReason === reason ? "danger" : "outline-danger"}
                            disabled={Number(row.rejectedQty || 0) === 0}
                            onClick={() => updateReceiptRow(idx, "rejectionReason", reason)}
                          >
                            {reason}
                          </Button>
                        ))}
                      </div>
                      <Input
                        type="text"
                        bsSize="sm"
                        placeholder="Otro motivo (solo si aplica)"
                        value={row.rejectionReason}
                        disabled={Number(row.rejectedQty || 0) === 0}
                        onChange={(e) => updateReceiptRow(idx, "rejectionReason", e.target.value)}
                      />
                    </CardBody>
                  </Card>
                </Col>
              ))}
            </Row>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            onClick={() => {
              if (receiving) return;
              setReceiptModal({ open: false, order: null });
              setReceiptRows([]);
            }}
          >
            Cancelar
          </Button>
          <Button color="warning" onClick={handleConfirmReceipt} disabled={receiving || receiptRows.length === 0}>
            {receiving ? <Spinner size="sm" /> : "Confirmar recepción"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Dispatch Modal */}
      <Modal
        isOpen={dispatchModal.open}
        toggle={() => setDispatchModal({ open: false, poId: null, sale: null })}
      >
        <ModalHeader
          toggle={() =>
            setDispatchModal({ open: false, poId: null, sale: null })
          }
        >
          Despachar Envío - {dispatchModal.sale?.customerName}
        </ModalHeader>
        <ModalBody>
          <p>
            <strong>Venta:</strong> #{dispatchModal.sale?.saleNumber}
            <br />
            <strong>Dirección:</strong> {dispatchModal.sale?.address}
            <br />
            <strong>Teléfono:</strong> {dispatchModal.sale?.phone}
          </p>
          <FormGroup>
            <Label>Transporte</Label>
            <Input
              type="select"
              value={dispatchData.shippingCarrier}
              onChange={(e) =>
                setDispatchData((prev) => ({
                  ...prev,
                  shippingCarrier: e.target.value,
                }))
              }
            >
              <option value="">Seleccionar...</option>
              <option value="FORZA_DELIVERY">Forza Delivery</option>
              <option value="GUATEX">Guatex</option>
            </Input>
          </FormGroup>
          <FormGroup>
            <Label>Número de Guía</Label>
            <Input
              type="text"
              value={dispatchData.guideNumber}
              onChange={(e) =>
                setDispatchData((prev) => ({
                  ...prev,
                  guideNumber: e.target.value,
                }))
              }
              placeholder="Número de guía de envío"
            />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            onClick={() =>
              setDispatchModal({ open: false, poId: null, sale: null })
            }
          >
            Cancelar
          </Button>
          <Button color="success" onClick={handleDispatch} disabled={dispatching}>
            {dispatching ? (
              <Spinner size="sm" />
            ) : (
              <>
                <i className="nc-icon nc-send mr-1" />
                Confirmar Despacho
              </>
            )}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default WarehouseView;

