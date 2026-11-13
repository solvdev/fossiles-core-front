import { amountToWordsQ } from "./shipmentPrintDocumentHtml";

describe("amountToWordsQ", () => {
  it("apocopa UNO delante de MIL y QUETZALES", () => {
    expect(amountToWordsQ(21000)).toBe("VEINTIUN MIL QUETZALES CON 00/100");
    expect(amountToWordsQ(101)).toBe("CIENTO UN QUETZALES CON 00/100");
  });

  it("escribe los centavos sobre 100 sin errores de punto flotante", () => {
    expect(amountToWordsQ(1728.4)).toBe("MIL SETECIENTOS VEINTIOCHO QUETZALES CON 40/100");
  });
});
