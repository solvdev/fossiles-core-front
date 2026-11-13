import React, { useEffect, useState } from "react";
import { Modal, Spinner } from "reactstrap";
import { voidTaxInvoice } from "services/taxInvoiceService";
import { showError, showSuccess } from "utils/notificationHelper";
import { taxInvoiceDocumentLabel } from "utils/taxInvoiceLabels";
import { IconClose } from "components/accounting/felUi";
import "views/accounting/fel-ui.css";

function TaxInvoiceVoidModal({ isOpen, onClose, invoice, onSuccess }) {
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setVoidReason("");
      setVoiding(false);
    }
  }, [isOpen, invoice?.id]);

  const documentLabel = taxInvoiceDocumentLabel(invoice?.documentType);

  const handleVoid = async () => {
    if (!invoice?.id || !voidReason.trim()) {
      showError("Indica el motivo de anulación.");
      return;
    }
    try {
      setVoiding(true);
      const updated = await voidTaxInvoice(invoice.id, voidReason.trim());
      showSuccess(`${documentLabel} anulada ante el SAT. Quedó en Anuladas.`);
      if (onSuccess) onSuccess(updated);
      onClose();
    } catch (err) {
      showError(err.message || "No se pudo anular la factura FEL.");
    } finally {
      setVoiding(false);
    }
  };

  const label = invoice?.internalNumber || invoice?.felSerie
    ? `${invoice.internalNumber || "—"} · ${invoice.felSerie || "—"}/${invoice.felNumero || "—"}`
    : invoice?.id;

  return (
    <Modal
      isOpen={isOpen}
      toggle={voiding ? undefined : onClose}
      centered
      modalClassName="fel-ui"
    >
      <div className="fel-modal__head">
        <div>
          <h2 className="fel-modal__title">Anular {documentLabel.toLowerCase()} FEL</h2>
          <p className="fel-modal__sub">
            {documentLabel} <strong>{label || "—"}</strong>
          </p>
        </div>
        <button
          type="button"
          className="fel-icon-btn"
          style={{ width: 44, height: 44, margin: "-6px -8px 0 0" }}
          aria-label="Cerrar"
          onClick={onClose}
          disabled={voiding}
        >
          <IconClose />
        </button>
      </div>

      <div className="fel-modal__body">
        {invoice?.felUuid && (
          <div>
            <div className="fel-kv__label">UUID</div>
            <div className="fel-mono" style={{ fontSize: 13, wordBreak: "break-all" }}>{invoice.felUuid}</div>
          </div>
        )}
        <div className="fel-notice fel-notice--warn" style={{ marginBottom: 0 }}>
          <span>
            La anulación se envía al certificador FEL (INFILE) y no se puede deshacer. El documento queda
            en <strong>Anulada</strong>, con su motivo y UUID de anulación. Si necesitas reemitirlo, usa{" "}
            <strong>Firmar FEL</strong> desde el detalle. Una factura con notas vigentes solo se anula
            después de anular sus notas.
          </span>
        </div>
        <div>
          <label className="fel-label" htmlFor="fel-void-reason">Motivo de anulación</label>
          <input
            id="fel-void-reason"
            type="text"
            className="fel-input"
            placeholder="Obligatorio"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            disabled={voiding}
          />
        </div>
      </div>

      <div className="fel-modal__foot" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="fel-btn" onClick={onClose} disabled={voiding}>
          Cancelar
        </button>
        <button
          type="button"
          className="fel-btn fel-btn--primary"
          style={{ background: "var(--fel-danger)", borderColor: "var(--fel-danger)" }}
          onClick={handleVoid}
          disabled={voiding || !voidReason.trim()}
        >
          {voiding ? <Spinner size="sm" /> : "Confirmar anulación"}
        </button>
      </div>
    </Modal>
  );
}

export default TaxInvoiceVoidModal;
