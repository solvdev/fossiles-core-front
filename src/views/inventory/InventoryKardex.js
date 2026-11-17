import React, { useCallback, useEffect, useMemo, useState } from "react";
import Select from "react-select";
import KardexPanel from "components/kardex/KardexPanel";
import KardexTransferModal from "components/kardex/KardexTransferModal";
import {
  getProductKardexByLocation,
  getProductKardexByProduct,
  getProductKardexByProductAndLocation,
} from "services/productInventoryService";
import { getProducts } from "services/productService";
import { getLocations } from "services/locationService";
import { getInventoryTransferById } from "services/inventoryService";
import { normalizeKardexRows } from "utils/kardexModel";
import { showError } from "utils/notificationHelper";

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
 * Kardex de producto terminado: elige un producto, una ubicación o ambos y ve cada entrada, salida y su saldo.
 * Dentro de los modales de inventario recibe el producto y/o la ubicación ya fijados.
 */
function InventoryKardex({
  lockedProductId,
  lockedLocationId,
  lockedTitle,
  embedded = false,
  /** Solo movimientos del producto en todas las ubicaciones (sin selector de ubicación). */
  narrowToProductOnly = false,
  embeddedCompact = false,
} = {}) {
  const productLocked =
    lockedProductId !== undefined && lockedProductId !== null && String(lockedProductId).trim() !== "";
  const locationLocked =
    !narrowToProductOnly &&
    lockedLocationId !== undefined &&
    lockedLocationId !== null &&
    String(lockedLocationId).trim() !== "";

  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [product, setProduct] = useState(null);
  const [location, setLocation] = useState(null);
  const [raw, setRaw] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [transfer, setTransfer] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);

  const productId = productLocked ? String(lockedProductId) : product ? String(product.value) : "";
  const locationId = narrowToProductOnly
    ? ""
    : locationLocked
    ? String(lockedLocationId)
    : location
    ? String(location.value)
    : "";

  useEffect(() => {
    (async () => {
      try {
        if (!productLocked) setProducts((await getProducts()) || []);
        if (!locationLocked && !narrowToProductOnly) setLocations((await getLocations()) || []);
      } catch (err) {
        showError(err.message || "No se pudieron cargar los filtros del kardex.");
      }
    })();
  }, [productLocked, locationLocked, narrowToProductOnly]);

  const load = useCallback(async () => {
    if (!productId && !locationId) {
      setRaw(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      let data = [];
      if (productId && locationId) data = await getProductKardexByProductAndLocation(productId, locationId);
      else if (productId) data = await getProductKardexByProduct(productId);
      else data = await getProductKardexByLocation(locationId);
      setRaw(data || []);
    } catch (err) {
      setRaw(null);
      setError(err.message || "No se pudo cargar el kardex de producto.");
    } finally {
      setLoading(false);
    }
  }, [productId, locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => (raw === null ? null : normalizeKardexRows(raw)), [raw]);

  const openTransfer = async (id) => {
    setTransfer(null);
    setTransferOpen(true);
    setTransferLoading(true);
    try {
      setTransfer(await getInventoryTransferById(id));
    } catch (err) {
      showError(err.message || "No se pudo cargar la transferencia.");
    } finally {
      setTransferLoading(false);
    }
  };

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.code || ""} — ${p.name || ""}`.replace(/^ — /, "") })),
    [products]
  );
  const locationOptions = useMemo(
    () => locations.map((l) => ({ value: l.id, label: l.code ? `${l.name} (${l.code})` : l.name })),
    [locations]
  );

  const showSelectors = !productLocked || (!locationLocked && !narrowToProductOnly);
  const toolbar = showSelectors ? (
    <div className="kdx-filters">
      {!productLocked && (
        <div className="kdx-field kdx-grow">
          <label htmlFor="kdx-product">Producto</label>
          <Select
            inputId="kdx-product"
            isClearable
            isSearchable
            placeholder="Todos los productos"
            noOptionsMessage={() => "Sin resultados"}
            options={productOptions}
            value={product}
            onChange={setProduct}
            styles={selectStyles}
          />
        </div>
      )}
      {!locationLocked && !narrowToProductOnly && (
        <div className="kdx-field kdx-grow">
          <label htmlFor="kdx-location">Ubicación</label>
          <Select
            inputId="kdx-location"
            isClearable
            isSearchable
            placeholder="Todas las ubicaciones"
            noOptionsMessage={() => "Sin resultados"}
            options={locationOptions}
            value={location}
            onChange={setLocation}
            styles={selectStyles}
          />
        </div>
      )}
    </div>
  ) : null;

  const start = (
    <div className="kdx-start">
      <h5>Elige un producto o una ubicación</h5>
      <p className="mb-0">
        Verás cada entrada y salida con el saldo que quedó. Puedes combinar un producto con una ubicación para ver
        solo lo que pasó ahí.
      </p>
    </div>
  );

  return (
    <>
      <KardexPanel
        title={lockedTitle || "Kardex de producto terminado"}
        subtitle="Cada entrada y salida de producto por ubicación, con el saldo que quedó. Las salidas se valoran por FIFO: se consume primero el lote más antiguo."
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        toolbar={toolbar}
        start={start}
        showItem
        itemKind="product"
        showName={!productLocked}
        showLocation={!locationId}
        itemLabel="Producto"
        onOpenTransfer={openTransfer}
        embedded={embedded}
        compact={embeddedCompact}
        fileName="kardex_producto"
      />
      <KardexTransferModal
        isOpen={transferOpen}
        loading={transferLoading}
        transfer={transfer}
        onClose={() => {
          setTransferOpen(false);
          setTransfer(null);
        }}
      />
    </>
  );
}

export default InventoryKardex;
