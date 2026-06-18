import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { useAuth } from "contexts/AuthContext";
import {
  getTaxInvoiceSummary,
  listTaxInvoices,
  retryTaxInvoice,
} from "services/taxInvoiceService";
import { formatDateTimeGt } from "utils/dateTimeHelper";

const SOURCE_LABELS = {
  MANUAL: "Manual",
  KIOSK_SALE: "POS Kiosko",
  ONLINE_SALE: "Venta online",
};

const STATUS_LABELS = {
  CERTIFIED: "Certificada",
  FAILED: "Error FEL",
  DRAFT: "Borrador",
  SKIPPED: "Omitida",
  VOID: "Anulada",
};

const STATUS_COLORS = {
  CERTIFIED: "success",
  FAILED: "danger",
  DRAFT: "secondary",
  SKIPPED: "warning",
  VOID: "dark",
};

const CERTIFICATION_TABS = [
  { id: "", label: "Todas" },
  { id: "SIGNED", label: "Firmadas" },
  { id: "UNSIGNED", label: "Sin firmar" },
  { id: "ERROR", label: "Con error" },
  { id: "VOID", label: "Anuladas" },
];

const UNSIGNED_STATUSES = new Set(["FAILED", "SKIPPED", "DRAFT"]);

function formatCurrency(value) {
  const num = Number(value || 0);
  return `Q ${num.toFixed(2)}`;
}

