import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "reactstrap";
import { voidTaxInvoice } from "services/taxInvoiceService";
import { showError, showSuccess } from "utils/notificationHelper";

function formatDeadline(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function TaxInvoiceVoidModal({ isOpen, onClose, invoice, onSuccess }) {
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setVoidReason("");
      setVoiding(false);
    }
  }, [isOpen, invoice?.id]);

  const isCf = Boolean(invoice?.consumidorFinal);
  const voidBlocked = isCf && invoice?.felDirectVoidAllowed === false;
  const deadlineLabel = formatDeadline(invoice?.felDirectVoidDeadlineDate);

  const handleVoid = async () => {
    if (voidBlocked) {
      showError(
        deadlineLabel
          ? `Plazo de anulación CF vencido (hasta ${deadlineLabel}).`
          : "Plazo de anulación CF vencido."
      );
      return;
    }
    if (!invoice?.id || !voidReason.trim()) {
      showError("Indica el motivo de anulación.");
      return;
    }
    try {
      setVoiding(true);
      const updated = await voidTaxInvoice(invoice.id, voidReason.trim());
      showSuccess("Factura anulada ante el SAT. Quedó en Anuladas.");
      if (onSuccess) onSuccess(updated);
      onClose();
    } catch (err) {
      showError(err.message || "No se pudo anular la factura FEL.");
    } finally {
      setVoiding(false);
    }
  };

  const label = invoice?.internalNumber || invoice?.felSerie
    ? `${invoice.internalNumber || "—"} · ${invoice.felSerie || "—"}/${invoice.felNumero || "—"}`
    : invoice?.id;

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered>
      <ModalHeader toggle={onClose}>Anular factura FEL</ModalHeader>
      <ModalBody>
        <p className="mb-2">
          Factura <strong>{label || "—"}</strong>
        </p>
        {invoice?.felUuid && (
          <p className="text-muted small mb-2">
            UUID: {invoice.felUuid}
          </p>
        )}
        <p className="text-muted small mb-3">
          Se enviará la anulación al certificador FEL (INFILE). La factura quedará en estado{" "}
          <strong>Anulada</strong> (con motivo y UUID de anulación). Si necesitas reemitirla, usa{" "}
          <strong>Firmar FEL</strong> desde el detalle.
        </p>
        {voidBlocked && (
          <Alert color="danger" className="mb-3">
            SAT: anulación directa a Consumidor Final (CF) solo el día de emisión o el siguiente
            {deadlineLabel ? ` (hasta ${deadlineLabel})` : ""}.
            Fuera de plazo no se envía desde este sistema (requiere anulación extemporánea ante la SAT).
          </Alert>
        )}
        {isCf && !voidBlocked && (
          <Alert color="warning" className="mb-3">
            Receptor CF: la anulación directa solo es válida el día de emisión o el día siguiente
            {deadlineLabel ? ` (hasta ${deadlineLabel})` : ""}.
          </Alert>
        )}
        <Input
          type="text"
          placeholder="Motivo de anulación (obligatorio)"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          disabled={voiding || voidBlocked}
        />
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={voiding}>
          Cancelar
        </Button>
        <Button color="danger" onClick={handleVoid} disabled={voiding || voidBlocked || !voidReason.trim()}>
          {voiding ? <Spinner size="sm" /> : "Confirmar anulación"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default TaxInvoiceVoidModal;
