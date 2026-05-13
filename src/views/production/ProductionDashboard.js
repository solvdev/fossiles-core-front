import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle,
  Col, Input, Label, Progress, Row, Spinner, Table,
} from "reactstrap";
import {
  getConsumptionHistory,
  getCustomerShipments,
  getProductionDashboardV2,
  getProductionOrderById,
  getProductionOrders,
} from "services/productionOrderService";
import { getTasksByProductionOrder } from "services/taskService";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { formatProductionOrderCodeDate, formatProductionOrderSelectLabel } from "utils/productionOrderDisplayHelper";

const ACTIONS = [
  { label: "OPs", path: "/admin/production-orders", color: "primary" },
  { label: "Centro", path: "/admin/tasks-by-station", color: "info" },
  { label: "Cinchos", path: "/admin/cinchos-production", color: "dark" },
  { label: "Materiales", path: "/admin/materials-tasks", color: "warning" },
  { label: "Bodega PT", path: "/admin/warehouse-view", color: "secondary" },
];

const CARD_STYLE = { marginBottom: 22, borderRadius: 12 };
const KPI_CARD_STYLE = { ...CARD_STYLE, minHeight: 150 };
const SECTION_ROW_STYLE = { marginBottom: 18 };

const STATUS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En proceso",
  IN_QA: "En QA",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const WORKFLOW = {
  PENDING_LEATHER: "Pendiente cuero",
  PENDING_DIE_CUT: "Pendiente troquel",
  PENDING_TABLE_ENTRY: "Pendiente mesa",
  PENDING_MATERIAL_DELIVERY: "Pendiente materiales",
  READY_TO_START: "Lista para iniciar",
  IN_PRODUCTION: "En produccion",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const fmtN = (value) => Number(value || 0).toLocaleString("es-GT");
const fmtPct = (value) => `${Number(value || 0).toFixed(1)}%`;
const fmtDate = (value) => (value ? String(value).slice(0, 10) : "-");
const clamp = (value) => Math.min(Math.max(Number(value) || 0, 0), 100);
const statusLabel = (value) => STATUS[value] || value || "-";
const workflowLabel = (value) => WORKFLOW[value] || value || "-";

function orderHealth(order) {
  if (!order) return { level: "OK", label: "Controlada", color: "success", action: "Monitorear avance" };
  if (order.overdue) return { level: "CRITICAL", label: "Critica", color: "danger", action: "Priorizar hoy y reprogramar capacidad" };
  if (order.materialsPending) return { level: "RISK", label: "Materiales", color: "warning", action: "Liberar materiales antes de producir" };
  if (order.withoutTasks) return { level: "RISK", label: "Sin tareas", color: "warning", action: "Generar o revisar tareas" };
  if (order.dueToday || order.dueTomorrow) return { level: "RISK", label: "Proxima", color: "warning", action: "Confirmar mesa y avance" };
  return { level: "OK", label: "Controlada", color: "success", action: "Monitorear avance" };
}

function deskHealth(desk) {
  if (desk?.health === "AT_RISK") return { label: "Cuello", color: "danger", action: "Revisar atraso y carga" };
  if ((desk?.efficiencyRate || 0) > 0 && desk.efficiencyRate < 80) {
    return { label: "Eficiencia baja", color: "warning", action: "Comparar estimado vs real" };
  }
  if (((desk?.pendingTasks || 0) + (desk?.inProgressTasks || 0)) > 0 && (desk?.completionRate || 0) < 50) {
    return { label: "Carga activa", color: "warning", action: "Dar seguimiento durante el dia" };
  }
  return { label: "Saludable", color: "success", action: "Sin accion inmediata" };
}

function ScoreCard({ title, value, subtitle, color = "primary", progress, note }) {
  return (
    <Card style={KPI_CARD_STYLE}>
      <CardBody>
        <div className="text-muted" style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
          {title}
        </div>
        <div className={`text-${color}`} style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.1 }}>
          {value}
        </div>
        {progress != null && <Progress value={clamp(progress)} color={color} className="my-2" />}
        <div className="text-muted" style={{ fontSize: 12 }}>{subtitle}</div>
        {note && <div style={{ fontSize: 12, marginTop: 8 }}>{note}</div>}
      </CardBody>
    </Card>
  );
}

