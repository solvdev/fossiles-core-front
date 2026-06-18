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
import { voidKioskSale } from "services/kioskPosService";
import { showError, showSuccess } from "utils/notificationHelper";

function PosVoidSaleModal({ isOpen, onClose, sale, kioskLocationId, onSuccess }) {
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setVoidReason("");
      setVoiding(false);
    }
  }, [isOpen, sale?.id]);

  const handleVoidSale = async () => {
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
        <Button color="danger" onClick={handleVoidSale} disabled={voiding}>
          {voiding ? <Spinner size="sm" /> : "Confirmar anulación"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PosVoidSaleModal;
