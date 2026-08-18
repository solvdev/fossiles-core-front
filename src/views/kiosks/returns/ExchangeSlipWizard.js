import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  FormGroup,
  Input,
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
  posVariantChipLabel,
  posVariantHasStock,
  posVariantNeedsSizePick,
  posVariantSizeEntries,
  posVariantStockQty,
  variantLineKeyFor,
} from "../pos/posUtils";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import ExchangeCheckoutModal from "./ExchangeCheckoutModal";
import "../KioskSales.css";

const MIRAFLORES_PRICE_EDIT_CODE = "A15";
const DISCOUNT_PRESETS = ["10", "15", "20"];

const WIZARD_STEPS = [
  { id: 1, label: "Ingreso" },
  { id: 2, label: "Línea" },
  { id: 3, label: "Salida" },
  { id: 4, label: "Resumen" },
];

const impliedDiscountPercent = (catalogSalePrice, paidUnitPrice) => {
  const catalog = Number(catalogSalePrice || 0);
  const paid = Number(paidUnitPrice || 0);
  if (!(catalog > 0) || !(paid >= 0) || paid >= catalog - 0.009) return null;
  return Math.round((1 - paid / catalog) * 1000) / 10;
};

/** Solo variantes con stock y sin empaques SUM; una fila por producto+color+herraje. */
const dedupeSellableInventory = (rows) => {
  const byKey = new Map();
  (rows || []).forEach((row) => {
    if (isPackagingProductCode(row?.productCode)) return;
    if (!posVariantHasStock(row)) return;
    const key = variantLineKeyFor(row.productId, row.colorId, row.hardwareCondition);
    const prev = byKey.get(key);
    if (!prev || posVariantStockQty(row) > posVariantStockQty(prev)) {
      byKey.set(key, row);
    }
  });
  return Array.from(byKey.values());
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
        setInventory(dedupeSellableInventory(Array.isArray(ctx?.inventory) ? ctx.inventory : []));
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

  const exchangeableSaleItems = useMemo(
    () => (sale?.items || []).filter((item) => !isPackagingProductCode(item.productCode)),
    [sale]
  );

  const packagingSaleItems = useMemo(
    () => (sale?.items || []).filter((item) => isPackagingProductCode(item.productCode)),
    [sale]
  );

  const packagingSaleTotal = useMemo(
    () =>
      packagingSaleItems.reduce((sum, item) => {
        const line = Number(item.lineTotal);
        if (Number.isFinite(line) && line > 0) return sum + line;
        return sum + Number(item.unitPrice || 0) * Number(item.quantity || 0);
      }, 0),
    [packagingSaleItems]
  );

  const exchangeableProducts = useMemo(
    () => (products || []).filter((product) => !isPackagingProductCode(product.code)),
    [products]
  );

  const selectedReturnedProduct = useMemo(
    () => (exchangeableProducts || []).find((product) => String(product.id) === String(returnedProductId)) || null,
    [exchangeableProducts, returnedProductId]
  );

  const selectedVariant = useMemo(() => {
    if (!selectedVariantKey) return null;
    return (inventory || []).find(
      (row) =>
        variantLineKeyFor(row.productId, row.colorId, row.hardwareCondition) === selectedVariantKey
    );
  }, [inventory, selectedVariantKey]);

  const inventoryOptions = useMemo(
    () =>
      (inventory || []).map((row) => {
        const sameProduct = (inventory || []).filter(
          (other) => String(other.productId) === String(row.productId)
        );
        const colorLabel = posVariantChipLabel(row, sameProduct);
        return {
          value: variantLineKeyFor(row.productId, row.colorId, row.hardwareCondition),
          label: `${row.productCode || ""} · ${row.productName || ""} · ${colorLabel} · Stock ${formatQty(
            posVariantStockQty(row)
          )}`,
          row,
        };
      }),
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
    if (isPackagingProductCode(item?.productCode)) {
      setError("Los empaques SUM no entran en el cambio. Selecciona el producto.");
      return;
    }
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

  const visibleSteps = useMemo(() => {
    if (exchangeMode === "FREE") {
      return WIZARD_STEPS.filter((item) => item.id !== 2);
    }
    return WIZARD_STEPS;
  }, [exchangeMode]);

  const renderReturnedDiscountFields = () => (
    <div className="kiosk-exchange-panel">
      <p className="kiosk-exchange-panel-title">¿Se vendió con descuento?</p>
      <div className="kiosk-exchange-chips">
        <button
          type="button"
          className={`kiosk-exchange-chip${!returnedSoldWithDiscount ? " is-active" : ""}`}
          onClick={() => {
            setReturnedSoldWithDiscount(false);
            setReturnedDiscountPreset("");
            setReturnedDiscountOther("");
          }}
        >
          No
        </button>
        <button
          type="button"
          className={`kiosk-exchange-chip${returnedSoldWithDiscount ? " is-active" : ""}`}
          onClick={() => {
            setReturnedSoldWithDiscount(true);
            if (!returnedDiscountPreset) setReturnedDiscountPreset("10");
          }}
        >
          Sí
        </button>
      </div>
      {returnedSoldWithDiscount && (
        <div className="kiosk-exchange-chips mt-2">
          {DISCOUNT_PRESETS.map((pct) => (
            <button
              key={pct}
              type="button"
              className={`kiosk-exchange-chip${returnedDiscountPreset === pct ? " is-active" : ""}`}
              onClick={() => {
                setReturnedDiscountPreset(pct);
                setReturnedDiscountOther("");
              }}
            >
              {pct}%
            </button>
          ))}
          <button
            type="button"
            className={`kiosk-exchange-chip${returnedDiscountPreset === "other" ? " is-active" : ""}`}
            onClick={() => setReturnedDiscountPreset("other")}
          >
            Otro
          </button>
          {returnedDiscountPreset === "other" && (
            <Input
              type="number"
              min="1"
              max="99"
              step="0.5"
              value={returnedDiscountOther}
              onChange={(e) => setReturnedDiscountOther(e.target.value)}
              placeholder="%"
              bsSize="sm"
              className="kiosk-exchange-chip-input"
            />
          )}
        </div>
      )}
      <p className="kiosk-exchange-help mb-0">
        Crédito del ingreso: precio de venta de catálogo
        {returnedSoldWithDiscount && resolvedDiscountPercent > 0
          ? ` con ${resolvedDiscountPercent}% de descuento.`
          : " sin descuento."}
      </p>
    </div>
  );

  const goToGivenStep = () => {
    resetError();
    if (exchangeMode === "FREE") {
      if (!selectedReturnedProduct) {
        setError("Selecciona el producto que ingresa al kiosko.");
        return;
      }
      if (returnedSoldWithDiscount && !(resolvedDiscountPercent > 0)) {
        setError("Indica el porcentaje de descuento.");
        return;
      }
      setStep(3);
      return;
    }
    if (!selectedItemId) {
      setError("Selecciona la línea devuelta.");
      return;
    }
    if (returnedSoldWithDiscount && !(resolvedDiscountPercent > 0)) {
      setError("Indica el porcentaje de descuento.");
      return;
    }
    setStep(3);
  };

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
    const packagingReturned = Number(preview.packagingReturnedAmount || 0);
    const productReturned = Number((returnedUnit * returnedQuantity).toFixed(2));
    const productGiven = Number((givenUnit * givenQuantity).toFixed(2));
    const returnedAmount = Number((productReturned + packagingReturned).toFixed(2));
    const givenAmount = productGiven;
    const differenceAmount = Number((givenAmount - returnedAmount).toFixed(2));
    return {
      ...preview,
      returnedAmount,
      givenAmount,
      differenceAmount,
      packagingGivenAmount: 0,
      returned: {
        ...preview.returned,
        unitPrice: returnedUnit,
        lineTotal: productReturned,
      },
      given: {
        ...preview.given,
        unitPrice: givenUnit,
        lineTotal: productGiven,
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
      <Modal isOpen={isOpen} toggle={onClose} size="lg" className="kiosk-exchange-modal" contentClassName="kiosk-pos-page">
        <ModalHeader toggle={onClose}>Nueva boleta de cambio</ModalHeader>
        <ModalBody>
          <div className="kiosk-exchange-steps" aria-label="Progreso">
            {visibleSteps.map((item, index) => {
              const isActive = step === item.id;
              const isDone = step > item.id || (exchangeMode === "FREE" && item.id === 1 && step === 3);
              return (
                <div
                  key={item.id}
                  className={`kiosk-exchange-step${isActive ? " is-active" : ""}${isDone && !isActive ? " is-done" : ""}`}
                >
                  <span className="kiosk-exchange-step-num">{index + 1}</span>
                  <span className="kiosk-exchange-step-label">{item.label}</span>
                </div>
              );
            })}
          </div>

          {error && <Alert color="danger">{error}</Alert>}

          {step === 1 && (
            <>
              <div className="kiosk-exchange-section">
                <span className="kiosk-exchange-label">Tipo de cambio</span>
                <div className="kiosk-exchange-mode-row">
                  <button
                    type="button"
                    className={`kiosk-exchange-mode-btn${exchangeMode === "SALE" ? " is-active" : ""}`}
                    onClick={() => setExchangeMode("SALE")}
                  >
                    <strong>Con factura</strong>
                    <span>Buscar por serie-correlativo</span>
                  </button>
                  <button
                    type="button"
                    className={`kiosk-exchange-mode-btn${exchangeMode === "FREE" ? " is-active" : ""}`}
                    onClick={() => setExchangeMode("FREE")}
                  >
                    <strong>Cambio libre</strong>
                    <span>Ventas anteriores al sistema</span>
                  </button>
                </div>
              </div>

              {exchangeMode === "SALE" ? (
                <>
                  <div className="kiosk-exchange-panel">
                    <span className="kiosk-exchange-label">Serie-correlativo</span>
                    <div className="kiosk-exchange-lookup">
                      <Input
                        value={saleQuery}
                        onChange={(e) => setSaleQuery(e.target.value)}
                        placeholder="Ej: A45-241"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleLookupSale();
                          }
                        }}
                      />
                      <Button color="primary" onClick={() => void handleLookupSale()} disabled={loading}>
                        {loading ? "…" : "Buscar"}
                      </Button>
                    </div>
                  </div>
                  <div className="kiosk-exchange-hint mt-3 mb-0">
                    <span className="kiosk-exchange-hint-icon" aria-hidden>i</span>
                    <span>
                      Si el cambio es de una venta <strong>anterior al inicio del sistema</strong>, use{" "}
                      <strong>Cambio libre</strong>.
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="kiosk-exchange-hint">
                    <span className="kiosk-exchange-hint-icon" aria-hidden>i</span>
                    <span>
                      El ingreso se valora a precio de catálogo (con o sin descuento). El producto nuevo se cobra
                      a precio normal cuando hay diferencia.
                    </span>
                  </div>
                  <div className="kiosk-exchange-panel">
                    <p className="kiosk-exchange-panel-title">Producto que ingresa</p>
                    <div className="kiosk-exchange-field">
                      <span className="kiosk-exchange-label">Producto</span>
                      <ProductSelector
                        products={exchangeableProducts}
                        value={returnedProductId}
                        onChange={(product) => {
                          if (product && isPackagingProductCode(product.code)) {
                            setError("Los empaques SUM no entran en el cambio.");
                            return;
                          }
                          setReturnedProductId(product?.id != null ? String(product.id) : "");
                          setReturnedSoldWithDiscount(false);
                          setReturnedDiscountPreset("");
                          setReturnedDiscountOther("");
                        }}
                        placeholder="Buscar producto (sin empaques SUM)…"
                      />
                    </div>
                    <div className="kiosk-exchange-field">
                      <span className="kiosk-exchange-label">Color (opcional)</span>
                      <ColorSelector
                        colors={colors}
                        value={returnedColorId}
                        onChange={(color) => setReturnedColorId(color?.id != null ? String(color.id) : "")}
                        placeholder="Buscar color…"
                      />
                    </div>
                    <div className="kiosk-exchange-field-grid">
                      <div className="kiosk-exchange-field">
                        <span className="kiosk-exchange-label">Talla (si aplica)</span>
                        <Input value={returnedSize} onChange={(e) => setReturnedSize(e.target.value)} placeholder="Ej: 34" />
                      </div>
                      <div className="kiosk-exchange-field">
                        <span className="kiosk-exchange-label">Cantidad</span>
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
                    </div>
                  </div>
                  {renderReturnedDiscountFields()}
                </>
              )}
            </>
          )}

          {step === 2 && sale && (
            <>
              <div className="kiosk-exchange-sale-meta">
                <span className="kiosk-exchange-pill">{sale.saleNumber || "Venta"}</span>
                <span className="kiosk-exchange-pill">{sale.saleDate}</span>
                <span className="kiosk-exchange-pill">Total {formatCurrency(sale.totalAmount)}</span>
              </div>
              <div className="kiosk-exchange-hint">
                <span className="kiosk-exchange-hint-icon" aria-hidden>i</span>
                <span>
                  Selecciona el producto a cambiar. Los empaques SUM se muestran solo de referencia (precio de factura,
                  sin descuento) y no mueven stock.
                </span>
              </div>
              <div className="kiosk-exchange-table-wrap">
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
                      const isPackaging = isPackagingProductCode(item.productCode);
                      const isSelected = !isPackaging && String(selectedItemId) === String(item.id);
                      const lineTotal =
                        Number(item.lineTotal) > 0
                          ? Number(item.lineTotal)
                          : Number(item.unitPrice || 0) * Number(item.quantity || 0);
                      return (
                        <tr
                          key={item.id}
                          className={isSelected ? "table-active" : isPackaging ? "text-muted" : ""}
                          onClick={() => {
                            if (!isPackaging) selectReturnedItem(item);
                          }}
                          style={isPackaging ? { cursor: "default" } : undefined}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            {isPackaging ? (
                              <span className="kiosk-exchange-help">SUM</span>
                            ) : (
                              <Input
                                type="radio"
                                name="return-line"
                                checked={isSelected}
                                onChange={() => selectReturnedItem(item)}
                              />
                            )}
                          </td>
                          <td>{item.productCode}</td>
                          <td>
                            {item.productName}
                            {isPackaging ? " · empaque (sin cambio de stock)" : ""}
                          </td>
                          <td>{formatQty(item.quantity)}</td>
                          <td>{formatCurrency(isPackaging ? lineTotal : item.unitPrice)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
              {packagingSaleTotal > 0 ? (
                <p className="kiosk-exchange-help">
                  Empaque en factura original: <strong>{formatCurrency(packagingSaleTotal)}</strong> (sin descuento).
                </p>
              ) : null}
              {exchangeableSaleItems.length === 0 && (
                <Alert color="warning" className="py-2">
                  Esta venta no tiene productos cambiables (solo empaques SUM u otras líneas excluidas).
                </Alert>
              )}
              <div className="kiosk-exchange-panel mb-3">
                <div className="kiosk-exchange-field" style={{ maxWidth: 180 }}>
                  <span className="kiosk-exchange-label">Cantidad devuelta</span>
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
              </div>
              {renderReturnedDiscountFields()}
            </>
          )}

          {step === 3 && (
            <>
              <div className="kiosk-exchange-hint">
                <span className="kiosk-exchange-hint-icon" aria-hidden>i</span>
                <span>
                  Selecciona el producto nuevo del inventario del kiosko (sin empaques SUM). Se valora a precio de
                  venta normal.
                </span>
              </div>
              <div className="kiosk-exchange-panel">
                <div className="kiosk-exchange-field">
                  <span className="kiosk-exchange-label">Producto nuevo</span>
                  <FilterableSelect
                    value={selectedVariantKey}
                    onChange={(value) => selectGivenVariant(value)}
                    options={inventoryOptions}
                    placeholder="Buscar por código, nombre o color…"
                    emptyLabel="Selecciona producto…"
                    onSearchChange={setProductSearch}
                  />
                </div>
                {inventoryOptions.length === 0 && (
                  <p className="kiosk-exchange-help mb-0">No hay productos con stock para esa búsqueda.</p>
                )}
                {selectedVariant && (
                  <div className="kiosk-exchange-selected">
                    <strong>{selectedVariant.productCode}</strong>
                    {" · "}
                    {selectedVariant.productName}
                    {selectedVariant.colorName ? ` · ${selectedVariant.colorName}` : ""}
                    {selectedSize ? ` · T.${selectedSize}` : ""}
                  </div>
                )}
                {selectedVariant && posVariantNeedsSizePick(selectedVariant) && (
                  <div className="kiosk-exchange-field mt-3" style={{ maxWidth: 280 }}>
                    <span className="kiosk-exchange-label">Talla</span>
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
                  </div>
                )}
              </div>
            </>
          )}

          {step === 4 && displayPreview && (
            <>
              <div className="kiosk-exchange-summary">
                <div className="kiosk-exchange-summary-card">
                  <h6>Ingreso</h6>
                  <p>{displayPreview.returned.productCode} · {displayPreview.returned.productName}</p>
                  <p>Cant. {formatQty(displayPreview.returned.quantity)}</p>
                  {canEditPrices ? (
                    <FormGroup className="mb-2 mt-2">
                      <span className="kiosk-exchange-label">Precio unitario</span>
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
                  {Number(displayPreview.packagingReturnedAmount || 0) > 0 ? (
                    <p className="kiosk-exchange-help mb-0 mt-1">
                      Incluye empaque de factura {formatCurrency(displayPreview.packagingReturnedAmount)} (sin
                      descuento / sin stock)
                    </p>
                  ) : null}
                </div>
                <div className="kiosk-exchange-summary-card">
                  <h6>Egreso</h6>
                  <p>{displayPreview.given.productCode} · {displayPreview.given.productName}</p>
                  <p>Cant. {formatQty(displayPreview.given.quantity)}</p>
                  {canEditPrices ? (
                    <FormGroup className="mb-2 mt-2">
                      <span className="kiosk-exchange-label">Precio unitario</span>
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
                  <p className="kiosk-exchange-help mb-0 mt-1">Solo producto (sin empaque)</p>
                </div>
                <div className="kiosk-exchange-summary-card is-diff">
                  <h6>Diferencia</h6>
                  <div className="kiosk-exchange-diff-value">
                    {formatCurrency(displayPreview.differenceAmount)}
                  </div>
                  {canEditPrices ? (
                    <Button
                      color="secondary"
                      outline
                      size="sm"
                      className="mt-3"
                      onClick={() => void handleApplyEditedPrices()}
                      disabled={loading}
                    >
                      {loading ? "Aplicando..." : "Aplicar precios"}
                    </Button>
                  ) : null}
                </div>
              </div>
              {canEditPrices ? (
                <div className="kiosk-exchange-hint">
                  <span className="kiosk-exchange-hint-icon" aria-hidden>i</span>
                  <span>
                    Miraflores (A15): edita los precios para que lo cobrado en POS coincida con lo facturado.
                  </span>
                </div>
              ) : null}
              <div className="kiosk-exchange-panel">
                <div className="kiosk-exchange-field">
                  <span className="kiosk-exchange-label">Número de boleta física</span>
                  <Input
                    value={physicalSlipNumber}
                    onChange={(e) => setPhysicalSlipNumber(e.target.value)}
                    placeholder="Ej: BC-0042"
                  />
                </div>
                {!hasPriceDifference && (
                  <>
                    <div className="kiosk-exchange-hint mt-3">
                      <span className="kiosk-exchange-hint-icon" aria-hidden>i</span>
                      <span>
                        Sin diferencia: no hay cobro. Supervisora debe autorizar antes de mover inventario.
                      </span>
                    </div>
                    <div className="kiosk-exchange-field mt-3">
                      <span className="kiosk-exchange-label">Motivo del cambio</span>
                      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: Cambio de talla" />
                    </div>
                    <div className="kiosk-exchange-field">
                      <span className="kiosk-exchange-label">Observaciones (opcional)</span>
                      <Input
                        type="textarea"
                        rows="2"
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                      />
                    </div>
                  </>
                )}
              </div>
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
          {step === 1 && exchangeMode === "FREE" && (
            <Button color="primary" onClick={goToGivenStep}>
              Seleccionar producto nuevo
            </Button>
          )}
          {step === 2 && (
            <Button color="primary" onClick={goToGivenStep}>
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
