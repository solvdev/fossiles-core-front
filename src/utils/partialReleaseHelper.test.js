import {
  applyDraftLineIncluded,
  applyDraftSizeIncluded,
  applyGroupSendQty,
  buildPartialReleaseLinesPayload,
  buildShipmentProductsFromPartialReleaseLines,
  countDraftTotalUnits,
  draftLineVisibleInPartialEditor,
  draftSizeVisibleInPartialEditor,
  filterShipmentsByPartialReleaseId,
  groupDraftLinesByVariant,
  initDraftLinesFromAvailability,
  initDraftLinesFromRelease,
  maxDraftLineQuantity,
  orderUsesVariantGroupedPartialEditor,
  pendingQtyForRow,
  remainingAfterGroupSend,
  resolveShipmentLinesForPrint,
  setDraftLinesIncluded,
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

  it("reimpresión usa las cantidades guardadas del envío, no las de la OP ni el parcial", () => {
    const shipment = {
      id: 99,
      partialReleaseId: 7,
      products: [
        { productCode: "P-10", size: "38", quantity: 2, unitPrice: 88 },
      ],
    };
    const order = {
      orderType: "MARCAS",
      items: [
        { productCode: "P-10", sizes: { "38": 4, "39": 6 }, quantity: 10 },
        { productCode: "P-11", quantity: 5 },
      ],
    };
    const releases = [
      {
        id: 7,
        shipmentId: 99,
        lines: [
          { productCode: "P-10", sizes: { "38": 4, "39": 6 }, quantity: 10 },
        ],
      },
    ];
    const printed = resolveShipmentLinesForPrint(shipment, order, { releases });
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({ productCode: "P-10", size: "38", quantity: 2, unitPrice: 88 });
  });

  it("un parcial sin líneas guardadas usa el parcial, nunca las líneas de la OP completa", () => {
    const shipment = {
      id: 99,
      partialReleaseId: 7,
      products: [],
    };
    const order = {
      orderType: "MARCAS",
      items: [
        { productId: 10, productCode: "P-10", sizes: { "38": 4, "39": 6 }, quantity: 10 },
        { productId: 11, productCode: "P-11", quantity: 5 },
      ],
    };
    const releases = [
      {
        id: 7,
        shipmentId: 99,
        lines: [
          {
            productId: 10,
            productCode: "P-10",
            productName: "Zapato",
            sizes: { "38": 2 },
            quantity: 2,
          },
        ],
      },
    ];
    const printed = resolveShipmentLinesForPrint(shipment, order, { releases });
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({ productCode: "P-10", size: "38", quantity: 2 });
    expect(printed.some((p) => p.productCode === "P-11")).toBe(false);
  });

  it("un parcial sin líneas ni productos no cae a la OP completa", () => {
    const shipment = { id: 99, partialReleaseId: 7, products: [] };
    const order = {
      orderType: "MARCAS",
      items: [
        { productCode: "P-10", quantity: 10 },
        { productCode: "P-11", quantity: 5 },
      ],
    };
    const printed = resolveShipmentLinesForPrint(shipment, order, { releases: [] });
    expect(printed).toEqual([]);
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

  it("tras 2+ parciales el editor precarga y limita solo lo pendiente del backend", () => {
    const afterTwoPartials = [
      {
        productionOrderItemId: 1,
        productId: 10,
        productCode: "P-10",
        productName: "Zapato",
        orderedTotal: 10,
        pendingTotal: 0,
        orderedSizes: { "38": 4, "39": 6 },
        pendingSizes: { "38": 0, "39": 0 },
      },
      {
        productionOrderItemId: 2,
        productId: 11,
        productCode: "P-11",
        productName: "Bolso",
        orderedTotal: 5,
        pendingTotal: 1,
      },
    ];
    expect(pendingQtyForRow(afterTwoPartials[0], "38")).toBe(0);
    expect(pendingQtyForRow(afterTwoPartials[0])).toBe(0);
    expect(pendingQtyForRow(afterTwoPartials[1])).toBe(1);
    expect(maxDraftLineQuantity(afterTwoPartials[0], "38")).toBe(0);
    expect(maxDraftLineQuantity(afterTwoPartials[1])).toBe(1);

    const draft = initDraftLinesFromAvailability(afterTwoPartials, "MARCAS");
    const selected = setDraftLinesIncluded(draft, true, "MARCAS");
    expect(selected[0].sizes).toEqual({ "38": 0, "39": 0 });
    expect(selected[0].included).toBe(false);
    expect(selected[1].quantity).toBe(1);
    expect(draftLineVisibleInPartialEditor(selected[0])).toBe(false);
    expect(draftSizeVisibleInPartialEditor(selected[0], "38")).toBe(false);
    expect(draftLineVisibleInPartialEditor(selected[1])).toBe(true);

    const payload = buildPartialReleaseLinesPayload(selected, "MARCAS");
    expect(payload).toEqual([{ productionOrderItemId: 2, quantity: 1 }]);
  });

  it("Seleccionar todo no rellena con lo pedido cuando el pendiente es 0", () => {
    const row = {
      productionOrderItemId: 2,
      orderedTotal: 5,
      pendingTotal: 0,
    };
    const filled = applyDraftLineIncluded(row, true, "MARCAS");
    expect(filled.quantity).toBe(0);
    expect(filled.included).toBe(false);
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

describe("partialReleaseHelper — pendingTotal/pendingSizes son la única fuente", () => {
  const fullOrder = {
    orderType: "MARCAS",
    items: [
      { productId: 10, productCode: "P-10", colorId: 3, colorName: "Negro", sizes: { "38": 4, "39": 6 }, quantity: 10 },
      { productId: 10, productCode: "P-10", colorId: 4, colorName: "Café", sizes: { "38": 3, "39": 5 }, quantity: 8 },
      { productId: 11, productCode: "P-11", quantity: 5 },
    ],
  };

  const afterFirstPartial = [
    {
      productionOrderItemId: 1,
      productId: 10,
      productCode: "P-10",
      productName: "Zapato",
      colorId: 3,
      colorName: "Negro",
      orderedTotal: 10,
      pendingTotal: 6,
      orderedSizes: { "38": 4, "39": 6 },
      pendingSizes: { "38": 2, "39": 4 },
    },
    {
      productionOrderItemId: 2,
      productId: 10,
      productCode: "P-10",
      productName: "Zapato",
      colorId: 4,
      colorName: "Café",
      orderedTotal: 8,
      pendingTotal: 8,
      orderedSizes: { "38": 3, "39": 5 },
      pendingSizes: { "38": 3, "39": 5 },
    },
    {
      productionOrderItemId: 3,
      productId: 11,
      productCode: "P-11",
      productName: "Bolso",
      orderedTotal: 5,
      pendingTotal: 3,
    },
  ];

  const afterSecondPartial = [
    {
      ...afterFirstPartial[0],
      pendingTotal: 3,
      pendingSizes: { "38": 1, "39": 2 },
    },
    {
      ...afterFirstPartial[1],
      pendingTotal: 5,
      pendingSizes: { "38": 2, "39": 3 },
    },
    {
      ...afterFirstPartial[2],
      pendingTotal: 0,
    },
  ];

  const selectAll = (rows) =>
    setDraftLinesIncluded(initDraftLinesFromAvailability(rows, "MARCAS"), true, "MARCAS");

  it("tras un parcial de 4 sobre 10, Seleccionar todo precarga 6 por producto, color y talla", () => {
    expect(pendingQtyForRow(afterFirstPartial[0])).toBe(6);
    expect(pendingQtyForRow(afterFirstPartial[0], "38")).toBe(2);
    expect(pendingQtyForRow(afterFirstPartial[0], "39")).toBe(4);
    expect(pendingQtyForRow(afterFirstPartial[1], "38")).toBe(3);
    expect(pendingQtyForRow(afterFirstPartial[2])).toBe(3);

    const selected = selectAll(afterFirstPartial);
    const negro = selected.find((row) => row.productionOrderItemId === 1);
    const cafe = selected.find((row) => row.productionOrderItemId === 2);
    const bolso = selected.find((row) => row.productionOrderItemId === 3);

    expect(negro.sizes).toEqual({ "38": 2, "39": 4 });
    expect(cafe.sizes).toEqual({ "38": 3, "39": 5 });
    expect(bolso.quantity).toBe(3);
    expect(countDraftTotalUnits(selected, "MARCAS")).toBe(6 + 8 + 3);

    expect(negro.sizes["38"]).not.toBe(negro.orderedSizes["38"]);
    expect(negro.sizes["39"]).not.toBe(negro.orderedSizes["39"]);
    expect(bolso.quantity).not.toBe(bolso.orderedTotal);
  });

  it("un estado posterior con pendingTotal 3 precarga 3; el cliente no resta sobre el pedido", () => {
    const selected = selectAll(afterSecondPartial);
    const negro = selected.find((row) => row.productionOrderItemId === 1);
    const cafe = selected.find((row) => row.productionOrderItemId === 2);
    const bolso = selected.find((row) => row.productionOrderItemId === 3);

    expect(pendingQtyForRow(afterSecondPartial[0])).toBe(3);
    expect(negro.sizes).toEqual({ "38": 1, "39": 2 });
    expect(cafe.sizes).toEqual({ "38": 2, "39": 3 });
    expect(bolso.quantity).toBe(0);
    expect(bolso.included).toBe(false);
    expect(countDraftTotalUnits(selected, "MARCAS")).toBe(3 + 5);
    expect(negro.sizes["38"] + negro.sizes["39"]).toBe(3);
    expect(negro.sizes["38"] + negro.sizes["39"]).not.toBe(10);
  });

  it("líneas y tallas con pending 0 se ocultan y una OP totalmente enviada no deja líneas", () => {
    const fullyShipped = [
      {
        productionOrderItemId: 1,
        productId: 10,
        productCode: "P-10",
        colorId: 3,
        colorName: "Negro",
        orderedTotal: 10,
        pendingTotal: 0,
        orderedSizes: { "38": 4, "39": 6 },
        pendingSizes: { "38": 0, "39": 0 },
      },
      {
        productionOrderItemId: 2,
        productId: 10,
        productCode: "P-10",
        colorId: 4,
        colorName: "Café",
        orderedTotal: 8,
        pendingTotal: 0,
        orderedSizes: { "38": 3, "39": 5 },
        pendingSizes: { "38": 0, "39": 0 },
      },
      {
        productionOrderItemId: 3,
        productId: 11,
        productCode: "P-11",
        orderedTotal: 5,
        pendingTotal: 0,
      },
    ];
    const draft = initDraftLinesFromAvailability(fullyShipped, "MARCAS");
    expect(draft.filter((row) => draftLineVisibleInPartialEditor(row))).toEqual([]);
    expect(draftSizeVisibleInPartialEditor(draft[0], "38")).toBe(false);
    expect(draftSizeVisibleInPartialEditor(draft[0], "39")).toBe(false);

    const mixed = selectAll(afterSecondPartial);
    expect(draftLineVisibleInPartialEditor(mixed.find((row) => row.productionOrderItemId === 3))).toBe(false);
    expect(draftSizeVisibleInPartialEditor(mixed.find((row) => row.productionOrderItemId === 1), "38")).toBe(true);

    const selected = setDraftLinesIncluded(draft, true, "MARCAS");
    expect(selected.every((row) => row.included === false)).toBe(true);
    expect(buildPartialReleaseLinesPayload(selected, "MARCAS")).toEqual([]);
    expect(countDraftTotalUnits(selected, "MARCAS")).toBe(0);

    const groups = groupDraftLinesByVariant(draft).filter(
      (group) => Number(group.pendingTotal) > 0 || Number(group.sendQty) > 0
    );
    expect(groups).toEqual([]);
  });

  it("Seleccionar todo y el tope nunca superan el pendiente ni caen al pedido", () => {
    const draft = initDraftLinesFromAvailability(afterFirstPartial, "MARCAS");
    expect(maxDraftLineQuantity(draft[0], "38")).toBe(2);
    expect(maxDraftLineQuantity(draft[0], "39")).toBe(4);
    expect(maxDraftLineQuantity(draft[2])).toBe(3);
    expect(maxDraftLineQuantity(draft[0], "38")).toBeLessThan(draft[0].orderedSizes["38"]);
    expect(maxDraftLineQuantity(draft[2])).toBeLessThan(draft[2].orderedTotal);

    const selected = selectAll(afterFirstPartial);
    const negro = selected.find((row) => row.productionOrderItemId === 1);
    const bolso = selected.find((row) => row.productionOrderItemId === 3);

    expect(maxDraftLineQuantity(negro, "38")).toBe(2);
    expect(maxDraftLineQuantity(negro, "39")).toBe(4);
    expect(maxDraftLineQuantity(bolso)).toBe(3);

    const filledSize = applyDraftSizeIncluded(
      initDraftLinesFromAvailability(afterFirstPartial, "MARCAS")[0],
      "38",
      true
    );
    expect(filledSize.sizes["38"]).toBe(2);
    expect(filledSize.sizes["39"]).toBe(0);

    const oversend = applyDraftLineIncluded(negro, true, "MARCAS");
    expect(oversend.sizes).toEqual({ "38": 2, "39": 4 });
  });

  it("si el backend no manda pending*, la cantidad sugerida es 0 (nunca ordered*)", () => {
    const missingPending = {
      productionOrderItemId: 9,
      orderedTotal: 10,
      orderedSizes: { "38": 4, "39": 6 },
    };
    expect(pendingQtyForRow(missingPending)).toBe(0);
    expect(pendingQtyForRow(missingPending, "38")).toBe(0);
    expect(maxDraftLineQuantity(missingPending, "38")).toBe(0);
    expect(maxDraftLineQuantity(missingPending)).toBe(0);

    const selected = applyDraftLineIncluded(
      { ...missingPending, sizes: { "38": 0, "39": 0 } },
      true,
      "MARCAS"
    );
    expect(selected.sizes).toEqual({ "38": 0, "39": 0 });
    expect(selected.included).toBe(false);
    expect(selected.quantity ?? 0).not.toBe(10);
  });

  it("el editor agrupado limita cada talla a pendingSizes tras 2+ parciales", () => {
    const draft = initDraftLinesFromAvailability(afterSecondPartial, "MARCAS");
    const groups = groupDraftLinesByVariant(draft);
    const negro38 = groups.find((g) => g.productId === 10 && g.colorId === 3 && g.size === "38");
    const negro39 = groups.find((g) => g.productId === 10 && g.colorId === 3 && g.size === "39");
    expect(negro38.orderedTotal).toBe(4);
    expect(negro38.pendingTotal).toBe(1);
    expect(negro39.pendingTotal).toBe(2);

    const oversend38 = applyGroupSendQty(draft, negro38.key, 99);
    const next38 = groupDraftLinesByVariant(oversend38).find((g) => g.key === negro38.key);
    expect(next38.sendQty).toBe(1);
    expect(next38.sendQty).toBeLessThan(next38.orderedTotal);
  });

  it("imprimir el segundo parcial no mezcla la OP ni el primer parcial, ni usa el documento sintético", () => {
    expect(
      shouldUseSyntheticFullOrderDocument({
        realShipmentCount: 2,
        partialReleaseCount: 2,
        focusedPartialReleaseId: "",
      })
    ).toBe(false);
    expect(
      shouldUseSyntheticFullOrderDocument({
        realShipmentCount: 1,
        partialReleaseCount: 2,
        focusedPartialReleaseId: "8",
      })
    ).toBe(false);

    const releases = [
      {
        id: 7,
        shipmentId: 99,
        lines: [{ productId: 10, productCode: "P-10", sizes: { "38": 2, "39": 2 }, quantity: 4 }],
      },
      {
        id: 8,
        shipmentId: 100,
        lines: [{ productId: 10, productCode: "P-10", sizes: { "38": 1 }, quantity: 1 }],
      },
    ];
    const second = {
      id: 100,
      partialReleaseId: 8,
      products: [{ productId: 10, productCode: "P-10", size: "38", quantity: 1, unitPrice: 88 }],
    };
    const printed = resolveShipmentLinesForPrint(second, fullOrder, { releases });
    expect(printed).toHaveLength(1);
    expect(printed[0]).toMatchObject({ productCode: "P-10", size: "38", quantity: 1, unitPrice: 88 });
    expect(printed.some((p) => p.productCode === "P-11")).toBe(false);
    expect(printed.reduce((sum, p) => sum + Number(p.quantity || 0), 0)).not.toBe(10 + 8 + 5);

    const withoutSaved = resolveShipmentLinesForPrint(
      { id: 100, partialReleaseId: 8, products: [] },
      fullOrder,
      { releases }
    );
    expect(withoutSaved).toHaveLength(1);
    expect(withoutSaved[0]).toMatchObject({ productCode: "P-10", size: "38", quantity: 1 });
    expect(withoutSaved.some((p) => Number(p.quantity) === 10)).toBe(false);
  });
});

