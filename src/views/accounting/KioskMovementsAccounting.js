import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
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
  if (!hasCard1 && !hasCard2) return "—";
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
    <div style={{ fontSize: "0.78rem", lineHeight: 1.4 }}>
      {hasCard1 && <div>{fmt(brand, last4, auth, voucherAmount, voucherDiff)}</div>}
      {hasCard2 && (
        <div className="text-muted">
          {fmt(brand2, last4_2, auth2, voucherAmount2, voucherDiff2)}
        </div>
      )}
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

const TYPE_BADGE = {
  ENTRADA: "success",
  TRASLADO_ENTRADA: "success",
  VENTA: "primary",
  DEVOLUCION_CLIENTE: "info",
  DEVOLUCION_A_CLIENTE: "warning",
  DEVOLUCION_DEPOSITO: "info",
  TRASLADO_SALIDA: "warning",
  MERMA: "danger",
  AJUSTE: "dark",
  ANULACION: "danger",
  CAMBIO: "warning",
};

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

  return (
    <div className="content" style={{ fontSize: "0.85rem" }}>
      <h4 className="mb-1">Movimientos de Kioscos</h4>
      <p className="text-muted small mb-3">
        Consulta por producto, color y talla. Un <strong>Cambio ingreso</strong> sale en Compra del conteo;
        un <strong>Cambio egreso</strong> en Venta. Si el tipo está mal, cámbialo aquí y el conteo lo toma
        al recargar.
        {canEdit
          ? " El select de tipo guarda y recalcula stock."
          : " Solo lectura (pide corrección de tipo a quien edita el ledger)."}
      </p>

      <Row className="g-2 mb-2 align-items-end">
        <Col md={3}>
          <Label className="mb-1 small fw-semibold">Kiosko</Label>
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
        <Col md={3}>
          <Label className="mb-1 small fw-semibold">Producto</Label>
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
        <Col md={2}>
          <Label className="mb-1 small fw-semibold">Color</Label>
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
        <Col md={2}>
          <Label className="mb-1 small fw-semibold">Tipo</Label>
          <FilterableSelect
            options={MOVEMENT_TYPE_OPTIONS}
            value={filters.type}
            onChange={(v) => setFilter("type", v)}
            placeholder="Tipo…"
          />
        </Col>
        <Col md={1}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Desde</Label>
            <Input
              type="date"
              bsSize="sm"
              value={filters.from}
              onChange={(e) => setFilter("from", e.target.value)}
            />
          </FormGroup>
        </Col>
        <Col md={1}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Hasta</Label>
            <Input
              type="date"
              bsSize="sm"
              value={filters.to}
              onChange={(e) => setFilter("to", e.target.value)}
            />
          </FormGroup>
        </Col>
      </Row>

      <Row className="g-2 mb-3 align-items-end">
        <Col md={3}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Boleta / factura / venta</Label>
            <Input
              type="text"
              bsSize="sm"
              placeholder="Nº boleta, factura o venta…"
              value={filters.referenceTerm}
              onChange={(e) => setFilter("referenceTerm", e.target.value)}
            />
          </FormGroup>
        </Col>
        <Col md={1}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Talla</Label>
            <Input
              type="text"
              bsSize="sm"
              placeholder="Ej. 32"
              value={filters.sizeKey}
              onChange={(e) => setFilter("sizeKey", e.target.value)}
            />
          </FormGroup>
        </Col>
        <Col md={3} className="d-flex gap-2">
          <Button
            color="primary"
            size="sm"
            onClick={handleConsultar}
            disabled={loadingStocks || loadingMovements}
          >
            {loadingStocks || loadingMovements ? <Spinner size="sm" /> : "Consultar"}
          </Button>
          <Button color="secondary" size="sm" outline onClick={handleClear}>
            Limpiar
          </Button>
          <Button
            color="secondary"
            size="sm"
            outline
            onClick={() => {
              loadStocks();
              loadMovements();
            }}
            disabled={!filters.locationId || loadingStocks || loadingMovements}
          >
            Refrescar
          </Button>
        </Col>
      </Row>

      {entreCueros && stocks.length > 0 && variantFilterOptions.length > 0 && (
        <Row className="mb-3">
          <Col md={12}>
            <Label className="mb-1 small fw-semibold">Variante / marca</Label>
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
          </Col>
        </Row>
      )}

      <Row>
        <Col md={4} style={{ maxHeight: "70vh", overflow: "auto" }}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <strong>
              Inventario ({visibleStocks.length}
              {variantFilter && visibleStocks.length !== stocks.length ? ` de ${stocks.length}` : ""})
            </strong>
            {loadingStocks && <Spinner size="sm" />}
          </div>
          <Table size="sm" hover bordered responsive className="mb-0">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Color</th>
                <th>Cant.</th>
                <th>Tallas</th>
              </tr>
            </thead>
            <tbody>
              {visibleStocks.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    cursor: "pointer",
                    background:
                      String(selectedStockId) === String(s.id)
                        ? "rgba(54,162,235,0.15)"
                        : undefined,
                  }}
                  onClick={() => {
                    setSelectedStockId(s.id);
                    loadMovements({ stockId: s.id });
                  }}
                >
                  <td>
                    <div>
                      <span className="font-weight-bold">{s.codigoProducto}</span>
                      {" "}
                      <small className="text-muted">{s.producto}</small>
                      <ProductBrandBadge value={s.herraje} entreCueros={entreCueros} />
                    </div>
                  </td>
                  <td>{s.color || "—"}</td>
                  <td>{s.cantidad}</td>
                  <td>
                    <small>{sizesSummary(s)}</small>
                  </td>
                </tr>
              ))}
              {!loadingStocks && visibleStocks.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted text-center">
                    {filters.locationId
                      ? variantFilter
                        ? "Ninguna fila coincide con esa marca o variante."
                        : "Sin filas. Pulsa Consultar."
                      : "Selecciona un kiosko."}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          {selectedStock && (
            <div className="mt-2 p-2 border rounded bg-light">
              <div>
                <strong>{selectedStock.codigoProducto}</strong>
                {" · "}
                {selectedStock.color || "sin color"}
                {" "}
                <ProductBrandBadge value={selectedStock.herraje} entreCueros={entreCueros} />
              </div>
              <div>
                Stock actual: {selectedStock.cantidad}
                {selectedStock.minimo != null ? ` · Mín. ${selectedStock.minimo}` : ""}
              </div>
              <div>
                <small>Tallas: {sizesSummary(selectedStock)}</small>
              </div>
            </div>
          )}
        </Col>

        <Col md={8} style={{ maxHeight: "70vh", overflow: "auto" }}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <strong>
              Movimientos ({movements.length})
              {selectedStock
                ? ` · ${selectedStock.codigoProducto} / ${selectedStock.color || "sin color"}`
                : filters.locationId
                  ? " · kiosko completo (o filtra con producto/color)"
                  : ""}
            </strong>
            {loadingMovements && <Spinner size="sm" />}
          </div>
          <div style={{ overflowX: "auto" }}>
            <Table size="sm" hover bordered responsive className="mb-0" style={{ fontSize: "0.8rem" }}>
              <thead className="table-light sticky-top">
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th className="text-end">Cant.</th>
                  <th>Talla</th>
                  <th className="text-end">Antes</th>
                  <th className="text-end">Después</th>
                  <th className="text-end">Antes talla</th>
                  <th className="text-end">Después talla</th>
                  <th>Ref. / boleta / factura</th>
                  <th className="text-end">Total</th>
                  <th>Pago</th>
                  <th>Motivo</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <small>{formatDateTimeGt(m.fecha)}</small>
                    </td>
                    <td>
                      {canEdit ? (
                        <Input
                          type="select"
                          bsSize="sm"
                          value={normalizeKioscoMovementType(m.tipoMovimiento)}
                          disabled={savingTypeId === m.id}
                          onChange={(e) => void handleTypeChange(m, e.target.value)}
                          style={{ minWidth: 150, fontSize: "0.75rem" }}
                        >
                          {Object.entries(KIOSCO_MOVEMENT_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </Input>
                      ) : (
                        <Badge color={TYPE_BADGE[normalizeKioscoMovementType(m.tipoMovimiento)] || "secondary"} pill>
                          {getKioscoMovementTypeLabel(m.tipoMovimiento, {
                            stockBefore: m.stockAntes,
                            stockAfter: m.stockDespues,
                          })}
                        </Badge>
                      )}
                    </td>
                    <td className="text-end fw-semibold">{m.cantidad ?? "—"}</td>
                    <td>{m.talla || "—"}</td>
                    <td className="text-end text-muted">{m.stockAntes ?? "—"}</td>
                    <td className="text-end text-muted">{m.stockDespues ?? "—"}</td>
                    <td className="text-end">
                      {m.talla ? (m.stockAntesTalla != null ? m.stockAntesTalla : "—") : "—"}
                    </td>
                    <td className="text-end">
                      {m.talla ? (m.stockDespuesTalla != null ? m.stockDespuesTalla : "—") : "—"}
                    </td>
                    <td>
                      <div>
                        <small>
                          {m.resumenReferencia
                            || m.numeroInternoFactura
                            || m.boletaFisica
                            || m.referencia
                            || "—"}
                        </small>
                      </div>
                      {m.numeroInternoFactura && (
                        <div>
                          <small className="fw-semibold">{m.numeroInternoFactura}</small>
                        </div>
                      )}
                      {m.boletaFisica && (
                        <Badge color="light" className="text-dark">
                          Boleta {m.boletaFisica}
                        </Badge>
                      )}
                      {m.tipoReferencia && (
                        <Badge color="light" className="text-dark ms-1">
                          {m.tipoReferencia}
                        </Badge>
                      )}
                    </td>
                    <td className="text-end">
                      {m.totalVenta != null ? `Q ${Number(m.totalVenta).toFixed(2)}` : "—"}
                    </td>
                    <td>
                      <div>{m.formaPago || "—"}</div>
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
                      <small className="text-muted">{m.motivo || "—"}</small>
                    </td>
                    <td>{m.usuario || "—"}</td>
                  </tr>
                ))}
                {!loadingMovements && movements.length === 0 && (
                  <tr>
                    <td colSpan={13} className="text-muted text-center py-3">
                      {filters.locationId
                        ? "Sin movimientos. Consulta o selecciona un producto/color a la izquierda."
                        : "Selecciona un kiosko para comenzar."}
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </div>
        </Col>
      </Row>
    </div>
  );
}