function CompactKpi({ label, value, color = "primary", hint }) {
  return (
    <div style={{ border: "1px solid #edf2f7", borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
      <div className={`text-${color}`} style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.1 }}>
        {value}
      </div>
      <div className="text-muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
      {hint && <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function KpiGroup({ title, subtitle, items }) {
  return (
    <Col lg="4">
      <Card style={CARD_STYLE}>
        <CardHeader>
          <CardTitle tag="h5" className="mb-0">{title}</CardTitle>
          <small className="text-muted">{subtitle}</small>
        </CardHeader>
        <CardBody>
          <Row>
            {items.map((item) => (
              <Col xs="6" key={item.label} className="mb-3">
                <CompactKpi {...item} />
              </Col>
            ))}
          </Row>
        </CardBody>
      </Card>
    </Col>
  );
}

function ProductionDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [error, setError] = useState("");
  const [traceError, setTraceError] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [trace, setTrace] = useState({ order: null, tasks: [], consumptions: [], shipments: [] });

  const summary = dashboard?.summary || {};
  const production = dashboard?.production || {};
  const taskSummary = dashboard?.tasks || {};
  const desks = dashboard?.desks || [];
  const criticalOrders = dashboard?.criticalOrders || [];

  const loadDashboard = async (from, to) => {
    try {
      setLoading(true);
      setError("");
      const [data, orderData] = await Promise.all([
        getProductionDashboardV2(from, to),
        getProductionOrders(),
      ]);
      setDashboard(data);
      setOrders((orderData || []).filter((order) => order.status !== "CANCELLED"));
      if (!selectedOrderId && data?.criticalOrders?.[0]?.id) {
        setSelectedOrderId(String(data.criticalOrders[0].id));
      }
    } catch (err) {
      setError(err.message || "Error al cargar dashboard de produccion");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    if (!selectedOrderId) return;
    const loadTrace = async () => {
      try {
        setLoadingTrace(true);
        setTraceError("");
        const [order, taskRows, consumptionRows, shipmentRows] = await Promise.all([
          getProductionOrderById(selectedOrderId),
          getTasksByProductionOrder(selectedOrderId),
          getConsumptionHistory(selectedOrderId).catch(() => []),
          getCustomerShipments(selectedOrderId).catch(() => []),
        ]);
        setTrace({
          order: order || null,
          tasks: taskRows || [],
          consumptions: consumptionRows || [],
          shipments: shipmentRows || [],
        });
      } catch (err) {
        setTraceError(err.message || "No se pudo cargar la trazabilidad de la OP");
        setTrace({ order: null, tasks: [], consumptions: [], shipments: [] });
      } finally {
        setLoadingTrace(false);
      }
    };
    loadTrace();
  }, [selectedOrderId]);

  const filteredOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();
    if (!term) return orders.slice(0, 25);
    return orders.filter((order) => {
      const text = `${order.code || ""} ${order.customerName || ""} ${order.orderType || ""} ${formatProductionOrderCodeDate(order)}`.toLowerCase();
      return text.includes(term);
    }).slice(0, 25);
  }, [orders, orderSearch]);

  const globalHealth = useMemo(() => {
    if ((summary.overdueOrders || 0) > 0 || (taskSummary.overdueTasks || 0) > 0) {
      return { label: "Critica", color: "danger", note: "Hay atrasos que requieren decision hoy." };
    }
    if ((taskSummary.unassignedTasks || 0) > 0 || (summary.dueTodayOrders || 0) > 0 || (production.completionRate || 0) < 50) {
      return { label: "En riesgo", color: "warning", note: "Hay trabajo que puede atrasarse si no se asigna o prioriza." };
    }
    return { label: "Saludable", color: "success", note: "Sin bloqueos criticos visibles en el rango." };
  }, [summary, taskSummary, production]);

  const blockers = [
    {
      label: "OP atrasadas",
      value: summary.overdueOrders || 0,
      color: (summary.overdueOrders || 0) > 0 ? "danger" : "success",
      action: (summary.overdueOrders || 0) > 0 ? "Priorizar vencidas y ajustar carga" : "Sin vencidas",
    },
    {
      label: "Tareas atrasadas",
      value: taskSummary.overdueTasks || 0,
      color: (taskSummary.overdueTasks || 0) > 0 ? "danger" : "success",
      action: (taskSummary.overdueTasks || 0) > 0 ? "Revisar mesa y estado de cada tarea" : "Sin tareas atrasadas",
    },
    {
      label: "Sin mesa",
      value: taskSummary.unassignedTasks || 0,
      color: (taskSummary.unassignedTasks || 0) > 0 ? "warning" : "success",
      action: (taskSummary.unassignedTasks || 0) > 0 ? "Asignar antes de iniciar produccion" : "Todas asignadas",
    },
    {
      label: "Materiales pendientes",
      value: criticalOrders.filter((order) => order.materialsPending).length,
      color: criticalOrders.some((order) => order.materialsPending) ? "warning" : "success",
      action: criticalOrders.some((order) => order.materialsPending) ? "Liberar entrega de materiales" : "Sin bloqueo visible",
    },
  ];

  const traceTotals = useMemo(() => {
    const rows = trace.tasks || [];
    return {
      total: rows.length,
      pending: rows.filter((task) => task.status === "PENDING").length,
      inProgress: rows.filter((task) => task.status === "IN_PROGRESS" || task.status === "IN_QA").length,
      completed: rows.filter((task) => task.status === "COMPLETED").length,
      materialsPending: rows.filter((task) => task.requiresMaterials !== false && !task.materialsDelivered).length,
    };
  }, [trace.tasks]);

  const traceProgress = traceTotals.total > 0 ? Math.round((traceTotals.completed * 100) / traceTotals.total) : 0;
  const traceReceivedBpt = trace.order?.items?.reduce((sum, item) => sum + (Number(item.warehouseReceivedQty) || 0), 0) || 0;
  const desksWithEfficiency = desks.filter((desk) => (desk.efficiencyRate || 0) > 0);
  const avgDeskEfficiency = desksWithEfficiency.length > 0
    ? desksWithEfficiency.reduce((sum, desk) => sum + (Number(desk.efficiencyRate) || 0), 0) / desksWithEfficiency.length
    : 0;
  const riskDeskCount = desks.filter((desk) => deskHealth(desk).color !== "success").length;
  const measuredTaskRate = (taskSummary.completedTasks || 0) > 0
    ? ((production.completedTasksWithTime || 0) * 100) / taskSummary.completedTasks
    : 0;

  const productionKpis = [
    { label: "Pendientes", value: fmtN(production.pendingUnits), color: "warning", hint: "unidades por iniciar" },
    { label: "En proceso", value: fmtN(production.inProgressUnits), color: "info", hint: "mesas y QA" },
    { label: "Completadas", value: fmtN(production.completedUnits), color: "success", hint: "salida producida" },
    { label: "Desperdicio", value: fmtPct(production.wasteRate), color: (production.wasteRate || 0) > 5 ? "danger" : "secondary", hint: `${fmtN(production.wasteUnits)} uds` },
  ];

  const efficiencyKpis = [
    { label: "On-time", value: fmtPct(production.onTimeTaskRate), color: (production.onTimeTaskRate || 0) >= 80 ? "success" : "warning", hint: "vs tiempo estimado" },
    { label: "Tareas medidas", value: fmtN(production.completedTasksWithTime), color: "info", hint: `${fmtPct(measuredTaskRate)} de completadas` },
    { label: "Eficiencia mesas", value: fmtPct(avgDeskEfficiency), color: avgDeskEfficiency >= 80 ? "success" : "warning", hint: `${fmtN(desksWithEfficiency.length)} con tiempo` },
    { label: "Mesas en riesgo", value: fmtN(riskDeskCount), color: riskDeskCount > 0 ? "danger" : "success", hint: "cuellos o baja eficiencia" },
  ];

  const traceKpis = [
    { label: "Avance OP", value: trace.order ? `${traceProgress}%` : "-", color: traceProgress >= 80 ? "success" : "warning", hint: trace.order ? "tareas completadas" : "selecciona una OP" },
    { label: "Materiales", value: trace.order ? fmtN(traceTotals.materialsPending) : "-", color: traceTotals.materialsPending > 0 ? "warning" : "success", hint: "pendientes de entrega" },
    { label: "Consumos", value: trace.order ? fmtN(trace.consumptions.length) : "-", color: "info", hint: "registros kardex" },
    { label: "BPT / Envios", value: trace.order ? `${fmtN(traceReceivedBpt)} / ${fmtN(trace.shipments.length)}` : "-", color: "secondary", hint: "recibido y despachado" },
  ];

  const exportRows = useMemo(() => [
    { bloque: "Salud", indicador: "Estado", valor: globalHealth.label },
    { bloque: "Resumen", indicador: "OP activas", valor: summary.activeOrders || 0 },
    { bloque: "Resumen", indicador: "OP atrasadas", valor: summary.overdueOrders || 0 },
    { bloque: "Resumen", indicador: "Vencen hoy", valor: summary.dueTodayOrders || 0 },
    { bloque: "Produccion", indicador: "Unidades planeadas", valor: production.plannedUnits || 0 },
    { bloque: "Produccion", indicador: "Unidades pendientes", valor: production.pendingUnits || 0 },
    { bloque: "Produccion", indicador: "Unidades en proceso", valor: production.inProgressUnits || 0 },
    { bloque: "Produccion", indicador: "Unidades completadas", valor: production.completedUnits || 0 },
    { bloque: "Produccion", indicador: "Avance general", valor: fmtPct(production.completionRate) },
    { bloque: "Produccion", indicador: "Desperdicio", valor: `${fmtN(production.wasteUnits)} uds / ${fmtPct(production.wasteRate)}` },
    { bloque: "Eficiencia", indicador: "Cumplimiento on-time", valor: fmtPct(production.onTimeTaskRate) },
    { bloque: "Eficiencia", indicador: "Tareas completadas con tiempo medido", valor: production.completedTasksWithTime || 0 },
    { bloque: "Eficiencia", indicador: "Tasa de medicion de tareas", valor: fmtPct(measuredTaskRate) },
    { bloque: "Eficiencia", indicador: "Eficiencia promedio mesas", valor: fmtPct(avgDeskEfficiency) },
    { bloque: "Eficiencia", indicador: "Mesas en riesgo", valor: riskDeskCount },
    { bloque: "Tareas", indicador: "Sin mesa", valor: taskSummary.unassignedTasks || 0 },
    ...desks.map((desk) => ({
      bloque: "Mesa",
      indicador: desk.desk ? `Mesa ${desk.desk}` : "Sin mesa",
      valor: `${fmtPct(desk.completionRate)} avance / ${fmtPct(desk.efficiencyRate)} eficiencia`,
    })),
    ...criticalOrders.map((order) => ({
      bloque: "OP critica",
      indicador: order.code,
      valor: `${(order.reasons || []).join(", ")} - ${orderHealth(order).action}`,
    })),
    ...(trace.order ? [
      { bloque: "Trazabilidad", indicador: "OP seleccionada", valor: formatProductionOrderSelectLabel(trace.order) },
      { bloque: "Trazabilidad", indicador: "Avance tareas", valor: `${traceProgress}%` },
      { bloque: "Trazabilidad", indicador: "Materiales pendientes", valor: traceTotals.materialsPending },
      { bloque: "Trazabilidad", indicador: "Consumos registrados", valor: trace.consumptions.length },
      { bloque: "Trazabilidad", indicador: "Recibido Bodega PT", valor: traceReceivedBpt },
      { bloque: "Trazabilidad", indicador: "Envios cliente", valor: trace.shipments.length },
    ] : []),
  ], [globalHealth, summary, production, measuredTaskRate, avgDeskEfficiency, riskDeskCount, taskSummary, desks, criticalOrders, trace, traceProgress, traceTotals, traceReceivedBpt]);

  const exportCsv = () => {
    exportRowsToCsv("dashboard_produccion_operativo", [
      { label: "Bloque", value: "bloque" },
      { label: "Indicador", value: "indicador" },
      { label: "Valor", value: "valor" },
    ], exportRows);
  };

  const exportPdf = () => {
    exportRowsToPdf("Dashboard de Produccion Operativo", [
      { label: "Bloque", value: "bloque" },
      { label: "Indicador", value: "indicador" },
      { label: "Valor", value: "valor" },
    ], exportRows);
  };

  if (loading) {
    return (
      <div className="content">
        <div className="text-center py-5">
          <Spinner color="primary" />
          <p className="mt-2">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content">
        <Alert color="danger">{error}</Alert>
        <Button color="primary" onClick={() => loadDashboard(dateFrom || undefined, dateTo || undefined)}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="content">
      <Card style={CARD_STYLE}>
        <CardHeader>
          <Row className="align-items-end">
            <Col lg="5">
              <CardTitle tag="h4" className="mb-1">Dashboard de Produccion</CardTitle>
              <div className="text-muted" style={{ fontSize: 13 }}>
                Vista ejecutiva y operativa. Referencia: {fmtDate(dashboard?.referenceDate)}
              </div>
            </Col>
            <Col md="2">
              <Label className="mb-1">Desde</Label>
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </Col>
            <Col md="2">
              <Label className="mb-1">Hasta</Label>
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </Col>
            <Col lg="3" className="text-right">
              <Button color="primary" className="mr-2" onClick={() => loadDashboard(dateFrom || undefined, dateTo || undefined)}>
                Aplicar
              </Button>
              <Button color="secondary" className="mr-2" onClick={() => {
                setDateFrom("");
                setDateTo("");
                loadDashboard();
              }}>
                Limpiar
              </Button>
              <Button color="secondary" onClick={exportCsv}>CSV</Button>
            </Col>
          </Row>
        </CardHeader>
        <CardBody className="pt-0">
          <Row className="align-items-center">
            <Col md="5">
              <Badge color={globalHealth.color} style={{ fontSize: 13 }} className="mr-2">
                Salud: {globalHealth.label}
              </Badge>
              <span className="text-muted" style={{ fontSize: 13 }}>{globalHealth.note}</span>
            </Col>
            <Col md="7" className="text-right">
              {ACTIONS.map((action) => (
                <Button key={action.path} color={action.color} size="sm" className="ml-2 mt-2" onClick={() => navigate(action.path)}>
                  {action.label}
                </Button>
              ))}
              <Button color="secondary" size="sm" className="ml-2 mt-2" onClick={exportPdf}>PDF</Button>
            </Col>
          </Row>
        </CardBody>
      </Card>

      <Row style={SECTION_ROW_STYLE}>
        <Col md="3">
          <ScoreCard
            title="Avance general"
            value={fmtPct(production.completionRate)}
            subtitle={`${fmtN(production.completedUnits)} de ${fmtN(production.plannedUnits)} unidades`}
            color={globalHealth.color}
            progress={production.completionRate}
            note={(production.completionRate || 0) >= 80 ? "Ritmo saludable para el rango." : "Revisar OP criticas y mesas con baja carga terminada."}
          />
        </Col>
        <Col md="3">
          <ScoreCard
            title="OP atrasadas"
            value={fmtN(summary.overdueOrders)}
            subtitle={`${fmtN(summary.dueTodayOrders)} vencen hoy - ${fmtN(summary.dueTomorrowOrders)} manana`}
            color={(summary.overdueOrders || 0) > 0 ? "danger" : "success"}
            note={(summary.overdueOrders || 0) > 0 ? "Atender primero las vencidas." : "Sin OP vencidas visibles."}
          />
        </Col>
        <Col md="3">
          <ScoreCard
            title="Trabajo en proceso"
            value={fmtN(production.inProgressUnits)}
            subtitle={`${fmtN(production.pendingUnits)} unidades pendientes`}
            color="info"
            note="Carga viva en mesas y QA."
          />
        </Col>
        <Col md="3">
          <ScoreCard
            title="Cumplimiento"
            value={fmtPct(production.onTimeTaskRate)}
            subtitle={`${fmtN(production.wasteUnits)} desperdicio - ${fmtPct(production.wasteRate)}`}
            color={(production.onTimeTaskRate || 0) >= 80 ? "success" : "warning"}
            progress={production.onTimeTaskRate}
            note="Tareas completadas contra su tiempo estimado."
          />
        </Col>
      </Row>

      <Row style={SECTION_ROW_STYLE}>
        <KpiGroup
          title="Produccion"
          subtitle="Volumen real por etapa del rango."
          items={productionKpis}
        />
        <KpiGroup
          title="Eficiencia"
          subtitle="Tiempo, cumplimiento y salud de mesas."
          items={efficiencyKpis}
        />
        <KpiGroup
          title="Trazabilidad"
          subtitle="Lectura rapida de la OP seleccionada."
          items={traceKpis}
        />
      </Row>

      <Row style={SECTION_ROW_STYLE}>
        <Col lg="4">
          <Card style={CARD_STYLE}>
            <CardHeader>
              <CardTitle tag="h5" className="mb-0">Atencion inmediata</CardTitle>
              <small className="text-muted">Bloqueos que cambian prioridades del dia.</small>
            </CardHeader>
            <CardBody>
              {blockers.map((item) => (
                <div key={item.label} style={{ borderBottom: "1px solid #edf2f7", padding: "10px 0" }}>
                  <div className="d-flex justify-content-between align-items-center">
                    <strong>{item.label}</strong>
                    <Badge color={item.color} pill>{fmtN(item.value)}</Badge>
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{item.action}</div>
                </div>
              ))}
            </CardBody>
          </Card>
        </Col>
        <Col lg="8">
          <Card style={CARD_STYLE}>
            <CardHeader>
              <CardTitle tag="h5" className="mb-0">Mesas y cuellos de botella</CardTitle>
              <small className="text-muted">Carga, avance y eficiencia por mesa.</small>
            </CardHeader>
            <CardBody>
              {desks.length === 0 ? (
                <Alert color="light" className="mb-0">No hay tareas por mesa en el rango seleccionado.</Alert>
              ) : (
                <Table responsive hover size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>Mesa</th>
                      <th>Salud</th>
                      <th>Trabajo</th>
                      <th>Avance</th>
                      <th className="text-right">Eficiencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desks.map((desk) => {
                      const health = deskHealth(desk);
                      const activeTasks = (desk.pendingTasks || 0) + (desk.inProgressTasks || 0);
                      return (
                        <tr key={`desk-${desk.desk || "none"}`}>
                          <td><strong>{desk.desk ? `Mesa ${desk.desk}` : "Sin mesa"}</strong></td>
                          <td>
                            <Badge color={health.color}>{health.label}</Badge>
                            <div className="text-muted" style={{ fontSize: 11 }}>{health.action}</div>
                          </td>
                          <td>{fmtN(activeTasks)} activas - {fmtN(desk.completedTasks)} completadas</td>
                          <td style={{ minWidth: 160 }}>
                            <Progress value={clamp(desk.completionRate)} color={health.color} />
                            <small>{fmtPct(desk.completionRate)}</small>
                          </td>
                          <td className="text-right">{fmtPct(desk.efficiencyRate)}</td>
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

      <Row style={SECTION_ROW_STYLE}>
        <Col lg="12">
          <Card style={CARD_STYLE}>
            <CardHeader>
              <CardTitle tag="h5" className="mb-0">OP criticas</CardTitle>
              <small className="text-muted">Top de ordenes que requieren decision o seguimiento.</small>
            </CardHeader>
            <CardBody>
              {criticalOrders.length === 0 ? (
                <Alert color="success" className="mb-0">No hay OP criticas en el rango seleccionado.</Alert>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {criticalOrders.slice(0, 10).map((order) => {
                    const health = orderHealth(order);
                    const selected = Number(selectedOrderId) === Number(order.id);
                    return (
                      <div key={order.id || order.code} style={{
                        border: selected ? "2px solid #51cbce" : "1px solid #e9ecef",
                        borderRadius: 10,
                        padding: 12,
                        background: selected ? "#f0fdff" : "#fff",
                      }}>
                        <Row className="align-items-center">
                          <Col md="4">
                            <strong>{order.code}</strong>
                            <div className="text-muted" style={{ fontSize: 12 }}>{statusLabel(order.status)} - Entrega {fmtDate(order.deliveryDate)}</div>
                          </Col>
                          <Col md="3">
                            <Badge color={health.color}>{health.label}</Badge>
                            <div className="text-muted" style={{ fontSize: 11 }}>{(order.reasons || []).join(", ")}</div>
                          </Col>
                          <Col md="3">
                            <Progress value={clamp(order.completionRate)} color={health.color} />
                            <small>{fmtPct(order.completionRate)} - {fmtN(order.completedUnits)}/{fmtN(order.plannedUnits)} uds</small>
                          </Col>
                          <Col md="2" className="text-right">
                            <Button color="info" size="sm" onClick={() => setSelectedOrderId(String(order.id))}>Trazar</Button>
                          </Col>
                        </Row>
                        <div className="text-muted mt-2" style={{ fontSize: 12 }}>Accion sugerida: <strong>{health.action}</strong></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Card style={CARD_STYLE}>
        <CardHeader>
          <Row className="align-items-end">
            <Col lg="5">
              <CardTitle tag="h5" className="mb-0">Trazabilidad por OP</CardTitle>
              <small className="text-muted">Selecciona una OP para ver tareas, materiales y envios.</small>
            </Col>
            <Col lg="4">
              <Label className="mb-1">Buscar OP</Label>
              <Input type="search" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="Codigo, cliente o tipo..." />
            </Col>
            <Col lg="3">
              <Label className="mb-1">OP</Label>
              <Input type="select" value={selectedOrderId || ""} onChange={(event) => setSelectedOrderId(event.target.value)}>
                <option value="">Seleccionar OP...</option>
                {filteredOrders.map((order) => (
                  <option key={order.id} value={order.id}>{formatProductionOrderSelectLabel(order)}</option>
                ))}
              </Input>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {traceError && <Alert color="danger">{traceError}</Alert>}
          {loadingTrace ? (
            <div className="text-center py-4"><Spinner color="primary" /></div>
          ) : !trace.order ? (
            <Alert color="light" className="mb-0">Selecciona una OP para ver su trazabilidad.</Alert>
          ) : (
            <>
              <Row className="mb-3">
                <Col md="4">
                  <h5 className="mb-1">{formatProductionOrderCodeDate(trace.order)}</h5>
                  <div className="text-muted" style={{ fontSize: 13 }}>{trace.order.orderType || "-"} - {trace.order.customerName || "Sin cliente"} - Entrega {fmtDate(trace.order.deliveryDate)}</div>
                </Col>
                <Col md="2"><strong>{statusLabel(trace.order.status)}</strong><div className="text-muted">Estado OP</div></Col>
                <Col md="2"><strong>{traceProgress}%</strong><div className="text-muted">Avance tareas</div></Col>
                <Col md="2"><strong>{fmtN(traceTotals.materialsPending)}</strong><div className="text-muted">Materiales pendientes</div></Col>
                <Col md="2" className="text-right">
                  <Button color="primary" size="sm" onClick={() => navigate(`/admin/tasks-by-station?orderId=${trace.order.id}`)}>Ir a centro</Button>
                </Col>
              </Row>
              <Progress value={traceProgress} color={traceProgress >= 80 ? "success" : "warning"} className="mb-3" />
              <Row>
                <Col lg="6">
                  <h6>Tareas</h6>
                  {trace.tasks.length === 0 ? (
                    <Alert color="light">Esta OP no tiene tareas.</Alert>
                  ) : (
                    <Table responsive size="sm">
                      <thead><tr><th>Tarea</th><th>Flujo</th><th>Mesa</th><th>Estado</th></tr></thead>
                      <tbody>
                        {trace.tasks.slice(0, 8).map((task) => (
                          <tr key={task.id}>
                            <td><strong>{task.code}</strong></td>
                            <td>{workflowLabel(task.workflowStatus)}</td>
                            <td>{task.desk || "-"}</td>
                            <td><Badge color={task.status === "COMPLETED" ? "success" : task.status === "IN_PROGRESS" ? "info" : "warning"}>{statusLabel(task.status)}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </Col>
                <Col lg="3">
                  <h6>Materiales</h6>
                  <div style={{ border: "1px solid #e9ecef", borderRadius: 8, padding: 12 }}>
                    <div className="d-flex justify-content-between"><span>Consumos</span><strong>{fmtN(trace.consumptions.length)}</strong></div>
                    <div className="d-flex justify-content-between"><span>Pendientes</span><strong>{fmtN(traceTotals.materialsPending)}</strong></div>
                    <div className="text-muted mt-2" style={{ fontSize: 12 }}>Si hay pendientes, revisar Entrega de Materiales antes de avanzar mesa.</div>
                  </div>
                </Col>
                <Col lg="3">
                  <h6>Envios / Recepcion</h6>
                  <div style={{ border: "1px solid #e9ecef", borderRadius: 8, padding: 12 }}>
                    <div className="d-flex justify-content-between"><span>Envios cliente</span><strong>{fmtN(trace.shipments.length)}</strong></div>
                    <div className="d-flex justify-content-between">
                      <span>Recibido BPT</span>
                      <strong>{fmtN(trace.order.items?.reduce((sum, item) => sum + (Number(item.warehouseReceivedQty) || 0), 0))}</strong>
                    </div>
                    <div className="text-muted mt-2" style={{ fontSize: 12 }}>Bodega PT confirma recepcion y despacho final al cliente.</div>
                  </div>
                </Col>
              </Row>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default ProductionDashboard;