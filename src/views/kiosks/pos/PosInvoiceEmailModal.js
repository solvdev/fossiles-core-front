import React, { useEffect, useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { updateKioskSaleInvoiceContact, getKioskSaleById } from "services/kioskPosService";
import { issueTaxInvoiceFromKioskSale } from "services/taxInvoiceService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency, getSaleInternalNumber, normalizeFelReceptorEmail } from "./posUtils";

/**
 * Certificación FEL (con o sin correo). Si se pasa onClose, se puede cerrar y seguir usando el POS.
 */
function PosInvoiceEmailModal({ isOpen, sale, kioskLocationId, onComplete, onClose }) {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setEmail("");
    setPhone("");
    setError("");
    setSaving(false);
  }, [isOpen, sale?.id]);

  const fetchCertifiedSale = async () => {
    let refreshed = await getKioskSaleById(sale.id, kioskLocationId);
    if (!getSaleInternalNumber(refreshed)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      refreshed = await getKioskSaleById(sale.id, kioskLocationId);
    }
    return refreshed;
  };

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
      const refreshed = await fetchCertifiedSale();
      if (normalizedEmail) {
        showSuccess("Factura certificada. Se enviará copia al correo indicado.");
      } else {
        showSuccess("Factura electrónica certificada.");
      }
      if (onComplete) onComplete(refreshed);
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
    <Modal
      isOpen={isOpen}
      centered
      backdrop="static"
      keyboard={Boolean(onClose)}
      toggle={onClose}
      className="kiosk-pos-checkout-modal"
    >
      <ModalHeader toggle={onClose}>Certificar factura electrónica</ModalHeader>
      <ModalBody>
        <Alert color="warning" className="py-2">
          La venta <strong>{sale.saleNumber}</strong> ({formatCurrency(sale.totalAmount)}) ya está registrada.
          Certifique la factura con correo o sin correo. Puede cerrar y seguir usando el POS;
          no podrá cobrar otra venta hasta certificar.
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
          {saving ? <Spinner size="sm" /> : "Certificar sin correo"}
        </Button>
        {onClose && (
          <Button color="link" className="ml-auto" onClick={onClose} disabled={saving}>
            Cerrar
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

export default PosInvoiceEmailModal;
