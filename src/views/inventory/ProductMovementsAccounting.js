import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Col, Input, Row, Spinner } from "reactstrap";
import { ColorSelector, ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getColors } from "services/colorService";
import { getProducts } from "services/productService";
import {
  getProductMovementsAccounting,
  getProductMovementsAccountingLocations,
  getProductMovementsAccountingStocks,
} from "services/productMovementsAccountingService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  toExistingProductInventoryPrintLines,
  buildProductInventoryExistingPrintHtml,
  openProductInventoryExistingPrintWindow,
  exportExistingProductInventoryExcel,
} from "utils/productInventoryExistingPrintHtml";
import {
  movementDelta,
  PRODUCT_MOVEMENT_TYPE_LABELS,
  productMovementTypeLabel,
  productMovementTypeTone,
  sortedNonZeroSizeEntries,
} from "utils/productMovementHelper";
import "views/kiosks/KioskLedgerLab.css";
import "views/accounting/KioskMovementsAccounting.css";

const MOVEMENT_TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos", searchText: "todos" },
  ...Object.entries(PRODUCT_MOVEMENT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
    searchText: label,
  })),
];

const INITIAL_FILTERS = {
  locationId: "",
  productId: "",
  colorId: "",
  type: "",
  from: "",
  to: "",
  referenceTerm: "",
  sizeLabel: "",
};

function sizesSummary(stock) {
  if (stock?.sizes && typeof stock.sizes === "object") {
    return (
      Object.entries(stock.sizes)
        .filter(([, v]) => Number(v) !== 0)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ") || "—"
    );
  }
  return "—";
}

