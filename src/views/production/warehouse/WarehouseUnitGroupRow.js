import React, { useEffect, useState } from "react";
import { Badge, Button, Col, Input, Row, Spinner } from "reactstrap";
import {
  REJECTION_REASON_OPTIONS,
  formatWarehouseGroupTitle,
} from "./warehouseUtils";

/**
 * Lote de piezas mismo producto + color (+ talla): seleccionar cantidad a recibir
 * (batch desde el detalle) y rechazar por cantidad.
 */
const WarehouseUnitGroupRow = ({
  group,
  readOnly = false,
  receiptClosed = false,
  saving = false,
  selectable = false,
  selected = false,
  selectedQty,
  onToggleSelect,
  onSelectedQtyChange,
  onRejectQty,
}) => {
  const pending = Number(group.pendingCount || 0);
  const [rejectQty, setRejectQty] = useState(0);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busyAction, setBusyAction] = useState(null);

  useEffect(() => {
    setRejectQty(0);
    setRejectionReason("");
    setBusyAction(null);
  }, [group.key, pending]);

  const clampQty = (raw, max) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), max);
  };

  const canEdit = !readOnly && !receiptClosed && pending > 0;
  const receiveQty = selected
    ? clampQty(selectedQty ?? pending, pending)
    : pending;

  const handleReject = async () => {
    const qty = clampQty(rejectQty, pending);
    if (qty <= 0) return;
    if (!rejectionReason) return;
    setBusyAction("reject");
    try {
      await onRejectQty(group, qty, rejectionReason);
    } finally {
      setBusyAction(null);
    }
  };

  const title = formatWarehouseGroupTitle(group);
  const busy = saving || !!busyAction;

  return (
    <div
      className="border rounded p-2 mb-2"
      style={{
        backgroundColor: selected ? "#eef8f1" : "#fafafa",
        borderColor: selected ? "#28a745" : undefined,
      }}
    >
      <Row className="align-items-center">
        <Col md="5">
          <div className="d-flex align-items-start" style={{ gap: 8 }}>
            {selectable && canEdit && (
              <input
                type="checkbox"
                checked={selected}
                disabled={busy}
                onChange={() => onToggleSelect?.(group)}
                style={{ marginTop: 4, width: 18, height: 18, cursor: "pointer", flexShrink: 0 }}
                title="Incluir en recepción por lote"
              />
            )}
            <div>
              <strong>{title}</strong>
              <br />
              <small className="text-muted">
                {group.productCode} — {group.productName}
                {group.colorName ? ` — ${group.colorName}` : ""}
              </small>
              <div className="mt-1" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <Badge color="secondary" pill>{group.totalCount} total</Badge>
                {pending > 0 && <Badge color="warning" pill>{pending} pend.</Badge>}
                {group.receivedCount > 0 && <Badge color="success" pill>{group.receivedCount} recib.</Badge>}
                {group.rejectedCount > 0 && <Badge color="danger" pill>{group.rejectedCount} rech.</Badge>}
                {group.shippedCount > 0 && <Badge color="primary" pill>{group.shippedCount} env.</Badge>}
              </div>
            </div>
          </div>
        </Col>
        <Col md="7">
          {canEdit ? (
            <div className="d-flex flex-column" style={{ gap: 8 }}>
              {selectable && (
                <div className="d-flex flex-wrap align-items-center" style={{ gap: 6 }}>
                  <span className="small text-muted">Cant. a recibir</span>
                  <Input
                    type="number"
                    bsSize="sm"
                    min={0}
                    max={pending}
                    value={receiveQty}
                    disabled={busy || !selected}
                    onChange={(e) => onSelectedQtyChange?.(group, clampQty(e.target.value, pending))}
                    style={{ width: 72 }}
                    title="Cantidad a recibir al confirmar selección"
                  />
                  <span className="small text-muted">de {pending}</span>
                </div>
              )}
              <div className="d-flex flex-wrap align-items-center" style={{ gap: 6 }}>
                <Input
                  type="number"
                  bsSize="sm"
                  min={0}
                  max={pending}
                  value={rejectQty}
                  disabled={busy}
                  onChange={(e) => setRejectQty(clampQty(e.target.value, pending))}
                  style={{ width: 72 }}
                  title="Cantidad a rechazar"
                />
                <Input
                  type="select"
                  bsSize="sm"
                  value={rejectionReason}
                  disabled={busy || clampQty(rejectQty, pending) <= 0}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  style={{ maxWidth: 200 }}
                >
                  <option value="">Motivo de rechazo...</option>
                  {REJECTION_REASON_OPTIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Input>
                <Button
                  size="sm"
                  color="danger"
                  outline
                  disabled={busy || clampQty(rejectQty, pending) <= 0 || !rejectionReason}
                  onClick={() => void handleReject()}
                >
                  {busyAction === "reject" ? <Spinner size="sm" /> : `Rechazar ${clampQty(rejectQty, pending) || ""}`}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-muted" style={{ fontSize: 12 }}>
              {pending === 0
                ? (receiptClosed ? "Recepción cerrada" : "Sin pendientes en este lote")
                : "Solo lectura"}
            </div>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default WarehouseUnitGroupRow;
