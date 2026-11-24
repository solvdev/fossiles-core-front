import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Col, Input, Label, Row, Spinner } from "reactstrap";
import PosExcelFilter from "views/kiosks/pos/PosExcelFilter";
import { getEstablishmentInvoiceReport, getFelEstablishments } from "services/taxInvoiceService";
import {
  getMonthStartYmdGuatemala,
  getTodayYmdGuatemala,
  getYesterdayYmdGuatemala,
  shiftYmdGuatemala,
} from "utils/dateTimeHelper";
import { showError, showWarning } from "utils/notificationHelper";
import {
  exportInvoiceEstablishmentReportToExcel,
  formatYmdSlash,
  rowYmd,
  signedAmount,
  summarizeRows,
} from "utils/invoiceEstablishmentReportExport";
import "views/kiosks/pos/PosPromotions.css";
import "./reportsDesign.css";
import "./InvoiceEstablishmentReport.css";

const PAGE_STEP = 300;

const money = (value) =>
  `Q ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const norm = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Columnas del reporte (mismas del reporte SAT). `get` da el valor que se filtra y se ordena. */
const COLUMNS = [
  { key: "establishment", label: "Establecimiento", get: (r) => r.establishmentLabel, width: 210 },
  { key: "documentType", label: "Tipo de documento", get: (r) => r.documentTypeLabel, width: 160 },
  { key: "serie", label: "Serie", get: (r) => r.felSerie, width: 110, mono: true },
  { key: "numero", label: "Número", get: (r) => r.felNumero, width: 130, mono: true },
  { key: "adenda", label: "Adenda", get: (r) => r.internalNumber, width: 110 },
  { key: "nit", label: "NIT receptor", get: (r) => r.customerTaxId, width: 130 },
  { key: "receptor", label: "Receptor", get: (r) => r.customerName, width: 290 },
  { key: "estado", label: "Estado", get: (r) => r.status, width: 110 },
  {
    key: "fecha",
    label: "Fecha emisión",
    get: (r) => rowYmd(r),
    display: (value) => formatYmdSlash(value),
    width: 130,
  },
  {
    key: "total",
    label: "Gran total",
    get: (r) => Number(r.totalAmount || 0).toFixed(2),
    sortValue: (r) => Number(r.totalAmount || 0),
    num: true,
    width: 140,
  },
];

const DATE_PRESETS = [
  { id: "month", label: "Este mes", range: () => ({ from: getMonthStartYmdGuatemala(), to: getTodayYmdGuatemala() }) },
  {
    id: "previous",
    label: "Mes anterior",
    range: () => {
      const last = shiftYmdGuatemala(getMonthStartYmdGuatemala(), -1);
      return { from: `${last.slice(0, 7)}-01`, to: last };
    },
  },
  { id: "yesterday", label: "Ayer", range: () => ({ from: getYesterdayYmdGuatemala(), to: getYesterdayYmdGuatemala() }) },
  { id: "today", label: "Hoy", range: () => ({ from: getTodayYmdGuatemala(), to: getTodayYmdGuatemala() }) },
];

const cellText = (col, row) => {
  const value = col.get(row);
  if (col.key === "total") return money(row.totalAmount);
  if (col.display) return col.display(value) || "—";
  return value === "" || value == null ? "—" : value;
};

/** Encabezado con ordenar y filtro de valores (casillas + buscador), como el filtro de Excel. */
function ColumnHeader({ col, sort, onSort, valueCounts, selected, onApply }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const panelWidth = 260;
      setPos({
        top: rect.bottom + 4,
        left: Math.max(8, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8)),
      });
      setQuery("");
    }
    setOpen((v) => !v);
  };

  const values = useMemo(() => {
    const q = norm(query).trim();
    const all = [...valueCounts.entries()].sort((a, b) =>
      col.num ? Number(a[0]) - Number(b[0]) : String(a[0]).localeCompare(String(b[0]), "es", { numeric: true })
    );
    return q ? all.filter(([value]) => norm(col.display ? col.display(value) : value).includes(q)) : all;
  }, [valueCounts, query, col]);

  const isChecked = (value) => (selected ? selected.has(value) : true);
  const allVisibleChecked = values.length > 0 && values.every(([value]) => isChecked(value));

  const toggleValue = (value) => {
    const next = new Set(selected || valueCounts.keys());
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onApply(next.size >= valueCounts.size ? null : next);
  };

  const toggleAllVisible = () => {
    const next = new Set(selected || valueCounts.keys());
    values.forEach(([value]) => (allVisibleChecked ? next.delete(value) : next.add(value)));
    onApply(next.size >= valueCounts.size ? null : next);
  };

  const filtered = Boolean(selected);
  const sorted = sort.key === col.key;

  return (
    <th style={{ width: col.width }} className={col.num ? "ief-th is-num" : "ief-th"} aria-sort={sorted ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <div className="ief-th-inner">
        <button type="button" className="ief-th-label" onClick={() => onSort(col.key)} title="Ordenar">
          <span>{col.label}</span>
          {sorted && <span className="ief-sort">{sort.dir === 1 ? "▲" : "▼"}</span>}
        </button>
        <button
          type="button"
          ref={btnRef}
          className={`ief-funnel${filtered ? " is-on" : ""}`}
          onClick={toggleOpen}
          aria-label={`Filtrar ${col.label}`}
          aria-expanded={open}
          title="Filtrar"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
            <path d="M1.5 2h13l-5 6.2V13l-3 1.5V8.2z" fill="currentColor" />
          </svg>
        </button>
      </div>
      {open && (
        <div className="ief-panel" ref={panelRef} style={{ top: pos.top, left: pos.left }} role="dialog" aria-label={`Filtro ${col.label}`}>
          <div className="ief-panel-sort">
            <button type="button" onClick={() => onSort(col.key, 1)} className={sorted && sort.dir === 1 ? "is-active" : ""}>
              ▲ Ordenar A→Z
            </button>
            <button type="button" onClick={() => onSort(col.key, -1)} className={sorted && sort.dir === -1 ? "is-active" : ""}>
              ▼ Z→A
            </button>
          </div>
          <input
            type="search"
            className="ief-panel-search"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <label className="ief-panel-row is-all">
            <input type="checkbox" checked={allVisibleChecked} onChange={toggleAllVisible} />
            <span>{query ? "Seleccionar lo que se ve" : "Seleccionar todo"}</span>
          </label>
          <div className="ief-panel-list">
            {values.length === 0 && <div className="ief-panel-empty">Sin coincidencias</div>}
            {values.slice(0, 400).map(([value, count]) => (
              <label key={value} className="ief-panel-row">
                <input type="checkbox" checked={isChecked(value)} onChange={() => toggleValue(value)} />
                <span className="ief-panel-text">{col.display ? col.display(value) : value === "" ? "(vacío)" : value}</span>
                <span className="ief-panel-count">{count}</span>
              </label>
            ))}
          </div>
          <div className="ief-panel-foot">
            <button type="button" onClick={() => onApply(null)} disabled={!filtered}>
              Quitar filtro
            </button>
            <button type="button" className="is-primary" onClick={() => setOpen(false)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </th>
  );
}

function InvoiceEstablishmentReport() {
  const initial = DATE_PRESETS[0].range();
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [establishments, setEstablishments] = useState([]);
  const [selectedCodes, setSelectedCodes] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({});
  const [sort, setSort] = useState({ key: "", dir: 1 });
  const [visibleCount, setVisibleCount] = useState(PAGE_STEP);
  const [showChips, setShowChips] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFelEstablishments()
      .then((list) => !cancelled && setEstablishments(Array.isArray(list) ? list : []))
      .catch((err) => !cancelled && showError(err.message || "No se pudieron cargar los establecimientos."));
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    if (!fromDate || !toDate) return;
    if (fromDate > toDate) {
      setError("La fecha «Desde» no puede ser mayor que «Hasta».");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const data = await getEstablishmentInvoiceReport({ fromDate, toDate, establishmentCodes: selectedCodes });
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setColFilters({});
      setVisibleCount(PAGE_STEP);
    } catch (err) {
      setRows([]);
      setError(err.message || "No se pudo generar el reporte.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, selectedCodes]);

  useEffect(() => {
    load();
  }, [load]);

  const establishmentOptions = useMemo(
    () => establishments.map((e) => ({ value: e.code, label: e.label, searchText: e.label })),
    [establishments]
  );

  /** Filas que cumplen la búsqueda y los filtros de columna, salvo (opcional) los de `exceptKey`. */
  const applyFilters = useCallback(
    (exceptKey) => {
      const q = norm(search).trim();
      return rows.filter((row) => {
        if (q) {
          const haystack = norm(COLUMNS.map((c) => cellText(c, row)).join(" "));
          if (!haystack.includes(q)) return false;
        }
        return COLUMNS.every((col) => {
          if (col.key === exceptKey) return true;
          const selected = colFilters[col.key];
          return !selected || selected.has(col.get(row));
        });
      });
    },
    [rows, search, colFilters]
  );

  const filteredRows = useMemo(() => {
    const list = applyFilters(null);
    if (!sort.key) return list;
    const col = COLUMNS.find((c) => c.key === sort.key);
    const pick = col.sortValue || col.get;
    return [...list].sort((a, b) => {
      const va = pick(a);
      const vb = pick(b);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "es", { numeric: true });
      return cmp * sort.dir;
    });
  }, [applyFilters, sort]);

  /** Valores posibles por columna (con conteo), considerando los demás filtros, como en Excel. */
  const valueCountsByColumn = useMemo(() => {
    const result = {};
    COLUMNS.forEach((col) => {
      const map = new Map();
      applyFilters(col.key).forEach((row) => {
        const value = col.get(row);
        map.set(value, (map.get(value) || 0) + 1);
      });
      result[col.key] = map;
    });
    return result;
  }, [applyFilters]);

  const summary = useMemo(() => summarizeRows(filteredRows), [filteredRows]);
  const byEstablishment = useMemo(() => {
    const map = new Map();
    filteredRows.forEach((row) => {
      const key = row.establishmentLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    });
    return [...map.entries()].map(([label, list]) => ({ label, ...summarizeRows(list) }));
  }, [filteredRows]);

  const activeFilterCount = Object.values(colFilters).filter(Boolean).length + (search.trim() ? 1 : 0);
  const clearFilters = () => {
    setColFilters({});
    setSearch("");
  };

  const handleSort = (key, forcedDir) => {
    setSort((prev) => {
      if (forcedDir) return { key, dir: forcedDir };
      if (prev.key !== key) return { key, dir: 1 };
      if (prev.dir === 1) return { key, dir: -1 };
      return { key: "", dir: 1 };
    });
  };

  const applyColumnFilter = (key, set) => {
    setColFilters((prev) => ({ ...prev, [key]: set }));
    setVisibleCount(PAGE_STEP);
  };

  const toggleEstablishmentFilter = (label) => {
    const only = colFilters.establishment && colFilters.establishment.size === 1 && colFilters.establishment.has(label);
    applyColumnFilter("establishment", only ? null : new Set([label]));
  };

  const handleExport = () => {
    if (!filteredRows.length) {
      showWarning("No hay facturas para exportar con los filtros actuales.");
      return;
    }
    exportInvoiceEstablishmentReportToExcel({ rows: filteredRows, fromDate, toDate });
  };

  const applyPreset = (preset) => {
    const range = preset.range();
    setFromDate(range.from);
    setToDate(range.to);
  };

  const shown = filteredRows.slice(0, visibleCount);

  return (
    <div className="content rpt-page ief-page">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex flex-wrap justify-content-between align-items-start" style={{ gap: 12 }}>
                <div>
                  <CardTitle tag="h4">Facturas por establecimiento</CardTitle>
                  <p className="rpt-subtitle">
                    Una fila por documento FEL (emitido o anulado) de cualquier establecimiento, sin detalle de productos. Filtra
                    cada columna como en Excel y descarga el mismo formato del reporte SAT.
                  </p>
                </div>
                <div className="rpt-controls">
                  <Button color="success" size="sm" onClick={handleExport} disabled={loading || !filteredRows.length}>
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <div className="ief-toolbar">
                <div>
                  <span className="rpt-label d-block">Periodo</span>
                  <div className="rpt-segment" role="group" aria-label="Periodos rápidos">
                    {DATE_PRESETS.map((preset) => {
                      const range = preset.range();
                      const active = range.from === fromDate && range.to === toDate;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={active ? "is-active" : ""}
                          aria-pressed={active}
                          onClick={() => applyPreset(preset)}
                        >
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <Label for="ief-from" className="rpt-label d-block">
                    Desde
                  </Label>
                  <Input id="ief-from" type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div>
                  <Label for="ief-to" className="rpt-label d-block">
                    Hasta
                  </Label>
                  <Input id="ief-to" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="ief-establishments pr-root">
                  <PosExcelFilter
                    label="Establecimientos"
                    options={establishmentOptions}
                    selected={selectedCodes}
                    onChange={setSelectedCodes}
                    allLabel="Todos"
                    noun="establecimientos"
                    searchPlaceholder="Buscar establecimiento…"
                  />
                </div>
                <div className="ief-search">
                  <Label for="ief-search" className="rpt-label d-block">
                    Buscar
                  </Label>
                  <Input
                    id="ief-search"
                    type="search"
                    placeholder="Serie, número, NIT, receptor, adenda…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setVisibleCount(PAGE_STEP);
                    }}
                  />
                </div>
              </div>

              {error && <Alert color="danger">{error}</Alert>}

              <div className="ief-tiles">
                <div className="ief-tile">
                  <span className="ief-tile-label">Documentos</span>
                  <span className="ief-tile-value">{summary.documents.toLocaleString("en-US")}</span>
                </div>
                <div className="ief-tile is-ok">
                  <span className="ief-tile-label">Emitidos</span>
                  <span className="ief-tile-value">{summary.emitted.toLocaleString("en-US")}</span>
                </div>
                <div className="ief-tile is-void">
                  <span className="ief-tile-label">Anulados</span>
                  <span className="ief-tile-value">{summary.voided.toLocaleString("en-US")}</span>
                </div>
                <div className="ief-tile is-total">
                  <span className="ief-tile-label">Total emitido</span>
                  <span className="ief-tile-value">{money(summary.total)}</span>
                  <span className="ief-tile-hint">Neto de notas de crédito; sin anulados</span>
                </div>
              </div>

              {byEstablishment.length > 1 && (
                <button
                  type="button"
                  className="ief-chips-toggle"
                  onClick={() => setShowChips((v) => !v)}
                  aria-expanded={showChips}
                >
                  {showChips ? "▾" : "▸"} Resumen por establecimiento ({byEstablishment.length})
                </button>
              )}
              {showChips && byEstablishment.length > 1 && (
                <div className="ief-chips" aria-label="Resumen por establecimiento">
                  {byEstablishment.map((item) => {
                    const active = colFilters.establishment?.size === 1 && colFilters.establishment.has(item.label);
                    return (
                      <button
                        key={item.label}
                        type="button"
                        className={`ief-chip${active ? " is-active" : ""}`}
                        onClick={() => toggleEstablishmentFilter(item.label)}
                        aria-pressed={active}
                        title="Mostrar solo este establecimiento"
                      >
                        <span className="ief-chip-name">{item.label}</span>
                        <span className="ief-chip-meta">
                          {item.emitted} emitidas · {money(item.total)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="ief-bar">
                <span className="rpt-count">
                  {loading ? "Cargando…" : `${filteredRows.length.toLocaleString("en-US")} de ${rows.length.toLocaleString("en-US")} documentos`}
                </span>
                {activeFilterCount > 0 && (
                  <button type="button" className="rpt-clear" onClick={clearFilters}>
                    Quitar {activeFilterCount === 1 ? "el filtro" : `${activeFilterCount} filtros`}
                  </button>
                )}
                {loading && <Spinner size="sm" color="secondary" />}
              </div>

              <div className="ief-wrap">
                <table className="ief-table">
                  <thead>
                    <tr>
                      <th className="ief-th ief-rownum" aria-label="Fila">
                        #
                      </th>
                      {COLUMNS.map((col) => (
                        <ColumnHeader
                          key={col.key}
                          col={col}
                          sort={sort}
                          onSort={handleSort}
                          valueCounts={valueCountsByColumn[col.key] || new Map()}
                          selected={colFilters[col.key] || null}
                          onApply={(set) => applyColumnFilter(col.key, set)}
                        />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row, i) => (
                      <tr key={row.id} className={row.status === "ANULADO" ? "is-void" : ""}>
                        <td className="ief-rownum">{i + 1}</td>
                        {COLUMNS.map((col) => (
                          <td
                            key={col.key}
                            className={`${col.num ? "is-num" : ""}${col.mono ? " is-mono" : ""}${col.key === "estado" ? " is-status" : ""}`}
                            title={col.key === "receptor" ? row.customerName : undefined}
                          >
                            {col.key === "estado" ? (
                              <span className={`ief-badge ${row.status === "ANULADO" ? "is-void" : "is-ok"}`}>{row.status}</span>
                            ) : col.key === "total" && signedAmount(row) < 0 ? (
                              <span className="ief-neg">-{money(row.totalAmount)}</span>
                            ) : (
                              cellText(col, row)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!loading && filteredRows.length === 0 && (
                      <tr>
                        <td colSpan={COLUMNS.length + 1} className="ief-empty">
                          {rows.length === 0
                            ? "No hay facturas en el periodo y establecimientos elegidos."
                            : "Ningún documento coincide con los filtros."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {filteredRows.length > 0 && (
                    <tfoot>
                      <tr>
                        <td colSpan={COLUMNS.length} className="is-num">
                          Total emitido ({summary.emitted} documentos{summary.voided ? `, ${summary.voided} anulados no suman` : ""})
                        </td>
                        <td className="is-num">{money(summary.total)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {filteredRows.length > shown.length && (
                <div className="text-center mt-3">
                  <Button color="secondary" outline size="sm" onClick={() => setVisibleCount((n) => n + PAGE_STEP)}>
                    Mostrar {Math.min(PAGE_STEP, filteredRows.length - shown.length)} más ({shown.length} de {filteredRows.length})
                  </Button>
                  <span className="ief-hint"> El Excel descarga todas las filas filtradas.</span>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default InvoiceEstablishmentReport;
