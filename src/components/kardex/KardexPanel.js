import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Spinner } from "reactstrap";
import KardexTable from "./KardexTable";
import { exportKardexExcel } from "utils/kardexExport";
import {
  DIRECTIONS,
  DIRECTION_ORDER,
  countByDirection,
  filterKardexRows,
  fmtDay,
  fmtMoney,
  fmtNum,
  sortKardexRows,
  summarizeKardex,
  typesPresent,
} from "utils/kardexModel";
import { showError } from "utils/notificationHelper";
import "views/reports/reportsDesign.css";
import "./kardexDesign.css";

const PAGE_SIZE = 100;

/**
 * Cuerpo común del kardex de materiales y de producto: totales, filtros, tabla y Excel.
 * `rows === null` significa «todavía no se pidió nada» y muestra `start`.
 */
function KardexPanel({
  title,
  subtitle,
  rows,
  loading = false,
  error = "",
  onRetry,
  start = null,
  toolbar = null,
  banner = null,
  showItem = true,
  itemKind = "product",
  showName = true,
  showLocation = false,
  showValue = true,
  itemLabel = "Ítem",
  onOpenTransfer,
  embedded = false,
  compact = false,
  fileName = "kardex",
}) {
  const [direction, setDirection] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [sortDir, setSortDir] = useState("desc");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const all = useMemo(() => rows || [], [rows]);

  // Al cambiar de ítem o de consulta se parte de cero: un filtro viejo no debe esconder los datos nuevos.
  useEffect(() => {
    setDirection("ALL");
    setType("ALL");
    setFrom("");
    setTo("");
    setSearch("");
  }, [rows]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [direction, type, from, to, search, sortDir, rows]);

  const filtered = useMemo(
    () => sortKardexRows(filterKardexRows(all, { direction, type, from, to, search }), sortDir),
    [all, direction, type, from, to, search, sortDir]
  );
  const summary = useMemo(() => summarizeKardex(filtered), [filtered]);
  const counts = useMemo(() => countByDirection(all), [all]);
  const types = useMemo(
    () => typesPresent(direction === "ALL" ? all : all.filter((r) => r.direction === direction)),
    [all, direction]
  );
  const hasFilters = direction !== "ALL" || type !== "ALL" || from || to || search.trim();

  const clearFilters = () => {
    setDirection("ALL");
    setType("ALL");
    setFrom("");
    setTo("");
    setSearch("");
  };

  const filtersLabel = () => {
    const parts = [title];
    if (direction !== "ALL") parts.push(`Solo ${DIRECTIONS[direction].plural.toLowerCase()}`);
    if (type !== "ALL") parts.push(`Tipo: ${types.find((t) => t.key === type)?.label || type}`);
    if (from || to) parts.push(`Fechas: ${from ? fmtDay(from) : "…"} a ${to ? fmtDay(to) : "…"}`);
    if (search.trim()) parts.push(`Búsqueda: «${search.trim()}»`);
    return parts.join("  ·  ");
  };

  const exportExcel = () => {
    if (!filtered.length) {
      showError("No hay movimientos para exportar.");
      return;
    }
    try {
      exportKardexExcel({
        fileName,
        title,
        rows: sortKardexRows(filtered, "asc"),
        filtersLabel: filtersLabel(),
        showItem,
        itemLabel,
        showColor: itemKind === "product",
        showLocation,
        showValue,
      });
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    }
  };

  const dirTile = (key) => {
    const dir = DIRECTIONS[key];
    const qty = key === "IN" ? summary.totalIn : summary.totalOut;
    const value = key === "IN" ? summary.valueIn : summary.valueOut;
    const active = direction === key;
    return (
      <button
        key={key}
        type="button"
        className={`rpt-tile${active ? " is-active" : ""}${counts[key] ? "" : " is-empty"}`}
        style={{ borderLeftColor: dir.color }}
        aria-pressed={active}
        onClick={() => setDirection(active ? "ALL" : key)}
      >
        <span className="rpt-tile-label" style={{ color: dir.color }}>
          {dir.plural}
        </span>
        <span className="rpt-tile-value">{key === "IN" ? "+" : "−"}{fmtNum(qty)}</span>
        <span className="rpt-tile-hint">
          {fmtNum(counts[key])} {counts[key] === 1 ? "movimiento" : "movimientos"}
          {showValue && value ? ` · ${fmtMoney(value)}` : ""}
        </span>
      </button>
    );
  };

  const body = (
    <>
      {toolbar}
      {banner}

      {error && (
        <Alert color="danger" className="d-flex justify-content-between align-items-center">
          <span>{error}</span>
          {onRetry && (
            <Button size="sm" color="danger" outline onClick={onRetry}>
              Reintentar
            </Button>
          )}
        </Alert>
      )}

      {!error && rows === null && start}

      {!error && rows !== null && (
        <>
          {loading && !all.length ? (
            <div className="rpt-empty">
              <Spinner /> <div className="mt-2">Cargando movimientos…</div>
            </div>
          ) : !all.length ? (
            <div className="rpt-empty">No hay movimientos registrados para esta consulta.</div>
          ) : (
            <>
              <div className="rpt-tiles rpt-tiles--4">
                {dirTile("IN")}
                {dirTile("OUT")}
                <div className="rpt-tile is-static" style={{ borderLeftColor: "#1f2937" }}>
                  <span className="rpt-tile-label" style={{ color: "#1f2937" }}>
                    {summary.single ? "Saldo final" : "Neto del período"}
                  </span>
                  <span className="rpt-tile-value">
                    {summary.single
                      ? summary.closing === null
                        ? "—"
                        : fmtNum(summary.closing)
                      : `${summary.net > 0 ? "+" : summary.net < 0 ? "−" : ""}${fmtNum(Math.abs(summary.net))}`}
                  </span>
                  <span className="rpt-tile-hint">
                    {summary.single
                      ? `Saldo inicial ${summary.opening === null ? "—" : fmtNum(summary.opening)}`
                      : "Entradas menos salidas"}
                  </span>
                </div>
                <div className="rpt-tile is-static" style={{ borderLeftColor: "#6b7280" }}>
                  <span className="rpt-tile-label" style={{ color: "#4b5563" }}>
                    Movimientos
                  </span>
                  <span className="rpt-tile-value">{fmtNum(summary.count)}</span>
                  <span className="rpt-tile-hint">
                    {summary.count ? `Del ${fmtDay(summary.from)} al ${fmtDay(summary.to)}` : "Sin resultados"}
                  </span>
                </div>
              </div>

              <div className="kdx-filters">
                <div className="kdx-field">
                  <label htmlFor="kdx-kind">Tipo de movimiento</label>
                  <select id="kdx-kind" value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="ALL">Todos ({fmtNum(all.length)})</option>
                    {DIRECTION_ORDER.map((d) => {
                      const group = types.filter((t) => t.direction === d);
                      if (!group.length) return null;
                      return (
                        <optgroup key={d} label={DIRECTIONS[d].plural}>
                          {group.map((t) => (
                            <option key={t.key} value={t.key}>
                              {t.label} ({fmtNum(t.count)})
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
                <div className="kdx-field">
                  <label htmlFor="kdx-from">Desde</label>
                  <input id="kdx-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="kdx-field">
                  <label htmlFor="kdx-to">Hasta</label>
                  <input id="kdx-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="kdx-field kdx-grow">
                  <label htmlFor="kdx-search">Buscar</label>
                  <input
                    id="kdx-search"
                    type="search"
                    placeholder="Referencia, descripción, código…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {hasFilters ? (
                  <Button color="link" className="rpt-clear mb-2" onClick={clearFilters}>
                    Quitar filtros
                  </Button>
                ) : null}
                <Button color="success" size="sm" className="mb-1 ml-auto" onClick={exportExcel} disabled={!filtered.length}>
                  <i className="nc-icon nc-cloud-download-93 mr-1" />
                  Excel
                </Button>
              </div>

              {!filtered.length ? (
                <div className="rpt-empty">
                  Ningún movimiento con estos filtros.
                  <div>
                    <Button color="link" onClick={clearFilters}>
                      Quitar filtros
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <KardexTable
                    rows={filtered.slice(0, visible)}
                    sortDir={sortDir}
                    onToggleSort={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                    showItem={showItem}
                    itemKind={itemKind}
                    showName={showName}
                    showLocation={showLocation}
                    showValue={showValue}
                    onOpenTransfer={onOpenTransfer}
                    dim={loading}
                  />
                  <p className="rpt-hint mt-2" aria-live="polite">
                    Mostrando {fmtNum(Math.min(visible, filtered.length))} de {fmtNum(filtered.length)} movimientos
                    {hasFilters ? ` (${fmtNum(all.length)} en total)` : ""}. Abre la flecha de una fila para ver los
                    lotes que quedan.
                  </p>
                  {filtered.length > visible && (
                    <div className="text-center">
                      <Button color="secondary" outline size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                        Mostrar {PAGE_SIZE} más
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="kdx-page kdx-embedded">
        {!compact && (
          <div className="mb-2">
            <CardTitle tag="h5">{title}</CardTitle>
            {subtitle && <p className="rpt-subtitle">{subtitle}</p>}
          </div>
        )}
        {body}
      </div>
    );
  }

  return (
    <div className="content kdx-page">
      <Card className="kdx-card">
        <CardHeader>
          <CardTitle tag="h4">{title}</CardTitle>
          {subtitle && <p className="rpt-subtitle">{subtitle}</p>}
        </CardHeader>
        <CardBody>{body}</CardBody>
      </Card>
    </div>
  );
}

export default KardexPanel;
