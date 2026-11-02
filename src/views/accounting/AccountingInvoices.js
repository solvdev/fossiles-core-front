import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  FormGroup,
  Input,
  Label,
  Nav,
  NavItem,
  NavLink,
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
import {
  formatDateTimeGt,
  getMonthStartYmdGuatemala,
  getTodayYmdGuatemala,
  shiftYmdGuatemala,
} from "utils/dateTimeHelper";
import { canEditTaxInvoiceFel } from "utils/taxInvoiceEditHelper";
import {
  TAX_INVOICE_DOCUMENT_TYPES,
  TAX_INVOICE_SOURCE_LABELS,
  formatQuetzales,
  taxInvoiceStatus,
} from "utils/taxInvoiceLabels";
import { showError, showSuccess } from "utils/notificationHelper";
import { KIOSK_POS_ADMIN_TOOLS } from "config/kioskPosAdminTools";
import KioskSaleRestoreModal from "components/accounting/KioskSaleRestoreModal";
import TaxInvoiceVoidModal from "components/accounting/TaxInvoiceVoidModal";

const PAGE_SIZE = 50;

/** Pestañas de estado: excluyentes, con conteo del resumen. */
const CERTIFICATION_TABS = [
  { id: "", label: "Todas", summaryKey: "total" },
  { id: "SIGNED", label: "Certificadas", summaryKey: "certified", color: "success" },
  { id: "UNSIGNED", label: "Sin firmar", summaryKey: "unsigned", color: "warning" },
  { id: "ERROR", label: "Con error", summaryKey: "failed", color: "danger" },
  { id: "VOID", label: "Anuladas", summaryKey: "voided", color: "dark" },
];

/** Estados desde los que se puede firmar (certificar) FEL. */
const CERTIFIABLE_STATUSES = new Set(["FAILED", "SKIPPED", "DRAFT"]);

const previousMonthRange = () => {
  const firstOfMonth = getMonthStartYmdGuatemala();
  const lastOfPrevious = shiftYmdGuatemala(firstOfMonth, -1);
  return { fromDate: `${lastOfPrevious.slice(0, 7)}-01`, toDate: lastOfPrevious };
};

const DATE_PRESETS = [
  { id: "month", label: "Este mes", range: () => ({ fromDate: getMonthStartYmdGuatemala(), toDate: "" }) },
  { id: "previous", label: "Mes anterior", range: previousMonthRange },
  { id: "all", label: "Todo", range: () => ({ fromDate: "", toDate: "" }) },
];

const defaultFilters = () => ({
  search: "",
  documentType: "",
  sourceType: "",
  fromDate: getMonthStartYmdGuatemala(),
  toDate: "",
  certificationFilter: "",
  includeTests: false,
});

const formatCount = (value) => Number(value || 0).toLocaleString("en-US");

