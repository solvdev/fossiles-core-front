import {
  buildConteoDisplayReport,
  computeConteoRowDiferencia,
  computeDiferenciaConteo,
} from "../kioscoConteoDisplay";

describe("computeDiferenciaConteo", () => {
  it("is physical minus system final", () => {
    expect(computeDiferenciaConteo(1, 0)).toBe(1);
    expect(computeDiferenciaConteo(1, 1)).toBe(0);
    expect(computeDiferenciaConteo(0, 1)).toBe(-1);
  });

  it("does not hide surplus because of warehouse return", () => {
    const row = { inventarioFinal: 0, salidaDevolucion: 1, packaging: false };
    expect(computeConteoRowDiferencia(1, row)).toBe(1);
  });
});

describe("buildConteoDisplayReport - cinchos JR", () => {
  const jrRow = (hardwareCondition, sizeLabel, overrides = {}) => ({
    productId: 10,
    productCode: "L-04JR",
    productName: "Cincho JR",
    colorId: 1,
    colorName: "CAFE",
    cinchoType: "CASUAL",
    cinchoForKids: true,
    hardwareCondition,
    sizeLabel,
    inventarioInicial: 0,
    inventarioFinal: 1,
    counts: {},
    total: 1,
    productCategoryId: 5,
    productCategoryName: "CINCHOS",
    ...overrides,
  });

  const buildReport = (rows) => ({
    categories: [{ categoryId: 5, categoryName: "CINCHOS", rows }],
  });

  it("separa Dama y Niño en categorias distintas", () => {
    const report = buildConteoDisplayReport(
      buildReport([jrRow("NINO", "20"), jrRow("DAMA", "24"), jrRow("NINO", "22")])
    );

    const byName = Object.fromEntries(report.categories.map((c) => [c.categoryName, c]));
    expect(Object.keys(byName).sort()).toEqual(["CINCHOS — Dama", "CINCHOS — Niño"]);
    expect(byName["CINCHOS — Niño"].rows.map((r) => r.sizeLabel)).toEqual(["20", "22"]);
    expect(byName["CINCHOS — Dama"].rows.map((r) => r.sizeLabel)).toEqual(["24"]);
    expect(byName["CINCHOS — Niño"].subtotal.inventarioFinal).toBe(2);
    expect(byName["CINCHOS — Dama"].subtotal.inventarioFinal).toBe(1);
  });

  it("sin dimension el cincho JR queda como Niño", () => {
    const report = buildConteoDisplayReport(buildReport([jrRow(null, "20")]));
    expect(report.categories.map((c) => c.categoryName)).toEqual(["CINCHOS — Niño"]);
  });
});
