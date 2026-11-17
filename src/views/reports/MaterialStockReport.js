import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Collapse, Input, Spinner, Table } from "reactstrap";
import { getCurrentInventoryReport } from "services/purchaseReportService";
import {
  MATERIAL_STATUS_ORDER,
  buildMaterialRows,
  exportMaterialStockExcel,
  explainMaterial,
  filterMaterials,
  fmtInt,
  fmtMoney,
  fmtQty,
  materialLevel,
  materialStatusMeta,
  sortMaterials,
  summarizeMaterials,
} from "utils/inventoryStockReports";
import { showError } from "utils/notificationHelper";
import "./reportsDesign.css";

const PAGE_SIZE = 200;
const COL_WIDTHS = ["31%", "11%", "25%", "10%", "12%", "11%"];

const COLUMNS = [
  { key: "name", label: "Material", defaultDir: "asc" },
  { key: "stock", label: "Existencia", defaultDir: "desc", numeric: true },
  { key: "level", label: "Nivel (mín · máx)", defaultDir: "asc" },
  { key: "cost", label: "Costo unit.", defaultDir: "desc", numeric: true },
  { key: "value", label: "Valor", defaultDir: "desc", numeric: true },
  { key: "status", label: "Estado", defaultDir: "asc" },
];

const tileHint = (key, sum) => {
  const meta = materialStatusMeta(key);
  const value = sum?.byStatus?.[key]?.value || 0;
  return key === "AGOTADO" || value === 0 ? meta.hint : `${meta.hint} · ${fmtMoney(value)}`;
};

function Gauge({ row }) {
  const level = materialLevel(row);
  const meta = materialStatusMeta(row.status);
  if (!level) {
    return <span className="rpt-meta">Sin máximo definido</span>;
  }
  return (
    <div>
      <div className="rpt-gauge" aria-hidden="true">
        <span className="rpt-gauge-fill" style={{ width: `${level.pct}%`, background: meta.color }} />
        {level.minPct != null && <span className="rpt-gauge-min" style={{ left: `${level.minPct}%` }} />}
      </div>
      <span className="rpt-meta">
        mín {fmtQty(row.min)} · máx {fmtQty(row.max)}
      </span>
    </div>
  );
}

function MaterialStockReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "status", dir: "asc" });
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [showRules, setShowRules] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await getCurrentInventoryReport());
    } catch (err) {
      setReport(null);
      setError(err.message || "No se pudo cargar el inventario de materiales.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [statusFilter, search, sort]);

  const allRows = useMemo(() => buildMaterialRows(report).filter((r) => r.active), [report]);
  const summary = useMemo(() => summarizeMaterials(allRows), [allRows]);
  const shownRows = useMemo(
    () => sortMaterials(filterMaterials(allRows, { status: statusFilter, search }), sort.key, sort.dir),
    [allRows, statusFilter, search, sort]
  );
  const filtered = statusFilter !== "ALL" || search.trim() !== "";

  const toggleSort = (col) =>
    setSort((prev) =>
      prev.key === col.key
        ? { key: col.key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key: col.key, dir: col.defaultDir }
    );

  const exportExcel = () => {
    if (!shownRows.length) {
      showError("No hay filas para exportar.");
      return;
    }
    const parts = [];
    if (statusFilter !== "ALL") parts.push(`Estado: ${materialStatusMeta(statusFilter).label}`);
    if (search.trim()) parts.push(`Búsqueda: «${search.trim()}»`);
    try {
      exportMaterialStockExcel({ rows: shownRows, filtersLabel: parts.join("  ·  ") });
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="d-flex flex-wrap justify-content-between align-items-start" style={{ gap: 12 }}>
          <div>
            <CardTitle tag="h4">Inventario de materiales</CardTitle>
            <p className="rpt-subtitle">Cuánto hay de cada material y si está dentro del mínimo y el máximo.</p>
            <Button color="link" className="rpt-how-btn mt-1" onClick={() => setShowRules((v) => !v)}>
              {showRules ? "Ocultar cómo se lee" : "¿Cómo se lee este reporte?"}
            </Button>
          </div>
          <div className="rpt-controls">
            <Button color="success" size="sm" onClick={exportExcel} disabled={loading || !shownRows.length}>
              <i className="nc-icon nc-cloud-download-93 mr-1" />
              Excel
            </Button>
          </div>
        </div>
        <Collapse isOpen={showRules}>
          <div className="rpt-rules">
            <dl>
              <dt>Existencia</dt>
              <dd>Lo que hay hoy en bodega de materiales.</dd>
              <dt>Nivel</dt>
              <dd>La barra se llena según la existencia contra el máximo; la rayita marca el mínimo.</dd>
              <dt>Valor</dt>
              <dd>Existencia × costo unitario.</dd>
              {MATERIAL_STATUS_ORDER.map((k) => (
                <React.Fragment key={k}>
                  <dt style={{ color: materialStatusMeta(k).color }}>{materialStatusMeta(k).label}</dt>
                  <dd>{materialStatusMeta(k).meaning}</dd>
                </React.Fragment>
              ))}
            </dl>
          </div>
        </Collapse>
      </CardHeader>
      <CardBody>
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
            <div className="rpt-tiles">
              {MATERIAL_STATUS_ORDER.map((k) => {
                const meta = materialStatusMeta(k);
                const count = summary.byStatus[k].lines;
                const active = statusFilter === k;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`rpt-tile${active ? " is-active" : ""}${count ? "" : " is-empty"}`}
                    style={{ borderLeftColor: meta.color }}
                    aria-pressed={active}
                    onClick={() => setStatusFilter(active ? "ALL" : k)}
                  >
                    <span className="rpt-tile-label" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="rpt-tile-value">{report ? fmtInt(count) : "–"}</span>
                    <span className="rpt-tile-hint">{report ? tileHint(k, summary) : ""}</span>
                  </button>
                );
              })}
              <div className="rpt-tile is-static" style={{ borderLeftColor: "#1f2937" }}>
                <span className="rpt-tile-label" style={{ color: "#1f2937" }}>
                  Valor del inventario
                </span>
                <span className="rpt-tile-value">{report ? fmtMoney(summary.value) : "–"}</span>
                <span className="rpt-tile-hint">{report ? `${fmtInt(summary.count)} materiales activos` : ""}</span>
              </div>
            </div>

            <div className="rpt-toolbar">
              <Input
                className="rpt-search"
                type="search"
                bsSize="sm"
                placeholder="Buscar material o SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar"
              />
              {filtered && (
                <Button
                  color="link"
                  className="rpt-clear"
                  onClick={() => {
                    setStatusFilter("ALL");
                    setSearch("");
                  }}
                >
                  Quitar filtros
                </Button>
              )}
              <span className="rpt-count" aria-live="polite">
                {loading ? (
                  <>
                    <Spinner size="sm" className="mr-1" /> Cargando…
                  </>
                ) : report ? (
                  <>
                    Mostrando {fmtInt(Math.min(visible, shownRows.length))} de {fmtInt(shownRows.length)}
                    {filtered ? ` (${fmtInt(allRows.length)} en total)` : ""}
                  </>
                ) : null}
              </span>
            </div>

            {loading && !report ? (
              <div className="rpt-empty">
                <Spinner /> <div className="mt-2">Cargando inventario…</div>
              </div>
            ) : !shownRows.length ? (
              <div className="rpt-empty">
                {filtered ? "Ningún material con estos filtros." : "No hay materiales para mostrar."}
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
                        const meta = materialStatusMeta(row.status);
                        return (
                          <tr key={row.key} title={explainMaterial(row)}>
                            <td>
                              <span className="rpt-name">{row.name}</span>
                              <span className="rpt-meta">{row.sku}</span>
                            </td>
                            <td className="rpt-num">{fmtQty(row.stock)}</td>
                            <td>
                              <Gauge row={row} />
                            </td>
                            <td className="rpt-num">{fmtMoney(row.unitCost)}</td>
                            <td className="rpt-num">{fmtMoney(row.value)}</td>
                            <td>
                              <span className="rpt-badge" style={{ color: meta.color, background: meta.bg }}>
                                {meta.label}
                              </span>
                            </td>
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

export default MaterialStockReport;
