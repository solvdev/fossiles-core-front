import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Alert,
  Badge,
  FormGroup,
  Label,
  Input,
  Button,
} from "reactstrap";
import { getExecutiveDashboard } from "services/purchaseReportService";
import { showError } from "utils/notificationHelper";
import { Line, Doughnut } from "react-chartjs-2";
import * as XLSX from "xlsx";

function ExecutiveDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getExecutiveDashboard(startDate, endDate);
      setDashboard(data);
    } catch (err) {
      setError(err.message || "Error al cargar el dashboard");
      showError(err.message || "Error al cargar el dashboard");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    if (!amount) return "Q 0.00";
    return `Q ${parseFloat(amount).toFixed(2)}`;
  };

  const handleExportExcel = () => {
    if (!dashboard) return;

    const worksheetData = [
      ["DASHBOARD EJECUTIVO DE COMPRAS"],
      ["Período:", `${startDate} a ${endDate}`],
      [],
      ["MÉTRICAS PRINCIPALES"],
      ["Total Comprado", formatCurrency(dashboard.metrics?.totalPurchasedPeriod)],
      ["Total de Órdenes", dashboard.metrics?.totalOrders],
      ["Proveedores Activos", dashboard.metrics?.activeSuppliers],
      ["Materiales Críticos", dashboard.metrics?.criticalMaterials],
      ["Valor Promedio Orden", formatCurrency(dashboard.metrics?.averageOrderValue)],
      ["Órdenes Pendientes", dashboard.metrics?.pendingOrders],
      ["Órdenes Recibidas", dashboard.metrics?.receivedOrders],
      [],
      ["ÓRDENES RECIENTES"],
      ["Código", "Proveedor", "Total", "Estado", "Fecha"],
      ...(dashboard.recentOrders || []).map(order => [
        order.code,
        order.supplierName,
        formatCurrency(order.total),
        order.status,
        order.orderDate
      ]),
      [],
      ["MATERIALES CRÍTICOS"],
      ["SKU", "Nombre", "Stock Actual", "Stock Mínimo", "Prioridad", "Cantidad Sugerida"],
      ...(dashboard.topCriticalMaterials || []).map(mat => [
        mat.sku,
        mat.name,
        mat.currentStock,
        mat.minStock,
        mat.priority,
        mat.suggestedQuantity
      ])
    ];

    const ws = XLSX.utils.aoa_to_sheet(worksheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dashboard Ejecutivo");
    XLSX.writeFile(wb, `dashboard_ejecutivo_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <p>Cargando dashboard...</p>;
  if (error) return <Alert color="danger">{error}</Alert>;
  if (!dashboard) return null;

  const metrics = dashboard.metrics || {};
  const monthlyTrend = dashboard.monthlyTrend || {};

  // Datos para gráficas
  const monthlyTrendData = {
    labels: Object.keys(monthlyTrend),
    datasets: [{
      label: "Compras Mensuales",
      data: Object.values(monthlyTrend).map(v => parseFloat(v)),
      borderColor: "rgb(75, 192, 192)",
      backgroundColor: "rgba(75, 192, 192, 0.2)",
    }]
  };

  const statusData = {
    labels: ["Pendientes", "Recibidas"],
    datasets: [{
      data: [metrics.pendingOrders || 0, metrics.receivedOrders || 0],
      backgroundColor: ["#ff6384", "#36a2eb"],
    }]
  };

  return (
    <div>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle tag="h5">Dashboard Ejecutivo de Compras</CardTitle>
          <div className="float-right">
            <Button color="success" onClick={handleExportExcel}>
              <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <Row className="mb-3">
            <Col md="3">
              <FormGroup>
                <Label>Fecha Inicio</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Fecha Fin</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="3" className="d-flex align-items-end">
              <Button color="primary" onClick={loadDashboard}>
                Actualizar
              </Button>
            </Col>
          </Row>
        </CardBody>
      </Card>

      {/* Métricas Principales */}
      <Row>
        <Col md="3">
          <Card className="card-stats">
            <CardBody>
              <Row>
                <Col md="5">
                  <div className="icon-big text-center icon-warning">
                    <i className="nc-icon nc-money-coins text-warning" />
                  </div>
                </Col>
                <Col md="7">
                  <div className="numbers">
                    <p className="card-category">Total Comprado</p>
                    <CardTitle tag="p">{formatCurrency(metrics.totalPurchasedPeriod)}</CardTitle>
                  </div>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card className="card-stats">
            <CardBody>
              <Row>
                <Col md="5">
                  <div className="icon-big text-center icon-warning">
                    <i className="nc-icon nc-paper text-info" />
                  </div>
                </Col>
                <Col md="7">
                  <div className="numbers">
                    <p className="card-category">Total Órdenes</p>
                    <CardTitle tag="p">{metrics.totalOrders || 0}</CardTitle>
                  </div>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card className="card-stats">
            <CardBody>
              <Row>
                <Col md="5">
                  <div className="icon-big text-center icon-warning">
                    <i className="nc-icon nc-badge text-success" />
                  </div>
                </Col>
                <Col md="7">
                  <div className="numbers">
                    <p className="card-category">Proveedores Activos</p>
                    <CardTitle tag="p">{metrics.activeSuppliers || 0}</CardTitle>
                  </div>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
        <Col md="3">
          <Card className="card-stats">
            <CardBody>
              <Row>
                <Col md="5">
                  <div className="icon-big text-center icon-warning">
                    <i className="nc-icon nc-alert-circle-i text-danger" />
                  </div>
                </Col>
                <Col md="7">
                  <div className="numbers">
                    <p className="card-category">Materiales Críticos</p>
                    <CardTitle tag="p">{metrics.criticalMaterials || 0}</CardTitle>
                  </div>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="mt-3">
        <Col md="6">
          <Card>
            <CardHeader>
              <CardTitle tag="h6">Tendencia Mensual de Compras</CardTitle>
            </CardHeader>
            <CardBody>
              {Object.keys(monthlyTrend).length > 0 ? (
                <Line data={monthlyTrendData} />
              ) : (
                <p>No hay datos para mostrar</p>
              )}
            </CardBody>
          </Card>
        </Col>
        <Col md="6">
          <Card>
            <CardHeader>
              <CardTitle tag="h6">Estado de Órdenes</CardTitle>
            </CardHeader>
            <CardBody>
              <Doughnut data={statusData} />
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Órdenes Recientes */}
      <Card className="mt-3">
        <CardHeader>
          <CardTitle tag="h6">Órdenes Recientes</CardTitle>
        </CardHeader>
        <CardBody>
          <Table responsive>
            <thead>
              <tr>
                <th>Código</th>
                <th>Proveedor</th>
                <th>Total</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard.recentOrders || []).map((order) => (
                <tr key={order.id}>
                  <td>{order.code}</td>
                  <td>{order.supplierName}</td>
                  <td>{formatCurrency(order.total)}</td>
                  <td>
                    <Badge
                      color={
                        order.status === "RECIBIDA"
                          ? "success"
                          : order.status === "CREADA"
                          ? "info"
                          : "warning"
                      }
                    >
                      {order.status}
                    </Badge>
                  </td>
                  <td>{new Date(order.orderDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {/* Materiales Críticos */}
      <Card className="mt-3">
        <CardHeader>
          <CardTitle tag="h6">Top 10 Materiales Críticos</CardTitle>
        </CardHeader>
        <CardBody>
          <Table responsive>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nombre</th>
                <th>Stock Actual</th>
                <th>Stock Mínimo</th>
                <th>Prioridad</th>
                <th>Cantidad Sugerida</th>
              </tr>
            </thead>
            <tbody>
              {(dashboard.topCriticalMaterials || []).map((mat) => (
                <tr key={mat.materialId}>
                  <td>{mat.sku}</td>
                  <td>{mat.name}</td>
                  <td>{mat.currentStock}</td>
                  <td>{mat.minStock}</td>
                  <td>
                    <Badge
                      color={
                        mat.priority === "ALTA"
                          ? "danger"
                          : mat.priority === "MEDIA"
                          ? "warning"
                          : "info"
                      }
                    >
                      {mat.priority}
                    </Badge>
                  </td>
                  <td>{mat.suggestedQuantity}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default ExecutiveDashboard;

