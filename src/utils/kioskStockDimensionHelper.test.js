import { ENTRECUEROS_KIOSK_LOCATION_ID } from "utils/partialReleaseHelper";
import {
  STOCK_DIMENSION_KIND,
  hasJrProductCode,
  isKidsCinchoProduct,
  stockDimensionKind,
} from "utils/kioskStockDimensionHelper";
import { ENTRECUEROS_ALL_CINCHO_SIZES, resolveCinchoSizesForOpening } from "utils/productCinchoHelper";

describe("kioskStockDimensionHelper Entre Cueros cinchos", () => {
  const entreCueros = ENTRECUEROS_KIOSK_LOCATION_ID;
  const otherKiosk = 10;
  const adultCincho = { code: "N-113", name: "Cincho casual", cinchoType: "CASUAL", cinchoForKids: false };
  const kidsCincho = { code: "FOSS-KIDS", name: "Cincho niño", cinchoType: "CASUAL", cinchoForKids: true };
  const jrCincho = { code: "N-113-JR", name: "Cincho junior", cinchoType: "CASUAL", cinchoForKids: false };

  it("detecta código JR", () => {
    expect(hasJrProductCode("N-113-JR")).toBe(true);
    expect(hasJrProductCode("N-113")).toBe(false);
  });

  it("solo cinchos de niño / JR usan PARA", () => {
    expect(isKidsCinchoProduct(adultCincho)).toBe(false);
    expect(isKidsCinchoProduct(kidsCincho)).toBe(true);
    expect(isKidsCinchoProduct(jrCincho)).toBe(true);
    expect(stockDimensionKind(entreCueros, adultCincho)).toBe(STOCK_DIMENSION_KIND.NONE);
    expect(stockDimensionKind(entreCueros, kidsCincho)).toBe(STOCK_DIMENSION_KIND.PARA);
    expect(stockDimensionKind(entreCueros, jrCincho)).toBe(STOCK_DIMENSION_KIND.PARA);
  });

  it("otros kioskos siguen usando herraje", () => {
    expect(stockDimensionKind(otherKiosk, adultCincho)).toBe(STOCK_DIMENSION_KIND.HERRAJE);
  });

  it("en Entre Cueros todos los cinchos ofrecen tallas hasta 44", () => {
    expect(resolveCinchoSizesForOpening(adultCincho, { entreCueros: true })).toEqual(ENTRECUEROS_ALL_CINCHO_SIZES);
    expect(resolveCinchoSizesForOpening(kidsCincho, { entreCueros: true })).toEqual(ENTRECUEROS_ALL_CINCHO_SIZES);
    expect(ENTRECUEROS_ALL_CINCHO_SIZES).toContain("44");
    expect(ENTRECUEROS_ALL_CINCHO_SIZES).not.toContain("46");
  });
});
