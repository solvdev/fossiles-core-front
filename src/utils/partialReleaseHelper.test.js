import {
  applyGroupSendQty,
  buildPartialReleaseLinesPayload,
  buildShipmentProductsFromPartialReleaseLines,
  filterShipmentsByPartialReleaseId,
  groupDraftLinesByVariant,
  initDraftLinesFromAvailability,
  initDraftLinesFromRelease,
  orderUsesVariantGroupedPartialEditor,
  remainingAfterGroupSend,
  resolveShipmentLinesForPrint,
  shouldUseSyntheticFullOrderDocument,
} from "./partialReleaseHelper";

const sizedAvailability = [
  {
    productionOrderItemId: 1,
    productId: 10,
    productCode: "P-10",
    productName: "Zapato",
    colorName: "Negro",
    orderedTotal: 10,
    pendingTotal: 10,
    orderedSizes: { "38": 4, "39": 6 },
    pendingSizes: { "38": 4, "39": 6 },
  },
  {
    productionOrderItemId: 2,
    productId: 11,
    productCode: "P-11",
    productName: "Bolso",
    colorName: "Café",
    orderedTotal: 5,
    pendingTotal: 5,
  },
];

describe("partialReleaseHelper — envío parcial no toma toda la OP", () => {
  it("initDraftLinesFromAvailability deja en cero las tallas y no incluye productos", () => {
    const draft = initDraftLinesFromAvailability(sizedAvailability, "MARCAS");
    expect(draft[0].included).toBe(false);
    expect(draft[0].sizes).toEqual({ "38": 0, "39": 0 });
    expect(draft[1].included).toBe(false);
    expect(draft[1].quantity).toBe(0);
  });

  it("el payload solo envía las tallas/productos con cantidad > 0", () => {
    const draft = initDraftLinesFromAvailability(sizedAvailability, "MARCAS");
    draft[0].included = true;
    draft[0].sizes = { "38": 2, "39": 0 };
    draft[1].included = true;
    draft[1].quantity = 0;

    const payload = buildPartialReleaseLinesPayload(draft, "MARCAS");
    expect(payload).toEqual([
      { productionOrderItemId: 1, sizes: { "38": 2 } },
    ]);
  });

  it("los productos del envío no incluyen tallas en cero ni líneas omitidas", () => {
    const products = buildShipmentProductsFromPartialReleaseLines(
      [
        {
          productId: 10,
          productCode: "P-10",
          productName: "Zapato",
          colorId: 3,
          colorName: "Negro",
          quantity: 10,
          sizes: { "38": 2, "39": 0 },
          orderedSizes: { "38": 4, "39": 6 },
        },
        {
          productId: 11,
          productCode: "P-11",
          productName: "Bolso",
          quantity: 0,
        },
      ],
      "MARCAS"
    );
    expect(products).toEqual([
      {
        productId: 10,
        productCode: "P-10",
        productName: "Zapato",
        colorId: 3,
        colorName: "Negro",
        size: "38",
        quantity: 2,
      },
    ]);
  });

  it("al editar un parcial no rellena el resto de la OP con lo pendiente", () => {
    const release = {
      lines: [
        {
          productionOrderItemId: 1,
          productCode: "P-10",
          quantity: 2,
          sizes: { "38": 2, "39": 0 },
        },
      ],
    };
    const draft = initDraftLinesFromRelease(release, "MARCAS", sizedAvailability);
    expect(draft).toHaveLength(2);
    expect(draft[0].included).toBe(true);
    expect(draft[0].sizes).toEqual({ "38": 2, "39": 0 });
    expect(draft[1].included).toBe(false);
    expect(draft[1].quantity).toBe(0);
  });

  it("si el envío ya trae cantidades parciales, la impresión no las infla con la OP", () => {
    const shipment = {
      id: 99,
      partialReleaseId: 7,
      products: [
        { productId: 10, productCode: "P-10", size: "38", quantity: 2 },
      ],
    };
    const printed = resolveShipmentLinesForPrint(
      shipment,
      {
        orderType: "MARCAS",
        items: [
          { productId: 10, sizes: { "38": 4, "39": 6 }, quantity: 10 },
          { productId: 11, quantity: 5 },
        ],
      },
      {
        releases: [
          {
            id: 7,
            shipmentId: 99,
            lines: [
              {
                productId: 10,
                productCode: "P-10",
                sizes: { "38": 2 },
                quantity: 2,
              },
            ],
          },
        ],
      }
    );
    expect(printed).toHaveLength(1);
    expect(printed[0].quantity).toBe(2);
  });

  it("impresión usa las líneas del parcial, no todos los productos del envío", () => {
    const shipment = {
      id: 99,
      partialReleaseId: 7,
      products: [
        { productCode: "P-10", size: "38", quantity: 4 },
        { productCode: "P-10", size: "39", quantity: 6 },
        { productCode: "P-11", size: "", quantity: 5 },
      ],
    };
    const releases = [
      {
        id: 7,
        shipmentId: 99,
        lines: [
          {
            productCode: "P-10",
            productName: "Zapato",
            sizes: { "38": 2 },
            quantity: 2,
          },
        ],
      },
    ];
    const printed = resolveShipmentLinesForPrint(shipment, { orderType: "MARCAS" }, { releases });
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({ productCode: "P-10", size: "38", quantity: 2 });
  });

  it("al enfocar un parcial no cae al documento completo de la OP", () => {
    const docs = [
      { id: 1, partialReleaseId: 7, products: [{ quantity: 2 }] },
      { id: 2, products: [{ quantity: 99 }] },
    ];
    const focused = filterShipmentsByPartialReleaseId(docs, 7, [{ id: 7, shipmentId: 1 }]);
    expect(focused).toHaveLength(1);
    expect(focused[0].id).toBe(1);

    const missing = filterShipmentsByPartialReleaseId(docs, 8, []);
    expect(missing).toEqual([]);
  });

  it("no usa el documento sintético de la OP si hay parciales", () => {
    expect(
      shouldUseSyntheticFullOrderDocument({
        realShipmentCount: 0,
        partialReleaseCount: 1,
        focusedPartialReleaseId: "",
      })
    ).toBe(false);
    expect(
      shouldUseSyntheticFullOrderDocument({
        realShipmentCount: 0,
        partialReleaseCount: 0,
        focusedPartialReleaseId: "7",
      })
    ).toBe(false);
    expect(
      shouldUseSyntheticFullOrderDocument({
        realShipmentCount: 0,
        partialReleaseCount: 0,
        focusedPartialReleaseId: "",
      })
    ).toBe(true);
  });
});

