import {
  applyOrderItemPricesToShipmentProducts,
  buildShipmentProductsReplacePayload,
  expandShipmentProductsForOpvPriceLines,
  mergeShipmentDetailForReprint,
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
