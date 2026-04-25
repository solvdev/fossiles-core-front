import React, { useState, useRef, useMemo } from "react";
import {
  Card, CardHeader, CardBody, CardTitle, Row, Col, Table,
  Input, Label, Button, Alert,
} from "reactstrap";
import { getProductionReports } from "services/productionOrderService";
import NotificationAlert from "react-notification-alert";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { Bar } from "react-chartjs-2";

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: false } },
  scales: {
    y: { ticks: { color: "#9f9f9f", beginAtZero: true }, grid: { display: true, color: "#eee" } },
    x: { grid: { display: false }, ticks: { color: "#9f9f9f" } },
  },
};

const REPORT_TYPES = [
  { value: "daily", label: "Por Día" },
  { value: "weekly", label: "Por Semana" },
  { value: "monthly", label: "Por Mes" },
  { value: "product", label: "Por Producto" },
  { value: "product-stage", label: "Por Producto y Etapa" },
  { value: "efficiency", label: "Eficiencia" },
  { value: "stage", label: "Por Estado" },
];

function ProductionReports() {
  const notif = useRef(null);
  const [reportType, setReportType] = useState("daily");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const data = await getProductionReports(reportType, dateFrom || undefined, dateTo || undefined);
      setReport(data);
    } catch (err) {
      notify("danger", err.message);
    } finally {
      setLoading(false);
    }
  };

  const notify = (type, message) => {
    if (notif.current) {
      notif.current.notificationAlert({ place: "tr", message, type, autoDismiss: 4 });
    }
  };

  const renderHeaders = () => {
    switch (reportType) {
      case "daily":
        return <tr><th>Fecha</th><th>Tareas</th><th className="text-right">Cantidad</th><th className="text-right">Desperdicio</th></tr>;
      case "weekly":
        return <tr><th>Semana</th><th>Tareas</th><th className="text-right">Cantidad</th><th className="text-right">Desperdicio</th></tr>;
      case "monthly":
        return <tr><th>Mes</th><th>Tareas</th><th className="text-right">Cantidad</th><th className="text-right">Desperdicio</th></tr>;
      case "product":
        return <tr><th>Producto</th><th className="text-right">Tareas</th><th className="text-right">Cantidad</th><th className="text-right">Desperdicio</th></tr>;
      case "product-stage":
        return (
          <tr>
            <th>Producto</th>
            <th className="text-right">Pendiente</th>
            <th className="text-right">En Progreso</th>
            <th className="text-right">Completado</th>
            <th className="text-right">Total</th>
          </tr>
        );
      case "efficiency":
        return <tr><th>Tarea</th><th>Producto</th><th className="text-right">Est. (min)</th><th className="text-right">Real (min)</th><th className="text-right">Eficiencia</th></tr>;
      case "stage":
        return <tr><th>Estado</th><th className="text-right">Cantidad</th></tr>;
      default:
        return null;
    }
  };

  const renderRows = () => {
    if (!report?.data) return null;
    const dataArr = Array.isArray(report.data) ? report.data : [];

    switch (reportType) {
      case "daily":
        return dataArr.map((row, i) => (
          <tr key={i}>
            <td>{row.date}</td>
            <td>{row.tasks}</td>
            <td className="text-right">{row.quantity}</td>
            <td className={`text-right ${row.waste > 0 ? "text-danger" : ""}`}>{row.waste}</td>
          </tr>
        ));
      case "weekly":
        return dataArr.map((row, i) => (
          <tr key={i}>
            <td>{row.week}</td>
            <td>{row.tasks}</td>
            <td className="text-right">{row.quantity}</td>
            <td className={`text-right ${row.waste > 0 ? "text-danger" : ""}`}>{row.waste}</td>
          </tr>
        ));
      case "monthly":
        return dataArr.map((row, i) => (
          <tr key={i}>
            <td>{row.month}</td>
            <td>{row.tasks}</td>
            <td className="text-right">{row.quantity}</td>
            <td className={`text-right ${row.waste > 0 ? "text-danger" : ""}`}>{row.waste}</td>
          </tr>
        ));
      case "product":
        return dataArr.map((row, i) => (
          <tr key={i}>
            <td>{row.product}</td>
            <td className="text-right">{row.tasks}</td>
            <td className="text-right">{row.quantity}</td>
            <td className={`text-right ${row.waste > 0 ? "text-danger" : ""}`}>{row.waste}</td>
          </tr>
        ));
      case "product-stage":
        return dataArr.map((row, i) => (
          <tr key={i}>
            <td>{row.product}</td>
            <td className="text-right" style={{ color: "#ffc107", fontWeight: 600 }}>{row.pendingQty}</td>
            <td className="text-right" style={{ color: "#17a2b8", fontWeight: 600 }}>{row.inProgressQty}</td>
            <td className="text-right" style={{ color: "#28a745", fontWeight: 600 }}>{row.completedQty}</td>
            <td className="text-right"><strong>{row.totalQty}</strong></td>
          </tr>
        ));
      case "efficiency":
        return dataArr.map((row, i) => (
          <tr key={i}>
            <td><strong>{row.taskCode}</strong></td>
            <td>{row.product}</td>
            <td className="text-right">{row.estimatedMinutes}</td>
            <td className="text-right">{row.actualMinutes}</td>
            <td className="text-right">
              <span style={{
                backgroundColor: row.efficiency >= 100 ? "#28a745" : row.efficiency >= 70 ? "#ffc107" : "#dc3545",
                color: row.efficiency >= 70 && row.efficiency < 100 ? "#333" : "#fff",
                padding: "0.2em 0.5em", borderRadius: "0.25rem", fontSize: "80%", fontWeight: 700,
              }}>
                {row.efficiency}%
              </span>
            </td>
          </tr>
        ));
      case "stage":
        return dataArr.map((row, i) => (
          <tr key={i}>
            <td>{row.status}</td>
            <td className="text-right">{row.count}</td>
          </tr>
        ));
      default:
        return null;
    }
  };

  const exportConfig = () => {
    switch (reportType) {
      case "daily":
        return {
          filename: "reporte_produccion_diario",
          title: "Reporte de Produccion - Diario",
          headers: [
            { label: "Fecha", value: "date" },
            { label: "Tareas", value: "tasks" },
            { label: "Cantidad", value: "quantity" },
            { label: "Desperdicio", value: "waste" },
          ],
        };
      case "weekly":
        return {
          filename: "reporte_produccion_semanal",
          title: "Reporte de Produccion - Semanal",
          headers: [
            { label: "Semana", value: "week" },
            { label: "Tareas", value: "tasks" },
            { label: "Cantidad", value: "quantity" },
            { label: "Desperdicio", value: "waste" },
          ],
        };
      case "monthly":
        return {
          filename: "reporte_produccion_mensual",
          title: "Reporte de Produccion - Mensual",
          headers: [
            { label: "Mes", value: "month" },
            { label: "Tareas", value: "tasks" },
            { label: "Cantidad", value: "quantity" },
            { label: "Desperdicio", value: "waste" },
          ],
        };
      case "product":
        return {
          filename: "reporte_produccion_producto",
          title: "Reporte de Produccion - Por Producto",
          headers: [
            { label: "Producto", value: "product" },
            { label: "Tareas", value: "tasks" },
            { label: "Cantidad", value: "quantity" },
            { label: "Desperdicio", value: "waste" },
          ],
        };
      case "product-stage":
        return {
          filename: "reporte_produccion_producto_etapa",
          title: "Reporte de Produccion - Por Producto y Etapa",
          headers: [
            { label: "Producto", value: "product" },
            { label: "Pendiente", value: "pendingQty" },
            { label: "En Progreso", value: "inProgressQty" },
            { label: "Completado", value: "completedQty" },
            { label: "Total", value: "totalQty" },
          ],
        };
      case "efficiency":
        return {
          filename: "reporte_produccion_eficiencia",
          title: "Reporte de Produccion - Eficiencia",
          headers: [
            { label: "Tarea", value: "taskCode" },
            { label: "Producto", value: "product" },
            { label: "Est. (min)", value: "estimatedMinutes" },
            { label: "Real (min)", value: "actualMinutes" },
            { label: "Eficiencia (%)", value: "efficiency" },
          ],
        };
      case "stage":
      default:
        return {
          filename: "reporte_produccion_etapa",
          title: "Reporte de Produccion - Por Estado",
          headers: [
            { label: "Estado", value: "status" },
            { label: "Cantidad", value: "count" },
          ],
        };
    }
  };

  const exportCsv = () => {
    if (!report?.data?.length) return;
    const cfg = exportConfig();
    exportRowsToCsv(cfg.filename, cfg.headers, report.data);
  };

  const exportPdf = () => {
    if (!report?.data?.length) return;
    const cfg = exportConfig();
    exportRowsToPdf(cfg.title, cfg.headers, report.data);
  };

  const chartData = useMemo(() => {
    if (!report?.data?.length) return null;
    const rows = report.data;

    if (reportType === "daily") {
      return {
        labels: rows.map(r => r.date),
        datasets: [{ data: rows.map(r => r.quantity || 0), backgroundColor: "#4cbdd7" }],
      };
    }
    if (reportType === "weekly") {
      return {
        labels: rows.map(r => r.week),
        datasets: [{ data: rows.map(r => r.quantity || 0), backgroundColor: "#17a2b8" }],
      };
    }
    if (reportType === "monthly") {
      return {
        labels: rows.map(r => r.month),
        datasets: [{ data: rows.map(r => r.quantity || 0), backgroundColor: "#4cbdd7" }],
      };
    }
    if (reportType === "product") {
      return {
        labels: rows.slice(0, 10).map(r => r.product),
        datasets: [{ data: rows.slice(0, 10).map(r => r.quantity || 0), backgroundColor: "#6f42c1" }],
      };
    }
    if (reportType === "product-stage") {
      const top = rows.slice(0, 12);
      return {
        labels: top.map(r => r.product),
        datasets: [
          { label: "Pendiente", data: top.map(r => r.pendingQty || 0), backgroundColor: "#ffc107" },
          { label: "En Progreso", data: top.map(r => r.inProgressQty || 0), backgroundColor: "#17a2b8" },
          { label: "Completado", data: top.map(r => r.completedQty || 0), backgroundColor: "#28a745" },
        ],
      };
    }
    if (reportType === "stage") {
      return {
        labels: rows.map(r => r.status),
        datasets: [{ data: rows.map(r => r.count || 0), backgroundColor: "#17a2b8" }],
      };
    }
    if (reportType === "efficiency") {
      const top = rows.slice(0, 12);
      return {
        labels: top.map(r => r.taskCode),
        datasets: [{ data: top.map(r => r.efficiency || 0), backgroundColor: "#28a745" }],
      };
    }
    return null;
  }, [report, reportType]);

  const chartOptionsWithLegend = {
    ...chartOptions,
    plugins: {
      ...chartOptions.plugins,
      legend: { display: reportType === "product-stage" },
    },
  };

  const chartTitle = {
    daily: "Tendencia de Producción por Fecha",
    weekly: "Producción por Semana",
    monthly: "Producción por Mes",
    product: "Top Productos Producidos",
    "product-stage": "Unidades por Producto y Etapa (top 12)",
    efficiency: "Eficiencia por Tarea",
    stage: "Distribución por Estado",
  };

  const summaryLabel = reportType === "product-stage" || reportType === "stage"
    ? null
    : (
      <Alert color="info" className="mb-3">
        <strong>Resumen:</strong> {report?.totalTasks} tareas | {report?.totalQuantity} unidades producidas
        {report?.totalWaste > 0 && <span className="text-danger"> | {report?.totalWaste} desperdicio</span>}
        {" "}| Período: {report?.from} → {report?.to}
      </Alert>
    );

  const colSpanForEmpty = reportType === "stage" ? 2 : reportType === "product-stage" ? 5 : reportType === "efficiency" ? 5 : 4;

  return (
    <div className="content">
      <NotificationAlert ref={notif} />
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Reportes de Producción</CardTitle>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="3">
                  <Label>Tipo de Reporte</Label>
                  <Input type="select" value={reportType} onChange={e => { setReportType(e.target.value); setReport(null); }}>
                    {REPORT_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </Input>
                </Col>
                <Col md="3">
                  <Label>Fecha Desde</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </Col>
                <Col md="3">
                  <Label>Fecha Hasta</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Button color="primary" className="btn-round" onClick={generateReport} disabled={loading}>
                    {loading ? "Generando..." : <><i className="nc-icon nc-zoom-split" /> Generar Reporte</>}
                  </Button>
                </Col>
              </Row>

              <Row className="mb-2">
                <Col md="12" className="text-right">
                  <Button color="secondary" className="mr-2" onClick={exportCsv} disabled={!report?.data?.length}>
                    <i className="nc-icon nc-cloud-download-93 mr-1" />CSV
                  </Button>
                  <Button color="secondary" onClick={exportPdf} disabled={!report?.data?.length}>
                    <i className="nc-icon nc-single-copy-04 mr-1" />PDF
                  </Button>
                </Col>
              </Row>

              {report && summaryLabel}

              {report && reportType !== "product-stage" && reportType !== "stage" && (
                <Row className="mb-3">
                  <Col md="3"><Card><CardBody><small className="text-muted">Tareas</small><h4>{report.totalTasks || 0}</h4></CardBody></Card></Col>
                  <Col md="3"><Card><CardBody><small className="text-muted">Unidades</small><h4>{report.totalQuantity || 0}</h4></CardBody></Card></Col>
                  <Col md="3"><Card><CardBody><small className="text-muted">Desperdicio</small><h4>{report.totalWaste || 0}</h4></CardBody></Card></Col>
                  <Col md="3"><Card><CardBody><small className="text-muted">Tasa Desperdicio</small><h4>{report.wasteRate || 0}%</h4></CardBody></Card></Col>
                </Row>
              )}

              {reportType === "product-stage" && report?.data?.length > 0 && (
                <Row className="mb-3">
                  {[
                    { label: "Total Productos", value: report.data.length, color: "" },
                    { label: "Uds. Pendientes", value: report.data.reduce((s, r) => s + (r.pendingQty || 0), 0), color: "text-warning" },
                    { label: "Uds. En Progreso", value: report.data.reduce((s, r) => s + (r.inProgressQty || 0), 0), color: "text-info" },
                    { label: "Uds. Completadas", value: report.data.reduce((s, r) => s + (r.completedQty || 0), 0), color: "text-success" },
                  ].map((kpi, i) => (
                    <Col md="3" key={i}>
                      <Card><CardBody>
                        <small className="text-muted">{kpi.label}</small>
                        <h4 className={kpi.color}>{kpi.value}</h4>
                      </CardBody></Card>
                    </Col>
                  ))}
                </Row>
              )}

              {reportType === "efficiency" && report && (
                <Alert color="secondary" className="mb-3">
                  <strong>Eficiencia promedio:</strong> {report.avgEfficiency || 0}%
                </Alert>
              )}

              {chartData && (
                <Card className="mb-3">
                  <CardHeader>
                    <CardTitle tag="h6">{chartTitle[reportType]}</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <div style={{ height: "260px" }}>
                      <Bar data={chartData} options={chartOptionsWithLegend} />
                    </div>
                  </CardBody>
                </Card>
              )}

              <Table responsive hover className="table-sm">
                <thead className="text-primary">
                  {renderHeaders()}
                </thead>
                <tbody>
                  {report?.data ? renderRows() : (
                    <tr>
                      <td colSpan={colSpanForEmpty} className="text-center text-muted">
                        Seleccione filtros y genere el reporte
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ProductionReports;
