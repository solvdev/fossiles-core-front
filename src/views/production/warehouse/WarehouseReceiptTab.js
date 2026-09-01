import React, { useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Card, CardBody, Col, Collapse, Input, InputGroup, InputGroupAddon, InputGroupText, Progress, Row,
} from "reactstrap";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";
import WarehouseOrderDetail from "./WarehouseOrderDetail";
import {
  DISPATCH_TYPE_LABELS,
  ORDER_TYPE_FILTER_OPTIONS,
  PAGE_SIZE_RECEIPT,
  RECEIPT_WORK_PRESETS,
  RECENT_DATE_OPTIONS,
  STATUS_LABELS,
  STATUS_STYLES,
  DEFAULT_BADGE_STYLE,
  filterOrders,
  getOrderCustomerHint,
  getOrderProductHint,
  getOrderTypeLabel,
  getPendingReceiptQty,
  getOrderQtyProgress,
} from "./warehouseUtils";

const WarehouseReceiptTab = ({ orders, onRefresh, onOrderSummaryUpdate }) => {
  const [orderTypeFilter, setOrderTypeFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [recent, setRecent] = useState("30");
  const [receiptPreset, setReceiptPreset] = useState("PENDING");
  const [expandedId, setExpandedId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE_RECEIPT);

  const filteredOrders = useMemo(
    () => filterOrders(orders, {
      orderTypeFilter,
      searchTerm,
      recent,
      receiptPreset,
      pendingFirst: true,
    }),
    [orders, orderTypeFilter, searchTerm, recent, receiptPreset]
  );

  const receiptOrders = useMemo(() => {
    if (receiptPreset === "PENDING") return filteredOrders;
    return filteredOrders.filter((o) => getPendingReceiptQty(o) > 0 || !o.warehouseReceiptClosedAt);
  }, [filteredOrders, receiptPreset]);

  const totals = useMemo(() => {
    const pendingReceipt = (orders || []).filter((o) => getPendingReceiptQty(o) > 0).length;
    const pendingPieces = (orders || []).reduce((sum, o) => sum + getPendingReceiptQty(o), 0);
    const oplPending = (orders || []).filter(
      (o) => o.orderType === "VENTA_EN_LINEA" && getPendingReceiptQty(o) > 0
    ).length;
    return { pendingReceipt, pendingPieces, oplPending, visible: receiptOrders.length };
  }, [orders, receiptOrders.length]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE_RECEIPT);
    setExpandedId(null);
  }, [orderTypeFilter, searchTerm, recent, receiptPreset]);

  const visibleOrders = receiptOrders.slice(0, visibleCount);
  const hasMore = visibleCount < receiptOrders.length;

  const toggle = (id) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="warehouse-receipt-tab">
      <div
        className="rounded border mb-3 p-3"
        style={{ background: "linear-gradient(135deg, #f7faf8 0%, #eef5f1 100%)" }}
      >
        <Row className="align-items-end">
          <Col lg="7" className="mb-2 mb-lg-0">
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
                placeholder="Ej. OPL-120, B-62, nombre del cliente…"
                style={{ fontSize: 16, minHeight: 44 }}
                autoFocus
              />
              {searchTerm ? (
                <InputGroupAddon addonType="append">
                  <Button color="link" onClick={() => setSearchTerm("")}>
                    Limpiar
                  </Button>
                </InputGroupAddon>
              ) : null}
            </InputGroup>
          </Col>
          <Col lg="3" className="mb-2 mb-lg-0">
            <label className="small text-muted mb-1 d-block">Rango de fechas</label>
            <Input
              type="select"
              value={recent}
              onChange={(e) => setRecent(e.target.value)}
              style={{ minHeight: 44 }}
            >
              {RECENT_DATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Input>
          </Col>
          <Col lg="2">
            <label className="small text-muted mb-1 d-block">Tipo</label>
            <Input
              type="select"
              value={orderTypeFilter}
              onChange={(e) => setOrderTypeFilter(e.target.value)}
              disabled={receiptPreset === "OPL"}
              style={{ minHeight: 44 }}
            >
              {ORDER_TYPE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Input>
          </Col>
        </Row>

        <div className="d-flex flex-wrap mt-3" style={{ gap: 8 }}>
          {RECEIPT_WORK_PRESETS.map((preset) => (
            <Button
              key={preset.value}
              size="sm"
              color={receiptPreset === preset.value ? "success" : "secondary"}
              outline={receiptPreset !== preset.value}
              onClick={() => setReceiptPreset(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      <Row className="mb-3">
        <Col md="4" className="mb-2">
          <div className="border rounded p-3 h-100" style={{ background: "#fff8e6" }}>
            <div className="text-muted small">Órdenes por recibir</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#b78103" }}>{totals.pendingReceipt}</div>
          </div>
        </Col>
        <Col md="4" className="mb-2">
          <div className="border rounded p-3 h-100" style={{ background: "#eef6ff" }}>
            <div className="text-muted small">Piezas pendientes</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#0b5ed7" }}>{totals.pendingPieces}</div>
          </div>
        </Col>
        <Col md="4" className="mb-2">
          <div className="border rounded p-3 h-100" style={{ background: "#f3eefc" }}>
            <div className="text-muted small">OPL pendientes</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#6f42c1" }}>{totals.oplPending}</div>
          </div>
        </Col>
      </Row>

      <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap" style={{ gap: 8 }}>
        <div className="text-muted small">
          Mostrando <strong>{visibleOrders.length}</strong> de <strong>{receiptOrders.length}</strong> órdenes
          {searchTerm ? <> · filtro “{searchTerm}”</> : null}
        </div>
        {(searchTerm || receiptPreset !== "PENDING" || orderTypeFilter !== "ALL") && (
          <Button
            size="sm"
            color="link"
            className="p-0"
            onClick={() => {
              setSearchTerm("");
              setReceiptPreset("PENDING");
              setOrderTypeFilter("ALL");
              setRecent("30");
            }}
          >
            Restablecer filtros
          </Button>
        )}
      </div>

      {receiptOrders.length === 0 && (
        <Alert color="success" className="mb-0">
          No hay órdenes para recibir con estos filtros. Prueba “Todas visibles” o amplía el rango de fechas.
        </Alert>
      )}

      <div className="d-flex flex-column" style={{ gap: 10 }}>
        {visibleOrders.map((order) => {
          const orderId = order.productionOrderId;
          const isOpen = expandedId === orderId;
          const progress = getOrderQtyProgress(order);
          const pendingQty = getPendingReceiptQty(order);
          const customerHint = getOrderCustomerHint(order);
          const productHint = getOrderProductHint(order);
          const typeLabel = getOrderTypeLabel(order);

          return (
            <Card
              key={orderId}
              className="mb-0 border shadow-sm"
              style={{
                borderLeft: pendingQty > 0 ? "4px solid #f0ad4e" : "4px solid #28a745",
                overflow: "hidden",
              }}
            >
              <CardBody
                className="py-3"
                style={{ cursor: "pointer", background: isOpen ? "#f8fbf9" : "#fff" }}
                onClick={() => toggle(orderId)}
              >
                <Row className="align-items-center">
                  <Col md="4" className="mb-2 mb-md-0">
                    <div className="d-flex align-items-center flex-wrap" style={{ gap: 6 }}>
                      <strong style={{ fontSize: 16 }}>{formatProductionOrderCodeDate(order)}</strong>
                      <Badge color={typeLabel === "OPL" ? "primary" : "secondary"} pill>
                        {typeLabel}
                      </Badge>
                    </div>
                    <div className="mt-1">
                      <span style={STATUS_STYLES[order.status] || DEFAULT_BADGE_STYLE}>
                        {STATUS_LABELS[order.status] || order.status}
                      </span>
                      <span className="text-muted small ml-2">
                        {DISPATCH_TYPE_LABELS[order.dispatchType] || order.dispatchType || "—"}
                      </span>
                    </div>
                    {customerHint ? (
                      <div className="small text-muted mt-1">Cliente: {customerHint}</div>
                    ) : null}
                  </Col>
                  <Col md="4" className="mb-2 mb-md-0">
                    <div className="small text-muted mb-1">Productos</div>
                    <div style={{ fontWeight: 600 }}>{productHint}</div>
                    <div className="small text-muted mt-1">
                      Recibido {progress.produced}/{progress.total}
                    </div>
                    <Progress
                      value={progress.pct}
                      color={progress.pct >= 100 ? "success" : "warning"}
                      className="mt-1"
                      style={{ height: 8 }}
                    />
                  </Col>
                  <Col md="4" className="text-md-right">
                    <Badge
                      color={pendingQty > 0 ? "warning" : "success"}
                      className="p-2"
                      style={{ fontSize: 13 }}
                    >
                      {pendingQty > 0
                        ? `${pendingQty} pieza${pendingQty === 1 ? "" : "s"} por recibir`
                        : "Al día"}
                    </Badge>
                    <div className="small text-muted mt-2">
                      {isOpen ? "Clic para cerrar" : "Clic para recibir"}
                    </div>
                  </Col>
                </Row>
              </CardBody>
              <Collapse isOpen={isOpen}>
                {isOpen && (
                  <div className="border-top px-3 pb-3" style={{ background: "#fcfcfc" }}>
                    <WarehouseOrderDetail
                      order={order}
                      mode="receipt"
                      onRefresh={onRefresh}
                      onOrderSummaryUpdate={onOrderSummaryUpdate}
                    />
                  </div>
                )}
              </Collapse>
            </Card>
          );
        })}
      </div>

      {hasMore && (
        <div className="text-center mt-3">
          <Button
            color="primary"
            outline
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE_RECEIPT)}
          >
            Cargar más ({receiptOrders.length - visibleCount} restantes)
          </Button>
        </div>
      )}
    </div>
  );
};

export default WarehouseReceiptTab;
