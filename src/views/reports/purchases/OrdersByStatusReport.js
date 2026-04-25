import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Alert,
  Badge,
  Row,
  Col,
  FormGroup,
  Label,
  Input,
  Button,
} from "reactstrap";
import { getOrdersByStatusReport } from "services/purchaseReportService";
import { showError } from "utils/notificationHelper";
import { Bar } from "react-chartjs-2";
import * as XLSX from "xlsx";

function OrdersByStatusReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    try {
      setLoading(true);
      const data = await getOrdersByStatusReport(startDate || null, endDate || null);
      setReport(data);
    } catch (err) {
      showError(err.message || "Error al cargar el reporte");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => `Q ${parseFloat(amount || 0).toFixed(2)}`;

  const handleExportExcel = () => {
    if (!report) return;
    const statusSummary = report.statusSummary || {};
    const data = Object.values(statusSummary).map(s => ({
      Estado: s.status,
      Cantidad: s.count,
      "Total (Q)": parseFloat(s.totalAmount || 0),
      "%": parseFloat(s.percentage || 0).toFixed(2)
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Órdenes por Estado");
    XLSX.writeFile(wb, `ordenes_por_estado_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <p>Cargando...</p>;
  if (!report) return null;

  const statusSummary = report.statusSummary || {};
  const chartData = {
    labels: Object.values(statusSummary).map(s => s.status),
    datasets: [{
      label: "Total (Q)",
      data: Object.values(statusSummary).map(s => parseFloat(s.totalAmount || 0)),
      backgroundColor: ["#36a2eb", "#ff6384", "#ffce56", "#4bc0c0"]
    }]
  };

  return (
    <div>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle tag="h5">Reporte de Órdenes por Estado</CardTitle>
          <Button color="success" onClick={handleExportExcel} className="float-right">
            <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
          </Button>
        </CardHeader>
        <CardBody>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Fecha Inicio</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Fecha Fin</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </FormGroup>
            </Col>
            <Col md="4" className="d-flex align-items-end">
              <Button color="primary" onClick={loadReport}>Generar</Button>
            </Col>
          </Row>
        </CardBody>
      </Card>

      <Alert color="info">
        <strong>Resumen:</strong> Total Órdenes: {report.totalOrders} | 
        Total: {formatCurrency(report.totalAmount)}
      </Alert>

      <Row>
        <Col md="6">
          <Card>
            <CardHeader><CardTitle tag="h6">Gráfica Resumen</CardTitle></CardHeader>
            <CardBody><Bar data={chartData} /></CardBody>
          </Card>
        </Col>
        <Col md="6">
          <Card>
            <CardHeader><CardTitle tag="h6">Detalle por Estado</CardTitle></CardHeader>
            <CardBody>
              <Table>
                <thead>
                  <tr>
                    <th>Estado</th>
                    <th>Cantidad</th>
                    <th>Total</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(statusSummary).map((s, idx) => (
                    <tr key={idx}>
                      <td><Badge color="info">{s.status}</Badge></td>
                      <td>{s.count}</td>
                      <td>{formatCurrency(s.totalAmount)}</td>
                      <td>{s.percentage?.toFixed(2)}%</td>
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

export default OrdersByStatusReport;

