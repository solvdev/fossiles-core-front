/**
 * Liquidación de cambio kiosko: el empaque SUM de la factura original
 * solo entra cuando hay diferencia de precio entre productos (no empaque).
 * Soporta 1→N sumando montos de productos entregados.
 */
export function roundExchangeMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
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
  packagingCredit,
} = {}) {
  const productReturned = roundExchangeMoney(productReturnedAmount);
  const productGiven = roundExchangeMoney(productGivenAmount);
  const credit = roundExchangeMoney(packagingCredit);
  const packagingReturnedAmount =
    productGiven === productReturned ? 0 : credit;
  const returnedAmount = roundExchangeMoney(productReturned + packagingReturnedAmount);
  const givenAmount = productGiven;
  return {
    packagingReturnedAmount,
    returnedAmount,
    givenAmount,
    differenceAmount: roundExchangeMoney(givenAmount - returnedAmount),
  };
}

/** Regla de negocio: solo diferencia ≥ 0 (cobro o sin diferencia). */
export function isExchangeDifferenceAllowed(differenceAmount) {
  return roundExchangeMoney(differenceAmount) >= 0;
}
