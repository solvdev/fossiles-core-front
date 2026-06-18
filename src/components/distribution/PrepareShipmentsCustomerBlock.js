import React from "react";
import { Card, CardBody, Col, Row } from "reactstrap";
import { formatDateGt } from "utils/dateTimeHelper";

function Field({ label, value }) {
  return (
    <Col md="4" sm="6" className="mb-2">
      <small className="text-muted d-block">{label}</small>
      <span>{value || "—"}</span>
    </Col>
  );
}

function PrepareShipmentsCustomerBlock({ order, compact = false }) {
  if (!order) return null;
  const delivery = order.deliveryDate ? formatDateGt(order.deliveryDate) : "—";

  if (compact) {
    return (
      <div className="small">
        <div>
          <strong>{order.customerName || "—"}</strong>
        </div>
        {order.customerPhone ? <div>{order.customerPhone}</div> : null}
        {order.customerAddress ? (
          <div className="text-muted">{order.customerAddress}</div>
        ) : null}
        <div className="text-muted">Entrega: {delivery}</div>
      </div>
    );
  }

  return (
    <Card className="mb-3 border-light">
      <CardBody className="py-2">
        <Row>
          <Field label="Cliente" value={order.customerName} />
          <Field label="Dirección" value={order.customerAddress} />
          <Field label="Teléfono" value={order.customerPhone} />
          <Field label="NIT / CF" value={order.customerTaxId} />
          <Field label="Vendedor" value={order.sellerName} />
          <Field label="Entrega" value={delivery} />
          <Field label="Código OP" value={order.code} />
        </Row>
      </CardBody>
    </Card>
  );
}

export default PrepareShipmentsCustomerBlock;
