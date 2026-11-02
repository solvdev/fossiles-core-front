import {
  buildProductionOrderFormItemsPayload,
  duplicateProductionOrderLine,
  productionOrderLineIdForUpdate,
} from "./productionOrderFormPayload";

const existingLine = {
  id: 42,
  productId: 10,
  colorId: 3,
  brandName: "ACME",
  quantity: 4,
  sizes: { "38": 4 },
  observations: "ok",
  unitPrice: 50,
};

const newLine = {
  productId: 11,
  colorId: 4,
  brandName: "ACME",
  quantity: 1,
  sizes: null,
  observations: "",
  unitPrice: 40,
};

const mapOptions = {
  orderType: "MARCAS",
  showItemUnitPrice: true,
  productCatalogById: {},
  isVendorOpv: false,
};

describe("buildProductionOrderFormItemsPayload", () => {
  it("PUT keeps ids for existing lines and sends null for new ones", () => {
    const items = buildProductionOrderFormItemsPayload([existingLine, newLine], {
      ...mapOptions,
      includeId: true,
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 42,
      productId: 10,
      colorId: 3,
      brandName: "ACME",
      quantity: 4,
      sizes: { "38": 4 },
      observations: "ok",
      unitPrice: 50,
    });
    expect(items[1]).toMatchObject({
      id: null,
      productId: 11,
      colorId: 4,
      unitPrice: 40,
    });
  });

  it("POST does not send line ids", () => {
    const items = buildProductionOrderFormItemsPayload([existingLine, newLine], {
      ...mapOptions,
      includeId: false,
    });
    items.forEach((item) => {
      expect(item).not.toHaveProperty("id");
    });
  });

  it("keeps id when sizes or brand are edited on an existing line", () => {
    const edited = { ...existingLine, brandName: "OTRA", sizes: { "40": 4 } };
    const [payload] = buildProductionOrderFormItemsPayload([edited], {
      ...mapOptions,
      includeId: true,
    });
    expect(payload.id).toBe(42);
    expect(payload.brandName).toBe("OTRA");
    expect(payload.sizes).toEqual({ "40": 4 });
  });

  it("duplicated line sends id null and keeps the rest of the payload", () => {
    const copy = duplicateProductionOrderLine(existingLine);
    expect(copy.id).toBe(null);
    expect(copy.productId).toBe(existingLine.productId);
    expect(existingLine.id).toBe(42);

    const [payload] = buildProductionOrderFormItemsPayload([copy], {
      ...mapOptions,
      includeId: true,
    });
    expect(payload.id).toBe(null);
    expect(payload).toMatchObject({
      productId: 10,
      colorId: 3,
      brandName: "ACME",
      quantity: 4,
      sizes: { "38": 4 },
      unitPrice: 50,
    });
  });
});

describe("productionOrderLineIdForUpdate", () => {
  it("returns the backend id or null", () => {
    expect(productionOrderLineIdForUpdate(existingLine)).toBe(42);
    expect(productionOrderLineIdForUpdate(newLine)).toBe(null);
    expect(productionOrderLineIdForUpdate({ id: null })).toBe(null);
    expect(productionOrderLineIdForUpdate(undefined)).toBe(null);
  });
});
