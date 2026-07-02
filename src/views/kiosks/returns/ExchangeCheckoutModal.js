import React, { useEffect, useMemo, useState } from "react";
import { Input, Label, Modal, ModalBody } from "reactstrap";
import { lookupTaxpayerByNit } from "services/kioskPosService";
import {
  formatCurrency,
  formatFelCustomerName,
  isValidGuatemalaNit,
  normalizeNit,
} from "../pos/posUtils";

const QUICK_CASH = [50, 100, 200, 500];

const PAYMENT_METHODS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "MIXTO", label: "Mixto" },
];

function ExchangeCheckoutModal({
  isOpen,
  onClose,
  differenceAmount,
  returnedAmount,
  givenAmount,
  reason,
  onReasonChange,
  observations,
  onObservationsChange,
  saving,
  onConfirm,
}) {
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [amountReceived, setAmountReceived] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardAuthNumber, setCardAuthNumber] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [customerTaxId, setCustomerTaxId] = useState("CF");
  const [customerName, setCustomerName] = useState("CONSUMIDOR FINAL");
  const [requestInvoice, setRequestInvoice] = useState(false);
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
    setCustomerTaxId("CF");
    setCustomerName("CONSUMIDOR FINAL");
    setRequestInvoice(false);
    setTaxLookupError("");
  }, [isOpen]);

  const totalDue = Math.max(0, Number(differenceAmount || 0));

  const changePreview = useMemo(() => {
    if (paymentMethod !== "EFECTIVO" && paymentMethod !== "MIXTO") return 0;
    if (paymentMethod === "MIXTO") {
      const cash = Number(cashAmount || 0);
      const received = Number(amountReceived || cash);
      return Math.max(0, received - cash);
    }
    const received = Number(amountReceived || 0);
    return Math.max(0, received - totalDue);
  }, [paymentMethod, amountReceived, cashAmount, totalDue]);

  const cashInsufficient =
    totalDue > 0 &&
    paymentMethod === "EFECTIVO" &&
    Number(amountReceived || 0) < totalDue;

  const requiresCardData =
    paymentMethod === "TARJETA" || (paymentMethod === "MIXTO" && Number(cardAmount || 0) > 0);
  const cardDataIncomplete =
    requiresCardData && (!cardAuthNumber.trim() || !/^\d{4}$/.test(cardLast4.trim()));

  const nitInvalid =
    normalizeNit(customerTaxId) !== "CF" &&
    !isValidGuatemalaNit(customerTaxId) &&
    String(customerTaxId || "").trim() !== "";

  const invoiceIncomplete =
    normalizeNit(customerTaxId) !== "CF" && !String(customerName || "").trim();

  const canConfirm =
    !saving && !cashInsufficient && !nitInvalid && !invoiceIncomplete && !taxLookupLoading && !cardDataIncomplete;

  const handleTaxIdChange = (value) => {
    setCustomerTaxId(value);
    setTaxLookupError("");
    if (normalizeNit(value) === "CF") {
      setCustomerName("CONSUMIDOR FINAL");
      setRequestInvoice(false);
    }
  };

  const setExact = () => setAmountReceived(String(totalDue.toFixed(2)));

  const addCash = (value) => {
    const current = Number(amountReceived || 0);
    setAmountReceived(String((current + value).toFixed(2)));
  };

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

  const handleConfirm = () => {
    const normalizedTaxId = normalizeNit(customerTaxId || "CF") || "CF";
    onConfirm({
      paymentMethod,
      amountReceived: amountReceived ? Number(amountReceived) : totalDue > 0 ? totalDue : 0,
      cashAmount: cashAmount ? Number(cashAmount) : null,
      cardAmount: cardAmount ? Number(cardAmount) : null,
      cardAuthNumber: requiresCardData ? cardAuthNumber.trim() : null,
      cardLast4: requiresCardData ? cardLast4.trim() : null,
      customerTaxId: normalizedTaxId,
      customerName:
        normalizedTaxId === "CF" ? "CONSUMIDOR FINAL" : String(customerName || "").trim(),
      requestInvoice: normalizedTaxId === "CF" ? requestInvoice : true,
      reason: reason || null,
      observations: observations || null,
    });
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} centered className="kiosk-pos-checkout-modal">
      <div className="kiosk-pos-checkout-header">
        <h5 className="modal-title">Cobrar diferencia de cambio</h5>
        <button type="button" className="close" onClick={onClose} aria-label="Cerrar">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <ModalBody>
        <div className="kiosk-pos-checkout-metrics">
          <div className="kiosk-pos-metric">
            <div className="kiosk-pos-metric-value">{formatCurrency(returnedAmount)}</div>
            <div className="kiosk-pos-metric-label">ingreso (devuelto)</div>
          </div>
          <div className="kiosk-pos-metric">
            <div className="kiosk-pos-metric-value">{formatCurrency(givenAmount)}</div>
            <div className="kiosk-pos-metric-label">egreso (nuevo)</div>
          </div>
          <div className="kiosk-pos-metric">
            <div className="kiosk-pos-metric-value primary">{formatCurrency(totalDue)}</div>
            <div className="kiosk-pos-metric-label">diferencia a cobrar</div>
          </div>
        </div>

        <div className="kiosk-pos-checkout-section">
          <Label className="kiosk-pos-label">Motivo del cambio</Label>
          <Input value={reason} onChange={(e) => onReasonChange(e.target.value)} placeholder="Ej: Cambio de talla" />
        </div>

        <div className="kiosk-pos-checkout-section">
          <Label className="kiosk-pos-label">Observaciones (opcional)</Label>
          <textarea
            className="kiosk-pos-notes-textarea"
            value={observations}
            onChange={(e) => onObservationsChange(e.target.value)}
            placeholder="Detalle adicional del cambio"
          />
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
          {normalizeNit(customerTaxId) === "CF" && (
            <div className="custom-control custom-checkbox mt-2">
              <input
                className="custom-control-input"
                type="checkbox"
                id="exchange-request-invoice"
                checked={requestInvoice}
                onChange={(e) => setRequestInvoice(e.target.checked)}
              />
              <label className="custom-control-label" htmlFor="exchange-request-invoice">
                Emitir factura electrónica (CF)
              </label>
            </div>
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
                onClick={() => setPaymentMethod(method.value)}
              >
                {method.label}
              </button>
            ))}
          </div>
        </div>

        {paymentMethod === "EFECTIVO" && totalDue > 0 && (
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

        {paymentMethod === "TARJETA" && requiresCardData && (
          <div className="kiosk-pos-checkout-section">
            <div className="kiosk-pos-mixto-grid">
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
          </div>
        )}

        {paymentMethod === "MIXTO" && (
          <div className="kiosk-pos-checkout-section">
            <div className="kiosk-pos-mixto-grid">
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
              {totalDue > 0 && (
                <div className="full-width">
                  <div className="kiosk-pos-quick-cash">
                    <button type="button" className="kiosk-pos-quick-btn kiosk-pos-quick-exact" onClick={setExact}>
                      EXACTO
                    </button>
                    {QUICK_CASH.map((value) => (
                      <button
                        key={`mixto-cash-${value}`}
                        type="button"
                        className="kiosk-pos-quick-btn kiosk-pos-quick-add"
                        onClick={() => addCash(value)}
                      >
                        +{value}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {requiresCardData && (
                <>
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
            {totalDue > 0 && (
              <div className="kiosk-pos-change-box mt-3">
                <div className="kiosk-pos-change-label">Cambio efectivo</div>
                {changePreview > 0 ? (
                  <div className="kiosk-pos-change-value">{formatCurrency(changePreview)}</div>
                ) : (
                  <div className="kiosk-pos-change-empty">— Sin cambio —</div>
                )}
              </div>
            )}
          </div>
        )}
      </ModalBody>
      <div className="kiosk-pos-checkout-footer">
        <button type="button" className="kiosk-pos-btn-confirm" onClick={handleConfirm} disabled={!canConfirm}>
          {saving ? "Procesando..." : `Confirmar ${formatCurrency(totalDue)}`}
        </button>
        <button type="button" className="kiosk-pos-btn-cancel" onClick={onClose} disabled={saving}>
          Cancelar
        </button>
        {cashInsufficient && (
          <p className="kiosk-pos-confirm-hint">El monto recibido no cubre el total</p>
        )}
        {!cashInsufficient && cardDataIncomplete && (
          <p className="kiosk-pos-confirm-hint">Indica autorización y últimos 4 dígitos de la tarjeta</p>
        )}
      </div>
    </Modal>
  );
}

export default ExchangeCheckoutModal;
