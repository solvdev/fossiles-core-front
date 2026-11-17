import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Spinner } from "reactstrap";
import Select from "react-select";
import KardexTable from "components/kardex/KardexTable";
import { getProductKardexHistoricoFilters, searchProductKardexHistorico } from "services/productInventoryService";
import { getProducts } from "services/productService";
import { getLocations } from "services/locationService";
import { exportKardexExcel } from "utils/kardexExport";
import { fmtNum, movementLabel, normalizeKardexRows, summarizeKardex } from "utils/kardexModel";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError } from "utils/notificationHelper";
import "views/reports/reportsDesign.css";
import "components/kardex/kardexDesign.css";

const PAGE_SIZE = 50;

const EMPTY_FILTERS = {
  archiveReference: "",
  locationId: "",
  productId: "",
  movementType: "",
  from: "",
  to: "",
  reference: "",
};

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

/**
 * Kardex histórico de producto: movimientos archivados al limpiar el inventario de bodega.
 * Solo consulta; ya no cuentan en los saldos actuales. Se ve igual que los otros kardex.
 */
function ProductKardexHistorico() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [archives, setArchives] = useState([]);
  const [movementTypes, setMovementTypes] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [filterData, productList, locationList] = await Promise.all([
          getProductKardexHistoricoFilters(),
          getProducts().catch(() => []),
          getLocations().catch(() => []),
        ]);
        setArchives(filterData?.archives || []);
        setMovementTypes(filterData?.movementTypes || []);
        setProducts(Array.isArray(productList) ? productList : []);
        setLocations(Array.isArray(locationList) ? locationList : []);
      } catch (err) {
        showError(err.message || "No se pudieron cargar los filtros del kardex histórico.");
      }
    })();
  }, []);

  const load = useCallback(async (activeFilters, pageNumber) => {
    try {
      setLoading(true);
      setError("");
      setResult(await searchProductKardexHistorico({ ...activeFilters, page: pageNumber, size: PAGE_SIZE }));
    } catch (err) {
      setError(err.message || "No se pudo consultar el kardex histórico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(applied, page);
  }, [applied, page, load]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const applyFilters = () => {
    setPage(0);
    setApplied({ ...filters });
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(0);
    setApplied(EMPTY_FILTERS);
  };

  const rows = useMemo(() => normalizeKardexRows(result?.content || []), [result]);
  const pageSummary = useMemo(() => summarizeKardex(rows), [rows]);
  const totalPages = result?.totalPages || 0;
  const lastArchive = useMemo(
    () => archives.reduce((a, b) => (!a || String(b.archivedAt) > String(a.archivedAt) ? b : a), null),
    [archives]
  );
  const hasFilters = Object.values(applied).some(Boolean);

  const productOptions = useMemo(
    () => products.map((p) => ({ value: String(p.id), label: `${p.code || ""} — ${p.name || ""}`.replace(/^ — /, "") })),
    [products]
  );
  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: String(l.id), label: l.name || l.code })),
    [locations]
  );

  const exportPage = () => {
    if (!rows.length) {
      showError("No hay movimientos para exportar.");
      return;
    }
    try {
      exportKardexExcel({
        fileName: "kardex_historico",
        title: "Kardex histórico de producto terminado",
        rows,
        filtersLabel: `Página ${page + 1} de ${Math.max(totalPages, 1)}${hasFilters ? "  ·  Con filtros" : ""}`,
        showItem: true,
        itemLabel: "Producto",
        showColor: true,
        showLocation: true,
        showValue: false,
      });
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel.");
    }
  };

  return (
    <div className="content kdx-page">
      <Card className="kdx-card">
        <CardHeader>
          <div className="d-flex justify-content-between align-items-start flex-wrap" style={{ gap: 12 }}>
            <div>
              <CardTitle tag="h4">Kardex histórico de producto terminado</CardTitle>
              <p className="rpt-subtitle">
                Movimientos archivados al limpiar el inventario de bodega. Solo consulta: ya no cuentan en los
                saldos actuales.
              </p>
            </div>
            <Button color="success" size="sm" onClick={exportPage} disabled={!rows.length}>
              <i className="nc-icon nc-cloud-download-93 mr-1" />
              Excel (esta página)
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <div className="rpt-tiles rpt-tiles--4">
            <div className="rpt-tile is-static" style={{ borderLeftColor: "#1f2937" }}>
              <span className="rpt-tile-label" style={{ color: "#1f2937" }}>
                Movimientos archivados
              </span>
              <span className="rpt-tile-value">{result ? fmtNum(result.totalElements) : "–"}</span>
              <span className="rpt-tile-hint">{hasFilters ? "Con los filtros aplicados" : "En todas las limpiezas"}</span>
            </div>
            <div className="rpt-tile is-static" style={{ borderLeftColor: "#6b7280" }}>
              <span className="rpt-tile-label" style={{ color: "#4b5563" }}>
                Limpiezas
              </span>
              <span className="rpt-tile-value">{fmtNum(archives.length)}</span>
              <span className="rpt-tile-hint">
                {lastArchive ? `La última: ${formatDateTimeGt(lastArchive.archivedAt)}` : "Todavía no hay"}
              </span>
            </div>
            <div className="rpt-tile is-static" style={{ borderLeftColor: "#047857" }}>
              <span className="rpt-tile-label" style={{ color: "#047857" }}>
                Entradas en esta página
              </span>
              <span className="rpt-tile-value">+{fmtNum(pageSummary.totalIn)}</span>
              <span className="rpt-tile-hint">Unidades</span>
            </div>
            <div className="rpt-tile is-static" style={{ borderLeftColor: "#b91c1c" }}>
              <span className="rpt-tile-label" style={{ color: "#b91c1c" }}>
                Salidas en esta página
              </span>
              <span className="rpt-tile-value">−{fmtNum(pageSummary.totalOut)}</span>
              <span className="rpt-tile-hint">Unidades</span>
            </div>
          </div>

          <div className="kdx-filters">
            <div className="kdx-field">
              <label htmlFor="kh-archive">Limpieza</label>
              <select id="kh-archive" value={filters.archiveReference} onChange={(e) => setFilter("archiveReference", e.target.value)}>
                <option value="">Todas</option>
                {archives.map((a) => (
                  <option key={a.archiveReference} value={a.archiveReference}>
                    {a.archiveReference} · {fmtNum(a.movements)} mov.
                  </option>
                ))}
              </select>
            </div>
            <div className="kdx-field kdx-grow">
              <label htmlFor="kh-location">Ubicación</label>
              <Select
                inputId="kh-location"
                isClearable
                isSearchable
                placeholder="Todas las ubicaciones"
                options={locationOptions}
                value={locationOptions.find((o) => o.value === String(filters.locationId)) || null}
                onChange={(o) => setFilter("locationId", o ? o.value : "")}
                styles={selectStyles}
              />
            </div>
            <div className="kdx-field kdx-grow">
              <label htmlFor="kh-product">Producto</label>
              <Select
                inputId="kh-product"
                isClearable
                isSearchable
                placeholder="Todos los productos"
                options={productOptions}
                value={productOptions.find((o) => o.value === String(filters.productId)) || null}
                onChange={(o) => setFilter("productId", o ? o.value : "")}
                styles={selectStyles}
              />
            </div>
          </div>
          <div className="kdx-filters">
            <div className="kdx-field">
              <label htmlFor="kh-type">Tipo de movimiento</label>
              <select id="kh-type" value={filters.movementType} onChange={(e) => setFilter("movementType", e.target.value)}>
                <option value="">Todos</option>
                {movementTypes.map((t) => (
                  <option key={t} value={t}>
                    {movementLabel(t)}
                  </option>
                ))}
              </select>
            </div>
            <div className="kdx-field">
              <label htmlFor="kh-from">Desde</label>
              <input id="kh-from" type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
            </div>
            <div className="kdx-field">
              <label htmlFor="kh-to">Hasta</label>
              <input id="kh-to" type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
            </div>
            <div className="kdx-field kdx-grow">
              <label htmlFor="kh-ref">Documento o referencia</label>
              <input
                id="kh-ref"
                type="text"
                placeholder="Ej: ENV-00529"
                value={filters.reference}
                onChange={(e) => setFilter("reference", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
              />
            </div>
            <Button color="primary" className="mb-1" onClick={applyFilters} disabled={loading}>
              Buscar
            </Button>
            {(hasFilters || Object.values(filters).some(Boolean)) && (
              <Button color="link" className="rpt-clear mb-2" onClick={clearFilters} disabled={loading}>
                Quitar filtros
              </Button>
            )}
          </div>

          {error && (
            <Alert color="danger" className="d-flex justify-content-between align-items-center">
              <span>{error}</span>
              <Button size="sm" color="danger" outline onClick={() => load(applied, page)}>
                Reintentar
              </Button>
            </Alert>
          )}

          {!error && loading && !result ? (
            <div className="rpt-empty">
              <Spinner /> <div className="mt-2">Cargando movimientos…</div>
            </div>
          ) : !error && !rows.length ? (
            <div className="rpt-empty">
              {archives.length === 0 ? "Todavía no hay movimientos archivados." : "No hay movimientos con estos filtros."}
            </div>
          ) : !error ? (
            <>
              <KardexTable
                rows={rows}
                showItem
                itemKind="product"
                showName
                showLocation
                showValue={false}
                dim={loading}
              />
              <div className="d-flex justify-content-between align-items-center flex-wrap mt-2" style={{ gap: 8 }}>
                <span className="rpt-hint mb-0" aria-live="polite">
                  Página {page + 1} de {Math.max(totalPages, 1)} · {fmtNum(result?.totalElements || 0)} movimientos
                </span>
                <div>
                  <Button size="sm" color="secondary" outline className="mr-2" disabled={loading || page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>
                    Anterior
                  </Button>
                  <Button size="sm" color="secondary" outline disabled={loading || page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Siguiente
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

export default ProductKardexHistorico;