function AccountingInvoices() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCertify = hasPermission("CONTABILIDAD.FACTURAS.CERTIFICAR");

  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState("");
  const [certifyingId, setCertifyingId] = useState(null);
  const [filters, setFilters] = useState({
    sourceType: "",
    status: "",
    customerTaxId: "",
    fromDate: "",
    toDate: "",
    certificationFilter: "",
  });

  const loadSummary = async () => {
    try {
      setSummaryLoading(true);
      const data = await getTaxInvoiceSummary();
      setSummary(data);
    } catch (err) {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  };

  const loadInvoices = async (nextFilters = filters) => {
    try {
      setLoading(true);
      setError("");
      const data = await listTaxInvoices(nextFilters);
      setInvoices(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las facturas.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
    loadInvoices();
  }, []);

  const handleFilterChange = (field, value) => {
    setFilters((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "status" && value) {
        next.certificationFilter = "";
      }
      return next;
    });
  };

  const handleCertificationTab = (certificationFilter) => {
    const nextFilters = {
      ...filters,
      certificationFilter,
      status: "",
    };
    setFilters(nextFilters);
    loadInvoices(nextFilters);
  };

  const handleApplyFilters = () => {
    loadInvoices(filters);
  };

  const handleCertify = async (invoice) => {
    if (!invoice?.id || !canCertify) return;
    const confirmed = window.confirm(
      `¿Certificar la factura ${invoice.internalNumber || invoice.id} ante el FEL?`
    );
    if (!confirmed) return;

    try {
      setCertifyingId(invoice.id);
      setError("");
      await retryTaxInvoice(invoice.id);
      await Promise.all([loadInvoices(), loadSummary()]);
    } catch (err) {
      setError(err.message || "No se pudo certificar la factura.");
    } finally {
      setCertifyingId(null);
    }
  };

  const filteredCountLabel = useMemo(() => {
    const tab = CERTIFICATION_TABS.find((item) => item.id === filters.certificationFilter);
    if (tab && tab.id) {
      return tab.label.toLowerCase();
    }
    if (filters.status) {
      return (STATUS_LABELS[filters.status] || filters.status).toLowerCase();
    }
    return "en el listado";
  }, [filters.certificationFilter, filters.status]);

  const canCertifyInvoice = (invoice) =>
    canCertify
    && invoice
    && UNSIGNED_STATUSES.has(invoice.status)
    && invoice.status !== "VOID";

  return (
    <div className="content">
      <Card className="mb-4">
        <CardHeader>
          <CardTitle tag="h4" className="mb-0">Resumen FEL</CardTitle>
        </CardHeader>
        <CardBody>
          {summaryLoading ? (
            <div className="text-center py-3"><Spinner size="sm" color="primary" /></div>
          ) : summary ? (
            <Row>
              <Col md="2" sm="4" xs="6" className="mb-3">
                <div className="text-muted small">Total</div>
                <div className="h4 mb-0">{summary.total || 0}</div>
              </Col>
              <Col md="2" sm="4" xs="6" className="mb-3">
                <div className="text-success small">Firmadas</div>
                <div className="h4 mb-0 text-success">{summary.certified || 0}</div>
              </Col>
              <Col md="2" sm="4" xs="6" className="mb-3">
                <div className="text-warning small">Sin firmar</div>
                <div className="h4 mb-0 text-warning">{summary.unsigned || 0}</div>
              </Col>
              <Col md="2" sm="4" xs="6" className="mb-3">
                <div className="text-danger small">Con error</div>
                <div className="h4 mb-0 text-danger">{summary.failed || 0}</div>
              </Col>
              <Col md="2" sm="4" xs="6" className="mb-3">
                <div className="text-muted small">Borrador / omitida</div>
                <div className="h4 mb-0">{(summary.draft || 0) + (summary.skipped || 0)}</div>
              </Col>
              <Col md="2" sm="4" xs="6" className="mb-3">
                <div className="text-dark small">Anuladas</div>
                <div className="h4 mb-0">{summary.voided || 0}</div>
              </Col>
            </Row>
          ) : (
            <Alert color="warning" className="mb-0">
              No se pudo cargar el resumen. Verifica que el backend esté actualizado.
            </Alert>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <Row className="align-items-center">
            <Col md="6">
              <CardTitle tag="h4">Facturas electrónicas (FEL)</CardTitle>
            </Col>
            <Col md="6" className="text-right">
              <Button color="primary" className="btn-round" onClick={() => navigate("/admin/accounting/invoices/new")}>
                <i className="nc-icon nc-simple-add" /> Nueva factura manual
              </Button>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          <div className="mb-3">
            <Label className="mb-2">Vista rápida</Label>
            <ButtonGroup>
              {CERTIFICATION_TABS.map((tab) => (
                <Button
                  key={tab.id || "ALL"}
                  color={filters.certificationFilter === tab.id ? "primary" : "secondary"}
                  outline={filters.certificationFilter !== tab.id}
                  size="sm"
                  onClick={() => handleCertificationTab(tab.id)}
                >
                  {tab.label}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          <Row form className="mb-3">
            <Col md="2">
              <FormGroup>
                <Label>Origen</Label>
                <Input
                  type="select"
                  value={filters.sourceType}
                  onChange={(e) => handleFilterChange("sourceType", e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="MANUAL">Manual</option>
                  <option value="KIOSK_SALE">POS Kiosko</option>
                  <option value="ONLINE_SALE">Venta online</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="2">
              <FormGroup>
                <Label>Estado</Label>
                <Input
                  type="select"
                  value={filters.status}
                  onChange={(e) => handleFilterChange("status", e.target.value)}
                >
                  <option value="">Todos</option>
                  <option value="CERTIFIED">Certificada</option>
                  <option value="FAILED">Error FEL</option>
                  <option value="DRAFT">Borrador</option>
                  <option value="SKIPPED">Omitida</option>
                  <option value="VOID">Anulada</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="2">
              <FormGroup>
                <Label>NIT</Label>
                <Input
                  value={filters.customerTaxId}
                  onChange={(e) => handleFilterChange("customerTaxId", e.target.value)}
                  placeholder="Buscar NIT"
                />
              </FormGroup>
            </Col>
            <Col md="2">
              <FormGroup>
                <Label>Desde</Label>
                <Input
                  type="date"
                  value={filters.fromDate}
                  onChange={(e) => handleFilterChange("fromDate", e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="2">
              <FormGroup>
                <Label>Hasta</Label>
                <Input
                  type="date"
                  value={filters.toDate}
                  onChange={(e) => handleFilterChange("toDate", e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="2" className="d-flex align-items-end">
              <Button color="info" onClick={handleApplyFilters} disabled={loading}>
                {loading ? <Spinner size="sm" /> : "Filtrar"}
              </Button>
            </Col>
          </Row>

          {error && <Alert color="danger">{error}</Alert>}

          {!loading && (
            <p className="text-muted small">
              Mostrando {invoices.length} factura{invoices.length === 1 ? "" : "s"} {filteredCountLabel}.
            </p>
          )}

          {loading ? (
            <div className="text-center p-4"><Spinner color="primary" /></div>
          ) : invoices.length === 0 ? (
            <div className="text-center text-muted p-4">No hay facturas registradas con estos filtros.</div>
          ) : (
            <Table responsive hover>
              <thead className="text-primary">
                <tr>
                  <th>Número</th>
                  <th>Fecha</th>
                  <th>Origen</th>
                  <th>Cliente</th>
                  <th>NIT</th>
                  <th>Total</th>
                  <th>Firma FEL</th>
                  <th>Estado</th>
                  <th>Serie / Número</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const isCertified = invoice.status === "CERTIFIED";
                  const isUnsigned = UNSIGNED_STATUSES.has(invoice.status);
                  return (
                    <tr key={invoice.id}>
                      <td>{invoice.internalNumber || invoice.id}</td>
                      <td>{invoice.issuedAt ? formatDateTimeGt(invoice.issuedAt) : "—"}</td>
                      <td>{SOURCE_LABELS[invoice.sourceType] || invoice.sourceType}</td>
                      <td>{invoice.customerName || "—"}</td>
                      <td>{invoice.customerTaxId || "—"}</td>
                      <td>{formatCurrency(invoice.totalAmount)}</td>
                      <td>
                        <Badge color={isCertified ? "success" : isUnsigned ? "warning" : "secondary"}>
                          {isCertified ? "Firmada" : isUnsigned ? "Sin firmar" : "—"}
                        </Badge>
                        {invoice.felUuid && (
                          <div className="small text-muted mt-1" title={invoice.felUuid}>
                            UUID: {String(invoice.felUuid).slice(0, 8)}…
                          </div>
                        )}
                      </td>
                      <td>
                        <Badge color={STATUS_COLORS[invoice.status] || "secondary"}>
                          {STATUS_LABELS[invoice.status] || invoice.status || "—"}
                        </Badge>
                        {invoice.felError && (
                          <div className="small text-danger mt-1" title={invoice.felError}>
                            {invoice.felError.length > 60
                              ? `${invoice.felError.slice(0, 60)}…`
                              : invoice.felError}
                          </div>
                        )}
                      </td>
                      <td>
                        {invoice.felSerie || invoice.felNumero
                          ? `${invoice.felSerie || "—"} / ${invoice.felNumero || "—"}`
                          : "—"}
                      </td>
                      <td className="text-right text-nowrap">
                        {canCertifyInvoice(invoice) && (
                          <Button
                            color="warning"
                            size="sm"
                            className="btn-round mr-1"
                            disabled={certifyingId === invoice.id}
                            onClick={() => handleCertify(invoice)}
                          >
                            {certifyingId === invoice.id ? <Spinner size="sm" /> : "Firmar FEL"}
                          </Button>
                        )}
                        <Button
                          color="info"
                          size="sm"
                          className="btn-round"
                          onClick={() => navigate(`/admin/accounting/invoices/${invoice.id}`)}
                        >
                          Ver
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default AccountingInvoices;
