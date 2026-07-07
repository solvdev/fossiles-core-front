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
import TaxInvoiceVoidModal from "components/accounting/TaxInvoiceVoidModal";

const STATUS_COLORS = {
  CERTIFIED: "success",
  FAILED: "danger",
  DRAFT: "secondary",
  SKIPPED: "warning",
  VOID: "dark",
};

const ACTION_LABELS = {
  ISSUE: "Emisión",
  RETRY: "Reintento",
  VOID: "Anulación",
};

function formatCurrency(value) {
  return `Q ${Number(value || 0).toFixed(2)}`;
}

function AccountingInvoiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, hasAnyRole, hasPermission } = useAuth();
  const canVoidFel = canEditTaxInvoiceFel({ hasRole, hasAnyRole, hasPermission });
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [error, setError] = useState("");
  const [openAttemptId, setOpenAttemptId] = useState(null);

  const loadInvoice = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getTaxInvoiceById(id);
      setInvoice(data);
    } catch (err) {
      setError(err.message || "No se pudo cargar la factura.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvoice();
  }, [id]);

  const handleRetry = async () => {
    try {
      setRetrying(true);
      setError("");
      await retryTaxInvoice(id);
      await loadInvoice();
    } catch (err) {
      setError(err.message || "No se pudo reintentar la certificación.");
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

  const canRetry = invoice && ["FAILED", "SKIPPED", "DRAFT"].includes(invoice.status);
  const canDownloadXml = invoice?.status === "CERTIFIED" && invoice?.hasCertifiedXml;
  const canDownloadFelReport = invoice?.status === "CERTIFIED" && invoice?.felUuid;
  const canVoid = canVoidFel && invoice?.status === "CERTIFIED" && invoice?.felUuid;

  const handleDownloadFelReport = () => {
    try {
      setError("");
      openFelInvoiceReport(invoice.felUuid);
    } catch (err) {
      setError(err.message || "No se pudo abrir la factura FEL.");
    }
  };
  const attempts = invoice?.attempts || [];

  if (loading) {
    return <div className="content text-center p-5"><Spinner color="primary" /></div>;
  }

  if (!invoice) {
    return (
      <div className="content">
        <Alert color="danger">{error || "Factura no encontrada."}</Alert>
        <Button color="default" onClick={() => navigate("/admin/accounting/invoices")}>Volver</Button>
      </div>
    );
  }

  return (
    <div className="content">
      <Card className="mb-4">
        <CardHeader>
          <Row className="align-items-center">
            <Col>
              <CardTitle tag="h4">Factura {invoice.internalNumber || invoice.id}</CardTitle>
            </Col>
            <Col className="text-right">
              <Badge color={STATUS_COLORS[invoice.status] || "secondary"} className="mr-2">
                {invoice.status}
              </Badge>
              {canRetry && (
                <Button color="warning" size="sm" className="mr-2" onClick={handleRetry} disabled={retrying}>
                  {retrying ? <Spinner size="sm" /> : "Reintentar FEL"}
                </Button>
              )}
              {canDownloadFelReport && (
                <Button color="primary" size="sm" outline className="mr-2" onClick={handleDownloadFelReport}>
                  Descargar factura
                </Button>
              )}
              {canVoid && (
                <Button color="danger" size="sm" outline className="mr-2" onClick={() => setVoidOpen(true)}>
                  Anular FEL
                </Button>
              )}
              {canDownloadXml && (
                <Button color="success" size="sm" className="mr-2" onClick={handleDownloadXml} disabled={downloadingXml}>
                  {downloadingXml ? <Spinner size="sm" /> : "Descargar XML certificado"}
                </Button>
              )}
              <Button color="default" size="sm" onClick={() => navigate("/admin/accounting/invoices")}>
                Volver al listado
              </Button>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}

          <Row className="mb-3">
            <Col md="6">
              <p><strong>Origen:</strong> {invoice.sourceType}{invoice.sourceId ? ` #${invoice.sourceId}` : ""}</p>
              <p><strong>Cliente:</strong> {invoice.customerName || "—"}</p>
              <p><strong>NIT:</strong> {invoice.customerTaxId || "—"}</p>
              <p><strong>Fecha emisión:</strong> {invoice.issuedAt ? formatDateTimeGt(invoice.issuedAt) : "—"}</p>
            </Col>
            <Col md="6">
              <p><strong>Subtotal:</strong> {formatCurrency(invoice.subtotal)}</p>
              <p><strong>IVA:</strong> {formatCurrency(invoice.taxAmount)}</p>
              <p><strong>Total:</strong> {formatCurrency(invoice.totalAmount)}</p>
              {invoice.felUuid && <p><strong>UUID FEL:</strong> {invoice.felUuid}</p>}
              {(invoice.felSerie || invoice.felNumero) && (
                <p><strong>Serie / Número:</strong> {invoice.felSerie || "—"} / {invoice.felNumero || "—"}</p>
              )}
              {invoice.felError && <p className="text-danger"><strong>Error FEL:</strong> {invoice.felError}</p>}
              {invoice.status === "VOID" && (
                <>
                  {invoice.voidedAt && (
                    <p><strong>Anulada el:</strong> {formatDateTimeGt(invoice.voidedAt)}</p>
                  )}
                  {invoice.voidReason && (
                    <p><strong>Motivo:</strong> {invoice.voidReason}</p>
                  )}
                  {invoice.felVoidUuid && (
                    <p><strong>UUID anulación:</strong> {invoice.felVoidUuid}</p>
                  )}
                </>
              )}
              {invoice.status === "CERTIFIED" && !invoice.hasCertifiedXml && (
                <p className="text-muted small mb-0">
                  XML certificado no disponible (factura anterior a este respaldo o certificación sin xml_certificado).
                </p>
              )}
            </Col>
          </Row>

          <h5 className="mb-2">Líneas actuales</h5>
          <Table responsive hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Descripción</th>
                <th>Cant.</th>
                <th>P. unit.</th>
                <th>Total</th>
                <th>IVA</th>
              </tr>
            </thead>
            <tbody>
              {(invoice.lines || []).map((line) => (
                <tr key={line.id || line.lineNumber}>
                  <td>{line.lineNumber}</td>
                  <td>{line.description}</td>
                  <td>{line.quantity}</td>
                  <td>{formatCurrency(line.unitPrice)}</td>
                  <td>{formatCurrency(line.lineTotal)}</td>
                  <td>{formatCurrency(line.taxAmount)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

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
                    <Badge color={STATUS_COLORS[attempt.status] || "secondary"}>{attempt.status}</Badge>
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
                          <td>{line.quantity}</td>
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
    </div>
  );
}

export default AccountingInvoiceDetail;
