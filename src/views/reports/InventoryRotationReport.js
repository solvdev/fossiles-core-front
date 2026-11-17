import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Collapse,
  Input,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import Select from "react-select";
import { getLocations } from "services/locationService";
import { getMaterialRotation, getProductRotation } from "services/inventoryRotationService";
import {
  SCOPES,
  STATUS_ORDER,
  countByStatus,
  coverageText,
  explainRow,
  exportRotationExcel,
  filterRows,
  fmtDate,
  fmtInt,
  fmtMoney,
  fmtQty,
  fmtRate,
  sortRows,
  statusMeta,
  thresholds,
} from "utils/inventoryRotationReport";
import { showError } from "utils/notificationHelper";
import "./InventoryRotationReport.css";

const WINDOW_OPTIONS = [30, 60, 90];
const PAGE_SIZE = 200;

/** Anchos de columna: el nombre manda y los números quedan juntos, sin huecos enormes. */
const COL_WIDTHS = ["34%", "9%", "11%", "8%", "20%", "10%", "8%"];

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderRadius: 8,
    borderColor: state.isFocused ? "#0b6e71" : "#d9e1e8",
    boxShadow: "none",
    "&:hover": { borderColor: "#0b6e71" },
  }),
  menu: (base) => ({ ...base, zIndex: 5 }),
};

/** Columnas ordenables: clave de orden y sentido con el que arranca al primer clic. */
const COLUMNS = (scope, windowDays) => [
  { key: "name", label: scope.itemLabel, defaultDir: "asc" },
  { key: "stock", label: "Existencia", defaultDir: "desc", numeric: true },
  { key: "moved", label: `${scope.movedLabel} (${windowDays} d)`, defaultDir: "desc", numeric: true },
  { key: "rate", label: "Por día", defaultDir: "desc", numeric: true },
  { key: "coverage", label: "Alcanza para", defaultDir: "asc" },
  { key: "status", label: "Estado", defaultDir: "asc" },
  { key: "last", label: scope.lastLabel, defaultDir: "desc" },
];

const isKioskLocation = (location) => {
  const text = `${location?.categoria || ""} ${location?.name || ""} ${location?.code || ""}`.toUpperCase();
  return text.includes("KIOS") || String(location?.code || "").toUpperCase().startsWith("K");
};

const tileHint = (key, data, t) => {
  switch (key) {
    case "SIN_STOCK":
      return "Sin existencia y con movimiento";
    case "SE_AGOTA":
      return `Alcanza menos de ${t.shortDays} días`;
    case "NORMAL":
      return `Alcanza de ${t.shortDays} a ${t.slowDays} días`;
    case "LENTO":
      return `Alcanza más de ${t.slowDays} días`;
    default:
      return `${fmtMoney(data?.summary?.noMovementValue)} parados`;
  }
};

function CoverageCell({ row, slowDays }) {
  const meta = statusMeta(row.status);
  const days = row.coverageDays == null ? null : Number(row.coverageDays);
  const pct = days == null ? 0 : Math.max(4, Math.min(100, (days / slowDays) * 100));
  const text = row.status === "SIN_STOCK" ? "0 días" : coverageText(row);
  return (
    <div className="rot-cover">
      <div className="rot-cover-bar" aria-hidden="true">
        <span style={{ width: `${row.status === "SIN_STOCK" ? 0 : pct}%`, background: meta.color }} />
      </div>
      <span className="rot-cover-text">{text}</span>
    </div>
  );
}

