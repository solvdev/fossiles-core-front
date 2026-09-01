import React, { useEffect, useState } from "react";
import { Badge, Button, Col, Input, Row, Spinner } from "reactstrap";
import {
  REJECTION_REASON_OPTIONS,
  formatWarehouseGroupTitle,
} from "./warehouseUtils";

const clampQty = (raw, max) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), max);
};

/**
 * Lote de piezas mismo producto + color (+ talla).
 * Tocar la fila selecciona/deselecciona; confirmar recepción desde la barra fija del detalle.
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
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectQty, setRejectQty] = useState(0);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busyAction, setBusyAction] = useState(null);

  useEffect(() => {
    setRejectOpen(false);
    setRejectQty(0);
    setRejectionReason("");
    setBusyAction(null);
  }, [group.key, pending]);

  const canEdit = !readOnly && !receiptClosed && pending > 0;
  const receiveQty = selected
    ? clampQty(selectedQty ?? pending, pending)
    : pending;
  const busy = saving || !!busyAction;

  const handleRowClick = (e) => {
    if (!canEdit || !selectable || busy) return;
    if (e.target.closest("button, input, select, a, label")) return;
    onToggleSelect?.(group);
  };

  const handleReject = async () => {
    const qty = clampQty(rejectQty, pending);
    if (qty <= 0 || !rejectionReason) return;
    setBusyAction("reject");
    try {
      await onRejectQty(group, qty, rejectionReason);
      setRejectOpen(false);
    } finally {
      setBusyAction(null);
    }
  };

  const title = formatWarehouseGroupTitle(group);

  return (
    <div
      className="border rounded mb-2"
      role={selectable && canEdit ? "button" : undefined}
      tabIndex={selectable && canEdit ? 0 : undefined}
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && selectable && canEdit) {
          e.preventDefault();
          onToggleSelect?.(group);
        }
      }}
      style={{
        backgroundColor: selected ? "#e8f5ec" : "#fafafa",
        borderColor: selected ? "#28a745" : "#dee2e6",
        borderWidth: selected ? 2 : 1,
        cursor: selectable && canEdit ? "pointer" : "default",
        transition: "border-color 0.15s, background-color 0.15s",
      }}
    >
      <div className="p-3">
        <Row className="align-items-center">
          <Col xs="12" md="7">
            <div className="d-flex align-items-start" style={{ gap: 12 }}>
              {selectable && canEdit && (
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: selected ? "2px solid #28a745" : "2px solid #adb5bd",
                    background: selected ? "#28a745" : "#fff",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontWeight: 700,
                    fontSize: 16,
                    marginTop: 2,
                  }}
                  aria-hidden
                >
                  {selected ? "✓" : ""}
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.3 }}>{title}</div>
                <div className="text-muted small mt-1">
                  {group.productCode} — {group.productName}
                  {group.colorName ? ` — ${group.colorName}` : ""}
                </div>
                <div className="mt-2" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {pending > 0 && (
                    <Badge color="warning" pill style={{ fontSize: 12, padding: "6px 10px" }}>
                      {pending} por recibir
                    </Badge>
                  )}
                  {group.receivedCount > 0 && (
                    <Badge color="success" pill>{group.receivedCount} recib.</Badge>
                  )}
                  {group.rejectedCount > 0 && (
                    <Badge color="danger" pill>{group.rejectedCount} rech.</Badge>
                  )}
                </div>
              </div>
            </div>
          </Col>

          <Col xs="12" md="5" className="mt-2 mt-md-0">
            {canEdit ? (
              <div className="d-flex flex-column align-items-md-end" style={{ gap: 8 }}>
                {selectable && selected && (
                  <div
                    className="d-flex align-items-center flex-wrap"
                    style={{ gap: 8 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="small text-muted">Cantidad</span>
                    <Button
                      size="sm"
                      color="light"
                      disabled={busy || receiveQty <= 0}
                      onClick={() => onSelectedQtyChange?.(group, receiveQty - 1)}
                      style={{ minWidth: 36, fontWeight: 700 }}
                    >
                      −
                    </Button>
                    <Input
                      type="number"
                      bsSize="sm"
                      min={1}
                      max={pending}
                      value={receiveQty}
                      disabled={busy}
                      onChange={(e) => onSelectedQtyChange?.(group, clampQty(e.target.value, pending) || 1)}
                      style={{ width: 64, textAlign: "center", fontWeight: 600 }}
                    />
                    <Button
                      size="sm"
                      color="light"
                      disabled={busy || receiveQty >= pending}
                      onClick={() => onSelectedQtyChange?.(group, receiveQty + 1)}
                      style={{ minWidth: 36, fontWeight: 700 }}
                    >
                      +
                    </Button>
                    <span className="small text-muted">de {pending}</span>
                  </div>
                )}
                {selectable && !selected && (
                  <span className="text-muted small">Toca para incluir en la recepción</span>
                )}
                <Button
                  color="link"
                  className="p-0 text-danger small"
                  disabled={busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRejectOpen((v) => !v);
                  }}
                >
                  {rejectOpen ? "Ocultar rechazo" : "Rechazar piezas de este lote"}
                </Button>
              </div>
            ) : (
              <div className="text-muted text-md-right" style={{ fontSize: 12 }}>
                {pending === 0
                  ? (receiptClosed ? "Recepción cerrada" : "Sin pendientes")
                  : "Solo lectura"}
              </div>
            )}
          </Col>
        </Row>

        {canEdit && rejectOpen && (
          <div
            className="mt-3 pt-3 border-top"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex flex-wrap align-items-center" style={{ gap: 8 }}>
              <Input
                type="number"
                bsSize="sm"
                min={0}
                max={pending}
                value={rejectQty}
                disabled={busy}
                onChange={(e) => setRejectQty(clampQty(e.target.value, pending))}
                style={{ width: 72 }}
                placeholder="Cant."
              />
              <Input
                type="select"
                bsSize="sm"
                value={rejectionReason}
                disabled={busy || clampQty(rejectQty, pending) <= 0}
                onChange={(e) => setRejectionReason(e.target.value)}
                style={{ maxWidth: 220, flex: 1 }}
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
        )}
      </div>
    </div>
  );
};

export default WarehouseUnitGroupRow;
