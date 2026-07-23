import React, { useEffect, useMemo, useState } from "react";
import { Input, Label, Modal, ModalBody } from "reactstrap";
import FilterableSelect from "components/distribution/FilterableSelect";
import { lookupTaxpayerByNit } from "services/kioskPosService";
import { formatPromotionOptionLabel } from "utils/productAudienceHelper";
import {
  formatCurrency,
  formatFelCustomerName,
  formatQty,
  isValidGuatemalaNit,
  normalizeNit,
  POS_CARD_BRANDS,
  DEFAULT_POS_CARD_BRAND,
} from "./posUtils";

const QUICK_CASH = [50, 100, 200, 500];

const PAYMENT_METHODS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "MIXTO", label: "Mixto" },
];

function PosCheckoutModal({
  isOpen,
  onClose,
  cartItemCount,
  estimatedSubtotal,
  estimatedDiscount,
  estimatedTotal,
  promotions,
  selectedPromotionId,
  onPromotionChange,
  notes,
  onNotesChange,
  comments,
  onCommentsChange,
  saving,
  onConfirm,
}) {
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [amountReceived, setAmountReceived] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardAuthNumber, setCardAuthNumber] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [cardBrand, setCardBrand] = useState(DEFAULT_POS_CARD_BRAND);
  const [splitTwoCards, setSplitTwoCards] = useState(false);
  const [card1Amount, setCard1Amount] = useState("");
  const [card2Amount, setCard2Amount] = useState("");
  const [card2AuthNumber, setCard2AuthNumber] = useState("");
  const [card2Last4, setCard2Last4] = useState("");
  const [card2Brand, setCard2Brand] = useState(DEFAULT_POS_CARD_BRAND);
  const [chargeWithoutDiscount, setChargeWithoutDiscount] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [customerTaxId, setCustomerTaxId] = useState("CF");
  const [customerName, setCustomerName] = useState("CONSUMIDOR FINAL");
  const [taxLookupLoading, setTaxLookupLoading] = useState(false);
  const [taxLookupError, setTaxLookupError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setPaymentMethod("EFECTIVO");
    setAmountReceived("");
    setCashAmount("");
    setCardAmount("");
    setCardAuthNumber("");
    setCardLast4("");
    setCardBrand(DEFAULT_POS_CARD_BRAND);
    setSplitTwoCards(false);
    setCard1Amount("");
    setCard2Amount("");
    setCard2AuthNumber("");
    setCard2Last4("");
    setCard2Brand(DEFAULT_POS_CARD_BRAND);
    setChargeWithoutDiscount(false);
    setNotesOpen(Boolean(notes));
    setCustomerTaxId("CF");
    setCustomerName("CONSUMIDOR FINAL");
    setTaxLookupError("");
  }, [isOpen, notes]);

  const lookupTaxId = async () => {
    const nit = normalizeNit(customerTaxId);
    setTaxLookupError("");
    if (!nit || nit === "CF") {
      setCustomerTaxId("CF");
      setCustomerName("CONSUMIDOR FINAL");
      return;
    }
    if (!isValidGuatemalaNit(nit)) {
      setTaxLookupError("El NIT ingresado no es válido en Guatemala.");
      return;
    }
    try {
      setTaxLookupLoading(true);
      const result = await lookupTaxpayerByNit(nit);
      setCustomerTaxId(result?.taxId || nit);
      setCustomerName(formatFelCustomerName(result?.customerName || ""));
      if (!result?.customerName) {
        setTaxLookupError("La consulta no devolvió nombre de cliente.");
      }
    } catch (err) {
      setTaxLookupError(err.message || "No se pudo consultar el NIT.");
      setCustomerName("");
    } finally {
      setTaxLookupLoading(false);
    }
  };

  const handleTaxIdChange = (value) => {
    setCustomerTaxId(value);
    setTaxLookupError("");
    if (normalizeNit(value) === "CF") {
      setCustomerName("CONSUMIDOR FINAL");
    }
  };

  const checkoutDiscount = chargeWithoutDiscount ? 0 : Number(estimatedDiscount || 0);
  const checkoutTotal = chargeWithoutDiscount
    ? Number(estimatedSubtotal || 0)
    : Number(estimatedTotal || 0);

  const changePreview = useMemo(() => {
    if (paymentMethod !== "EFECTIVO" && paymentMethod !== "MIXTO") return 0;
    const total = checkoutTotal;
    if (paymentMethod === "MIXTO") {
      const cash = Number(cashAmount || 0);
      const received = Number(amountReceived || cash);
      return Math.max(0, received - cash);
    }
    const received = Number(amountReceived || 0);
    return Math.max(0, received - total);
  }, [paymentMethod, amountReceived, cashAmount, checkoutTotal]);

  const cashInsufficient =
    paymentMethod === "EFECTIVO" && Number(amountReceived || 0) < checkoutTotal;

  const requiresCardData =
    paymentMethod === "TARJETA" || (paymentMethod === "MIXTO" && Number(cardAmount || 0) > 0);
  const card1DataIncomplete =
    requiresCardData
    && (!cardAuthNumber.trim() || !/^\d{4}$/.test(cardLast4.trim()) || !cardBrand.trim());
  const splitAmountsInvalid =
    paymentMethod === "TARJETA"
    && splitTwoCards
    && (
      Number(card1Amount || 0) <= 0
      || Number(card2Amount || 0) <= 0
      || Math.abs(Number(card1Amount || 0) + Number(card2Amount || 0) - checkoutTotal) > 0.009
    );
  const card2DataIncomplete =
    paymentMethod === "TARJETA"
    && splitTwoCards
    && (!card2AuthNumber.trim() || !/^\d{4}$/.test(card2Last4.trim()) || !card2Brand.trim());
  const cardDataIncomplete = card1DataIncomplete || card2DataIncomplete;

  const promotionOptions = useMemo(
    () =>
      (promotions || []).map((promo) => ({
        value: String(promo.id),
        label: formatPromotionOptionLabel(promo),
      })),
    [promotions]
  );

  const nitInvalid =
    normalizeNit(customerTaxId) !== "CF" &&
    !isValidGuatemalaNit(customerTaxId) &&
    String(customerTaxId || "").trim() !== "";

  const invoiceIncomplete =
    normalizeNit(customerTaxId) !== "CF" && !String(customerName || "").trim();

  const canConfirm =
    !saving
    && !cashInsufficient
    && !nitInvalid
    && !invoiceIncomplete
    && !taxLookupLoading
    && !cardDataIncomplete
    && !splitAmountsInvalid;

  const setExact = () => setAmountReceived(String(checkoutTotal.toFixed(2)));

  const addCash = (value) => {
    const current = Number(amountReceived || 0);
    setAmountReceived(String((current + value).toFixed(2)));
  };

  const handleConfirm = () => {
    const normalizedTaxId = normalizeNit(customerTaxId || "CF") || "CF";

    onConfirm({
      paymentMethod,
      amountReceived: amountReceived ? Number(amountReceived) : null,
      cashAmount: cashAmount ? Number(cashAmount) : null,
      cardAmount:
        paymentMethod === "TARJETA" && splitTwoCards
          ? Number(card1Amount)
          : cardAmount
            ? Number(cardAmount)
            : null,
      cardAuthNumber: requiresCardData ? cardAuthNumber.trim() : null,
      cardLast4: requiresCardData ? cardLast4.trim() : null,
      cardBrand: requiresCardData ? cardBrand.trim() : null,
      card2Amount:
        paymentMethod === "TARJETA" && splitTwoCards ? Number(card2Amount) : null,
      card2AuthNumber:
        paymentMethod === "TARJETA" && splitTwoCards ? card2AuthNumber.trim() : null,
      card2Last4:
        paymentMethod === "TARJETA" && splitTwoCards ? card2Last4.trim() : null,
      card2Brand:
        paymentMethod === "TARJETA" && splitTwoCards ? card2Brand.trim() : null,
      promotionId: chargeWithoutDiscount ? null : (selectedPromotionId || null),
      chargeWithoutDiscount,
      notes: notes || null,
      comments: comments || null,
      customerTaxId: normalizedTaxId,
      customerName:
        normalizedTaxId === "CF"
          ? "CONSUMIDOR FINAL"
          : String(customerName || "").trim(),
      requestInvoice: true,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      toggle={onClose}
      centered
      className="kiosk-pos-checkout-modal"
    >
      <div className="kiosk-pos-checkout-header">
        <h5 className="modal-title">Cobrar venta</h5>
        <button type="button" className="close" onClick={onClose} aria-label="Cerrar">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>

      <ModalBody>
        <div className="kiosk-pos-checkout-metrics">
          <div className="kiosk-pos-metric">
            <div className="kiosk-pos-metric-value">{formatQty(cartItemCount)}</div>
            <div className="kiosk-pos-metric-label">ítems</div>
          </div>
          {checkoutDiscount > 0 && (
            <div className="kiosk-pos-metric">
              <div className="kiosk-pos-metric-value strikethrough">{formatCurrency(estimatedSubtotal)}</div>
              <div className="kiosk-pos-metric-label">subtotal</div>
            </div>
          )}
          <div className="kiosk-pos-metric">
            <div className="kiosk-pos-metric-value primary">{formatCurrency(checkoutTotal)}</div>
            <div className="kiosk-pos-metric-label">total a cobrar</div>
          </div>
        </div>

        <div className="kiosk-pos-checkout-section">
          <div className="custom-control custom-checkbox mb-0">
            <Input
              type="checkbox"
              id="pos-charge-without-discount"
              checked={chargeWithoutDiscount}
              onChange={(e) => setChargeWithoutDiscount(e.target.checked)}
            />
            <Label className="custom-control-label" for="pos-charge-without-discount">
              Cobrar sin descuento (precio normal)
            </Label>
          </div>
          <div className="text-muted small mt-1">
            Ignora el 10% automático y promociones; cobra el subtotal de catálogo.
          </div>
        </div>

        <div className="kiosk-pos-checkout-section">
          <Label className="kiosk-pos-label">Datos de facturación</Label>
          <div className="d-flex flex-wrap align-items-end" style={{ gap: 8 }}>
            <div style={{ flex: "1 1 140px" }}>
              <Label className="kiosk-pos-label small mb-1">NIT / CF</Label>
              <Input
                className="kiosk-pos-input-lg"
                value={customerTaxId}
                onChange={(e) => handleTaxIdChange(e.target.value)}
                onBlur={lookupTaxId}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookupTaxId();
                  }
                }}
                placeholder="CF o NIT"
                disabled={taxLookupLoading}
              />
            </div>
            <button
              type="button"
              className="kiosk-pos-quick-btn kiosk-pos-quick-exact"
              onClick={() => {
                setCustomerTaxId("CF");
                setCustomerName("CONSUMIDOR FINAL");
                setTaxLookupError("");
              }}
              disabled={taxLookupLoading}
            >
              CF
            </button>
            <button
              type="button"
              className="kiosk-pos-quick-btn kiosk-pos-quick-add"
              onClick={lookupTaxId}
              disabled={taxLookupLoading}
            >
              {taxLookupLoading ? "Consultando..." : "Consultar NIT"}
            </button>
          </div>
          <Label className="kiosk-pos-label mt-2 small mb-1">Nombre en factura</Label>
          <Input
            className="kiosk-pos-input-lg"
            value={customerName}
            readOnly={normalizeNit(customerTaxId) !== "CF"}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Se llena al consultar el NIT"
          />
          {taxLookupError && <div className="text-danger small mt-1">{taxLookupError}</div>}
          {nitInvalid && <div className="text-danger small mt-1">NIT inválido</div>}
          {invoiceIncomplete && !taxLookupError && (
            <div className="text-warning small mt-1">Consulte el NIT para obtener el nombre en factura</div>
          )}
          <div className="text-muted small mt-2">
            Toda venta genera factura electrónica. Por defecto CF; consulte NIT si el cliente la pide a nombre.
          </div>
        </div>

        <div className={`kiosk-pos-checkout-section ${chargeWithoutDiscount ? "opacity-50" : ""}`}>
          <Label className="kiosk-pos-label">Promoción</Label>
          <div className="d-flex flex-wrap mb-2" style={{ gap: 8 }}>
            <button
              type="button"
              className={`kiosk-pos-quick-btn ${selectedPromotionId === "__percent_10" ? "kiosk-pos-quick-exact" : ""}`}
              onClick={() => onPromotionChange(selectedPromotionId === "__percent_10" ? "" : "__percent_10")}
              disabled={chargeWithoutDiscount}
            >
              10% OFF
            </button>
            <button
              type="button"
              className={`kiosk-pos-quick-btn ${selectedPromotionId === "__percent_15" ? "kiosk-pos-quick-exact" : ""}`}
              onClick={() => onPromotionChange(selectedPromotionId === "__percent_15" ? "" : "__percent_15")}
              disabled={chargeWithoutDiscount}
            >
              15% OFF
            </button>
            <button
              type="button"
              className={`kiosk-pos-quick-btn ${selectedPromotionId === "__percent_20" ? "kiosk-pos-quick-exact" : ""}`}
              onClick={() => onPromotionChange(selectedPromotionId === "__percent_20" ? "" : "__percent_20")}
              disabled={chargeWithoutDiscount}
            >
              20% OFF
            </button>
          </div>
          <FilterableSelect
            value={selectedPromotionId}
            onChange={onPromotionChange}
            options={promotionOptions}
            placeholder="Buscar promoción..."
            emptyLabel="Sin promoción"
            inputClassName="kiosk-pos-promo-select"
            disabled={chargeWithoutDiscount}
          />
          {checkoutDiscount > 0 && (
            <div className="kiosk-pos-promo-discount">Descuento aplicado: -{formatCurrency(checkoutDiscount)}</div>
          )}
          {chargeWithoutDiscount && estimatedSubtotal > 0 && (
            <div className="kiosk-pos-promo-discount">Precio normal: {formatCurrency(estimatedSubtotal)}</div>
          )}
        </div>

        <div className="kiosk-pos-checkout-section">
          <Label className="kiosk-pos-label">Forma de pago</Label>
          <div className="kiosk-pos-payment-tabs">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.value}
                type="button"
                className={`kiosk-pos-payment-tab ${paymentMethod === method.value ? "active" : ""}`}
                onClick={() => {
                  setPaymentMethod(method.value);
                  if (method.value !== "TARJETA") {
                    setSplitTwoCards(false);
                  }
                }}
              >
                {method.label}
              </button>
            ))}
          </div>
        </div>

        {paymentMethod === "EFECTIVO" && (
          <div className="kiosk-pos-checkout-section">
            <Label className="kiosk-pos-label">Monto recibido</Label>
            <input
              className="kiosk-pos-cash-input"
              type="number"
              inputMode="numeric"
              min="0"
              step="0.01"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
            />
            <div className="kiosk-pos-quick-cash">
              <button type="button" className="kiosk-pos-quick-btn kiosk-pos-quick-exact" onClick={setExact}>
                EXACTO
              </button>
              {QUICK_CASH.map((value) => (
                <button
                  key={`cash-${value}`}
                  type="button"
                  className="kiosk-pos-quick-btn kiosk-pos-quick-add"
                  onClick={() => addCash(value)}
                >
                  +{value}
                </button>
              ))}
            </div>
            <div className="kiosk-pos-change-box">
              <div className="kiosk-pos-change-label">Cambio</div>
              {changePreview > 0 ? (
                <div className="kiosk-pos-change-value">{formatCurrency(changePreview)}</div>
              ) : (
                <div className="kiosk-pos-change-empty">— Sin cambio —</div>
              )}
            </div>
          </div>
        )}

        {paymentMethod === "TARJETA" && (
          <div className="kiosk-pos-checkout-section">
            <div className="custom-control custom-checkbox mb-3">
              <Input
                type="checkbox"
                id="pos-split-two-cards"
                checked={splitTwoCards}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSplitTwoCards(checked);
                  if (checked) {
                    setCard1Amount("");
                    setCard2Amount("");
                  }
                }}
              />
              <Label className="custom-control-label" for="pos-split-two-cards">
                Dividir pago en dos tarjetas
              </Label>
            </div>

            {splitTwoCards && (
              <div className="kiosk-pos-mixto-grid mb-3">
                <div>
                  <Label className="kiosk-pos-label">Monto tarjeta 1</Label>
                  <Input
                    className="kiosk-pos-input-lg"
                    type="number"
                    min="0"
                    step="0.01"
                    value={card1Amount}
                    onChange={(e) => {
                      const value = e.target.value;
                      setCard1Amount(value);
                      const first = Number(value || 0);
                      const total = checkoutTotal;
                      if (first > 0 && total > first) {
                        setCard2Amount(String((total - first).toFixed(2)));
                      } else if (!value) {
                        setCard2Amount("");
                      }
                    }}
                  />
                </div>
                <div>
                  <Label className="kiosk-pos-label">Monto tarjeta 2</Label>
                  <Input
                    className="kiosk-pos-input-lg"
                    type="number"
                    min="0"
                    step="0.01"
                    value={card2Amount}
                    onChange={(e) => setCard2Amount(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="kiosk-pos-label mb-2">{splitTwoCards ? "Tarjeta 1" : "Datos de tarjeta"}</div>
            <div className="kiosk-pos-mixto-grid">
              <div>
                <Label className="kiosk-pos-label">Marca de tarjeta</Label>
                <Input
                  type="select"
                  className="kiosk-pos-input-lg"
                  value={cardBrand}
                  onChange={(e) => setCardBrand(e.target.value)}
                >
                  {POS_CARD_BRANDS.map((brand) => (
                    <option key={brand.value} value={brand.value}>
                      {brand.label}
                    </option>
                  ))}
                </Input>
              </div>
              <div>
                <Label className="kiosk-pos-label">Número de autorización</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  value={cardAuthNumber}
                  onChange={(e) => setCardAuthNumber(e.target.value)}
                  placeholder="Ej: 123456"
                />
              </div>
              <div>
                <Label className="kiosk-pos-label">Últimos 4 dígitos de la tarjeta</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  value={cardLast4}
                  onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  maxLength={4}
                  inputMode="numeric"
                />
              </div>
            </div>

            {splitTwoCards && (
              <>
                <div className="kiosk-pos-label mb-2 mt-3">Tarjeta 2</div>
                <div className="kiosk-pos-mixto-grid">
                  <div>
                    <Label className="kiosk-pos-label">Marca de tarjeta</Label>
                    <Input
                      type="select"
                      className="kiosk-pos-input-lg"
                      value={card2Brand}
                      onChange={(e) => setCard2Brand(e.target.value)}
                    >
                      {POS_CARD_BRANDS.map((brand) => (
                        <option key={`card2-${brand.value}`} value={brand.value}>
                          {brand.label}
                        </option>
                      ))}
                    </Input>
                  </div>
                  <div>
                    <Label className="kiosk-pos-label">Número de autorización</Label>
                    <Input
                      className="kiosk-pos-input-lg"
                      value={card2AuthNumber}
                      onChange={(e) => setCard2AuthNumber(e.target.value)}
                      placeholder="Ej: 654321"
                    />
                  </div>
                  <div>
                    <Label className="kiosk-pos-label">Últimos 4 dígitos de la tarjeta</Label>
                    <Input
                      className="kiosk-pos-input-lg"
                      value={card2Last4}
                      onChange={(e) => setCard2Last4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="0000"
                      maxLength={4}
                      inputMode="numeric"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {paymentMethod === "MIXTO" && (
          <div className="kiosk-pos-checkout-section">
            <div className="kiosk-pos-mixto-grid">
              <div>
                <Label className="kiosk-pos-label">Efectivo (parte)</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                />
              </div>
              <div>
                <Label className="kiosk-pos-label">Tarjeta (parte)</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardAmount}
                  onChange={(e) => setCardAmount(e.target.value)}
                />
              </div>
              <div className="full-width">
                <Label className="kiosk-pos-label">Recibido efectivo</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  type="number"
                  min="0"
                  step="0.01"
                  value={amountReceived}
                  onChange={(e) => setAmountReceived(e.target.value)}
                />
              </div>
              {requiresCardData && (
                <>
                  <div>
                    <Label className="kiosk-pos-label">Marca de tarjeta</Label>
                    <Input
                      type="select"
                      className="kiosk-pos-input-lg"
                      value={cardBrand}
                      onChange={(e) => setCardBrand(e.target.value)}
                    >
                      {POS_CARD_BRANDS.map((brand) => (
                        <option key={brand.value} value={brand.value}>
                          {brand.label}
                        </option>
                      ))}
                    </Input>
                  </div>
                  <div>
                    <Label className="kiosk-pos-label">Número de autorización</Label>
                    <Input
                      className="kiosk-pos-input-lg"
                      value={cardAuthNumber}
                      onChange={(e) => setCardAuthNumber(e.target.value)}
                      placeholder="Ej: 123456"
                    />
                  </div>
                  <div>
                    <Label className="kiosk-pos-label">Últimos 4 dígitos de la tarjeta</Label>
                    <Input
                      className="kiosk-pos-input-lg"
                      value={cardLast4}
                      onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      placeholder="0000"
                      maxLength={4}
                      inputMode="numeric"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="kiosk-pos-change-box mt-3">
              <div className="kiosk-pos-change-label">Cambio efectivo</div>
              {changePreview > 0 ? (
                <div className="kiosk-pos-change-value">{formatCurrency(changePreview)}</div>
              ) : (
                <div className="kiosk-pos-change-empty">— Sin cambio —</div>
              )}
            </div>
          </div>
        )}

        <div className="kiosk-pos-checkout-section">
          {!notesOpen ? (
            <button type="button" className="kiosk-pos-notes-toggle" onClick={() => setNotesOpen(true)}>
              Nota de venta (opcional)
            </button>
          ) : (
            <>
              <Label className="kiosk-pos-label">Nota de venta (opcional)</Label>
              <textarea
                className="kiosk-pos-notes-textarea"
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Ej: cliente pidió empaque para regalo"
              />
            </>
          )}
        </div>
      </ModalBody>

      <div className="kiosk-pos-checkout-footer">
        <button
          type="button"
          className="kiosk-pos-btn-confirm"
          onClick={handleConfirm}
          disabled={!canConfirm}
        >
          {saving ? "Procesando..." : `Confirmar ${formatCurrency(checkoutTotal)}`}
        </button>
        <button type="button" className="kiosk-pos-btn-cancel" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        {cashInsufficient && (
          <p className="kiosk-pos-confirm-hint">El monto recibido no cubre el total</p>
        )}
        {!cashInsufficient && cardDataIncomplete && (
          <p className="kiosk-pos-confirm-hint">Indica marca, autorización y últimos 4 dígitos de la(s) tarjeta(s)</p>
        )}
        {!cashInsufficient && !cardDataIncomplete && splitAmountsInvalid && (
          <p className="kiosk-pos-confirm-hint">
            Los montos de las dos tarjetas deben sumar el total ({formatCurrency(checkoutTotal)})
          </p>
        )}
      </div>
    </Modal>
  );
}

export default PosCheckoutModal;
