import {
  applyExchangePackagingCredit,
  isExchangeDifferenceAllowed,
  sumGivenLineAmounts,
} from "../kioskExchangeSettlement";

describe("applyExchangePackagingCredit", () => {
  it("ignores packaging when product prices are equal", () => {
    const result = applyExchangePackagingCredit({
      productReturnedAmount: 180,
      productGivenAmount: 180,
      packagingCredit: 15,
    });
    expect(result).toEqual({
      packagingReturnedAmount: 0,
      returnedAmount: 180,
      givenAmount: 180,
      differenceAmount: 0,
    });
  });

  it("includes packaging when product prices differ", () => {
    const result = applyExchangePackagingCredit({
      productReturnedAmount: 180,
      productGivenAmount: 250,
      packagingCredit: 15,
    });
    expect(result).toEqual({
      packagingReturnedAmount: 15,
      returnedAmount: 195,
      givenAmount: 250,
      differenceAmount: 55,
    });
  });

  it("computes negative difference as customer credit (no refund)", () => {
    const result = applyExchangePackagingCredit({
      productReturnedAmount: 250,
      productGivenAmount: 180,
      packagingCredit: 15,
    });
    expect(result).toEqual({
      packagingReturnedAmount: 15,
      returnedAmount: 265,
      givenAmount: 180,
      differenceAmount: -85,
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
