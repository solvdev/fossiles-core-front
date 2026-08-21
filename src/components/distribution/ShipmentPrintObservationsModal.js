import React, { useEffect, useState } from "react";
import { Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader } from "reactstrap";

/**
 * Modal previo a imprimir: captura observaciones que se imprimen (y opcionalmente se guardan).
 */
function ShipmentPrintObservationsModal({
  isOpen,
  toggle,
  initialValue = "",
  shipmentCount = 1,
  confirmLabel = "Imprimir",
  onConfirm,
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValue(initialValue || "");
    setSaving(false);
  }, [isOpen, initialValue]);

  const handleConfirm = async () => {
    if (!onConfirm) return;
    setSaving(true);
    try {
      await onConfirm(String(value || "").trim());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} centered>
      <ModalHeader toggle={toggle}>Observaciones del envío</ModalHeader>
      <ModalBody>
        <p className="text-muted small mb-2">
          Este texto se imprime en el documento
          {shipmentCount > 1 ? ` (se aplica a los ${shipmentCount} envíos seleccionados)` : ""}.
        </p>
        <FormGroup className="mb-0">
          <Label for="shipment-print-observations">Observaciones</Label>
          <Input
            id="shipment-print-observations"
            type="textarea"
            rows={4}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ej. Entregar en recepción, revisar empaque…"
            autoFocus
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={() => void handleConfirm()} disabled={saving}>
          {saving ? "…" : confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ShipmentPrintObservationsModal;
