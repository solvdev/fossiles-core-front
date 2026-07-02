import React, { useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { updateKioskSaleInvoiceContact, getKioskSaleById } from "services/kioskPosService";
import { issueTaxInvoiceFromKioskSale } from "services/taxInvoiceService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency, normalizeFelReceptorEmail } from "./posUtils";

function PosInvoiceEmailModal({ isOpen, sale, kioskLocationId, onComplete, onClose }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (skipEmail) => {
    if (!sale?.id) return;
    const normalizedEmail = skipEmail ? "" : normalizeFelReceptorEmail(email);
    if (!skipEmail && normalizedEmail) {
      const parts = normalizedEmail.split(";");
      const invalid = parts.some((part) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part));
      if (invalid) {
        setError("Ingrese un correo válido. Varios correos: sepárelos con punto y coma (;) sin espacios.");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await updateKioskSaleInvoiceContact(sale.id, kioskLocationId, {
        email: normalizedEmail || null,
        phone: phone.trim() || null,
      });
      await issueTaxInvoiceFromKioskSale(sale.id);
      const refreshed = await getKioskSaleById(sale.id, kioskLocationId);
      if (normalizedEmail) {
        showSuccess("Factura certificada. Se enviará copia al correo indicado.");
      } else {
        showSuccess("Factura electrónica certificada.");
      }
      onComplete(refreshed);
    } catch (err) {
      const msg = err.message || "No se pudo certificar la factura.";
      setError(msg);
      showError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (!sale) return null;

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered backdrop="static" className="kiosk-pos-checkout-modal">
      <ModalHeader toggle={onClose}>Enviar factura al cliente</ModalHeader>
      <ModalBody>
        <Alert color="info" className="py-2">
          La venta <strong>{sale.saleNumber}</strong> ({formatCurrency(sale.totalAmount)}) quedó registrada.
          Indique el correo para que INFILE envíe el PDF y XML certificados. También puede registrar teléfono de contacto.
        </Alert>
        {error && <Alert color="danger">{error}</Alert>}
        <FormGroup>
          <Label>
            <strong>Correo electrónico</strong>
          </Label>
          <Input
            type="email"
            className="kiosk-pos-input-lg"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cliente@correo.com"
            disabled={saving}
          />
          <small className="text-muted">
            Varios correos: use punto y coma sin espacios (ej. a@mail.com;b@mail.com)
          </small>
        </FormGroup>
        <FormGroup className="mb-0">
          <Label>
            <strong>Teléfono / celular</strong> <span className="text-muted">(opcional)</span>
          </Label>
          <Input
            className="kiosk-pos-input-lg"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Ej. 50212345678"
            disabled={saving}
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter className="d-flex flex-wrap" style={{ gap: "0.5rem" }}>
        <Button color="success" onClick={() => handleSubmit(false)} disabled={saving || !email.trim()}>
          {saving ? <Spinner size="sm" /> : "Certificar y enviar factura"}
        </Button>
        <Button color="secondary" outline onClick={() => handleSubmit(true)} disabled={saving}>
          Certificar sin correo
        </Button>
        <Button color="link" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PosInvoiceEmailModal;
