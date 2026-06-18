import React, { useMemo, useState } from "react";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Col, Collapse, Input, Progress, Row,
} from "reactstrap";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";
import WarehouseOrderDetail from "./WarehouseOrderDetail";
import {
  STATUS_LABELS,
  STATUS_STYLES,
  DEFAULT_BADGE_STYLE,
  filterOrders,
  getPendingReceiptQty,
  getOrderQtyProgress,
} from "./warehouseUtils";

const WarehouseReceiptTab = ({ orders, onRefresh }) => {
  const [orderTypeFilter, setOrderTypeFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [expanded, setExpanded] = useState({});

  const filteredOrders = useMemo(
    () => filterOrders(orders, { orderTypeFilter, searchTerm }),
    [orders, orderTypeFilter, searchTerm]
  );

  const receiptOrders = useMemo(
    () => filteredOrders.filter((o) => getPendingReceiptQty(o) > 0 || !o.warehouseReceiptClosedAt),
    [filteredOrders]
  );

  const totals = useMemo(() => ({
    pendingReceipt: filteredOrders.filter((o) => getPendingReceiptQty(o) > 0).length,
  }), [filteredOrders]);

  const toggle = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

  return (
    <>
      <Row className="mb-2">
        <Col md="7">
          <div className="d-flex flex-wrap" style={{ gap: 8 }}>
            {["ALL", "NORMAL", "VENTA_EN_LINEA", "DISTRIBUTION"].map((key) => (
              <Button
                key={key}
                size="sm"
                color={orderTypeFilter === key ? "primary" : "secondary"}
                outline={orderTypeFilter !== key}
                onClick={() => setOrderTypeFilter(key)}
              >
                {key === "ALL" ? "Todas" : key.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </Col>
        <Col md="5">
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código OP..."
          />
        </Col>
      </Row>

      <Row className="mb-3">
        <Col>
          <Badge color="warning" className="p-2 mr-2">
            {totals.pendingReceipt} con recepción pendiente
          </Badge>
          <Badge color="primary" className="p-2">
            {receiptOrders.length} órdenes visibles
          </Badge>
        </Col>
      </Row>

      {receiptOrders.length === 0 && (
        <Alert color="success">No hay órdenes pendientes de recepción con los filtros actuales.</Alert>
      )}

      {receiptOrders.map((order) => {
        const orderId = order.productionOrderId;
        const isOpen = !!expanded[orderId];
        const progress = getOrderQtyProgress(order);
        return (
          <Card key={orderId} className="mb-3 border">
            <CardHeader
              className="py-2"
              style={{ cursor: "pointer", backgroundColor: "#f8f9fa" }}
              onClick={() => toggle(orderId)}
            >
              <Row className="align-items-center">
                <Col md="4">
                  <strong>{formatProductionOrderCodeDate(order)}</strong>
                  <br />
                  <span style={STATUS_STYLES[order.status] || DEFAULT_BADGE_STYLE}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </Col>
                <Col md="4">
                  <small>Piezas recibidas (ítems): {progress.produced}/{progress.total}</small>
                  <Progress value={progress.pct} className="mt-1" style={{ height: 6 }} />
                </Col>
                <Col md="4" className="text-right">
                  <Badge color={getPendingReceiptQty(order) > 0 ? "warning" : "success"}>
                    {getPendingReceiptQty(order) > 0 ? "Pendiente recepción" : "Al día"}
                  </Badge>
                </Col>
              </Row>
            </CardHeader>
            <Collapse isOpen={isOpen}>
              <CardBody>
                <WarehouseOrderDetail order={order} mode="receipt" onRefresh={onRefresh} />
              </CardBody>
            </Collapse>
          </Card>
        );
      })}
    </>
  );
};

export default WarehouseReceiptTab;
