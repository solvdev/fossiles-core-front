import {
  applyExchangePackagingCredit,
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

  it("includes packaging when the given product is cheaper", () => {
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
  });
});
