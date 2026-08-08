import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Table,
} from "reactstrap";
import { ColorSelector, ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getKioskPosContext } from "services/kioskPosService";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";
import {
  completeKioskExchange,
  lookupKioskSale,
  previewKioskExchange,
} from "services/kioskExchangeService";
import {
  buildKioskExchangeSlipPrintHtml,
  openExchangeSlipPrintWindow,
} from "utils/kioskExchangeSlipPrint";
import {
  formatCurrency,
  formatQty,
  posVariantNeedsSizePick,
  posVariantSizeEntries,
} from "../pos/posUtils";
import ExchangeCheckoutModal from "./ExchangeCheckoutModal";

const MIRAFLORES_PRICE_EDIT_CODE = "A15";
const DISCOUNT_PRESETS = ["10", "15", "20"];

const impliedDiscountPercent = (catalogSalePrice, paidUnitPrice) => {
  const catalog = Number(catalogSalePrice || 0);
  const paid = Number(paidUnitPrice || 0);
  if (!(catalog > 0) || !(paid >= 0) || paid >= catalog - 0.009) return null;
  return Math.round((1 - paid / catalog) * 1000) / 10;
};

function ExchangeSlipWizard({ isOpen, onClose, kioskLocationId, kioskCode, kioskName, onCompleted }) {
  const canEditPrices =
    String(kioskCode || "").trim().toUpperCase() === MIRAFLORES_PRICE_EDIT_CODE
    || String(kioskName || "").trim().toUpperCase().includes("MIRAFLORES");
  const [step, setStep] = useState(1);
  const [exchangeMode, setExchangeMode] = useState("SALE");
  const [saleQuery, setSaleQuery] = useState("");
  const [sale, setSale] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [returnedProductId, setReturnedProductId] = useState("");
  const [returnedColorId, setReturnedColorId] = useState("");
  const [returnedSize, setReturnedSize] = useState("");
  const [returnedSoldWithDiscount, setReturnedSoldWithDiscount] = useState(false);
  const [returnedDiscountPreset, setReturnedDiscountPreset] = useState("");
  const [returnedDiscountOther, setReturnedDiscountOther] = useState("");
  const [inventory, setInventory] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedVariantKey, setSelectedVariantKey] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [returnedQty, setReturnedQty] = useState("1");
  const [givenQty, setGivenQty] = useState("1");
  const [preview, setPreview] = useState(null);
  const [editReturnedUnitPrice, setEditReturnedUnitPrice] = useState("");
  const [editGivenUnitPrice, setEditGivenUnitPrice] = useState("");
  const [reason, setReason] = useState("");
  const [observations, setObservations] = useState("");
  const [physicalSlipNumber, setPhysicalSlipNumber] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setExchangeMode("SALE");
    setSaleQuery("");
    setSale(null);
    setSelectedItemId("");
    setProducts([]);
    setColors([]);
    setReturnedProductId("");
    setReturnedColorId("");
    setReturnedSize("");
    setReturnedSoldWithDiscount(false);
    setReturnedDiscountPreset("");
    setReturnedDiscountOther("");
    setInventory([]);
    setProductSearch("");
    setSelectedVariantKey("");
    setSelectedSize("");
    setReturnedQty("1");
    setGivenQty("1");
    setPreview(null);
    setEditReturnedUnitPrice("");
    setEditGivenUnitPrice("");
    setReason("");
    setObservations("");
    setPhysicalSlipNumber("");
    setCheckoutOpen(false);
    setError("");
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadCatalogs = async () => {
      try {
        const [productRows, colorRows] = await Promise.all([getProducts(), getColors()]);
        if (cancelled) return;
        setProducts(Array.isArray(productRows) ? productRows : []);
        setColors(Array.isArray(colorRows) ? colorRows : []);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "No se pudo cargar el catálogo de productos.");
        }
      }
    };
    void loadCatalogs();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !kioskLocationId || step < 3) return;
    const timer = setTimeout(async () => {
      try {
        const ctx = await getKioskPosContext(kioskLocationId, { search: productSearch });
        setInventory(Array.isArray(ctx?.inventory) ? ctx.inventory : []);
      } catch (err) {
        setError(err.message || "No se pudo cargar el catálogo del kiosko.");
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [isOpen, kioskLocationId, productSearch, step]);

  const selectedItem = useMemo(
    () => (sale?.items || []).find((item) => String(item.id) === String(selectedItemId)),
    [sale, selectedItemId]
  );

  const selectedReturnedProduct = useMemo(
    () => (products || []).find((product) => String(product.id) === String(returnedProductId)) || null,
    [products, returnedProductId]
  );

  const selectedVariant = useMemo(() => {
    if (!selectedVariantKey) return null;
    const [productId, colorId] = selectedVariantKey.split(":");
    return (inventory || []).find(
      (row) =>
        String(row.productId) === productId &&
        String(row.colorId || "") === String(colorId || "")
    );
  }, [inventory, selectedVariantKey]);

  const inventoryOptions = useMemo(
    () =>
      (inventory || []).map((row) => ({
        value: `${row.productId}:${row.colorId || ""}`,
        label: `${row.productCode || ""} · ${row.productName || ""} · ${row.colorName || "Sin color"} · Stock ${formatQty(row.quantity)}`,
        row,
      })),
    [inventory]
  );

  const resolvedDiscountPercent = useMemo(() => {
    if (!returnedSoldWithDiscount) return 0;
    if (returnedDiscountPreset === "other") {
      const n = Number(returnedDiscountOther);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    const n = Number(returnedDiscountPreset);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [returnedSoldWithDiscount, returnedDiscountPreset, returnedDiscountOther]);

  const applyDiscountFromCatalog = (catalogSalePrice, paidUnitPrice) => {
    const implied = impliedDiscountPercent(catalogSalePrice, paidUnitPrice);
    if (implied == null || implied <= 0) {
      setReturnedSoldWithDiscount(false);
      setReturnedDiscountPreset("");
      setReturnedDiscountOther("");
      return;
    }
    setReturnedSoldWithDiscount(true);
    const asInt = String(Math.round(implied));
    if (DISCOUNT_PRESETS.includes(asInt) && Math.abs(Number(asInt) - implied) < 0.51) {
      setReturnedDiscountPreset(asInt);
      setReturnedDiscountOther("");
    } else {
      setReturnedDiscountPreset("other");
      setReturnedDiscountOther(String(implied));
    }
  };

  useEffect(() => {
    if (!selectedItem) return;
    const product = (products || []).find((p) => Number(p.id) === Number(selectedItem.productId));
    applyDiscountFromCatalog(product?.salePrice, selectedItem.unitPrice);
  }, [selectedItem, products]);

  const resetError = () => setError("");

  const handleLookupSale = async () => {
    resetError();
    if (!saleQuery.trim()) {
      setError("Indica el serie-correlativo de la factura (ej. A45-241).");
      return;
    }
    try {
      setLoading(true);
      const result = await lookupKioskSale(saleQuery.trim(), kioskLocationId);
      setSale(result);
      const firstId = result?.items?.length === 1 ? String(result.items[0].id) : "";
      setSelectedItemId(firstId);
      if (firstId && result.items[0]) {
        setReturnedQty(String(result.items[0].quantity || 1));
        setGivenQty(String(result.items[0].quantity || 1));
      }
      setStep(2);
    } catch (err) {
      setError(err.message || "No se encontró la venta.");
    } finally {
      setLoading(false);
    }
  };

  const selectGivenVariant = (variantKey) => {
    resetError();
    setSelectedVariantKey(variantKey || "");
    setSelectedSize("");
  };

  const selectReturnedItem = (item) => {
    resetError();
    setSelectedItemId(String(item.id));
    setReturnedQty(String(item.quantity || 1));
    setGivenQty(String(item.quantity || 1));
  };

  const buildDiscountPayload = () => ({
    returnedSoldWithDiscount: Boolean(returnedSoldWithDiscount),
    returnedDiscountPercent: returnedSoldWithDiscount ? resolvedDiscountPercent : 0,
  });

  const buildPreviewPayload = (priceOverrides = {}) => ({
    kioskLocationId,
    originalSaleId: sale?.id || null,
    originalSaleItemId: selectedItem?.id || null,
    returnedProductId: selectedReturnedProduct?.id || null,
    returnedColorId: returnedColorId ? Number(returnedColorId) : null,
    returnedSize: returnedSize.trim() || null,
    givenProductId: selectedVariant?.productId || preview?.given?.productId,
    givenColorId: selectedVariant?.colorId ?? preview?.given?.colorId,
    givenSize: selectedSize || preview?.given?.size || null,
    returnedQuantity: Number(returnedQty || preview?.returned?.quantity || 1),
    givenQuantity: Number(givenQty || preview?.given?.quantity || returnedQty || 1),
    ...buildDiscountPayload(),
    ...priceOverrides,
  });

  const renderReturnedDiscountFields = () => (
    <FormGroup className="mt-2">
      <Label>¿Se vendió con descuento?</Label>
      <div>
        <Label check className="mr-3">
          <Input
            type="radio"
            checked={!returnedSoldWithDiscount}
            onChange={() => {
              setReturnedSoldWithDiscount(false);
              setReturnedDiscountPreset("");
              setReturnedDiscountOther("");
            }}
          />{" "}
          No
        </Label>
        <Label check>
          <Input
            type="radio"
            checked={returnedSoldWithDiscount}
            onChange={() => {
              setReturnedSoldWithDiscount(true);
              if (!returnedDiscountPreset) setReturnedDiscountPreset("10");
            }}
          />{" "}
          Sí
        </Label>
      </div>
      {returnedSoldWithDiscount && (
        <div className="d-flex flex-wrap align-items-end mt-2">
          {DISCOUNT_PRESETS.map((pct) => (
            <Label key={pct} check className="mr-3">
              <Input
                type="radio"
                checked={returnedDiscountPreset === pct}
                onChange={() => {
                  setReturnedDiscountPreset(pct);
                  setReturnedDiscountOther("");
                }}
              />{" "}
              {pct}%
            </Label>
          ))}
          <Label check className="mr-2">
            <Input
              type="radio"
              checked={returnedDiscountPreset === "other"}
              onChange={() => setReturnedDiscountPreset("other")}
            />{" "}
            Otro
          </Label>
          {returnedDiscountPreset === "other" && (
            <Input
              type="number"
              min="1"
              max="99"
              step="0.5"
              value={returnedDiscountOther}
              onChange={(e) => setReturnedDiscountOther(e.target.value)}
              placeholder="%"
              style={{ maxWidth: 90 }}
              bsSize="sm"
            />
          )}
        </div>
      )}
      <small className="text-muted d-block mt-1">
        El crédito del ingreso usa el precio de venta de catálogo
        {returnedSoldWithDiscount && resolvedDiscountPercent > 0
          ? ` con ${resolvedDiscountPercent}% de descuento.`
          : " sin descuento."}
      </small>
    </FormGroup>
  );

  const handlePreview = async () => {
    resetError();
    if (exchangeMode === "SALE" && !selectedItem) {
      setError("Selecciona la línea devuelta en el paso anterior.");
      return;
    }
    if (exchangeMode === "FREE" && !selectedReturnedProduct) {
      setError("Selecciona el producto que ingresa al kiosko.");
      return;
    }
    if (!selectedVariant) {
      setError("Selecciona el producto nuevo haciendo clic en una fila de la lista.");
      return;
    }
    if (posVariantNeedsSizePick(selectedVariant) && !selectedSize) {
      setError("Selecciona la talla del producto nuevo.");
      return;
    }
    try {
      setLoading(true);
      const result = await previewKioskExchange(buildPreviewPayload());
      setPreview(result);
      setEditReturnedUnitPrice(String(result?.returned?.unitPrice ?? ""));
      setEditGivenUnitPrice(String(result?.given?.unitPrice ?? ""));
      setStep(4);
    } catch (err) {
      setError(err.message || "No se pudo calcular la boleta.");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyEditedPrices = async () => {
    resetError();
    if (!preview) return;
    const returnedUnit = Number(editReturnedUnitPrice);
    const givenUnit = Number(editGivenUnitPrice);
    if (!(returnedUnit > 0) || !(givenUnit > 0)) {
      setError("Los precios unitarios deben ser mayores a cero.");
      return;
    }
    try {
      setLoading(true);
      const result = await previewKioskExchange(buildPreviewPayload({
        returnedUnitPrice: returnedUnit,
        givenUnitPrice: givenUnit,
      }));
      setPreview(result);
      setEditReturnedUnitPrice(String(result?.returned?.unitPrice ?? returnedUnit));
      setEditGivenUnitPrice(String(result?.given?.unitPrice ?? givenUnit));
    } catch (err) {
      setError(err.message || "No se pudieron aplicar los precios.");
    } finally {
      setLoading(false);
    }
  };

  const displayPreview = useMemo(() => {
    if (!preview) return null;
    if (!canEditPrices) return preview;
    const returnedUnit = Number(editReturnedUnitPrice);
    const givenUnit = Number(editGivenUnitPrice);
    if (!(returnedUnit > 0) || !(givenUnit > 0)) return preview;
    const returnedQuantity = Number(preview.returned?.quantity || 0);
    const givenQuantity = Number(preview.given?.quantity || 0);
    const returnedAmount = Number((returnedUnit * returnedQuantity).toFixed(2));
    const givenAmount = Number((givenUnit * givenQuantity).toFixed(2));
    const differenceAmount = Number((givenAmount - returnedAmount).toFixed(2));
    return {
      ...preview,
      returnedAmount,
      givenAmount,
      differenceAmount,
      returned: {
        ...preview.returned,
        unitPrice: returnedUnit,
        lineTotal: returnedAmount,
      },
      given: {
        ...preview.given,
        unitPrice: givenUnit,
        lineTotal: givenAmount,
      },
    };
  }, [preview, canEditPrices, editReturnedUnitPrice, editGivenUnitPrice]);

  const hasPriceDifference = Number(displayPreview?.differenceAmount || 0) > 0;

  const buildCompleteRequest = (payment = {}) => {
    const source = displayPreview || preview;
    const payload = {
      kioskLocationId,
      originalSaleId: sale?.id || null,
      originalSaleItemId: selectedItem?.id || null,
      returnedProductId: selectedReturnedProduct?.id || null,
      returnedColorId: returnedColorId ? Number(returnedColorId) : null,
      returnedSize: returnedSize.trim() || null,
      givenProductId: source.given.productId,
      givenColorId: source.given.colorId,
      givenSize: source.given.size,
      returnedQuantity: source.returned.quantity,
      givenQuantity: source.given.quantity,
      physicalSlipNumber: physicalSlipNumber.trim(),
      reason: payment.reason || reason,
      observations: payment.observations || observations,
      ...payment,
    };
    Object.assign(payload, buildDiscountPayload());
    if (canEditPrices) {
      const returnedUnit = Number(editReturnedUnitPrice);
      const givenUnit = Number(editGivenUnitPrice);
      if (returnedUnit > 0) payload.returnedUnitPrice = returnedUnit;
      if (givenUnit > 0) payload.givenUnitPrice = givenUnit;
    }
    return payload;
  };

  const handleComplete = async (payment) => {
    if (!displayPreview) return;
    if (!String(physicalSlipNumber || "").trim()) {
      setError("Indica el número de boleta de cambio física.");
      return;
    }
    try {
      setSaving(true);
      const result = await completeKioskExchange(buildCompleteRequest(payment));
      setCheckoutOpen(false);
      openExchangeSlipPrintWindow(buildKioskExchangeSlipPrintHtml(result.slip, displayPreview));
      onCompleted?.(result);
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo registrar la boleta de cambio.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitAuthorizationRequest = async () => {
    if (!displayPreview) return;
    resetError();
    if (!String(physicalSlipNumber || "").trim()) {
      setError("Indica el número de boleta de cambio física.");
      return;
    }
    if (!String(reason || "").trim()) {
      setError("Indica el motivo del cambio.");
      return;
    }
    try {
      setSaving(true);
      const result = await completeKioskExchange(buildCompleteRequest({
        reason: reason.trim(),
        observations: observations.trim() || null,
      }));
      openExchangeSlipPrintWindow(buildKioskExchangeSlipPrintHtml(result.slip, displayPreview));
      onCompleted?.(result);
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo enviar la solicitud de cambio.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenCheckout = () => {
    resetError();
    if (!String(physicalSlipNumber || "").trim()) {
      setError("Indica el número de boleta de cambio física.");
      return;
    }
    setCheckoutOpen(true);
  };

  return (
    <>
      <Modal isOpen={isOpen} toggle={onClose} size="lg">
        <ModalHeader toggle={onClose}>Nueva boleta de cambio</ModalHeader>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}

          {step === 1 && (
            <>
              <FormGroup tag="fieldset">
                <Label>Tipo de cambio</Label>
                <div>
                  <Label check className="mr-4">
                    <Input
                      type="radio"
                      checked={exchangeMode === "SALE"}
                      onChange={() => setExchangeMode("SALE")}
                    />{" "}
                    Con venta POS registrada
                  </Label>
                  <Label check>
                    <Input
                      type="radio"
                      checked={exchangeMode === "FREE"}
                      onChange={() => setExchangeMode("FREE")}
                    />{" "}
                    Cambio libre
                  </Label>
                </div>
              </FormGroup>

              {exchangeMode === "SALE" ? (
                <>
                  <Label>Serie-correlativo de factura</Label>
                  <div className="d-flex">
                    <Input
                      value={saleQuery}
                      onChange={(e) => setSaleQuery(e.target.value)}
                      placeholder="Ej: A45-241"
                      className="mr-2"
                    />
                    <Button color="primary" onClick={() => void handleLookupSale()} disabled={loading}>
                      Buscar
                    </Button>
                  </div>
                  <Alert color="secondary" className="mt-3 mb-0">
                    Si el cambio es de una venta <strong>anterior al inicio del sistema</strong>, use{" "}
                    <strong>Cambio libre</strong>.
                  </Alert>
                </>
              ) : (
                <>
                  <Alert color="info">
                    El producto que ingresa se valora al precio de venta de catálogo (con o sin descuento).
                    El producto nuevo se cobra a precio normal cuando hay diferencia.
                  </Alert>
                  <FormGroup>
                    <Label>Producto que ingresa</Label>
                    <ProductSelector
                      products={products}
                      value={returnedProductId}
                      onChange={(product) => {
                        setReturnedProductId(product?.id != null ? String(product.id) : "");
                        setReturnedSoldWithDiscount(false);
                        setReturnedDiscountPreset("");
                        setReturnedDiscountOther("");
                      }}
                      placeholder="Buscar por código o nombre…"
                    />
                  </FormGroup>
                  <FormGroup>
                    <Label>Color que ingresa (opcional)</Label>
                    <ColorSelector
                      colors={colors}
                      value={returnedColorId}
                      onChange={(color) => setReturnedColorId(color?.id != null ? String(color.id) : "")}
                      placeholder="Buscar color…"
                    />
                  </FormGroup>
                  <div className="d-flex">
                    <FormGroup className="mr-3" style={{ maxWidth: 180 }}>
                      <Label>Talla que ingresa (si aplica)</Label>
                      <Input value={returnedSize} onChange={(e) => setReturnedSize(e.target.value)} />
                    </FormGroup>
                    <FormGroup style={{ maxWidth: 180 }}>
                      <Label>Cantidad que ingresa</Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={returnedQty}
                        onChange={(e) => {
                          setReturnedQty(e.target.value);
                          setGivenQty(e.target.value);
                        }}
                      />
                    </FormGroup>
                  </div>
                  {renderReturnedDiscountFields()}
                  <Button
                    color="primary"
                    className="mt-2"
                    onClick={() => {
                      resetError();
                      if (!selectedReturnedProduct) {
                        setError("Selecciona el producto que ingresa al kiosko.");
                        return;
                      }
                      if (returnedSoldWithDiscount && !(resolvedDiscountPercent > 0)) {
                        setError("Indica el porcentaje de descuento.");
                        return;
                      }
                      setStep(3);
                    }}
                  >
                    Seleccionar producto nuevo
                  </Button>
                </>
              )}
            </>
          )}

          {step === 2 && sale && (
            <>
              <p className="text-muted">
                Venta {sale.saleNumber} · {sale.saleDate} · Total {formatCurrency(sale.totalAmount)}
              </p>
              <Table responsive size="sm">
                <thead>
                  <tr>
                    <th />
                    <th>Código</th>
                    <th>Artículo</th>
                    <th>Cant.</th>
                    <th>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {(sale.items || []).map((item) => {
                    const isSelected = String(selectedItemId) === String(item.id);
                    return (
                    <tr
                      key={item.id}
                      className={isSelected ? "table-active" : ""}
                      style={{ cursor: "pointer" }}
                      onClick={() => selectReturnedItem(item)}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <Input
                          type="radio"
                          name="return-line"
                          checked={isSelected}
                          onChange={() => selectReturnedItem(item)}
                        />
                      </td>
                      <td>{item.productCode}</td>
                      <td>{item.productName}</td>
                      <td>{formatQty(item.quantity)}</td>
                      <td>{formatCurrency(item.unitPrice)}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </Table>
              <div className="mt-2" style={{ maxWidth: 180 }}>
                <Label>Cantidad devuelta</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={returnedQty}
                  onChange={(e) => {
                    setReturnedQty(e.target.value);
                    setGivenQty(e.target.value);
                  }}
                />
              </div>
              {renderReturnedDiscountFields()}
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-muted mb-2">
                Busca y selecciona el producto nuevo (código, color y stock). Se valora a precio de venta normal.
              </p>
              <FormGroup>
                <Label>Producto nuevo</Label>
                <FilterableSelect
                  value={selectedVariantKey}
                  onChange={(value) => selectGivenVariant(value)}
                  options={inventoryOptions}
                  placeholder="Buscar por código, nombre o color…"
                  emptyLabel="Selecciona producto…"
                  onSearchChange={setProductSearch}
                />
              </FormGroup>
              {inventoryOptions.length === 0 && (
                <p className="text-muted">No hay productos con stock en este kiosko para la búsqueda indicada.</p>
              )}
              {selectedVariant && (
                <Alert color="info" className="mt-2 mb-0">
                  Seleccionado: <strong>{selectedVariant.productCode}</strong> · {selectedVariant.productName}
                  {selectedVariant.colorName ? ` · ${selectedVariant.colorName}` : ""}
                  {selectedSize ? ` · T.${selectedSize}` : ""}
                </Alert>
              )}
              {selectedVariant && posVariantNeedsSizePick(selectedVariant) && (
                <FormGroup className="mt-3" style={{ maxWidth: 260 }}>
                  <Label>Talla</Label>
                  <FilterableSelect
                    value={selectedSize}
                    onChange={setSelectedSize}
                    options={posVariantSizeEntries(selectedVariant).map((entry) => ({
                      value: entry.size,
                      label: `${entry.size} (${formatQty(entry.quantity)})`,
                    }))}
                    placeholder="Buscar talla…"
                    emptyLabel="Selecciona talla…"
                  />
                </FormGroup>
              )}
            </>
          )}

          {step === 4 && displayPreview && (
            <>
              <div className="row">
                <div className="col-md-4">
                  <h6>INGRESO</h6>
                  <p>{displayPreview.returned.productCode} · {displayPreview.returned.productName}</p>
                  <p>Cant. {formatQty(displayPreview.returned.quantity)}</p>
                  {canEditPrices ? (
                    <FormGroup className="mb-2">
                      <Label>Precio unitario (crédito)</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={editReturnedUnitPrice}
                        onChange={(e) => setEditReturnedUnitPrice(e.target.value)}
                      />
                    </FormGroup>
                  ) : null}
                  <strong>{formatCurrency(displayPreview.returnedAmount)}</strong>
                </div>
                <div className="col-md-4">
                  <h6>EGRESO</h6>
                  <p>{displayPreview.given.productCode} · {displayPreview.given.productName}</p>
                  <p>Cant. {formatQty(displayPreview.given.quantity)}</p>
                  {canEditPrices ? (
                    <FormGroup className="mb-2">
                      <Label>Precio unitario (cobro)</Label>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={editGivenUnitPrice}
                        onChange={(e) => setEditGivenUnitPrice(e.target.value)}
                      />
                    </FormGroup>
                  ) : null}
                  <strong>{formatCurrency(displayPreview.givenAmount)}</strong>
                </div>
                <div className="col-md-4">
                  <h6>DIFERENCIA</h6>
                  <p className="display-4">{formatCurrency(displayPreview.differenceAmount)}</p>
                  {canEditPrices ? (
                    <Button
                      color="secondary"
                      outline
                      size="sm"
                      className="mt-2"
                      onClick={() => void handleApplyEditedPrices()}
                      disabled={loading}
                    >
                      {loading ? "Aplicando..." : "Aplicar precios"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {canEditPrices ? (
                <Alert color="warning" className="mt-3 mb-0">
                  Miraflores (A15): edita los precios para que lo cobrado en POS (efectivo/tarjeta)
                  coincida con lo que factura y registra el sistema.
                </Alert>
              ) : null}
              <FormGroup className="mt-3">
                <Label>Número de boleta de cambio (física)</Label>
                <Input
                  value={physicalSlipNumber}
                  onChange={(e) => setPhysicalSlipNumber(e.target.value)}
                  placeholder="Ej: BC-0042"
                />
              </FormGroup>
              {!hasPriceDifference && (
                <>
                  <Alert color="info" className="mt-2">
                    Sin diferencia de precio: no hay cobro ni facturación. Logística debe autorizar el cambio
                    antes de mover inventario.
                  </Alert>
                  <FormGroup>
                    <Label>Motivo del cambio</Label>
                    <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: Cambio de talla" />
                  </FormGroup>
                  <FormGroup>
                    <Label>Observaciones (opcional)</Label>
                    <Input
                      type="textarea"
                      value={observations}
                      onChange={(e) => setObservations(e.target.value)}
                    />
                  </FormGroup>
                </>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          {step > 1 && step < 4 && (
            <Button
              color="secondary"
              outline
              onClick={() => setStep((value) => (exchangeMode === "FREE" && value === 3 ? 1 : value - 1))}
              disabled={loading}
            >
              Atrás
            </Button>
          )}
          {step === 2 && (
            <Button
              color="primary"
              onClick={() => {
                resetError();
                if (!selectedItemId) {
                  setError("Selecciona la línea devuelta.");
                  return;
                }
                if (returnedSoldWithDiscount && !(resolvedDiscountPercent > 0)) {
                  setError("Indica el porcentaje de descuento.");
                  return;
                }
                setStep(3);
              }}
            >
              Siguiente
            </Button>
          )}
          {step === 3 && (
            <Button color="primary" onClick={() => void handlePreview()} disabled={loading}>
              Ver resumen
            </Button>
          )}
          {step === 4 && displayPreview && hasPriceDifference && (
            <Button color="success" onClick={handleOpenCheckout}>
              Cobrar y confirmar
            </Button>
          )}
          {step === 4 && displayPreview && !hasPriceDifference && (
            <Button color="success" onClick={() => void handleSubmitAuthorizationRequest()} disabled={saving}>
              {saving ? "Enviando..." : "Enviar solicitud de cambio"}
            </Button>
          )}
        </ModalFooter>
      </Modal>

      <ExchangeCheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        differenceAmount={displayPreview?.differenceAmount}
        returnedAmount={displayPreview?.returnedAmount}
        givenAmount={displayPreview?.givenAmount}
        reason={reason}
        onReasonChange={setReason}
        observations={observations}
        onObservationsChange={setObservations}
        saving={saving}
        onConfirm={handleComplete}
      />
    </>
  );
}

export default ExchangeSlipWizard;
