import React, { useEffect, useMemo, useState } from "react";
import { Modal, Spinner } from "reactstrap";
import { issueTaxInvoiceNote } from "services/taxInvoiceService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatQuetzales } from "utils/taxInvoiceLabels";
import { IconClose, IconInfo, IconLock } from "components/accounting/felUi";
import "views/accounting/fel-ui.css";

const NOTE_TYPES = {
  NCRE: "Nota de crédito",
  NDEB: "Nota de débito",
};

const REASON_SUGGESTIONS = {
  NCRE: ["Devolución de mercadería", "Descuento o rebaja", "Error en el precio", "Error en la cantidad"],
  NDEB: ["Recargo por pago tardío", "Aumento de precio", "Cargo adicional"],
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
  const balanceAfter = documentType === "NCRE" ? balance - total : balance + total;

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

  const originLabel = invoice?.internalNumber || invoice?.id || "—";
  const typeName = NOTE_TYPES[documentType];

  return (
    <Modal
      isOpen={isOpen}
      toggle={saving ? undefined : onClose}
      centered
      size="lg"
      modalClassName="fel-ui"
    >
      <div className="fel-modal__head">
        <div>
          <h2 className="fel-modal__title">Emitir nota sobre {originLabel}</h2>
          <p className="fel-modal__sub">
            Serie {invoice?.felSerie || "—"} · Número {invoice?.felNumero || "—"}
          </p>
        </div>
        <button
          type="button"
          className="fel-icon-btn"
          style={{ width: 44, height: 44, margin: "-6px -8px 0 0" }}
          aria-label="Cerrar"
          onClick={onClose}
          disabled={saving}
        >
          <IconClose />
        </button>
      </div>

      <div className="fel-modal__body">
        <div className="fel-origin-strip">
          <div className="fel-origin-strip__wide">
            <div className="fel-kv__label d-flex align-items-center" style={{ gap: 6 }}>
              <IconLock /> Receptor (el mismo de la factura)
            </div>
            <div className="fel-kv__value" style={{ fontWeight: 500 }}>
              {invoice?.customerName || "—"}
              <span className="fel-muted" style={{ fontWeight: 400 }}> · NIT {invoice?.customerTaxId || "—"}</span>
            </div>
          </div>
          <div>
            <div className="fel-kv__label">Total de la factura</div>
            <div className="fel-kv__value fel-num">{formatCurrency(originTotal)}</div>
          </div>
          <div>
            <div className="fel-kv__label">Saldo disponible</div>
            <div className="fel-kv__value fel-num" style={{ fontWeight: 600 }}>{formatCurrency(balance)}</div>
          </div>
        </div>

        <fieldset className="fel-radio-grid">
          <legend className="fel-label" style={{ marginBottom: 8 }}>Tipo de nota</legend>
          <label className={`fel-radio-card ${documentType === "NCRE" ? "is-selected" : ""}`}>
            <input
              type="radio"
              name="fel-note-type"
              checked={documentType === "NCRE"}
              onChange={() => setDocumentType("NCRE")}
              disabled={saving}
            />
            <span>
              <span className="fel-radio-card__title">Nota de crédito</span>
              <span className="fel-radio-card__text">Devolución, descuento o rebaja. Resta del saldo.</span>
            </span>
          </label>
          <label className={`fel-radio-card ${documentType === "NDEB" ? "is-selected" : ""}`}>
            <input
              type="radio"
              name="fel-note-type"
              checked={documentType === "NDEB"}
              onChange={() => setDocumentType("NDEB")}
              disabled={saving}
            />
            <span>
              <span className="fel-radio-card__title">Nota de débito</span>
              <span className="fel-radio-card__text">Recargo o aumento de precio. Suma al saldo.</span>
            </span>
          </label>
        </fieldset>

        <div>
          <div className="d-flex justify-content-between align-items-baseline" style={{ gap: 12, marginBottom: 6 }}>
            <label className="fel-label mb-0" htmlFor="fel-note-reason">Motivo del ajuste</label>
            <span className="fel-muted" style={{ fontSize: 12 }}>
              Obligatorio · va al SAT · {reason.length}/255
            </span>
          </div>
          <input
            id="fel-note-reason"
            type="text"
            className="fel-input"
            maxLength={255}
            placeholder="Ej. Devolución de mercadería"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={saving}
          />
          <div className="fel-chips" style={{ marginTop: 8 }}>
            {REASON_SUGGESTIONS[documentType].map((text) => (
              <button
                key={text}
                type="button"
                className="fel-chip"
                onClick={() => setReason(text)}
                disabled={saving}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="d-flex flex-wrap justify-content-between align-items-center" style={{ gap: 8, marginBottom: 8 }}>
            <div>
              <span className="fel-label d-inline mb-0">Líneas</span>{" "}
              <span className="fel-muted" style={{ fontSize: 12 }}>· precios con IVA incluido</span>
            </div>
            <div className="d-flex flex-wrap" style={{ gap: 4 }}>
              <button type="button" className="fel-link-btn" onClick={copyInvoiceLines} disabled={saving}>
                Copiar líneas de la factura
              </button>
              <button
                type="button"
                className="fel-link-btn"
                onClick={() => setLines((current) => [...current, emptyLine()])}
                disabled={saving}
              >
                + Agregar línea
              </button>
            </div>
          </div>
          <div className="fel-table-wrap">
            <table className="fel-table fel-lines-table" style={{ minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ paddingLeft: 0 }}>Descripción</th>
                  <th style={{ width: 90 }}>Cant.</th>
                  <th style={{ width: 120 }}>P. unit.</th>
                  <th style={{ width: 110 }} className="is-right">Total</th>
                  <th style={{ width: 44, paddingRight: 0 }}><span className="fel-visually-hidden">Quitar</span></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td style={{ paddingLeft: 0, borderBottom: 0 }}>
                      <input
                        className="fel-input"
                        aria-label={`Descripción de la línea ${index + 1}`}
                        value={line.description}
                        onChange={(e) => updateLine(index, "description", e.target.value)}
                        disabled={saving}
                      />
                    </td>
                    <td style={{ borderBottom: 0 }}>
                      <input
                        className="fel-input"
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`Cantidad de la línea ${index + 1}`}
                        value={line.quantity}
                        onChange={(e) => updateLine(index, "quantity", e.target.value)}
                        disabled={saving}
                      />
                    </td>
                    <td style={{ borderBottom: 0 }}>
                      <input
                        className="fel-input"
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Precio unitario de la línea ${index + 1}`}
                        value={line.unitPrice}
                        onChange={(e) => updateLine(index, "unitPrice", e.target.value)}
                        disabled={saving}
                      />
                    </td>
                    <td className="is-right fel-num" style={{ fontWeight: 600, verticalAlign: "middle", borderBottom: 0 }}>
                      {formatCurrency(lineTotal(line))}
                    </td>
                    <td style={{ paddingRight: 0, textAlign: "right", borderBottom: 0 }}>
                      <button
                        type="button"
                        className="fel-icon-btn"
                        aria-label={`Quitar la línea ${index + 1}`}
                        onClick={() => removeLine(index)}
                        disabled={saving || lines.length === 1}
                      >
                        <IconClose />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {exceedsBalance && (
            <div className="fel-notice fel-notice--warn" style={{ marginTop: 12, marginBottom: 0 }} role="alert">
              Una nota de crédito no puede pasar el saldo de la factura ({formatCurrency(creditLimit)}).
            </div>
          )}
        </div>

        <div>
          <label className="fel-label" htmlFor="fel-note-obs">
            Observaciones internas <small>(opcional, no van al SAT)</small>
          </label>
          <textarea
            id="fel-note-obs"
            className="fel-textarea"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
          />
        </div>

        <div className="fel-notice" style={{ marginBottom: 0 }}>
          <IconInfo />
          <span>
            Si la nota se emite más de 2 meses después de la factura, SAT exige la frase 9-22. Se agrega sola
            cuando corresponde. Las facturas a consumidor final (CF) no admiten notas.
          </span>
        </div>
      </div>

      <div className="fel-modal__foot">
        <div className="fel-modal__sums">
          <div>
            <div className="fel-kv__label">Total de la nota</div>
            <div className="fel-modal__sum-value fel-num">
              {documentType === "NCRE" ? "−" : "+"}{formatCurrency(total)}
            </div>
          </div>
          <div>
            <div className="fel-kv__label">Saldo de la factura después</div>
            <div className="fel-modal__sum-value fel-num">
              <span className="fel-muted" style={{ fontSize: 14, fontWeight: 500, textDecoration: "line-through" }}>
                {formatCurrency(balance)}
              </span>{" "}
              {formatCurrency(Math.max(balanceAfter, 0))}
            </div>
          </div>
        </div>
        <div className="d-flex flex-wrap" style={{ gap: 10 }}>
          <button type="button" className="fel-btn" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="button" className="fel-btn fel-btn--primary" onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? <Spinner size="sm" /> : `Emitir ${typeName.toLowerCase()}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default TaxInvoiceNoteModal;
