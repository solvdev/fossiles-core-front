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
import { getLocations } from "services/locationService";
import {
  backfillKioskSaleTaxInvoicesWithFallback,
  countMissingKioskSaleTaxInvoicesWithFallback,
} from "utils/kioskTaxInvoiceBackfillHelper";
import {
  getTaxInvoiceSummary,
  listTaxInvoices,
  retryTaxInvoice,
} from "services/taxInvoiceService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { canEditTaxInvoiceFel } from "utils/taxInvoiceEditHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { KIOSK_POS_ADMIN_TOOLS } from "config/kioskPosAdminTools";
import KioskSaleRestoreModal from "components/accounting/KioskSaleRestoreModal";
import TaxInvoiceVoidModal from "components/accounting/TaxInvoiceVoidModal";

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
  const { hasRole, hasAnyRole, hasPermission } = useAuth();
  const canCertify = hasPermission("CONTABILIDAD.FACTURAS.CERTIFICAR");
  const canBackfillKioskSales = canEditTaxInvoiceFel({ hasRole, hasAnyRole, hasPermission });
  const canVoidFel = canBackfillKioskSales;
  const showTaxInvoiceBackfill = KIOSK_POS_ADMIN_TOOLS.taxInvoiceBackfill && canBackfillKioskSales;
  const showSaleRestore =
    KIOSK_POS_ADMIN_TOOLS.saleRestore
    && (hasAnyRole?.(["ADMIN", "ADMINISTRADOR"]) || hasRole?.("ADMIN"));
  const showPosAdminTools = showTaxInvoiceBackfill || showSaleRestore;

  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState("");
  const [certifyingId, setCertifyingId] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillPreview, setBackfillPreview] = useState(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [voidTargetInvoice, setVoidTargetInvoice] = useState(null);
  const [backfillKioskId, setBackfillKioskId] = useState("");
  const [kiosks, setKiosks] = useState([]);
  const [filters, setFilters] = useState({
    sourceType: "",
    status: "",
    internalNumber: "",
    customerTaxId: "",
    fromDate: "",
    toDate: "",
    certificationFilter: "",
  });
  const [knownInternalNumbers, setKnownInternalNumbers] = useState([]);

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

  useEffect(() => {
    const numbers = (invoices || [])
      .map((invoice) => invoice.internalNumber)
      .filter(Boolean);
    if (numbers.length === 0) return;
    setKnownInternalNumbers((prev) => {
      const merged = new Set([...prev, ...numbers]);
      return [...merged].sort((a, b) =>
        b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" })
      );
    });
  }, [invoices]);

  useEffect(() => {
    if (!showPosAdminTools) return;
    getLocations()
      .then((rows) => {
        setKiosks(
          (rows || []).filter((loc) => String(loc.categoria || "").toUpperCase() === "KIOSKO")
        );
      })
      .catch(() => setKiosks([]));
  }, [showPosAdminTools]);

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

  const handleFilterKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleApplyFilters();
    }
  };

  const handleBackfillKioskSales = async (dryRun) => {
    if (!showTaxInvoiceBackfill) return;

    const rangeLabel =
      filters.fromDate || filters.toDate
        ? ` (${filters.fromDate || "inicio"} → ${filters.toDate || "hoy"})`
        : " (todas las fechas)";
    const kioskLabel = backfillKioskId
      ? ` · kiosko ${kiosks.find((k) => String(k.id) === String(backfillKioskId))?.name || backfillKioskId}`
      : "";

    const confirmed = window.confirm(
      dryRun
        ? `¿Contar ventas POS sin tax_invoice${rangeLabel}${kioskLabel}?`
        : `¿Crear borradores tax_invoice para ventas POS sin factura${rangeLabel}${kioskLabel}?\n\nNo certifica FEL: después podrás cargar UUID/serie/número manualmente.`
    );
    if (!confirmed) return;

    try {
      setBackfilling(true);
      setError("");
      const params = {
        kioskLocationId: backfillKioskId ? Number(backfillKioskId) : undefined,
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
      };
      const result = dryRun
        ? await countMissingKioskSaleTaxInvoicesWithFallback(params)
        : await backfillKioskSaleTaxInvoicesWithFallback(params);
      setBackfillPreview({ ...result, dryRun });
      if (dryRun) {
        const via = result?.clientSideFallback ? " (vía ventas POS)" : "";
        showSuccess(`Hay ${result?.candidates || 0} venta(s) POS sin tax_invoice${via}.`);
      } else {
        showSuccess(
          `Backfill listo: ${result?.created || 0} creado(s), ${result?.failed || 0} fallido(s).`
        );
        await Promise.all([loadInvoices(filters), loadSummary()]);
      }
    } catch (err) {
      const msg =
        err.message?.includes("POST") && err.message?.includes("not supported")
          ? "El servidor aún no tiene el endpoint de backfill. Despliega la última versión del backend (fossiles-core-back)."
          : err.message || "No se pudo ejecutar el backfill de facturas POS.";
      setError(msg);
      showError(msg);
    } finally {
      setBackfilling(false);
    }
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

  const internalNumberSuggestions = useMemo(() => {
    const term = String(filters.internalNumber || "").trim().toUpperCase();
    if (!term) {
      return knownInternalNumbers.slice(0, 80);
    }
    return knownInternalNumbers
      .filter((value) => String(value).toUpperCase().includes(term))
      .slice(0, 80);
  }, [knownInternalNumbers, filters.internalNumber]);

  const canCertifyInvoice = (invoice) =>
    canCertify
    && invoice
    && UNSIGNED_STATUSES.has(invoice.status)
    && invoice.status !== "VOID";

  const canVoidInvoice = (invoice) =>
    canVoidFel
    && invoice
    && invoice.status === "CERTIFIED"
    && invoice.felUuid;

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

      {showPosAdminTools && (
        <Card className="mb-4 border-warning">
          <CardHeader className="bg-light">
            <CardTitle tag="h5" className="mb-0">
              Herramientas POS <span className="text-muted small">(temporal)</span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-muted small mb-3">
              Usa las fechas del filtro de abajo para acotar el backfill. Desactiva en{" "}
              <code>.env</code> cuando termines (
              <code>REACT_APP_ENABLE_POS_TAX_INVOICE_BACKFILL</code>,{" "}
              <code>REACT_APP_ENABLE_POS_SALE_RESTORE</code>).
            </p>
            <Row className="align-items-end">
              {showTaxInvoiceBackfill && (
                <Col md="4" className="mb-3 mb-md-0">
                  <FormGroup className="mb-2">
                    <Label className="small mb-1">Kiosko (backfill)</Label>
                    <Input
                      type="select"
                      bsSize="sm"
                      value={backfillKioskId}
                      onChange={(e) => setBackfillKioskId(e.target.value)}
                    >
                      <option value="">Todos los kioskos</option>
                      {kiosks.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k.name || k.code || k.id}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                  <div className="d-flex flex-wrap" style={{ gap: "0.5rem" }}>
                    <Button
                      color="info"
                      outline
                      size="sm"
                      disabled={backfilling}
                      onClick={() => handleBackfillKioskSales(true)}
                    >
                      {backfilling ? <Spinner size="sm" /> : "1. Contar POS sin factura"}
                    </Button>
                    <Button
                      color="warning"
                      size="sm"
                      disabled={backfilling}
                      onClick={() => handleBackfillKioskSales(false)}
                    >
                      {backfilling ? <Spinner size="sm" /> : "2. Generar borradores faltantes"}
                    </Button>
                  </div>
                  <div className="small text-muted mt-2">
                    Crea <code>tax_invoice</code> en borrador sin certificar FEL.
                  </div>
                </Col>
              )}
              {showSaleRestore && (
                <Col md={showTaxInvoiceBackfill ? "4" : "12"} className="mb-3 mb-md-0">
                  <div className="font-weight-bold small mb-2">Venta eliminada por error</div>
                  <Button color="danger" outline size="sm" onClick={() => setRestoreOpen(true)}>
                    3. Restaurar venta POS
                  </Button>
                  <div className="small text-muted mt-2">
                    Mismo <code>saleNumber</code>, sin mover inventario.
                  </div>
                </Col>
              )}
            </Row>
          </CardBody>
        </Card>
      )}

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
                <Label>Núm. interno</Label>
                <Input
                  list="fel-internal-number-options"
                  value={filters.internalNumber}
                  onChange={(e) => handleFilterChange("internalNumber", e.target.value)}
                  onKeyDown={handleFilterKeyDown}
                  placeholder="A45-28"
                />
                <datalist id="fel-internal-number-options">
                  {internalNumberSuggestions.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </FormGroup>
            </Col>
            <Col md="2">
              <FormGroup>
                <Label>NIT</Label>
                <Input
                  value={filters.customerTaxId}
                  onChange={(e) => handleFilterChange("customerTaxId", e.target.value)}
                  onKeyDown={handleFilterKeyDown}
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

          {backfillPreview && (
            <Alert color={backfillPreview.failed > 0 ? "warning" : "info"} className="mb-3">
              <div>
                <strong>Backfill POS:</strong>{" "}
                {backfillPreview.dryRun ? "simulación" : "ejecutado"} —{" "}
                candidatas: {backfillPreview.candidates || 0}
                {backfillPreview.clientSideFallback && (
                  <span className="text-warning"> · modo compatibilidad (sin endpoint nuevo)</span>
                )}
                {!backfillPreview.dryRun && (
                  <>
                    {" "}
                    · creadas: {backfillPreview.created || 0}
                    · fallidas: {backfillPreview.failed || 0}
                  </>
                )}
              </div>
              {(backfillPreview.samples || []).length > 0 && (
                <div className="small mt-2">
                  Ejemplos:{" "}
                  {(backfillPreview.samples || [])
                    .slice(0, 5)
                    .map((row) => `${row.saleNumber || row.saleId}${row.internalNumber ? ` → ${row.internalNumber}` : ""}`)
                    .join(" · ")}
                </div>
              )}
              {(backfillPreview.errors || []).length > 0 && (
                <ul className="small mb-0 mt-2 pl-3">
                  {(backfillPreview.errors || []).slice(0, 5).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

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
                        {canVoidInvoice(invoice) && (
                          <Button
                            color="danger"
                            size="sm"
                            outline
                            className="btn-round mr-1"
                            onClick={() => setVoidTargetInvoice(invoice)}
                          >
                            Anular
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

      <KioskSaleRestoreModal
        isOpen={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onSuccess={() => {
          loadInvoices(filters);
          loadSummary();
        }}
      />

      <TaxInvoiceVoidModal
        isOpen={Boolean(voidTargetInvoice)}
        onClose={() => setVoidTargetInvoice(null)}
        invoice={voidTargetInvoice}
        onSuccess={() => {
          loadInvoices(filters);
          loadSummary();
        }}
      />
    </div>
  );
}

export default AccountingInvoices;
