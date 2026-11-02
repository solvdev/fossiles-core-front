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
  Spinner,
  Table,
} from "reactstrap";
import { issueTaxInvoiceNote } from "services/taxInvoiceService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatQuetzales } from "utils/taxInvoiceLabels";

const NOTE_TYPES = {
  NCRE: "Nota de crédito",
  NDEB: "Nota de débito",
};

const emptyLine = () => ({ description: "", quantity: "1", unitPrice: "" });

const formatCurrency = formatQuetzales;

function lineTotal(line) {
  const qty = Number(line.quantity);
  const price = Number(line.unitPrice);
  if (!Number.isFinite(qty) || !Number.isFinite(price)) return 0;
  return Math.round(qty * price * 100) / 100;
}

/**
 * Emite una Nota de Crédito (NCRE) o Débito (NDEB) FEL sobre una factura certificada.
 * El receptor es siempre el de la factura origen; los montos van con IVA incluido.
 */
function TaxInvoiceNoteModal({ isOpen, onClose, invoice, onSuccess }) {
  const [documentType, setDocumentType] = useState("NCRE");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setDocumentType("NCRE");
      setReason("");
      setNotes("");
      setLines([emptyLine()]);
      setSaving(false);
    }
  }, [isOpen, invoice?.id]);

  const total = useMemo(
    () => Math.round(lines.reduce((sum, line) => sum + lineTotal(line), 0) * 100) / 100,
    [lines]
  );
  const balance = Number(invoice?.noteBalance ?? invoice?.totalAmount ?? 0);
  const originTotal = Number(invoice?.totalAmount || 0);
  const creditLimit = Math.min(balance, originTotal);
  const exceedsBalance = documentType === "NCRE" && total > creditLimit + 0.001;
  const linesValid = lines.length > 0 && lines.every(
    (line) => line.description.trim() && Number(line.quantity) > 0 && Number(line.unitPrice) > 0
  );
  const canSubmit = !saving && reason.trim() && linesValid && total > 0 && !exceedsBalance;

  const updateLine = (index, field, value) => {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const removeLine = (index) => {
    setLines((current) => (current.length === 1 ? current : current.filter((_, i) => i !== index)));
  };

  const copyInvoiceLines = () => {
    const copied = (invoice?.lines || []).map((line) => ({
      description: line.description || "",
      quantity: String(Number(line.quantity || 1)),
      unitPrice: String(Number(line.unitPrice || 0).toFixed(2)),
    }));
    setLines(copied.length ? copied : [emptyLine()]);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      setSaving(true);
      const created = await issueTaxInvoiceNote(invoice.id, {
        documentType,
        reason: reason.trim(),
        notes: notes.trim() || null,
        lines: lines.map((line) => ({
          description: line.description.trim(),
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
        })),
      });
      if (created?.status === "CERTIFIED") {
        showSuccess(`${NOTE_TYPES[documentType]} certificada ante el SAT.`);
      } else {
        showError(
          `${NOTE_TYPES[documentType]} guardada sin certificar (${created?.status || "—"}). `
            + (created?.felError || "Revise el detalle de la nota para reintentar.")
        );
      }
      if (onSuccess) onSuccess(created);
      onClose();
    } catch (err) {
      showError(err.message || "No se pudo emitir la nota FEL.");
    } finally {
      setSaving(false);
    }
  };

  const label = `${invoice?.internalNumber || invoice?.id || "—"} · ${invoice?.felSerie || "—"}/${invoice?.felNumero || "—"}`;

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered size="lg">
      <ModalHeader toggle={onClose}>Emitir nota de crédito/débito FEL</ModalHeader>
      <ModalBody>
        <p className="mb-1">
          Factura origen <strong>{label}</strong>
        </p>
        <p className="text-muted small mb-3">
          Receptor: {invoice?.customerName || "—"} (NIT {invoice?.customerTaxId || "—"}) · Total{" "}
          {formatCurrency(originTotal)} · Saldo actual {formatCurrency(balance)}
        </p>

        <FormGroup>
          <Label>Tipo de nota</Label>
          <Input
            type="select"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            disabled={saving}
          >
            <option value="NCRE">Nota de crédito (devolución, descuento, rebaja)</option>
            <option value="NDEB">Nota de débito (recargo, aumento de precio)</option>
          </Input>
        </FormGroup>

        <FormGroup>
          <Label>Motivo del ajuste (obligatorio, va al SAT)</Label>
          <Input
            type="text"
            maxLength={255}
            placeholder="Ej. Devolución de mercadería"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={saving}
          />
        </FormGroup>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <Label className="mb-0">Líneas (precio con IVA incluido)</Label>
          <div>
            <Button color="link" size="sm" onClick={copyInvoiceLines} disabled={saving}>
              Copiar líneas de la factura
            </Button>
            <Button
              color="link"
              size="sm"
              onClick={() => setLines((current) => [...current, emptyLine()])}
              disabled={saving}
            >
              + Agregar línea
            </Button>
          </div>
        </div>
        <Table size="sm" responsive className="mb-2">
          <thead>
            <tr>
              <th>Descripción</th>
              <th style={{ width: 90 }}>Cant.</th>
              <th style={{ width: 120 }}>P. unit.</th>
              <th style={{ width: 100 }} className="text-right">Total</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <Input
                    bsSize="sm"
                    value={line.description}
                    onChange={(e) => updateLine(index, "description", e.target.value)}
                    disabled={saving}
                  />
                </td>
                <td>
                  <Input
                    bsSize="sm"
                    type="number"
                    min="0"
                    step="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(index, "quantity", e.target.value)}
                    disabled={saving}
                  />
                </td>
                <td>
                  <Input
                    bsSize="sm"
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(index, "unitPrice", e.target.value)}
                    disabled={saving}
                  />
                </td>
                <td className="text-right align-middle">{formatCurrency(lineTotal(line))}</td>
                <td className="align-middle">
                  <Button
                    close
                    onClick={() => removeLine(index)}
                    disabled={saving || lines.length === 1}
                    aria-label="Quitar línea"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="text-right mb-3">
          <strong>Total de la nota: {formatCurrency(total)}</strong>
        </p>
        {exceedsBalance && (
          <Alert color="warning" className="py-2">
            Una nota de crédito no puede pasar el saldo de la factura ({formatCurrency(creditLimit)}).
          </Alert>
        )}

        <FormGroup className="mb-0">
          <Label>Observaciones internas (opcional)</Label>
          <Input
            type="textarea"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {saving ? <Spinner size="sm" /> : `Emitir ${NOTE_TYPES[documentType].toLowerCase()}`}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default TaxInvoiceNoteModal;