function AccountingInvoices() {
  const navigate = useNavigate();
  const { hasRole, hasAnyRole, hasPermission } = useAuth();
  const canManageFel = canEditTaxInvoiceFel({ hasRole, hasAnyRole, hasPermission });
  const canBackfillKioskSales = canManageFel;
  const showTaxInvoiceBackfill = KIOSK_POS_ADMIN_TOOLS.taxInvoiceBackfill && canBackfillKioskSales;
  const showSaleRestore =
    KIOSK_POS_ADMIN_TOOLS.saleRestore
    && (hasAnyRole?.(["ADMIN", "ADMINISTRADOR"]) || hasRole?.("ADMIN"));
  const showPosAdminTools = showTaxInvoiceBackfill || showSaleRestore;

  const [invoices, setInvoices] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [certifyingId, setCertifyingId] = useState(null);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillPreview, setBackfillPreview] = useState(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [voidTargetInvoice, setVoidTargetInvoice] = useState(null);
  const [backfillKioskId, setBackfillKioskId] = useState("");
  const [kiosks, setKiosks] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [page, setPage] = useState(0);

  const loadInvoices = async (nextFilters = filters) => {
    try {
      setLoading(true);
      setError("");
      const [rows, counts] = await Promise.all([
        listTaxInvoices(nextFilters),
        getTaxInvoiceSummary(nextFilters).catch(() => null),
      ]);
      setInvoices(Array.isArray(rows) ? rows : []);
      setSummary(counts);
      setPage(0);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las facturas.");
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const reloadListAndSummary = (nextFilters = filters) => loadInvoices(nextFilters);

  useEffect(() => {
    loadInvoices();
  }, []);

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
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  /** Cambios que aplican al instante (pestañas, selects, fechas rápidas, pruebas). */
  const applyFilters = (patch) => {
    const nextFilters = { ...filters, ...patch };
    setFilters(nextFilters);
    loadInvoices(nextFilters);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    loadInvoices(filters);
  };

  const handleClearFilters = () => {
    const nextFilters = defaultFilters();
    setFilters(nextFilters);
    loadInvoices(nextFilters);
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
        await reloadListAndSummary(filters);
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
    if (!invoice?.id || !canManageFel) return;
    const confirmed = window.confirm(
      `¿Firmar (certificar) ${invoice.internalNumber || invoice.id} ante el SAT?`
    );
    if (!confirmed) return;

    try {
      setCertifyingId(invoice.id);
      setError("");
      await retryTaxInvoice(invoice.id);
      await reloadListAndSummary();
    } catch (err) {
      setError(err.message || "No se pudo certificar la factura.");
    } finally {
      setCertifyingId(null);
    }
  };

  const canCertifyInvoice = (invoice) =>
    canManageFel
    && invoice
    && (
      CERTIFIABLE_STATUSES.has(invoice.status)
      || (invoice.status === "VOID" && !invoice.felUuid)
    );

  const canVoidInvoice = (invoice) =>
    canManageFel
    && invoice
    && invoice.status === "CERTIFIED"
    && invoice.felUuid;

  const activePreset = useMemo(() => {
    const match = DATE_PRESETS.find((preset) => {
      const range = preset.range();
      return range.fromDate === filters.fromDate && range.toDate === filters.toDate;
    });
    return match?.id || "";
  }, [filters.fromDate, filters.toDate]);

  const pageCount = Math.max(1, Math.ceil(invoices.length / PAGE_SIZE));
  const pageRows = invoices.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const certifiedTotal = useMemo(
    () => invoices
      .filter((invoice) => invoice.status === "CERTIFIED")
      .reduce((sum, invoice) => {
        const sign = invoice.documentType === "NCRE" ? -1 : 1;
        return sum + sign * Number(invoice.totalAmount || 0);
      }, 0),
    [invoices]
  );
  const hasActiveFilters = Boolean(
    filters.search || filters.documentType || filters.sourceType || filters.includeTests
      || filters.toDate || filters.fromDate !== getMonthStartYmdGuatemala()
  );

  return (
    <div className="content">
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
            <Col md="7">
              <CardTitle tag="h4" className="mb-1">Facturas electrónicas (FEL)</CardTitle>
              <p className="text-muted small mb-0">
                Facturas, facturas cambiarias y notas de crédito/débito emitidas ante el SAT.
              </p>
            </Col>
            <Col md="5" className="text-md-right mt-2 mt-md-0">
              <Button color="primary" className="btn-round" onClick={() => navigate("/admin/accounting/invoices/new")}>
                <i className="nc-icon nc-simple-add" /> Nueva factura manual
              </Button>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          <Nav tabs className="mb-3">
            {CERTIFICATION_TABS.map((tab) => {
              const active = filters.certificationFilter === tab.id;
              const count = summary ? summary[tab.summaryKey] : null;
              return (
                <NavItem key={tab.id || "ALL"}>
                  <NavLink
                    href="#"
                    className={active ? "active" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!active) applyFilters({ certificationFilter: tab.id });
                    }}
                  >
                    {tab.label}
                    {count !== null && count !== undefined && (
                      <Badge color={tab.color || "secondary"} pill className="ml-2">
                        {formatCount(count)}
                      </Badge>
                    )}
                  </NavLink>
                </NavItem>
              );
            })}
          </Nav>

          <form onSubmit={handleSearchSubmit}>
            <Row form className="align-items-end">
              <Col lg="4" md="12">
                <FormGroup>
                  <Label for="fel-search">Buscar</Label>
                  <Input
                    id="fel-search"
                    type="search"
                    value={filters.search}
                    onChange={(e) => handleFilterChange("search", e.target.value)}
                    placeholder="Número interno, NIT, cliente, serie o UUID"
                  />
                </FormGroup>
              </Col>
              <Col lg="2" md="6">
                <FormGroup>
                  <Label for="fel-document-type">Tipo</Label>
                  <Input
                    id="fel-document-type"
                    type="select"
                    value={filters.documentType}
                    onChange={(e) => applyFilters({ documentType: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {Object.entries(TAX_INVOICE_DOCUMENT_TYPES).map(([value, type]) => (
                      <option key={value} value={value}>{type.label}</option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
              <Col lg="2" md="6">
                <FormGroup>
                  <Label for="fel-source">Origen</Label>
                  <Input
                    id="fel-source"
                    type="select"
                    value={filters.sourceType}
                    onChange={(e) => applyFilters({ sourceType: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {Object.entries(TAX_INVOICE_SOURCE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
              <Col lg="2" md="6">
                <FormGroup>
                  <Label for="fel-from">Desde</Label>
                  <Input
                    id="fel-from"
                    type="date"
                    value={filters.fromDate}
                    max={filters.toDate || undefined}
                    onChange={(e) => applyFilters({ fromDate: e.target.value })}
                  />
                </FormGroup>
              </Col>
              <Col lg="2" md="6">
                <FormGroup>
                  <Label for="fel-to">Hasta</Label>
                  <Input
                    id="fel-to"
                    type="date"
                    value={filters.toDate}
                    min={filters.fromDate || undefined}
                    max={getTodayYmdGuatemala()}
                    onChange={(e) => applyFilters({ toDate: e.target.value })}
                  />
                </FormGroup>
              </Col>
            </Row>
            <div className="d-flex flex-wrap align-items-center mb-3" style={{ gap: "0.5rem 1rem" }}>
              <div className="d-flex flex-wrap" style={{ gap: "0.25rem" }}>
                {DATE_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    size="sm"
                    color="primary"
                    outline={activePreset !== preset.id}
                    className="my-0"
                    onClick={() => applyFilters(preset.range())}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
              <FormGroup check className="mb-0">
                <Label check>
                  <Input
                    type="checkbox"
                    checked={filters.includeTests}
                    onChange={(e) => applyFilters({ includeTests: e.target.checked })}
                  />
                  <span className="form-check-sign" />
                  Incluir documentos de prueba
                </Label>
              </FormGroup>
              <div className="ml-auto d-flex" style={{ gap: "0.5rem" }}>
                {hasActiveFilters && (
                  <Button type="button" color="secondary" outline size="sm" className="my-0" onClick={handleClearFilters}>
                    Limpiar
                  </Button>
                )}
                <Button type="submit" color="info" size="sm" className="my-0" disabled={loading}>
                  {loading ? <Spinner size="sm" /> : "Buscar"}
                </Button>
              </div>
            </div>
          </form>

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

          {!loading && invoices.length > 0 && (
            <p className="text-muted small mb-2">
              {formatCount(invoices.length)} documento{invoices.length === 1 ? "" : "s"}
              {" · "}Total certificado {formatQuetzales(certifiedTotal)}
              <span className="d-none d-md-inline"> (notas de crédito restan)</span>
            </p>
          )}

          {loading ? (
            <div className="text-center p-4"><Spinner color="primary" /></div>
          ) : invoices.length === 0 ? (
            <div className="text-center text-muted p-5">
              <p className="mb-2">No hay documentos con estos filtros.</p>
              {hasActiveFilters && (
                <Button color="link" size="sm" onClick={handleClearFilters}>Limpiar filtros</Button>
              )}
            </div>
          ) : (
            <>
              <Table responsive hover size="sm" className="mb-2">
                <thead className="text-primary">
                  <tr>
                    <th>Número</th>
                    <th>Fecha</th>
                    <th>Cliente</th>
                    <th>Origen</th>
                    <th className="text-right">Total</th>
                    <th>Estado</th>
                    <th>Serie / Número FEL</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((invoice) => {
                    const status = taxInvoiceStatus(invoice.status);
                    const isNote = ["NCRE", "NDEB"].includes(invoice.documentType);
                    return (
                      <tr key={invoice.id}>
                        <td className="text-nowrap">
                          <div className="font-weight-bold">{invoice.internalNumber || `#${invoice.id}`}</div>
                          {invoice.documentType && invoice.documentType !== "FACT" && (
                            <Badge color={isNote ? "info" : "default"} className="mr-1">
                              {TAX_INVOICE_DOCUMENT_TYPES[invoice.documentType]?.label || invoice.documentType}
                            </Badge>
                          )}
                          {invoice.testDocument && <Badge color="warning">Prueba</Badge>}
                        </td>
                        <td className="text-nowrap">{invoice.issuedAt ? formatDateTimeGt(invoice.issuedAt) : "—"}</td>
                        <td style={{ minWidth: 180 }}>
                          <div>{invoice.customerName || "—"}</div>
                          <div className="small text-muted">NIT {invoice.customerTaxId || "—"}</div>
                        </td>
                        <td>{TAX_INVOICE_SOURCE_LABELS[invoice.sourceType] || invoice.sourceType}</td>
                        <td className="text-right text-nowrap">
                          {invoice.documentType === "NCRE" ? "−" : ""}
                          {formatQuetzales(invoice.totalAmount)}
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <Badge color={status.color}>{status.label}</Badge>
                          {status.detail && <span className="small text-muted ml-1">{status.detail}</span>}
                          {invoice.felError && (
                            <div className="small text-danger mt-1" title={invoice.felError}>
                              {invoice.felError.length > 80
                                ? `${invoice.felError.slice(0, 80)}…`
                                : invoice.felError}
                            </div>
                          )}
                        </td>
                        <td className="text-nowrap">
                          {invoice.felSerie || invoice.felNumero
                            ? `${invoice.felSerie || "—"} / ${invoice.felNumero || "—"}`
                            : "—"}
                          {invoice.felUuid && (
                            <div className="small text-muted" title={invoice.felUuid}>
                              UUID {String(invoice.felUuid).slice(0, 8)}…
                            </div>
                          )}
                        </td>
                        <td className="text-right text-nowrap">
                          {canCertifyInvoice(invoice) && (
                            <Button
                              color="warning"
                              size="sm"
                              className="btn-round mr-1 my-0"
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
                              className="btn-round mr-1 my-0"
                              onClick={() => setVoidTargetInvoice(invoice)}
                            >
                              Anular
                            </Button>
                          )}
                          <Button
                            color="info"
                            size="sm"
                            className="btn-round my-0"
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
              {pageCount > 1 && (
                <div className="d-flex justify-content-between align-items-center">
                  <span className="small text-muted">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, invoices.length)} de{" "}
                    {formatCount(invoices.length)}
                  </span>
                  <div className="d-flex align-items-center" style={{ gap: "0.5rem" }}>
                    <Button
                      size="sm"
                      color="secondary"
                      outline
                      className="my-0"
                      disabled={page === 0}
                      onClick={() => setPage((current) => current - 1)}
                    >
                      Anterior
                    </Button>
                    <span className="small">Página {page + 1} de {pageCount}</span>
                    <Button
                      size="sm"
                      color="secondary"
                      outline
                      className="my-0"
                      disabled={page >= pageCount - 1}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <KioskSaleRestoreModal
        isOpen={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onSuccess={() => {
          reloadListAndSummary(filters);
        }}
      />

      <TaxInvoiceVoidModal
        isOpen={Boolean(voidTargetInvoice)}
        onClose={() => setVoidTargetInvoice(null)}
        invoice={voidTargetInvoice}
        onSuccess={() => {
          reloadListAndSummary(filters);
        }}
      />
    </div>
  );
}

export default AccountingInvoices;
