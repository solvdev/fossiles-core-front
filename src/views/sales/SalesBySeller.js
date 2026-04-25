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

function SalesBySeller() {
  const [selectedSeller, setSelectedSeller] = useState("");
  const [sales, setSales] = useState([]);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Ventas por Vendedor</CardTitle>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="4">
                  <Label>Filtrar por Vendedor</Label>
                  <Input
                    type="select"
                    value={selectedSeller}
                    onChange={(e) => setSelectedSeller(e.target.value)}
                  >
                    <option value="">Todos los vendedores</option>
                    <option value="luis-felipe">Luis Felipe</option>
                  </Input>
                </Col>
              </Row>
              {sales.length === 0 ? (
                <div className="text-center"><p>No hay ventas de vendedores registradas.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Fecha</th>
                      <th>Vendedor</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((sale) => (
                      <tr key={sale.id}>
                        <td>{sale.date}</td>
                        <td>{sale.sellerName}</td>
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

export default SalesBySeller;

