import React from "react";
import { Row, Col, Badge, Button, Input } from "reactstrap";
import { REJECTION_REASON_OPTIONS, UNIT_RECEIPT_LABELS } from "./warehouseUtils";

const WarehouseUnitRow = ({
  unit,
  draft,
  onDraftChange,
  readOnly = false,
}) => {
  const status = draft?.receiptStatus || unit.receiptStatus || "PENDING";
  const isShipped = !!unit.shippedAt || unit.shipped;
  const isClosed = unit.receiptClosed;

  const setStatus = (next) => {
    if (readOnly || isShipped || isClosed) return;
    onDraftChange({
      ...draft,
      unitId: unit.id,
      receiptStatus: next,
      rejectionReason: next === "REJECTED" ? (draft?.rejectionReason || "") : "",
    });
  };

  const badgeColor = isShipped
    ? "primary"
    : status === "RECEIVED"
      ? "success"
      : status === "REJECTED"
        ? "danger"
        : "warning";

  const displayStatus = isShipped ? "Enviada" : (UNIT_RECEIPT_LABELS[status] || status);

  return (
    <div className="border rounded p-2 mb-2" style={{ backgroundColor: "#fafafa" }}>
      <Row className="align-items-center">
        <Col md="5">
          <strong>{unit.unitLabel}</strong>
          <br />
          <small className="text-muted">
            {unit.productCode} · {unit.productName}
            {unit.colorName ? ` · ${unit.colorName}` : ""}
          </small>
        </Col>
        <Col md="3">
          <Badge color={badgeColor} pill>{displayStatus}</Badge>
        </Col>
        <Col md="4">
          {!readOnly && !isShipped && !isClosed && status === "PENDING" && (
            <div className="d-flex flex-wrap" style={{ gap: 6 }}>
              <Button
                size="sm"
                color={draft?.receiptStatus === "RECEIVED" ? "success" : "outline-success"}
                onClick={() => setStatus("RECEIVED")}
              >
                Recibida
              </Button>
              <Button
                size="sm"
                color={draft?.receiptStatus === "REJECTED" ? "danger" : "outline-danger"}
                onClick={() => setStatus("REJECTED")}
              >
                Rechazada
              </Button>
            </div>
          )}
          {!readOnly && !isShipped && !isClosed && draft?.receiptStatus === "REJECTED" && (
            <Input
              type="select"
              bsSize="sm"
              className="mt-1"
              value={draft.rejectionReason || ""}
              onChange={(e) => onDraftChange({ ...draft, rejectionReason: e.target.value })}
            >
              <option value="">Motivo de rechazo...</option>
              {REJECTION_REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Input>
          )}
        </Col>
      </Row>
    </div>
  );
};

export default WarehouseUnitRow;
