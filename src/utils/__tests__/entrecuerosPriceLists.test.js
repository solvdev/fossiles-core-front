import { applyEntrecuerosCartPrices, describeEntrecuerosPriceState } from "../../views/kiosks/pos/posUtils";
import {
  ENTRECUEROS_PRICE_KIND,
  cartUnlocksEntrecuerosWholesale,
  entrecuerosPriceKind,
  entrecuerosVolumeKey,
  sumEntrecuerosLineTotals,
} from "../entrecuerosPriceLists";

/**
 * Rows are plain carts so a shared case table (pricing/entrecueros-wholesale-cases.json)
 * can be mapped onto the same shape later without changing the assertions.
 */
function line(fields) {
  return {
    productId: fields.productId ?? fields.productCode ?? fields.productName,
    quantity: 1,
    ...fields,
  };
}

function tiers(prices) {
  return {
    entrecuerosPriceUnit: prices[1],
    entrecuerosPriceQty3: prices[3],
    entrecuerosPriceQty6: prices[6],
    entrecuerosPriceQty12: prices[12],
  };
}

const casual = (quantity, extra = {}) => line({
  productName: "Cincho casual",
  productCode: "C-1",
  cinchoType: "CASUAL",
  quantity,
  ...extra,
});

const billetera = (quantity, extra = {}) => line({
  productName: "Billetera caballero",
  productCode: "BL-1",
  quantity,
  ...extra,
});

const nino = (quantity, extra = {}) => line({
  productName: "Cincho niño",
  productCode: "C-N",
  cinchoType: "CASUAL",
  hardwareCondition: "NINO",
  quantity,
  ...extra,
});

const dama = (quantity, extra = {}) => line({
  productName: "Cincho dama",
  productCode: "C-D",
  cinchoType: "CASUAL",
  hardwareCondition: "DAMA",
  quantity,
  ...extra,
});

const sintetica = (quantity, extra = {}) => line({
  productName: "Billetera",
  productCode: "B-20",
  hardwareCondition: "SINTETICO",
  quantity,
  ...extra,
});

const tarjetero = (quantity, extra = {}) => line({
  productName: "Tarjetero",
  productCode: "T-1",
  quantity,
  ...extra,
});

const reversible = (quantity, extra = {}) => line({
  productName: "Cincho reversible",
  productCode: "R-1",
  cinchoType: "REVERSIBLE",
  quantity,
  ...extra,
});

const packaging = (quantity, catalogPrice = 5) => line({
  productName: "Bolsa",
  productCode: "SUM-BOLSA",
  isPackaging: true,
  catalogPrice,
  catalogUnitPrice: catalogPrice,
  quantity,
});

const untyped = (quantity, extra = {}) => line({
  productName: "Monedero piel",
  productCode: "M-1",
  productId: extra.productId || "SKU-A",
  quantity,
  ...extra,
});

function priced(cart) {
  const lines = applyEntrecuerosCartPrices(cart);
  return { lines, total: sumEntrecuerosLineTotals(lines) };
}

function expectPrices(cart, unitPrices, total) {
  const result = priced(cart);
  expect(result.lines.map((row) => row.unitPrice)).toEqual(unitPrices);
  expect(result.lines.map((row) => row.lineTotal)).toEqual(
    unitPrices.map((price, index) => Math.round(price * cart[index].quantity * 100) / 100)
  );
  expect(result.total).toBe(total);
  return result;
}

describe("Entrecueros wholesale acceptance", () => {
  const cases = [
    {
      name: "12 casual + 1 leather billetera",
      cart: [casual(12), billetera(1)],
      prices: [75, 55],
      total: 955,
      courtesy: true,
    },
    {
      name: "6 leather billeteras + 6 casual cinchos stay on their own tiers",
      cart: [billetera(6), casual(6)],
      prices: [55, 80],
      total: 810,
      courtesy: true,
    },
    {
      name: "3 billeteras + 3 casual cinchos do not unlock courtesy",
      cart: [billetera(3), casual(3)],
      prices: [65, 90],
      total: 465,
      courtesy: false,
    },
    {
      name: "20 billeteras + 1 casual cincho",
      cart: [billetera(20), casual(1)],
      prices: [55, 75],
      total: 1175,
      courtesy: true,
    },
    {
      name: "6 casual cinchos + 1 billetera keeps the cincho 6+ price",
      cart: [casual(6), billetera(1)],
      prices: [80, 55],
      total: 535,
      courtesy: true,
    },
  ];

  test.each(cases)("$name", ({ cart, prices, total, courtesy }) => {
    expectPrices(cart, prices, total);
    expect(cartUnlocksEntrecuerosWholesale(cart)).toBe(courtesy);
  });
});

