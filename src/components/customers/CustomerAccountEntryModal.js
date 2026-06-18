import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  CustomInput,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "reactstrap";
import CustomerAccountDischargeModal from "components/customers/CustomerAccountDischargeModal";
import {
  createCustomerAccountEntry,
  formatAccountMoney,
  getMovementConcept,
  MOVEMENT_CONCEPTS,
  PAYMENT_METHODS,
} from "services/customerAccountService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import {
  buildCustomerPaymentReceiptPrintHtml,
  openAccountPrintWindow,
} from "utils/customerPaymentReceiptPrintHtml";

const EMPTY_FORM = {
  movementConceptCode: "1",
  entryDate: "",
  amount: "",
  reference: "",
  description: "",
  paymentMethod: "EFECTIVO",
  receiptNumber: "",
  collectionDate: "",
  productionOrderId: "",
  partialReleaseId: "",
  productShipmentId: "",
  vendorShipmentNumber: "",
  applyToDocument: false,
};

function CustomerAccountEntryModal({
  isOpen,
  toggle,
  customerId,
  customerInfo = {},
  defaultConceptCode = "1",
  lfDocuments = [],
  initialDoc = null,
  onSaved,
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [dischargeOpen, setDischargeOpen] = useState(false);

  const selectedConcept = useMemo(
    () => getMovementConcept(form.movementConceptCode),
    [form.movementConceptCode]
  );

  useEffect(() => {
    if (!isOpen) return;
    const base = {
      ...EMPTY_FORM,
      movementConceptCode: defaultConceptCode,
      entryDate: getTodayYmdGuatemala(),
      collectionDate: getTodayYmdGuatemala(),
    };
    if (initialDoc) {
      base.productionOrderId = String(initialDoc.productionOrderId || "");
      base.vendorShipmentNumber = initialDoc.vendorShipmentNumber || "";
      base.description = `${initialDoc.orderKind || "LF"} ${initialDoc.orderCode || ""}`.trim();
      if (initialDoc.estimatedTotal != null) {
        base.amount = String(Number(initialDoc.estimatedTotal).toFixed(2));
      }
      if (initialDoc.partialReleaseId) {
        base.partialReleaseId = String(initialDoc.partialReleaseId);
      }
      if (initialDoc.productShipmentId) {
        base.productShipmentId = String(initialDoc.productShipmentId);
      }
    }
    setForm(base);
    setError("");
  }, [isOpen, defaultConceptCode, initialDoc]);

  useEffect(() => {
    if (!isOpen) return;
    if (form.movementConceptCode === "11" || (defaultConceptCode === "11" && isOpen)) {
      setDischargeOpen(true);
    }
  }, [form.movementConceptCode, isOpen, defaultConceptCode]);

  const patch = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleConceptChange = (code) => {
    patch("movementConceptCode", code);
    const concept = getMovementConcept(code);
    if (concept?.paymentMethod) {
      patch("paymentMethod", concept.paymentMethod);
    }
    if (code === "11") {
      setDischargeOpen(true);
    }
  };

  const handleOrderLink = (doc) => {
    if (!doc) return;
    patch("productionOrderId", String(doc.productionOrderId || ""));
    patch("vendorShipmentNumber", doc.vendorShipmentNumber || "");
    if (!form.description && doc.orderCode) {
      patch("description", `${doc.orderKind || "LF"} ${doc.orderCode}`);
    }
    if (!form.amount && doc.estimatedTotal != null) {
      patch("amount", String(Number(doc.estimatedTotal).toFixed(2)));
    }
  };

  const handleSubmit = async () => {
    const concept = selectedConcept;
    if (concept?.code === "11") {
      setDischargeOpen(true);
      return;
    }
    if (concept?.code === "5" && form.applyToDocument) {
      setDischargeOpen(true);
      return;
    }
    if (!concept && form.movementConceptCode !== "OPENING") {
      setError("Concepto no válido.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const amount = Number(form.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Ingrese un monto válido mayor a cero.");
      }
      if (!form.entryDate) {
        throw new Error("La fecha es obligatoria.");
      }

      let entryType = concept?.entryType;
      if (form.movementConceptCode === "OPENING") {
        entryType = "OPENING_BALANCE";
      }
      if (!entryType) {
        throw new Error("Concepto no válido.");
      }

      if (entryType === "PAYMENT" && !form.receiptNumber.trim()) {
        throw new Error("El número de recibo es obligatorio.");
      }
      if (entryType === "PAYMENT" && !form.collectionDate) {
        throw new Error("La fecha de cobro es obligatoria.");
      }

      const payload = {
        entryType,
        movementConceptCode: form.movementConceptCode === "OPENING" ? null : concept?.code,
        entryDate: form.entryDate,
        collectionDate: entryType === "PAYMENT" ? form.collectionDate : null,
        amount,
        grossCollectedAmount: entryType === "PAYMENT" ? amount : null,
        reference: form.reference || form.receiptNumber || null,
        receiptNumber: form.receiptNumber.trim() || null,
        description: form.description || null,
        paymentMethod: entryType === "PAYMENT" ? form.paymentMethod : null,
        productionOrderId: form.productionOrderId ? Number(form.productionOrderId) : null,
        partialReleaseId: form.partialReleaseId ? Number(form.partialReleaseId) : null,
        productShipmentId: form.productShipmentId ? Number(form.productShipmentId) : null,
        vendorShipmentNumber: form.vendorShipmentNumber || null,
      };

      const saved = await createCustomerAccountEntry(customerId, payload);
      if (entryType === "PAYMENT") {
        const html = buildCustomerPaymentReceiptPrintHtml(saved, customerInfo);
        openAccountPrintWindow(html);
      }
      toggle();
      if (onSaved) onSaved(saved);
    } catch (err) {
      setError(err.message || "No se pudo guardar el movimiento");
    } finally {
      setSaving(false);
    }
  };

  const isPayment = selectedConcept?.entryType === "PAYMENT";
  const isCharge = selectedConcept?.entryType === "CHARGE";
  const showStandardForm = form.movementConceptCode !== "11";

  return (
    <>
      <Modal isOpen={isOpen && showStandardForm} toggle={toggle} size="lg">
        <ModalHeader toggle={toggle}>Altas de cuentas por cobrar</ModalHeader>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}

          <div className="border rounded p-3 mb-3 bg-light">
            <h6 className="text-primary mb-2">Datos del cliente</h6>
            <div className="row">
              <div className="col-md-3">
                <small className="text-muted d-block">Clave</small>
                <strong>{customerInfo.legacyCode || "—"}</strong>
              </div>
              <div className="col-md-9">
                <small className="text-muted d-block">Nombre</small>
                <strong>{customerInfo.customerName || customerInfo.name || "—"}</strong>
              </div>
            </div>
          </div>

          <FormGroup>
            <Label>Concepto</Label>
            <Input
              type="select"
              value={form.movementConceptCode}
              onChange={(e) => handleConceptChange(e.target.value)}
            >
              {MOVEMENT_CONCEPTS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
              <option value="OPENING">Saldo inicial</option>
            </Input>
            {selectedConcept && (
              <small className="text-muted">{selectedConcept.description}</small>
            )}
          </FormGroup>

          {form.movementConceptCode === "OPENING" && (
            <Alert color="info" className="py-2">
              Use el tipo saldo inicial para cargar deuda histórica sin documento LF.
            </Alert>
          )}

          {form.movementConceptCode === "5" && (
            <FormGroup>
              <CustomInput
                type="switch"
                id="applyToDocument"
                label="Aplicar anticipo a un documento con saldo"
                checked={form.applyToDocument}
                onChange={(e) => patch("applyToDocument", e.target.checked)}
              />
            </FormGroup>
          )}

          <FormGroup>
            <Label>Fecha vencimiento / registro</Label>
            <Input type="date" value={form.entryDate} onChange={(e) => patch("entryDate", e.target.value)} />
          </FormGroup>

          {isPayment && (
            <>
              <FormGroup>
                <Label>No. recibo de caja *</Label>
                <Input value={form.receiptNumber} onChange={(e) => patch("receiptNumber", e.target.value)} />
              </FormGroup>
              <FormGroup>
                <Label>Fecha aplicación (cobro) *</Label>
                <Input
                  type="date"
                  value={form.collectionDate}
                  onChange={(e) => patch("collectionDate", e.target.value)}
                />
              </FormGroup>
              <FormGroup>
                <Label>Método de pago</Label>
                <Input
                  type="select"
                  value={form.paymentMethod}
                  onChange={(e) => patch("paymentMethod", e.target.value)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </>
          )}

          <FormGroup>
            <Label>Monto (Q) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => patch("amount", e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label>Referencia</Label>
            <Input
              placeholder="No. factura, transferencia..."
              value={form.reference}
              onChange={(e) => patch("reference", e.target.value)}
            />
          </FormGroup>

          <FormGroup>
            <Label>Observaciones</Label>
            <Input
              type="textarea"
              rows={2}
              value={form.description}
              onChange={(e) => patch("description", e.target.value)}
            />
          </FormGroup>

          {isCharge && (
            <FormGroup>
              <Label>Vincular OP</Label>
              <Input
                type="select"
                value={form.productionOrderId}
                onChange={(e) => {
                  const id = e.target.value;
                  patch("productionOrderId", id);
                  const doc = lfDocuments.find((d) => String(d.productionOrderId) === id);
                  if (doc) handleOrderLink(doc);
                }}
              >
                <option value="">— Sin vínculo —</option>
                {lfDocuments.map((doc) => (
                  <option key={doc.productionOrderId} value={doc.productionOrderId}>
                    {doc.orderKind} {doc.orderCode}
                    {doc.vendorShipmentNumber ? ` · ${doc.vendorShipmentNumber}` : ""}
                    {doc.estimatedTotal != null ? ` · ${formatAccountMoney(doc.estimatedTotal)}` : ""}
                  </option>
                ))}
              </Input>
            </FormGroup>
          )}

          {isCharge && (
            <FormGroup>
              <Label>No. envío ENVP</Label>
              <Input
                value={form.vendorShipmentNumber}
                onChange={(e) => patch("vendorShipmentNumber", e.target.value)}
              />
            </FormGroup>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={saving}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleSubmit} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </ModalFooter>
      </Modal>

      <CustomerAccountDischargeModal
        isOpen={dischargeOpen}
        toggle={() => {
          setDischargeOpen(false);
          if (form.movementConceptCode === "11") {
            toggle();
          }
        }}
        customerId={customerId}
        customerInfo={customerInfo}
        movementConceptCode={form.movementConceptCode === "5" ? "5" : "11"}
        onSaved={(saved) => {
          setDischargeOpen(false);
          toggle();
          if (onSaved) onSaved(saved);
        }}
      />
    </>
  );
}

export default CustomerAccountEntryModal;
