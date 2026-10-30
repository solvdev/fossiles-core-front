import { resolveShipmentLinesForPrint } from "./partialReleaseHelper";
import {
  applyOrderItemPricesToShipmentProducts,
  buildShipmentProductsReplacePayload,
  expandShipmentProductsForOpvPriceLines,
  mapShipmentProductsForOpvPrint,
  mergeShipmentDetailForReprint,
  savedNumberOrFallback,
} from "./prepareShipmentsOrderHelper";

const order = {
  orderType: "MARCAS",
  sellerName: "Luis Felipe",
  items: [
    {
      productId: 10,
      colorId: 3,
      productCode: "P-10",
      productName: "Zapato",
      quantity: 10,
      unitPrice: 50,
      sizes: { "38": 4, "39": 6 },
      unitPrices: { "38": 50, "39": 55 },
    },
  ],
  packingItems: [{ materialId: 9, quantity: 4, unitPrice: 3 }],
  shippingCost: 40,
  observations: "Notas de la OP",
};

describe("prepareShipmentsOrderHelper — reimpresión conserva lo guardado", () => {
  it("mantiene unitPrice y cantidades del envío; solo rellena precio si viene vacío", () => {
    const products = [
      { productId: 10, colorId: 3, size: "38", quantity: 2, unitPrice: 88 },
      { productId: 10, colorId: 3, size: "39", quantity: 1 },
    ];
    const priced = applyOrderItemPricesToShipmentProducts(order, products);
    expect(priced[0]).toMatchObject({ quantity: 2, unitPrice: 88 });
    expect(priced[1]).toMatchObject({ quantity: 1, unitPrice: 55 });
  });

  it("la revisión de precios abre con el unitPrice guardado, no el de la OP", () => {
    const lines = expandShipmentProductsForOpvPriceLines(order, [
      { productId: 10, colorId: 3, size: "38", quantity: 2, unitPrice: 88 },
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(2);
    expect(lines[0].unitPrice).toBe(88);
  });

  it("el detalle GET gana en productos, empaque, notas y costo de envío", () => {
    const listed = {
      id: 99,
      products: [{ productId: 10, quantity: 10, unitPrice: 50 }],
      packingItems: [{ materialId: 1, quantity: 9, unitPrice: 1 }],
      notes: "listado",
      shippingCost: 40,
    };
    const detail = {
      id: 99,
      products: [{ productId: 10, size: "38", quantity: 2, unitPrice: 88, hardwareCondition: "NUEVO" }],
      packingItems: [{ materialId: 7, quantity: 3, unitPrice: 2 }],
      notes: "Observación editada",
      shippingCost: 0,
    };
    const merged = mergeShipmentDetailForReprint(listed, detail);
    expect(merged.products).toEqual(detail.products);
    expect(merged.packingItems).toEqual(detail.packingItems);
    expect(merged.notes).toBe("Observación editada");
    expect(merged.shippingCost).toBe(0);
  });

  it("no sustituye empaque/notas vacíos guardados con los de la OP", () => {
    const detail = {
      id: 99,
      products: [{ productId: 10, quantity: 2, unitPrice: 88 }],
      packingItems: [],
      notes: "",
      shippingCost: 0,
    };
    const merged = mergeShipmentDetailForReprint(
      { packingItems: order.packingItems, notes: order.observations, shippingCost: order.shippingCost },
      detail
    );
    expect(merged.packingItems).toEqual([]);
    expect(merged.notes).toBe("");
    expect(merged.shippingCost).toBe(0);
  });

  it("PUT /products envía size, hardwareCondition y unitPrice en cada línea", () => {
    expect(
      buildShipmentProductsReplacePayload([
        {
          productId: 10,
          colorId: 3,
          size: "38",
          hardwareCondition: "NUEVO",
          unitPrice: 88,
          quantity: 2,
        },
      ])
    ).toEqual([
      {
        productId: 10,
        colorId: 3,
        size: "38",
        hardwareCondition: "NUEVO",
        unitPrice: 88,
        quantity: 2,
      },
    ]);
  });
});

describe("prepareShipmentsOrderHelper — GET /shipments/{id} hidrata ediciones y reimprime", () => {
  const listedFromOrder = {
    id: 99,
    partialReleaseId: 7,
    products: [{ productId: 10, colorId: 3, size: "38", quantity: 10, unitPrice: 50 }],
    packingItems: order.packingItems,
    notes: order.observations,
    shippingCost: 40,
  };

  const savedDetail = {
    id: 99,
    partialReleaseId: 7,
    products: [
      {
        productId: 10,
        colorId: 3,
        size: "38",
        quantity: 2,
        unitPrice: 88,
        hardwareCondition: "NUEVO",
      },
    ],
    packingItems: [{ materialId: 7, quantity: 3, unitPrice: 2 }],
    notes: "Observación editada del envío",
    shippingCost: 12,
  };

  const partialList = {
    releases: [
      {
        id: 7,
        shipmentId: 99,
        lines: [{ productId: 10, productCode: "P-10", sizes: { "38": 4, "39": 6 }, quantity: 10 }],
      },
    ],
  };

  const printFromHydrated = (hydrated) =>
    applyOrderItemPricesToShipmentProducts(
      order,
      resolveShipmentLinesForPrint(hydrated, order, partialList)
    );

  it("el estado hidratado y la impresión usan unitPrice, cantidad, empaque, notas y flete guardados", () => {
    const hydrated = mergeShipmentDetailForReprint(listedFromOrder, savedDetail);
    expect(hydrated.products).toEqual(savedDetail.products);
    expect(hydrated.packingItems).toEqual(savedDetail.packingItems);
    expect(hydrated.notes).toBe("Observación editada del envío");
    expect(hydrated.shippingCost).toBe(12);

    const printLines = printFromHydrated(hydrated);
    expect(printLines).toHaveLength(1);
    expect(printLines[0]).toMatchObject({
      productId: 10,
      size: "38",
      quantity: 2,
      unitPrice: 88,
      hardwareCondition: "NUEVO",
    });
    expect(printLines[0].quantity).not.toBe(10);
    expect(printLines[0].unitPrice).not.toBe(50);

    const opvMapped = applyOrderItemPricesToShipmentProducts(
      order,
      mapShipmentProductsForOpvPrint(hydrated)
    );
    expect(opvMapped[0]).toMatchObject({ quantity: 2, unitPrice: 88 });
  });

  it("un campo ausente o vacío en el envío guardado cae al de la OP", () => {
    expect(savedNumberOrFallback(null, 50)).toBe(50);
    expect(savedNumberOrFallback("", 55)).toBe(55);
    expect(savedNumberOrFallback(0, 40)).toBe(0);

    const missingPrice = applyOrderItemPricesToShipmentProducts(order, [
      { productId: 10, colorId: 3, size: "38", quantity: 2, unitPrice: null },
      { productId: 10, colorId: 3, size: "39", quantity: 1, unitPrice: "" },
    ]);
    expect(missingPrice[0]).toMatchObject({ quantity: 2, unitPrice: 50 });
    expect(missingPrice[1]).toMatchObject({ quantity: 1, unitPrice: 55 });

    const review = expandShipmentProductsForOpvPriceLines(order, [
      { productId: 10, colorId: 3, size: "38", quantity: 2 },
    ]);
    expect(review[0].unitPrice).toBe(50);
    expect(review[0].quantity).toBe(2);

    const omittedOnGet = mergeShipmentDetailForReprint(listedFromOrder, {
      id: 99,
      products: [{ productId: 10, colorId: 3, size: "38", quantity: 2, unitPrice: 88 }],
    });
    expect(omittedOnGet.notes).toBe(order.observations);
    expect(omittedOnGet.packingItems).toEqual(order.packingItems);
    expect(omittedOnGet.shippingCost).toBe(40);
    expect(omittedOnGet.products[0]).toMatchObject({ quantity: 2, unitPrice: 88 });
  });

  it("PUT /products siempre incluye size, hardwareCondition y unitPrice aunque falten en la línea", () => {
    const payload = buildShipmentProductsReplacePayload([
      { productId: 10, quantity: 2 },
      { productId: 11, colorId: "", size: null, hardwareCondition: "", unitPrice: null, quantity: 1 },
    ]);
    expect(payload).toHaveLength(2);
    payload.forEach((line) => {
      expect(Object.keys(line).sort()).toEqual(
        ["colorId", "hardwareCondition", "productId", "quantity", "size", "unitPrice"].sort()
      );
    });
    expect(payload[0]).toEqual({
      productId: 10,
      colorId: null,
      size: "",
      hardwareCondition: null,
      unitPrice: 0,
      quantity: 2,
    });
    expect(payload[1]).toMatchObject({
      productId: 11,
      colorId: null,
      size: "",
      hardwareCondition: null,
      unitPrice: 0,
      quantity: 1,
    });
  });

  it("round-trip: editar, persistir (API mock) y reimprimir deja los mismos valores", async () => {
    const store = new Map();
    const mockApi = {
      async putProducts(id, products) {
        const current = store.get(id) || { id };
        const next = { ...current, products };
        store.set(id, next);
        return next;
      },
      async putPacking(id, packingItems) {
        const current = store.get(id) || { id };
        const next = { ...current, packingItems };
        store.set(id, next);
        return next;
      },
      async putNotes(id, notes) {
        const current = store.get(id) || { id };
        const next = { ...current, notes };
        store.set(id, next);
        return next;
      },
      async putShippingCost(id, shippingCost) {
        const current = store.get(id) || { id };
        const next = { ...current, shippingCost };
        store.set(id, next);
        return next;
      },
      async getById(id) {
        return store.get(id);
      },
    };

    const edited = {
      products: [
        {
          productId: 10,
          colorId: 3,
          size: "38",
          hardwareCondition: "NUEVO",
          unitPrice: 88,
          quantity: 2,
        },
      ],
      packingItems: [{ materialId: 7, quantity: 3, unitPrice: 2 }],
      notes: "Observación editada del envío",
      shippingCost: 12,
    };

    const putProducts = buildShipmentProductsReplacePayload(edited.products);
    expect(putProducts[0]).toEqual(
      expect.objectContaining({
        size: "38",
        hardwareCondition: "NUEVO",
        unitPrice: 88,
        quantity: 2,
      })
    );

    await mockApi.putProducts(99, putProducts);
    await mockApi.putPacking(99, edited.packingItems);
    await mockApi.putNotes(99, edited.notes);
    await mockApi.putShippingCost(99, edited.shippingCost);

    const reloaded = await mockApi.getById(99);
    const hydrated = mergeShipmentDetailForReprint(listedFromOrder, reloaded);
    const reprint = printFromHydrated(hydrated);

    expect(hydrated.products).toEqual(putProducts);
    expect(hydrated.packingItems).toEqual(edited.packingItems);
    expect(hydrated.notes).toBe(edited.notes);
    expect(hydrated.shippingCost).toBe(edited.shippingCost);
    expect(reprint).toHaveLength(1);
    expect(reprint[0]).toMatchObject({
      productId: 10,
      size: "38",
      hardwareCondition: "NUEVO",
      unitPrice: 88,
      quantity: 2,
    });
    expect(reprint[0].unitPrice).toBe(88);
    expect(reprint[0].quantity).toBe(2);
  });
});
