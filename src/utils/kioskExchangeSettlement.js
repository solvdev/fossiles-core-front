/**
 * Liquidación de cambio kiosko: el empaque SUM de la factura original
 * nunca entra (solo se comparan productos).
 * Soporta 1→N sumando montos de productos entregados.
 */
export function roundExchangeMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
}

export const EXCHANGE_DIFFERENCE_NONE = "NONE";
export const EXCHANGE_DIFFERENCE_WITH = "WITH";
export const EXCHANGE_PRICING_SAME_UNIT = "SAME_UNIT_PRICE";
export const EXCHANGE_PRICING_CATALOG_GIVEN = "CATALOG_GIVEN";

/** Mapea intención UX → pricingMode del API. */
export function resolveExchangePricingMode(differenceMode) {
  return differenceMode === EXCHANGE_DIFFERENCE_NONE
    ? EXCHANGE_PRICING_SAME_UNIT
    : EXCHANGE_PRICING_CATALOG_GIVEN;
}

/**
 * ¿Mostrar “se vendió con descuento?”
 * Con diferencia: siempre. Sin diferencia: solo cambio libre (fija precio compartido).
 * Con factura + sin diferencia: no (usa precio pagado de la línea).
 */
export function shouldAskExchangeDiscount({ differenceMode, exchangeMode } = {}) {
  if (differenceMode === EXCHANGE_DIFFERENCE_WITH) return true;
  return differenceMode === EXCHANGE_DIFFERENCE_NONE && exchangeMode === "FREE";
}

export function sumGivenLineAmounts(lines = []) {
  return roundExchangeMoney(
    (lines || []).reduce((sum, line) => {
      const qty = Number(line?.quantity || 0);
      const unit = Number(line?.unitPrice || 0);
      const total = line?.lineTotal != null ? Number(line.lineTotal) : unit * qty;
      return sum + total;
    }, 0)
  );
}

export function applyExchangePackagingCredit({
  productReturnedAmount,
  productGivenAmount,
} = {}) {
  const productReturned = roundExchangeMoney(productReturnedAmount);
  const productGiven = roundExchangeMoney(productGivenAmount);
  // El empaque de la factura original nunca entra en un cambio.
  const packagingReturnedAmount = 0;
  const returnedAmount = roundExchangeMoney(productReturned + packagingReturnedAmount);
  const givenAmount = productGiven;
  return {
    packagingReturnedAmount,
    returnedAmount,
    givenAmount,
    differenceAmount: roundExchangeMoney(givenAmount - returnedAmount),
  };
}

/** Toda diferencia es válida; negativa = saldo a favor del cliente (sin reembolso). */
export function isExchangeDifferenceAllowed(differenceAmount) {
  const value = roundExchangeMoney(differenceAmount);
  return Number.isFinite(value);
}