describe("Entrecueros own-quantity edges", () => {
  test.each([
    [2, 100],
    [3, 90],
    [5, 90],
    [6, 80],
    [11, 80],
    [12, 75],
  ])("casual qty %s -> %s", (quantity, price) => {
    expectPrices([casual(quantity)], [price], price * quantity);
  });

  test.each([
    [2, 100],
    [3, 65],
    [5, 65],
    [6, 55],
  ])("leather billetera qty %s -> %s", (quantity, price) => {
    expectPrices([billetera(quantity)], [price], price * quantity);
  });

  test("6 casual stays at Q80 and does not jump to the 12+ price", () => {
    const [row] = applyEntrecuerosCartPrices([casual(6)]);
    expect(row.unitPrice).toBe(80);
    const state = describeEntrecuerosPriceState(casual(6), 6, false);
    expect(state.active).toMatchObject({ minQty: 6, unitPrice: 80 });
    const courtesy = describeEntrecuerosPriceState(casual(1), 1, true);
    expect(courtesy.active).toMatchObject({ minQty: 12, unitPrice: 75 });
  });
});

describe("Entrecueros volume groups and courtesy", () => {
  test("5 + 1 of two casual products reach 6 and unlock another type", () => {
    const cart = [
      casual(5, { productId: "CASUAL-A", productCode: "C-A" }),
      casual(1, { productId: "CASUAL-B", productCode: "C-B" }),
      billetera(1),
    ];
    expect(entrecuerosVolumeKey(cart[0])).toBe(entrecuerosVolumeKey(cart[1]));
    expectPrices(cart, [80, 80, 55], 400 + 80 + 55);
    expect(cartUnlocksEntrecuerosWholesale(cart)).toBe(true);
  });

  test("6 packaging units unlock nothing and keep the catalog price", () => {
    const cart = [packaging(6, 5), billetera(1), casual(2)];
    expectPrices(cart, [5, 100, 100], 30 + 100 + 200);
    expect(cartUnlocksEntrecuerosWholesale(cart)).toBe(false);
  });

  test("packaging does not receive courtesy", () => {
    expectPrices([casual(6), packaging(2, 5)], [80, 5], 480 + 10);
  });

  test("courtesy top for niño, dama, sintética, tarjetero, reversible, and B-1", () => {
    const cart = [
      casual(6),
      nino(1),
      dama(2),
      sintetica(1),
      tarjetero(1),
      reversible(2, { hardwareCondition: "DAMA" }),
      sintetica(2, { productCode: "B-1", productId: "B1" }),
    ];
    expectPrices(cart, [80, 45, 60, 30, 6, 100, 40], 480 + 45 + 120 + 30 + 6 + 200 + 80);
  });

  test("B-1 shares the sintética quantity and stays at Q40", () => {
    const cart = [
      sintetica(4, { productCode: "B-1", productId: "B1" }),
      sintetica(2, { productCode: "B-20", productId: "SYN" }),
      billetera(1),
    ];
    expect(entrecuerosVolumeKey(cart[0])).toBe(entrecuerosVolumeKey(cart[1]));
    expect(entrecuerosVolumeKey(cart[0])).toBe(ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC);
    expectPrices(cart, [40, 30, 55], 160 + 60 + 55);
  });

  test.each([
    ["B1", 2, 40],
    [" b-1 ", 3, 40],
    ["B-10", 3, 30],
    ["B-19", 3, 30],
    ["B-100", 3, 30],
  ])("synthetic code %j qty %s -> %s", (productCode, quantity, price) => {
    expectPrices(
      [sintetica(quantity, { productCode, productId: productCode })],
      [price],
      price * quantity
    );
  });

  test("B-10 and B-100 receive the sintética courtesy price", () => {
    expectPrices(
      [
        casual(6),
        sintetica(1, { productCode: "B-10", productId: "B10" }),
        sintetica(1, { productCode: "B-100", productId: "B100" }),
      ],
      [80, 30, 30],
      480 + 30 + 30
    );
  });

  test("6 reversible unlocks courtesy for the other type and stays at Q100", () => {
    expectPrices([reversible(6), billetera(1)], [100, 55], 600 + 55);
  });
});

