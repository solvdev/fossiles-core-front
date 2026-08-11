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
import { voidKioskSale } from "services/kioskPosService";
import { showError, showSuccess } from "utils/notificationHelper";

function formatDeadline(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${d}/${m}/${y}`;
}

function PosVoidSaleModal({ isOpen, onClose, sale, kioskLocationId, onSuccess }) {
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setVoidReason("");
      setVoiding(false);
    }
  }, [isOpen, sale?.id]);

  const invoice = sale?.invoice;
  const isCertifiedFel = Boolean(
    invoice?.felUuid && String(invoice?.status || "").toUpperCase() === "CERTIFIED"
  );
  const isCf = Boolean(invoice?.consumidorFinal);
  const voidBlocked = isCertifiedFel && isCf && invoice?.felDirectVoidAllowed === false;
  const deadlineLabel = formatDeadline(invoice?.felDirectVoidDeadlineDate);

  const handleVoidSale = async () => {
    if (voidBlocked) {
      showError(
        deadlineLabel
          ? `Plazo de anulación CF vencido (hasta ${deadlineLabel}).`
          : "Plazo de anulación CF vencido."
      );
      return;
    }
    if (!sale?.id || !voidReason.trim()) {
      showError("Indica el motivo de anulación.");
      return;
    }
    try {
      setVoiding(true);
      const updated = await voidKioskSale(
        sale.id,
        { reason: voidReason.trim() },
        kioskLocationId ? Number(kioskLocationId) : undefined
      );
      showSuccess("Venta anulada correctamente.");
      if (onSuccess) onSuccess(updated);
      onClose();
    } catch (err) {
      showError(err.message || "No se pudo anular la venta.");
    } finally {
      setVoiding(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered className="kiosk-pos-void-sale-modal">
      <ModalHeader toggle={onClose}>Anular venta</ModalHeader>
      <ModalBody>
        <p className="mb-2">
          Venta <strong>{sale?.saleNumber || sale?.id || "—"}</strong>
        </p>
        <p className="text-muted small mb-3">
          Se anulará la factura FEL si está certificada y el inventario volverá al kiosko.
          Solo puedes anular ventas de la caja abierta actual.
        </p>
        {voidBlocked && (
          <Alert color="danger" className="mb-3">
            SAT: anulación directa a Consumidor Final (CF) solo el día de emisión o el siguiente
            {deadlineLabel ? ` (hasta ${deadlineLabel})` : ""}.
            Fuera de plazo no se puede anular esta venta certificada desde el POS.
          </Alert>
        )}
        {isCertifiedFel && isCf && !voidBlocked && (
          <Alert color="warning" className="mb-3">
            Factura CF: anulación directa válida solo el día de emisión o el día siguiente
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
        <Button
          color="danger"
          onClick={handleVoidSale}
          disabled={voiding || voidBlocked || !voidReason.trim()}
        >
          {voiding ? <Spinner size="sm" /> : "Confirmar anulación"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PosVoidSaleModal;
