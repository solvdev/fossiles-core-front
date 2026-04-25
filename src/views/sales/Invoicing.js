import React, { useState } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Badge,
} from "reactstrap";

function Invoicing() {
  const [invoices, setInvoices] = useState([]);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Facturación / Recibos</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva Factura
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {invoices.length === 0 ? (
                <div className="text-center"><p>No hay facturas o recibos registrados.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Número</th>
                      <th>Cliente</th>
                      <th>Fecha</th>
                      <th>Total</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id}>
                        <td>{invoice.number}</td>
                        <td>{invoice.customerName}</td>
                        <td>{invoice.date}</td>
                        <td>Q {invoice.total}</td>
                        <td>{invoice.type}</td>
                        <td><Badge color="success">{invoice.status}</Badge></td>
                        <td className="text-right">
                          <Button color="info" size="sm" className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Ver
                          </Button>
                          <Button color="success" size="sm" className="btn-round">
                            <i className="nc-icon nc-paper" /> Imprimir
                          </Button>
                        </td>
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

export default Invoicing;

