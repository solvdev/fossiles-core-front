import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, CardTitle,
  Col, Input, Label, Nav, NavItem, NavLink, Progress, Row, Spinner, Table,
} from "reactstrap";
import {
  getConsumptionHistory,
  getCustomerShipments,
  getLeatherDemand,
  getProductionDashboardV2,
  getProductionOrderById,
  getProductionOrdersPage,
} from "services/productionOrderService";
import { getTasksByProductionOrder } from "services/taskService";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { formatProductionOrderCodeDate, formatProductionOrderSelectLabel } from "utils/productionOrderDisplayHelper";
import { buildLeatherView, fmtFt2, swatchFor } from "utils/leatherDemandReport";
import LeatherDemandPanel from "./LeatherDemandPanel";
import OrderProgressPanel from "./OrderProgressPanel";

const ACTIONS = [
  { label: "OPs", path: "/admin/production-orders", color: "primary" },
  { label: "Centro", path: "/admin/tasks-by-station", color: "info" },
  { label: "Cinchos", path: "/admin/cinchos-production", color: "dark" },
  { label: "Materiales", path: "/admin/materials-tasks", color: "warning" },
  { label: "Bodega PT", path: "/admin/warehouse-view", color: "secondary" },
];

/** Corte post-saneamiento KPI: misma base de eficiencia que el backend. */
const KPI_EFFICIENCY_FROM = "2026-09-14";

const CARD_STYLE = { marginBottom: 18, borderRadius: 12 };
const KPI_CARD_STYLE = { ...CARD_STYLE, height: "calc(100% - 18px)" };
const SECTION_ROW_STYLE = { marginBottom: 0 };
const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "avance", label: "Avance por orden" },
  { key: "cuero", label: "Cuero por color" },
];

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

function KpiGroup({ title, subtitle, items, lg = "4" }) {
  return (
    <Col lg={lg}>
      <Card style={KPI_CARD_STYLE}>
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

/** Resumen corto del cuero que falta; el detalle está en la pestaña «Cuero por color». */
function LeatherSummaryCard({ data, loading, error, onOpen }) {
  const view = useMemo(() => buildLeatherView(data), [data]);
  const top = view.colors.slice(0, 5);
  const maxFt2 = top[0]?.pendingFt2 || 1;
  return (
    <Col lg="4">
      <Card style={KPI_CARD_STYLE}>
        <CardHeader>
          <CardTitle tag="h5" className="mb-0">Cuero que falta entregar</CardTitle>
          <small className="text-muted">OP activas, por color.</small>
        </CardHeader>
        <CardBody>
          {loading && !data ? (
            <div className="text-center py-3"><Spinner size="sm" color="primary" /></div>
          ) : error && !data ? (
            <Alert color="danger" className="mb-0" style={{ fontSize: 13 }}>{error}</Alert>
          ) : (
            <>
              <div className="d-flex align-items-baseline justify-content-between">
                <div style={{ fontSize: 28, fontWeight: 800, color: "#b45309" }}>
                  {fmtFt2(view.totals.pendingFt2)} <span style={{ fontSize: 13, fontWeight: 600 }}>pies²</span>
                </div>
                {view.totals.shortageFt2 > 0 ? (
                  <Badge color="danger">Comprar {fmtFt2(view.totals.shortageFt2)}</Badge>
                ) : (
                  <Badge color="success">Bodega alcanza</Badge>
                )}
              </div>
              <div className="mt-2">
                {top.map((c) => (
                  <div key={c.key} style={{ marginBottom: 6 }}>
                    <div className="d-flex justify-content-between" style={{ fontSize: 12 }}>
                      <span>
                        <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: swatchFor(c.colorName), border: "1px solid rgba(0,0,0,.2)", marginRight: 6 }} />
                        {c.colorName}
                      </span>
                      <strong>{fmtFt2(c.pendingFt2)}</strong>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: "#f3f4f6" }}>
                      <div style={{ width: `${Math.max(3, (c.pendingFt2 * 100) / maxFt2)}%`, height: "100%", borderRadius: 3, background: c.shortageFt2 > 0 ? "#ef4444" : "#f59e0b" }} />
                    </div>
                  </div>
                ))}
              </div>
              <Button color="primary" size="sm" block className="mt-3" onClick={onOpen}>
                Ver cuero por color y por orden
              </Button>
            </>
          )}
        </CardBody>
      </Card>
    </Col>
  );
}

function ProductionDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === searchParams.get("tab")) ? searchParams.get("tab") : "resumen";
  const setTab = (key) => setSearchParams(key === "resumen" ? {} : { tab: key }, { replace: true });
  const [dashboard, setDashboard] = useState(null);
  const [orders, setOrders] = useState([]);
  const [leather, setLeather] = useState(null);
  const [leatherLoading, setLeatherLoading] = useState(true);
  const [leatherError, setLeatherError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [error, setError] = useState("");
  const [traceError, setTraceError] = useState("");
  const [dateFrom, setDateFrom] = useState(KPI_EFFICIENCY_FROM);
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
      const data = await getProductionDashboardV2(from || KPI_EFFICIENCY_FROM, to);
      setDashboard(data);
      if (!selectedOrderId && data?.criticalOrders?.[0]?.id) {
        setSelectedOrderId(String(data.criticalOrders[0].id));
      }
    } catch (err) {
      setError(err.message || "Error al cargar dashboard de produccion");
    } finally {
      setLoading(false);
    }
  };

  const loadLeather = async () => {
    try {
      setLeatherLoading(true);
      setLeatherError("");
      setLeather(await getLeatherDemand());
    } catch (err) {
      setLeatherError(err.message || "No se pudo calcular el cuero");
    } finally {
      setLeatherLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard(KPI_EFFICIENCY_FROM);
    loadLeather();
  }, []);

  // Selector de trazabilidad: búsqueda en el servidor (antes bajaba todas las OP).
  useEffect(() => {
    const controller = new AbortController();
    const handle = setTimeout(() => {
      getProductionOrdersPage({ process: "ACTIVE", search: orderSearch.trim(), size: 25, signal: controller.signal })
        .then((page) => setOrders(page?.content || []))
        .catch(() => {});
    }, orderSearch ? 300 : 0);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [orderSearch]);

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
    // La OP elegida siempre en la lista, aunque no salga en la búsqueda.
    if (!trace.order || orders.some((order) => Number(order.id) === Number(trace.order.id))) return orders;
    return [trace.order, ...orders];
  }, [orders, trace.order]);

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
  // Solo mesas numeradas con medición (efficiency > 0).
  const desksWithEfficiency = desks.filter(
    (desk) => Number(desk?.desk) > 0 && (desk.efficiencyRate || 0) > 0
  );
  const avgDeskEfficiency = desksWithEfficiency.length > 0
    ? desksWithEfficiency.reduce((sum, desk) => sum + (Number(desk.efficiencyRate) || 0), 0) / desksWithEfficiency.length
    : 0;
  const riskDeskCount = desks.filter((desk) => deskHealth(desk).color !== "success").length;
  const measuredTaskRate = (taskSummary.completedTasks || 0) > 0
    ? ((production.completedTasksWithTime || 0) * 100) / taskSummary.completedTasks
    : 0;

  const efficiencyKpis = [
    { label: "On-time", value: fmtPct(production.onTimeTaskRate), color: (production.onTimeTaskRate || 0) >= 80 ? "success" : "warning", hint: "vs tiempo estimado" },
    { label: "Tareas medidas", value: fmtN(production.completedTasksWithTime), color: "info", hint: `${fmtPct(measuredTaskRate)} de completadas` },
    { label: "Eficiencia mesas", value: fmtPct(avgDeskEfficiency), color: avgDeskEfficiency >= 80 ? "success" : "warning", hint: `${fmtN(desksWithEfficiency.length)} con tiempo` },
    { label: "Mesas en riesgo", value: fmtN(riskDeskCount), color: riskDeskCount > 0 ? "danger" : "success", hint: "cuellos o baja eficiencia" },
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

  const resumenBody = loading ? (
    <div className="text-center py-5">
      <Spinner color="primary" />
      <p className="mt-2">Cargando indicadores...</p>
    </div>
  ) : error ? (
    <Alert color="danger">
      {error}
      <Button color="danger" outline size="sm" className="ml-2" onClick={() => loadDashboard(dateFrom || undefined, dateTo || undefined)}>
        Reintentar
      </Button>
    </Alert>
  ) : (
    <>
      <Row style={SECTION_ROW_STYLE}>
        <Col lg="3" sm="6">
          <ScoreCard
            title="Avance general"
            value={fmtPct(production.completionRate)}
            subtitle={`${fmtN(production.completedUnits)} de ${fmtN(production.plannedUnits)} piezas`}
            color={globalHealth.color}
            progress={production.completionRate}
          />
        </Col>
        <Col lg="3" sm="6">
          <ScoreCard
            title="OP atrasadas"
            value={fmtN(summary.overdueOrders)}
            subtitle={`${fmtN(summary.dueTodayOrders)} vencen hoy · ${fmtN(summary.dueTomorrowOrders)} mañana`}
            color={(summary.overdueOrders || 0) > 0 ? "danger" : "success"}
            note={(summary.overdueOrders || 0) > 0 ? "Atender primero las vencidas." : "Sin OP vencidas."}
          />
        </Col>
        <Col lg="3" sm="6">
          <ScoreCard
            title="En proceso"
            value={fmtN(production.inProgressUnits)}
            subtitle={`${fmtN(production.pendingUnits)} piezas por iniciar`}
            color="info"
            note="Carga viva en mesas y QA."
          />
        </Col>
        <Col lg="3" sm="6">
          <ScoreCard
            title="Cumplimiento"
            value={fmtPct(production.onTimeTaskRate)}
            subtitle={`Desperdicio ${fmtN(production.wasteUnits)} pzas · ${fmtPct(production.wasteRate)}`}
            color={(production.onTimeTaskRate || 0) >= 80 ? "success" : "warning"}
            progress={production.onTimeTaskRate}
          />
        </Col>
      </Row>

      <Row style={SECTION_ROW_STYLE}>
        <Col lg="4">
          <Card style={KPI_CARD_STYLE}>
            <CardHeader>
              <CardTitle tag="h5" className="mb-0">Atención inmediata</CardTitle>
              <small className="text-muted">Lo que cambia las prioridades del día.</small>
            </CardHeader>
            <CardBody>
              {blockers.map((item) => (
                <div key={item.label} style={{ borderBottom: "1px solid #edf2f7", padding: "8px 0" }}>
                  <div className="d-flex justify-content-between align-items-center">
                    <strong>{item.label}</strong>
                    <Badge color={item.color} pill style={{ fontSize: 13 }}>{fmtN(item.value)}</Badge>
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{item.action}</div>
                </div>
              ))}
            </CardBody>
          </Card>
        </Col>
        <LeatherSummaryCard data={leather} loading={leatherLoading} error={leatherError} onOpen={() => setTab("cuero")} />
        <KpiGroup title="Eficiencia" subtitle="Tiempo, cumplimiento y mesas." items={efficiencyKpis} />
      </Row>

      <Row style={SECTION_ROW_STYLE}>
        <Col lg="7">
          <Card style={KPI_CARD_STYLE}>
            <CardHeader>
              <CardTitle tag="h5" className="mb-0">OP críticas</CardTitle>
              <small className="text-muted">Órdenes que requieren decisión o seguimiento.</small>
            </CardHeader>
            <CardBody>
              {criticalOrders.length === 0 ? (
                <Alert color="success" className="mb-0">No hay OP críticas en el rango.</Alert>
              ) : (
                <Table responsive hover size="sm" className="mb-0">
                  <thead>
                    <tr style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280" }}>
                      <th>OP</th><th>Motivo</th><th style={{ minWidth: 130 }}>Avance</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {criticalOrders.slice(0, 10).map((order) => {
                      const health = orderHealth(order);
                      const selected = Number(selectedOrderId) === Number(order.id);
                      return (
                        <tr key={order.id || order.code} style={{ background: selected ? "#f0fdff" : undefined }}>
                          <td>
                            <strong>{order.code}</strong>
                            <div className="text-muted" style={{ fontSize: 11 }}>{statusLabel(order.status)} · Entrega {fmtDate(order.deliveryDate)}</div>
                          </td>
                          <td>
                            <Badge color={health.color}>{health.label}</Badge>
                            <div className="text-muted" style={{ fontSize: 11 }}>{health.action}</div>
                          </td>
                          <td>
                            <Progress value={clamp(order.completionRate)} color={health.color} style={{ height: 8 }} />
                            <small>{fmtN(order.completedUnits)}/{fmtN(order.plannedUnits)} pzas · {fmtPct(order.completionRate)}</small>
                          </td>
                          <td className="text-right">
                            <Button color="info" size="sm" outline className="my-0" onClick={() => setSelectedOrderId(String(order.id))}>Trazar</Button>
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
        <Col lg="5">
          <Card style={KPI_CARD_STYLE}>
            <CardHeader>
              <CardTitle tag="h5" className="mb-0">Mesas</CardTitle>
              <small className="text-muted">Carga, avance y eficiencia por mesa.</small>
            </CardHeader>
            <CardBody>
              {desks.length === 0 ? (
                <Alert color="light" className="mb-0">No hay tareas por mesa en el rango.</Alert>
              ) : (
                <Table responsive hover size="sm" className="mb-0">
                  <thead>
                    <tr style={{ fontSize: 11, textTransform: "uppercase", color: "#6b7280" }}>
                      <th>Mesa</th><th>Trabajo</th><th style={{ minWidth: 110 }}>Avance</th><th className="text-right">Efic.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {desks.map((desk) => {
                      const health = deskHealth(desk);
                      const activeTasks = (desk.pendingTasks || 0) + (desk.inProgressTasks || 0);
                      return (
                        <tr key={`desk-${desk.desk || "none"}`} title={health.action}>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <strong>{desk.desk ? `Mesa ${desk.desk}` : "Sin mesa"}</strong>
                            <div><Badge color={health.color} style={{ fontSize: 10 }}>{health.label}</Badge></div>
                          </td>
                          <td style={{ fontSize: 12 }}>{fmtN(activeTasks)} activas<br />{fmtN(desk.completedTasks)} hechas</td>
                          <td>
                            <Progress value={clamp(desk.completionRate)} color={health.color} style={{ height: 8 }} />
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
    </>
  );

  return (
    <div className="content">
      <Card style={CARD_STYLE}>
        <CardBody style={{ paddingBottom: 0 }}>
          <Row className="align-items-center">
            <Col lg="6" className="mb-2">
              <div className="d-flex align-items-center flex-wrap" style={{ gap: 10 }}>
                <h4 className="mb-0" style={{ fontWeight: 700 }}>Producción</h4>
                {!loading && !error && (
                  <Badge color={globalHealth.color} style={{ fontSize: 12 }} title={globalHealth.note}>
                    {globalHealth.label}
                  </Badge>
                )}
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {!loading && !error ? globalHealth.note : "Cargando…"} Referencia {fmtDate(dashboard?.referenceDate)}.
              </div>
            </Col>
            <Col lg="6" className="mb-2 text-lg-right">
              <span className="text-muted mr-1" style={{ fontSize: 12 }}>Ir a:</span>
              {ACTIONS.map((action) => (
                <Button key={action.path} color="link" size="sm" className="px-2 my-0" onClick={() => navigate(action.path)}>
                  {action.label}
                </Button>
              ))}
            </Col>
          </Row>
          <div className="d-flex justify-content-between align-items-end flex-wrap" style={{ gap: 8 }}>
            <Nav tabs style={{ borderBottom: 0 }}>
              {TABS.map((t) => (
                <NavItem key={t.key}>
                  <NavLink
                    href="#"
                    active={tab === t.key}
                    onClick={(e) => { e.preventDefault(); setTab(t.key); }}
                    style={{ fontWeight: tab === t.key ? 700 : 500, cursor: "pointer" }}
                  >
                    {t.label}
                    {t.key === "cuero" && leather?.totals && (
                      <Badge color="warning" pill className="ml-2">{fmtFt2(leather.totals.pendingFt2)} pies²</Badge>
                    )}
                  </NavLink>
                </NavItem>
              ))}
            </Nav>
            {tab === "resumen" && (
              <div className="d-flex align-items-end flex-wrap pb-2" style={{ gap: 6 }}>
                <div>
                  <Label className="mb-0" style={{ fontSize: 11 }}>Desde</Label>
                  <Input bsSize="sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                </div>
                <div>
                  <Label className="mb-0" style={{ fontSize: 11 }}>Hasta</Label>
                  <Input bsSize="sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                </div>
                <Button color="primary" size="sm" className="my-0" onClick={() => loadDashboard(dateFrom || undefined, dateTo || undefined)}>
                  Aplicar
                </Button>
                <Button color="secondary" outline size="sm" className="my-0" onClick={() => {
                  setDateFrom(KPI_EFFICIENCY_FROM);
                  setDateTo("");
                  loadDashboard(KPI_EFFICIENCY_FROM);
                }}>
                  Limpiar
                </Button>
                <Button color="secondary" outline size="sm" className="my-0" onClick={exportCsv} disabled={loading || !!error}>CSV</Button>
                <Button color="secondary" outline size="sm" className="my-0" onClick={exportPdf} disabled={loading || !!error}>PDF</Button>
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {tab === "resumen" && resumenBody}
      {tab === "avance" && <OrderProgressPanel />}
      {tab === "cuero" && (
        <LeatherDemandPanel data={leather} loading={leatherLoading} error={leatherError} onReload={loadLeather} />
      )}
    </div>
  );
}

export default ProductionDashboard;
