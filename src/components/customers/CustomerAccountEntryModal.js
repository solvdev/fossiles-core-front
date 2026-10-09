import React, { useEffect, useMemo, useRef, useState } from "react";
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
  amountExceedsOpenBalance,
  buildAccountEntryPayload,
  createCustomerAccountEntry,
  endSingleFlight,
  entryAppliesToCharge,
  formatAccountMoney,
  formatEstimatedAmount,
  formatOpenChargeLabel,
  getCustomerAccountStatement,
  getMovementConcept,
  getOrderChargeQuote,
  listOpenCharges,
  MOVEMENT_CONCEPTS,
  PAYMENT_METHODS,
  tryBeginSingleFlight,
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
  appliedToEntryId: "",
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
  const [openCharges, setOpenCharges] = useState([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const savingRef = useRef(false);

  const selectedConcept = useMemo(
    () => getMovementConcept(form.movementConceptCode),
    [form.movementConceptCode]
  );

  const selectedEntryType =
    form.movementConceptCode === "OPENING"
      ? "OPENING_BALANCE"
      : form.movementConceptCode === "RETURN"
        ? "RETURN"
        : selectedConcept?.entryType;

  const requiresCharge = entryAppliesToCharge(selectedEntryType);

  const selectedCharge = useMemo(() => {
    if (!form.appliedToEntryId) return null;
    return openCharges.find((charge) => String(charge.id) === String(form.appliedToEntryId)) || null;
  }, [openCharges, form.appliedToEntryId]);

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
      if (initialDoc.appliedToEntryId) {
        base.appliedToEntryId = String(initialDoc.appliedToEntryId);
      }
    }
    setForm(base);
    setError("");
  }, [isOpen, defaultConceptCode, initialDoc]);

  useEffect(() => {
    if (!isOpen || !customerId) {
      setOpenCharges([]);
      return undefined;
    }
    let cancelled = false;
    setChargesLoading(true);
    getCustomerAccountStatement(customerId)
      .then((statement) => {
        if (!cancelled) setOpenCharges(listOpenCharges(statement?.lines));
      })
      .catch(() => {
        if (!cancelled) setOpenCharges([]);
      })
      .finally(() => {
        if (!cancelled) setChargesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, customerId]);

  useEffect(() => {
    if (!isOpen || selectedEntryType !== "CHARGE") {
      setQuote(null);
      setQuoteLoading(false);
      return undefined;
    }
    const orderId = form.productionOrderId;
    if (!orderId) {
      setQuote(null);
      return undefined;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuote(null);
    getOrderChargeQuote(orderId)
      .then((next) => {
        if (cancelled) return;
        setQuote(next);
        const quoted = Number(next?.amount);
        if (Number.isFinite(quoted)) {
          setForm((prev) =>
            prev.movementConceptCode === "1" ? { ...prev, amount: quoted.toFixed(2) } : prev
          );
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "No se pudo cotizar el cargo");
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedEntryType, form.productionOrderId]);

  useEffect(() => {
    if (!isOpen || !requiresCharge || !selectedCharge) return;
    const due = Number(selectedCharge.chargeBalanceDue);
    if (!Number.isFinite(due)) return;
    setForm((prev) => ({ ...prev, amount: due.toFixed(2) }));
  }, [isOpen, requiresCharge, selectedCharge]);

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
  };

  const handleSubmit = async () => {
    if (savingRef.current) return;

    const concept = selectedConcept;
    if (concept?.code === "11") {
      setDischargeOpen(true);
      return;
    }
    if (concept?.code === "5" && form.applyToDocument) {
      setDischargeOpen(true);
      return;
    }

    const entryType = selectedEntryType;
    if (!entryType) {
      setError("Concepto no válido.");
      return;
    }

    if (entryType === "CHARGE") {
      const quoted = Number(quote?.amount);
      if (quoteLoading || !quote || !Number.isFinite(quoted) || quoted <= 0) {
        setError(quoteLoading ? "Espere la cotización del cargo." : "No se pudo obtener el monto del cargo.");
        return;
      }
    }

    const amount = entryType === "CHARGE" ? Number(quote.amount) : Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Ingrese un monto válido mayor a cero.");
      return;
    }
    if (entryAppliesToCharge(entryType) && selectedCharge && amountExceedsOpenBalance(amount, selectedCharge.chargeBalanceDue)) {
      setError(
        `El monto no puede ser mayor al saldo pendiente (${formatAccountMoney(selectedCharge.chargeBalanceDue)}).`
      );
      return;
    }
    if (!form.entryDate) {
      setError("La fecha es obligatoria.");
      return;
    }
    if (entryType === "PAYMENT" && !form.receiptNumber.trim()) {
      setError("El número de recibo es obligatorio.");
      return;
    }
    if (entryType === "PAYMENT" && !form.collectionDate) {
      setError("La fecha de cobro es obligatoria.");
      return;
    }
    if (entryAppliesToCharge(entryType) && !selectedCharge) {
      setError("Seleccione el cargo al que se aplica el movimiento.");
      return;
    }

    const requestId = tryBeginSingleFlight(savingRef);
    if (!requestId) return;

    setSaving(true);
    setError("");
    try {
      const payloadForm =
        entryType === "CHARGE"
          ? { ...form, amount: Number(quote.amount).toFixed(2), partialReleaseId: "", productShipmentId: "" }
          : form;
      const payload = buildAccountEntryPayload({
        entryType,
        conceptCode: form.movementConceptCode,
        form: payloadForm,
        charge: selectedCharge,
      });
      const saved = await createCustomerAccountEntry(customerId, payload, { requestId });
      if (entryType === "PAYMENT") {
        const html = buildCustomerPaymentReceiptPrintHtml(saved, customerInfo);
        openAccountPrintWindow(html);
      }
      toggle();
      if (onSaved) onSaved(saved);
    } catch (err) {
      setError(err.message || "No se pudo guardar el movimiento");
    } finally {
      endSingleFlight(savingRef);
      setSaving(false);
    }
  };

  const isPayment = selectedEntryType === "PAYMENT";
  const isCharge = selectedEntryType === "CHARGE";
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
              <option value="RETURN">Devolución</option>
            </Input>
            {selectedConcept && (
              <small className="text-muted">{selectedConcept.description}</small>
            )}
          </FormGroup>

          {requiresCharge && (
            <FormGroup>
              <Label>Cargo al que se aplica *</Label>
              <Input
                type="select"
                value={form.appliedToEntryId}
                onChange={(e) => patch("appliedToEntryId", e.target.value)}
                disabled={chargesLoading || saving}
              >
                <option value="">— Seleccione un cargo —</option>
                {openCharges.map((charge) => (
                  <option key={charge.id} value={charge.id}>
                    {formatOpenChargeLabel(charge)}
                  </option>
                ))}
              </Input>
              {chargesLoading && <small className="text-muted">Cargando cargos...</small>}
              {!chargesLoading && openCharges.length === 0 && (
                <small className="text-muted">No hay cargos activos para este cliente.</small>
              )}
            </FormGroup>
          )}

          {requiresCharge && selectedCharge && (
            <>
              <FormGroup>
                <Label>Tipo de orden</Label>
                <Input value={selectedCharge.orderKind || "—"} readOnly />
              </FormGroup>
              <FormGroup>
                <Label>Orden</Label>
                <Input
                  value={
                    selectedCharge.productionOrderId != null && selectedCharge.productionOrderId !== ""
                      ? String(selectedCharge.productionOrderId)
                      : "—"
                  }
                  readOnly
                />
                <small className="text-muted">
                  Se toma del cargo seleccionado
                  {selectedCharge.productionOrderCode ? ` · ${selectedCharge.productionOrderCode}` : ""}
                  {selectedCharge.invoiceNumber || selectedCharge.vendorShipmentNumber
                    ? ` · ENVP ${selectedCharge.invoiceNumber || selectedCharge.vendorShipmentNumber}`
                    : ""}
                </small>
              </FormGroup>
            </>
          )}

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

          {isCharge && (
            <div className="border rounded p-3 mb-3">
              <h6 className="text-primary mb-2">Cotización del cargo</h6>
              {quoteLoading && <p className="text-muted mb-0">Cargando cotización...</p>}
              {!quoteLoading && !quote && (
                <p className="text-muted mb-0">Seleccione la orden para ver el monto que guardará el servidor.</p>
              )}
              {quote && (
                <>
                  <div className="d-flex justify-content-between">
                    <span>Productos</span>
                    <strong>{formatAccountMoney(quote.productsTotal)}</strong>
                  </div>
                  {(quote.shippingLines || []).length === 0 ? (
                    <div className="text-muted small mt-2">Sin envío</div>
                  ) : (
                    (quote.shippingLines || []).map((line) => (
                      <div
                        key={line.productShipmentId}
                        className="d-flex justify-content-between small mt-1"
                      >
                        <span>Envío {line.shipmentNumber || line.productShipmentId}</span>
                        <span>{formatAccountMoney(line.shippingCost)}</span>
                      </div>
                    ))
                  )}
                  <div className="d-flex justify-content-between mt-2">
                    <span>Envío</span>
                    <span>{formatAccountMoney(quote.shippingTotal)}</span>
                  </div>
                  <div className="d-flex justify-content-between">
                    <span>Total</span>
                    <strong>{formatAccountMoney(quote.orderTotal)}</strong>
                  </div>
                  <small className="text-muted d-block mt-2">
                    El cargo guarda solo los productos. Cada envío se agrega después, con Agregar envío.
                  </small>
                </>
              )}
            </div>
          )}

          <FormGroup>
            <Label>Monto (Q) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={isCharge ? (quote?.amount != null ? Number(quote.amount).toFixed(2) : "") : form.amount}
              onChange={(e) => patch("amount", e.target.value)}
              readOnly={isCharge}
            />
            {requiresCharge && selectedCharge && (
              <small className="text-muted">
                Saldo pendiente del cargo: {formatAccountMoney(selectedCharge.chargeBalanceDue)}
              </small>
            )}
            {isCharge && (
              <small className="text-muted">El monto lo calcula el servidor y no se puede editar.</small>
            )}
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
                    {` · ${formatEstimatedAmount(doc.estimatedTotal)}`}
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
