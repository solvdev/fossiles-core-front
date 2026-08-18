import {
  buildPartialReleaseLinesPayload,
  buildShipmentProductsFromPartialReleaseLines,
  filterShipmentsByPartialReleaseId,
  initDraftLinesFromAvailability,
  initDraftLinesFromRelease,
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
