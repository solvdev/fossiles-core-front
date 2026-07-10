import React, { useState } from "react";
import {
  Card, CardBody, CardHeader, Row, Col, Table, Badge, Input, Button,
  ButtonGroup, FormGroup, Label, Spinner,
} from "reactstrap";
import { formatDateGt } from "utils/dateTimeHelper";

/** Colores por familia de OP (texto siempre legible sobre el fondo). */
const FAMILY_STYLES = {
  OPL: { bg: "#1b5e20", fg: "#fff" },
  OPV: { bg: "#0d47a1", fg: "#fff" },
  OPK: { bg: "#37474f", fg: "#fff" },
  OPI: { bg: "#6a1b9a", fg: "#fff" },
  OPCK: { bg: "#00695c", fg: "#fff" },
  OPD: { bg: "#e65100", fg: "#fff" },
};

function FamilyBadge({ family }) {
  const cfg = FAMILY_STYLES[(family || "").toUpperCase()] || { bg: "#757575", fg: "#fff" };
  return (
    <span
      style={{
        background: cfg.bg,
        color: cfg.fg,
        borderRadius: 6,
        padding: "2px 8px",
        fontWeight: 700,
        fontSize: 12,
        marginRight: 8,
      }}
    >
      {family || "?"}
    </span>
  );
}

function formatSizes(sizes) {
  if (!sizes || Object.keys(sizes).length === 0) return null;
  return Object.entries(sizes).map(([k, v]) => `${k}:${v}`).join(", ");
}

/** Fila de ítem con input de cantidad parcial y botón Agregar. */
function OrganizerItemRow({ order, item, inDraft, onAdd }) {
  const [qty, setQty] = useState(item.remainingQuantity);
  const [extra, setExtra] = useState(false);
  const minutesPerUnit = Math.round((item.prdTimePerUnit || 0.1) * 60);
  const sizesText = formatSizes(item.sizes);

  return (
    <tr>
      <td>
        <strong>{item.productCode}</strong> {item.productName}
        {item.colorName && <span className="text-muted"> · {item.colorName}</span>}
        {sizesText && (
          <div className="text-muted" style={{ fontSize: 11 }}>Tallas OP: {sizesText}</div>
        )}
      </td>
      <td className="text-center">{item.totalQuantity}</td>
      <td className="text-center">{item.assignedQuantity}</td>
      <td className="text-center">
        <Badge color={item.remainingQuantity > 0 ? "warning" : "light"}>
          {item.remainingQuantity}
        </Badge>
      </td>
      <td className="text-center text-muted" style={{ whiteSpace: "nowrap" }}>
        {minutesPerUnit} min/u
      </td>
      <td style={{ width: 110 }}>
        <Input
          type="number"
          bsSize="sm"
          min={1}
          max={item.remainingQuantity}
          value={qty}
          disabled={inDraft}
          onChange={(e) => setQty(e.target.value)}
        />
      </td>
      {order.onlineSale && (
        <td className="text-center">
          <Input
            type="checkbox"
            checked={extra}
            disabled={inDraft}
            onChange={(e) => setExtra(e.target.checked)}
            title="Agregar como extra sobre las 4 horas"
            style={{ position: "static", margin: 0 }}
          />
        </td>
      )}
      {!order.onlineSale && <td />}
      <td className="text-right" style={{ width: 110 }}>
        <Button
          size="sm"
          color={inDraft ? "secondary" : "primary"}
          disabled={inDraft || item.remainingQuantity <= 0}
          onClick={() => {
            if (onAdd(order, item, qty, extra)) {
              setQty(item.remainingQuantity);
              setExtra(false);
            }
          }}
        >
          {inDraft ? "En tarea" : "Agregar"}
        </Button>
      </td>
    </tr>
  );
}

/**
 * Buscador de OPs con ítems pendientes (cantidad restante sin tarea).
 * Filtro OPL / Regulares / Todas + búsqueda por código o cliente.
 */
