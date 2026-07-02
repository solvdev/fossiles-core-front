import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "reactstrap";
import { updateTaxInvoiceFelMetadata } from "services/taxInvoiceService";
import { toFelDateInputValue } from "utils/taxInvoiceEditHelper";
import { showError, showSuccess } from "utils/notificationHelper";

function EditTaxInvoiceFelModal({ isOpen, toggle, invoiceId, initialValues, onSaved }) {
  const [felUuid, setFelUuid] = useState("");
  const [felSerie, setFelSerie] = useState("");
  const [felNumero, setFelNumero] = useState("");
  const [felCertifiedDate, setFelCertifiedDate] = useState("");
  const [correctionNotes, setCorrectionNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setFelUuid(initialValues?.felUuid || "");
    setFelSerie(initialValues?.felSerie || "");
    setFelNumero(initialValues?.felNumero || "");
    setFelCertifiedDate(toFelDateInputValue(initialValues?.felCertifiedAt || initialValues?.issuedAt));
    setCorrectionNotes("");
  }, [isOpen, invoiceId, initialValues]);

  const handleSave = async () => {
    if (!invoiceId) {
      showError("La venta no tiene factura asociada para editar.");
      return;
    }
    if (!String(felUuid || "").trim() || !String(felSerie || "").trim() || !String(felNumero || "").trim()) {
      showError("UUID, serie y número FEL son obligatorios.");
      return;
    }
    if (!felCertifiedDate) {
      showError("Indique la fecha de emisión de la factura real.");
      return;
    }
    try {
      setSaving(true);
      const updated = await updateTaxInvoiceFelMetadata(invoiceId, {
        felUuid: String(felUuid).trim(),
        felSerie: String(felSerie).trim(),
        felNumero: String(felNumero).trim(),
        felCertifiedDate,
        correctionNotes: String(correctionNotes || "").trim() || null,
      });
      showSuccess("Datos FEL actualizados. Ya puede descargar la factura real con el UUID corregido.");
      if (onSaved) {
        await onSaved(updated);
      }
      toggle();
    } catch (err) {
      showError(err.message || "No se pudieron actualizar los datos FEL.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle}>
      <ModalHeader toggle={toggle}>Corregir factura FEL real</ModalHeader>
      <ModalBody>
        <Alert color="info" className="py-2">
          Use esto cuando la venta quedó en prueba pero la factura real se emitió en SAT.
          Ingrese el UUID, serie, número y fecha de emisión oficiales.
        </Alert>
        <FormGroup>
          <Label>UUID autorización SAT *</Label>
          <Input value={felUuid} onChange={(e) => setFelUuid(e.target.value)} placeholder="UUID FEL" />
        </FormGroup>
        <FormGroup>
          <Label>Serie FEL *</Label>
          <Input value={felSerie} onChange={(e) => setFelSerie(e.target.value)} placeholder="Ej. A45" />
        </FormGroup>
        <FormGroup>
          <Label>Número FEL *</Label>
          <Input value={felNumero} onChange={(e) => setFelNumero(e.target.value)} placeholder="Ej. 1234567890" />
        </FormGroup>
        <FormGroup>
          <Label>Fecha de emisión *</Label>
          <Input
            type="date"
            value={felCertifiedDate}
            onChange={(e) => setFelCertifiedDate(e.target.value)}
          />
        </FormGroup>
        <FormGroup>
          <Label>Motivo (opcional)</Label>
          <Input
            type="textarea"
            rows="2"
            value={correctionNotes}
            onChange={(e) => setCorrectionNotes(e.target.value)}
            placeholder="Ej. Venta de prueba con factura real SAT"
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <Spinner size="sm" /> : "Guardar datos FEL"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default EditTaxInvoiceFelModal;
