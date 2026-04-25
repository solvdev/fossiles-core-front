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
} from "reactstrap";

function MaterialsInventory() {
  const [selectedLocation, setSelectedLocation] = useState("");

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Inventario de Materiales</CardTitle>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="4">
                  <Label>Filtrar por Ubicación</Label>
                  <Input
                    type="select"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                  >
                    <option value="">Todas las ubicaciones</option>
                    <option value="1">Bodega MP</option>
                    <option value="2">Planta</option>
                  </Input>
                </Col>
              </Row>
              <Table responsive>
                <thead className="text-primary">
                  <tr>
                    <th>Material</th>
                    <th>SKU</th>
                    <th>Ubicación</th>
                    <th>Stock Actual</th>
                    <th>Stock Mínimo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan="6" className="text-center text-muted">
                      No hay inventario registrado
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

export default MaterialsInventory;

