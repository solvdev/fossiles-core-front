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

function TotalSales() {
  const [sales, setSales] = useState([]);
  const [filter, setFilter] = useState("all");

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Ventas Totales</CardTitle>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="4">
                  <Label>Filtrar por Canal</Label>
                  <Input
                    type="select"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="all">Todos los canales</option>
                    <option value="kiosko">Kioskos</option>
                    <option value="vendedor">Vendedor Directo</option>
                    <option value="online">Online</option>
                  </Input>
                </Col>
              </Row>
              {sales.length === 0 ? (
                <div className="text-center"><p>No hay ventas registradas.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Fecha</th>
                      <th>Canal</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{sale.date}</td>
                        <td>{sale.channel}</td>
                        <td>{sale.productName}</td>
                        <td>{sale.quantity}</td>
                        <td>Q {sale.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default TotalSales;

