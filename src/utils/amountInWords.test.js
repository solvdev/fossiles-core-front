import { amountInWordsQ, integerToWords } from "./amountInWords";

describe("amountInWordsQ", () => {
  it("escribe montos exactos como en el formato de cheque", () => {
    expect(amountInWordsQ(7200)).toBe("SIETE MIL DOSCIENTOS QUETZALES EXACTOS");
    expect(amountInWordsQ(1)).toBe("UN QUETZAL EXACTO");
    expect(amountInWordsQ(100)).toBe("CIEN QUETZALES EXACTOS");
  });

  it("agrega los centavos sobre 100", () => {
    expect(amountInWordsQ(1728.4)).toBe("MIL SETECIENTOS VEINTIOCHO QUETZALES CON 40/100");
    expect(amountInWordsQ("2153.29")).toBe("DOS MIL CIENTO CINCUENTA Y TRES QUETZALES CON 29/100");
    expect(amountInWordsQ(0.5)).toBe("CERO QUETZALES CON 50/100");
  });

  it("apocopa UNO delante de MIL, MILLONES y QUETZALES", () => {
    expect(amountInWordsQ(21000)).toBe("VEINTIUN MIL QUETZALES EXACTOS");
    expect(amountInWordsQ(101)).toBe("CIENTO UN QUETZALES EXACTOS");
    expect(amountInWordsQ(31)).toBe("TREINTA Y UN QUETZALES EXACTOS");
    expect(amountInWordsQ(1000000)).toBe("UN MILLON DE QUETZALES EXACTOS");
    expect(integerToWords(21000000)).toBe("VEINTIUN MILLONES");
  });

  it("devuelve vacío para montos inválidos", () => {
    expect(amountInWordsQ(-5)).toBe("");
    expect(amountInWordsQ("abc")).toBe("");
  });
});
