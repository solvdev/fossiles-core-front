import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Alert,
  Row,
  Col,
  FormGroup,
  Label,
  Input,
  Button,
} from "reactstrap";
import { getPurchasesBySupplierReport } from "services/purchaseReportService";
import { showError } from "utils/notificationHelper";
import { Bar } from "react-chartjs-2";
import * as XLSX from "xlsx";

function PurchasesBySupplierReport() {
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
      const data = await getPurchasesBySupplierReport(startDate || null, endDate || null);
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
    const data = (report.suppliers || []).map(s => ({
      Proveedor: s.supplierName,
      "Número de Órdenes": s.orderCount,
      "Total (Q)": parseFloat(s.totalAmount || 0),
      "% Participación": parseFloat(s.percentage || 0).toFixed(2)
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compras por Proveedor");
    XLSX.writeFile(wb, `compras_por_proveedor_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <p>Cargando...</p>;
  if (!report) return null;

  const top10 = (report.suppliers || []).slice(0, 10);
  const chartData = {
    labels: top10.map(s => s.supplierName),
    datasets: [{
      label: "Total Compras (Q)",
      data: top10.map(s => parseFloat(s.totalAmount || 0)),
      backgroundColor: "#36a2eb"
    }]
  };

  return (
    <div>
      <Card className="mb-3">
        <CardHeader>
          <CardTitle tag="h5">Reporte de Compras por Proveedor</CardTitle>
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
        <strong>Resumen:</strong> Total: {formatCurrency(report.grandTotal)} | 
        Total Órdenes: {report.totalOrders} | 
        Proveedores: {report.suppliers?.length || 0}
      </Alert>

      <Row>
        <Col md="6">
          <Card>
            <CardHeader><CardTitle tag="h6">Top 10 Proveedores</CardTitle></CardHeader>
            <CardBody><Bar data={chartData} /></CardBody>
          </Card>
        </Col>
        <Col md="6">
          <Card>
            <CardHeader><CardTitle tag="h6">Lista Completa</CardTitle></CardHeader>
            <CardBody>
              <Table responsive>
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>Órdenes</th>
                    <th>Total</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.suppliers || []).map((s, idx) => (
                    <tr key={idx}>
                      <td>{s.supplierName}</td>
                      <td>{s.orderCount}</td>
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

export default PurchasesBySupplierReport;

