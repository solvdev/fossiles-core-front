import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Input, Spinner, Table } from "reactstrap";
import Select from "react-select";
import { getLocations } from "services/locationService";
import { getKioscoStockReport } from "services/kioscoInventoryService";
import {
  buildKioskStockRows,
  exportKioskStockExcel,
  filterKioskStock,
  fmtDate,
  fmtInt,
  sortKioskStock,
  summarizeKiosks,
} from "utils/inventoryStockReports";
import { showError } from "utils/notificationHelper";
import "./reportsDesign.css";

const PAGE_SIZE = 200;
const COL_WIDTHS = ["20%", "30%", "9%", "10%", "9%", "12%", "10%"];

const COLUMNS = [
  { key: "kiosk", label: "Kiosco", defaultDir: "asc" },
  { key: "name", label: "Producto", defaultDir: "asc" },
  { key: "hardware", label: "Herraje", defaultDir: "asc", plain: true },
  { key: "stock", label: "Existencia", defaultDir: "desc", numeric: true },
  { key: "minimum", label: "Mínimo", defaultDir: "desc", numeric: true },
  { key: "status", label: "Estado", defaultDir: "asc" },
  { key: "updated", label: "Actualizado", defaultDir: "desc", numeric: true },
];

const LOW = { color: "#991b1b", bg: "#fee2e2" };
const OK = { color: "#047857", bg: "#d1fae5" };

const isKioskLocation = (location) => {
  const text = `${location?.categoria || ""} ${location?.name || ""} ${location?.code || ""}`.toUpperCase();
  return text.includes("KIOS") || String(location?.code || "").toUpperCase().startsWith("K");
};

