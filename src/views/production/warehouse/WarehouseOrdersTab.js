import React, { useMemo, useState } from "react";
import {
  Alert, Badge, Button, Card, CardBody, CardHeader, Col, Collapse, Input, Progress, Row,
} from "reactstrap";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";
import WarehouseOrderDetail from "./WarehouseOrderDetail";
import {
  STATUS_LABELS,
  STATUS_STYLES,
  DISPATCH_TYPE_LABELS,
  DISPATCH_TYPE_STYLES,
  DEFAULT_BADGE_STYLE,
  filterOrders,
  getOrderQtyProgress,
} from "./warehouseUtils";

const WarehouseOrdersTab = ({ orders, onRefresh }) => {
  const [orderTypeFilter, setOrderTypeFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [expanded, setExpanded] = useState({});

  const filteredOrders = useMemo(
    () => filterOrders(orders, { orderTypeFilter, searchTerm }),
    [orders, orderTypeFilter, searchTerm]
  );

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

      <p className="text-muted mb-3">
        Expediente por orden: estado de cada pieza, cierre de recepción y despachos a cliente o kiosco.
      </p>

      {filteredOrders.length === 0 && (
        <Alert color="info">No hay órdenes con los filtros actuales.</Alert>
      )}

      {filteredOrders.map((order) => {
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
                <Col md="3">
                  <strong>{formatProductionOrderCodeDate(order)}</strong>
                  <br />
                  <span style={STATUS_STYLES[order.status] || DEFAULT_BADGE_STYLE}>
                    {STATUS_LABELS[order.status] || order.status}
                  </span>
                </Col>
                <Col md="3">
                  <span style={DISPATCH_TYPE_STYLES[order.dispatchType] || DISPATCH_TYPE_STYLES.DIRECT}>
                    {DISPATCH_TYPE_LABELS[order.dispatchType] || order.dispatchType}
                  </span>
                  <br />
                  <small className="text-muted">{order.orderType}</small>
                </Col>
                <Col md="3">
                  <small>Tareas: {order.completedTasks}/{order.totalTasks}</small>
                  <Progress value={order.totalTasks ? Math.round((order.completedTasks / order.totalTasks) * 100) : 0} className="mt-1" style={{ height: 6 }} />
                </Col>
                <Col md="3" className="text-right">
                  <small>Recepción: {progress.produced}/{progress.total}</small>
                  {order.warehouseReceiptClosedAt && (
                    <Badge color="dark" className="d-block mt-1">Bodega cerrada</Badge>
                  )}
                </Col>
              </Row>
            </CardHeader>
            <Collapse isOpen={isOpen}>
              <CardBody>
                <WarehouseOrderDetail order={order} mode="orders" onRefresh={onRefresh} />
              </CardBody>
            </Collapse>
          </Card>
        );
      })}
    </>
  );
};

export default WarehouseOrdersTab;
