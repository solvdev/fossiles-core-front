import React, { useEffect, useState } from "react";
import { Badge, Button, Col, Input, Row, Spinner } from "reactstrap";
import {
  REJECTION_REASON_OPTIONS,
  formatWarehouseGroupTitle,
} from "./warehouseUtils";

/**
 * Lote de piezas mismo producto + color (+ talla): recibir/rechazar por cantidad.
 */
const WarehouseUnitGroupRow = ({
  group,
  readOnly = false,
  receiptClosed = false,
  saving = false,
  onReceiveQty,
  onRejectQty,
}) => {
  const pending = Number(group.pendingCount || 0);
  const [receiveQty, setReceiveQty] = useState(pending);
  const [rejectQty, setRejectQty] = useState(0);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busyAction, setBusyAction] = useState(null);

  useEffect(() => {
    setReceiveQty(pending);
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

  const handleReceive = async () => {
    const qty = clampQty(receiveQty, pending);
    if (qty <= 0) return;
    setBusyAction("receive");
    try {
      await onReceiveQty(group, qty);
    } finally {
      setBusyAction(null);
    }
  };

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
    <div className="border rounded p-2 mb-2" style={{ backgroundColor: "#fafafa" }}>
      <Row className="align-items-center">
        <Col md="5">
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
        </Col>
        <Col md="7">
          {canEdit ? (
            <div className="d-flex flex-column" style={{ gap: 8 }}>
              <div className="d-flex flex-wrap align-items-center" style={{ gap: 6 }}>
                <Input
                  type="number"
                  bsSize="sm"
                  min={0}
                  max={pending}
                  value={receiveQty}
                  disabled={busy}
                  onChange={(e) => setReceiveQty(clampQty(e.target.value, pending))}
                  style={{ width: 72 }}
                  title="Cantidad a recibir"
                />
                <Button
                  size="sm"
                  color="success"
                  disabled={busy || clampQty(receiveQty, pending) <= 0}
                  onClick={() => void handleReceive()}
                >
                  {busyAction === "receive" ? <Spinner size="sm" /> : `Recibir ${clampQty(receiveQty, pending) || ""}`}
                </Button>
                <Button
                  size="sm"
                  color="success"
                  outline
                  disabled={busy}
                  onClick={() => {
                    setReceiveQty(pending);
                    void (async () => {
                      setBusyAction("receive");
                      try {
                        await onReceiveQty(group, pending);
                      } finally {
                        setBusyAction(null);
                      }
                    })();
                  }}
                >
                  Todas ({pending})
                </Button>
              </div>
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
