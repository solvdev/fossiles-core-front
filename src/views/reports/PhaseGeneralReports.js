import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle, Col, Input, Row, Spinner, Table } from "reactstrap";
import { getDistributions, getShipmentsByDistribution } from "services/productDistributionService";
import { getProductionOrders } from "services/productionOrderService";
import { getTasks } from "services/taskService";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";

const REPORT_TYPES = [
  { key: "DISTRIBUTION", label: "Distribucion" },
  { key: "PRODUCTION_ORDERS", label: "Ordenes de Produccion" },
  { key: "TASKS", label: "Tareas" },
  { key: "PHASE_LEATHER", label: "Fase Cuero" },
  { key: "PHASE_DIE_CUT", label: "Fase Troquel" },
  { key: "PHASE_MATERIALS", label: "Fase Materiales" },
  { key: "PHASE_TABLE", label: "Fase Mesa" },
  { key: "PHASE_PRODUCTION", label: "Fase Produccion" },
  { key: "PHASE_PRODUCED", label: "Fase Producidas" },
];

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

const ORDER_TYPE_ES = {
  NORMAL: "Kiosko",
  DISTRIBUTION: "Distribucion",
  VENTA_EN_LINEA: "Venta en Linea",
  CLIENTE_KIOSKO: "Cliente Kiosko",
  CINCHOS: "Cinchos",
  CINCHOS_FOSSILES: "Cinchos Fossiles",
  CINCHOS_MARCAS: "Cinchos Marcas",
  MARCAS: "Marcas",
};

const formatDate = (value) => {
  if (!value) return "-";
  try {
    return formatDateTimeGt(value);
  } catch (_err) {
    return String(value);
  }
};

const hasTableEntry = (task) =>
  task?.desk != null || task?.scheduledDate != null || (task?.startTime && String(task.startTime).trim());

const includesText = (value, query) => String(value || "").toLowerCase().includes(query);
const tStatus = (value) => STATUS_ES[value] || value || "-";
const tWorkflow = (value) => WORKFLOW_ES[value] || value || "-";
const tOrderType = (value) => ORDER_TYPE_ES[value] || value || "-";
const toMillis = (value) => {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
};

