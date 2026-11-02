import { applyEntrecuerosCartPrices, resolveCartDiscount } from "./posUtils";
import {
  buildPosSaleItem,
  canEditPosPrices,
  cartLinesForEntrecuerosVolume,
} from "./posPriceOverride";

const percent10 = {
  id: "__percent_10",
  name: "Descuento 10%",
  discountType: "PERCENT",
  discountValue: 10,
  isQuickPercent: true,
};

function line(fields) {
  return {
    productId: 1,
    colorId: null,
    size: null,
    hardwareCondition: "NUEVO",
    quantity: 1,
    catalogUnitPrice: 100,
    unitPrice: 100,
    priceEdited: false,
    unitPriceEdited: false,
    ...fields,
  };
}

function chargedTotal(cart) {
  const subtotal = cart.reduce(
    (sum, row) => sum + Number(row.quantity || 0) * Number(row.unitPrice || 0),
    0
  );
  const { discount } = resolveCartDiscount(cart, {
    selectedPromotion: percent10,
    promotions: [],
    subtotal,
  });
  return Math.round((subtotal - discount) * 100) / 100;
}

describe("buildPosSaleItem", () => {
  test("edited Final sends unitPrice and priceFinal true", () => {
    const item = buildPosSaleItem(line({
      unitPrice: 80,
      priceEdited: true,
      unitPriceEdited: true,
    }));
    expect(item).toMatchObject({ unitPrice: 80, priceFinal: true });
    expect(item).not.toHaveProperty("priceOverride");
    expect(item).not.toHaveProperty("unitPriceEdited");
  });

  test("edited Con desc. sends the typed price and priceFinal false", () => {
    const item = buildPosSaleItem(line({
      unitPrice: 80,
      priceEdited: false,
      unitPriceEdited: true,
    }));
    expect(item).toMatchObject({ unitPrice: 80, priceFinal: false });
    expect(item).not.toHaveProperty("priceOverride");
  });

  test("not edited omits unitPrice and priceFinal even if the chip is Final", () => {
    const item = buildPosSaleItem(line({
      catalogUnitPrice: 100,
      unitPrice: 100,
      priceEdited: true,
      unitPriceEdited: false,
    }));
    expect(item.unitPrice).toBeUndefined();
    expect(item.priceFinal).toBeUndefined();
  });

  test("catalog zero sends unitPrice and priceFinal true unless the chip is Con desc.", () => {
    const finalPrice = buildPosSaleItem(line({
      catalogUnitPrice: 0,
      unitPrice: 15,
      priceEdited: true,
      unitPriceEdited: false,
    }));
    expect(finalPrice).toMatchObject({ unitPrice: 15, priceFinal: true });

    const conDesc = buildPosSaleItem(line({
      catalogUnitPrice: 0,
      unitPrice: 15,
      priceEdited: false,
      unitPriceEdited: false,
    }));
    expect(conDesc).toMatchObject({ unitPrice: 15, priceFinal: false });

    const empty = buildPosSaleItem(line({
      catalogUnitPrice: 0,
      unitPrice: 0,
      priceEdited: true,
    }));
    expect(empty.unitPrice).toBeUndefined();
    expect(empty.priceFinal).toBeUndefined();
  });
});

describe("canEditPosPrices", () => {
  test("admin can edit on any kiosk", () => {
    expect(canEditPosPrices({ admin: true, kioskCode: "A01", kioskName: "Centro" })).toBe(true);
  });

  test("Miraflores can edit by code or name", () => {
    expect(canEditPosPrices({ admin: false, kioskCode: "A15", kioskName: "Otro" })).toBe(true);
    expect(canEditPosPrices({
      admin: false,
      kioskCode: "B2",
      kioskName: "Kiosco Miraflores",
    })).toBe(true);
  });

  test("a regular kiosk cannot edit prices", () => {
    expect(canEditPosPrices({ admin: false, kioskCode: "A01", kioskName: "Kiosko Centro" })).toBe(false);
  });
});

describe("POS charge total", () => {
  test("Final uses the edited price with no discount; Con desc. discounts that price", () => {
    const cart = [
      line({ key: "final", unitPrice: 80, priceEdited: true, unitPriceEdited: true }),
      line({ key: "desc", unitPrice: 80, priceEdited: false, unitPriceEdited: true }),
      line({ key: "list", unitPrice: 100, priceEdited: false, unitPriceEdited: false }),
    ];
    expect(chargedTotal(cart)).toBe(242);
  });

  test("a Final chip without an edited amount still takes the discount", () => {
    const cart = [line({ unitPrice: 100, priceEdited: true, unitPriceEdited: false })];
    expect(chargedTotal(cart)).toBe(90);
  });

  test("catalog zero Con desc. discounts the captured price", () => {
    const cart = [line({
      catalogUnitPrice: 0,
      unitPrice: 15,
      priceEdited: false,
      unitPriceEdited: false,
    })];
    expect(chargedTotal(cart)).toBe(13.5);
  });
});

function casual(quantity, extra = {}) {
  return {
    productId: extra.productId || "CASUAL",
    productName: "Cincho casual",
    productCode: extra.productCode || "C-1",
    cinchoType: "CASUAL",
    quantity,
    catalogUnitPrice: 125,
    unitPrice: 125,
    ...extra,
  };
}

function billetera(quantity, extra = {}) {
  return {
    productId: extra.productId || "BILL",
    productName: "Billetera caballero",
    productCode: "BL-1",
    quantity,
    catalogUnitPrice: 125,
    unitPrice: 125,
    ...extra,
  };
}

describe("applyEntrecuerosCartPrices edited lines", () => {
  test("keeps the edited price and does not move the other line's tier", () => {
    const edited = casual(1, {
      productId: "CASUAL-B",
      productCode: "C-B",
      unitPrice: 40,
      unitPriceEdited: true,
    });
    const other = casual(5, { productId: "CASUAL-A", productCode: "C-A" });
    const priced = applyEntrecuerosCartPrices([other, edited]);

    expect(priced[0].unitPrice).toBe(110);
    expect(priced[0].lineTotal).toBe(550);
    expect(priced[1].unitPrice).toBe(40);
    expect(priced[1].lineTotal).toBe(40);
    expect(priced[1].unitPriceEdited).toBe(true);

    const counted = applyEntrecuerosCartPrices([
      casual(5, { productId: "CASUAL-A", productCode: "C-A" }),
      casual(1, { productId: "CASUAL-B", productCode: "C-B" }),
    ]);
    expect(counted.map((row) => row.unitPrice)).toEqual([95, 95]);
    expect(cartLinesForEntrecuerosVolume([other, edited])).toHaveLength(1);
  });

  test("an edited line does not unlock the wholesale tier for another type", () => {
    const priced = applyEntrecuerosCartPrices([
      casual(6, { unitPrice: 50, unitPriceEdited: true }),
      billetera(1),
    ]);
    expect(priced[0].unitPrice).toBe(50);
    expect(priced[1].unitPrice).toBe(125);
  });
});
