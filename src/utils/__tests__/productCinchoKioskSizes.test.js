import {
  ADULT_CINCHO_SIZES,
  ALL_CINCHO_SIZES,
  KIDS_CINCHO_SIZES,
  resolveKioskLineSizeOptions,
} from "utils/productCinchoHelper";

describe("resolveKioskLineSizeOptions", () => {
  const adultCincho = { id: 1, code: "T-84", name: "CINCHO CASUAL TOMMY", cinchoType: "CASUAL" };
  const kidsCincho = { id: 2, code: "FOSS-N1", name: "CINCHO NIÑO", cinchoForKids: true };

  it("ingreso de cincho ofrece todas las tallas aunque el kiosko no tenga ninguna", () => {
    const options = resolveKioskLineSizeOptions({
      product: adultCincho,
      existingSizes: [],
      isCincho: true,
      inflow: true,
    });
    expect(options).toEqual(ALL_CINCHO_SIZES);
    expect(options).toContain("16");
    expect(options).toContain("46");
  });

  it("ingreso de cincho de niño también permite tallas de adulto", () => {
    const options = resolveKioskLineSizeOptions({
      product: kidsCincho,
      existingSizes: ["18"],
      isCincho: true,
      inflow: true,
    });
    expect(options).toContain("36");
  });

  it("ingreso conserva tallas existentes fuera del catálogo", () => {
    const options = resolveKioskLineSizeOptions({
      product: adultCincho,
      existingSizes: ["48"],
      isCincho: true,
      inflow: true,
    });
    expect(options[options.length - 1]).toBe("48");
  });

  it("salida sigue con el catálogo del producto + lo que existe", () => {
    expect(
      resolveKioskLineSizeOptions({ product: adultCincho, existingSizes: [], isCincho: true })
    ).toEqual(ADULT_CINCHO_SIZES);
    expect(
      resolveKioskLineSizeOptions({ product: kidsCincho, existingSizes: [], isCincho: true })
    ).toEqual(KIDS_CINCHO_SIZES);
  });

  it("producto no cincho solo muestra su desglose actual", () => {
    expect(
      resolveKioskLineSizeOptions({ product: { id: 3 }, existingSizes: ["M", "S"], inflow: true })
    ).toEqual(["M", "S"]);
  });
});
