/**
 * Liquidación de cambio kiosko: el empaque SUM de la factura original
 * solo entra cuando hay diferencia de precio entre productos (no empaque).
 */
export function roundExchangeMoney(value) {
  return Number((Number(value || 0)).toFixed(2));
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
