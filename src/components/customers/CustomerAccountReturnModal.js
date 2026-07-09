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
  createCustomerAccountEntry,
  formatAccountMoney,
  getReceivableDocuments,
} from "services/customerAccountService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import {
  buildCustomerSettlementPrintHtml,
  openAccountPrintWindow,
} from "utils/customerPaymentReceiptPrintHtml";

const EMPTY_FORM = {
  mode: "discount",
  discountMode: "amount",
  discountAmount: "",
  discountPercent: "",
  returnAmount: "",
  returnVoucherNumber: "",
  returnDate: "",
  entryDate: "",
  notes: "",
};

function chargeToDoc(chargeLine) {
  if (!chargeLine) return null;
  return {
    chargeEntryId: chargeLine.id,
    invoiceNumber: chargeLine.invoiceNumber || chargeLine.vendorShipmentNumber,
    documentNumber: chargeLine.documentNumber || chargeLine.productionOrderCode,
    orderCode: chargeLine.productionOrderCode,
    orderKind: chargeLine.orderKind,
    balanceDue: chargeLine.chargeBalanceDue,
    chargeAmount: chargeLine.debit,
    productionOrderId: chargeLine.productionOrderId,
    partialReleaseId: chargeLine.partialReleaseId,
    productShipmentId: chargeLine.productShipmentId,
  };
}

