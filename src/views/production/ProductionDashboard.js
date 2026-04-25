import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bar } from "react-chartjs-2";
import {
  Card, CardHeader, CardBody, CardTitle, Row, Col,
  Progress, Alert, Input, Label, Button,
} from "reactstrap";
import { getDashboardStats, getProductionOrders } from "services/productionOrderService";
import { getTasks } from "services/taskService";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";

const BURNED_KPIS = {
  avgTaskDurationMinutes: 180,
  onTimeTaskRate: 80,
  orderCompletionRate: 85,
};

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { ticks: { color: "#9f9f9f", beginAtZero: true }, grid: { display: true, color: "#eee" } },
    x: { grid: { display: false }, ticks: { color: "#9f9f9f" } },
  },
};

function ProductionDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [historyDeskFilter, setHistoryDeskFilter] = useState("ALL");
  const [productStageSearch, setProductStageSearch] = useState("");

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async (from, to) => {
    try {
      setLoading(true);
      setError(null);
      const [data, tasksData, ordersData] = await Promise.all([
        getDashboardStats(from, to),
        getTasks(),
        getProductionOrders(),
      ]);
      setStats(data);
      setTasks(tasksData || []);
      setOrders(ordersData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getTaskDate = (task) => {
    if (task?.scheduledDate) return String(task.scheduledDate);
    if (task?.completedAt) return String(task.completedAt).slice(0, 10);
    if (task?.createdAt) return String(task.createdAt).slice(0, 10);
    return "";
  };

  const inRange = (dateValue, from, to) => {
    if (!dateValue) return true;
    if (from && dateValue < from) return false;
    if (to && dateValue > to) return false;
    return true;
  };

  const deskMetrics = (() => {
    const byDesk = {};
    (tasks || []).forEach((task) => {
      const desk = Number(task?.desk);
      if (!desk || desk <= 0) return;
      const taskDate = getTaskDate(task);
      if (!inRange(taskDate, dateFrom, dateTo)) return;
      if (!byDesk[desk]) {
        byDesk[desk] = {
          desk,
          total: 0,
          pending: 0,
          inProgress: 0,
          completed: 0,
          estimatedSum: 0,
          estimatedCount: 0,
          actualSum: 0,
          actualCount: 0,
        };
      }
      const row = byDesk[desk];
      row.total += 1;
      if (task.status === "PENDING") row.pending += 1;
      if (task.status === "IN_PROGRESS") row.inProgress += 1;
      if (task.status === "COMPLETED") row.completed += 1;
      if (task.estimatedHours != null) {
        const estMin = Number(task.estimatedHours) * 60;
        if (Number.isFinite(estMin) && estMin > 0) {
          row.estimatedSum += estMin;
          row.estimatedCount += 1;
        }
      }
      const actMin = Number(task.actualDurationMinutes);
      if (Number.isFinite(actMin) && actMin > 0) {
        row.actualSum += actMin;
        row.actualCount += 1;
      }
    });

    return Object.values(byDesk)
      .map((row) => ({
        ...row,
        completionRate: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
        efficiencyRate:
          row.actualSum > 0 && row.estimatedSum > 0
            ? Math.round((row.estimatedSum / row.actualSum) * 100)
            : 0,
        avgEstimatedMinutes: row.estimatedCount > 0 ? Math.round(row.estimatedSum / row.estimatedCount) : 0,
        avgActualMinutes: row.actualCount > 0 ? Math.round(row.actualSum / row.actualCount) : 0,
      }))
      .sort((a, b) => a.desk - b.desk);
  })();

  const getDeskHealth = (row) => {
    if (!row || row.total === 0) return { label: "Sin datos", color: "secondary" };
    const completion = Number(row.completionRate || 0);
    const efficiency = Number(row.efficiencyRate || 0);
    if (completion >= 80 && efficiency >= 90) return { label: "Bien", color: "success" };
    if (completion >= 60 && efficiency >= 75) return { label: "Regular", color: "warning" };
    return { label: "Mal", color: "danger" };
  };

  const historicalDeskMetrics = (() => {
    const grouped = {};
    (tasks || []).forEach((task) => {
      const desk = Number(task?.desk);
      if (!desk || desk <= 0) return;
      if (historyDeskFilter !== "ALL" && desk !== Number(historyDeskFilter)) return;
      const dateValue = getTaskDate(task);
      if (!dateValue) return;
      if (!inRange(dateValue, dateFrom, dateTo)) return;
      const monthKey = dateValue.slice(0, 7);
      const key = `${monthKey}-${desk}`;
      if (!grouped[key]) {
        grouped[key] = {
          monthKey,
          desk,
          estimatedSum: 0,
          estimatedCount: 0,
          actualSum: 0,
          actualCount: 0,
          completed: 0,
          total: 0,
        };
      }
      const row = grouped[key];
      row.total += 1;
      if (task.status === "COMPLETED") row.completed += 1;
      if (task.estimatedHours != null) {
        const estMin = Number(task.estimatedHours) * 60;
        if (Number.isFinite(estMin) && estMin > 0) {
          row.estimatedSum += estMin;
          row.estimatedCount += 1;
        }
      }
      const actMin = Number(task.actualDurationMinutes);
      if (Number.isFinite(actMin) && actMin > 0) {
        row.actualSum += actMin;
        row.actualCount += 1;
      }
    });

    return Object.values(grouped)
      .map((row) => ({
        ...row,
        label: `${row.monthKey} · M${row.desk}`,
        avgEstimatedMinutes: row.estimatedCount > 0 ? Math.round(row.estimatedSum / row.estimatedCount) : 0,
        avgActualMinutes: row.actualCount > 0 ? Math.round(row.actualSum / row.actualCount) : 0,
        efficiencyRate:
          row.actualSum > 0 && row.estimatedSum > 0
            ? Math.round((row.estimatedSum / row.actualSum) * 100)
            : 0,
        completionRate: row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
      }))
      .sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey)) || a.desk - b.desk)
      .slice(-12);
  })();

  const historicalDeskChart = {
    labels: historicalDeskMetrics.map((r) => r.label),
    datasets: [
      {
        label: "Eficiencia (%)",
        data: historicalDeskMetrics.map((r) => r.efficiencyRate),
        backgroundColor: "#17a2b8",
        borderColor: "#17a2b8",
        borderWidth: 1,
      },
      {
        label: "Cumplimiento (%)",
        data: historicalDeskMetrics.map((r) => r.completionRate),
        backgroundColor: "#28a745",
        borderColor: "#28a745",
        borderWidth: 1,
      },
      {
        label: "Prom. Real (min)",
        data: historicalDeskMetrics.map((r) => r.avgActualMinutes),
        backgroundColor: "#ffc107",
        borderColor: "#ffc107",
        borderWidth: 1,
      },
    ],
  };

  const now = new Date();
  const weekStart = getWeekStart(now);
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const weeklyQuantityProduced = (tasks || [])
    .filter(t => t.status === "COMPLETED" && t.completedAt && new Date(t.completedAt) >= weekStart)
    .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

  const monthlyQuantityProduced = (tasks || [])
    .filter(t => {
      if (t.status !== "COMPLETED" || !t.completedAt) return false;
      const d = new Date(t.completedAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    })
    .reduce((sum, t) => sum + (Number(t.quantity) || 0), 0);

  const productStageStats = (() => {
    const byProduct = {};
    (orders || []).forEach(order => {
      const status = order.status || "UNKNOWN";
      (order.items || []).forEach(item => {
        const name = item.productName || "Sin producto";
        let qty = 0;
        if (item.sizes && typeof item.sizes === "object") {
          qty = Object.values(item.sizes).reduce((s, v) => s + (Number(v) || 0), 0);
        } else {
          qty = Number(item.quantity) || 0;
        }
        if (!byProduct[name]) {
          byProduct[name] = { product: name, pendingQty: 0, inProgressQty: 0, completedQty: 0, totalQty: 0 };
        }
        byProduct[name].totalQty += qty;
        if (status === "PENDING") byProduct[name].pendingQty += qty;
        else if (status === "IN_PROGRESS" || status === "IN_QA") byProduct[name].inProgressQty += qty;
        else if (status === "COMPLETED") byProduct[name].completedQty += qty;
      });
    });
    return Object.values(byProduct).sort((a, b) => b.totalQty - a.totalQty);
  })();

  const summaryRows = [
    { indicator: "Total Órdenes", value: stats?.totalOrders || 0 },
    { indicator: "Órdenes Pendientes", value: stats?.pendingOrders || 0 },
    { indicator: "Órdenes En Progreso", value: (stats?.inProgressOrders || 0) + (stats?.inQaOrders || 0) },
    { indicator: "Órdenes Completadas", value: stats?.completedOrders || 0 },
    { indicator: "Órdenes Atrasadas", value: stats?.overdueOrders || 0 },
    { indicator: "Tareas Totales", value: stats?.totalTasks || 0 },
    { indicator: "Tareas Completadas Hoy", value: stats?.todayCompletedTasks || 0 },
    { indicator: "Producción Hoy", value: `${stats?.todayQuantityProduced || 0}/${stats?.todayPlannedQuantity || 0}` },
    { indicator: "Producción Semana", value: weeklyQuantityProduced },
    { indicator: "Producción Mes", value: monthlyQuantityProduced },
    { indicator: "Desperdicio Total", value: stats?.totalWaste || 0 },
    { indicator: "Tasa Desperdicio", value: `${stats?.wasteRate || 0}%` },
    { indicator: "Promedio Min/Tarea", value: BURNED_KPIS.avgTaskDurationMinutes },
    { indicator: "Cumplimiento Órdenes", value: `${BURNED_KPIS.orderCompletionRate}%` },
    { indicator: "Cumplimiento Tareas", value: `${stats?.taskCompletionRate || 0}%` },
    { indicator: "Tareas a Tiempo", value: `${BURNED_KPIS.onTimeTaskRate}%` },
  ];

  const exportDashboardCsv = () => {
    exportRowsToCsv("dashboard_produccion_kpis", [
      { label: "Indicador", value: "indicator" },
      { label: "Valor", value: "value" },
    ], summaryRows);
  };

  const exportDashboardPdf = () => {
    exportRowsToPdf("Dashboard de Producción - KPIs", [
      { label: "Indicador", value: "indicator" },
      { label: "Valor", value: "value" },
    ], summaryRows);
  };

  if (loading) return <div className="content"><p className="text-center">Cargando dashboard...</p></div>;
  if (error) return <div className="content"><Alert color="danger">{error}</Alert></div>;
  if (!stats) return null;

  const todayProgress = stats.todayPlannedQuantity > 0
    ? (stats.todayQuantityProduced / stats.todayPlannedQuantity) * 100 : 0;

  const monthlyChart = {
    labels: (stats.monthlyProduction || []).map(m => m.month?.substring(0, 3) + " " + m.year),
    datasets: [{
      label: "Unidades Producidas",
      data: (stats.monthlyProduction || []).map(m => m.quantity),
      backgroundColor: "#4cbdd7",
      borderColor: "#4cbdd7",
      borderWidth: 2,
      barPercentage: 0.5,
    }],
  };

  const stageChart = {
    labels: ["Pendiente", "En Progreso", "Completada"],
    datasets: [{
      label: "Órdenes",
      data: [stats.pendingOrders, (stats.inProgressOrders || 0) + (stats.inQaOrders || 0), stats.completedOrders],
      backgroundColor: ["#ffc107", "#17a2b8", "#28a745"],
      borderWidth: 0,
      barPercentage: 0.6,
    }],
  };

  const getOrderQtyProgress = (order) => {
    const items = order?.items || [];
    const total = items.reduce((sum, item) => {
      if (item?.sizes && typeof item.sizes === "object") {
        return sum + Object.values(item.sizes).reduce((acc, qty) => acc + (Number(qty) || 0), 0);
      }
      return sum + (Number(item?.quantity) || 0);
    }, 0);
    const produced = items.reduce((sum, item) => {
      const planned = item?.sizes && typeof item.sizes === "object"
        ? Object.values(item.sizes).reduce((acc, qty) => acc + (Number(qty) || 0), 0)
        : (Number(item?.quantity) || 0);
      const received = Number(item?.warehouseReceivedQty || 0);
      return sum + Math.min(Math.max(received, 0), Math.max(planned, 0));
    }, 0);
    const pending = Math.max(total - produced, 0);
    const pct = total > 0 ? Math.round((produced / total) * 100) : 0;
    return { total, produced, pending, pct };
  };

  const orderQtyProgressRows = (orders || [])
    .map((order) => {
      const progress = getOrderQtyProgress(order);
      return {
        id: order.id,
        code: order.code,
        startDate: order.startDate,
        createdAt: order.createdAt,
        orderType: order.orderType,
        status: order.status,
        ...progress,
      };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => a.pct - b.pct);

  const qtyTotals = orderQtyProgressRows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      produced: acc.produced + row.produced,
      pending: acc.pending + row.pending,
    }),
    { total: 0, produced: 0, pending: 0 }
  );
  const qtyGlobalPct = qtyTotals.total > 0 ? Math.round((qtyTotals.produced / qtyTotals.total) * 100) : 0;

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Dashboard de Producción</CardTitle>
              <Row className="mt-2">
                <Col md="3">
                  <Label className="mb-1">Desde</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </Col>
                <Col md="3">
                  <Label className="mb-1">Hasta</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </Col>
                <Col md="6" className="d-flex align-items-end justify-content-end">
                  <Button
                    color="primary"
                    className="mr-2"
                    onClick={() => loadStats(dateFrom || undefined, dateTo || undefined)}
                    disabled={loading}
                  >
                    Aplicar Filtros
                  </Button>
                  <Button
                    color="secondary"
                    className="mr-2"
                    onClick={() => {
                      setDateFrom("");
                      setDateTo("");
                      loadStats();
                    }}
                    disabled={loading}
                  >
                    Limpiar
                  </Button>
                  <Button color="secondary" className="mr-2" onClick={exportDashboardCsv} disabled={!stats}>
                    CSV
                  </Button>
                  <Button color="secondary" onClick={exportDashboardPdf} disabled={!stats}>
                    PDF
                  </Button>
                </Col>
              </Row>
            </CardHeader>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md="12">
          <Card>
            <CardBody className="py-2">
              <Row className="align-items-center">
                <Col md="4">
                  <strong>Flujo simple de uso</strong>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    1) Crear OP, 2) Ejecutar en Centro de Producción, 3) Revisar Bodega PT.
                  </div>
                </Col>
                <Col md="8" className="text-right">
                  <Button color="primary" className="mr-2" onClick={() => navigate("/admin/production-orders")}>
                    Órdenes de Producción
                  </Button>
                  <Button color="info" className="mr-2" onClick={() => navigate("/admin/tasks-by-station")}>
                    Centro de Producción
                  </Button>
                  <Button color="secondary" onClick={() => navigate("/admin/warehouse-view")}>
                    Bodega PT
                  </Button>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* KPIs - Producción por período */}
      <Row>
        <Col md="3">
          <Card>
            <CardBody>
              <h6 className="text-muted">Producción Semana Actual</h6>
              <h3 style={{ color: "#17a2b8" }}>
                <i className="nc-icon nc-calendar-60" /> {weeklyQuantityProduced}
              </h3>
              <small className="text-muted">unidades producidas esta semana</small>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card>
            <CardBody>
              <h6 className="text-muted">Producción Mes Actual</h6>
              <h3 style={{ color: "#6f42c1" }}>
                <i className="nc-icon nc-chart-bar-32" /> {monthlyQuantityProduced}
              </h3>
              <small className="text-muted">unidades producidas este mes</small>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card>
            <CardBody>
              <h6 className="text-muted">Producción del Día</h6>
              <h3>{stats.todayQuantityProduced} / {stats.todayPlannedQuantity}</h3>
              <Progress value={todayProgress} color={todayProgress >= 80 ? "success" : "warning"} className="mt-2" />
              <small className="text-muted">{todayProgress.toFixed(0)}% completado</small>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card>
            <CardBody>
              <h6 className="text-muted">Órdenes Atrasadas</h6>
              <h3 className={stats.overdueOrders > 0 ? "text-danger" : "text-success"}>
                <i className={`nc-icon ${stats.overdueOrders > 0 ? "nc-alert-circle-i" : "nc-check-2"}`} /> {stats.overdueOrders}
              </h3>
              <small className="text-muted">{stats.overdueOrders > 0 ? "Requieren atención" : "Todo al día"}</small>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Extra KPIs */}
      <Row>
        <Col md="3">
          <Card>
            <CardBody>
              <h6 className="text-muted">Órdenes Pendientes</h6>
              <h3 style={{ color: "#ffc107" }}>{stats.pendingOrders}</h3>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card>
            <CardBody>
              <h6 className="text-muted">Órdenes En Progreso</h6>
              <h3 style={{ color: "#17a2b8" }}>{stats.inProgressOrders}</h3>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card>
            <CardBody>
              <h6 className="text-muted">Desperdicios Total</h6>
              <h3 className={stats.totalWaste > 0 ? "text-warning" : ""}>
                <i className="nc-icon nc-settings-gear-65" /> {stats.totalWaste}
              </h3>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card>
            <CardBody>
              <h6 className="text-muted">Total Órdenes</h6>
              <h3>{stats.totalOrders}</h3>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md="4">
          <Card>
            <CardBody>
              <h6 className="text-muted">Cumplimiento de Órdenes</h6>
              <h3>{BURNED_KPIS.orderCompletionRate}%</h3>
            </CardBody>
          </Card>
        </Col>
        <Col md="4">
          <Card>
            <CardBody>
              <h6 className="text-muted">Cumplimiento de Tareas</h6>
              <h3>{stats.taskCompletionRate || 0}%</h3>
            </CardBody>
          </Card>
        </Col>
        <Col md="4">
          <Card>
            <CardBody>
              <h6 className="text-muted">Tareas Completadas a Tiempo</h6>
              <h3>{BURNED_KPIS.onTimeTaskRate}%</h3>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h5">Avance de Órdenes por Cantidad</CardTitle>
            </CardHeader>
            <CardBody>
              <Row className="mb-2">
                <Col md="3"><strong>Hechos:</strong> {qtyTotals.produced}</Col>
                <Col md="3"><strong>Faltan:</strong> {qtyTotals.pending}</Col>
                <Col md="3"><strong>Total:</strong> {qtyTotals.total}</Col>
                <Col md="3" className="text-right"><strong>Avance global:</strong> {qtyGlobalPct}%</Col>
              </Row>
              <Progress
                value={qtyGlobalPct}
                color={qtyGlobalPct >= 100 ? "success" : qtyGlobalPct >= 50 ? "info" : "warning"}
                className="mb-3"
              />
              {orderQtyProgressRows.length === 0 ? (
                <Alert color="light" className="mb-0">No hay órdenes con cantidades para calcular avance.</Alert>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Orden</th>
                        <th>Tipo</th>
                        <th>Estado</th>
                        <th className="text-right">Hechos</th>
                        <th className="text-right">Faltan</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">Avance (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderQtyProgressRows.slice(0, 20).map((row) => (
                        <tr key={`qty-order-${row.id}`}>
                          <td><strong>{formatProductionOrderCodeDate(row)}</strong></td>
                          <td>{row.orderType}</td>
                          <td>{row.status}</td>
                          <td className="text-right">{row.produced}</td>
                          <td className="text-right">{row.pending}</td>
                          <td className="text-right">{row.total}</td>
                          <td className="text-right">{row.pct}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Product stage stats */}
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="6">
                  <CardTitle tag="h5" className="mb-0">Unidades por Producto y Etapa</CardTitle>
                </Col>
                <Col md="6">
                  <Input
                    type="text"
                    placeholder="Buscar producto..."
                    value={productStageSearch}
                    onChange={e => setProductStageSearch(e.target.value)}
                    style={{ fontSize: 13 }}
                  />
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {productStageStats.length === 0 ? (
                <Alert color="light" className="mb-0">No hay datos de productos para mostrar.</Alert>
              ) : (() => {
                const stageTotals = productStageStats.reduce(
                  (acc, r) => ({
                    pending: acc.pending + r.pendingQty,
                    inProgress: acc.inProgress + r.inProgressQty,
                    completed: acc.completed + r.completedQty,
                    total: acc.total + r.totalQty,
                  }),
                  { pending: 0, inProgress: 0, completed: 0, total: 0 }
                );
                const filtered = productStageSearch
                  ? productStageStats.filter(r =>
                      r.product.toLowerCase().includes(productStageSearch.toLowerCase())
                    )
                  : productStageStats;

                return (
                  <>
                    {/* Summary strip */}
                    <Row className="mb-3">
                      {[
                        { label: "Pendiente", value: stageTotals.pending, color: "#856404", bg: "#fff3cd", border: "#ffc107" },
                        { label: "En Progreso", value: stageTotals.inProgress, color: "#0c5460", bg: "#d1ecf1", border: "#17a2b8" },
                        { label: "Completado", value: stageTotals.completed, color: "#155724", bg: "#d4edda", border: "#28a745" },
                        { label: "Total", value: stageTotals.total, color: "#383d41", bg: "#e2e3e5", border: "#6c757d" },
                      ].map(kpi => (
                        <Col md="3" key={kpi.label}>
                          <div style={{
                            background: kpi.bg,
                            border: `1px solid ${kpi.border}`,
                            borderRadius: 8,
                            padding: "10px 16px",
                            textAlign: "center",
                          }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: kpi.color, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                              {kpi.label}
                            </div>
                            <div style={{ fontSize: 26, fontWeight: 700, color: kpi.color, lineHeight: 1.2 }}>
                              {kpi.value}
                            </div>
                            <div style={{ fontSize: 11, color: kpi.color, opacity: 0.8 }}>
                              {kpi.label !== "Total" && stageTotals.total > 0
                                ? `${Math.round((kpi.value / stageTotals.total) * 100)}% del total`
                                : "unidades"}
                            </div>
                          </div>
                        </Col>
                      ))}
                    </Row>

                    {/* Product rows */}
                    {filtered.length === 0 ? (
                      <Alert color="light" className="mb-0">Sin resultados para "{productStageSearch}".</Alert>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {filtered.map((row, i) => {
                          const total = row.totalQty || 1;
                          const pctPending = Math.round((row.pendingQty / total) * 100);
                          const pctInProgress = Math.round((row.inProgressQty / total) * 100);
                          const pctCompleted = Math.round((row.completedQty / total) * 100);
                          const hasWork = row.inProgressQty > 0 || row.completedQty > 0;
                          const completionLabel =
                            pctCompleted === 100 ? "Completo" :
                            pctCompleted >= 70 ? "Avanzado" :
                            pctCompleted >= 30 ? "En curso" :
                            row.inProgressQty > 0 ? "En progreso" :
                            hasWork ? "Iniciando" : "Pendiente";
                          const completionColor =
                            pctCompleted === 100 ? "#28a745" :
                            pctCompleted >= 70 ? "#17a2b8" :
                            pctCompleted >= 30 ? "#ffc107" :
                            row.inProgressQty > 0 ? "#17a2b8" :
                            hasWork ? "#fd7e14" : "#6c757d";

                          return (
                            <div
                              key={`ps-${i}`}
                              style={{
                                border: "1px solid #e9ecef",
                                borderRadius: 10,
                                padding: "12px 16px",
                                background: "#fafafa",
                              }}
                            >
                              <Row className="align-items-center mb-2">
                                <Col md="6">
                                  <span style={{ fontWeight: 600, fontSize: 14 }}>{row.product}</span>
                                </Col>
                                <Col md="3" className="text-right">
                                  <span style={{ fontSize: 12, color: "#6c757d" }}>
                                    <strong style={{ color: "#343a40" }}>{row.totalQty}</strong> uds totales
                                  </span>
                                </Col>
                                <Col md="3" className="text-right">
                                  <span
                                    style={{
                                      background: completionColor + "22",
                                      color: completionColor,
                                      border: `1px solid ${completionColor}`,
                                      borderRadius: 20,
                                      padding: "2px 10px",
                                      fontSize: 11,
                                      fontWeight: 700,
                                    }}
                                  >
                                    {completionLabel} · {pctCompleted}% completado
                                  </span>
                                </Col>
                              </Row>

                              {/* Stacked bar */}
                              <div style={{
                                display: "flex",
                                height: 10,
                                borderRadius: 6,
                                overflow: "hidden",
                                background: "#e9ecef",
                                marginBottom: 10,
                              }}>
                                {pctCompleted > 0 && (
                                  <div style={{ width: `${pctCompleted}%`, background: "#28a745", transition: "width 0.4s" }} title={`Completado: ${row.completedQty}`} />
                                )}
                                {pctInProgress > 0 && (
                                  <div style={{ width: `${pctInProgress}%`, background: "#17a2b8", transition: "width 0.4s" }} title={`En Progreso: ${row.inProgressQty}`} />
                                )}
                                {pctPending > 0 && (
                                  <div style={{ width: `${pctPending}%`, background: "#ffc107", transition: "width 0.4s" }} title={`Pendiente: ${row.pendingQty}`} />
                                )}
                              </div>

                              {/* Counters */}
                              <Row style={{ fontSize: 12 }}>
                                <Col className="d-flex align-items-center" style={{ gap: 4 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ffc107", display: "inline-block" }} />
                                  <span style={{ color: "#6c757d" }}>Pendiente:</span>
                                  <strong style={{ color: "#856404" }}>{row.pendingQty}</strong>
                                </Col>
                                <Col className="d-flex align-items-center" style={{ gap: 4 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#17a2b8", display: "inline-block" }} />
                                  <span style={{ color: "#6c757d" }}>En Progreso:</span>
                                  <strong style={{ color: "#0c5460" }}>{row.inProgressQty}</strong>
                                </Col>
                                <Col className="d-flex align-items-center" style={{ gap: 4 }}>
                                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28a745", display: "inline-block" }} />
                                  <span style={{ color: "#6c757d" }}>Completado:</span>
                                  <strong style={{ color: "#155724" }}>{row.completedQty}</strong>
                                </Col>
                              </Row>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                );
              })()}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Charts */}
      <Row>
        <Col md="7">
          <Card>
            <CardHeader><CardTitle tag="h5">Producción por Mes (últimos 6)</CardTitle></CardHeader>
            <CardBody>
              <div style={{ height: "280px" }}>
                <Bar data={monthlyChart} options={chartOptions} />
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col md="5">
          <Card>
            <CardHeader><CardTitle tag="h5">Órdenes por Estado</CardTitle></CardHeader>
            <CardBody>
              <div style={{ height: "280px" }}>
                <Bar data={stageChart} options={chartOptions} />
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Tasks Progress */}
      <Row>
        <Col md="12">
          <Card>
            <CardHeader><CardTitle tag="h5">Resumen de Tareas</CardTitle></CardHeader>
            <CardBody>
              <Row>
                <Col md="3">
                  <h6 className="text-muted">Pendientes</h6>
                  <Progress value={stats.totalTasks > 0 ? (stats.pendingTasks / stats.totalTasks) * 100 : 0} color="warning" />
                  <small>{stats.pendingTasks} tareas</small>
                </Col>
                <Col md="3">
                  <h6 className="text-muted">En Progreso</h6>
                  <Progress value={stats.totalTasks > 0 ? (stats.inProgressTasks / stats.totalTasks) * 100 : 0} color="info" />
                  <small>{stats.inProgressTasks} tareas</small>
                </Col>
                <Col md="3">
                  <h6 className="text-muted">Completadas</h6>
                  <Progress value={stats.totalTasks > 0 ? (stats.completedTasks / stats.totalTasks) * 100 : 0} color="success" />
                  <small>{stats.completedTasks} tareas</small>
                </Col>
                <Col md="3">
                  <h6 className="text-muted">Total</h6>
                  <h3>{stats.totalTasks}</h3>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h5">Rendimiento por Mesa</CardTitle>
            </CardHeader>
            <CardBody>
              {deskMetrics.length === 0 ? (
                <Alert color="light" className="mb-0">No hay tareas con mesa para el rango seleccionado.</Alert>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table className="table table-sm mb-0">
                    <thead>
                      <tr>
                        <th>Mesa</th>
                        <th className="text-right">Total Tareas</th>
                        <th className="text-right">Pendientes</th>
                        <th className="text-right">En Progreso</th>
                        <th className="text-right">Completadas</th>
                        <th className="text-right">Cumplimiento (%)</th>
                        <th className="text-right">Eficiencia (%)</th>
                        <th className="text-right">Prom. Estimado (min)</th>
                        <th className="text-right">Prom. Real (min)</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deskMetrics.map((row) => (
                        <tr key={`desk-${row.desk}`}>
                          <td><strong>Mesa {row.desk}</strong></td>
                          <td className="text-right">{row.total}</td>
                          <td className="text-right">{row.pending}</td>
                          <td className="text-right">{row.inProgress}</td>
                          <td className="text-right">{row.completed}</td>
                          <td className="text-right">{row.completionRate}</td>
                          <td className="text-right">{row.efficiencyRate}</td>
                          <td className="text-right">{row.avgEstimatedMinutes}</td>
                          <td className="text-right">{row.avgActualMinutes}</td>
                          <td>
                            {(() => {
                              const health = getDeskHealth(row);
                              return <span className={`badge badge-${health.color}`}>{health.label}</span>;
                            })()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-end">
                <Col md="6">
                  <CardTitle tag="h5" className="mb-1">Histórico de Mesas</CardTitle>
                  <small className="text-muted">
                    Tendencia mensual para ver si cada mesa va mejorando o empeorando.
                  </small>
                </Col>
                <Col md="3">
                  <Label className="mb-1">Mesa</Label>
                  <Input
                    type="select"
                    value={historyDeskFilter}
                    onChange={(e) => setHistoryDeskFilter(e.target.value)}
                  >
                    <option value="ALL">Todas</option>
                    {deskMetrics.map((d) => (
                      <option key={`history-desk-${d.desk}`} value={String(d.desk)}>
                        Mesa {d.desk}
                      </option>
                    ))}
                  </Input>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {historicalDeskMetrics.length === 0 ? (
                <Alert color="light" className="mb-0">
                  No hay suficientes datos históricos para el filtro seleccionado.
                </Alert>
              ) : (
                <>
                  <div style={{ height: "300px" }}>
                    <Bar data={historicalDeskChart} options={chartOptions} />
                  </div>
                  <div style={{ overflowX: "auto" }} className="mt-3">
                    <table className="table table-sm mb-0">
                      <thead>
                        <tr>
                          <th>Periodo</th>
                          <th>Mesa</th>
                          <th className="text-right">Tareas</th>
                          <th className="text-right">Completadas</th>
                          <th className="text-right">Cumplimiento (%)</th>
                          <th className="text-right">Eficiencia (%)</th>
                          <th className="text-right">Prom. Real (min)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalDeskMetrics.map((row, idx) => (
                          <tr key={`history-row-${row.monthKey}-${row.desk}-${idx}`}>
                            <td>{row.monthKey}</td>
                            <td><strong>Mesa {row.desk}</strong></td>
                            <td className="text-right">{row.total}</td>
                            <td className="text-right">{row.completed}</td>
                            <td className="text-right">{row.completionRate}</td>
                            <td className="text-right">{row.efficiencyRate}</td>
                            <td className="text-right">{row.avgActualMinutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ProductionDashboard;
