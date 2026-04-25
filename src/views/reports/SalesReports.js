import React, { useState } from "react";
import { Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Input, Label, Button, Alert } from "reactstrap";
import { getGeneralKioskReport } from "services/kioskPosService";

function SalesReports() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  const formatCurrency = (value) => `Q ${Number(value || 0).toFixed(2)}`;
  const formatQty = (value) => Number(value || 0).toFixed(2);

  const generateReport = async () => {
    try {
      setLoading(true);
      setError("");
      const response = await getGeneralKioskReport(startDate || undefined, endDate || undefined);
      setReport(response || null);
    } catch (err) {
      setError(err.message || "No se pudo generar el reporte general de kioskos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content">
      <Row><Col md="12">
        <Card><CardHeader><CardTitle tag="h4">Reportes de Ventas</CardTitle></CardHeader>
          <CardBody>
            {error && <Alert color="danger">{error}</Alert>}
            <Row className="mb-3">
              <Col md="3"><Label>Inicio</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </Col>
              <Col md="3"><Label>Fin</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Col>
              <Col md="3" className="d-flex align-items-end">
                <Button color="primary" className="btn-round" onClick={generateReport} disabled={loading}>
                  <i className="nc-icon nc-zoom-split" /> {loading ? "Generando..." : "Generar"}
                </Button>
              </Col>
            </Row>

            <Row className="mb-3">
              <Col md="4"><Card body><strong>Total ventas:</strong> {report?.salesCount || 0}</Card></Col>
              <Col md="4"><Card body><strong>Total unidades:</strong> {formatQty(report?.totalItems || 0)}</Card></Col>
              <Col md="4"><Card body><strong>Total monto:</strong> {formatCurrency(report?.totalAmount || 0)}</Card></Col>
            </Row>

            <Table responsive><thead className="text-primary"><tr><th>Kiosko</th><th>Ventas</th><th>Unidades</th><th>Total</th></tr></thead>
              <tbody>
                {(report?.kiosks || []).map((row) => (
                  <tr key={`report-kiosk-${row.kioskId}`}>
                    <td>{row.kioskName}</td>
                    <td>{row.salesCount}</td>
                    <td>{formatQty(row.totalItems)}</td>
                    <td>{formatCurrency(row.totalAmount)}</td>
                  </tr>
                ))}
                {(!report?.kiosks || report.kiosks.length === 0) && (
                  <tr><td colSpan="4" className="text-center text-muted">Seleccione fechas y genere el reporte</td></tr>
                )}
              </tbody>
            </Table>
          </CardBody>
        </Card>
      </Col></Row>
    </div>
  );
}
export default SalesReports;