describe("partialReleaseHelper — editor agrupado Entre Cueros", () => {
  const groupedAvailability = [
    {
      productionOrderItemId: 21,
      productId: 100,
      productCode: "EC-100",
      productName: "Bota",
      colorId: 8,
      colorName: "Negro",
      orderedTotal: 3,
      pendingTotal: 3,
    },
    {
      productionOrderItemId: 22,
      productId: 100,
      productCode: "EC-100",
      productName: "Bota",
      colorId: 8,
      colorName: "Negro",
      orderedTotal: 5,
      pendingTotal: 5,
    },
    {
      productionOrderItemId: 31,
      productId: 200,
      productCode: "EC-200",
      productName: "Zapato",
      colorId: 9,
      colorName: "Café",
      orderedTotal: 10,
      pendingTotal: 10,
      orderedSizes: { "38": 4, "39": 6 },
      pendingSizes: { "38": 4, "39": 6 },
    },
  ];

  it("activa el editor agrupado para OPV Entre Cueros o kiosko 42", () => {
    expect(
      orderUsesVariantGroupedPartialEditor({
        orderType: "MARCAS",
        code: "OPV-1",
        customerName: "Entre Cueros",
      })
    ).toBe(true);
    expect(orderUsesVariantGroupedPartialEditor({ orderType: "NORMAL" }, 42)).toBe(true);
    expect(orderUsesVariantGroupedPartialEditor({ orderType: "NORMAL", locationId: 42 })).toBe(true);
    expect(
      orderUsesVariantGroupedPartialEditor({
        orderType: "MARCAS",
        code: "OPV-1",
        customerName: "Luis Felipe",
      })
    ).toBe(false);
  });

  it("agrupa líneas iguales por producto, color y talla", () => {
    const draft = initDraftLinesFromAvailability(groupedAvailability, "MARCAS");
    const groups = groupDraftLinesByVariant(draft);
    const boots = groups.find((g) => g.productId === 100);
    const size38 = groups.find((g) => g.productId === 200 && g.size === "38");
    const size39 = groups.find((g) => g.productId === 200 && g.size === "39");
    expect(boots.orderedTotal).toBe(8);
    expect(boots.pendingTotal).toBe(8);
    expect(boots.members).toHaveLength(2);
    expect(size38.orderedTotal).toBe(4);
    expect(size39.orderedTotal).toBe(6);
  });

  it("reparte Enviar FIFO entre líneas y deja el resto como Quedan", () => {
    const draft = initDraftLinesFromAvailability(groupedAvailability, "MARCAS");
    const groupKey = groupDraftLinesByVariant(draft).find((g) => g.productId === 100).key;
    const next = applyGroupSendQty(draft, groupKey, 4);
    expect(next.find((row) => row.productionOrderItemId === 21).quantity).toBe(3);
    expect(next.find((row) => row.productionOrderItemId === 22).quantity).toBe(1);
    const group = groupDraftLinesByVariant(next).find((g) => g.productId === 100);
    expect(group.sendQty).toBe(4);
    expect(remainingAfterGroupSend(group)).toBe(4);
  });

  it("no envía más de lo pendiente y el payload sigue siendo por ítem de OP", () => {
    const draft = initDraftLinesFromAvailability(groupedAvailability, "MARCAS");
    const bootsKey = groupDraftLinesByVariant(draft).find((g) => g.productId === 100).key;
    const size38Key = groupDraftLinesByVariant(draft).find((g) => g.productId === 200 && g.size === "38").key;
    let next = applyGroupSendQty(draft, bootsKey, 99);
    next = applyGroupSendQty(next, size38Key, 2);
    const boots = groupDraftLinesByVariant(next).find((g) => g.productId === 100);
    expect(boots.sendQty).toBe(8);
    expect(remainingAfterGroupSend(boots)).toBe(0);
    expect(buildPartialReleaseLinesPayload(next, "MARCAS")).toEqual([
      { productionOrderItemId: 21, quantity: 3 },
      { productionOrderItemId: 22, quantity: 5 },
      { productionOrderItemId: 31, sizes: { "38": 2 } },
    ]);
  });

  it("el siguiente parcial trabaja sobre lo pendiente (no sobre el pedido original)", () => {
    const afterFirst = [
      {
        productionOrderItemId: 21,
        productId: 100,
        productCode: "EC-100",
        colorId: 8,
        colorName: "Negro",
        orderedTotal: 3,
        pendingTotal: 0,
      },
      {
        productionOrderItemId: 22,
        productId: 100,
        productCode: "EC-100",
        colorId: 8,
        colorName: "Negro",
        orderedTotal: 5,
        pendingTotal: 4,
      },
    ];
    const draft = initDraftLinesFromAvailability(afterFirst, "MARCAS");
    const group = groupDraftLinesByVariant(draft).find((g) => g.productId === 100);
    expect(group.orderedTotal).toBe(8);
    expect(group.pendingTotal).toBe(4);
    const next = applyGroupSendQty(draft, group.key, 4);
    const updated = groupDraftLinesByVariant(next).find((g) => g.productId === 100);
    expect(updated.sendQty).toBe(4);
    expect(remainingAfterGroupSend(updated)).toBe(0);
    expect(next.find((row) => row.productionOrderItemId === 21).quantity).toBe(0);
    expect(next.find((row) => row.productionOrderItemId === 22).quantity).toBe(4);
  });
});