export default function OrganizerOrderBrowser({
  orders,
  loading,
  typeFilter,
  setTypeFilter,
  search,
  setSearch,
  onReload,
  draftItemIds,
  onAddLine,
}) {
  const [expandedId, setExpandedId] = useState(null);

  return (
    <Card>
      <CardHeader>
        <Row className="align-items-end">
          <Col md="auto">
            <FormGroup className="mb-0">
              <Label className="d-block"><small>Tipo de orden</small></Label>
              <ButtonGroup size="sm">
                <Button
                  color={typeFilter === "ALL" ? "primary" : "secondary"}
                  outline={typeFilter !== "ALL"}
                  onClick={() => setTypeFilter("ALL")}
                >
                  Todas
                </Button>
                <Button
                  color={typeFilter === "OPL" ? "primary" : "secondary"}
                  outline={typeFilter !== "OPL"}
                  onClick={() => setTypeFilter("OPL")}
                >
                  OPL (venta en línea)
                </Button>
                <Button
                  color={typeFilter === "REGULAR" ? "primary" : "secondary"}
                  outline={typeFilter !== "REGULAR"}
                  onClick={() => setTypeFilter("REGULAR")}
                >
                  Regulares
                </Button>
              </ButtonGroup>
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup className="mb-0">
              <Label><small>Buscar OP o cliente</small></Label>
              <Input
                bsSize="sm"
                placeholder="OPV-00123, cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FormGroup>
          </Col>
          <Col md="auto">
            <Button size="sm" color="info" outline onClick={onReload} disabled={loading}>
              {loading ? <Spinner size="sm" /> : "Actualizar"}
            </Button>
          </Col>
          <Col className="text-right text-muted">
            <small>{orders.length} órdenes con productos pendientes</small>
          </Col>
        </Row>
      </CardHeader>
      <CardBody style={{ maxHeight: "65vh", overflowY: "auto" }}>
        {orders.length === 0 && !loading && (
          <div className="text-muted text-center py-4">
            No hay órdenes con productos pendientes de tarea para este filtro.
          </div>
        )}
        {orders.map((order) => {
          const expanded = expandedId === order.id;
          const pendingCount = (order.items || []).length;
          return (
            <div
              key={order.id}
              style={{ border: "1px solid #e0e0e0", borderRadius: 8, marginBottom: 10 }}
            >
              <div
                role="button"
                onClick={() => setExpandedId(expanded ? null : order.id)}
                style={{
                  padding: "10px 12px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  background: expanded ? "#f5f5f5" : "#fff",
                  borderRadius: 8,
                }}
              >
                <FamilyBadge family={order.family} />
                <strong className="mr-2">{order.code}</strong>
                {order.customerName && (
                  <span className="text-muted mr-2">{order.customerName}</span>
                )}
                <Badge color="light" className="text-dark mr-2">
                  {pendingCount} producto{pendingCount === 1 ? "" : "s"} pendiente{pendingCount === 1 ? "" : "s"}
                </Badge>
                {order.deliveryDate && (
                  <small className="text-muted">Entrega: {formatDateGt(order.deliveryDate)}</small>
                )}
                <span className="ml-auto text-muted">{expanded ? "▾" : "▸"}</span>
              </div>
              {expanded && (
                <Table size="sm" responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th className="text-center">Total</th>
                      <th className="text-center">Asignado</th>
                      <th className="text-center">Restante</th>
                      <th className="text-center">Tiempo</th>
                      <th>Cantidad</th>
                      <th className="text-center">{order.onlineSale ? "Extra 4h+" : ""}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {(order.items || []).map((item) => (
                      <OrganizerItemRow
                        key={item.productionOrderItemId}
                        order={order}
                        item={item}
                        inDraft={draftItemIds.has(item.productionOrderItemId)}
                        onAdd={onAddLine}
                      />
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
