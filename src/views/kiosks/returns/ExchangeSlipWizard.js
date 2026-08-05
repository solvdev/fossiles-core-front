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

function ExchangeSlipWizard({ isOpen, onClose, kioskLocationId, kioskCode, onCompleted }) {
  const canEditPrices = String(kioskCode || "").trim().toUpperCase() === MIRAFLORES_PRICE_EDIT_CODE;
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
        key: `${row.productId}:${row.colorId || ""}`,
        label: `${row.productCode || ""} · ${row.productName || ""} · ${row.colorName || "Sin color"} · Stock ${formatQty(row.quantity)}`,
        row,
      })),
    [inventory]
  );

  const resetError = () => setError("");

  const handleLookupSale = async () => {
    resetError();
    if (!saleQuery.trim()) {
      setError("Indica el número de venta POS.");
      return;
    }
    try {
      setLoading(true);
      const result = await lookupKioskSale(saleQuery.trim(), kioskLocationId);
      setSale(result);
      setSelectedItemId(result?.items?.length === 1 ? String(result.items[0].id) : "");
      setStep(2);
    } catch (err) {
      setError(err.message || "No se encontró la venta.");
    } finally {
      setLoading(false);
    }
  };

  const selectGivenVariant = (option) => {
    resetError();
    setSelectedVariantKey(option.key);
    setSelectedSize("");
  };

  const selectReturnedItem = (item) => {
    resetError();
    setSelectedItemId(String(item.id));
    setReturnedQty(String(item.quantity || 1));
    setGivenQty(String(item.quantity || 1));
  };

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
    ...priceOverrides,
  });

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
                  <Label>Número de venta original (POS)</Label>
                  <div className="d-flex">
                    <Input
                      value={saleQuery}
                      onChange={(e) => setSaleQuery(e.target.value)}
                      placeholder="Ej: POS-2026-0042"
                      className="mr-2"
                    />
                    <Button color="primary" onClick={() => void handleLookupSale()} disabled={loading}>
                      Buscar
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Alert color="info">
                    El producto que ingresa se valora al precio de catálogo. El producto nuevo se cobrará y
                    facturará según la diferencia.
                  </Alert>
                  <FormGroup>
                    <Label>Producto que ingresa</Label>
                    <Input
                      type="select"
                      value={returnedProductId}
                      onChange={(e) => setReturnedProductId(e.target.value)}
                    >
                      <option value="">Selecciona producto</option>
                      {(products || []).map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.code} · {product.name}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                  <FormGroup>
                    <Label>Color que ingresa (opcional)</Label>
                    <Input
                      type="select"
                      value={returnedColorId}
                      onChange={(e) => setReturnedColorId(e.target.value)}
                    >
                      <option value="">Sin color</option>
                      {(colors || []).map((color) => (
                        <option key={color.id} value={color.id}>
                          {color.name}
                        </option>
                      ))}
                    </Input>
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
                  <Button
                    color="primary"
                    onClick={() => {
                      resetError();
                      if (!selectedReturnedProduct) {
                        setError("Selecciona el producto que ingresa al kiosko.");
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
            </>
          )}

          {step === 3 && (
            <>
              <p className="text-muted mb-2">
                Haz clic en una fila para elegir el producto nuevo (código, color y stock).
              </p>
              <Label>Buscar producto nuevo</Label>
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Código o nombre"
                className="mb-3"
              />
              {inventoryOptions.length === 0 ? (
                <p className="text-muted">No hay productos con stock en este kiosko para la búsqueda indicada.</p>
              ) : (
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                <Table responsive size="sm" hover>
                  <thead>
                    <tr>
                      <th />
                      <th>Producto</th>
                      <th>Color</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryOptions.map((option) => {
                      const isSelected = selectedVariantKey === option.key;
                      return (
                      <tr
                        key={option.key}
                        className={isSelected ? "table-active" : ""}
                        style={{ cursor: "pointer" }}
                        onClick={() => selectGivenVariant(option)}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <Input
                            type="radio"
                            name="given-product"
                            checked={isSelected}
                            onChange={() => selectGivenVariant(option)}
                          />
                        </td>
                        <td>{option.row.productCode} · {option.row.productName}</td>
                        <td>{option.row.colorName || "—"}</td>
                        <td>{formatQty(option.row.quantity)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
              )}
              {selectedVariant && (
                <Alert color="info" className="mt-3 mb-0">
                  Seleccionado: <strong>{selectedVariant.productCode}</strong> · {selectedVariant.productName}
                  {selectedVariant.colorName ? ` · ${selectedVariant.colorName}` : ""}
                  {selectedSize ? ` · T.${selectedSize}` : ""}
                </Alert>
              )}
              {selectedVariant && posVariantNeedsSizePick(selectedVariant) && (
                <div className="mt-3" style={{ maxWidth: 220 }}>
                  <Label>Talla</Label>
                  <Input type="select" value={selectedSize} onChange={(e) => setSelectedSize(e.target.value)}>
                    <option value="">Selecciona talla</option>
                    {posVariantSizeEntries(selectedVariant).map((entry) => (
                      <option key={entry.size} value={entry.size}>
                        {entry.size} ({formatQty(entry.quantity)})
                      </option>
                    ))}
                  </Input>
                </div>
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
