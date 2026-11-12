import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Collapse,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Spinner,
  UncontrolledDropdown,
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
  openFelInvoiceReport,
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
import {
  FelStatusPill,
  FelTypeChip,
  IconMore,
  IconPlus,
} from "components/accounting/felUi";
import "./fel-ui.css";

const PAGE_SIZE = 50;

/** Tarjetas de estado: excluyentes, con conteo del resumen. Hacen de pestañas. */
const CERTIFICATION_TABS = [
  { id: "", label: "Todas", summaryKey: "total", dot: "#18211c", caption: "En el rango de fechas" },
  { id: "SIGNED", label: "Certificadas", summaryKey: "certified", dot: "#11603a", caption: "Firmadas ante el SAT" },
  { id: "UNSIGNED", label: "Sin firmar", summaryKey: "unsigned", dot: "#b87400", caption: "Requieren firma" },
  { id: "ERROR", label: "Con error", summaryKey: "failed", dot: "#9b241b", caption: "Revisar y reintentar" },
  { id: "VOID", label: "Anuladas", summaryKey: "voided", dot: "#6b746d", caption: "Anuladas ante el SAT" },
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

/** Filtros que viajan al servidor (se aplican al instante). */
const defaultFilters = () => ({
  search: "",
  documentType: "",
  sourceType: "",
  fromDate: getMonthStartYmdGuatemala(),
  toDate: "",
  certificationFilter: "",
  includeTests: false,
});

/** Filtros de columna que se aplican sobre lo ya cargado. */
const emptyColumnFilters = () => ({
  number: "",
  client: "",
  fel: "",
  minTotal: "",
  maxTotal: "",
});

const formatCount = (value) => Number(value || 0).toLocaleString("en-US");

const norm = (value) => String(value ?? "").toLowerCase();

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
  const [posToolsOpen, setPosToolsOpen] = useState(false);
  const [voidTargetInvoice, setVoidTargetInvoice] = useState(null);
  const [backfillKioskId, setBackfillKioskId] = useState("");
  const [kiosks, setKiosks] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [columnFilters, setColumnFilters] = useState(emptyColumnFilters);
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

  /** Cambios que van al servidor y se aplican al instante (estado, tipo, origen, fechas, pruebas). */
  const applyFilters = (patch) => {
    const nextFilters = { ...filters, ...patch };
    setFilters(nextFilters);
    loadInvoices(nextFilters);
  };

  /** Filtros de columna: solo recortan lo ya cargado. */
  const setColumnFilter = (field, value) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
    setPage(0);
  };

  const handleClearFilters = () => {
    const nextFilters = defaultFilters();
    setFilters(nextFilters);
    setColumnFilters(emptyColumnFilters());
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

  const handleOpenPdf = (invoice) => {
    try {
      setError("");
      openFelInvoiceReport(invoice.felUuid);
    } catch (err) {
      setError(err.message || "No se pudo abrir el PDF FEL.");
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

  const filteredInvoices = useMemo(() => {
    const number = norm(columnFilters.number).trim();
    const client = norm(columnFilters.client).trim();
    const fel = norm(columnFilters.fel).trim();
    const min = columnFilters.minTotal === "" ? null : Number(columnFilters.minTotal);
    const max = columnFilters.maxTotal === "" ? null : Number(columnFilters.maxTotal);
    return invoices.filter((invoice) => {
      if (number && !norm(invoice.internalNumber || `#${invoice.id}`).includes(number)) return false;
      if (client && !`${norm(invoice.customerName)} ${norm(invoice.customerTaxId)}`.includes(client)) return false;
      if (fel) {
        const haystack = [
          invoice.felSerie,
          invoice.felNumero,
          `${invoice.felSerie || ""}/${invoice.felNumero || ""}`,
          invoice.felUuid,
        ].map(norm).join(" ");
        if (!haystack.includes(fel)) return false;
      }
      const amount = Math.abs(Number(invoice.totalAmount || 0));
      if (min !== null && Number.isFinite(min) && amount < min) return false;
      if (max !== null && Number.isFinite(max) && amount > max) return false;
      return true;
    });
  }, [invoices, columnFilters]);

  const pageCount = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filteredInvoices.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const certifiedTotal = useMemo(
    () => filteredInvoices
      .filter((invoice) => invoice.status === "CERTIFIED")
      .reduce((sum, invoice) => {
        const sign = invoice.documentType === "NCRE" ? -1 : 1;
        return sum + sign * Number(invoice.totalAmount || 0);
      }, 0),
    [filteredInvoices]
  );
  const hasColumnFilters = Object.values(columnFilters).some((value) => value !== "");
  const hasActiveFilters = Boolean(
    hasColumnFilters || filters.documentType || filters.sourceType || filters.includeTests
      || filters.toDate || filters.certificationFilter
      || filters.fromDate !== getMonthStartYmdGuatemala()
  );

  return (
    <div className="content fel-ui">
      <div className="fel-header">
        <div>
          <div className="fel-crumb">Contabilidad / Facturas FEL</div>
          <h1 className="fel-title">Facturas electrónicas</h1>
          <p className="fel-subtitle">
            Facturas, facturas cambiarias y notas de crédito/débito emitidas ante el SAT.
          </p>
        </div>
        <div className="fel-actions">
          {showPosAdminTools && (
            <button
              type="button"
              className="fel-btn"
              aria-expanded={posToolsOpen}
              onClick={() => setPosToolsOpen((open) => !open)}
            >
              Herramientas POS
              <span className="fel-pill fel-pill--draft">temporal</span>
            </button>
          )}
          <button
            type="button"
            className="fel-btn fel-btn--primary"
            onClick={() => navigate("/admin/accounting/invoices/new")}
          >
            <IconPlus /> Nueva factura manual
          </button>
        </div>
      </div>

      {showPosAdminTools && (
        <Collapse isOpen={posToolsOpen}>
          <div className="fel-card">
            <div className="fel-card__head">
              <h2 className="fel-card__title">Herramientas POS (temporal)</h2>
            </div>
            <p className="fel-card__hint mb-3">
              Usa las fechas del filtro de la tabla para acotar el backfill. Desactiva en{" "}
              <code>.env</code> cuando termines (
              <code>REACT_APP_ENABLE_POS_TAX_INVOICE_BACKFILL</code>,{" "}
              <code>REACT_APP_ENABLE_POS_SALE_RESTORE</code>).
            </p>
            <div className="fel-form-grid">
              {showTaxInvoiceBackfill && (
                <div>
                  <label className="fel-label" htmlFor="fel-backfill-kiosk">Kiosko (backfill)</label>
                  <select
                    id="fel-backfill-kiosk"
                    className="fel-select"
                    value={backfillKioskId}
                    onChange={(e) => setBackfillKioskId(e.target.value)}
                  >
                    <option value="">Todos los kioskos</option>
                    {kiosks.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name || k.code || k.id}
                      </option>
                    ))}
                  </select>
                  <div className="d-flex flex-wrap mt-2" style={{ gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="fel-btn fel-btn--sm"
                      disabled={backfilling}
                      onClick={() => handleBackfillKioskSales(true)}
                    >
                      {backfilling ? <Spinner size="sm" /> : "1. Contar POS sin factura"}
                    </button>
                    <button
                      type="button"
                      className="fel-btn fel-btn--sm fel-btn--primary"
                      disabled={backfilling}
                      onClick={() => handleBackfillKioskSales(false)}
                    >
                      {backfilling ? <Spinner size="sm" /> : "2. Generar borradores faltantes"}
                    </button>
                  </div>
                  <span className="fel-help">
                    Crea <code>tax_invoice</code> en borrador sin certificar FEL.
                  </span>
                </div>
              )}
              {showSaleRestore && (
                <div>
                  <div className="fel-label">Venta eliminada por error</div>
                  <button
                    type="button"
                    className="fel-btn fel-btn--sm fel-btn--danger"
                    onClick={() => setRestoreOpen(true)}
                  >
                    3. Restaurar venta POS
                  </button>
                  <span className="fel-help">
                    Mismo <code>saleNumber</code>, sin mover inventario.
                  </span>
                </div>
              )}
            </div>
          </div>
        </Collapse>
      )}

      <div className="fel-stats" role="tablist" aria-label="Estado de certificación">
        {CERTIFICATION_TABS.map((tab) => {
          const active = filters.certificationFilter === tab.id;
          const count = summary ? summary[tab.summaryKey] : null;
          return (
            <button
              key={tab.id || "ALL"}
              type="button"
              role="tab"
              aria-selected={active}
              className={`fel-stat ${active ? "fel-stat--active" : ""}`}
              onClick={() => {
                if (!active) applyFilters({ certificationFilter: tab.id });
              }}
            >
              <span className="fel-stat__label">
                <span className="fel-stat__dot" style={{ background: tab.dot }} />
                {tab.label}
              </span>
              <span className="fel-stat__count">
                {count !== null && count !== undefined ? formatCount(count) : "—"}
              </span>
              <span className="fel-stat__caption">{tab.caption}</span>
            </button>
          );
        })}
      </div>

      <div className="fel-card fel-card--flush">
        <div className="fel-toolbar">
          <div className="fel-seg" role="group" aria-label="Rango de fechas">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={activePreset === preset.id ? "is-active" : ""}
                aria-pressed={activePreset === preset.id}
                onClick={() => applyFilters(preset.range())}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <label className="fel-check">
            <input
              type="checkbox"
              checked={filters.includeTests}
              onChange={(e) => applyFilters({ includeTests: e.target.checked })}
            />
            Incluir documentos de prueba
          </label>
          <span className="fel-toolbar__spacer fel-muted" style={{ fontSize: 13 }}>
            {loading ? "Cargando…" : (
              <>
                {formatCount(filteredInvoices.length)} documento{filteredInvoices.length === 1 ? "" : "s"}
                {" · "}Total certificado neto{" "}
                <strong className="fel-num" style={{ color: "var(--fel-ink)" }}>
                  {formatQuetzales(certifiedTotal)}
                </strong>
                <span className="d-none d-md-inline"> (las notas de crédito restan)</span>
              </>
            )}
          </span>
          {hasActiveFilters && (
            <button type="button" className="fel-btn fel-btn--sm" onClick={handleClearFilters}>
              Limpiar filtros
            </button>
          )}
        </div>

        {error && <div className="fel-notice fel-notice--err m-3" role="alert">{error}</div>}

        {backfillPreview && (
          <div className={`fel-notice ${backfillPreview.failed > 0 ? "fel-notice--warn" : ""} m-3`}>
            <div>
              <div>
                <strong>Backfill POS:</strong>{" "}
                {backfillPreview.dryRun ? "simulación" : "ejecutado"} —{" "}
                candidatas: {backfillPreview.candidates || 0}
                {backfillPreview.clientSideFallback && (
                  <span> · modo compatibilidad (sin endpoint nuevo)</span>
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
                <div className="mt-2">
                  Ejemplos:{" "}
                  {(backfillPreview.samples || [])
                    .slice(0, 5)
                    .map((row) => `${row.saleNumber || row.saleId}${row.internalNumber ? ` → ${row.internalNumber}` : ""}`)
                    .join(" · ")}
                </div>
              )}
              {(backfillPreview.errors || []).length > 0 && (
                <ul className="mb-0 mt-2 pl-3">
                  {(backfillPreview.errors || []).slice(0, 5).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <div className="fel-table-wrap">
          <table className="fel-table" style={{ minWidth: 1320 }}>
            <thead>
              <tr>
                <th>Documento</th>
                <th>Tipo</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Origen</th>
                <th className="is-right">Total</th>
                <th>Estado</th>
                <th>Serie / Número FEL</th>
                <th className="is-right"><span className="fel-visually-hidden">Acciones</span></th>
              </tr>
              <tr className="fel-filter-row">
                <th style={{ minWidth: 150 }}>
                  <input
                    type="search"
                    className="fel-input fel-input--sm"
                    aria-label="Filtrar por número de documento"
                    placeholder="Filtrar número"
                    value={columnFilters.number}
                    onChange={(e) => setColumnFilter("number", e.target.value)}
                  />
                </th>
                <th style={{ minWidth: 140 }}>
                  <select
                    className="fel-select fel-select--sm"
                    aria-label="Filtrar por tipo de documento"
                    value={filters.documentType}
                    onChange={(e) => applyFilters({ documentType: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {Object.entries(TAX_INVOICE_DOCUMENT_TYPES).map(([value, type]) => (
                      <option key={value} value={value}>{type.label}</option>
                    ))}
                  </select>
                </th>
                <th style={{ minWidth: 150 }}>
                  <div className="d-flex flex-column" style={{ gap: 6 }}>
                    <input
                      type="date"
                      className="fel-input fel-input--sm"
                      aria-label="Fecha desde"
                      value={filters.fromDate}
                      max={filters.toDate || undefined}
                      onChange={(e) => applyFilters({ fromDate: e.target.value })}
                    />
                    <input
                      type="date"
                      className="fel-input fel-input--sm"
                      aria-label="Fecha hasta"
                      value={filters.toDate}
                      min={filters.fromDate || undefined}
                      max={getTodayYmdGuatemala()}
                      onChange={(e) => applyFilters({ toDate: e.target.value })}
                    />
                  </div>
                </th>
                <th style={{ minWidth: 200 }}>
                  <input
                    type="search"
                    className="fel-input fel-input--sm"
                    aria-label="Filtrar por cliente o NIT"
                    placeholder="Nombre o NIT"
                    value={columnFilters.client}
                    onChange={(e) => setColumnFilter("client", e.target.value)}
                  />
                </th>
                <th style={{ minWidth: 140 }}>
                  <select
                    className="fel-select fel-select--sm"
                    aria-label="Filtrar por origen"
                    value={filters.sourceType}
                    onChange={(e) => applyFilters({ sourceType: e.target.value })}
                  >
                    <option value="">Todos</option>
                    {Object.entries(TAX_INVOICE_SOURCE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </th>
                <th style={{ minWidth: 170 }}>
                  <div className="fel-range">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="fel-input fel-input--sm"
                      aria-label="Total mínimo"
                      placeholder="Mín."
                      value={columnFilters.minTotal}
                      onChange={(e) => setColumnFilter("minTotal", e.target.value)}
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="fel-input fel-input--sm"
                      aria-label="Total máximo"
                      placeholder="Máx."
                      value={columnFilters.maxTotal}
                      onChange={(e) => setColumnFilter("maxTotal", e.target.value)}
                    />
                  </div>
                </th>
                <th style={{ minWidth: 150 }}>
                  <select
                    className="fel-select fel-select--sm"
                    aria-label="Filtrar por estado"
                    value={filters.certificationFilter}
                    onChange={(e) => applyFilters({ certificationFilter: e.target.value })}
                  >
                    {CERTIFICATION_TABS.map((tab) => (
                      <option key={tab.id || "ALL"} value={tab.id}>
                        {tab.id === "" ? "Todos" : tab.label}
                      </option>
                    ))}
                  </select>
                </th>
                <th style={{ minWidth: 190 }}>
                  <input
                    type="search"
                    className="fel-input fel-input--sm"
                    aria-label="Filtrar por serie, número o UUID"
                    placeholder="Serie, número o UUID"
                    value={columnFilters.fel}
                    onChange={(e) => setColumnFilter("fel", e.target.value)}
                  />
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>
                    <div className="fel-empty"><Spinner color="primary" /></div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="fel-empty">
                      <p className="mb-2">No hay documentos con estos filtros.</p>
                      {hasActiveFilters && (
                        <button type="button" className="fel-link-btn" onClick={handleClearFilters}>
                          Limpiar filtros
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((invoice) => {
                  const status = taxInvoiceStatus(invoice.status);
                  const typeLabel = TAX_INVOICE_DOCUMENT_TYPES[invoice.documentType]?.label || invoice.documentType;
                  const isCredit = invoice.documentType === "NCRE";
                  const isDebit = invoice.documentType === "NDEB";
                  const canCertify = canCertifyInvoice(invoice);
                  const canVoid = canVoidInvoice(invoice);
                  const canPdf = invoice.status === "CERTIFIED" && invoice.felUuid;
                  return (
                    <tr key={invoice.id}>
                      <td className="is-nowrap">
                        <div style={{ fontWeight: 600 }}>{invoice.internalNumber || `#${invoice.id}`}</div>
                        {invoice.testDocument && <span className="fel-pill fel-pill--test">Prueba</span>}
                        {invoice.originInternalNumber && (
                          <div className="fel-muted" style={{ fontSize: 12 }}>
                            Sobre {invoice.originInternalNumber}
                          </div>
                        )}
                      </td>
                      <td className="is-nowrap">
                        {invoice.documentType && invoice.documentType !== "FACT" ? (
                          <FelTypeChip documentType={invoice.documentType} label={typeLabel} />
                        ) : (
                          <span className="fel-muted">{typeLabel || "Factura"}</span>
                        )}
                      </td>
                      <td className="is-nowrap">
                        {invoice.issuedAt ? formatDateTimeGt(invoice.issuedAt) : "—"}
                      </td>
                      <td style={{ minWidth: 190 }}>
                        <div>{invoice.customerName || "—"}</div>
                        <div className="fel-muted" style={{ fontSize: 12 }}>NIT {invoice.customerTaxId || "—"}</div>
                      </td>
                      <td>{TAX_INVOICE_SOURCE_LABELS[invoice.sourceType] || invoice.sourceType}</td>
                      <td className="is-right is-nowrap fel-num" style={{ fontWeight: 600 }}>
                        {isCredit ? "−" : isDebit ? "+" : ""}
                        {formatQuetzales(invoice.totalAmount)}
                      </td>
                      <td style={{ maxWidth: 260 }}>
                        <FelStatusPill status={invoice.status} label={status.label} />
                        {status.detail && (
                          <div className="fel-muted" style={{ fontSize: 12, marginTop: 4 }}>{status.detail}</div>
                        )}
                        {invoice.felError && (
                          <div
                            style={{ fontSize: 12, marginTop: 4, color: "var(--fel-danger)" }}
                            title={invoice.felError}
                          >
                            {invoice.felError.length > 80
                              ? `${invoice.felError.slice(0, 80)}…`
                              : invoice.felError}
                          </div>
                        )}
                      </td>
                      <td className="is-nowrap">
                        <div className="fel-mono" style={{ fontSize: 13 }}>
                          {invoice.felSerie || invoice.felNumero
                            ? `${invoice.felSerie || "—"} / ${invoice.felNumero || "—"}`
                            : "—"}
                        </div>
                        {invoice.felUuid && (
                          <div
                            className="fel-mono fel-muted"
                            style={{ fontSize: 11 }}
                            title={invoice.felUuid}
                          >
                            {String(invoice.felUuid).slice(0, 8)}…
                          </div>
                        )}
                      </td>
                      <td className="is-right is-nowrap">
                        <div className="d-inline-flex align-items-center" style={{ gap: 6 }}>
                          {canCertify ? (
                            <button
                              type="button"
                              className="fel-btn fel-btn--sm fel-btn--primary"
                              disabled={certifyingId === invoice.id}
                              onClick={() => handleCertify(invoice)}
                            >
                              {certifyingId === invoice.id
                                ? <Spinner size="sm" />
                                : invoice.status === "FAILED" ? "Reintentar" : "Firmar FEL"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="fel-btn fel-btn--sm"
                              onClick={() => navigate(`/admin/accounting/invoices/${invoice.id}`)}
                            >
                              Ver
                            </button>
                          )}
                          <UncontrolledDropdown>
                            <DropdownToggle
                              tag="button"
                              type="button"
                              caret={false}
                              className="fel-icon-btn"
                              aria-label={`Más acciones de ${invoice.internalNumber || invoice.id}`}
                            >
                              <IconMore />
                            </DropdownToggle>
                            <DropdownMenu right positionFixed className="fel-dropdown-menu">
                              {canCertify && (
                                <DropdownItem onClick={() => navigate(`/admin/accounting/invoices/${invoice.id}`)}>
                                  Ver detalle
                                </DropdownItem>
                              )}
                              {canPdf && (
                                <DropdownItem onClick={() => handleOpenPdf(invoice)}>
                                  Ver PDF
                                </DropdownItem>
                              )}
                              {canVoid && (
                                <DropdownItem className="is-danger" onClick={() => setVoidTargetInvoice(invoice)}>
                                  Anular
                                </DropdownItem>
                              )}
                              {!canCertify && !canPdf && !canVoid && (
                                <DropdownItem disabled>Sin más acciones</DropdownItem>
                              )}
                            </DropdownMenu>
                          </UncontrolledDropdown>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!loading && filteredInvoices.length > 0 && (
          <div className="fel-pagination">
            <span>
              {currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filteredInvoices.length)} de{" "}
              {formatCount(filteredInvoices.length)}
            </span>
            {pageCount > 1 && (
              <div className="fel-pagination__pager">
                <button
                  type="button"
                  className="fel-btn fel-btn--sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Anterior
                </button>
                <span>Página {currentPage + 1} de {pageCount}</span>
                <button
                  type="button"
                  className="fel-btn fel-btn--sm"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Siguiente
                </button>
              </div>
            )}
          </div>
        )}
      </div>

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
