import {
  applyExchangePackagingCredit,
  EXCHANGE_DIFFERENCE_NONE,
  EXCHANGE_DIFFERENCE_WITH,
  EXCHANGE_PRICING_CATALOG_GIVEN,
  EXCHANGE_PRICING_SAME_UNIT,
  isExchangeDifferenceAllowed,
  resolveExchangePricingMode,
  shouldAskExchangeDiscount,
  sumGivenLineAmounts,
} from "../kioskExchangeSettlement";

describe("applyExchangePackagingCredit", () => {
  it("ignores packaging when product prices are equal", () => {
    const result = applyExchangePackagingCredit({
      productReturnedAmount: 180,
      productGivenAmount: 180,
    });
    expect(result).toEqual({
      packagingReturnedAmount: 0,
      returnedAmount: 180,
      givenAmount: 180,
      differenceAmount: 0,
    });
  });

  it("ignores packaging even when product prices differ", () => {
    const result = applyExchangePackagingCredit({
      productReturnedAmount: 180,
      productGivenAmount: 250,
    });
    expect(result).toEqual({
      packagingReturnedAmount: 0,
      returnedAmount: 180,
      givenAmount: 250,
      differenceAmount: 70,
    });
  });

  it("computes negative difference as customer credit (no refund)", () => {
    const result = applyExchangePackagingCredit({
      productReturnedAmount: 250,
      productGivenAmount: 180,
    });
    expect(result).toEqual({
      packagingReturnedAmount: 0,
      returnedAmount: 250,
      givenAmount: 180,
      differenceAmount: -70,
    });
    expect(isExchangeDifferenceAllowed(result.differenceAmount)).toBe(true);
  });
});

describe("sumGivenLineAmounts", () => {
  it("sums multiple given lines", () => {
    expect(
      sumGivenLineAmounts([
        { quantity: 1, unitPrice: 250 },
        { quantity: 2, unitPrice: 40 },
      ])
    ).toBe(330);
  });
});

describe("isExchangeDifferenceAllowed", () => {
  it("allows zero and positive", () => {
    expect(isExchangeDifferenceAllowed(0)).toBe(true);
    expect(isExchangeDifferenceAllowed(10)).toBe(true);
  });

  it("allows negative (customer credit)", () => {
    expect(isExchangeDifferenceAllowed(-0.01)).toBe(true);
  });
});

describe("resolveExchangePricingMode / shouldAskExchangeDiscount", () => {
  it("maps NONE to SAME_UNIT_PRICE and WITH to CATALOG_GIVEN", () => {
    expect(resolveExchangePricingMode(EXCHANGE_DIFFERENCE_NONE)).toBe(EXCHANGE_PRICING_SAME_UNIT);
    expect(resolveExchangePricingMode(EXCHANGE_DIFFERENCE_WITH)).toBe(EXCHANGE_PRICING_CATALOG_GIVEN);
  });

  it("asks discount for WITH always", () => {
    expect(shouldAskExchangeDiscount({ differenceMode: EXCHANGE_DIFFERENCE_WITH, exchangeMode: "SALE" })).toBe(true);
    expect(shouldAskExchangeDiscount({ differenceMode: EXCHANGE_DIFFERENCE_WITH, exchangeMode: "FREE" })).toBe(true);
  });

  it("asks discount for NONE only on FREE (not SALE)", () => {
    expect(shouldAskExchangeDiscount({ differenceMode: EXCHANGE_DIFFERENCE_NONE, exchangeMode: "FREE" })).toBe(true);
    expect(shouldAskExchangeDiscount({ differenceMode: EXCHANGE_DIFFERENCE_NONE, exchangeMode: "SALE" })).toBe(false);
  });
});
