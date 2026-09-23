import React, { useState, useRef, useMemo, useEffect } from "react";
import {
  Card, CardHeader, CardBody, CardTitle, Row, Col, Table,
  Input, Label, Button, Alert,
} from "reactstrap";
import { getProductionOrdersPage, getProductionReports, getProductionTimeEstimate, getProductionLeatherEstimate } from "services/productionOrderService";
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
  { value: "order-time", label: "Tiempo por orden" },
  // Temporalmente deshabilitado: { value: "order-leather", label: "Cuero por orden" },
];

function formatHours(h) {
  if (h == null || Number.isNaN(Number(h))) return "—";
  return `${Number(h).toFixed(2)} h`;
}

function formatMinutesFromHours(h) {
  if (h == null || Number.isNaN(Number(h))) return "—";
  return `${Math.round(Number(h) * 60)} min`;
}

function formatFt2(v) {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(3)} ft²`;
}

function ProductionReports() {
  const notif = useRef(null);
  const [reportType, setReportType] = useState("daily");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderOptions, setOrderOptions] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [timeEstimate, setTimeEstimate] = useState(null);
  const [leatherEstimate, setLeatherEstimate] = useState(null);

  const generateReport = async () => {
    setLoading(true);
    try {
      if (reportType === "order-time") {
        if (!selectedOrderId) {
          notify("warning", "Seleccione una orden de producción");
          setTimeEstimate(null);
          return;
        }
        const data = await getProductionTimeEstimate(selectedOrderId);
        setTimeEstimate(data);
        setLeatherEstimate(null);
        setReport(null);
      } else if (reportType === "order-leather") {
        if (!selectedOrderId) {
          notify("warning", "Seleccione una orden de producción");
          setLeatherEstimate(null);
          return;
        }
        const data = await getProductionLeatherEstimate(selectedOrderId);
        setLeatherEstimate(data);
        setTimeEstimate(null);
        setReport(null);
      } else {
        const data = await getProductionReports(reportType, dateFrom || undefined, dateTo || undefined);
        setReport(data);
        setTimeEstimate(null);
        setLeatherEstimate(null);
      }
    } catch (err) {
      notify("danger", err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (reportType !== "order-time" && reportType !== "order-leather") return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoadingOrders(true);
      try {
        const page = await getProductionOrdersPage({
          search: orderSearch.trim(),
          process: "ALL",
          status: "ALL",
          page: 0,
          size: 40,
        });
        if (!cancelled) setOrderOptions(page?.content || []);
      } catch (err) {
        if (!cancelled) {
          setOrderOptions([]);
          notify("danger", err.message || "No se pudieron cargar órdenes");
        }
      } finally {
        if (!cancelled) setLoadingOrders(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [reportType, orderSearch]);

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
      case "order-time":
        return (
          <tr>
            <th>Producto</th>
            <th className="text-right">Cantidad</th>
            <th className="text-right">prd_time (min)</th>
            <th className="text-right">Horas línea</th>
          </tr>
        );
      case "order-leather":
        return (
          <tr>
            <th>Producto</th>
            <th>Color</th>
            <th className="text-right">Cantidad</th>
            <th className="text-right">ft² / ud</th>
            <th className="text-right">ft² línea</th>
            <th>Cuero (material)</th>
          </tr>
        );
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

  const renderTimeEstimateRows = () => {
    const lines = timeEstimate?.lines || [];
    if (!lines.length) return null;
    return lines.map((row, i) => (
      <tr key={row.itemId || i}>
        <td>
          <strong>{row.productCode || "—"}</strong>
          {row.productName ? <div className="text-muted small">{row.productName}</div> : null}
        </td>
        <td className="text-right">{row.quantity}</td>
        <td className="text-right">{formatMinutesFromHours(row.prdTimePerUnit)}</td>
        <td className="text-right">{formatHours(row.lineHours)}</td>
      </tr>
    ));
  };

  const renderLeatherEstimateRows = () => {
    const lines = leatherEstimate?.lines || [];
    if (!lines.length) return null;
    return lines.map((row, i) => (
      <tr key={row.itemId || i} className={row.missingRecipe ? "table-warning" : undefined}>
        <td>
          <strong>{row.productCode || "—"}</strong>
          {row.productName ? <div className="text-muted small">{row.productName}</div> : null}
          {row.note ? <div className="text-danger small">{row.note}</div> : null}
        </td>
        <td>{row.colorName || "—"}</td>
        <td className="text-right">{row.quantity}</td>
        <td className="text-right">{formatFt2(row.ft2PerUnit)}</td>
        <td className="text-right">{formatFt2(row.lineFt2)}</td>
        <td>
          {row.leatherMaterialSku || row.leatherMaterialName
            ? (
              <>
                <strong>{row.leatherMaterialSku || "—"}</strong>
                {row.leatherMaterialName ? <div className="text-muted small">{row.leatherMaterialName}</div> : null}
              </>
            )
            : "—"}
        </td>
      </tr>
    ));
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
      case "order-time":
        return {
          filename: `tiempo_produccion_${timeEstimate?.productionOrderCode || "op"}`,
          title: `Tiempo de Produccion - ${timeEstimate?.productionOrderCode || ""}`,
          headers: [
            { label: "Codigo", value: "productCode" },
            { label: "Producto", value: "productName" },
            { label: "Cantidad", value: "quantity" },
            { label: "prd_time (min)", value: (row) => Math.round(Number(row.prdTimePerUnit || 0) * 60) },
            { label: "Horas linea", value: "lineHours" },
          ],
        };
      case "order-leather":
        return {
          filename: `cuero_produccion_${leatherEstimate?.productionOrderCode || "op"}`,
          title: `Cuero de Produccion - ${leatherEstimate?.productionOrderCode || ""}`,
          headers: [
            { label: "Codigo", value: "productCode" },
            { label: "Producto", value: "productName" },
            { label: "Color", value: "colorName" },
            { label: "Cantidad", value: "quantity" },
            { label: "ft2 / ud", value: "ft2PerUnit" },
            { label: "ft2 linea", value: "lineFt2" },
            { label: "SKU cuero", value: "leatherMaterialSku" },
            { label: "Material cuero", value: "leatherMaterialName" },
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
    if (reportType === "order-time") {
      if (!timeEstimate?.lines?.length) return;
      const cfg = exportConfig();
      exportRowsToCsv(cfg.filename, cfg.headers, timeEstimate.lines);
      return;
    }
    if (reportType === "order-leather") {
      if (!leatherEstimate?.lines?.length) return;
      const cfg = exportConfig();
      exportRowsToCsv(cfg.filename, cfg.headers, leatherEstimate.lines);
      return;
    }
    if (!report?.data?.length) return;
    const cfg = exportConfig();
    exportRowsToCsv(cfg.filename, cfg.headers, report.data);
  };

  const exportPdf = () => {
    if (reportType === "order-time") {
      if (!timeEstimate?.lines?.length) return;
      const cfg = exportConfig();
      exportRowsToPdf(cfg.title, cfg.headers, timeEstimate.lines);
      return;
    }
    if (reportType === "order-leather") {
      if (!leatherEstimate?.lines?.length) return;
      const cfg = exportConfig();
      exportRowsToPdf(cfg.title, cfg.headers, leatherEstimate.lines);
      return;
    }
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

  const isOrderTime = reportType === "order-time";
  const isOrderLeather = reportType === "order-leather";
  const isOrderScoped = isOrderTime || isOrderLeather;

  const summaryLabel = isOrderScoped
    ? null
    : reportType === "product-stage" || reportType === "stage"
    ? null
    : (
      <Alert color="info" className="mb-3">
        <strong>Resumen:</strong> {report?.totalTasks} tareas | {report?.totalQuantity} unidades producidas
        {report?.totalWaste > 0 && <span className="text-danger"> | {report?.totalWaste} desperdicio</span>}
        {" "}| Período: {report?.from} → {report?.to}
      </Alert>
    );

  const colSpanForEmpty = isOrderLeather
    ? 6
    : isOrderTime
    ? 4
    : reportType === "stage" ? 2 : reportType === "product-stage" ? 5 : reportType === "efficiency" ? 5 : 4;

  const hasExportData = isOrderTime
    ? !!timeEstimate?.lines?.length
    : isOrderLeather
    ? !!leatherEstimate?.lines?.length
    : !!report?.data?.length;

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
                  <Input
                    type="select"
                    value={reportType}
                    onChange={(e) => {
                      setReportType(e.target.value);
                      setReport(null);
                      setTimeEstimate(null);
                      setLeatherEstimate(null);
                    }}
                  >
                    {REPORT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </Input>
                </Col>
                {isOrderScoped ? (
                  <>
                    <Col md="3">
                      <Label>Buscar OP</Label>
                      <Input
                        type="text"
                        placeholder="Código o cliente…"
                        value={orderSearch}
                        onChange={(e) => setOrderSearch(e.target.value)}
                      />
                    </Col>
                    <Col md="3">
                      <Label>Orden</Label>
                      <Input
                        type="select"
                        value={selectedOrderId}
                        onChange={(e) => {
                          setSelectedOrderId(e.target.value);
                          setTimeEstimate(null);
                          setLeatherEstimate(null);
                        }}
                        disabled={loadingOrders}
                      >
                        <option value="">{loadingOrders ? "Cargando…" : "Seleccione una OP"}</option>
                        {orderOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.code} — {o.customerName || "Sin cliente"} ({o.status})
                          </option>
                        ))}
                      </Input>
                    </Col>
                  </>
                ) : (
                  <>
                    <Col md="3">
                      <Label>Fecha Desde</Label>
                      <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                    </Col>
                    <Col md="3">
                      <Label>Fecha Hasta</Label>
                      <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                    </Col>
                  </>
                )}
                <Col md="3" className="d-flex align-items-end">
                  <Button color="primary" className="btn-round" onClick={generateReport} disabled={loading}>
                    {loading ? "Generando..." : <><i className="nc-icon nc-zoom-split" /> Generar Reporte</>}
                  </Button>
                </Col>
              </Row>

              <Row className="mb-2">
                <Col md="12" className="text-right">
                  <Button
                    color="secondary"
                    className="mr-2"
                    onClick={exportCsv}
                    disabled={!hasExportData}
                  >
                    <i className="nc-icon nc-cloud-download-93 mr-1" />CSV
                  </Button>
                  <Button
                    color="secondary"
                    onClick={exportPdf}
                    disabled={!hasExportData}
                  >
                    <i className="nc-icon nc-single-copy-04 mr-1" />PDF
                  </Button>
                </Col>
              </Row>

              {report && summaryLabel}

              {isOrderTime && timeEstimate && (
                <>
                  <Alert color="info" className="mb-3">
                    <strong>{timeEstimate.productionOrderCode}</strong>
                    {timeEstimate.efficiencyPercent != null
                      ? ` · Eficiencia ${timeEstimate.efficiencyPercent}% (${timeEstimate.measuredTasks} tareas medidas)`
                      : " · Sin eficiencia medida (se usa tiempo teórico)"}
                    {" "}· Lun–jue 9h / vie 8h × {timeEstimate.deskCount} mesa(s)
                  </Alert>
                  <Row className="mb-3">
                    <Col md="2">
                      <Card><CardBody>
                        <small className="text-muted">Horas teóricas</small>
                        <h4>{formatHours(timeEstimate.theoreticalHours)}</h4>
                      </CardBody></Card>
                    </Col>
                    <Col md="2">
                      <Card><CardBody>
                        <small className="text-muted">Horas ajustadas</small>
                        <h4>{formatHours(timeEstimate.adjustedHours)}</h4>
                      </CardBody></Card>
                    </Col>
                    <Col md="2">
                      <Card><CardBody>
                        <small className="text-muted">Mesas</small>
                        <h4>{timeEstimate.deskCount}</h4>
                      </CardBody></Card>
                    </Col>
                    <Col md="2">
                      <Card><CardBody>
                        <small className="text-muted">Días hábiles</small>
                        <h4>{timeEstimate.businessDays}</h4>
                      </CardBody></Card>
                    </Col>
                    <Col md="2">
                      <Card><CardBody>
                        <small className="text-muted">Inicio</small>
                        <h4 style={{ fontSize: "1.1rem" }}>{timeEstimate.estimatedStartDate}</h4>
                      </CardBody></Card>
                    </Col>
                    <Col md="2">
                      <Card><CardBody>
                        <small className="text-muted">Fin estimado</small>
                        <h4 style={{ fontSize: "1.1rem" }}>{timeEstimate.estimatedEndDate}</h4>
                      </CardBody></Card>
                    </Col>
                  </Row>
                </>
              )}

              {isOrderLeather && leatherEstimate && (
                <>
                  <Alert color="info" className="mb-3">
                    <strong>{leatherEstimate.productionOrderCode}</strong>
                    {" "}· {formatFt2(leatherEstimate.totalFt2)} total
                    {" "}· {leatherEstimate.totalUnits || 0} unidades
                    {(leatherEstimate.linesMissingRecipe || 0) > 0
                      ? ` · ${leatherEstimate.linesMissingRecipe} línea(s) sin receta de cuero`
                      : ""}
                  </Alert>
                  <Row className="mb-3">
                    <Col md="3">
                      <Card><CardBody>
                        <small className="text-muted">Total cuero</small>
                        <h4>{formatFt2(leatherEstimate.totalFt2)}</h4>
                      </CardBody></Card>
                    </Col>
                    <Col md="3">
                      <Card><CardBody>
                        <small className="text-muted">Colores</small>
                        <h4>{(leatherEstimate.byColor || []).length}</h4>
                      </CardBody></Card>
                    </Col>
                    <Col md="3">
                      <Card><CardBody>
                        <small className="text-muted">Materiales cuero</small>
                        <h4>{(leatherEstimate.byMaterial || []).length}</h4>
                      </CardBody></Card>
                    </Col>
                    <Col md="3">
                      <Card><CardBody>
                        <small className="text-muted">Sin receta</small>
                        <h4 className={leatherEstimate.linesMissingRecipe > 0 ? "text-warning" : ""}>
                          {leatherEstimate.linesMissingRecipe || 0}
                        </h4>
                      </CardBody></Card>
                    </Col>
                  </Row>
                  {(leatherEstimate.byColor || []).length > 0 && (
                    <Card className="mb-3">
                      <CardHeader><CardTitle tag="h6">Resumen por color</CardTitle></CardHeader>
                      <CardBody className="pt-0">
                        <Table responsive hover className="table-sm mb-0">
                          <thead className="text-primary">
                            <tr>
                              <th>Color</th>
                              <th className="text-right">Líneas</th>
                              <th className="text-right">Unidades</th>
                              <th className="text-right">ft²</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leatherEstimate.byColor.map((row, i) => (
                              <tr key={row.colorId ?? `nc-${i}`}>
                                <td>{row.colorName || "Sin color"}</td>
                                <td className="text-right">{row.lineCount}</td>
                                <td className="text-right">{row.quantity}</td>
                                <td className="text-right">{formatFt2(row.totalFt2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </CardBody>
                    </Card>
                  )}
                  {(leatherEstimate.byMaterial || []).length > 0 && (
                    <Card className="mb-3">
                      <CardHeader><CardTitle tag="h6">Resumen por material de cuero</CardTitle></CardHeader>
                      <CardBody className="pt-0">
                        <Table responsive hover className="table-sm mb-0">
                          <thead className="text-primary">
                            <tr>
                              <th>Material</th>
                              <th className="text-right">Necesario</th>
                              <th className="text-right">Disponible</th>
                            </tr>
                          </thead>
                          <tbody>
                            {leatherEstimate.byMaterial.map((row) => (
                              <tr key={row.leatherMaterialId}>
                                <td>
                                  <strong>{row.leatherMaterialSku || "—"}</strong>
                                  {row.leatherMaterialName
                                    ? <div className="text-muted small">{row.leatherMaterialName}</div>
                                    : null}
                                </td>
                                <td className="text-right">{formatFt2(row.totalFt2)}</td>
                                <td className="text-right">{formatFt2(row.availableFt2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </CardBody>
                    </Card>
                  )}
                </>
              )}

              {!isOrderScoped && report && reportType !== "product-stage" && reportType !== "stage" && (
                <Row className="mb-3">
                  <Col md="3"><Card><CardBody><small className="text-muted">Tareas</small><h4>{report.totalTasks || 0}</h4></CardBody></Card></Col>
                  <Col md="3"><Card><CardBody><small className="text-muted">Unidades</small><h4>{report.totalQuantity || 0}</h4></CardBody></Card></Col>
                  <Col md="3"><Card><CardBody><small className="text-muted">Desperdicio</small><h4>{report.totalWaste || 0}</h4></CardBody></Card></Col>
                  <Col md="3"><Card><CardBody><small className="text-muted">Tasa Desperdicio</small><h4>{report.wasteRate || 0}%</h4></CardBody></Card></Col>
                </Row>
              )}

              {!isOrderScoped && reportType === "product-stage" && report?.data?.length > 0 && (
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

              {!isOrderScoped && reportType === "efficiency" && report && (
                <Alert color="secondary" className="mb-3">
                  <strong>Eficiencia promedio:</strong> {report.avgEfficiency || 0}%
                </Alert>
              )}

              {!isOrderScoped && chartData && (
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
                  {isOrderTime
                    ? (timeEstimate?.lines?.length
                      ? renderTimeEstimateRows()
                      : (
                        <tr>
                          <td colSpan={colSpanForEmpty} className="text-center text-muted">
                            Seleccione una OP y genere el estimado
                          </td>
                        </tr>
                      ))
                    : isOrderLeather
                    ? (leatherEstimate?.lines?.length
                      ? renderLeatherEstimateRows()
                      : (
                        <tr>
                          <td colSpan={colSpanForEmpty} className="text-center text-muted">
                            Seleccione una OP y genere el estimado de cuero
                          </td>
                        </tr>
                      ))
                    : (report?.data ? renderRows() : (
                      <tr>
                        <td colSpan={colSpanForEmpty} className="text-center text-muted">
                          Seleccione filtros y genere el reporte
                        </td>
                      </tr>
                    ))}
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