describe("Entrecueros configured casual and untyped products", () => {
  test("configured casual uses its own 6+ tier", () => {
    expectPrices(
      [casual(6, tiers({ 1: 110, 3: 95, 6: 85, 12: 70 }))],
      [85],
      510
    );
  });

  test("configured casual courtesy uses its 12+ tier", () => {
    expectPrices(
      [billetera(6), casual(1, tiers({ 1: 110, 3: 95, 6: 85, 12: 70 }))],
      [55, 70],
      400
    );
  });

  test("partial casual tiers fall through, and courtesy uses the highest set tier", () => {
    const partial = tiers({ 1: 110, 6: 85 });
    expectPrices([casual(4, partial)], [110], 440);
    expectPrices([billetera(6), casual(2, partial)], [55, 85], 500);
  });

  test("untyped product is priced by its own quantity and can trigger courtesy", () => {
    const sku = untyped(6, { productId: "SKU-A", ...tiers({ 1: 50, 3: 45, 6: 40, 12: 35 }) });
    expect(entrecuerosVolumeKey(sku)).toBe("SKU-A|PRODUCT");
    expectPrices([sku, billetera(1)], [40, 55], 240 + 55);
    expect(cartUnlocksEntrecuerosWholesale([sku, billetera(1)])).toBe(true);
  });

  test("two untyped products are separate groups and do not unlock each other", () => {
    const cart = [
      untyped(3, { productId: "SKU-A", ...tiers({ 1: 50, 3: 45, 6: 40, 12: 35 }) }),
      untyped(3, { productId: "SKU-N", catalogPrice: 120, catalogUnitPrice: 120 }),
    ];
    expect(entrecuerosVolumeKey(cart[0])).not.toBe(entrecuerosVolumeKey(cart[1]));
    expectPrices(cart, [45, 120], 135 + 360);
    expect(cartUnlocksEntrecuerosWholesale(cart)).toBe(false);
  });

  test("untyped courtesy uses 12, else 6, else 3, else unit, else catalog", () => {
    const rows = [
      untyped(1, { productId: "SKU-A", ...tiers({ 1: 50, 3: 45, 6: 40, 12: 35 }) }),
      untyped(1, { productId: "SKU-B", ...tiers({ 1: 50, 6: 40 }) }),
      untyped(1, { productId: "SKU-C", ...tiers({ 1: 50, 3: 45 }) }),
      untyped(2, { productId: "SKU-D", ...tiers({ 1: 50 }) }),
      untyped(1, { productId: "SKU-N", catalogPrice: 120, catalogUnitPrice: 120 }),
    ];
    expectPrices([casual(6), ...rows], [80, 35, 40, 45, 50, 120], 480 + 35 + 40 + 45 + 100 + 120);
  });

  test("repricing keeps the catalog fallback instead of the previous tier price", () => {
    const once = applyEntrecuerosCartPrices([
      untyped(4, {
        productId: "SKU-A",
        suggestedUnitPrice: 120,
        entrecuerosPriceQty3: 45,
      }),
    ]);
    expect(once[0].unitPrice).toBe(45);
    expect(once[0].catalogUnitPrice).toBe(120);
    const twice = applyEntrecuerosCartPrices([{ ...once[0], quantity: 1 }]);
    expect(twice[0].unitPrice).toBe(120);
  });

  test("a client unit price on the open cart is replaced by the list price", () => {
    expectPrices([casual(12, { unitPrice: 100 }), billetera(1, { unitPrice: 100 })], [75, 55], 955);
  });

  test("rounds each line to Q0.01 and sums the rounded lines", () => {
    const cart = [
      casual(13, tiers({ 1: 99.99, 3: 89.95, 6: 79.97, 12: 74.99 })),
      billetera(1),
    ];
    const result = expectPrices(cart, [74.99, 55], 974.87 + 55);
    expect(result.lines[0].lineTotal).toBe(974.87);
    expectPrices(
      [casual(3, tiers({ 1: 40, 3: 33.33 }))],
      [33.33],
      99.99
    );
  });
});

