import React, { useState } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Input,
  Label,
  Button,
} from "reactstrap";

function InventoryReports() {
  const [reportType, setReportType] = useState("rotation");

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Reportes de Inventarios</CardTitle>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="4">
                  <Label>Tipo de Reporte</Label>
                  <Input
                    type="select"
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value)}
                  >
                    <option value="rotation">Rotación</option>
                    <option value="consumption">Consumo</option>
                    <option value="locations">Por Ubicaciones</option>
                  </Input>
                </Col>
                <Col md="4" className="d-flex align-items-end">
                  <Button color="primary" className="btn-round">
                    <i className="nc-icon nc-zoom-split" /> Generar Reporte
                  </Button>
                </Col>
              </Row>
              <Table responsive>
                <thead className="text-primary">
                  <tr>
                    <th>Producto</th>
                    <th>Rotación</th>
                    <th>Consumo</th>
                    <th>Stock Actual</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan="4" className="text-center text-muted">
                      Seleccione tipo de reporte y genere
                    </td>
                  </tr>
                </tbody>
              </Table>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default InventoryReports;