function InventoryRotationReport() {
  const [scopeKey, setScopeKey] = useState("PRODUCTS");
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kiosks, setKiosks] = useState([]);
  const [selectedKiosks, setSelectedKiosks] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "status", dir: "asc" });
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [showRules, setShowRules] = useState(false);

  const scope = SCOPES[scopeKey];
  const isProducts = scopeKey === "PRODUCTS";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locations = await getLocations();
        if (cancelled) return;
        setKiosks(
          (locations || [])
            .filter((l) => isKioskLocation(l) && !l.posTestMode)
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"))
        );
      } catch (err) {
        if (!cancelled) showError(err.message || "No se pudieron cargar los kioscos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kioskOptions = useMemo(
    () => kiosks.map((k) => ({ value: k.id, label: k.code ? `${k.name} (${k.code})` : k.name })),
    [kiosks]
  );

  const selectedIds = useMemo(() => selectedKiosks.map((o) => o.value), [selectedKiosks]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = isProducts
        ? await getProductRotation({ windowDays, locationIds: selectedIds })
        : await getMaterialRotation({ windowDays });
      setData(result);
    } catch (err) {
      setData(null);
      setError(err.message || "No se pudo calcular el reporte.");
    } finally {
      setLoading(false);
    }
  }, [isProducts, windowDays, selectedIds]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [statusFilter, search, sort, scopeKey, windowDays, selectedKiosks]);

  const changeScope = (key) => {
    if (key === scopeKey) return;
    setScopeKey(key);
    setData(null);
    setStatusFilter("ALL");
    setSearch("");
    setSort({ key: "status", dir: "asc" });
  };

  const t = thresholds(data);
  const allRows = useMemo(() => data?.rows || [], [data]);
  const counts = useMemo(() => countByStatus(allRows), [allRows]);
  const shownRows = useMemo(
    () => sortRows(filterRows(allRows, { status: statusFilter, search }), sort.key, sort.dir),
    [allRows, statusFilter, search, sort]
  );
  const columns = COLUMNS(scope, windowDays);
  const filtered = statusFilter !== "ALL" || search.trim() !== "";

  const toggleSort = (col) => {
    setSort((prev) =>
      prev.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.defaultDir }
    );
  };

  const filtersLabel = () => {
    const parts = [];
    if (isProducts) {
      parts.push(selectedKiosks.length ? `Kioscos: ${selectedKiosks.map((o) => o.label).join(", ")}` : "Kioscos: todos");
    }
    if (statusFilter !== "ALL") parts.push(`Estado: ${statusMeta(statusFilter).label}`);
    if (search.trim()) parts.push(`Búsqueda: «${search.trim()}»`);
    return parts.join("  ·  ");
  };

  const exportExcel = () => {
    if (!data || !shownRows.length) {
      showError("No hay filas para exportar.");
      return;
    }
    try {
      exportRotationExcel({ scope, data, rows: shownRows, filtersLabel: filtersLabel() });
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    }
  };

  const clearFilters = () => {
    setStatusFilter("ALL");
    setSearch("");
  };

  return (
    <div className="content rot-page">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex flex-wrap justify-content-between align-items-start" style={{ gap: 12 }}>
                <div>
                  <CardTitle tag="h4">Rotación y cobertura de inventario</CardTitle>
                  <p className="rot-subtitle">
                    {isProducts
                      ? "Cuánto alcanza lo que hay en los kioscos y qué producto no se está vendiendo."
                      : "Cuánto alcanza cada material al ritmo de consumo y cuál está parado."}
                  </p>
                  <Button color="link" className="rot-how-btn mt-1" onClick={() => setShowRules((v) => !v)}>
                    {showRules ? "Ocultar cómo se lee" : "¿Cómo se lee este reporte?"}
                  </Button>
                </div>
                <div className="rot-controls">
                  <span className="rot-label">Período</span>
                  <div className="rot-segment" role="group" aria-label="Período analizado">
                    {WINDOW_OPTIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={windowDays === d ? "is-active" : ""}
                        aria-pressed={windowDays === d}
                        onClick={() => setWindowDays(d)}
                      >
                        {d} días
                      </button>
                    ))}
                  </div>
                  <Button color="success" size="sm" onClick={exportExcel} disabled={loading || !shownRows.length}>
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    Excel
                  </Button>
                </div>
              </div>
              <Collapse isOpen={showRules}>
                <div className="rot-rules">
                  <dl>
                    <dt>Existencia</dt>
                    <dd>Lo que hay hoy{isProducts ? " sumando los kioscos elegidos" : " en bodega de materiales"}.</dd>
                    <dt>{scope.movedLabel}</dt>
                    <dd>
                      {isProducts
                        ? "Unidades vendidas menos las anuladas en el período. Las ventas sin factura no cuentan."
                        : "Lo que salió a producción en el período. Los ajustes de inventario no cuentan."}
                    </dd>
                    <dt>Alcanza para</dt>
                    <dd>Existencia ÷ ritmo diario: cuántos días dura lo que hay si el ritmo no cambia.</dd>
                    {STATUS_ORDER.map((k) => (
                      <React.Fragment key={k}>
                        <dt style={{ color: statusMeta(k).color }}>{statusMeta(k).label}</dt>
                        <dd>{statusMeta(k).meaning(scope, t)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
              </Collapse>
            </CardHeader>
            <CardBody>
              <div className="rot-toolbar">
                <div className="rot-segment" role="group" aria-label="Qué inventario ver">
                  {Object.values(SCOPES).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      className={scopeKey === s.key ? "is-active" : ""}
                      aria-pressed={scopeKey === s.key}
                      onClick={() => changeScope(s.key)}
                    >
                      {s.tab}
                    </button>
                  ))}
                </div>
                {isProducts && (
                  <div style={{ minWidth: 260, flex: "1 1 260px", maxWidth: 480 }}>
                    <Select
                      isMulti
                      isClearable
                      placeholder="Todos los kioscos"
                      noOptionsMessage={() => "Sin kioscos"}
                      options={kioskOptions}
                      styles={selectStyles}
                      value={selectedKiosks}
                      onChange={(v) => setSelectedKiosks(v || [])}
                    />
                  </div>
                )}
              </div>

              {error && (
                <Alert color="danger" className="d-flex justify-content-between align-items-center">
                  <span>{error}</span>
                  <Button size="sm" color="danger" outline onClick={load}>
                    Reintentar
                  </Button>
                </Alert>
              )}

              {!error && (
                <>
                  <div className="rot-tiles">
                    {STATUS_ORDER.map((k) => {
                      const meta = statusMeta(k);
                      const active = statusFilter === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          className={`rot-tile${active ? " is-active" : ""}${counts[k] ? "" : " is-empty"}`}
                          style={{ borderLeftColor: meta.color }}
                          aria-pressed={active}
                          onClick={() => setStatusFilter(active ? "ALL" : k)}
                        >
                          <span className="rot-tile-label" style={{ color: meta.color }}>
                            {meta.label}
                          </span>
                          <span className="rot-tile-value">{loading && !data ? "–" : fmtInt(counts[k])}</span>
                          <span className="rot-tile-hint">{data ? tileHint(k, data, t) : ""}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="rot-toolbar">
                    <Input
                      className="rot-search"
                      type="search"
                      bsSize="sm"
                      placeholder={isProducts ? "Buscar producto, código o color" : "Buscar material o código"}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      aria-label="Buscar"
                    />
                    {filtered && (
                      <Button color="link" className="rot-clear" onClick={clearFilters}>
                        Quitar filtros
                      </Button>
                    )}
                    <span className="rot-count" aria-live="polite">
                      {loading ? (
                        <>
                          <Spinner size="sm" className="mr-1" /> Calculando…
                        </>
                      ) : data ? (
                        <>
                          Mostrando {fmtInt(Math.min(visible, shownRows.length))} de {fmtInt(shownRows.length)}
                          {filtered ? ` (${fmtInt(allRows.length)} en total)` : ""} ·{" "}
                          {fmtQty(data.summary?.totalStock)} u en existencia · desde {fmtDate(data.since)}
                        </>
                      ) : null}
                    </span>
                  </div>

                  {loading && !data ? (
                    <div className="rot-empty">
                      <Spinner /> <div className="mt-2">Calculando rotación…</div>
                    </div>
                  ) : !shownRows.length ? (
                    <div className="rot-empty">
                      {filtered
                        ? "Ningún resultado con estos filtros."
                        : "No hay movimiento ni existencia en este período."}
                      {filtered && (
                        <div>
                          <Button color="link" onClick={clearFilters}>
                            Quitar filtros
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="rot-table-wrap" style={loading ? { opacity: 0.55 } : undefined}>
                        <Table className="rot-table" hover={false}>
                          <colgroup>
                            {COL_WIDTHS.map((w, i) => (
                              <col key={i} style={{ width: w }} />
                            ))}
                          </colgroup>
                          <thead>
                            <tr>
                              {columns.map((col) => {
                                const active = sort.key === col.key;
                                return (
                                  <th
                                    key={col.key}
                                    className={col.numeric ? "rot-num" : ""}
                                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                                  >
                                    <button type="button" onClick={() => toggleSort(col)}>
                                      {col.label}
                                      <span aria-hidden="true">{active ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>
                                    </button>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {shownRows.slice(0, visible).map((row) => {
                              const meta = statusMeta(row.status);
                              return (
                                <tr key={row.key} title={explainRow(row, scope, windowDays)}>
                                  <td>
                                    <span className="rot-name">{row.name}</span>
                                    {isProducts && row.hardware && row.hardware !== "NUEVO" && (
                                      <span className="rot-chip-hardware">{row.hardware}</span>
                                    )}
                                    <span className="rot-meta">
                                      {[row.code, row.variant, row.unit].filter(Boolean).join(" · ")}
                                      {isProducts && row.locationsWithStock > 0
                                        ? ` · en ${row.locationsWithStock} ${row.locationsWithStock === 1 ? "kiosco" : "kioscos"}`
                                        : ""}
                                    </span>
                                  </td>
                                  <td className="rot-num">{fmtQty(row.stock)}</td>
                                  <td className="rot-num">{fmtQty(row.moved)}</td>
                                  <td className="rot-num">{fmtRate(row.dailyRate)}</td>
                                  <td>
                                    <CoverageCell row={row} slowDays={t.slowDays} />
                                  </td>
                                  <td>
                                    <span className="rot-badge" style={{ color: meta.color, background: meta.bg }}>
                                      {meta.label}
                                    </span>
                                  </td>
                                  <td className="rot-num">{fmtDate(row.lastMovementDate)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      </div>
                      {shownRows.length > visible && (
                        <div className="text-center mt-2">
                          <Button color="secondary" outline size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                            Mostrar {PAGE_SIZE} más
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default InventoryRotationReport;
