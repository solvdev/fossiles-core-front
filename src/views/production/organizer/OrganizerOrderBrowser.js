import React, { useEffect, useState } from "react";
import {
  Card, CardBody, CardHeader, Row, Col, Table, Badge, Input, Button,
  ButtonGroup, FormGroup, Label, Spinner,
} from "reactstrap";
import { formatDateGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { formatProductionDuration } from "utils/productionTimeHelper";


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

function formatAssignmentLine(a) {
  const mesa = a.desk != null ? `Mesa ${a.desk}` : "Sin mesa";
  const day = a.scheduledDate ? formatDateGt(a.scheduledDate) : "Sin día";
  const qty = a.quantity != null ? ` · ${a.quantity} u` : "";
  const code = a.taskCode ? ` · ${a.taskCode}` : "";
  return `${mesa} · ${day}${qty}${code}`;
}

// El componente que dejaba elegir mesa a mano se quitó a propósito: el humano elige
// qué órdenes y para qué día, y el sistema decide la mesa. Dejar que la eligieran era
// lo que causaba el conflicto entre los operarios y el auxiliar de producción.

/** Fila de ítem con input de cantidad parcial y botón Agregar. */
function OrganizerItemRow({ order, item, inDraft, onAdd, onJumpToAssignment }) {
  const [qty, setQty] = useState(item.remainingQuantity);
  const hoursPerUnit = item.prdTimePerUnit || 0.1;
  const sizesText = formatSizes(item.sizes);
  const assignments = item.assignments || [];


  return (
    <tr>
      <td>
        <strong>{item.productCode}</strong> {item.productName}
        {item.colorName && <span className="text-muted"> · {item.colorName}</span>}
        {sizesText && (
          <div className="text-muted" style={{ fontSize: 11 }}>Tallas OP: {sizesText}</div>
        )}
        {item.observations && (
          <div className="text-warning" style={{ fontSize: 11, marginTop: 2 }}>
            Obs.: {item.observations}
          </div>
        )}
        {assignments.length > 0 && (
          <div style={{ fontSize: 11, marginTop: 4 }}>
            {assignments.map((a, idx) => {
              const key = a.taskId != null ? a.taskId : idx;
              if (a.desk == null) {
                return (
                  <div key={key} className="text-muted mb-1">
                    {formatAssignmentLine(a)} — sin mesa todavía; la asigna el sistema al
                    distribuir el día.
                  </div>
                );
              }
              return (
                <div key={key} className="mb-1">
                  <div className="d-flex align-items-center flex-wrap" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="text-muted"
                      onClick={() => onJumpToAssignment && onJumpToAssignment(a)}
                      title="Ir al tablero en la fecha de esta tarea"
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        font: "inherit",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      {formatAssignmentLine(a)} → ver en tablero
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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
        {formatProductionDuration(hoursPerUnit)}/u
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
      {order.onlineSale ? (
        <td className="text-center">
          <Badge color="success" title="OPL no cuenta contra el cupo de mesa" style={{ fontSize: 10 }}>
            Sin cupo
          </Badge>
        </td>
      ) : (
        <td />
      )}
      <td className="text-right" style={{ width: 110 }}>
        <Button
          size="sm"
          color={inDraft ? "secondary" : "primary"}
          disabled={inDraft || item.remainingQuantity <= 0}
          onClick={() => {
            // OPL always excluded from cupo (daySaleExtra equivalent).
            if (onAdd(order, item, qty, !!order.onlineSale)) {
              setQty(item.remainingQuantity);
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
 * Buscador de OPs activas (con o sin cantidad restante).
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
  onJumpToAssignment,
  colaDelDia = [],
  onAlternarEnCola = () => {},
  page = 0,
  totalElements = 0,
  totalPages = 0,
  onPageChange = () => {},
}) {
  const [expandedId, setExpandedId] = useState(null);

  // La página la arma el servidor: antes se traía el catálogo entero y se cortaba
  // aquí, así que la consulta cara se hacía igual aunque en pantalla cupieran 30.
  const hayMas = totalPages > 0 && page < totalPages - 1;

  return (
    <Card>
      <CardHeader>
        <Row className="align-items-end">
          <Col md="5" className="mb-2 mb-md-0">
            <FormGroup className="mb-0">
              <Label><strong>Buscar OP o cliente</strong></Label>
              <Input
                placeholder="OPV-00123, cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FormGroup>
          </Col>
          <Col md="auto" className="mb-2 mb-md-0">
            <FormGroup className="mb-0">
              <Label className="d-block"><small>Tipo de orden</small></Label>
              {/* Las familias reales, no la dicotomía OPL / el resto. El backend ya
                  las calcula y las devuelve en cada fila. */}
              <ButtonGroup size="sm">
                {[
                  ["ALL", "Todas"],
                  ["OPL", "OPL"],
                  ["OPV", "OPV"],
                  ["OPK", "OPK"],
                  ["OPI", "OPI"],
                  ["OPCK", "OPCK"],
                ].map(([valor, etiqueta]) => (
                  <Button
                    key={valor}
                    color={typeFilter === valor ? "primary" : "secondary"}
                    outline={typeFilter !== valor}
                    onClick={() => setTypeFilter(valor)}
                  >
                    {etiqueta}
                  </Button>
                ))}
              </ButtonGroup>
            </FormGroup>
          </Col>
          <Col md="auto" className="mb-2 mb-md-0">
            <Button size="sm" color="info" outline onClick={onReload} disabled={loading}>
              {loading ? <Spinner size="sm" /> : "Actualizar"}
            </Button>
          </Col>
          <Col className="text-right text-muted">
            <small>
              {totalElements === 0
                ? "0 órdenes"
                : `Mostrando ${orders.length} de ${totalElements}`}
              {orders.some((o) => (o.items || []).some((i) => (i.remainingQuantity || 0) > 0))
                ? ` · ${(orders.reduce((n, o) => n + (o.items || []).filter((i) => (i.remainingQuantity || 0) > 0).length, 0))} con restante`
                : ""}
            </small>
          </Col>
        </Row>
      </CardHeader>
      <CardBody style={{ maxHeight: "65vh", overflowY: "auto" }}>
        {orders.length === 0 && !loading && (
          <div className="text-muted text-center py-4">
            No hay órdenes activas para este filtro.
          </div>
        )}
        {orders.map((order) => {
          const expanded = expandedId === order.id;
          const itemCount = (order.items || []).length;
          const remainingCount = (order.items || []).filter((i) => (i.remainingQuantity || 0) > 0).length;
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
                {/* Marcar es "esta orden entra al día". El orden en que se marcan es la
                    prioridad que se manda al distribuir. */}
                <Input
                  type="checkbox"
                  className="mr-2 position-static m-0"
                  style={{ cursor: "pointer" }}
                  title="Incluir en la cola del día"
                  checked={colaDelDia.some((o) => o.id === order.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => { e.stopPropagation(); onAlternarEnCola(order); }}
                />
                <FamilyBadge family={order.family} />
                <strong className="mr-2">{order.code}</strong>
                {order.customerName && (
                  <span className="text-muted mr-2">{order.customerName}</span>
                )}
                <Badge color="light" className="text-dark mr-2">
                  {itemCount} producto{itemCount === 1 ? "" : "s"}
                </Badge>
                <Badge color={remainingCount > 0 ? "warning" : "secondary"} className="mr-2">
                  {remainingCount > 0
                    ? `${remainingCount} con restante`
                    : "Sin restante (ya en tareas)"}
                </Badge>
                {order.deliveryDate && (
                  <small className="text-muted">Entrega: {formatDateGt(order.deliveryDate)}</small>
                )}
                {order.observations && (
                  <div className="w-100 mt-1 small text-warning">
                    <strong>Obs.:</strong> {order.observations}
                  </div>
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
                      <th className="text-center">{order.onlineSale ? "Cupo" : ""}</th>
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
                        onJumpToAssignment={onJumpToAssignment}
                      />
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          );
        })}
        {(page > 0 || hayMas) && (
          <div className="d-flex justify-content-center align-items-center py-2" style={{ gap: 8 }}>
            <Button
              size="sm" color="secondary" outline
              disabled={page === 0 || loading}
              onClick={() => onPageChange(page - 1)}
            >
              Anterior
            </Button>
            <small className="text-muted">Página {page + 1} de {Math.max(1, totalPages)}</small>
            <Button
              size="sm" color="primary" outline
              disabled={!hayMas || loading}
              onClick={() => onPageChange(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
