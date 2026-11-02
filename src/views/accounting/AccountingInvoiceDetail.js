import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Collapse,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import {
  getTaxInvoiceById,
  retryTaxInvoice,
  downloadTaxInvoiceCertifiedXml,
  openFelInvoiceReport,
} from "services/taxInvoiceService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { useAuth } from "contexts/AuthContext";
import { canEditTaxInvoiceFel } from "utils/taxInvoiceEditHelper";
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

const ACTION_LABELS = {
  ISSUE: "Emisión",
  RETRY: "Reintento",
  REISSUE: "Reemisión",
  VOID: "Anulación",
};

const formatCurrency = formatQuetzales;

/** Fila etiqueta / valor del detalle. */
function Field({ label, children, className = "" }) {
  return (
    <div className={`mb-2 ${className}`}>
      <div className="small text-muted">{label}</div>
      <div>{children}</div>
    </div>
  );
}

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
    return <div className="content text-center p-5"><Spinner color="primary" /></div>;
  }

  if (!invoice) {
    return (
      <div className="content">
        <Alert color="danger">{error || "Documento no encontrado."}</Alert>
        <Button color="default" onClick={() => navigate("/admin/accounting/invoices")}>Volver</Button>
      </div>
    );
  }

  const sourceLabel = TAX_INVOICE_SOURCE_LABELS[invoice.sourceType] || invoice.sourceType || "—";

  return (
    <div className="content">
      <Button
        color="link"
        className="px-0 mb-2"
        onClick={() => navigate("/admin/accounting/invoices")}
      >
        <i className="nc-icon nc-minimal-left" /> Facturas FEL
      </Button>
      <Card className="mb-4">
        <CardHeader>
          <Row className="align-items-start">
            <Col lg="5" className="mb-2 mb-lg-0">
              <CardTitle tag="h4" className="mb-1">
                {documentLabel} {invoice.internalNumber || `#${invoice.id}`}
              </CardTitle>
              <Badge color={status.color} className="mr-1">{status.label}</Badge>
              {status.detail && <span className="small text-muted mr-2">{status.detail}</span>}
              {invoice.testDocument && <Badge color="warning">Prueba (sandbox)</Badge>}
            </Col>
            <Col lg="7" className="text-lg-right">
              <div className="d-flex flex-wrap justify-content-lg-end" style={{ gap: "0.5rem" }}>
                {canRetry && (
                  <Button color="warning" size="sm" className="my-0" onClick={handleRetry} disabled={retrying}>
                    {retrying ? <Spinner size="sm" /> : "Firmar FEL"}
                  </Button>
                )}
                {canDownloadFelReport && (
                  <Button color="primary" size="sm" outline className="my-0" onClick={handleDownloadFelReport}>
                    Ver PDF
                  </Button>
                )}
                {canDownloadXml && (
                  <Button color="primary" size="sm" outline className="my-0" onClick={handleDownloadXml} disabled={downloadingXml}>
                    {downloadingXml ? <Spinner size="sm" /> : "Descargar XML"}
                  </Button>
                )}
                {canIssueNote && (
                  <Button color="info" size="sm" className="my-0" onClick={() => setNoteOpen(true)}>
                    Emitir nota de crédito/débito
                  </Button>
                )}
                {canOpenVoid && (
                  <Button color="danger" size="sm" outline className="my-0" onClick={() => setVoidOpen(true)}>
                    Anular
                  </Button>
                )}
              </div>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}
          {invoice.felError && invoice.status !== "CERTIFIED" && (
            <Alert color="danger" className="small">
              <strong>Error FEL:</strong> {invoice.felError}
            </Alert>
          )}
          {invoice.status === "VOID" && (
            <Alert color="secondary" className="small">
              Anulado ante el SAT{invoice.voidedAt ? ` el ${formatDateTimeGt(invoice.voidedAt)}` : ""}
              {invoice.voidReason ? ` · Motivo: ${invoice.voidReason}` : ""}.
              {" "}Para reemitir con datos corregidos use <strong>Firmar FEL</strong>.
            </Alert>
          )}

          <Row className="mb-3">
            <Col md="4">
              <Field label="Cliente">{invoice.customerName || "—"}</Field>
              <Field label="NIT">{invoice.customerTaxId || "—"}</Field>
              {invoice.address && <Field label="Dirección">{invoice.address}</Field>}
              {invoice.email && <Field label="Correo">{invoice.email}</Field>}
            </Col>
            <Col md="4">
              <Field label="Fecha de emisión">
                {invoice.issuedAt ? formatDateTimeGt(invoice.issuedAt) : "—"}
              </Field>
              {isNote ? (
                <>
                  <Field label="Factura origen">
                    <Button
                      color="link"
                      className="p-0 align-baseline"
                      onClick={() => navigate(`/admin/accounting/invoices/${invoice.originInvoiceId}`)}
                    >
                      {invoice.originInternalNumber || `#${invoice.originInvoiceId}`}
                    </Button>
                    {(invoice.originFelSerie || invoice.originFelNumero) && (
                      <span className="text-muted"> · {invoice.originFelSerie || "—"} / {invoice.originFelNumero || "—"}</span>
                    )}
                  </Field>
                  {invoice.adjustmentReason && (
                    <Field label="Motivo del ajuste">{invoice.adjustmentReason}</Field>
                  )}
                </>
              ) : (
                <Field label="Origen">
                  {sourceLabel}
                  {invoice.sourceId ? <span className="text-muted"> #{invoice.sourceId}</span> : null}
                </Field>
              )}
              {(invoice.felSerie || invoice.felNumero) && (
                <Field label="Serie / Número FEL">
                  {invoice.felSerie || "—"} / {invoice.felNumero || "—"}
                </Field>
              )}
              {invoice.felUuid && (
                <Field label="UUID (autorización)">
                  <span className="small text-monospace" style={{ wordBreak: "break-all" }}>{invoice.felUuid}</span>
                </Field>
              )}
              {invoice.felVoidUuid && (
                <Field label="UUID de anulación">
                  <span className="small text-monospace" style={{ wordBreak: "break-all" }}>{invoice.felVoidUuid}</span>
                </Field>
              )}
            </Col>
            <Col md="4">
              <div className="border rounded p-3">
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-muted">Subtotal</span>
                  <span>{formatCurrency(invoice.subtotal)}</span>
                </div>
                {Number(invoice.discountAmount || 0) > 0 && (
                  <div className="d-flex justify-content-between mb-1">
                    <span className="text-muted">Descuento</span>
                    <span>−{formatCurrency(invoice.discountAmount)}</span>
                  </div>
                )}
                <div className="d-flex justify-content-between mb-1">
                  <span className="text-muted">IVA incluido</span>
                  <span>{formatCurrency(invoice.taxAmount)}</span>
                </div>
                <div className="d-flex justify-content-between border-top pt-2 mt-2">
                  <strong>Total</strong>
                  <strong>{formatCurrency(invoice.totalAmount)}</strong>
                </div>
              </div>
              {invoice.status === "CERTIFIED" && !invoice.hasCertifiedXml && (
                <p className="text-muted small mt-2 mb-0">
                  XML certificado no guardado (documento anterior a ese respaldo).
                </p>
              )}
              {invoice.notes && (
                <Field label="Observaciones" className="mt-3">
                  <span className="small" style={{ whiteSpace: "pre-line" }}>{invoice.notes}</span>
                </Field>
              )}
            </Col>
          </Row>

          <h5 className="mb-2">Líneas</h5>
          <Table responsive hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Descripción</th>
                <th className="text-right">Cant.</th>
                <th className="text-right">P. unit.</th>
                <th className="text-right">IVA</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lines || []).map((line) => (
                <tr key={line.id || line.lineNumber}>
                  <td>{line.lineNumber}</td>
                  <td>{line.description}</td>
                  <td className="text-right">{formatQuantity(line.quantity)}</td>
                  <td className="text-right">{formatCurrency(line.unitPrice)}</td>
                  <td className="text-right">{formatCurrency(line.taxAmount)}</td>
                  <td className="text-right">{formatCurrency(line.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      {!isNote && (creditDebitNotes.length > 0 || canIssueNote) && (
        <Card className="mb-4">
          <CardHeader>
            <Row className="align-items-center">
              <Col>
                <CardTitle tag="h4" className="mb-0">
                  Notas de crédito/débito ({creditDebitNotes.length})
                </CardTitle>
              </Col>
              <Col className="text-right">
                <span className="text-muted">
                  Saldo de la factura: <strong>{formatCurrency(invoice.noteBalance ?? invoice.totalAmount)}</strong>
                </span>
              </Col>
            </Row>
          </CardHeader>
          <CardBody>
            {creditDebitNotes.length === 0 ? (
              <p className="text-muted mb-0">Esta factura no tiene notas ligadas.</p>
            ) : (
              <Table responsive hover size="sm" className="mb-0">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Tipo</th>
                    <th>Fecha</th>
                    <th>Motivo</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>Serie / Número</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {creditDebitNotes.map((note) => (
                    <tr key={note.id}>
                      <td>{note.internalNumber || note.id}</td>
                      <td>{taxInvoiceDocumentLabel(note.documentType)}</td>
                      <td>{note.issuedAt ? formatDateTimeGt(note.issuedAt) : "—"}</td>
                      <td>{note.adjustmentReason || "—"}</td>
                      <td>
                        {note.documentType === "NCRE" ? "−" : "+"}
                        {formatCurrency(note.totalAmount)}
                      </td>
                      <td>
                        <Badge color={taxInvoiceStatus(note.status).color}>{taxInvoiceStatus(note.status).label}</Badge>
                        {note.felError && (
                          <div className="small text-danger mt-1" title={note.felError}>
                            {note.felError.length > 60 ? `${note.felError.slice(0, 60)}…` : note.felError}
                          </div>
                        )}
                      </td>
                      <td>{note.felSerie || "—"} / {note.felNumero || "—"}</td>
                      <td className="text-right">
                        <Button
                          color="link"
                          size="sm"
                          className="p-0"
                          onClick={() => navigate(`/admin/accounting/invoices/${note.id}`)}
                        >
                          Ver detalle
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <p className="text-muted small mt-2 mb-0">
              Saldo = total de la factura + notas de débito − notas de crédito certificadas. Para anular la
              factura primero anule sus notas vigentes (SAT).
            </p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle tag="h4" className="mb-0">
            Bitácora de intentos FEL ({attempts.length})
          </CardTitle>
        </CardHeader>
        <CardBody>
          {attempts.length === 0 ? (
            <p className="text-muted mb-0">Aún no hay intentos registrados para esta factura.</p>
          ) : (
            attempts.map((attempt) => (
              <div key={attempt.id} className="border rounded p-3 mb-3">
                <Row className="align-items-center">
                  <Col md="8">
                    <strong>Intento #{attempt.attemptNumber}</strong>
                    {" · "}
                    <Badge color="info">{ACTION_LABELS[attempt.action] || attempt.action}</Badge>
                    {" "}
                    <Badge color={taxInvoiceStatus(attempt.status).color}>{taxInvoiceStatus(attempt.status).label}</Badge>
                    <div className="text-muted small mt-1">
                      {attempt.createdAt ? formatDateTimeGt(attempt.createdAt) : "—"}
                      {attempt.felEnabled === false && " · FEL desactivado en servidor"}
                    </div>
                  </Col>
                  <Col md="4" className="text-md-right">
                    <Button
                      color="link"
                      size="sm"
                      className="p-0"
                      onClick={() => setOpenAttemptId(openAttemptId === attempt.id ? null : attempt.id)}
                    >
                      {openAttemptId === attempt.id ? "Ocultar detalle" : "Ver detalle"}
                    </Button>
                  </Col>
                </Row>

                <Row className="mt-2 small">
                  <Col md="6">
                    <div><strong>Cliente:</strong> {attempt.customerName || "—"}</div>
                    <div><strong>NIT:</strong> {attempt.customerTaxId || "—"}</div>
                    <div><strong>Total:</strong> {formatCurrency(attempt.totalAmount)}</div>
                  </Col>
                  <Col md="6">
                    {attempt.felUuid && <div><strong>UUID:</strong> {attempt.felUuid}</div>}
                    {(attempt.felSerie || attempt.felNumero) && (
                      <div><strong>Serie / Número:</strong> {attempt.felSerie || "—"} / {attempt.felNumero || "—"}</div>
                    )}
                    {attempt.felTransactionId && (
                      <div><strong>ID transacción:</strong> {attempt.felTransactionId}</div>
                    )}
                    {attempt.felError && (
                      <div className="text-danger"><strong>Error:</strong> {attempt.felError}</div>
                    )}
                  </Col>
                </Row>

                <Collapse isOpen={openAttemptId === attempt.id}>
                  <Table responsive size="sm" className="mt-3 mb-0">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Descripción</th>
                        <th>Cant.</th>
                        <th>P. unit.</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(attempt.lines || []).map((line) => (
                        <tr key={`${attempt.id}-${line.lineNumber}`}>
                          <td>{line.lineNumber}</td>
                          <td>{line.description}</td>
                          <td>{formatQuantity(line.quantity)}</td>
                          <td>{formatCurrency(line.unitPrice)}</td>
                          <td>{formatCurrency(line.lineTotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Collapse>
              </div>
            ))
          )}
        </CardBody>
      </Card>

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
