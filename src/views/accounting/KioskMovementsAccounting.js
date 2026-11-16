import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Col, Input, Row, Spinner } from "reactstrap";
import { ColorSelector, ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getColors } from "services/colorService";
import { getLocations } from "services/locationService";
import { getProducts } from "services/productService";
import {
  getKioskMovementsAccounting,
  getKioskMovementsAccountingStocks,
  ledgerLabUpdateMovement,
} from "services/kioscoInventoryService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  accountingMovementToLabUpdate,
  canEditKioskLedger,
  getKioscoMovementTypeLabel,
  KIOSCO_MOVEMENT_TYPE_LABELS,
  KIOSCO_MOVEMENT_TYPE_TONE,
  normalizeKioscoMovementType,
} from "utils/kioskMovementHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { useAuth } from "contexts/AuthContext";
import { PRODUCT_BRAND_OPTIONS } from "utils/productBrandHelper";
import { isEntreCuerosLocation } from "utils/kioskStockDimensionHelper";
import {
  extractStockBrand,
  isSyntheticHardware,
  normalizeCinchoAudience,
} from "utils/productCinchoHelper";
import { ProductBrandBadge, ProductBrandFilterChip } from "components/catalog/ProductBrandBadge";
import "views/kiosks/KioskLedgerLab.css";
import "./KioskMovementsAccounting.css";

function CardPaymentDetail({
  auth,
  last4,
  brand,
  voucherAmount,
  voucherDiff,
  auth2,
  last4_2,
  brand2,
  voucherAmount2,
  voucherDiff2,
}) {
  const hasCard1 = auth || last4 || brand || voucherAmount != null;
  const hasCard2 = auth2 || last4_2 || brand2 || voucherAmount2 != null;
  if (!hasCard1 && !hasCard2) return null;
  const fmt = (b, l, a, voucher, diff) => {
    const parts = [b, l ? `****${l}` : null, a ? `Auth: ${a}` : null];
    if (voucher != null && voucher !== "") {
      const v = Number(voucher);
      const d = diff != null ? Number(diff) : null;
      if (Number.isFinite(v)) {
        let voucherLabel = `Voucher Q${v.toFixed(2)}`;
        if (Number.isFinite(d) && Math.abs(d) > 0.009) {
          voucherLabel += ` (dif. ${d > 0 ? "+" : ""}Q${d.toFixed(2)})`;
        }
        parts.push(voucherLabel);
      }
    }
    return parts.filter(Boolean).join(" · ");
  };
  return (
    <div className="kma-card-detail">
      {hasCard1 && <div>{fmt(brand, last4, auth, voucherAmount, voucherDiff)}</div>}
      {hasCard2 && <div>{fmt(brand2, last4_2, auth2, voucherAmount2, voucherDiff2)}</div>}
    </div>
  );
}

const MOVEMENT_TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos", searchText: "todos" },
  ...Object.entries(KIOSCO_MOVEMENT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
    searchText: label,
  })),
];

function deltaOf(before, after) {
  if (before == null || after == null) return null;
  const b = Number(before);
  const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  return a - b;
}

function sortedSizeEntries(stock) {
  if (!stock?.tallas || typeof stock.tallas !== "object") return [];
  return Object.entries(stock.tallas)
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => Number(a[0]) - Number(b[0])
      || String(a[0]).localeCompare(String(b[0]), "es", { numeric: true }));
}

