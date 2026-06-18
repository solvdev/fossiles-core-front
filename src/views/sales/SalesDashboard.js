import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, Line } from "react-chartjs-2";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { getSalesDashboard } from "services/salesDashboardService";
import { formatDateGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";

const ACTIONS = [
  { label: "Ventas totales", path: "/admin/total-sales", color: "primary" },
  { label: "Online", path: "/admin/online-sales", color: "info" },
  { label: "Kiosko POS", path: "/admin/kiosk-sales", color: "success" },
  { label: "Por vendedor", path: "/admin/sales-by-seller", color: "warning" },
  { label: "Reportes", path: "/admin/sales-reports", color: "secondary" },
];

const CHANNEL_LINKS = {
  KIOSKO: "/admin/kiosk-sales",
  ONLINE: "/admin/online-sales",
  VENDOR: "/admin/sales-by-seller",
};

const monthStart = (ymd) => {
  if (!ymd) return "";
  return `${ymd.slice(0, 7)}-01`;
};

const fmtMoney = (value) => `Q ${Number(value || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtQty = (value) => Number(value || 0).toLocaleString("es-GT", { maximumFractionDigits: 0 });
const fmtPct = (value) => {
  const num = Number(value || 0);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(1)}%`;
};

const growthBadgeColor = (value) => {
  const num = Number(value || 0);
  if (num > 0) return "success";
  if (num < 0) return "danger";
  return "secondary";
};

const chartOptions = (currency = false) => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { display: true, position: "top" } },
  scales: {
    y: {
      ticks: {
        color: "#9f9f9f",
        beginAtZero: true,
        callback: currency
          ? (value) => Number(value).toLocaleString("es-GT")
          : undefined,
      },
      grid: { drawBorder: false, color: "#edf2f7" },
    },
    x: {
      grid: { display: false },
      ticks: { color: "#9f9f9f" },
    },
  },
});

function ChannelCard({ title, summary, onOpen, onOpenToday }) {
  if (!summary) return null;
  return (
    <Card className="h-100" style={{ cursor: onOpen ? "pointer" : "default" }} onClick={onOpen}>
      <CardBody>
        <div className="d-flex justify-content-between align-items-start">
          <h6 className="mb-2">{title}</h6>
          {onOpen && <small className="text-primary">Ver detalle</small>}
        </div>
        <h3>{fmtMoney(summary.totalAmount)}</h3>
        <Badge color={growthBadgeColor(summary.growthPercent)}>{fmtPct(summary.growthPercent)}</Badge>
        <div className="mt-2 text-muted">
          <small>{summary.salesCount || 0} ventas en el periodo</small>
        </div>
        <div className="mt-1">
          <small className="text-muted">
            Hoy: {fmtMoney(summary.dailyAmount)}
            {onOpenToday && (
              <>
                {" · "}
                <Button color="link" className="p-0 align-baseline" onClick={(e) => { e.stopPropagation(); onOpenToday(); }}>
                  ver hoy
                </Button>
              </>
            )}
          </small>
        </div>
      </CardBody>
    </Card>
  );
}

