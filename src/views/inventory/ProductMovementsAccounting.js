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
import { getProducts } from "services/productService";
import {
  getProductMovementsAccounting,
  getProductMovementsAccountingLocations,
  getProductMovementsAccountingStocks,
} from "services/productMovementsAccountingService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError } from "utils/notificationHelper";

const PRODUCT_MOVEMENT_TYPE_LABELS = {
  PRODUCTION_ENTRY: "Entrada por Producción",
  SALE_EXIT: "Salida por Venta",
  TRANSFER_IN: "Transferencia Entrada",
  TRANSFER_OUT: "Transferencia Salida",
  ADJUSTMENT: "Ajuste",
  RETURN: "Devolución",
  ONLINE_SALE_DISPATCH: "Despacho venta online",
  ONLINE_SALE_DISPATCH_REVERSAL: "Anulación despacho online",
  ONLINE_SALE_PREPARE: "Preparación venta online",
  ONLINE_SALE_PREPARE_REVERSAL: "Anulación preparación online",
  ONLINE_SALE_RETURN: "Devolución venta online",
  SHIPMENT: "Envío",
  SHIPMENT_REVERSAL: "Anulación envío",
};

const TYPE_BADGE = {
  PRODUCTION_ENTRY: "success",
  TRANSFER_IN: "success",
  RETURN: "info",
  ADJUSTMENT: "secondary",
  TRANSFER_OUT: "warning",
  SHIPMENT: "warning",
  SHIPMENT_REVERSAL: "info",
  ONLINE_SALE_DISPATCH: "primary",
  ONLINE_SALE_DISPATCH_REVERSAL: "info",
  ONLINE_SALE_PREPARE: "primary",
  ONLINE_SALE_PREPARE_REVERSAL: "info",
  ONLINE_SALE_RETURN: "info",
  SALE_EXIT: "danger",
};

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

function movementTypeLabel(type) {
  if (!type) return "—";
  return PRODUCT_MOVEMENT_TYPE_LABELS[type] || type;
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

  const selectedStock = useMemo(
    () => stocks.find((s) => String(s.id) === String(selectedStockId)) || null,
    [stocks, selectedStockId]
  );

  return (
    <div className="content" style={{ fontSize: "0.85rem" }}>
      <h4 className="mb-1">Inventario Productos</h4>
      <p className="text-muted small mb-3">
        Consulta detallada por producto, color y talla (solo lectura). Elige Bodega PT o
        Devoluciones, filtra y haz clic en una fila de inventario para ver su kardex.
      </p>

      <Row className="g-2 mb-2 align-items-end">
        <Col md={3}>
          <Label className="mb-1 small fw-semibold">Bodega</Label>
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
            <Label className="mb-1 small fw-semibold">Referencia / número</Label>
            <Input
              type="text"
              bsSize="sm"
              placeholder="OP, envío, venta…"
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
              value={filters.sizeLabel}
              onChange={(e) => setFilter("sizeLabel", e.target.value)}
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

      <Row>
        <Col md={4} style={{ maxHeight: "70vh", overflow: "auto" }}>
          <div className="d-flex justify-content-between align-items-center mb-1">
            <strong>Inventario ({stocks.length})</strong>
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
              {stocks.map((s) => (
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
                    <div className="fw-semibold">{s.productCode}</div>
                    <small className="text-muted">{s.productName}</small>
                  </td>
                  <td>{s.colorName || "—"}</td>
                  <td>{s.quantity}</td>
                  <td>
                    <small>{sizesSummary(s)}</small>
                  </td>
                </tr>
              ))}
              {!loadingStocks && stocks.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-muted text-center">
                    {filters.locationId
                      ? "Sin filas. Pulsa Consultar."
                      : "Selecciona una bodega."}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
          {selectedStock && (
            <div className="mt-2 p-2 border rounded bg-light">
              <div>
                <strong>{selectedStock.productCode}</strong>
                {" · "}
                {selectedStock.colorName || "sin color"}
              </div>
              <div>
                Stock actual: {selectedStock.quantity}
                {selectedStock.min != null ? ` · Mín. ${selectedStock.min}` : ""}
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
                ? ` · ${selectedStock.productCode} / ${selectedStock.colorName || "sin color"}`
                : filters.locationId
                  ? " · bodega completa (o filtra con producto/color)"
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
                  <th>Referencia</th>
                  <th>Descripción</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const type = m.movementType || "";
                  return (
                    <tr key={m.id}>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <small>{formatDateTimeGt(m.movementDate || m.createdAt)}</small>
                      </td>
                      <td>
                        <Badge color={TYPE_BADGE[type] || "secondary"} pill>
                          {movementTypeLabel(type)}
                        </Badge>
                      </td>
                      <td className="text-end fw-semibold">{m.quantity ?? "—"}</td>
                      <td>{m.sizeLabel || "—"}</td>
                      <td className="text-end text-muted">{m.quantityBefore ?? "—"}</td>
                      <td className="text-end text-muted">{m.quantityAfter ?? "—"}</td>
                      <td className="text-end">
                        {m.sizeLabel
                          ? (m.sizeStockBefore != null ? m.sizeStockBefore : "—")
                          : "—"}
                      </td>
                      <td className="text-end">
                        {m.sizeLabel
                          ? (m.sizeStockAfter != null ? m.sizeStockAfter : "—")
                          : "—"}
                      </td>
                      <td>
                        <div>
                          <small>
                            {m.referenceNumber
                              || (m.referenceId != null ? `#${m.referenceId}` : "—")}
                          </small>
                        </div>
                        {m.referenceType && (
                          <Badge color="light" className="text-dark">
                            {m.referenceType}
                          </Badge>
                        )}
                      </td>
                      <td>
                        <small className="text-muted">{m.description || "—"}</small>
                      </td>
                      <td>{m.username || "—"}</td>
                    </tr>
                  );
                })}
                {!loadingMovements && movements.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-muted text-center py-3">
                      {filters.locationId
                        ? "Sin movimientos. Consulta o selecciona un producto/color a la izquierda."
                        : "Selecciona una bodega para comenzar."}
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
