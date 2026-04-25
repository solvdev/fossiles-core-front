import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Input,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import {
  getConsumptionHistory,
  getCustomerShipments,
  getProductionOrderById,
  getProductionOrders,
} from "services/productionOrderService";
import { getTasksByProductionOrder } from "services/taskService";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { formatDateTimeGt, formatDateDdMmYyGt } from "utils/dateTimeHelper";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";

const badge = (bg, color = "#fff") => ({
  backgroundColor: bg,
  color,
  borderRadius: 999,
  padding: "3px 10px",
  fontWeight: 700,
  fontSize: 12,
});

const STATUS_ES = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  PENDING: "Pendiente",
  IN_PROGRESS: "En Proceso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  REWORK: "Reproceso",
  CONSUMED: "Consumido",
};

const WORKFLOW_ES = {
  PENDING_LEATHER: "Pendiente Cuero",
  PENDING_DIE_CUT: "Pendiente Troquel",
  PENDING_TABLE_ENTRY: "Pendiente Mesa",
  PENDING_MATERIAL_DELIVERY: "Pendiente Materiales",
  READY_TO_START: "Lista para Iniciar",
  IN_PRODUCTION: "En Produccion",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const tStatus = (value) => STATUS_ES[value] || value || "-";
const tWorkflow = (value) => WORKFLOW_ES[value] || value || "-";

function ProductionTraceability() {
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [error, setError] = useState("");

  const [orderDetail, setOrderDetail] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [consumptions, setConsumptions] = useState([]);
  const [customerShipments, setCustomerShipments] = useState([]);

  const selectorRef = useRef(null);

  const loadOrders = async () => {
    try {
      setLoadingOrders(true);
      const data = await getProductionOrders();
      const list = (data || []).filter((o) => o.status !== "CANCELLED");
      setOrders(list);
      if (!selectedOrderId && list.length > 0) {
        setSelectedOrderId(list[0].id);
        setSearch(formatProductionOrderCodeDate(list[0]) || list[0].code || "");
      }
    } catch (err) {
      setError(err.message || "No se pudieron cargar las OP");
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    const onOutside = (event) => {
      if (!selectorRef.current?.contains(event.target)) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  const filteredOrders = useMemo(() => {
    const term = (search || "").toLowerCase().trim();
    if (!term) return orders.slice(0, 30);
    return orders.filter((o) => {
      const txt = `${o.code || ""} ${formatDateDdMmYyGt(o.startDate || o.createdAt)} ${o.customerName || ""} ${o.orderType || ""}`.toLowerCase();
      return txt.includes(term);
    }).slice(0, 30);
  }, [orders, search]);

  useEffect(() => {
    if (!selectedOrderId) return;
    const loadTrace = async () => {
      try {
        setLoadingTrace(true);
        setError("");
        const [detail, taskData, consData, customerData] = await Promise.all([
          getProductionOrderById(selectedOrderId),
          getTasksByProductionOrder(selectedOrderId),
          getConsumptionHistory(selectedOrderId),
          getCustomerShipments(selectedOrderId).catch(() => []),
        ]);
        setOrderDetail(detail || null);
        setTasks(taskData || []);
        setConsumptions(consData || []);
        setCustomerShipments(customerData || []);
      } catch (err) {
        setError(err.message || "No se pudo cargar la trazabilidad");
      } finally {
        setLoadingTrace(false);
      }
    };
    loadTrace();
  }, [selectedOrderId]);

  const kioskShipments = orderDetail?.distributionShipments || [];
  const totalMaterialLines = consumptions.length;
  const orderCode = orderDetail?.code || `op_${selectedOrderId || "general"}`;
  const orderStatus = tStatus(orderDetail?.status);

  const exportTasks = () => {
    exportRowsToCsv(`trazabilidad_tareas_${orderCode}`, [
      { label: "Tarea", value: "code" },
      { label: "Workflow", value: (t) => tWorkflow(t.workflowStatus) },
      { label: "Estado", value: (t) => tStatus(t.status) },
      { label: "Mesa", value: "desk" },
      { label: "Fecha", value: "scheduledDate" },
      { label: "Hora", value: "startTime" },
    ], tasks);
  };
  const exportTasksPdf = () => {
    exportRowsToPdf(`Trazabilidad Tareas ${orderCode}`, [
      { label: "Tarea", value: "code" },
      { label: "Workflow", value: (t) => tWorkflow(t.workflowStatus) },
      { label: "Estado", value: (t) => tStatus(t.status) },
      { label: "Mesa", value: "desk" },
      { label: "Fecha", value: "scheduledDate" },
      { label: "Hora", value: "startTime" },
    ], tasks);
  };

  const exportConsumptions = () => {
    exportRowsToCsv(`trazabilidad_consumos_${orderCode}`, [
      { label: "Material ID", value: "materialId" },
      { label: "Material", value: (c) => `${c.materialSku ? `${c.materialSku} - ` : ""}${c.materialName || "-"}` },
      { label: "Cantidad", value: "quantityConsumed" },
      { label: "Estado", value: (c) => tStatus(c.status) },
      { label: "Fecha", value: (c) => (c.consumedAt ? formatDateTimeGt(c.consumedAt) : "-") },
    ], consumptions);
  };
  const exportConsumptionsPdf = () => {
    exportRowsToPdf(`Trazabilidad Consumos ${orderCode}`, [
      { label: "Material ID", value: "materialId" },
      { label: "Material", value: (c) => `${c.materialSku ? `${c.materialSku} - ` : ""}${c.materialName || "-"}` },
      { label: "Cantidad", value: "quantityConsumed" },
      { label: "Estado", value: (c) => tStatus(c.status) },
      { label: "Fecha", value: (c) => (c.consumedAt ? formatDateTimeGt(c.consumedAt) : "-") },
    ], consumptions);
  };

  return (
    <div className="content">
      <Row className="mb-3">
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4" className="mb-1">Trazabilidad por Orden de Produccion</CardTitle>
              <p className="text-muted mb-0">
                Vista unica por OP: tareas, consumo de materiales, envios y recepcion.
              </p>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <div ref={selectorRef} style={{ position: "relative" }}>
                <Input
                  type="search"
                  placeholder="Buscar OP por codigo, cliente o tipo..."
                  value={search}
                  onFocus={() => setShowOptions(true)}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowOptions(true);
                  }}
                />
                {showOptions && (
                  <div style={{
                    position: "absolute",
                    zIndex: 50,
                    width: "100%",
                    maxHeight: 260,
                    overflowY: "auto",
                    backgroundColor: "#fff",
                    border: "1px solid #dbe2ea",
                    borderRadius: 8,
                    marginTop: 4,
                  }}>
                    {filteredOrders.length === 0 ? (
                      <div className="px-3 py-2 text-muted">Sin coincidencias</div>
                    ) : filteredOrders.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="btn btn-link w-100 text-left px-3 py-2"
                        style={{
                          textDecoration: "none",
                          color: "#334155",
                          backgroundColor: selectedOrderId === o.id ? "#eff6ff" : "#fff",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                        onClick={() => {
                          setSelectedOrderId(o.id);
                          setSearch(formatProductionOrderCodeDate(o) || o.code || "");
                          setShowOptions(false);
                        }}
                      >
                        <strong>{formatProductionOrderCodeDate(o)}</strong>
                        <small className="d-block text-muted">{o.orderType} · {o.customerName || "Sin cliente"} · {tStatus(o.status)}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {(loadingOrders || loadingTrace) && (
        <div className="text-center py-3">
          <Spinner color="primary" />
        </div>
      )}

      {orderDetail && !loadingTrace && (
        <>
          <Row className="mb-3">
            <Col md="3"><Card className="mb-0"><CardBody className="py-2"><small className="text-muted d-block">Estado OP</small><span style={badge("#0ea5e9")}>{orderStatus}</span></CardBody></Card></Col>
            <Col md="3"><Card className="mb-0"><CardBody className="py-2"><small className="text-muted d-block">Tareas</small><strong>{tasks.length}</strong></CardBody></Card></Col>
            <Col md="3"><Card className="mb-0"><CardBody className="py-2"><small className="text-muted d-block">Consumos</small><strong>{totalMaterialLines}</strong></CardBody></Card></Col>
            <Col md="3"><Card className="mb-0"><CardBody className="py-2"><small className="text-muted d-block">Envios a kiosko</small><strong>{kioskShipments.length}</strong></CardBody></Card></Col>
          </Row>

          <Row>
            <Col md="12" className="mb-3">
              <Card>
                <CardHeader className="d-flex justify-content-between align-items-center">
                  <CardTitle tag="h6" className="mb-0">Flujo de Tareas</CardTitle>
                  <div>
                    <Badge color="secondary" className="mr-2" style={{ cursor: "pointer" }} onClick={exportTasks}>CSV</Badge>
                    <Badge color="secondary" style={{ cursor: "pointer" }} onClick={exportTasksPdf}>PDF</Badge>
                  </div>
                </CardHeader>
                <CardBody className="pt-2">
                  <Table responsive size="sm">
                    <thead><tr><th>Tarea</th><th>Workflow</th><th>Estado</th><th>Mesa</th><th>Fecha</th><th>Hora</th></tr></thead>
                    <tbody>
                      {tasks.length === 0 ? (
                        <tr><td colSpan="6" className="text-center text-muted">Sin tareas</td></tr>
                      ) : tasks.map((t) => (
                        <tr key={t.id}>
                          <td>{t.code}</td>
                          <td>{tWorkflow(t.workflowStatus)}</td>
                          <td>{tStatus(t.status)}</td>
                          <td>{t.desk || "-"}</td>
                          <td>{t.scheduledDate || "-"}</td>
                          <td>{t.startTime || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </CardBody>
              </Card>
            </Col>

            <Col md="12" className="mb-3">
              <Card>
                <CardHeader className="d-flex justify-content-between align-items-center">
                  <CardTitle tag="h6" className="mb-0">Consumo de Materiales (Kardex OP)</CardTitle>
                  <div>
                    <Badge color="secondary" className="mr-2" style={{ cursor: "pointer" }} onClick={exportConsumptions}>CSV</Badge>
                    <Badge color="secondary" style={{ cursor: "pointer" }} onClick={exportConsumptionsPdf}>PDF</Badge>
                  </div>
                </CardHeader>
                <CardBody className="pt-2">
                  <Table responsive size="sm">
                    <thead><tr><th>Material</th><th className="text-right">Cantidad</th><th>Estado</th><th>Fecha</th></tr></thead>
                    <tbody>
                      {consumptions.length === 0 ? (
                        <tr><td colSpan="4" className="text-center text-muted">Sin consumos</td></tr>
                      ) : consumptions.map((c) => (
                        <tr key={c.id}>
                          <td>{c.materialSku ? `${c.materialSku} - ` : ""}{c.materialName || `Material #${c.materialId}`}</td>
                          <td className="text-right">{c.quantityConsumed}</td>
                          <td>{tStatus(c.status)}</td>
                          <td>{c.consumedAt ? formatDateTimeGt(c.consumedAt) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </CardBody>
              </Card>
            </Col>

            <Col md="12" className="mb-3">
              <Card>
                <CardHeader><CardTitle tag="h6" className="mb-0">Envios Kiosko (Transferencia y Recepcion)</CardTitle></CardHeader>
                <CardBody className="pt-2">
                  <Table responsive size="sm">
                    <thead><tr><th>Envio</th><th>Kiosko</th><th>Estado</th><th>Enviado</th><th>Recibido</th></tr></thead>
                    <tbody>
                      {kioskShipments.length === 0 ? (
                        <tr><td colSpan="5" className="text-center text-muted">Sin envios a kiosko</td></tr>
                      ) : kioskShipments.map((s) => (
                        <tr key={s.id}>
                          <td>{s.shipmentNumber}</td>
                          <td>{s.locationName || "-"}</td>
                          <td>{tStatus(s.status)}</td>
                          <td>{s.sentAt ? formatDateTimeGt(s.sentAt) : "-"}</td>
                          <td>{s.receivedAt ? formatDateTimeGt(s.receivedAt) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </CardBody>
              </Card>
            </Col>

            <Col md="12">
              <Card>
                <CardHeader><CardTitle tag="h6" className="mb-0">Envios a Cliente (Venta en Linea)</CardTitle></CardHeader>
                <CardBody className="pt-2">
                  <Table responsive size="sm">
                    <thead><tr><th>Venta</th><th>Cliente</th><th>Estado</th><th>Direccion</th><th>Guia</th></tr></thead>
                    <tbody>
                      {customerShipments.length === 0 ? (
                        <tr><td colSpan="5" className="text-center text-muted">Sin envios a cliente</td></tr>
                      ) : customerShipments.map((s) => (
                        <tr key={s.onlineSaleId}>
                          <td>{s.saleNumber || s.onlineSaleId}</td>
                          <td>{s.customerName || "-"}</td>
                          <td>{tStatus(s.saleStatus)}</td>
                          <td>{s.address || "-"}</td>
                          <td>{s.guideNumber || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}

export default ProductionTraceability;

