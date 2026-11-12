import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Collapse, Spinner } from "reactstrap";
import {
  getTaxInvoiceById,
  retryTaxInvoice,
  downloadTaxInvoiceCertifiedXml,
  openFelInvoiceReport,
} from "services/taxInvoiceService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { useAuth } from "contexts/AuthContext";
import { canEditTaxInvoiceFel } from "utils/taxInvoiceEditHelper";
import { showSuccess } from "utils/notificationHelper";
import {
  TAX_INVOICE_SOURCE_LABELS,
  formatQuantity,
  formatQuetzales,
  isCreditDebitNote,
  taxInvoiceDocumentLabel,
  taxInvoiceStatus,
} from "utils/taxInvoiceLabels";
import TaxInvoiceVoidModal from "components/accounting/TaxInvoiceVoidModal";
import TaxInvoiceNoteModal from "components/accounting/TaxInvoiceNoteModal";
import {
  FelKv,
  FelStatusPill,
  IconBack,
  IconCopy,
  IconPlus,
} from "components/accounting/felUi";
import "./fel-ui.css";

const ACTION_LABELS = {
  ISSUE: "Emisión",
  RETRY: "Reintento",
  REISSUE: "Reemisión",
  VOID: "Anulación",
};

const DOT_COLORS = {
  CERTIFIED: "#11603a",
  FAILED: "#9b241b",
  VOID: "#6b746d",
  DRAFT: "#b87400",
  SKIPPED: "#b87400",
};

const formatCurrency = formatQuetzales;

function AccountingInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, hasAnyRole, hasPermission } = useAuth();
  const canManageFel = canEditTaxInvoiceFel({ hasRole, hasAnyRole, hasPermission });
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [error, setError] = useState("");
  const [openAttemptId, setOpenAttemptId] = useState(null);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getTaxInvoiceById(id);
      setInvoice(data);
    } catch (err) {
      setError(err.message || "No se pudo cargar el documento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [id]);

  const documentLabel = taxInvoiceDocumentLabel(invoice?.documentType);

  const handleRetry = async () => {
    const confirmed = window.confirm(
      `¿Firmar (certificar) ${documentLabel.toLowerCase()} ${invoice?.internalNumber || id} ante el SAT?`
    );
    if (!confirmed) return;
    try {
      setRetrying(true);
      setError("");
      await retryTaxInvoice(id);
      await loadInvoice();
    } catch (err) {
      setError(err.message || "No se pudo certificar el documento.");
    } finally {
      setRetrying(false);
    }
  };

  const handleDownloadXml = async () => {
    try {
      setDownloadingXml(true);
      setError("");
      await downloadTaxInvoiceCertifiedXml(invoice.id);
    } catch (err) {
      setError(err.message || "No se pudo descargar el XML certificado.");
    } finally {
      setDownloadingXml(false);
    }
  };

  const handleCopyUuid = async () => {
    try {
      await navigator.clipboard.writeText(invoice.felUuid);
      showSuccess("UUID copiado.");
    } catch (err) {
      setError("No se pudo copiar el UUID.");
    }
  };

  const canRetry = canManageFel && invoice && (
    ["FAILED", "SKIPPED", "DRAFT"].includes(invoice.status)
    || (invoice.status === "VOID" && !invoice.felUuid)
  );
  const canDownloadXml = invoice?.status === "CERTIFIED" && invoice?.hasCertifiedXml;
  const canDownloadFelReport = invoice?.status === "CERTIFIED" && invoice?.felUuid;
  const canOpenVoid = canManageFel
    && invoice?.status === "CERTIFIED"
    && invoice?.felUuid;
  const isNote = isCreditDebitNote(invoice?.documentType);
  const creditDebitNotes = invoice?.creditDebitNotes || [];
  const canIssueNote = canManageFel
    && invoice?.creditDebitNotesEnabled
    && !isNote
    && invoice?.status === "CERTIFIED"
    && invoice?.felUuid
    && !invoice?.consumidorFinal;
  const status = taxInvoiceStatus(invoice?.status);

  const handleDownloadFelReport = () => {
    try {
      setError("");
      openFelInvoiceReport(invoice.felUuid);
    } catch (err) {
      setError(err.message || "No se pudo abrir el PDF FEL.");
    }
  };
  const attempts = invoice?.attempts || [];

  if (loading) {
    return <div className="content fel-ui text-center p-5"><Spinner color="primary" /></div>;
  }

  if (!invoice) {
    return (
      <div className="content fel-ui">
        <div className="fel-notice fel-notice--err" role="alert">{error || "Documento no encontrado."}</div>
        <button type="button" className="fel-btn" onClick={() => navigate("/admin/accounting/invoices")}>
          Volver
        </button>
      </div>
    );
  }

  const sourceLabel = TAX_INVOICE_SOURCE_LABELS[invoice.sourceType] || invoice.sourceType || "—";

  // Saldo: lo vigente frente a lo acreditado / cargado por notas certificadas.
  const certifiedNotes = creditDebitNotes.filter((note) => note.status === "CERTIFIED");
  const creditedTotal = certifiedNotes
    .filter((note) => note.documentType === "NCRE")
    .reduce((sum, note) => sum + Number(note.totalAmount || 0), 0);
  const debitedTotal = certifiedNotes
    .filter((note) => note.documentType === "NDEB")
    .reduce((sum, note) => sum + Number(note.totalAmount || 0), 0);
  const balance = Number(invoice.noteBalance ?? invoice.totalAmount ?? 0);
  const barBase = Math.max(Number(invoice.totalAmount || 0) + debitedTotal, 0.01);
  const creditPct = Math.min(100, (creditedTotal / barBase) * 100);
  const debitPct = Math.min(100 - creditPct, (debitedTotal / barBase) * 100);
  const validPct = Math.max(0, 100 - creditPct - debitPct);

  const showBalanceColumn = !isNote && (creditDebitNotes.length > 0 || canIssueNote);
  const showIdentity = invoice.felSerie || invoice.felNumero || invoice.felUuid;

  return (
    <div className="content fel-ui">
      <button
        type="button"
        className="fel-back"
        onClick={() => navigate("/admin/accounting/invoices")}
      >
        <IconBack /> Facturas FEL
      </button>

      <div className="fel-header" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="d-flex flex-wrap align-items-center" style={{ gap: 12 }}>
            <h1 className="fel-title">
              {documentLabel} {invoice.internalNumber || `#${invoice.id}`}
            </h1>
            <FelStatusPill status={invoice.status} label={status.label} large />
            {invoice.testDocument && <span className="fel-pill fel-pill--test fel-pill--lg">Prueba (sandbox)</span>}
          </div>
          <p className="fel-subtitle">
            {invoice.issuedAt ? `Emitida el ${formatDateTimeGt(invoice.issuedAt)}` : "Aún sin fecha de emisión"}
            {" · "}
            {sourceLabel}
            {invoice.sourceId ? ` #${invoice.sourceId}` : ""}
            {status.detail ? ` · ${status.detail}` : ""}
          </p>
        </div>
        <div className="fel-actions">
          {canRetry && (
            <button
              type="button"
              className="fel-btn fel-btn--primary"
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? <Spinner size="sm" /> : "Firmar FEL"}
            </button>
          )}
          {canDownloadFelReport && (
            <button type="button" className="fel-btn" onClick={handleDownloadFelReport}>
              Ver PDF
            </button>
          )}
          {canDownloadXml && (
            <button type="button" className="fel-btn" onClick={handleDownloadXml} disabled={downloadingXml}>
              {downloadingXml ? <Spinner size="sm" /> : "Descargar XML"}
            </button>
          )}
          {canOpenVoid && (
            <button type="button" className="fel-btn fel-btn--danger" onClick={() => setVoidOpen(true)}>
              Anular
            </button>
          )}
          {canIssueNote && (
            <button type="button" className="fel-btn fel-btn--primary" onClick={() => setNoteOpen(true)}>
              <IconPlus /> Emitir nota de crédito/débito
            </button>
          )}
        </div>
      </div>

      {error && <div className="fel-notice fel-notice--err" role="alert">{error}</div>}
      {invoice.felError && invoice.status !== "CERTIFIED" && (
        <div className="fel-notice fel-notice--err" role="alert">
          <span><strong>Error FEL:</strong> {invoice.felError}</span>
        </div>
      )}
      {invoice.status === "VOID" && (
        <div className="fel-notice fel-notice--muted">
          <span>
            Anulado ante el SAT{invoice.voidedAt ? ` el ${formatDateTimeGt(invoice.voidedAt)}` : ""}
            {invoice.voidReason ? ` · Motivo: ${invoice.voidReason}` : ""}.
            {" "}Para reemitir con datos corregidos use <strong>Firmar FEL</strong>.
          </span>
        </div>
      )}

      {showIdentity && (
        <div className="fel-card">
          <div className="fel-identity">
            <FelKv label="Serie">
              <span className="fel-mono" style={{ fontSize: 15, fontWeight: 500 }}>{invoice.felSerie || "—"}</span>
            </FelKv>
            <FelKv label="Número">
              <span className="fel-mono" style={{ fontSize: 15, fontWeight: 500 }}>{invoice.felNumero || "—"}</span>
            </FelKv>
            <div className="fel-identity__wide">
              <div className="fel-kv__label">UUID de autorización</div>
              <div className="d-flex align-items-center" style={{ gap: 8, marginTop: 2 }}>
                {invoice.felUuid ? (
                  <>
                    <span className="fel-mono" style={{ fontSize: 13, wordBreak: "break-all" }}>{invoice.felUuid}</span>
                    <button
                      type="button"
                      className="fel-icon-btn fel-icon-btn--bordered"
                      aria-label="Copiar UUID"
                      onClick={handleCopyUuid}
                    >
                      <IconCopy />
                    </button>
                  </>
                ) : "—"}
              </div>
            </div>
            {invoice.felVoidUuid && (
              <div className="fel-identity__wide">
                <div className="fel-kv__label">UUID de anulación</div>
                <div className="fel-mono" style={{ fontSize: 13, marginTop: 2, wordBreak: "break-all" }}>
                  {invoice.felVoidUuid}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fel-detail-layout">
        <div className="fel-detail-main">
          <div className="fel-card">
            <div className="fel-card__head">
              <h2 className="fel-card__title">Cliente</h2>
            </div>
            <div className="fel-kv-grid">
              <FelKv label="Nombre">{invoice.customerName || "—"}</FelKv>
              <FelKv label="NIT">{invoice.customerTaxId || "—"}</FelKv>
              {invoice.address && <FelKv label="Dirección">{invoice.address}</FelKv>}
              {invoice.email && <FelKv label="Correo">{invoice.email}</FelKv>}
              {isNote && (
                <FelKv label="Factura origen">
                  <button
                    type="button"
                    className="fel-link-btn"
                    style={{ padding: 0, minHeight: 0 }}
                    onClick={() => navigate(`/admin/accounting/invoices/${invoice.originInvoiceId}`)}
                  >
                    {invoice.originInternalNumber || `#${invoice.originInvoiceId}`}
                  </button>
                  {(invoice.originFelSerie || invoice.originFelNumero) && (
                    <span className="fel-muted"> · {invoice.originFelSerie || "—"} / {invoice.originFelNumero || "—"}</span>
                  )}
                </FelKv>
              )}
              {isNote && invoice.adjustmentReason && (
                <FelKv label="Motivo del ajuste">{invoice.adjustmentReason}</FelKv>
              )}
            </div>
            {invoice.notes && (
              <div style={{ marginTop: 16 }}>
                <div className="fel-kv__label">Observaciones</div>
                <div className="fel-kv__value" style={{ whiteSpace: "pre-line", fontSize: 13 }}>{invoice.notes}</div>
              </div>
            )}
          </div>

          <div className="fel-card fel-card--flush">
            <div className="fel-card__head">
              <h2 className="fel-card__title">Líneas</h2>
            </div>
            <div className="fel-table-wrap">
              <table className="fel-table" style={{ minWidth: 560 }}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Descripción</th>
                    <th className="is-right">Cant.</th>
                    <th className="is-right">P. unit.</th>
                    <th className="is-right">IVA</th>
                    <th className="is-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.lines || []).map((line) => (
                    <tr key={line.id || line.lineNumber}>
                      <td className="fel-muted">{line.lineNumber}</td>
                      <td>{line.description}</td>
                      <td className="is-right fel-num">{formatQuantity(line.quantity)}</td>
                      <td className="is-right fel-num">{formatCurrency(line.unitPrice)}</td>
                      <td className="is-right fel-num fel-muted">{formatCurrency(line.taxAmount)}</td>
                      <td className="is-right fel-num" style={{ fontWeight: 600 }}>{formatCurrency(line.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="fel-totals">
              <div className="fel-totals__box">
                <div className="fel-totals__row">
                  <span className="fel-muted">Subtotal</span>
                  <span className="fel-num">{formatCurrency(invoice.subtotal)}</span>
                </div>
                {Number(invoice.discountAmount || 0) > 0 && (
                  <div className="fel-totals__row">
                    <span className="fel-muted">Descuento</span>
                    <span className="fel-num">−{formatCurrency(invoice.discountAmount)}</span>
                  </div>
                )}
                <div className="fel-totals__row">
                  <span className="fel-muted">IVA incluido</span>
                  <span className="fel-num">{formatCurrency(invoice.taxAmount)}</span>
                </div>
                <div className="fel-totals__row fel-totals__row--total">
                  <span>Total</span>
                  <span className="fel-num">{formatCurrency(invoice.totalAmount)}</span>
                </div>
              </div>
            </div>
            {invoice.status === "CERTIFIED" && !invoice.hasCertifiedXml && (
              <p className="fel-muted px-3 pb-3 mb-0" style={{ fontSize: 13 }}>
                XML certificado no guardado (documento anterior a ese respaldo).
              </p>
            )}
          </div>
        </div>

        {showBalanceColumn && (
          <div className="fel-detail-side">
            <div className="fel-card">
              <h2 className="fel-card__title">Saldo de la factura</h2>
              <div className="fel-balance fel-num">{formatCurrency(balance)}</div>
              {creditDebitNotes.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="fel-bar" role="img" aria-label={`Vigente ${formatCurrency(balance)}, acreditado ${formatCurrency(creditedTotal)}`}>
                    <div className="fel-bar__valid" style={{ width: `${validPct}%` }} />
                    {debitPct > 0 && <div className="fel-bar__debit" style={{ width: `${debitPct}%` }} />}
                    {creditPct > 0 && <div className="fel-bar__credit" style={{ width: `${creditPct}%` }} />}
                  </div>
                  <div className="fel-bar-legend">
                    <span>Vigente {formatCurrency(balance)}</span>
                    <span>Acreditado {formatCurrency(creditedTotal)}</span>
                    {debitedTotal > 0 && <span>Cargado {formatCurrency(debitedTotal)}</span>}
                  </div>
                </div>
              )}
              <p className="fel-muted" style={{ fontSize: 13, margin: "16px 0 0" }}>
                Total de la factura + notas de débito − notas de crédito. Solo cuentan las notas certificadas ante el SAT.
              </p>
            </div>

            <div className="fel-card">
              <div className="fel-card__head">
                <h2 className="fel-card__title">
                  Notas ligadas <span className="fel-muted" style={{ fontWeight: 500 }}>({creditDebitNotes.length})</span>
                </h2>
              </div>
              {creditDebitNotes.length === 0 ? (
                <p className="fel-muted mb-0">Esta factura no tiene notas ligadas.</p>
              ) : (
                creditDebitNotes.map((note) => {
                  const noteStatus = taxInvoiceStatus(note.status);
                  const failed = note.status === "FAILED" || note.status === "DRAFT" || note.status === "SKIPPED";
                  return (
                    <div className="fel-note-card" key={note.id}>
                      <div className="fel-note-card__top">
                        <span>{note.internalNumber || note.id}</span>
                        <span className="fel-num">
                          {note.documentType === "NCRE" ? "−" : "+"}
                          {formatCurrency(note.totalAmount)}
                        </span>
                      </div>
                      <div className="fel-note-card__meta">
                        <span className="fel-pill fel-pill--note">{taxInvoiceDocumentLabel(note.documentType)}</span>
                        <FelStatusPill status={note.status} label={noteStatus.label} />
                        <span>{note.issuedAt ? formatDateTimeGt(note.issuedAt) : "—"}</span>
                      </div>
                      {note.adjustmentReason && <div>{note.adjustmentReason}</div>}
                      {note.felError && (
                        <div style={{ fontSize: 13, color: "var(--fel-danger)" }}>
                          {note.felError.length > 120 ? `${note.felError.slice(0, 120)}…` : note.felError}
                        </div>
                      )}
                      {failed && (
                        <div className="fel-muted" style={{ fontSize: 13 }}>
                          No cuenta en el saldo hasta que se certifique.
                        </div>
                      )}
                      <div>
                        <button
                          type="button"
                          className="fel-link-btn"
                          onClick={() => navigate(`/admin/accounting/invoices/${note.id}`)}
                        >
                          {failed ? "Abrir y reintentar firma" : "Ver nota"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
              <p className="fel-muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
                Para anular la factura primero hay que anular sus notas vigentes (SAT).
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="fel-card">
        <div className="fel-card__head">
          <h2 className="fel-card__title">Bitácora FEL</h2>
          <span className="fel-card__hint">
            {attempts.length} intento{attempts.length === 1 ? "" : "s"}
          </span>
        </div>
        {attempts.length === 0 ? (
          <p className="fel-muted mb-0">Aún no hay intentos registrados para esta factura.</p>
        ) : (
          <div>
            {attempts.map((attempt) => {
              const attemptStatus = taxInvoiceStatus(attempt.status);
              const isOpen = openAttemptId === attempt.id;
              return (
                <div className="fel-timeline__item" key={attempt.id}>
                  <div className="fel-timeline__rail">
                    <span
                      className="fel-timeline__dot"
                      style={{ background: DOT_COLORS[attempt.status] || "#6b746d" }}
                    />
                    <span className="fel-timeline__line" />
                  </div>
                  <div className="fel-timeline__body">
                    <div className="d-flex flex-wrap align-items-center" style={{ gap: 8 }}>
                      <strong>
                        Intento #{attempt.attemptNumber} · {ACTION_LABELS[attempt.action] || attempt.action}
                      </strong>
                      <FelStatusPill status={attempt.status} label={attemptStatus.label} />
                      <span className="fel-muted" style={{ fontSize: 13 }}>
                        {attempt.createdAt ? formatDateTimeGt(attempt.createdAt) : "—"}
                        {attempt.felEnabled === false && " · FEL desactivado en servidor"}
                      </span>
                    </div>
                    <div className="fel-muted" style={{ fontSize: 13, marginTop: 4, wordBreak: "break-word" }}>
                      {attempt.customerName || "—"} · NIT {attempt.customerTaxId || "—"} · Total {formatCurrency(attempt.totalAmount)}
                      {attempt.felSerie || attempt.felNumero
                        ? ` · ${attempt.felSerie || "—"} / ${attempt.felNumero || "—"}`
                        : ""}
                    </div>
                    {attempt.felUuid && (
                      <div className="fel-mono fel-muted" style={{ fontSize: 12, marginTop: 2, wordBreak: "break-all" }}>
                        UUID {attempt.felUuid}
                      </div>
                    )}
                    {attempt.felTransactionId && (
                      <div className="fel-muted" style={{ fontSize: 13, marginTop: 2 }}>
                        ID de transacción {attempt.felTransactionId}
                      </div>
                    )}
                    {attempt.felError && (
                      <div style={{ fontSize: 13, marginTop: 4, color: "var(--fel-danger)", wordBreak: "break-word" }}>
                        Error: {attempt.felError}
                      </div>
                    )}
                    <button
                      type="button"
                      className="fel-link-btn"
                      style={{ paddingLeft: 0 }}
                      aria-expanded={isOpen}
                      onClick={() => setOpenAttemptId(isOpen ? null : attempt.id)}
                    >
                      {isOpen ? "Ocultar líneas enviadas" : "Ver líneas enviadas"}
                    </button>
                    <Collapse isOpen={isOpen}>
                      <div className="fel-attempt-lines fel-table-wrap">
                        <table className="fel-table" style={{ minWidth: 420 }}>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Descripción</th>
                              <th className="is-right">Cant.</th>
                              <th className="is-right">P. unit.</th>
                              <th className="is-right">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(attempt.lines || []).map((line) => (
                              <tr key={`${attempt.id}-${line.lineNumber}`}>
                                <td>{line.lineNumber}</td>
                                <td>{line.description}</td>
                                <td className="is-right fel-num">{formatQuantity(line.quantity)}</td>
                                <td className="is-right fel-num">{formatCurrency(line.unitPrice)}</td>
                                <td className="is-right fel-num">{formatCurrency(line.lineTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Collapse>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TaxInvoiceVoidModal
        isOpen={voidOpen}
        onClose={() => setVoidOpen(false)}
        invoice={invoice}
        onSuccess={loadInvoice}
      />

      <TaxInvoiceNoteModal
        isOpen={noteOpen}
        onClose={() => setNoteOpen(false)}
        invoice={invoice}
        onSuccess={loadInvoice}
      />
    </div>
  );
}

export default AccountingInvoiceDetail;
