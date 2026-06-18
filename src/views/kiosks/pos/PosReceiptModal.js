import React from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";
import { ShipmentReceiptDetail } from "components/distribution/ShipmentReceiptPanel";

function PosReceiptModal({ isOpen, shipment, onClose, onConfirmed }) {
  if (!shipment) return null;

  return (
    <Modal isOpen={isOpen} toggle={onClose} size="lg" className="kiosk-pos-receipt-modal">
      <ModalHeader toggle={onClose}>
        Revisar recepción · {shipment.shipmentNumber || shipment.id}
      </ModalHeader>
      <ModalBody>
        <p className="text-muted small">
          Ajusta lo recibido por producto. Si algo faltó o vino mal, baja la cantidad y anota en la fila.
        </p>
        <ShipmentReceiptDetail
          shipment={shipment}
          onConfirmed={async () => {
            if (onConfirmed) {
              await onConfirmed();
            }
            onClose();
          }}
          successMessage="Distribución recibida. Ya puedes vender estos productos."
        />
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PosReceiptModal;
