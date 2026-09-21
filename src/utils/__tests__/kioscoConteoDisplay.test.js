import { computeConteoRowDiferencia, computeDiferenciaConteo } from "../kioscoConteoDisplay";

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