function SalesDashboard() {
  const navigate = useNavigate();
  const today = getTodayYmdGuatemala();
  const [viewMode, setViewMode] = useState("general");
  const [selectedKiosk, setSelectedKiosk] = useState("all");
  const [startDate, setStartDate] = useState(monthStart(today));
  const [endDate, setEndDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);

  const kioskLocationId = viewMode === "kioskos" && selectedKiosk !== "all" ? selectedKiosk : undefined;

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await getSalesDashboard({
        startDate,
        endDate,
        kioskLocationId,
        scope: viewMode === "kioskos" ? "kiosko" : "all",
      });
      setData(response);
    } catch (err) {
      setError(err.message || "No se pudo cargar el dashboard de ventas.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, kioskLocationId, viewMode]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const openTotalSales = (extra = {}) => {
    const params = new URLSearchParams({ startDate, endDate, ...extra });
    navigate(`/admin/total-sales?${params.toString()}`);
  };

  const openChannel = (channel) => {
    const path = CHANNEL_LINKS[channel];
    if (path) navigate(path);
  };

  const monthlyChart = useMemo(() => {
    const trend = data?.monthlyTrend || [];
    return {
      labels: trend.map((row) => row.label),
      datasets: viewMode === "general"
        ? [
            { label: "Kioskos", data: trend.map((r) => r.kiosko), borderColor: "#6bd098", backgroundColor: "#6bd098", tension: 0.35 },
            { label: "Online", data: trend.map((r) => r.online), borderColor: "#fcc468", backgroundColor: "#fcc468", tension: 0.35 },
            { label: "Vendedor LF", data: trend.map((r) => r.vendor), borderColor: "#2CA8FF", backgroundColor: "#2CA8FF", tension: 0.35 },
          ]
        : [
            { label: "Total", data: trend.map((r) => r.total), borderColor: "#4cbdd7", backgroundColor: "#4cbdd7", tension: 0.35 },
          ],
    };
  }, [data, viewMode]);

  const channelChart = useMemo(() => {
    if (viewMode !== "general" || !data) return null;
    return {
      labels: ["Kioskos", "Vendedor LF", "Online"],
      datasets: [{
        label: "Ventas",
        data: [data.kiosko?.totalAmount, data.vendor?.totalAmount, data.online?.totalAmount],
        backgroundColor: ["#6bd098", "#2CA8FF", "#fcc468"],
      }],
    };
  }, [data, viewMode]);

  const kioskChart = useMemo(() => {
    if (viewMode !== "kioskos" || selectedKiosk !== "all" || !data?.kiosks?.length) return null;
    return {
      labels: data.kiosks.map((k) => k.kioskName),
      datasets: [{
        label: "Ventas",
        data: data.kiosks.map((k) => k.totalAmount),
        backgroundColor: "#4cbdd7",
      }],
    };
  }, [data, viewMode, selectedKiosk]);

  const productsChart = useMemo(() => ({
    labels: (data?.topProducts || []).map((p) => p.productName),
    datasets: [{
      label: "Unidades",
      data: (data?.topProducts || []).map((p) => p.units),
      backgroundColor: "#ef8156",
    }],
  }), [data]);

  const showGeneralChannels = viewMode === "general";
  const totals = data?.totals;
  const kioskTotals = data?.kiosko;
  const periodAmount = viewMode === "kioskos" ? kioskTotals?.totalAmount : totals?.totalAmount;
  const dailyAmount = viewMode === "kioskos" ? kioskTotals?.dailyAmount : totals?.dailyAmount;
  const periodGrowth = viewMode === "kioskos" ? kioskTotals?.growthPercent : totals?.growthPercent;
  const periodCount = viewMode === "kioskos" ? kioskTotals?.salesCount : totals?.salesCount;
  const recentSales = data?.recentSales || [];

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <Row className="align-items-end">
            <Col md="3">
              <CardTitle tag="h4" className="mb-0">Dashboard de ventas</CardTitle>
              <small className="text-muted">Datos reales de kiosko, online y vendedor LF</small>
            </Col>
            <Col md="2">
              <Label>Desde</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </Col>
            <Col md="2">
              <Label>Hasta</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </Col>
            <Col md="2">
              <Label>Vista</Label>
              <Input
                type="select"
                value={viewMode}
                onChange={(e) => {
                  setViewMode(e.target.value);
                  if (e.target.value === "general") setSelectedKiosk("all");
                }}
              >
                <option value="general">General (todos los canales)</option>
                <option value="kioskos">Kioskos</option>
              </Input>
            </Col>
            {viewMode === "kioskos" && (
              <Col md="2">
                <Label>Kiosko</Label>
                <Input type="select" value={selectedKiosk} onChange={(e) => setSelectedKiosk(e.target.value)}>
                  <option value="all">Todos los kioskos</option>
                  {(data?.kiosks || []).map((kiosk) => (
                    <option key={kiosk.kioskId} value={String(kiosk.kioskId)}>
                      {kiosk.kioskName}
                    </option>
                  ))}
                </Input>
              </Col>
            )}
            <Col md="1" className="d-flex align-items-end">
              <Button color="primary" outline onClick={loadDashboard} disabled={loading}>
                {loading ? <Spinner size="sm" /> : "Actualizar"}
              </Button>
            </Col>
          </Row>
        </CardHeader>
      </Card>

      <Row className="mt-3 mb-2">
        {ACTIONS.map((action) => (
          <Col md="2" sm="4" xs="6" key={action.path} className="mb-2">
            <Button color={action.color} block outline onClick={() => navigate(action.path)}>
              {action.label}
            </Button>
          </Col>
        ))}
      </Row>

      {error && <Alert color="danger">{error}</Alert>}

      {showGeneralChannels && data && (
        <Row className="mt-2">
          <Col md="4">
            <ChannelCard
              title="Ventas por kioskos"
              summary={data.kiosko}
              onOpen={() => openChannel("KIOSKO")}
              onOpenToday={() => openTotalSales({ channel: "kiosko", startDate: today, endDate: today })}
            />
          </Col>
          <Col md="4">
            <ChannelCard
              title="Ventas por vendedor LF"
              summary={data.vendor}
              onOpen={() => openChannel("VENDOR")}
              onOpenToday={() => openTotalSales({ channel: "vendedor", startDate: today, endDate: today })}
            />
          </Col>
          <Col md="4">
            <ChannelCard
              title="Ventas online"
              summary={data.online}
              onOpen={() => openChannel("ONLINE")}
              onOpenToday={() => openTotalSales({ channel: "online", startDate: today, endDate: today })}
            />
          </Col>
        </Row>
      )}

      <Row className="mt-3">
        <Col md="4">
          <Card>
            <CardBody>
              <h6>{viewMode === "kioskos" ? "Ventas kiosko del periodo" : "Ventas del periodo"}</h6>
              <h3>{fmtMoney(periodAmount)}</h3>
              <Badge color={growthBadgeColor(periodGrowth)}>{fmtPct(periodGrowth)}</Badge>
              <div className="mt-2 text-muted">
                <small>{periodCount || 0} operaciones</small>
              </div>
            </CardBody>
          </Card>
        </Col>
        <Col md="4">
          <Card>
            <CardBody>
              <h6>{viewMode === "kioskos" ? "Ventas kiosko de hoy" : "Ventas de hoy"}</h6>
              <h3>{fmtMoney(dailyAmount)}</h3>
              <Button color="link" className="p-0" onClick={() => openTotalSales({ startDate: today, endDate: today })}>
                Ver detalle de hoy
              </Button>
            </CardBody>
          </Card>
        </Col>
        <Col md="4">
          <Card>
            <CardHeader><CardTitle tag="h6">Productos más vendidos</CardTitle></CardHeader>
            <CardBody>
              {(data?.topProducts || []).length === 0 ? (
                <small className="text-muted">Sin datos en el periodo</small>
              ) : (
                <ul className="list-unstyled mb-0">
                  {data.topProducts.map((product) => (
                    <li key={product.productName} className="mb-2">
                      <strong>{product.productName}</strong> ({fmtQty(product.units)} uds)
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="mt-3">
        <Col md={showGeneralChannels ? 4 : selectedKiosk === "all" ? 4 : 6}>
          <Card>
            <CardHeader><CardTitle tag="h5">Tendencia mensual</CardTitle></CardHeader>
            <CardBody>
              <div style={{ height: "300px" }}>
                {loading ? <div className="text-center py-5"><Spinner /></div> : (
                  <Line data={monthlyChart} options={chartOptions(true)} />
                )}
              </div>
            </CardBody>
          </Card>
        </Col>
        {showGeneralChannels && channelChart && (
          <Col md="4">
            <Card>
              <CardHeader><CardTitle tag="h5">Ventas por canal</CardTitle></CardHeader>
              <CardBody>
                <div style={{ height: "300px" }}>
                  <Bar data={channelChart} options={chartOptions(true)} />
                </div>
              </CardBody>
            </Card>
          </Col>
        )}
        {viewMode === "kioskos" && selectedKiosk === "all" && kioskChart && (
          <Col md="4">
            <Card>
              <CardHeader><CardTitle tag="h5">Ventas por kiosko</CardTitle></CardHeader>
              <CardBody>
                <div style={{ height: "300px" }}>
                  <Bar data={kioskChart} options={chartOptions(true)} />
                </div>
              </CardBody>
            </Card>
          </Col>
        )}
        <Col md={showGeneralChannels ? 4 : selectedKiosk === "all" ? 4 : 6}>
          <Card>
            <CardHeader><CardTitle tag="h5">Top productos del periodo</CardTitle></CardHeader>
            <CardBody>
              <div style={{ height: "300px" }}>
                {(data?.topProducts || []).length === 0 ? (
                  <div className="text-muted text-center py-5">Sin productos en el periodo</div>
                ) : (
                  <Bar data={productsChart} options={chartOptions(false)} />
                )}
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="mt-3">
        <Col md="12">
          <Card>
            <CardHeader className="d-flex justify-content-between align-items-center">
              <CardTitle tag="h5" className="mb-0">Últimas ventas del periodo</CardTitle>
              <Button color="primary" size="sm" outline onClick={() => openTotalSales()}>
                Ver todas las ventas
              </Button>
            </CardHeader>
            <CardBody>
              <Table responsive>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Canal</th>
                    <th>Referencia</th>
                    <th>Producto</th>
                    <th>Cantidad</th>
                    <th>Total</th>
                    {(viewMode === "kioskos" || showGeneralChannels) && <th>Detalle</th>}
                  </tr>
                </thead>
                <tbody>
                  {recentSales.map((sale) => (
                    <tr key={sale.id}>
                      <td>{formatDateGt(sale.saleDate)}</td>
                      <td>{sale.channelLabel}</td>
                      <td>{sale.reference || "-"}</td>
                      <td>{sale.productName}</td>
                      <td>{fmtQty(sale.quantity)}</td>
                      <td>{fmtMoney(sale.totalAmount)}</td>
                      <td>
                        {sale.kioskName || sale.sellerName || "-"}
                      </td>
                    </tr>
                  ))}
                  {!loading && recentSales.length === 0 && (
                    <tr>
                      <td colSpan="7" className="text-center text-muted">No hay ventas en el periodo seleccionado</td>
                    </tr>
                  )}
                  {loading && (
                    <tr>
                      <td colSpan="7" className="text-center"><Spinner size="sm" /></td>
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

export default SalesDashboard;
