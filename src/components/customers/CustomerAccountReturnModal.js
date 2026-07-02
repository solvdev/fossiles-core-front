import React, { useEffect, useMemo, useState } from "react";
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
  Table,
} from "reactstrap";
import {
  createCustomerAccountDocumentSettlement,
  formatAccountMoney,
  getReceivableDocuments,
  PAYMENT_METHODS,
} from "services/customerAccountService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import {
  buildCustomerSettlementPrintHtml,
  openAccountPrintWindow,
} from "utils/customerPaymentReceiptPrintHtml";

const EMPTY_FORM = {
  discountMode: "none",
  discountAmount: "",
  discountPercent: "",
  paymentGross: "",
  paymentDiscountMode: "none",
  paymentDiscountAmount: "",
  paymentDiscountPercent: "",
  receiptNumber: "",
  collectionDate: "",
  entryDate: "",
  paymentMethod: "EFECTIVO",
  notes: "",
};

function CustomerAccountReturnModal({ isOpen, toggle, customerId, customerInfo = {}, onSaved }) {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !customerId) return;
    setError("");
    setSelectedDoc(null);
    setForm({
      ...EMPTY_FORM,
      collectionDate: getTodayYmdGuatemala(),
      entryDate: getTodayYmdGuatemala(),
    });
    loadDocuments();
  }, [isOpen, customerId]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await getReceivableDocuments(customerId);
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar documentos");
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const patch = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const selectDocument = (doc) => {
    setSelectedDoc(doc);
    const saldo = Number(doc.balanceDue || 0);
    setForm((prev) => ({
      ...prev,
      paymentGross: saldo > 0 ? String(saldo.toFixed(2)) : "",
    }));
  };

  const balance = Number(selectedDoc?.balanceDue || 0);

  const commercialDiscount = useMemo(() => {
    if (form.discountMode === "amount") {
      return Math.max(0, Number(form.discountAmount) || 0);
    }
    if (form.discountMode === "percent") {
      const pct = Number(form.discountPercent) || 0;
      return Math.max(0, balance * (pct / 100));
    }
    return 0;
  }, [form.discountMode, form.discountAmount, form.discountPercent, balance]);

  const paymentGross = Math.max(0, Number(form.paymentGross) || 0);

  const paymentNet = useMemo(() => {
    const gross = paymentGross;
    if (form.paymentDiscountMode === "amount") {
      return Math.max(0, gross - (Number(form.paymentDiscountAmount) || 0));
    }
    if (form.paymentDiscountMode === "percent") {
      const pct = Number(form.paymentDiscountPercent) || 0;
      return Math.max(0, gross - gross * (pct / 100));
    }
    return gross;
  }, [paymentGross, form.paymentDiscountMode, form.paymentDiscountAmount, form.paymentDiscountPercent]);

  const balanceAfterDiscount = Math.max(0, balance - commercialDiscount);
  const finalBalance = Math.max(0, balance - commercialDiscount - paymentGross);

  const handleSubmit = async () => {
    if (!selectedDoc) {
      setError("Seleccione el documento.");
      return;
    }
    if (commercialDiscount <= 0 && paymentGross <= 0) {
      setError("Indique un descuento comercial y/o un monto de descarga.");
      return;
    }
    if (commercialDiscount + paymentGross > balance + 0.001) {
      setError(`Descuento + descarga no pueden exceder el saldo (${formatAccountMoney(balance)}).`);
      return;
    }
    if (paymentGross > 0 && !form.receiptNumber.trim()) {
      setError("El número de recibo de caja es obligatorio cuando hay descarga.");
      return;
    }
    if (paymentGross > 0 && !form.collectionDate) {
      setError("La fecha de cobro es obligatoria cuando hay descarga.");
      return;
    }
    if (paymentGross > 0 && paymentNet <= 0) {
      setError("El efectivo a cobrar debe ser mayor a cero.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        appliedToEntryId: selectedDoc.chargeEntryId,
        entryDate: form.entryDate || getTodayYmdGuatemala(),
        collectionDate: paymentGross > 0 ? form.collectionDate : null,
        discountAmount: form.discountMode === "amount" ? Number(form.discountAmount) || null : null,
        discountPercent: form.discountMode === "percent" ? Number(form.discountPercent) || null : null,
        paymentGross: paymentGross > 0 ? paymentGross : null,
        paymentDiscountAmount:
          paymentGross > 0 && form.paymentDiscountMode === "amount"
            ? Number(form.paymentDiscountAmount) || null
            : null,
        paymentDiscountPercent:
          paymentGross > 0 && form.paymentDiscountMode === "percent"
            ? Number(form.paymentDiscountPercent) || null
            : null,
        receiptNumber: form.receiptNumber.trim() || null,
        documentNumber: form.receiptNumber.trim() || null,
        paymentMethod: form.paymentMethod,
        notes: form.notes.trim() || null,
        productionOrderId: selectedDoc.productionOrderId,
        partialReleaseId: selectedDoc.partialReleaseId,
        productShipmentId: selectedDoc.productShipmentId,
        invoiceNumber: selectedDoc.invoiceNumber,
        vendorShipmentNumber: selectedDoc.invoiceNumber,
      };
      const saved = await createCustomerAccountDocumentSettlement(customerId, payload);
      const html = buildCustomerSettlementPrintHtml(saved, customerInfo, selectedDoc);
      openAccountPrintWindow(html);
      toggle();
      if (onSaved) onSaved(saved);
    } catch (err) {
      setError(err.message || "No se pudo registrar la liquidación");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>Devolución / Descuento y descarga</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        <Alert color="info" className="py-2">
          Primero aplique el <strong>descuento comercial</strong> (reduce saldo sin cobro). Luego indique la{" "}
          <strong>descarga parcial</strong> del saldo restante. No tiene que liquidar todo de un golpe.
        </Alert>

        {loading ? (
          <div className="text-center py-3">Cargando...</div>
        ) : documents.length === 0 ? (
          <Alert color="info">No hay documentos con saldo pendiente.</Alert>
        ) : (
          <Table responsive size="sm" hover className="mb-3">
            <thead className="text-primary">
              <tr>
                <th />
                <th>No. Fact / ENVP</th>
                <th>Documento</th>
                <th className="text-right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr
                  key={doc.chargeEntryId}
                  className={selectedDoc?.chargeEntryId === doc.chargeEntryId ? "table-active" : ""}
                  style={{ cursor: "pointer" }}
                  onClick={() => selectDocument(doc)}
                >
                  <td>
                    <Input
                      type="radio"
                      checked={selectedDoc?.chargeEntryId === doc.chargeEntryId}
                      onChange={() => selectDocument(doc)}
                    />
                  </td>
                  <td>{doc.invoiceNumber || "—"}</td>
                  <td>{doc.documentNumber || doc.orderCode || "—"}</td>
                  <td className="text-right">{formatAccountMoney(doc.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {selectedDoc && (
          <>
            <div className="mb-3 p-2 bg-light rounded small">
              <div><strong>Saldo documento:</strong> {formatAccountMoney(balance)}</div>
              {commercialDiscount > 0 && (
                <>
                  <div><strong>− Descuento comercial:</strong> {formatAccountMoney(commercialDiscount)}</div>
                  <div><strong>= Saldo después descuento:</strong> {formatAccountMoney(balanceAfterDiscount)}</div>
                </>
              )}
              {paymentGross > 0 && (
                <>
                  <div><strong>− Descarga:</strong> {formatAccountMoney(paymentGross)}</div>
                  <div><strong>= Saldo final:</strong> {formatAccountMoney(finalBalance)}</div>
                  <div className="mt-1"><strong>Efectivo a cobrar:</strong> {formatAccountMoney(paymentNet)}</div>
                </>
              )}
              {commercialDiscount <= 0 && paymentGross <= 0 && (
                <div className="text-muted mt-1">Indique descuento comercial y/o monto a descargar.</div>
              )}
            </div>

            <div className="border rounded p-3 mb-3">
              <h6 className="text-muted mb-3" style={{ fontSize: 13 }}>1. Descuento comercial (opcional)</h6>
              <div className="row">
                <div className="col-md-4">
                  <FormGroup className="mb-md-0">
                    <Label className="mb-1">Tipo</Label>
                    <Input
                      type="select"
                      bsSize="sm"
                      value={form.discountMode}
                      onChange={(e) => patch("discountMode", e.target.value)}
                    >
                      <option value="none">Sin descuento</option>
                      <option value="amount">Monto (Q)</option>
                      <option value="percent">Porcentaje (%)</option>
                    </Input>
                  </FormGroup>
                </div>
                {form.discountMode !== "none" && (
                  <div className="col-md-4">
                    <FormGroup className="mb-md-0">
                      <Label className="mb-1">
                        {form.discountMode === "amount" ? "Monto (Q)" : "Porcentaje (%)"}
                      </Label>
                      <Input
                        type="number"
                        bsSize="sm"
                        min="0"
                        max={form.discountMode === "percent" ? 100 : undefined}
                        step="0.01"
                        value={form.discountMode === "amount" ? form.discountAmount : form.discountPercent}
                        onChange={(e) =>
                          patch(form.discountMode === "amount" ? "discountAmount" : "discountPercent", e.target.value)
                        }
                      />
                    </FormGroup>
                  </div>
                )}
              </div>
            </div>

            <div className="border rounded p-3 mb-2">
              <h6 className="text-muted mb-3" style={{ fontSize: 13 }}>2. Descarga y cobro (opcional)</h6>
              <div className="row">
                <div className="col-md-4">
                  <FormGroup className="mb-2">
                    <Label className="mb-1">Monto a descargar (Q)</Label>
                    <Input
                      type="number"
                      bsSize="sm"
                      min="0"
                      step="0.01"
                      value={form.paymentGross}
                      onChange={(e) => patch("paymentGross", e.target.value)}
                    />
                  </FormGroup>
                </div>
                {paymentGross > 0 && (
                  <>
                    <div className="col-md-4">
                      <FormGroup className="mb-2">
                        <Label className="mb-1">No. recibo caja *</Label>
                        <Input
                          bsSize="sm"
                          value={form.receiptNumber}
                          onChange={(e) => patch("receiptNumber", e.target.value)}
                        />
                      </FormGroup>
                    </div>
                    <div className="col-md-2">
                      <FormGroup className="mb-2">
                        <Label className="mb-1">Método</Label>
                        <Input
                          type="select"
                          bsSize="sm"
                          value={form.paymentMethod}
                          onChange={(e) => patch("paymentMethod", e.target.value)}
                        >
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </Input>
                      </FormGroup>
                    </div>
                    <div className="col-md-2">
                      <FormGroup className="mb-2">
                        <Label className="mb-1">Fecha cobro *</Label>
                        <Input
                          type="date"
                          bsSize="sm"
                          value={form.collectionDate}
                          onChange={(e) => patch("collectionDate", e.target.value)}
                        />
                      </FormGroup>
                    </div>
                    <div className="col-md-4">
                      <FormGroup className="mb-2">
                        <Label className="mb-1">Descuento al cobrar</Label>
                        <Input
                          type="select"
                          bsSize="sm"
                          value={form.paymentDiscountMode}
                          onChange={(e) => patch("paymentDiscountMode", e.target.value)}
                        >
                          <option value="none">Sin descuento</option>
                          <option value="amount">Monto (Q)</option>
                          <option value="percent">Porcentaje (%)</option>
                        </Input>
                      </FormGroup>
                    </div>
                    {form.paymentDiscountMode !== "none" && (
                      <div className="col-md-3">
                        <FormGroup className="mb-2">
                          <Label className="mb-1">
                            {form.paymentDiscountMode === "amount" ? "Desc. (Q)" : "Desc. (%)"}
                          </Label>
                          <Input
                            type="number"
                            bsSize="sm"
                            min="0"
                            max={form.paymentDiscountMode === "percent" ? 100 : undefined}
                            step="0.01"
                            value={
                              form.paymentDiscountMode === "amount"
                                ? form.paymentDiscountAmount
                                : form.paymentDiscountPercent
                            }
                            onChange={(e) =>
                              patch(
                                form.paymentDiscountMode === "amount"
                                  ? "paymentDiscountAmount"
                                  : "paymentDiscountPercent",
                                e.target.value
                              )
                            }
                          />
                        </FormGroup>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <FormGroup className="mb-0">
              <Label className="mb-1">Notas (opcional)</Label>
              <Input
                type="textarea"
                bsSize="sm"
                rows={2}
                value={form.notes}
                onChange={(e) => patch("notes", e.target.value)}
                placeholder="Motivo del descuento o descarga..."
              />
            </FormGroup>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleSubmit} disabled={saving || !selectedDoc}>
          {saving ? "Guardando..." : "Registrar e imprimir"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CustomerAccountReturnModal;
