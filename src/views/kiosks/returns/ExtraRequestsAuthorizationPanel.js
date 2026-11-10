import React, { useState } from "react";
import {
  Button,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Table,
} from "reactstrap";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { formatCurrency, formatQty } from "../pos/posUtils";

const productLabel = (row) =>
  `${row.productName || "Producto"}${row.colorName ? ` · ${row.colorName}` : ""}${
    row.size ? ` · Talla ${row.size}` : ""
  }`;

/** Complementos extra del POS pendientes de autorización (admin/logística). */
function ExtraRequestsAuthorizationPanel({ rows, onAuthorize, onReject }) {
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("");

  if (!rows || rows.length === 0) return null;

  const authorize = async (row) => {
    setBusyId(row.id);
    try {
      await onAuthorize(row);
    } finally {
      setBusyId(null);
    }
  };

  const confirmReject = async () => {
    if (!rejecting || !reason.trim()) return;
    setBusyId(rejecting.id);
    try {
      const done = await onReject(rejecting, reason.trim());
      if (done) {
        setRejecting(null);
        setReason("");
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mb-4">
      <h6 className="text-primary">Complementos extra pendientes</h6>
      <Table responsive hover>
        <thead className="text-primary">
          <tr>
            <th>Solicitud</th>
            <th>Solicitada</th>
            <th>Kiosko</th>
            <th>Solicitante</th>
            <th>Producto</th>
            <th>Complemento</th>
            <th className="text-right">Piezas</th>
            <th className="text-right">Extra c/u</th>
            <th className="text-right">Extra total</th>
            <th className="text-right">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.requestNumber}</td>
              <td>{formatDateTimeGt(row.requestedAt)}</td>
              <td>{row.kioskCode ? `${row.kioskCode} · ${row.kioskName || ""}` : row.kioskName || "—"}</td>
              <td>{row.requestedByName || "—"}</td>
              <td>
                {productLabel(row)}
                {row.catalogUnitPrice != null && (
                  <div className="text-muted small">
                    Precio normal {formatCurrency(row.catalogUnitPrice)} → con extra {formatCurrency(row.resultingUnitPrice)}
                  </div>
                )}
              </td>
              <td style={{ maxWidth: 260 }}>{row.description}</td>
              <td className="text-right">{formatQty(row.quantity)}</td>
              <td className="text-right">{formatCurrency(row.extraAmount)}</td>
              <td className="text-right">{formatCurrency(row.extraTotal)}</td>
              <td className="text-right text-nowrap">
                <Button
                  color="success"
                  size="sm"
                  className="btn-round mr-1"
                  disabled={busyId === row.id}
                  onClick={() => authorize(row)}
                >
                  Autorizar
                </Button>
                <Button
                  color="danger"
                  outline
                  size="sm"
                  className="btn-round"
                  disabled={busyId === row.id}
                  onClick={() => {
                    setRejecting(row);
                    setReason("");
                  }}
                >
                  Rechazar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal isOpen={rejecting != null} toggle={() => setRejecting(null)} centered>
        <ModalHeader toggle={() => setRejecting(null)}>
          Rechazar complemento {rejecting?.requestNumber}
        </ModalHeader>
        <ModalBody>
          <Label>Motivo del rechazo</Label>
          <Input
            type="textarea"
            rows="3"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="El cajero verá este motivo en el POS"
          />
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setRejecting(null)}>
            Cancelar
          </Button>
          <Button color="danger" disabled={!reason.trim() || busyId === rejecting?.id} onClick={confirmReject}>
            Rechazar
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default ExtraRequestsAuthorizationPanel;
