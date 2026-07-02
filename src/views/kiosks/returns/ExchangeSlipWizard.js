import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Table,
} from "reactstrap";
import { getKioskPosContext } from "services/kioskPosService";
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

function ExchangeSlipWizard({ isOpen, onClose, kioskLocationId, onCompleted }) {
  const [step, setStep] = useState(1);
  const [saleQuery, setSaleQuery] = useState("");
  const [sale, setSale] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [inventory, setInventory] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedVariantKey, setSelectedVariantKey] = useState("");
  const [selectedSize, setSelectedSize] = useState("");
  const [returnedQty, setReturnedQty] = useState("1");
  const [givenQty, setGivenQty] = useState("1");
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState("");
  const [observations, setObservations] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSaleQuery("");
    setSale(null);
    setSelectedItemId("");
    setInventory([]);
    setProductSearch("");
    setSelectedVariantKey("");
    setSelectedSize("");
    setReturnedQty("1");
    setGivenQty("1");
    setPreview(null);
    setReason("");
    setObservations("");
    setCheckoutOpen(false);
    setError("");
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

  const handlePreview = async () => {
    resetError();
    if (!selectedItem) {
      setError("Selecciona la línea devuelta en el paso anterior.");
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
      const result = await previewKioskExchange({
        kioskLocationId,
        originalSaleId: sale.id,
        originalSaleItemId: selectedItem.id,
        givenProductId: selectedVariant.productId,
        givenColorId: selectedVariant.colorId,
        givenSize: selectedSize || null,
        returnedQuantity: Number(returnedQty || 1),
        givenQuantity: Number(givenQty || returnedQty || 1),
      });
      setPreview(result);
      setStep(4);
    } catch (err) {
      setError(err.message || "No se pudo calcular la boleta.");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (payment) => {
    if (!preview) return;
    try {
      setSaving(true);
      const result = await completeKioskExchange({
        kioskLocationId,
        originalSaleId: sale.id,
        originalSaleItemId: selectedItem.id,
        givenProductId: preview.given.productId,
        givenColorId: preview.given.colorId,
        givenSize: preview.given.size,
        returnedQuantity: preview.returned.quantity,
        givenQuantity: preview.given.quantity,
        reason: payment.reason || reason,
        observations: payment.observations || observations,
        ...payment,
      });
      setCheckoutOpen(false);
      openExchangeSlipPrintWindow(buildKioskExchangeSlipPrintHtml(result.slip, preview));
      onCompleted?.(result);
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo registrar la boleta de cambio.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} toggle={onClose} size="lg">
        <ModalHeader toggle={onClose}>Nueva boleta de cambio</ModalHeader>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}

          {step === 1 && (
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

          {step === 4 && preview && (
            <div className="row">
              <div className="col-md-4">
                <h6>INGRESO</h6>
                <p>{preview.returned.productCode} · {preview.returned.productName}</p>
                <p>Cant. {formatQty(preview.returned.quantity)}</p>
                <strong>{formatCurrency(preview.returnedAmount)}</strong>
              </div>
              <div className="col-md-4">
                <h6>EGRESO</h6>
                <p>{preview.given.productCode} · {preview.given.productName}</p>
                <p>Cant. {formatQty(preview.given.quantity)}</p>
                <strong>{formatCurrency(preview.givenAmount)}</strong>
              </div>
              <div className="col-md-4">
                <h6>DIFERENCIA</h6>
                <p className="display-4">{formatCurrency(preview.differenceAmount)}</p>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          {step > 1 && step < 4 && (
            <Button color="secondary" outline onClick={() => setStep((value) => value - 1)} disabled={loading}>
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
          {step === 4 && preview && (
            <Button color="success" onClick={() => setCheckoutOpen(true)}>
              Cobrar y confirmar
            </Button>
          )}
        </ModalFooter>
      </Modal>

      <ExchangeCheckoutModal
        isOpen={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        differenceAmount={preview?.differenceAmount}
        returnedAmount={preview?.returnedAmount}
        givenAmount={preview?.givenAmount}
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
