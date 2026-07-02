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
  PAYMENT_METHODS,
} from "services/customerAccountService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import {
  buildCustomerPaymentReceiptPrintHtml,
  openAccountPrintWindow,
} from "utils/customerPaymentReceiptPrintHtml";

const EMPTY_FORM = {
  receiptNumber: "",
  collectionDate: "",
  entryDate: "",
  paymentMethod: "EFECTIVO",
  grossAmount: "",
};

function CustomerAccountDischargeModal({
  isOpen,
  toggle,
  customerId,
  customerInfo = {},
  movementConceptCode = "11",
  onSaved,
}) {
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [orderKindFilter, setOrderKindFilter] = useState("");

  useEffect(() => {
    if (!isOpen || !customerId) return;
    setError("");
    setSelectedDoc(null);
    setForm({
      ...EMPTY_FORM,
      collectionDate: getTodayYmdGuatemala(),
      entryDate: getTodayYmdGuatemala(),
      paymentMethod: movementConceptCode === "3" ? "CHEQUE" : movementConceptCode === "4" ? "EFECTIVO" : "EFECTIVO",
    });
    loadDocuments();
  }, [isOpen, customerId, orderKindFilter, movementConceptCode]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await getReceivableDocuments(customerId, {
        orderKind: orderKindFilter || undefined,
      });
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar documentos pendientes");
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
      grossAmount: String(Number(doc.balanceDue || 0).toFixed(2)),
    }));
  };

  const handleSubmit = async () => {
    if (!selectedDoc) {
      setError("Seleccione un documento con saldo pendiente.");
      return;
    }
    if (!form.receiptNumber.trim()) {
      setError("El número de recibo de caja es obligatorio.");
      return;
    }
    if (!form.collectionDate) {
      setError("La fecha de cobro es obligatoria.");
      return;
    }
    const gross = Number(form.grossAmount);
    if (!Number.isFinite(gross) || gross <= 0) {
      setError("Ingrese un monto válido.");
      return;
    }
    if (gross > Number(selectedDoc.balanceDue) + 0.001) {
      setError(`El monto no puede exceder el saldo (${formatAccountMoney(selectedDoc.balanceDue)}).`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        entryType: "PAYMENT",
        movementConceptCode,
        entryDate: form.entryDate || getTodayYmdGuatemala(),
        collectionDate: form.collectionDate,
        amount: gross,
        grossCollectedAmount: gross,
        receiptNumber: form.receiptNumber.trim(),
        reference: form.receiptNumber.trim(),
        paymentMethod: form.paymentMethod,
        appliedToEntryId: selectedDoc.chargeEntryId,
        productionOrderId: selectedDoc.productionOrderId,
        partialReleaseId: selectedDoc.partialReleaseId,
        productShipmentId: selectedDoc.productShipmentId,
        invoiceNumber: selectedDoc.invoiceNumber,
        documentNumber: form.receiptNumber.trim(),
        vendorShipmentNumber: selectedDoc.invoiceNumber,
        description: `Descarga ${selectedDoc.invoiceNumber || selectedDoc.documentNumber || ""}`.trim(),
      };
      const saved = await createCustomerAccountEntry(customerId, payload);
      const html = buildCustomerPaymentReceiptPrintHtml(saved, customerInfo);
      openAccountPrintWindow(html);
      toggle();
      if (onSaved) onSaved(saved);
    } catch (err) {
      setError(err.message || "No se pudo registrar la descarga");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>
        {movementConceptCode === "11" ? "Descarga de crédito (concepto 11)" : "Aplicar pago a documento"}
      </ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}

        <div className="mb-3 p-2 bg-light rounded">
          <strong>{customerInfo.customerName || customerInfo.name}</strong>
          {customerInfo.legacyCode && (
            <span className="ml-2 text-muted">
              Clave: <code>{customerInfo.legacyCode}</code>
            </span>
          )}
        </div>

        <FormGroup className="d-flex align-items-end">
          <div className="mr-3">
            <Label className="mb-0">Filtrar cartera</Label>
            <Input
              type="select"
              bsSize="sm"
              value={orderKindFilter}
              onChange={(e) => setOrderKindFilter(e.target.value)}
              style={{ width: 140 }}
            >
              <option value="">Todas</option>
              <option value="OPV">OPV</option>
              <option value="OPC">OPC</option>
            </Input>
          </div>
          <Button color="secondary" size="sm" onClick={loadDocuments} disabled={loading}>
            Actualizar
          </Button>
        </FormGroup>

        {loading ? (
          <div className="text-center py-3">Cargando documentos...</div>
        ) : documents.length === 0 ? (
          <Alert color="info">No hay documentos con saldo pendiente para este cliente.</Alert>
        ) : (
          <Table responsive size="sm" hover className="mb-3">
            <thead className="text-primary">
              <tr>
                <th />
                <th>No. Fact / ENVP</th>
                <th>Documento</th>
                <th>Tipo</th>
                <th>Fecha vence</th>
                <th className="text-right">Monto</th>
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
                  <td>{doc.orderKind || "—"}</td>
                  <td>{doc.dueDate || "—"}</td>
                  <td className="text-right">{formatAccountMoney(doc.chargeAmount)}</td>
                  <td className="text-right">{formatAccountMoney(doc.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {selectedDoc && (
          <>
            <hr />
            <div className="row">
              <div className="col-md-4">
                <FormGroup>
                  <Label>No. recibo caja / documento *</Label>
                  <Input
                    value={form.receiptNumber}
                    onChange={(e) => patch("receiptNumber", e.target.value)}
                  />
                </FormGroup>
              </div>
              <div className="col-md-4">
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
              </div>
              <div className="col-md-4">
                <FormGroup>
                  <Label>Fecha aplicación (cobro) *</Label>
                  <Input
                    type="date"
                    value={form.collectionDate}
                    onChange={(e) => patch("collectionDate", e.target.value)}
                  />
                </FormGroup>
              </div>
              <div className="col-md-4">
                <FormGroup>
                  <Label>Fecha vencimiento (registro)</Label>
                  <Input type="date" value={form.entryDate} onChange={(e) => patch("entryDate", e.target.value)} />
                </FormGroup>
              </div>
              <div className="col-md-4">
                <FormGroup>
                  <Label>Monto a descargar (Q) *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.grossAmount}
                    onChange={(e) => patch("grossAmount", e.target.value)}
                  />
                </FormGroup>
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="mb-3">
                  <small className="text-muted d-block">Efectivo a cobrar</small>
                  <strong>{formatAccountMoney(Number(form.grossAmount) || 0)}</strong>
                </div>
              </div>
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleSubmit} disabled={saving || !selectedDoc}>
          {saving ? "Guardando..." : "Registrar descarga e imprimir"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CustomerAccountDischargeModal;