describe("Entrecueros classification", () => {
  const kind = (fields) => entrecuerosPriceKind({
    productId: 1,
    productCode: "X-1",
    productName: "Item",
    ...fields,
  });

  test("reversible with niño or dama hardware stays reversible", () => {
    expect(kind({
      productName: "Cincho reversible",
      cinchoType: "REVERSIBLE",
      hardwareCondition: "NINO",
    })).toBe(ENTRECUEROS_PRICE_KIND.REVERSIBLE);
    expect(kind({
      productName: "Cincho reversible",
      cinchoType: "reversible",
      hardwareCondition: "DAMA",
    })).toBe(ENTRECUEROS_PRICE_KIND.REVERSIBLE);
  });

  test("cinchoForKids without an audience is casual", () => {
    expect(kind({
      productName: "Cincho junior",
      productCode: "N-113-JR",
      cinchoType: "CASUAL",
      cinchoForKids: true,
    })).toBe(ENTRECUEROS_PRICE_KIND.CASUAL);
  });

  test("Niña hardware is dama and Niño hardware is niño", () => {
    expect(kind({
      productName: "Cincho",
      cinchoType: "CASUAL",
      hardwareCondition: "Niña",
    })).toBe(ENTRECUEROS_PRICE_KIND.DAMA);
    expect(kind({
      productName: "Cincho",
      cinchoType: "CASUAL",
      hardwareCondition: "Niño",
    })).toBe(ENTRECUEROS_PRICE_KIND.NINO);
  });

  test("NOSINTETICO billetera is leather", () => {
    expect(kind({
      productName: "Billetera",
      hardwareCondition: "NOSINTETICO",
    })).toBe(ENTRECUEROS_PRICE_KIND.WALLET_LEATHER);
    expect(kind({
      productName: "Billetera",
      hardwareCondition: "NO_SINTETICO",
    })).toBe(ENTRECUEROS_PRICE_KIND.WALLET_LEATHER);
  });

  test("FOSS code without a cincho name is casual", () => {
    expect(kind({
      productCode: "FOSS-300",
      productName: "Piel genuina 300",
    })).toBe(ENTRECUEROS_PRICE_KIND.CASUAL);
  });

  test("SUM prefix, including SUMX, is packaging", () => {
    expect(kind({ productCode: "SUMX", productName: "Sumatra billetera" }))
      .toBe(ENTRECUEROS_PRICE_KIND.PACKAGING);
    expect(kind({
      productCode: " sum-caja ",
      productName: "Caja cincho",
      cinchoType: "CASUAL",
    })).toBe(ENTRECUEROS_PRICE_KIND.PACKAGING);
  });

  test("wallet and cincho words in the code or category do not set the type", () => {
    expect(kind({ productName: "Wallet slim", productCode: "W-1" }))
      .toBe(ENTRECUEROS_PRICE_KIND.PRODUCT);
    expect(kind({ productName: "Cartera", productCode: "BILLETERA-9" }))
      .toBe(ENTRECUEROS_PRICE_KIND.PRODUCT);
    expect(kind({
      productName: "Correa",
      productCode: "CINCHO-9",
      categoryName: "Cinchos",
    })).toBe(ENTRECUEROS_PRICE_KIND.PRODUCT);
  });

  test("tarjetero wins over synthetic hardware", () => {
    expect(kind({ productName: "tarjetero", hardwareCondition: "SINTETICO" }))
      .toBe(ENTRECUEROS_PRICE_KIND.CARDHOLDER_SYNTHETIC);
  });

  test("another synthetic product uses the sintética list", () => {
    expect(kind({ productName: "Monedero", hardwareCondition: "SINTETICA" }))
      .toBe(ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC);
  });
});