function FieldLabel({ children }) {
  return <span className="kll-label">{children}</span>;
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="kll-empty">
      <div className="kll-empty-icon"><i className={`nc-icon ${icon}`} /></div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function isDevolucionesLocation(loc) {
  const hay = `${loc?.code || ""} ${loc?.name || ""}`.toUpperCase();
  return hay.includes("DEVOLUC");
}

export default function ProductMovementsAccounting() {
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [stocks, setStocks] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selectedStockId, setSelectedStockId] = useState(null);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [printingInventory, setPrintingInventory] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const movementsRequestIdRef = useRef(0);

  useEffect(() => {
    getProductMovementsAccountingLocations()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setLocations(list);
        try {
          const params = new URLSearchParams(window.location.search || "");
          const category = String(params.get("category") || "").trim().toUpperCase();
          if (category.includes("DEVOLUC")) {
            const match = list.find(isDevolucionesLocation);
            if (match?.id != null) {
              const locationId = String(match.id);
              setFilters((prev) => ({ ...prev, locationId }));
              setLoadingStocks(true);
              setLoadingMovements(true);
              Promise.all([
                getProductMovementsAccountingStocks({ locationId }),
                getProductMovementsAccounting({ locationId }),
              ])
                .then(([stockRows, movementRows]) => {
                  setStocks(Array.isArray(stockRows) ? stockRows : []);
                  setMovements(Array.isArray(movementRows) ? movementRows : []);
                })
                .catch((err) => {
                  showError(err.message || "Error al cargar inventario de Devoluciones.");
                  setStocks([]);
                  setMovements([]);
                })
                .finally(() => {
                  setLoadingStocks(false);
                  setLoadingMovements(false);
                });
            }
          }
        } catch (_err) {
          // ignore
        }
      })
      .catch((err) => showError(err.message || "No se pudieron cargar las bodegas."));
    getProducts()
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
    getColors()
      .then((data) => setColors(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const locationOptions = useMemo(() => {
    const opts = (locations || []).map((loc) => ({
      value: String(loc.id),
      label: `${loc.code || ""} · ${loc.name || ""}`.trim(),
      searchText: `${loc.code || ""} ${loc.name || ""}`,
    }));
    return [{ value: "", label: "Selecciona bodega…", searchText: "bodega" }, ...opts];
  }, [locations]);

  const setFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const loadStocks = useCallback(async () => {
    if (!filters.locationId) {
      setStocks([]);
      return;
    }
    setLoadingStocks(true);
    try {
      const data = await getProductMovementsAccountingStocks({
        locationId: filters.locationId,
        productId: filters.productId || undefined,
        colorId: filters.colorId || undefined,
      });
      setStocks(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err.message || "Error al cargar inventario.");
      setStocks([]);
    } finally {
      setLoadingStocks(false);
    }
  }, [filters.locationId, filters.productId, filters.colorId]);

  const loadMovements = useCallback(
    async (opts = {}) => {
      const stockId =
        opts.stockId !== undefined ? opts.stockId : selectedStockId;
      const resolvedStockId = stockId != null && stockId !== "" ? stockId : null;

      if (!filters.locationId && !resolvedStockId) {
        setMovements([]);
        return;
      }

      const requestId = ++movementsRequestIdRef.current;
      setLoadingMovements(true);
      try {
        const data = await getProductMovementsAccounting({
          locationId: resolvedStockId ? undefined : filters.locationId || undefined,
          stockId: resolvedStockId || undefined,
          productId: resolvedStockId ? undefined : filters.productId || undefined,
          colorId: resolvedStockId ? undefined : filters.colorId || undefined,
          type: filters.type || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          referenceTerm: filters.referenceTerm || undefined,
          sizeLabel: filters.sizeLabel || undefined,
        });
        if (requestId !== movementsRequestIdRef.current) return;
        let rows = Array.isArray(data) ? data : [];
        if (resolvedStockId) {
          rows = rows.filter((m) => String(m.stockId) === String(resolvedStockId));
        }
        setMovements(rows);
      } catch (err) {
        if (requestId !== movementsRequestIdRef.current) return;
        showError(err.message || "Error al cargar movimientos.");
        setMovements([]);
      } finally {
        if (requestId === movementsRequestIdRef.current) {
          setLoadingMovements(false);
        }
      }
    },
    [filters, selectedStockId]
  );

  const handleConsultar = async () => {
    if (!filters.locationId) {
      showError("Selecciona una bodega.");
      return;
    }
    setSelectedStockId(null);
    await loadStocks();
    await loadMovements({ stockId: null });
  };

  const handleClear = () => {
    setFilters(INITIAL_FILTERS);
    setStocks([]);
    setMovements([]);
    setSelectedStockId(null);
  };

  const selectedLocation = useMemo(
    () => locations.find((loc) => String(loc.id) === String(filters.locationId)) || null,
    [locations, filters.locationId]
  );

  const loadExistingInventoryLines = async () => {
    if (!filters.locationId) {
      showError("Selecciona Bodega PT o Devoluciones.");
      return null;
    }
    const data = await getProductMovementsAccountingStocks({
      locationId: filters.locationId,
    });
    const warehouseName = selectedLocation?.name || selectedLocation?.code || "Bodega";
    const printLines = toExistingProductInventoryPrintLines(data, selectedLocation);
    if (!printLines.length) {
      showError("No hay productos existentes (con stock) en esta bodega.");
      return null;
    }
    return { printLines, warehouseName };
  };

  const handlePrintExistingInventory = async () => {
    setPrintingInventory(true);
    try {
      const packed = await loadExistingInventoryLines();
      if (!packed) return;
      const html = buildProductInventoryExistingPrintHtml(packed.printLines, {
        title: `Inventario existente — ${packed.warehouseName}`,
      });
      if (!openProductInventoryExistingPrintWindow(html)) {
        showError("Permite ventanas emergentes para ver el PDF.");
        return;
      }
      showSuccess("PDF listo para imprimir o guardar.");
    } catch (err) {
      showError(err.message || "No se pudo generar el PDF.");
    } finally {
      setPrintingInventory(false);
    }
  };

  const handleExcelExistingInventory = async () => {
    setExportingExcel(true);
    try {
      const packed = await loadExistingInventoryLines();
      if (!packed) return;
      exportExistingProductInventoryExcel(packed.printLines, {
        title: packed.warehouseName,
      });
      showSuccess("Excel descargado.");
    } catch (err) {
      showError(err.message || "No se pudo descargar el Excel.");
    } finally {
      setExportingExcel(false);
    }
  };

  const selectedStock = useMemo(
    () => stocks.find((s) => String(s.id) === String(selectedStockId)) || null,
    [stocks, selectedStockId]
  );

  const busy = loadingStocks || loadingMovements;
  const exporting = printingInventory || exportingExcel;
  const movementTotals = useMemo(() => {
    let entran = 0;
    let salen = 0;
    movements.forEach((m) => {
      const d = movementDelta(m.quantityBefore, m.quantityAfter);
      if (d == null) return;
      if (d > 0) entran += d;
      else salen += -d;
    });
    return { entran, salen };
  }, [movements]);
  const hasAnyFilter = Boolean(
    filters.locationId || filters.productId || filters.colorId || filters.type
    || filters.from || filters.to || filters.referenceTerm || filters.sizeLabel
  );
  const consultOnEnter = (e) => {
    if (e.key === "Enter" && !busy) {
      e.preventDefault();
      void handleConsultar();
    }
  };
  const clearSelectedStock = () => {
    setSelectedStockId(null);
    loadMovements({ stockId: null });
  };
  const selectedSizeEntries = sortedNonZeroSizeEntries(selectedStock?.sizes);

  return (
    <div className="content kll kma">
      {/* ───────── Encabezado ───────── */}
      <div className="kll-head">
        <div className="kll-title">
          <div className="kll-title-icon"><i className="nc-icon nc-box" /></div>
          <div>
            <h4>
              Inventario Productos
              <span className="kma-readonly">solo consulta</span>
            </h4>
            <small>Kardex de Bodega PT y Devoluciones por producto, color y talla</small>
          </div>
        </div>
        <div className="kll-head-actions">
          <Button
            color="secondary"
            outline
            size="sm"
            onClick={() => {
              loadStocks();
              loadMovements();
            }}
            disabled={!filters.locationId || busy}
          >
            <i className="nc-icon nc-refresh-69 mr-1" /> Refrescar
          </Button>
          <Button
            color="secondary"
            outline
            size="sm"
            onClick={() => void handlePrintExistingInventory()}
            disabled={!filters.locationId || exporting}
            title="Abre el PDF del inventario existente para imprimir o guardar"
          >
            {printingInventory ? <><Spinner size="sm" className="mr-1" /> PDF...</> : <><i className="nc-icon nc-paper mr-1" /> PDF</>}
          </Button>
          <Button
            color="success"
            size="sm"
            onClick={() => void handleExcelExistingInventory()}
            disabled={!filters.locationId || exporting}
            title="Descarga el inventario existente en Excel"
          >
            {exportingExcel ? <><Spinner size="sm" className="mr-1" /> Excel...</> : <><i className="nc-icon nc-cloud-download-93 mr-1" /> Excel</>}
          </Button>
        </div>
      </div>

      <div className="kma-note">
        <i className="nc-icon nc-alert-circle-i" aria-hidden="true" />
        <div>
          Elige <b>Bodega PT</b> o <b>Devoluciones</b>, filtra y haz clic en una fila de inventario para ver su
          kardex. PDF y Excel exportan el inventario existente (con stock) de la bodega elegida.
        </div>
      </div>

      {/* ───────── Filtros ───────── */}
      <div className="kll-card">
        <div className="kll-filters">
          <Row className="align-items-end">
            <Col lg={4} md={12} className="mb-2">
              <FieldLabel>Bodega</FieldLabel>
              <FilterableSelect
                options={locationOptions}
                value={String(filters.locationId)}
                onChange={(v) => {
                  setFilter("locationId", v || "");
                  setSelectedStockId(null);
                  setStocks([]);
                  setMovements([]);
                }}
                placeholder="Selecciona bodega…"
              />
            </Col>
            <Col lg={4} md={6} className="mb-2">
              <FieldLabel>Producto</FieldLabel>
              <ProductSelector
                products={products}
                value={filters.productId || null}
                onChange={(product) => {
                  setFilter("productId", product?.id != null ? String(product.id) : "");
                  setSelectedStockId(null);
                }}
                placeholder="Buscar producto…"
              />
            </Col>
            <Col lg={4} md={6} className="mb-2">
              <FieldLabel>Color</FieldLabel>
              <ColorSelector
                colors={colors}
                value={filters.colorId || null}
                onChange={(color) => {
                  setFilter("colorId", color?.id != null ? String(color.id) : "");
                  setSelectedStockId(null);
                }}
                placeholder="Buscar color…"
              />
            </Col>
          </Row>
          <Row className="align-items-end">
            <Col lg={3} md={6} className="mb-2">
              <FieldLabel>Tipo de movimiento</FieldLabel>
              <FilterableSelect
                options={MOVEMENT_TYPE_OPTIONS}
                value={filters.type}
                onChange={(v) => setFilter("type", v)}
                placeholder="Tipo…"
              />
            </Col>
            <Col lg={2} md={3} xs={6} className="mb-2">
              <FieldLabel>Desde</FieldLabel>
              <Input
                type="date"
                bsSize="sm"
                value={filters.from}
                onChange={(e) => setFilter("from", e.target.value)}
              />
            </Col>
            <Col lg={2} md={3} xs={6} className="mb-2">
              <FieldLabel>Hasta</FieldLabel>
              <Input
                type="date"
                bsSize="sm"
                value={filters.to}
                onChange={(e) => setFilter("to", e.target.value)}
              />
            </Col>
            <Col lg={3} md={8} className="mb-2">
              <FieldLabel>Referencia / número</FieldLabel>
              <Input
                type="text"
                bsSize="sm"
                placeholder="OP, envío, venta…"
                value={filters.referenceTerm}
                onChange={(e) => setFilter("referenceTerm", e.target.value)}
                onKeyDown={consultOnEnter}
              />
            </Col>
            <Col lg={2} md={4} className="mb-2">
              <FieldLabel>Talla</FieldLabel>
              <Input
                type="text"
                bsSize="sm"
                placeholder="Ej. 32"
                value={filters.sizeLabel}
                onChange={(e) => setFilter("sizeLabel", e.target.value)}
                onKeyDown={consultOnEnter}
              />
            </Col>
          </Row>

          <div className="kll-filter-foot kma-filter-foot">
            <div className="kma-filter-actions">
              <Button color="primary" size="sm" onClick={handleConsultar} disabled={busy}>
                {busy ? <Spinner size="sm" /> : <><i className="nc-icon nc-zoom-split mr-1" /> Consultar</>}
              </Button>
              {hasAnyFilter && (
                <button type="button" className="kll-link" onClick={handleClear}>
                  Limpiar filtros
                </button>
              )}
            </div>
            <span className="kll-muted kma-hint">Enter en referencia o talla también consulta</span>
          </div>
        </div>
      </div>

      <Row>
        {/* ───────── Inventario ───────── */}
        <Col xl={4} lg={5}>
          <div className="kll-card">
            <div className="kll-card-head">
              <div className="kll-card-title">
                Inventario <span className="kll-count">{stocks.length}</span>
                {selectedLocation && (
                  <span className="kll-sub">{selectedLocation.name || selectedLocation.code}</span>
                )}
              </div>
              {loadingStocks && <Spinner size="sm" color="primary" />}
            </div>

            {selectedStock && (
              <div className="kll-para-panel kma-selected">
                <div className="kll-para-head">
                  <div>
                    <div className="kll-para-name">{selectedStock.productCode}</div>
                    <div className="kll-para-meta">
                      <span>{selectedStock.productName}</span>
                      <span>· {selectedStock.colorName || "sin color"}</span>
                    </div>
                  </div>
                  <div className="kma-stock-now">
                    <span className="kll-label">Stock actual</span>
                    <b>{selectedStock.quantity}</b>
                    {selectedStock.min != null && (
                      <small className="kll-muted">Mín. {selectedStock.min}</small>
                    )}
                  </div>
                </div>
                {selectedSizeEntries.length > 0 ? (
                  <div className="kll-size-chips">
                    {selectedSizeEntries.map(([k, v]) => (
                      <span key={k} className={`kll-size-chip kma-static${Number(v) < 0 ? " kma-neg" : ""}`}>
                        <b>{k}</b>
                        <span>×{v}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="kll-muted">Tallas: {sizesSummary(selectedStock)}</span>
                )}
              </div>
            )}

            <div className={`kll-scroll stocks${loadingStocks ? " kll-loading" : ""}`}>
              <table className="kll-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Color</th>
                    <th className="num">Cant.</th>
                    <th>Tallas</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => {
                    const qty = Number(s.quantity);
                    const sizeEntries = sortedNonZeroSizeEntries(s.sizes);
                    return (
                      <tr
                        key={s.id}
                        className={`clickable${String(selectedStockId) === String(s.id) ? " selected" : ""}`}
                        onClick={() => {
                          setSelectedStockId(s.id);
                          loadMovements({ stockId: s.id });
                        }}
                      >
                        <td>
                          <div className="kll-prod">{s.productCode}</div>
                          <div className="kll-prod-sub" title={s.productName}>{s.productName}</div>
                        </td>
                        <td>{s.colorName || <span className="kll-muted">—</span>}</td>
                        <td className="num">
                          <span className={`kll-qty${qty === 0 ? " zero" : ""}${qty < 0 ? " neg" : ""}`}>
                            {s.quantity}
                          </span>
                        </td>
                        <td>
                          {sizeEntries.length > 0 ? (
                            <div className="kll-mini-sizes" title={sizesSummary(s)}>
                              {sizeEntries.slice(0, 6).map(([k, v]) => (
                                <span key={k} className={Number(v) < 0 ? "kma-neg" : undefined}><b>{k}</b>×{v}</span>
                              ))}
                              {sizeEntries.length > 6 && <em>+{sizeEntries.length - 6}</em>}
                            </div>
                          ) : (
                            <span className="kll-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loadingStocks && stocks.length === 0 && (
                <EmptyState
                  icon="nc-tag"
                  title={filters.locationId ? "Sin filas" : "Elige una bodega"}
                  text={filters.locationId
                    ? "Pulsa Consultar para cargar el inventario."
                    : "Selecciona Bodega PT o Devoluciones para ver su inventario."}
                />
              )}
            </div>
          </div>
        </Col>

        {/* ───────── Movimientos ───────── */}
        <Col xl={8} lg={7}>
          <div className="kll-card">
            <div className="kll-card-head">
              <div className="kll-card-title">
                Movimientos <span className="kll-count">{movements.length}</span>
                {selectedStock ? (
                  <span className="kll-scope">
                    {selectedStock.productCode} / {selectedStock.colorName || "sin color"}
                    <button
                      type="button"
                      title="Ver toda la bodega"
                      aria-label="Quitar el producto seleccionado"
                      onClick={clearSelectedStock}
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  filters.locationId && <span className="kll-sub">bodega completa · filtra o elige un producto</span>
                )}
              </div>
              <div className="kma-head-right">
                {(movementTotals.entran > 0 || movementTotals.salen > 0) && (
                  <span className="kma-totals" title="Unidades según stock antes → después">
                    {movementTotals.entran > 0 && <span className="kll-delta up">+{movementTotals.entran}</span>}
                    {movementTotals.salen > 0 && <span className="kll-delta down">−{movementTotals.salen}</span>}
                  </span>
                )}
                {loadingMovements && <Spinner size="sm" color="primary" />}
              </div>
            </div>

            <div className={`kll-scroll moves${loadingMovements ? " kll-loading" : ""}`}>
              <table className="kll-table kma-moves">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th className="num">Cant.</th>
                    <th>Stock</th>
                    <th>Talla</th>
                    <th>Referencia</th>
                    <th>Descripción</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const type = m.movementType || "";
                    const stockDelta = movementDelta(m.quantityBefore, m.quantityAfter);
                    const hasSizeFlow = m.sizeLabel && (m.sizeStockBefore != null || m.sizeStockAfter != null);
                    return (
                      <tr key={m.id}>
                        <td className="kma-date">
                          <div>{formatDateTimeGt(m.movementDate || m.createdAt)}</div>
                          <div className="kll-muted kll-mono">#{m.id}</div>
                        </td>
                        <td>
                          <span className={`kma-type ${productMovementTypeTone(type)}`} title={type || undefined}>
                            {productMovementTypeLabel(type)}
                          </span>
                        </td>
                        <td className="num"><b>{m.quantity ?? "—"}</b></td>
                        <td>
                          <span className="kll-flow">
                            {m.quantityBefore ?? "—"}
                            <span className="arrow">→</span>
                            <b>{m.quantityAfter ?? "—"}</b>
                            {stockDelta != null && (
                              <span className={`kll-delta ${stockDelta > 0 ? "up" : stockDelta < 0 ? "down" : "flat"}`}>
                                {stockDelta > 0 ? `+${stockDelta}` : stockDelta}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          {m.sizeLabel ? (
                            <>
                              <span className="kll-size-tag">{m.sizeLabel}</span>
                              {hasSizeFlow && (
                                <div className="kll-flow kll-muted kma-size-flow">
                                  {m.sizeStockBefore ?? "—"}
                                  <span className="arrow">→</span>
                                  {m.sizeStockAfter ?? "—"}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="kll-muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="kll-ref">
                            {m.referenceNumber || (m.referenceId != null ? `#${m.referenceId}` : <span className="kll-muted">—</span>)}
                          </div>
                          {m.referenceType && <span className="kll-ref-type">{m.referenceType}</span>}
                        </td>
                        <td>
                          <div className="kll-reason" title={m.description || ""}>{m.description || "—"}</div>
                        </td>
                        <td>{m.username || <span className="kll-muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!loadingMovements && movements.length === 0 && (
                <EmptyState
                  icon="nc-paper"
                  title="Sin movimientos"
                  text={filters.locationId
                    ? "Consulta o selecciona un producto/color a la izquierda."
                    : "Selecciona una bodega para comenzar."}
                />
              )}
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
