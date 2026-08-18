import React, { useEffect, useState } from "react";
import {
  Card, CardBody, CardHeader, Row, Col, Table, Badge, Input, Button,
  ButtonGroup, FormGroup, Label, Spinner,
} from "reactstrap";
import { formatDateGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { formatProductionDuration } from "utils/productionTimeHelper";

const INITIAL_VISIBLE = 30;
const LOAD_MORE_STEP = 30;

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

/** Controles mesa + fecha de asignación (días hábiles, también rezagados). */
function AssignmentDeskControls({
  assignmentKey,
  assignment,
  deskChoice,
  setDeskChoice,
  dateChoice,
  setDateChoice,
  assigningKey,
  onAssign,
  numDesks,
  label,
  showSummary = true,
}) {
  const desk = deskChoice[assignmentKey] || "";
  const dateVal =
    dateChoice[assignmentKey]
    ?? (assignment.scheduledDate ? String(assignment.scheduledDate).slice(0, 10) : getTodayYmdGuatemala());
  const busy = assigningKey === assignmentKey;
  return (
    <div className="d-flex align-items-center flex-wrap mb-1" style={{ gap: 4 }}>
      {showSummary && <span className="text-muted">{formatAssignmentLine(assignment)}</span>}
      <Input
        type="date"
        bsSize="sm"
        value={dateVal}
        onChange={(e) => setDateChoice((prev) => ({ ...prev, [assignmentKey]: e.target.value }))}
        title="Fecha de asignación a la mesa (puede ser un día hábil anterior)"
        style={{ width: 132, fontSize: 11, height: 22, padding: "0 4px" }}
      />
      <Input
        type="select"
        bsSize="sm"
        value={desk}
        onChange={(e) => setDeskChoice((prev) => ({ ...prev, [assignmentKey]: e.target.value }))}
        style={{ width: 88, fontSize: 11, height: 22, padding: "0 4px" }}
      >
        <option value="">Mesa…</option>
        {Array.from({ length: numDesks || 12 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>Mesa {d}</option>
        ))}
      </Input>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        style={{ fontSize: 11, padding: "0 6px", height: 22, lineHeight: "20px" }}
        disabled={!desk || !dateVal || busy}
        onClick={() => onAssign(assignmentKey, assignment)}
      >
        {busy ? "…" : label}
      </button>
    </div>
  );
}

/** Fila de ítem con input de cantidad parcial y botón Agregar. */
function OrganizerItemRow({ order, item, inDraft, onAdd, onJumpToAssignment, onAssignDesk, numDesks }) {
  const [qty, setQty] = useState(item.remainingQuantity);
  const [deskChoice, setDeskChoice] = useState({});
  const [dateChoice, setDateChoice] = useState({});
  const [reassignOpen, setReassignOpen] = useState({});
  const [assigningKey, setAssigningKey] = useState(null);
  const hoursPerUnit = item.prdTimePerUnit || 0.1;
  const sizesText = formatSizes(item.sizes);
  const assignments = item.assignments || [];

  const handleAssign = async (assignmentKey, assignment) => {
    const desk = deskChoice[assignmentKey];
    const dateVal =
      dateChoice[assignmentKey]
      ?? (assignment.scheduledDate ? String(assignment.scheduledDate).slice(0, 10) : getTodayYmdGuatemala());
    if (!desk || !dateVal) return;
    setAssigningKey(assignmentKey);
    try {
      await onAssignDesk(assignment, Number(desk), dateVal);
      setDeskChoice((prev) => {
        const next = { ...prev };
        delete next[assignmentKey];
        return next;
      });
      setDateChoice((prev) => {
        const next = { ...prev };
        delete next[assignmentKey];
        return next;
      });
      setReassignOpen((prev) => {
        const next = { ...prev };
        delete next[assignmentKey];
        return next;
      });
    } finally {
      setAssigningKey(null);
    }
  };

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
                  <AssignmentDeskControls
                    key={key}
                    assignmentKey={key}
                    assignment={a}
                    deskChoice={deskChoice}
                    setDeskChoice={setDeskChoice}
                    dateChoice={dateChoice}
                    setDateChoice={setDateChoice}
                    assigningKey={assigningKey}
                    onAssign={handleAssign}
                    numDesks={numDesks}
                    label="Asignar mesa"
                  />
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
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      style={{ fontSize: 10, padding: "0 6px", height: 20, lineHeight: "18px" }}
                      onClick={() => {
                        setReassignOpen((prev) => ({ ...prev, [key]: !prev[key] }));
                        setDeskChoice((prev) => ({ ...prev, [key]: String(a.desk) }));
                        setDateChoice((prev) => ({
                          ...prev,
                          [key]: a.scheduledDate
                            ? String(a.scheduledDate).slice(0, 10)
                            : getTodayYmdGuatemala(),
                        }));
                      }}
                    >
                      {reassignOpen[key] ? "Cancelar" : "Reasignar"}
                    </button>
                  </div>
                  {reassignOpen[key] && (
                    <AssignmentDeskControls
                      assignmentKey={key}
                      assignment={a}
                      deskChoice={deskChoice}
                      setDeskChoice={setDeskChoice}
                      dateChoice={dateChoice}
                      setDateChoice={setDateChoice}
                      assigningKey={assigningKey}
                      onAssign={handleAssign}
                      numDesks={numDesks}
                      label="Guardar"
                      showSummary={false}
                    />
                  )}
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
  onAssignDesk,
  numDesks,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [search, typeFilter, orders]);

  const visibleOrders = orders.slice(0, visibleCount);
  const remaining = Math.max(0, orders.length - visibleCount);

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
                  OPL
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
          <Col md="auto" className="mb-2 mb-md-0">
            <Button size="sm" color="info" outline onClick={onReload} disabled={loading}>
              {loading ? <Spinner size="sm" /> : "Actualizar"}
            </Button>
          </Col>
          <Col className="text-right text-muted">
            <small>
              {orders.length === 0
                ? "0 órdenes"
                : `Mostrando ${Math.min(visibleCount, orders.length)} de ${orders.length}`}
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
        {visibleOrders.map((order) => {
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
                        onAssignDesk={onAssignDesk}
                        numDesks={numDesks}
                      />
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          );
        })}
        {remaining > 0 && (
          <div className="text-center py-2">
            <Button
              size="sm"
              color="primary"
              outline
              onClick={() => setVisibleCount((n) => n + LOAD_MORE_STEP)}
            >
              Cargar más ({Math.min(LOAD_MORE_STEP, remaining)} de {remaining} restantes)
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
