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
  Table,
} from "reactstrap";
import {
  createCustomerAccountEntry,
  formatAccountMoney,
  getReceivableDocuments,
} from "services/customerAccountService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import {
  buildCustomerReturnVoucherPrintHtml,
  openAccountPrintWindow,
} from "utils/customerPaymentReceiptPrintHtml";

const EMPTY_FORM = {
  returnVoucherNumber: "",
  returnDate: "",
  entryDate: "",
  amount: "",
  returnReason: "",
  documentNumber: "",
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
      returnDate: getTodayYmdGuatemala(),
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
    setForm((prev) => ({
      ...prev,
      documentNumber: doc.documentNumber || doc.orderCode || "",
      amount: String(Number(doc.balanceDue || 0).toFixed(2)),
    }));
  };

  const handleSubmit = async () => {
    if (!selectedDoc) {
      setError("Seleccione el documento al que aplica la devolución.");
      return;
    }
    if (!form.returnVoucherNumber.trim()) {
      setError("El número de boleta de devolución es obligatorio.");
      return;
    }
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Ingrese un monto válido.");
      return;
    }
    if (amount > Number(selectedDoc.balanceDue) + 0.001) {
      setError(`El monto no puede exceder el saldo (${formatAccountMoney(selectedDoc.balanceDue)}).`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const saved = await createCustomerAccountEntry(customerId, {
        entryType: "RETURN",
        entryDate: form.entryDate || getTodayYmdGuatemala(),
        returnDate: form.returnDate || getTodayYmdGuatemala(),
        amount,
        grossCollectedAmount: amount,
        returnVoucherNumber: form.returnVoucherNumber.trim(),
        returnReason: form.returnReason.trim() || null,
        appliedToEntryId: selectedDoc.chargeEntryId,
        productionOrderId: selectedDoc.productionOrderId,
        partialReleaseId: selectedDoc.partialReleaseId,
        productShipmentId: selectedDoc.productShipmentId,
        invoiceNumber: selectedDoc.invoiceNumber,
        documentNumber: form.documentNumber || selectedDoc.documentNumber,
        vendorShipmentNumber: selectedDoc.invoiceNumber,
        description: `Devolución ${form.returnVoucherNumber.trim()}`,
      });
      const html = buildCustomerReturnVoucherPrintHtml(saved, customerInfo);
      openAccountPrintWindow(html);
      toggle();
      if (onSaved) onSaved(saved);
    } catch (err) {
      setError(err.message || "No se pudo registrar la devolución");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>Devolución con boleta</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}

        {loading ? (
          <div className="text-center py-3">Cargando...</div>
        ) : documents.length === 0 ? (
          <Alert color="info">No hay documentos con saldo pendiente.</Alert>
        ) : (
          <Table responsive size="sm" hover className="mb-3">
            <thead className="text-primary">
              <tr>
                <th />
                <th>No. Fact</th>
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
          <div className="row">
            <div className="col-md-6">
              <FormGroup>
                <Label>No. boleta devolución *</Label>
                <Input
                  value={form.returnVoucherNumber}
                  onChange={(e) => patch("returnVoucherNumber", e.target.value)}
                />
              </FormGroup>
            </div>
            <div className="col-md-6">
              <FormGroup>
                <Label>No. documento</Label>
                <Input value={form.documentNumber} onChange={(e) => patch("documentNumber", e.target.value)} />
              </FormGroup>
            </div>
            <div className="col-md-6">
              <FormGroup>
                <Label>Fecha devolución</Label>
                <Input type="date" value={form.returnDate} onChange={(e) => patch("returnDate", e.target.value)} />
              </FormGroup>
            </div>
            <div className="col-md-6">
              <FormGroup>
                <Label>Monto devuelto (Q) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => patch("amount", e.target.value)}
                />
              </FormGroup>
            </div>
            <div className="col-md-12">
              <FormGroup>
                <Label>Motivo / detalle</Label>
                <Input
                  type="textarea"
                  rows={2}
                  value={form.returnReason}
                  onChange={(e) => patch("returnReason", e.target.value)}
                />
              </FormGroup>
            </div>
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleSubmit} disabled={saving || !selectedDoc}>
          {saving ? "Guardando..." : "Registrar e imprimir boleta"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CustomerAccountReturnModal;
