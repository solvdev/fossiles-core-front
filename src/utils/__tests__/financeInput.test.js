import {
  normalizeAlias,
  parseLocaleNumber,
  parseMoneyInput,
  parsePercentInput,
  parsePasteBlock,
  planPaste,
  moneyToEditText,
  pctToEditText,
} from "utils/financeInput";

describe("parseLocaleNumber", () => {
  it.each([
    ["1234.5", 1234.5],
    ["1,234.50", 1234.5],
    ["Q 1,234.50", 1234.5],
    ["Q1234", 1234],
    ["q.500", 500],
    ["1.234,50", 1234.5],
    ["12,5", 12.5],
    ["1,234", 1234],
    ["1,234,567", 1234567],
    ["1.234.567", 1234567],
    ["(500)", -500],
    ["-25", -25],
    ["  7 ", 7],
    ["12%", 12],
    ["0", 0],
    [".5", 0.5],
  ])("acepta %s", (input, expected) => {
    expect(parseLocaleNumber(input)).toEqual({ valid: true, value: expected });
  });

  it("vacío borra la celda y '-' contable es 0", () => {
    expect(parseLocaleNumber("")).toEqual({ valid: true, value: null });
    expect(parseLocaleNumber("   ")).toEqual({ valid: true, value: null });
    expect(parseLocaleNumber(null)).toEqual({ valid: true, value: null });
    expect(parseLocaleNumber("-")).toEqual({ valid: true, value: 0 });
    expect(parseLocaleNumber("Q")).toEqual({ valid: true, value: null });
  });

  it.each(["abc", "12a", "1..6", "1,2,3.4.5", "Q Q", "1.2,3,4.5"])("rechaza %s", (input) => {
    expect(parseLocaleNumber(input).valid).toBe(false);
  });
});

describe("parseMoneyInput / parsePercentInput", () => {
  it("redondea dinero a 2 decimales y rechaza negativos", () => {
    expect(parseMoneyInput("10.005").value).toBeCloseTo(10.01, 2);
    expect(parseMoneyInput("-1").valid).toBe(false);
    expect(parseMoneyInput("").value).toBeNull();
  });

  it("convierte % a decimal y limita 0..100", () => {
    expect(parsePercentInput("18")).toEqual({ valid: true, value: 0.18 });
    expect(parsePercentInput("2.5%")).toEqual({ valid: true, value: 0.025 });
    expect(parsePercentInput("101").valid).toBe(false);
    expect(parsePercentInput("-1").valid).toBe(false);
  });

  it("texto de edición", () => {
    expect(moneyToEditText(1234.5)).toBe("1234.5");
    expect(moneyToEditText(null)).toBe("");
    expect(pctToEditText(0.025)).toBe("2.5");
    expect(pctToEditText(0.18)).toBe("18");
  });
});

describe("parsePasteBlock / planPaste", () => {
  it("interpreta TSV de Excel con CRLF y línea final vacía", () => {
    expect(parsePasteBlock("1,000.50\t2\r\n3\t4\r\n")).toEqual([
      ["1,000.50", "2"],
      ["3", "4"],
    ]);
  });

  it("una sola celda", () => {
    expect(parsePasteBlock("Q 15.00")).toEqual([["Q 15.00"]]);
    expect(parsePasteBlock("")).toEqual([]);
  });

  it("recorta lo que cae fuera de la grilla", () => {
    const matrix = [
      ["1", "2", "3"],
      ["4", "5", "6"],
    ];
    const plan = planPaste(matrix, 1, 1, 3, 3);
    expect(plan.cells).toEqual([
      { r: 1, c: 1, text: "1" },
      { r: 1, c: 2, text: "2" },
      { r: 2, c: 1, text: "4" },
      { r: 2, c: 2, text: "5" },
    ]);
    expect(plan.clipped).toBe(2);
  });
});

describe("normalizeAlias (contrato)", () => {
  it("normaliza igual que el backend", () => {
    expect(normalizeAlias("MIRAFLORES ")).toBe("MIRAFLORES");
    expect(normalizeAlias("SANTALÙ")).toBe("SANTALU");
    expect(normalizeAlias("SANTAL�")).toBe("SANTAL");
    expect(normalizeAlias("  plaza   cemaco ")).toBe("PLAZA CEMACO");
    expect(normalizeAlias("Interplaza Xela.")).toBe("INTERPLAZA XELA");
    expect(normalizeAlias(null)).toBe("");
  });
});
