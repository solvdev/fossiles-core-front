import {
  buildPositiveSizes,
  cinchoItemSizesError,
  firstCinchoSizesError,
  isBeltProductionItem,
  sizesPayload,
  sumPositiveSizes,
} from "../productionOrderItemSizes";

describe("productionOrderItemSizes", () => {
  const cincho = { id: 1, code: "FOSS-01", name: "Cincho Casual" };
  const wallet = { id: 2, code: "BILL-01", name: "Billetera" };
  const catalog = { 1: cincho, 2: wallet };

  test("buildPositiveSizes omits zeros, trims and upper-cases keys", () => {
    expect(
      buildPositiveSizes({ " 32 ": 2, "34": "1", "36": 0, " s ": 3, "": 4 })
    ).toEqual({ "32": 2, "34": 1, S: 3 });
    expect(buildPositiveSizes(null)).toEqual({});
    expect(buildPositiveSizes([])).toEqual({});
  });

  test("sizesPayload drops empty maps", () => {
    expect(sizesPayload({ "32": 2, "34": 0 })).toEqual({ "32": 2 });
    expect(sizesPayload({ "32": 0 })).toBeNull();
    expect(sizesPayload(null)).toBeNull();
  });

  test("sumPositiveSizes sums only positive quantities", () => {
    expect(sumPositiveSizes({ "32": 2, "34": 1, "36": 0 })).toBe(3);
    expect(sumPositiveSizes({})).toBe(0);
  });

  test("isBeltProductionItem reuses cincho detection for any order type", () => {
    expect(isBeltProductionItem({ productId: 1 }, catalog, "NORMAL")).toBe(true);
    expect(isBeltProductionItem({ productId: 2 }, catalog, "NORMAL")).toBe(false);
    expect(isBeltProductionItem({ productId: 2 }, catalog, "CINCHOS")).toBe(true);
    expect(
      isBeltProductionItem(
        { productCode: "X-1", productName: "Cincho reversible" },
        {},
        "CLIENTE_KIOSKO"
      )
    ).toBe(true);
    expect(
      isBeltProductionItem({ productCode: "X-1", productName: "Billetera" }, {}, "INTERNA")
    ).toBe(false);
  });

  test("cinchoItemSizesError names the product when sum !== quantity", () => {
    const item = { productId: 1, quantity: 5, sizes: { "32": 2, "34": 1 } };
    expect(cinchoItemSizesError(item, catalog, "NORMAL")).toBe(
      'Las tallas de "FOSS-01 - Cincho Casual" deben sumar la cantidad del ítem (5), pero suman 3.'
    );
    expect(
      cinchoItemSizesError({ productId: 1, quantity: 3, sizes: { "32": 2, "34": 1 } }, catalog, "NORMAL")
    ).toBeNull();
    expect(
      cinchoItemSizesError({ productId: 1, quantity: null, sizes: { "32": 2 } }, catalog, "NORMAL")
    ).toBeNull();
    expect(
      cinchoItemSizesError({ productId: 2, quantity: 5, sizes: { "32": 1 } }, catalog, "NORMAL")
    ).toBeNull();
  });

  test("firstCinchoSizesError returns the first mismatch", () => {
    const items = [
      { productId: 2, quantity: 4 },
      { productId: 1, quantity: 5, sizes: { "32": 2 } },
    ];
    expect(firstCinchoSizesError(items, catalog, "OPV")).toMatch(/FOSS-01 - Cincho Casual/);
    expect(firstCinchoSizesError([{ productId: 2, quantity: 4 }], catalog, "NORMAL")).toBeNull();
  });
});