const formatMoney = (value) =>
  `Q ${Number(value).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

const INITIAL_FILTERS = {
  locationId: "",
  productId: "",
  colorId: "",
  type: "",
  from: "",
  to: "",
  referenceTerm: "",
  sizeKey: "",
};

const filtersFromSearch = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    locationId: params.get("locationId") || "",
    productId: params.get("productId") || "",
    colorId: params.get("colorId") || "",
    type: params.get("type") || "",
    from: params.get("from") || "",
    to: params.get("to") || "",
    referenceTerm: params.get("referenceTerm") || "",
    sizeKey: params.get("sizeKey") || "",
  };
};

function sizesSummary(stock) {
  if (stock?.tallas && typeof stock.tallas === "object") {
    return (
      Object.entries(stock.tallas)
        .filter(([, v]) => Number(v) > 0)
        .map(([k, v]) => `${k}:${v}`)
        .join(" ") || "—"
    );
  }
  return "—";
}

function stockMatchesVariantFilter(stock, filter) {
  if (!filter) return true;
  const herraje = stock?.herraje;
  if (filter === "NINO" || filter === "DAMA") {
    return normalizeCinchoAudience(herraje) === filter;
  }
  if (filter === "SINTETICO") return isSyntheticHardware(herraje);
  if (filter === "NONE") {
    return !extractStockBrand(herraje) && !normalizeCinchoAudience(herraje);
  }
  return extractStockBrand(herraje) === filter;
}

export default function KioskMovementsAccounting() {
  const { user } = useAuth();
  const canEdit = canEditKioskLedger(user?.username);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [filters, setFilters] = useState(filtersFromSearch);
  const [stocks, setStocks] = useState([]);
  const [movements, setMovements] = useState([]);
  const [selectedStockId, setSelectedStockId] = useState(null);
  const [variantFilter, setVariantFilter] = useState("");
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [savingTypeId, setSavingTypeId] = useState(null);
  const movementsRequestIdRef = useRef(0);
  const autoLoadedRef = useRef(false);

  useEffect(() => {
    getLocations()
      .then((data) => setLocations(Array.isArray(data) ? data : []))
      .catch(() => {});
    getProducts()
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => {});
    getColors()
      .then((data) => setColors(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const kioskOptions = useMemo(() => {
    const opts = (locations || [])
      .filter((location) => {
        const category = String(location?.categoria || "").toUpperCase();
        const name = String(location?.name || "").toUpperCase();
        const code = String(location?.code || "").toUpperCase();
        return category.includes("KIOS") || name.includes("KIOS") || code.startsWith("K") || code.startsWith("A");
      })
      .map((k) => ({
        value: String(k.id),
        label: `${k.code || ""} · ${k.name || ""}`.trim(),
        searchText: `${k.code || ""} ${k.name || ""}`,
      }));
    return [{ value: "", label: "Selecciona kiosko…", searchText: "kiosko" }, ...opts];
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
      const data = await getKioskMovementsAccountingStocks({
        locationId: filters.locationId,
        productId: filters.productId || undefined,
        colorId: filters.colorId || undefined,
      });
      setStocks(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err.message || "Error al cargar inventario del kiosko.");
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
        const data = await getKioskMovementsAccounting({
          locationId: resolvedStockId ? undefined : filters.locationId || undefined,
          stockId: resolvedStockId || undefined,
          productId: resolvedStockId ? undefined : filters.productId || undefined,
          colorId: resolvedStockId ? undefined : filters.colorId || undefined,
          type: filters.type || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          referenceTerm: filters.referenceTerm || undefined,
          sizeKey: filters.sizeKey || undefined,
        });
        if (requestId !== movementsRequestIdRef.current) return;
        let rows = Array.isArray(data) ? data : [];
        if (resolvedStockId) {
          rows = rows.filter((m) => String(m.kioscoStockId) === String(resolvedStockId));
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
      showError("Selecciona un kiosko.");
      return;
    }
    setSelectedStockId(null);
    await loadStocks();
    await loadMovements({ stockId: null });
  };

  const handleClear = () => {
    setFilters(INITIAL_FILTERS);
    setVariantFilter("");
    setStocks([]);
    setMovements([]);
    setSelectedStockId(null);
  };

  const handleTypeChange = async (movement, nextType) => {
    const current = normalizeKioscoMovementType(movement?.tipoMovimiento);
    if (!nextType || nextType === current) return;
    setSavingTypeId(movement.id);
    try {
      await ledgerLabUpdateMovement(movement.id, accountingMovementToLabUpdate(movement, nextType));
      showSuccess(`Movimiento #${movement.id} → ${getKioscoMovementTypeLabel(nextType)}. Stock recalculado.`);
      await loadMovements();
    } catch (err) {
      showError(err.message || "No se pudo cambiar el tipo.");
    } finally {
      setSavingTypeId(null);
    }
  };

  useEffect(() => {
    if (autoLoadedRef.current || !filters.locationId) return;
    autoLoadedRef.current = true;
    loadStocks();
    loadMovements({ stockId: null });
  }, [filters.locationId, loadStocks, loadMovements]);

  const entreCueros = useMemo(() => {
    if (isEntreCuerosLocation(filters.locationId)) return true;
    const loc = locations.find((l) => String(l.id) === String(filters.locationId));
    const hay = `${loc?.name || ""} ${loc?.code || ""}`.toUpperCase();
    return hay.includes("ENTRECUERO");
  }, [filters.locationId, locations]);

  const visibleStocks = useMemo(() => {
    if (!entreCueros || !variantFilter) return stocks;
    return stocks.filter((s) => stockMatchesVariantFilter(s, variantFilter));
  }, [stocks, entreCueros, variantFilter]);

  const variantFilterOptions = useMemo(() => {
    const presentBrands = new Set();
    let hasNino = false;
    let hasDama = false;
    let hasSynthetic = false;
    stocks.forEach((s) => {
      const brand = extractStockBrand(s.herraje);
      if (brand) presentBrands.add(brand);
      const audience = normalizeCinchoAudience(s.herraje);
      if (audience === "NINO") hasNino = true;
      if (audience === "DAMA") hasDama = true;
      if (isSyntheticHardware(s.herraje)) hasSynthetic = true;
    });
    const opts = [];
    PRODUCT_BRAND_OPTIONS.forEach((brand) => {
      if (presentBrands.has(brand)) opts.push({ value: brand, label: brand });
    });
    if (hasNino) opts.push({ value: "NINO", label: "Niño" });
    if (hasDama) opts.push({ value: "DAMA", label: "Dama" });
    if (hasSynthetic) opts.push({ value: "SINTETICO", label: "Sintética" });
    return opts;
  }, [stocks]);

  const selectedStock = useMemo(
    () => visibleStocks.find((s) => String(s.id) === String(selectedStockId)) || null,
    [visibleStocks, selectedStockId]
  );

  useEffect(() => {
    if (!selectedStockId) return;
    const stillVisible = visibleStocks.some((s) => String(s.id) === String(selectedStockId));
    if (!stillVisible) {
      setSelectedStockId(null);
      loadMovements({ stockId: null });
    }
  }, [visibleStocks, selectedStockId, loadMovements]);

  const busy = loadingStocks || loadingMovements;
  const movementTotals = useMemo(() => {
    let entran = 0;
    let salen = 0;
    movements.forEach((m) => {
      const d = deltaOf(m.stockAntes, m.stockDespues);
      if (d == null) return;
      if (d > 0) entran += d;
      else salen += -d;
    });
    return { entran, salen };
  }, [movements]);
  const hasAnyFilter = Boolean(
    filters.locationId || filters.productId || filters.colorId || filters.type
    || filters.from || filters.to || filters.referenceTerm || filters.sizeKey || variantFilter
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
  const selectedSizeEntries = sortedSizeEntries(selectedStock);

  return (
    <div className="content kll kma">
      {/* ───────── Encabezado ───────── */}
      <div className="kll-head">
        <div className="kll-title">
          <div className="kll-title-icon"><i className="nc-icon nc-paper" /></div>
          <div>
            <h4>
              Movimientos de Kioscos
              {canEdit ? (
                <span className="kll-lock">edición de tipo</span>
              ) : (
                <span className="kma-readonly">solo consulta</span>
              )}
            </h4>
            <small>Kardex por producto, color y talla</small>
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
        </div>
      </div>

      <div className="kma-note">
        <i className="nc-icon nc-alert-circle-i" aria-hidden="true" />
        <div>
          El ingreso de un cambio (con o sin diferencia) sale en <b>Compra</b> del conteo. El egreso va a{" "}
          <b>Venta</b> solo si hay diferencia a cobrar; sin diferencia o con saldo a favor del cliente, a{" "}
          <b>Salida</b>.
          {canEdit
            ? " El select de tipo guarda y recalcula stock."
            : " Solo lectura (pide corrección de tipo a quien edita el ledger)."}
        </div>
      </div>

      {/* ───────── Filtros ───────── */}
      <div className="kll-card">
        <div className="kll-filters">
          <Row className="align-items-end">
            <Col lg={4} md={12} className="mb-2">
              <FieldLabel>Kiosko</FieldLabel>
              <FilterableSelect
                options={kioskOptions}
                value={String(filters.locationId)}
                onChange={(v) => {
                  setFilter("locationId", v || "");
                  setSelectedStockId(null);
                  setVariantFilter("");
                  setStocks([]);
                  setMovements([]);
                }}
                placeholder="Selecciona kiosko…"
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
              <FieldLabel>Boleta / factura / venta</FieldLabel>
              <Input
                type="text"
                bsSize="sm"
                placeholder="Nº boleta, factura o venta…"
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
                value={filters.sizeKey}
                onChange={(e) => setFilter("sizeKey", e.target.value)}
                onKeyDown={consultOnEnter}
              />
            </Col>
          </Row>

          {entreCueros && stocks.length > 0 && variantFilterOptions.length > 0 && (
            <div className="kma-variants">
              <FieldLabel>Variante / marca</FieldLabel>
              <div className="d-flex flex-wrap" style={{ gap: 6 }}>
                <ProductBrandFilterChip
                  label="Todas"
                  active={!variantFilter}
                  onClick={() => setVariantFilter("")}
                />
                {variantFilterOptions.map((opt) => (
                  <ProductBrandFilterChip
                    key={opt.value}
                    value={opt.value}
                    label={opt.label}
                    active={variantFilter === opt.value}
                    onClick={() =>
                      setVariantFilter((prev) => (prev === opt.value ? "" : opt.value))
                    }
                  />
                ))}
              </div>
            </div>
          )}

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
            <span className="kll-muted kma-hint">Enter en boleta o talla también consulta</span>
          </div>
        </div>
      </div>

      <Row>
        {/* ───────── Inventario ───────── */}
        <Col xl={4} lg={5}>
          <div className="kll-card">
            <div className="kll-card-head">
              <div className="kll-card-title">
                Inventario{" "}
                <span className="kll-count">
                  {visibleStocks.length}
                  {variantFilter && visibleStocks.length !== stocks.length ? ` de ${stocks.length}` : ""}
                </span>
              </div>
              {loadingStocks && <Spinner size="sm" color="primary" />}
            </div>

            {selectedStock && (
              <div className="kll-para-panel kma-selected">
                <div className="kll-para-head">
                  <div>
                    <div className="kll-para-name">
                      {selectedStock.codigoProducto}
                      {" "}
                      <ProductBrandBadge value={selectedStock.herraje} entreCueros={entreCueros} />
                    </div>
                    <div className="kll-para-meta">
                      <span>{selectedStock.producto}</span>
                      <span>· {selectedStock.color || "sin color"}</span>
                    </div>
                  </div>
                  <div className="kma-stock-now">
                    <span className="kll-label">Stock actual</span>
                    <b>{selectedStock.cantidad}</b>
                    {selectedStock.minimo != null && (
                      <small className="kll-muted">Mín. {selectedStock.minimo}</small>
                    )}
                  </div>
                </div>
                {selectedSizeEntries.length > 0 ? (
                  <div className="kll-size-chips">
                    {selectedSizeEntries.map(([k, v]) => (
                      <span key={k} className="kll-size-chip kma-static">
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
                  {visibleStocks.map((s) => {
                    const qty = Number(s.cantidad);
                    const sizeEntries = sortedSizeEntries(s);
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
                          <div className="kll-prod">
                            {s.codigoProducto}
                            {" "}
                            <ProductBrandBadge value={s.herraje} entreCueros={entreCueros} />
                          </div>
                          <div className="kll-prod-sub" title={s.producto}>{s.producto}</div>
                        </td>
                        <td>{s.color || <span className="kll-muted">—</span>}</td>
                        <td className="num">
                          <span className={`kll-qty${qty === 0 ? " zero" : ""}${qty < 0 ? " neg" : ""}`}>
                            {s.cantidad}
                          </span>
                        </td>
                        <td>
                          {sizeEntries.length > 0 ? (
                            <div className="kll-mini-sizes" title={sizesSummary(s)}>
                              {sizeEntries.slice(0, 6).map(([k, v]) => (
                                <span key={k}><b>{k}</b>×{v}</span>
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
              {!loadingStocks && visibleStocks.length === 0 && (
                <EmptyState
                  icon="nc-tag"
                  title={filters.locationId ? "Sin filas" : "Elige un kiosko"}
                  text={filters.locationId
                    ? variantFilter
                      ? "Ninguna fila coincide con esa marca o variante."
                      : "Pulsa Consultar para cargar el inventario."
                    : "Selecciona un kiosko para ver su inventario."}
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
                    {selectedStock.codigoProducto} / {selectedStock.color || "sin color"}
                    <button
                      type="button"
                      title="Ver todo el kiosko"
                      aria-label="Quitar el producto seleccionado"
                      onClick={clearSelectedStock}
                    >
                      ×
                    </button>
                  </span>
                ) : (
                  filters.locationId && <span className="kll-sub">kiosko completo · filtra o elige un producto</span>
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
                    <th>Ref. / boleta / factura</th>
                    <th className="num">Total</th>
                    <th>Pago</th>
                    <th>Motivo</th>
                    <th>Usuario</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => {
                    const type = normalizeKioscoMovementType(m.tipoMovimiento);
                    const tone = KIOSCO_MOVEMENT_TYPE_TONE[type] || "adj";
                    const stockDelta = deltaOf(m.stockAntes, m.stockDespues);
                    const hasSizeFlow = m.talla && (m.stockAntesTalla != null || m.stockDespuesTalla != null);
                    const refMain = m.resumenReferencia || m.numeroInternoFactura || m.boletaFisica || m.referencia;
                    return (
                      <tr key={m.id}>
                        <td className="kma-date">
                          <div>{formatDateTimeGt(m.fecha)}</div>
                          <div className="kll-muted kll-mono">#{m.id}</div>
                        </td>
                        <td>
                          {canEdit ? (
                            <span className={`kll-type ${tone}`}>
                              <select
                                value={type}
                                disabled={savingTypeId === m.id}
                                onChange={(e) => void handleTypeChange(m, e.target.value)}
                                aria-label={`Tipo del movimiento ${m.id}`}
                              >
                                {Object.entries(KIOSCO_MOVEMENT_TYPE_LABELS).map(([value, label]) => (
                                  <option key={value} value={value}>{label}</option>
                                ))}
                              </select>
                            </span>
                          ) : (
                            <span className={`kma-type ${tone}`}>
                              {getKioscoMovementTypeLabel(m.tipoMovimiento, {
                                stockBefore: m.stockAntes,
                                stockAfter: m.stockDespues,
                              })}
                            </span>
                          )}
                        </td>
                        <td className="num"><b>{m.cantidad ?? "—"}</b></td>
                        <td>
                          <span className="kll-flow">
                            {m.stockAntes ?? "—"}
                            <span className="arrow">→</span>
                            <b>{m.stockDespues ?? "—"}</b>
                            {stockDelta != null && (
                              <span className={`kll-delta ${stockDelta > 0 ? "up" : stockDelta < 0 ? "down" : "flat"}`}>
                                {stockDelta > 0 ? `+${stockDelta}` : stockDelta}
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          {m.talla ? (
                            <>
                              <span className="kll-size-tag">{m.talla}</span>
                              {hasSizeFlow && (
                                <div className="kll-flow kll-muted kma-size-flow">
                                  {m.stockAntesTalla ?? "—"}
                                  <span className="arrow">→</span>
                                  {m.stockDespuesTalla ?? "—"}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="kll-muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="kll-ref">{refMain || <span className="kll-muted">—</span>}</div>
                          {m.numeroInternoFactura && m.numeroInternoFactura !== refMain && (
                            <div className="kll-mono kma-invoice">{m.numeroInternoFactura}</div>
                          )}
                          <div className="kma-ref-tags">
                            {m.boletaFisica && <span className="kll-ref-type">Boleta {m.boletaFisica}</span>}
                            {m.tipoReferencia && <span className="kll-ref-type">{m.tipoReferencia}</span>}
                          </div>
                        </td>
                        <td className="num kma-money">
                          {m.totalVenta != null ? formatMoney(m.totalVenta) : <span className="kll-muted">—</span>}
                        </td>
                        <td>
                          <div className="kma-pay">{m.formaPago || <span className="kll-muted">—</span>}</div>
                          <CardPaymentDetail
                            auth={m.cardAuthNumber}
                            last4={m.cardLast4}
                            brand={m.cardBrand}
                            voucherAmount={m.cardVoucherAmount}
                            voucherDiff={m.cardVoucherDifference}
                            auth2={m.card2AuthNumber}
                            last4_2={m.card2Last4}
                            brand2={m.card2Brand}
                            voucherAmount2={m.card2VoucherAmount}
                            voucherDiff2={m.card2VoucherDifference}
                          />
                        </td>
                        <td>
                          <div className="kll-reason" title={m.motivo || ""}>{m.motivo || "—"}</div>
                        </td>
                        <td>{m.usuario || <span className="kll-muted">—</span>}</td>
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
                    : "Selecciona un kiosko para comenzar."}
                />
              )}
            </div>
          </div>
        </Col>
      </Row>
    </div>
  );
}