function CustomerAccountReturnModal({
  isOpen,
  toggle,
  customerId,
  customerInfo = {},
  initialCharge = null,
  onSaved,
}) {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !customerId) return;
    setError("");
    setForm({
      ...EMPTY_FORM,
      entryDate: getTodayYmdGuatemala(),
      returnDate: getTodayYmdGuatemala(),
    });
    if (initialCharge) {
      const doc = chargeToDoc(initialCharge);
      setSelectedDoc(doc);
      setDocuments(doc ? [doc] : []);
    } else {
      setSelectedDoc(null);
      loadDocuments();
    }
  }, [isOpen, customerId, initialCharge]);

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
      returnAmount: saldo > 0 ? String(saldo.toFixed(2)) : prev.returnAmount,
    }));
  };

  const balance = Number(selectedDoc?.balanceDue || 0);

  const commercialDiscount = useMemo(() => {
    if (form.mode !== "discount") return 0;
    if (form.discountMode === "amount") {
      return Math.max(0, Number(form.discountAmount) || 0);
    }
    if (form.discountMode === "percent") {
      const pct = Number(form.discountPercent) || 0;
      return Math.max(0, balance * (pct / 100));
    }
    return 0;
  }, [form.mode, form.discountMode, form.discountAmount, form.discountPercent, balance]);

  const returnAmount = form.mode === "return" ? Math.max(0, Number(form.returnAmount) || 0) : 0;

  const handleSubmit = async () => {
    if (!selectedDoc) {
      setError("Seleccione el documento.");
      return;
    }
    if (form.mode === "discount") {
      if (commercialDiscount <= 0) {
        setError("Indique el monto o porcentaje del descuento comercial.");
        return;
      }
      if (commercialDiscount > balance + 0.001) {
        setError(`El descuento no puede exceder el saldo (${formatAccountMoney(balance)}).`);
        return;
      }
    } else {
      if (returnAmount <= 0) {
        setError("Indique el monto de la devolución.");
        return;
      }
      if (!form.returnVoucherNumber.trim()) {
        setError("El número de recibo / boleta de devolución es obligatorio.");
        return;
      }
      if (!form.returnDate) {
        setError("La fecha de devolución es obligatoria.");
        return;
      }
      if (returnAmount > balance + 0.001) {
        setError(`La devolución no puede exceder el saldo (${formatAccountMoney(balance)}).`);
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      if (form.mode === "discount") {
        const payload = {
          appliedToEntryId: selectedDoc.chargeEntryId,
          entryDate: form.entryDate || getTodayYmdGuatemala(),
          discountAmount: form.discountMode === "amount" ? Number(form.discountAmount) || null : null,
          discountPercent: form.discountMode === "percent" ? Number(form.discountPercent) || null : null,
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
      } else {
        const payload = {
          entryType: "RETURN",
          entryDate: form.entryDate || getTodayYmdGuatemala(),
          returnDate: form.returnDate,
          amount: returnAmount,
          grossCollectedAmount: returnAmount,
          appliedToEntryId: selectedDoc.chargeEntryId,
          returnVoucherNumber: form.returnVoucherNumber.trim(),
          invoiceNumber: selectedDoc.invoiceNumber,
          documentNumber: form.returnVoucherNumber.trim(),
          vendorShipmentNumber: selectedDoc.invoiceNumber,
          productionOrderId: selectedDoc.productionOrderId,
          partialReleaseId: selectedDoc.partialReleaseId,
          productShipmentId: selectedDoc.productShipmentId,
          description: form.notes.trim() || `Devolución ${selectedDoc.invoiceNumber || ""}`.trim(),
        };
        await createCustomerAccountEntry(customerId, payload);
      }
      toggle();
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message || "No se pudo registrar el movimiento");
    } finally {
      setSaving(false);
    }
  };

  const showDocPicker = !initialCharge;

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>Descuento o devolución</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}
        <Alert color="info" className="py-2">
          Registre aquí solo <strong>descuento comercial</strong> o <strong>devolución</strong>. Para cobrar al cliente
          use el botón <strong>Descarga (11)</strong>, que tiene su propio flujo con recibo de caja.
        </Alert>

        {showDocPicker && (
          loading ? (
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
          )
        )}

        {selectedDoc && (
          <>
            <div className="mb-3 p-2 bg-light rounded small">
              <div><strong>Documento:</strong> {selectedDoc.invoiceNumber || selectedDoc.documentNumber || "—"}</div>
              <div><strong>Saldo pendiente:</strong> {formatAccountMoney(balance)}</div>
            </div>

            <FormGroup>
              <Label>Tipo de movimiento</Label>
              <Input
                type="select"
                value={form.mode}
                onChange={(e) => patch("mode", e.target.value)}
              >
                <option value="discount">Descuento comercial</option>
                <option value="return">Devolución</option>
              </Input>
            </FormGroup>

            {form.mode === "discount" ? (
              <div className="border rounded p-3">
                <div className="row">
                  <div className="col-md-4">
                    <FormGroup className="mb-md-0">
                      <Label>Forma de descuento</Label>
                      <Input
                        type="select"
                        bsSize="sm"
                        value={form.discountMode}
                        onChange={(e) => patch("discountMode", e.target.value)}
                      >
                        <option value="amount">Monto (Q)</option>
                        <option value="percent">Porcentaje (%)</option>
                      </Input>
                    </FormGroup>
                  </div>
                  <div className="col-md-4">
                    <FormGroup className="mb-md-0">
                      <Label>{form.discountMode === "amount" ? "Monto (Q)" : "Porcentaje (%)"}</Label>
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
                  <div className="col-md-4 d-flex align-items-end">
                    <div className="mb-3">
                      <small className="text-muted d-block">Descuento a aplicar</small>
                      <strong>{formatAccountMoney(commercialDiscount)}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="border rounded p-3">
                <div className="row">
                  <div className="col-md-4">
                    <FormGroup>
                      <Label>Monto devolución (Q) *</Label>
                      <Input
                        type="number"
                        bsSize="sm"
                        min="0"
                        step="0.01"
                        value={form.returnAmount}
                        onChange={(e) => patch("returnAmount", e.target.value)}
                      />
                    </FormGroup>
                  </div>
                  <div className="col-md-4">
                    <FormGroup>
                      <Label>No. recibo / boleta *</Label>
                      <Input
                        bsSize="sm"
                        value={form.returnVoucherNumber}
                        onChange={(e) => patch("returnVoucherNumber", e.target.value)}
                      />
                    </FormGroup>
                  </div>
                  <div className="col-md-4">
                    <FormGroup>
                      <Label>Fecha devolución *</Label>
                      <Input
                        type="date"
                        bsSize="sm"
                        value={form.returnDate}
                        onChange={(e) => patch("returnDate", e.target.value)}
                      />
                    </FormGroup>
                  </div>
                </div>
              </div>
            )}

            <FormGroup className="mb-0 mt-3">
              <Label>Notas (opcional)</Label>
              <Input
                type="textarea"
                bsSize="sm"
                rows={2}
                value={form.notes}
                onChange={(e) => patch("notes", e.target.value)}
                placeholder="Motivo del descuento o devolución..."
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
          {saving ? "Guardando..." : "Registrar"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CustomerAccountReturnModal;
