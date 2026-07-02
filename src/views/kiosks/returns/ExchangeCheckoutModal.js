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
        <div className="mb-3">
          <div className="d-flex justify-content-between"><span>Ingreso (devuelto)</span><strong>{formatCurrency(returnedAmount)}</strong></div>
          <div className="d-flex justify-content-between"><span>Egreso (nuevo)</span><strong>{formatCurrency(givenAmount)}</strong></div>
          <div className="d-flex justify-content-between mt-2"><span>Diferencia a cobrar</span><strong>{formatCurrency(totalDue)}</strong></div>
        </div>

        <div className="kiosk-pos-checkout-section">
          <Label className="kiosk-pos-label">Motivo del cambio</Label>
          <Input value={reason} onChange={(e) => onReasonChange(e.target.value)} placeholder="Ej: Cambio de talla" />
        </div>

        <div className="kiosk-pos-checkout-section">
          <Label className="kiosk-pos-label">Observaciones (opcional)</Label>
          <Input
            type="textarea"
            value={observations}
            onChange={(e) => onObservationsChange(e.target.value)}
          />
        </div>

        <div className="kiosk-pos-checkout-section">
          <Label className="kiosk-pos-label">Forma de pago</Label>
          <div className="kiosk-pos-payment-methods">
            {PAYMENT_METHODS.map((method) => (
              <button
                key={method.value}
                type="button"
                className={`kiosk-pos-payment-btn ${paymentMethod === method.value ? "active" : ""}`}
                onClick={() => setPaymentMethod(method.value)}
              >
                {method.label}
              </button>
            ))}
          </div>
        </div>

        <div className="kiosk-pos-checkout-section">
          <Label className="kiosk-pos-label">NIT / CF</Label>
          <div className="d-flex">
            <Input
              className="kiosk-pos-input-lg mr-2"
              value={customerTaxId}
              onChange={(e) => {
                setCustomerTaxId(e.target.value);
                setTaxLookupError("");
                if (normalizeNit(e.target.value) === "CF") {
                  setCustomerName("CONSUMIDOR FINAL");
                  setRequestInvoice(false);
                }
              }}
            />
            <button type="button" className="btn btn-outline-primary" onClick={() => void lookupTaxId()}>
              {taxLookupLoading ? "..." : "Buscar"}
            </button>
          </div>
          {taxLookupError && <small className="text-danger">{taxLookupError}</small>}
          {normalizeNit(customerTaxId) !== "CF" && (
            <Input
              className="mt-2 kiosk-pos-input-lg"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre factura"
            />
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
                Cliente CF solicita factura electrónica
              </label>
            </div>
          )}
        </div>

        {(paymentMethod === "EFECTIVO" || paymentMethod === "MIXTO") && totalDue > 0 && (
          <div className="kiosk-pos-checkout-section">
            <Label className="kiosk-pos-label">Efectivo recibido</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="number"
              min="0"
              step="0.01"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
            />
            <div className="kiosk-pos-quick-cash mt-2">
              <button type="button" className="kiosk-pos-quick-cash-btn" onClick={() => setAmountReceived(String(totalDue.toFixed(2)))}>
                Exacto
              </button>
              {QUICK_CASH.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="kiosk-pos-quick-cash-btn"
                  onClick={() => setAmountReceived(String((Number(amountReceived || 0) + value).toFixed(2)))}
                >
                  +{value}
                </button>
              ))}
            </div>
            <div className="kiosk-pos-change-box mt-3">
              <div className="kiosk-pos-change-label">Cambio</div>
              <div className="kiosk-pos-change-value">{changePreview > 0 ? formatCurrency(changePreview) : "—"}</div>
            </div>
          </div>
        )}

        {paymentMethod === "MIXTO" && (
          <div className="kiosk-pos-checkout-section">
            <Label className="kiosk-pos-label">Monto tarjeta</Label>
            <Input
              className="kiosk-pos-input-lg"
              type="number"
              min="0"
              step="0.01"
              value={cardAmount}
              onChange={(e) => setCardAmount(e.target.value)}
            />
          </div>
        )}

        {requiresCardData && (
          <div className="kiosk-pos-checkout-grid">
            <div>
              <Label className="kiosk-pos-label">Autorización</Label>
              <Input value={cardAuthNumber} onChange={(e) => setCardAuthNumber(e.target.value)} />
            </div>
            <div>
              <Label className="kiosk-pos-label">Últimos 4 dígitos</Label>
              <Input
                value={cardLast4}
                onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
              />
            </div>
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
      </div>
    </Modal>
  );
}

export default ExchangeCheckoutModal;
