import React, { useMemo, useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table } from "reactstrap";
import { formatQty } from "utils/standaloneInternalShipmentHelper";
import {
  defaultSourceForLine,
  groupLinesForSource,
  sourceOptionsForLine,
} from "utils/enviSourceHelper";

/** Muestra el stock de cada bodega y pide de dónde sale cada producto antes de autorizar el ENVI. */
function EnviSourceModal({ request, busy, onConfirm, onCancel }) {
  const lines = useMemo(() => groupLinesForSource(request?.lines), [request]);
  const [chosen, setChosen] = useState({});

  const sourceOf = (line) => chosen[line.key] ?? defaultSourceForLine(line);
  const complete = lines.length > 0 && lines.every((line) => sourceOf(line));

  const confirm = () => onConfirm(
    lines.map((line) => ({
      productId: line.productId,
      colorId: line.colorId,
      size: line.size,
      source: sourceOf(line),
    }))
  );

  return (
    <Modal isOpen toggle={busy ? undefined : onCancel} size="lg">
      <ModalHeader toggle={busy ? undefined : onCancel}>
        Autorizar envío · Solicitud #{request.id} de {request.recipientName}
      </ModalHeader>
      <ModalBody>
        <p className="text-muted small mb-2">
          Elija de qué bodega sale cada producto. Se generará el número ENVI y se despachará.
        </p>
        <Table responsive size="sm" bordered className="mb-0">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Color</th>
              <th>Talla</th>
              <th className="text-right">Cant.</th>
              <th className="text-right">Devoluciones</th>
              <th className="text-right">Bodega PT</th>
              <th style={{ minWidth: 190 }}>Sale de</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>{[line.productCode, line.productName].filter(Boolean).join(" · ") || "—"}</td>
                <td>{line.colorName || "—"}</td>
                <td>{line.size || "—"}</td>
                <td className="text-right">{formatQty(line.quantity)}</td>
                <td className="text-right">{formatQty(line.returnsAvailable)}</td>
                <td className="text-right">{formatQty(line.ptAvailable)}</td>
                <td>
                  <Input
                    type="select"
                    bsSize="sm"
                    aria-label={`Bodega de salida de ${line.productCode || line.productName || "producto"}`}
                    value={sourceOf(line)}
                    disabled={busy}
                    onChange={(e) => setChosen((prev) => ({ ...prev, [line.key]: e.target.value }))}
                  >
                    {!defaultSourceForLine(line) && <option value="">Sin stock suficiente</option>}
                    {sourceOptionsForLine(line).map((option) => (
                      <option key={option.value} value={option.value} disabled={!option.enabled}>
                        {option.label}
                      </option>
                    ))}
                  </Input>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button color="success" disabled={busy || !complete} onClick={confirm}>
          {busy ? <Spinner size="sm" /> : "Autorizar envío"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default EnviSourceModal;
