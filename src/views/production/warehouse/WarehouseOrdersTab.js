import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Card, CardBody, Col, Collapse, Input, InputGroup, InputGroupAddon, InputGroupText, Progress, Row,
} from "reactstrap";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";
import WarehouseOrderDetail from "./WarehouseOrderDetail";
import {
  RECENT_DATE_OPTIONS,
  STATUS_LABELS,
  STATUS_STYLES,
  DISPATCH_TYPE_LABELS,
  DISPATCH_TYPE_STYLES,
  DEFAULT_BADGE_STYLE,
  ORDER_TYPE_FILTER_OPTIONS,
  PAGE_SIZE_RECEIPT,
  filterOrders,
  getOrderCustomerHint,
  getOrderProductHint,
  getOrderTypeLabel,
  getOrderQtyProgress,
} from "./warehouseUtils";

const WarehouseOrdersTab = ({ orders, onRefresh }) => {
  const [orderTypeFilter, setOrderTypeFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [recent, setRecent] = useState("30");
  const [expandedId, setExpandedId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE_RECEIPT);

  const filteredOrders = useMemo(
    () => filterOrders(orders, { orderTypeFilter, searchTerm, recent, pendingFirst: true }),
    [orders, orderTypeFilter, searchTerm, recent]
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE_RECEIPT);
    setExpandedId(null);
  }, [orderTypeFilter, searchTerm, recent]);

  const visibleOrders = filteredOrders.slice(0, visibleCount);
  const hasMore = visibleCount < filteredOrders.length;
  const toggle = (id) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <>
      <div className="rounded border mb-3 p-3" style={{ background: "#f8f9fb" }}>
        <Row className="align-items-end">
          <Col lg="6" className="mb-2 mb-lg-0">
            <label className="small text-muted mb-1 d-block">Buscar OP, producto, cliente o envío</label>
            <InputGroup>
              <InputGroupAddon addonType="prepend">
                <InputGroupText>
                  <i className="nc-icon nc-zoom-split" />
                </InputGroupText>
              </InputGroupAddon>
              <Input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Ej. OP-88, OPL-12, cliente, producto…"
                style={{ minHeight: 42 }}
              />
            </InputGroup>
          </Col>
          <Col lg="3" className="mb-2 mb-lg-0">
            <label className="small text-muted mb-1 d-block">Fechas</label>
            <Input type="select" value={recent} onChange={(e) => setRecent(e.target.value)}>
              {RECENT_DATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Input>
          </Col>
          <Col lg="3">
            <label className="small text-muted mb-1 d-block">Tipo</label>
            <Input
              type="select"
              value={orderTypeFilter}
              onChange={(e) => setOrderTypeFilter(e.target.value)}
            >
              {ORDER_TYPE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Input>
          </Col>
        </Row>
      </div>

      <p className="text-muted mb-2">
        Expediente por orden: piezas, cierre de recepción y despachos.
        Mostrando <strong>{visibleOrders.length}</strong> de <strong>{filteredOrders.length}</strong>.
      </p>

      {filteredOrders.length === 0 && (
        <Alert color="info">No hay órdenes con los filtros actuales.</Alert>
      )}

      <div className="d-flex flex-column" style={{ gap: 10 }}>
        {visibleOrders.map((order) => {
          const orderId = order.productionOrderId;
          const isOpen = expandedId === orderId;
          const progress = getOrderQtyProgress(order);
          const typeLabel = getOrderTypeLabel(order);
          const customerHint = getOrderCustomerHint(order);
          const productHint = getOrderProductHint(order);

          return (
            <Card key={orderId} className="mb-0 border shadow-sm">
              <CardBody
                className="py-3"
                style={{ cursor: "pointer", background: isOpen ? "#f8f9fa" : "#fff" }}
                onClick={() => toggle(orderId)}
              >
                <Row className="align-items-center">
                  <Col md="3" className="mb-2 mb-md-0">
                    <strong>{formatProductionOrderCodeDate(order)}</strong>
                    <div className="mt-1">
                      <Badge color={typeLabel === "OPL" ? "primary" : "secondary"} pill className="mr-1">
                        {typeLabel}
                      </Badge>
                      <span style={STATUS_STYLES[order.status] || DEFAULT_BADGE_STYLE}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                    </div>
                    {customerHint ? <div className="small text-muted mt-1">{customerHint}</div> : null}
                  </Col>
                  <Col md="3" className="mb-2 mb-md-0">
                    <span style={DISPATCH_TYPE_STYLES[order.dispatchType] || DISPATCH_TYPE_STYLES.DIRECT}>
                      {DISPATCH_TYPE_LABELS[order.dispatchType] || order.dispatchType}
                    </span>
                    <div className="small text-muted mt-1">{productHint}</div>
                  </Col>
                  <Col md="3" className="mb-2 mb-md-0">
                    <small>Tareas: {order.completedTasks}/{order.totalTasks}</small>
                    <Progress
                      value={order.totalTasks ? Math.round((order.completedTasks / order.totalTasks) * 100) : 0}
                      className="mt-1"
                      style={{ height: 6 }}
                    />
                  </Col>
                  <Col md="3" className="text-md-right">
                    <small>Recepción: {progress.produced}/{progress.total}</small>
                    {order.warehouseReceiptClosedAt && (
                      <Badge color="dark" className="d-block mt-1 ml-md-auto" style={{ width: "fit-content" }}>
                        Bodega cerrada
                      </Badge>
                    )}
                  </Col>
                </Row>
              </CardBody>
              <Collapse isOpen={isOpen}>
                {isOpen && (
                  <div className="border-top px-3 pb-3">
                    <WarehouseOrderDetail order={order} mode="orders" onRefresh={onRefresh} />
                  </div>
                )}
              </Collapse>
            </Card>
          );
        })}
      </div>

      {hasMore && (
        <div className="text-center mt-3">
          <Button color="primary" outline onClick={() => setVisibleCount((n) => n + PAGE_SIZE_RECEIPT)}>
            Cargar más ({filteredOrders.length - visibleCount} restantes)
          </Button>
        </div>
      )}
    </>
  );
};

export default WarehouseOrdersTab;
