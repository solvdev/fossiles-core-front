import React, { useEffect, useState } from "react";
import {
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

function TaxInvoiceVoidModal({ isOpen, onClose, invoice, onSuccess }) {
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setVoidReason("");
      setVoiding(false);
    }
  }, [isOpen, invoice?.id]);

  const handleVoid = async () => {
    if (!invoice?.id || !voidReason.trim()) {
      showError("Indica el motivo de anulación.");
      return;
    }
    try {
      setVoiding(true);
      const updated = await voidTaxInvoice(invoice.id, voidReason.trim());
      showSuccess("Factura anulada ante el SAT. Quedó en borrador para volver a certificar.");
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
          Se enviará la anulación al certificador FEL (INFILE). La factura quedará en <strong>borrador</strong>
          sin UUID FEL para que puedas volver a firmarla con los datos corregidos.
        </p>
        <Input
          type="text"
          placeholder="Motivo de anulación (obligatorio)"
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          disabled={voiding}
        />
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={voiding}>
          Cancelar
        </Button>
        <Button color="danger" onClick={handleVoid} disabled={voiding}>
          {voiding ? <Spinner size="sm" /> : "Confirmar anulación"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default TaxInvoiceVoidModal;