function PhaseGeneralReports() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reportType, setReportType] = useState("DISTRIBUTION");
  const [search, setSearch] = useState("");
  const [shipments, setShipments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const [distributionData, orderData, taskData] = await Promise.all([
          getDistributions(),
          getProductionOrders(),
          getTasks(),
        ]);

        setOrders(orderData || []);
        setTasks(taskData || []);

        const distList = distributionData || [];
        const shipmentResults = await Promise.allSettled(
          distList.map((dist) => getShipmentsByDistribution(dist.id))
        );
        const merged = [];
        shipmentResults.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          const dist = distList[index];
          (result.value || []).forEach((shipment) => {
            merged.push({
              ...shipment,
              distributionNumber: dist?.distributionNumber,
              distributionStatus: dist?.status,
            });
          });
        });
        setShipments(merged);
      } catch (err) {
        setError(err.message || "No se pudieron cargar reportes por fase");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const q = (search || "").toLowerCase().trim();

  const orderProcessById = useMemo(() => {
    const map = {};
    (orders || []).forEach((order) => {
      const orderId = Number(order.id);
      if (!orderId) return;
      const orderTasks = (tasks || []).filter((task) => Number(task.productionOrderId) === orderId);

      const startCandidates = [];
      orderTasks.forEach((task) => {
        const startedAtMs = toMillis(task.startedAt);
        const scheduledMs = toMillis(task.scheduledDate);
        if (startedAtMs != null) startCandidates.push(startedAtMs);
        if (scheduledMs != null) startCandidates.push(scheduledMs);
      });

      const deliveryCandidates = [];
      orderTasks.forEach((task) => {
        const completedAtMs = toMillis(task.completedAt);
        if (completedAtMs != null) deliveryCandidates.push(completedAtMs);
      });
      const allTasksCompleted = orderTasks.length > 0 && orderTasks.every((task) => task.status === "COMPLETED");

      let resolvedStatus = order?.status;
      if (allTasksCompleted) {
        resolvedStatus = "COMPLETED";
      }

      map[orderId] = {
        status: resolvedStatus,
        startedAt: startCandidates.length ? new Date(Math.min(...startCandidates)).toISOString() : order?.startDate || null,
        deliveredAt: deliveryCandidates.length ? new Date(Math.max(...deliveryCandidates)).toISOString() : order?.deliveryDate || null,
      };
    });
    return map;
  }, [orders, tasks]);

  const reportData = useMemo(() => {
    switch (reportType) {
      case "DISTRIBUTION":
        return {
          title: "Reporte General - Distribucion",
          headers: [
            { label: "Distribucion", value: (r) => r.distributionNumber || "-" },
            { label: "Envio", value: (r) => r.shipmentNumber || r.id },
            { label: "Kiosko", value: (r) => r.locationName || "-" },
            { label: "Estado Envio", value: (r) => tStatus(r.status) },
            { label: "Estado Distribucion", value: (r) => tStatus(r.distributionStatus) },
            { label: "Enviado", value: (r) => formatDate(r.sentAt) },
            { label: "Recibido", value: (r) => formatDate(r.receivedAt) },
          ],
          rows: shipments,
          matches: (r) =>
            includesText(`${r.distributionNumber} ${r.shipmentNumber} ${r.locationName} ${r.locationCode} ${r.status}`, q),
        };
      case "PRODUCTION_ORDERS":
        return {
          title: "Reporte General - Ordenes de Produccion",
          headers: [
            { label: "OP", value: (r) => r.code || r.id },
            { label: "Tipo", value: (r) => tOrderType(r.orderType) },
            { label: "Cliente", value: "customerName" },
            { label: "Estado", value: (r) => tStatus(orderProcessById[Number(r.id)]?.status || r.status) },
            { label: "Inicio", value: (r) => formatDate(orderProcessById[Number(r.id)]?.startedAt || r.startDate) },
            { label: "Entrega", value: (r) => formatDate(orderProcessById[Number(r.id)]?.deliveredAt || r.deliveryDate) },
          ],
          rows: orders,
          matches: (r) => includesText(`${r.code} ${r.orderType} ${r.customerName} ${r.status}`, q),
        };
      case "TASKS":
        return {
          title: "Reporte General - Tareas",
          headers: [
            { label: "Tarea", value: "code" },
            { label: "OP", value: (r) => r.productionOrderCode || r.productionOrderId || "-" },
            { label: "Workflow", value: (r) => tWorkflow(r.workflowStatus) },
            { label: "Estado", value: (r) => tStatus(r.status) },
            { label: "Mesa", value: (r) => r.desk ?? "-" },
            { label: "Fecha", value: (r) => formatDate(r.scheduledDate) },
          ],
          rows: tasks,
          matches: (r) => includesText(`${r.code} ${r.productionOrderCode} ${r.workflowStatus} ${r.status}`, q),
        };
      case "PHASE_LEATHER":
        return {
          title: "Reporte General - Fase Cuero",
          headers: [
            { label: "Tarea", value: "code" },
            { label: "OP", value: (r) => r.productionOrderCode || "-" },
            { label: "Cuero Entregado", value: (r) => (r.leatherDelivered ? "SI" : "NO") },
            { label: "Estado", value: (r) => tStatus(r.status) },
            { label: "Workflow", value: (r) => tWorkflow(r.workflowStatus) },
          ],
          rows: tasks.filter((t) => !t.leatherDelivered || t.workflowStatus === "PENDING_LEATHER"),
          matches: (r) => includesText(`${r.code} ${r.productionOrderCode} ${r.status}`, q),
        };
      case "PHASE_DIE_CUT":
        return {
          title: "Reporte General - Fase Troquel",
          headers: [
            { label: "Tarea", value: "code" },
            { label: "OP", value: (r) => r.productionOrderCode || "-" },
            { label: "Troquelado", value: (r) => (r.dieCutReady ? "SI" : "NO") },
            { label: "Estado", value: (r) => tStatus(r.status) },
            { label: "Workflow", value: (r) => tWorkflow(r.workflowStatus) },
          ],
          rows: tasks.filter((t) => t.leatherDelivered && (!t.dieCutReady || t.workflowStatus === "PENDING_DIE_CUT")),
          matches: (r) => includesText(`${r.code} ${r.productionOrderCode} ${r.status}`, q),
        };
      case "PHASE_MATERIALS":
        return {
          title: "Reporte General - Fase Materiales",
          headers: [
            { label: "Tarea", value: "code" },
            { label: "OP", value: (r) => r.productionOrderCode || "-" },
            { label: "Requiere Materiales", value: (r) => (r.requiresMaterials === false ? "NO" : "SI") },
            { label: "Materiales Entregados", value: (r) => (r.materialsDelivered ? "SI" : "NO") },
            { label: "Estado", value: (r) => tStatus(r.status) },
            { label: "Workflow", value: (r) => tWorkflow(r.workflowStatus) },
          ],
          rows: tasks.filter((t) =>
            t.requiresMaterials !== false && t.dieCutReady && hasTableEntry(t) && (!t.materialsDelivered || t.workflowStatus === "PENDING_MATERIAL_DELIVERY")
          ),
          matches: (r) => includesText(`${r.code} ${r.productionOrderCode} ${r.status}`, q),
        };
      case "PHASE_TABLE":
        return {
          title: "Reporte General - Fase Mesa",
          headers: [
            { label: "Tarea", value: "code" },
            { label: "OP", value: (r) => r.productionOrderCode || "-" },
            { label: "Mesa", value: (r) => r.desk ?? "-" },
            { label: "Fecha", value: (r) => formatDate(r.scheduledDate) },
            { label: "Hora", value: (r) => r.startTime || "-" },
            { label: "Estado", value: (r) => tStatus(r.status) },
          ],
          rows: tasks.filter((t) => t.dieCutReady && !hasTableEntry(t)),
          matches: (r) => includesText(`${r.code} ${r.productionOrderCode} ${r.status}`, q),
        };
      case "PHASE_PRODUCTION":
        return {
          title: "Reporte General - Fase Produccion",
          headers: [
            { label: "Tarea", value: "code" },
            { label: "OP", value: (r) => r.productionOrderCode || "-" },
            { label: "Workflow", value: (r) => tWorkflow(r.workflowStatus) },
            { label: "Estado", value: (r) => tStatus(r.status) },
            { label: "Mesa", value: (r) => r.desk ?? "-" },
            { label: "Inicio", value: (r) => formatDate(r.startedAt) },
          ],
          rows: tasks.filter((t) =>
            t.status === "IN_PROGRESS" || t.workflowStatus === "IN_PRODUCTION" || t.workflowStatus === "READY_TO_START"
          ),
          matches: (r) => includesText(`${r.code} ${r.productionOrderCode} ${r.status}`, q),
        };
      case "PHASE_PRODUCED":
      default:
        return {
          title: "Reporte General - Fase Producidas",
          headers: [
            { label: "Tarea", value: "code" },
            { label: "OP", value: (r) => r.productionOrderCode || "-" },
            { label: "Estado", value: (r) => tStatus(r.status) },
            { label: "Completada", value: (r) => formatDate(r.completedAt) },
            { label: "Mesa", value: (r) => r.desk ?? "-" },
          ],
          rows: tasks.filter((t) => t.status === "COMPLETED" || t.workflowStatus === "COMPLETED"),
          matches: (r) => includesText(`${r.code} ${r.productionOrderCode} ${r.status}`, q),
        };
    }
  }, [orders, q, reportType, shipments, tasks]);

  const filteredRows = useMemo(() => {
    if (!q) return reportData.rows;
    return reportData.rows.filter(reportData.matches);
  }, [q, reportData]);

  const exportCsv = () => {
    const filename = `reporte_${reportType.toLowerCase()}`;
    exportRowsToCsv(filename, reportData.headers, filteredRows);
  };

  const exportPdf = () => {
    exportRowsToPdf(reportData.title, reportData.headers, filteredRows);
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4" className="mb-1">Reportes Generales por Fase</CardTitle>
              <p className="text-muted mb-0">
                Cada fase tiene su reporte general con todos los registros (sin limitar por estado puntual).
              </p>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Row className="mb-3">
                <Col md="4">
                  <Input type="select" value={reportType} onChange={(e) => setReportType(e.target.value)}>
                    {REPORT_TYPES.map((type) => (
                      <option key={type.key} value={type.key}>
                        {type.label}
                      </option>
                    ))}
                  </Input>
                </Col>
                <Col md="4">
                  <Input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar en el reporte seleccionado..."
                  />
                </Col>
                <Col md="4" className="text-right">
                  <Button color="secondary" className="mr-2" onClick={exportCsv} disabled={!filteredRows.length}>
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    CSV
                  </Button>
                  <Button color="secondary" onClick={exportPdf} disabled={!filteredRows.length}>
                    <i className="nc-icon nc-single-copy-04 mr-1" />
                    PDF
                  </Button>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center py-4"><Spinner color="primary" /></div>
              ) : filteredRows.length === 0 ? (
                <Alert color="light" className="mb-0">Sin registros para el reporte seleccionado.</Alert>
              ) : (
                <>
                  <div className="mb-2">
                    <Badge color="info">Registros: {filteredRows.length}</Badge>
                  </div>
                  <Table responsive size="sm">
                    <thead>
                      <tr>
                        {reportData.headers.map((header) => (
                          <th key={header.label}>{header.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row, index) => (
                        <tr key={`${reportType}-${index}`}>
                          {reportData.headers.map((header) => (
                            <td key={header.label}>
                              {typeof header.value === "function" ? header.value(row) : row[header.value]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default PhaseGeneralReports;