function KioskStockReport() {
  const [kiosks, setKiosks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [apiRows, setApiRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [kioskFilter, setKioskFilter] = useState(null);
  const [onlyLow, setOnlyLow] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "kiosk", dir: "asc" });
  const [visible, setVisible] = useState(PAGE_SIZE);
  const requestId = useRef(0);

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
        if (!cancelled) {
          setError(err.message || "No se pudieron cargar los kioscos.");
        }
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

  const idsToLoad = useMemo(
    () => (selected.length ? selected.map((o) => o.value) : kiosks.map((k) => k.id)),
    [selected, kiosks]
  );

  useEffect(() => {
    if (!kiosks.length) return undefined;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const rows = await getKioscoStockReport(idsToLoad);
        if (id === requestId.current) setApiRows(rows || []);
      } catch (err) {
        if (id === requestId.current) {
          setApiRows(null);
          setError(err.message || "No se pudo cargar las existencias.");
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [idsToLoad, kiosks.length]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [kioskFilter, onlyLow, search, sort]);

  const allRows = useMemo(() => buildKioskStockRows(apiRows, kiosks), [apiRows, kiosks]);
  const kioskSummary = useMemo(() => summarizeKiosks(allRows), [allRows]);
  const totals = useMemo(
    () => ({
      kiosks: kioskSummary.length,
      lines: allRows.length,
      units: kioskSummary.reduce((a, k) => a + k.units, 0),
      low: kioskSummary.reduce((a, k) => a + k.lowLines, 0),
    }),
    [kioskSummary, allRows]
  );
  const shownRows = useMemo(
    () =>
      sortKioskStock(filterKioskStock(allRows, { locationId: kioskFilter, onlyLow, search }), sort.key, sort.dir),
    [allRows, kioskFilter, onlyLow, search, sort]
  );
  const filtered = kioskFilter != null || onlyLow || search.trim() !== "";
  const kioskFilterName = kioskSummary.find((k) => k.locationId === kioskFilter)?.name;

  const toggleSort = (col) =>
    setSort((prev) =>
      prev.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.defaultDir }
    );

  const clearFilters = () => {
    setKioskFilter(null);
    setOnlyLow(false);
    setSearch("");
  };

  const exportExcel = () => {
    if (!shownRows.length) {
      showError("No hay filas para exportar.");
      return;
    }
    const parts = [];
    if (kioskFilterName) parts.push(`Kiosco: ${kioskFilterName}`);
    else parts.push(selected.length ? `Kioscos: ${selected.map((o) => o.label).join(", ")}` : "Kioscos: todos");
    if (onlyLow) parts.push("Solo stock bajo");
    if (search.trim()) parts.push(`Búsqueda: «${search.trim()}»`);
    try {
      exportKioskStockExcel({ rows: shownRows, filtersLabel: parts.join("  ·  ") });
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="d-flex flex-wrap justify-content-between align-items-start" style={{ gap: 12 }}>
          <div>
            <CardTitle tag="h4">Existencias por kiosco</CardTitle>
            <p className="rpt-subtitle">Qué producto hay en cada punto de venta y dónde está por debajo del mínimo.</p>
          </div>
          <div className="rpt-controls">
            <Button color="success" size="sm" onClick={exportExcel} disabled={loading || !shownRows.length}>
              <i className="nc-icon nc-cloud-download-93 mr-1" />
              Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="rpt-toolbar">
          <div style={{ minWidth: 260, flex: "1 1 260px", maxWidth: 520 }}>
            <Select
              isMulti
              isClearable
              placeholder="Todos los kioscos"
              noOptionsMessage={() => "Sin kioscos"}
              options={kioskOptions}
              value={selected}
              onChange={(v) => {
                setSelected(v || []);
                setKioskFilter(null);
              }}
              styles={{
                control: (base, state) => ({
                  ...base,
                  minHeight: 38,
                  borderRadius: 8,
                  borderColor: state.isFocused ? "#0b6e71" : "#d9e1e8",
                  boxShadow: "none",
                  "&:hover": { borderColor: "#0b6e71" },
                }),
                menu: (base) => ({ ...base, zIndex: 5 }),
              }}
            />
          </div>
        </div>

        {error && (
          <Alert color="danger">
            <span>{error}</span>
          </Alert>
        )}

        {!error && (
          <>
            <div className="rpt-tiles rpt-tiles--4">
              <div className="rpt-tile is-static" style={{ borderLeftColor: "#1f2937" }}>
                <span className="rpt-tile-label" style={{ color: "#1f2937" }}>
                  Kioscos
                </span>
                <span className="rpt-tile-value">{apiRows ? fmtInt(totals.kiosks) : "–"}</span>
                <span className="rpt-tile-hint">Con existencia o historial</span>
              </div>
              <div className="rpt-tile is-static" style={{ borderLeftColor: "#1d4ed8" }}>
                <span className="rpt-tile-label" style={{ color: "#1d4ed8" }}>
                  Líneas de producto
                </span>
                <span className="rpt-tile-value">{apiRows ? fmtInt(totals.lines) : "–"}</span>
                <span className="rpt-tile-hint">Producto + color + herraje</span>
              </div>
              <div className="rpt-tile is-static" style={{ borderLeftColor: "#047857" }}>
                <span className="rpt-tile-label" style={{ color: "#047857" }}>
                  Unidades en existencia
                </span>
                <span className="rpt-tile-value">{apiRows ? fmtInt(totals.units) : "–"}</span>
                <span className="rpt-tile-hint">Sumando los kioscos</span>
              </div>
              <button
                type="button"
                className={`rpt-tile${onlyLow ? " is-active" : ""}${totals.low ? "" : " is-empty"}`}
                style={{ borderLeftColor: LOW.color }}
                aria-pressed={onlyLow}
                onClick={() => setOnlyLow((v) => !v)}
              >
                <span className="rpt-tile-label" style={{ color: LOW.color }}>
                  Stock bajo
                </span>
                <span className="rpt-tile-value">{apiRows ? fmtInt(totals.low) : "–"}</span>
                <span className="rpt-tile-hint">Por debajo del mínimo del kiosco</span>
              </button>
            </div>

            {kioskSummary.length > 1 && (
              <>
                <h6 className="rpt-section-title">Por kiosco</h6>
                <div className="rpt-table-wrap rpt-table-wrap--short mb-3">
                  <Table className="rpt-table rpt-table--compact" hover={false}>
                    <thead>
                      <tr>
                        <th>Kiosco</th>
                        <th className="rpt-num">Líneas</th>
                        <th className="rpt-num">Unidades</th>
                        <th className="rpt-num">Stock bajo</th>
                        <th className="rpt-num">Actualizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kioskSummary.map((k) => {
                        const active = kioskFilter === k.locationId;
                        return (
                          <tr
                            key={k.locationId}
                            className={`rpt-row-click${active ? " is-selected" : ""}`}
                            onClick={() => setKioskFilter(active ? null : k.locationId)}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setKioskFilter(active ? null : k.locationId);
                              }
                            }}
                            aria-pressed={active}
                          >
                            <td>
                              <span className="rpt-name">{k.name}</span>
                              <span className="rpt-meta">{k.code}</span>
                            </td>
                            <td className="rpt-num">{fmtInt(k.lines)}</td>
                            <td className="rpt-num">{fmtInt(k.units)}</td>
                            <td className="rpt-num">
                              {k.lowLines > 0 ? (
                                <span className="rpt-badge" style={{ color: LOW.color, background: LOW.bg }}>
                                  {fmtInt(k.lowLines)}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="rpt-num">{fmtDate(k.last)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
                <p className="rpt-hint">Toca un kiosco para ver solo sus líneas abajo.</p>
              </>
            )}

            <div className="rpt-toolbar">
              <Input
                className="rpt-search"
                type="search"
                bsSize="sm"
                placeholder="Buscar producto, código o color"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar"
              />
              {kioskFilterName && <span className="rpt-badge" style={{ color: "#1f2937", background: "#e5e7eb" }}>{kioskFilterName}</span>}
              {filtered && (
                <Button color="link" className="rpt-clear" onClick={clearFilters}>
                  Quitar filtros
                </Button>
              )}
              <span className="rpt-count" aria-live="polite">
                {loading ? (
                  <>
                    <Spinner size="sm" className="mr-1" /> Cargando…
                  </>
                ) : apiRows ? (
                  <>
                    Mostrando {fmtInt(Math.min(visible, shownRows.length))} de {fmtInt(shownRows.length)}
                    {filtered ? ` (${fmtInt(allRows.length)} en total)` : ""}
                  </>
                ) : null}
              </span>
            </div>

            {loading && !apiRows ? (
              <div className="rpt-empty">
                <Spinner /> <div className="mt-2">Cargando existencias…</div>
              </div>
            ) : !shownRows.length ? (
              <div className="rpt-empty">
                {filtered ? "Ninguna línea con estos filtros." : "No hay existencias para los kioscos elegidos."}
              </div>
            ) : (
              <>
                <div className="rpt-table-wrap" style={loading ? { opacity: 0.55 } : undefined}>
                  <Table className="rpt-table" hover={false}>
                    <colgroup>
                      {COL_WIDTHS.map((w, i) => (
                        <col key={i} style={{ width: w }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {COLUMNS.map((col) => {
                          const active = sort.key === col.key;
                          return (
                            <th
                              key={col.key}
                              className={col.numeric ? "rpt-num" : ""}
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
                        const tone = row.low ? LOW : OK;
                        return (
                          <tr key={row.key}>
                            <td>
                              <span className="rpt-name">{row.kioskName}</span>
                              <span className="rpt-meta">{row.kioskCode}</span>
                            </td>
                            <td>
                              <span className="rpt-name">{row.name}</span>
                              <span className="rpt-meta">
                                {[row.code, row.color, row.sizes].filter(Boolean).join(" · ")}
                              </span>
                            </td>
                            <td>{row.hardware || "—"}</td>
                            <td className="rpt-num">{fmtInt(row.stock)}</td>
                            <td className="rpt-num">{row.minimum ? fmtInt(row.minimum) : "—"}</td>
                            <td>
                              <span className="rpt-badge" style={{ color: tone.color, background: tone.bg }}>
                                {row.low ? "Stock bajo" : "Disponible"}
                              </span>
                            </td>
                            <td className="rpt-num">{fmtDate(row.updatedAt)}</td>
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
  );
}

export default KioskStockReport;
