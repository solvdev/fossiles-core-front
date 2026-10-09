import { entrecuerosPosCanAddItem, isPosPackagingItem } from "./kioskPackagingHelper";

describe("entrecuerosPosCanAddItem", () => {
  const wallet = { productCode: "LL-20", productName: "Llavero metal" };

  it("trata como empaque el código SUM, la bandera y el campo code", () => {
    expect(isPosPackagingItem({ productCode: "SUM-01" })).toBe(true);
    expect(isPosPackagingItem({ productCode: "sum-9" })).toBe(true);
    expect(isPosPackagingItem({ code: "SUM-2" })).toBe(true);
    expect(isPosPackagingItem({ productCode: "EMP-4", isPackaging: true })).toBe(true);
    expect(isPosPackagingItem({ productCode: "BOX-2", packaging: true })).toBe(true);
    expect(isPosPackagingItem(wallet)).toBe(false);
    expect(isPosPackagingItem(null)).toBe(false);
  });

  it("rechaza el empaque en Entrecueros aunque llegue al alta", () => {
    expect(entrecuerosPosCanAddItem(true, { productCode: "SUM-01" })).toBe(false);
    expect(entrecuerosPosCanAddItem(true, { productCode: "EMP-4", isPackaging: true })).toBe(false);
    expect(entrecuerosPosCanAddItem(true, { productCode: "BOX-2", packaging: true })).toBe(false);
    expect(entrecuerosPosCanAddItem(true, wallet)).toBe(true);
  });

  it("deja vender empaque en el kiosko", () => {
    expect(entrecuerosPosCanAddItem(false, { productCode: "SUM-01", isPackaging: true })).toBe(true);
    expect(entrecuerosPosCanAddItem(false, wallet)).toBe(true);
  });
});
