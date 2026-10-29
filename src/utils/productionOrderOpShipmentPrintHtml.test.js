import { buildOpShipmentPrintDocumentHtml } from "./productionOrderOpShipmentPrintHtml";
import { resolveShipmentDocumentNumber } from "./prepareShipmentsOrderHelper";

const order = {
  id: 10,
  code: "OPV-10",
  orderType: "MARCAS",
  vendorShipmentNumber: "ENVP-00001",
  customerName: "Cliente LF",
};

const printRow = {
  productCode: "P-10",
  productName: "Zapato",
  colorName: "Negro",
  size: "38",
  quantity: 2,
  refPrice: 50,
  displayPrice: 50,
};

describe("resolveShipmentDocumentNumber — ENVP por envío", () => {
  it("un segundo parcial usa su shipmentNumber, no el ENVP de la OP", () => {
    const second = {
      id: 22,
      shipmentNumber: "ENVP-00002",
      vendorShipmentNumber: "ENVP-00002",
    };
    expect(resolveShipmentDocumentNumber(second, order)).toBe("ENVP-00002");
  });

  it("cae a shipment.vendorShipmentNumber y luego al de la OP", () => {
    expect(
      resolveShipmentDocumentNumber({ id: 22, vendorShipmentNumber: "ENVP-00003" }, order)
    ).toBe("ENVP-00003");
    expect(resolveShipmentDocumentNumber({ id: 22 }, order)).toBe("ENVP-00001");
  });
});

describe("buildOpShipmentPrintDocumentHtml — ENVP del parcial", () => {
  it("un segundo parcial imprime su propio shipmentNumber, no el de la OP", () => {
    const html = buildOpShipmentPrintDocumentHtml({
      order,
      shipment: {
        id: 22,
        shipmentNumber: "ENVP-00002",
        locationName: "Cliente LF",
      },
      rows: [printRow],
    });
    expect(html).toContain("ENVP-00002");
    expect(html).not.toContain("ENVP-00001");
  });
});
