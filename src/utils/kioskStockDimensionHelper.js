import { ENTRECUEROS_KIOSK_LOCATION_ID } from "utils/partialReleaseHelper";
import { isCinchoInventoryProduct, isFossCinchosProductCode } from "utils/cinchoProductionHelper";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import { PRODUCT_BRAND_OPTIONS, normalizeProductBrand } from "utils/productBrandHelper";
import {
  ENTRECUEROS_CINCHO_AUDIENCE_OPTIONS,
  composeWalletHardware,
  extractStockBrand,
  getHardwareConditionLabel,
  isSyntheticHardware,
  isWalletProductName,
  normalizeCinchoAudience,
  normalizeCinchoType,
  normalizeHardwareCondition,
  resolveStockDimensionLabel,
} from "utils/productCinchoHelper";

export const STOCK_DIMENSION_KIND = {
  NONE: "none",
  HERRAJE: "herraje",
  PARA: "para",
  MARCA: "marca",
  WALLET: "wallet",
};

export function isEntreCuerosLocation(locationId) {
  return Number(locationId) === ENTRECUEROS_KIOSK_LOCATION_ID;
}

export function isKioskCinchoProduct(product) {
  if (!product) return false;
  return Boolean(
    normalizeCinchoType(product.cinchoType)
    || product.cinchoForKids
    || isFossCinchosProductCode(product.code)
    || isCinchoInventoryProduct(product)
  );
}

export function stockDimensionKind(locationId, product) {
  if (isPackagingProductCode(product?.code)) return STOCK_DIMENSION_KIND.NONE;
  if (!isEntreCuerosLocation(locationId)) return STOCK_DIMENSION_KIND.HERRAJE;
  if (isKioskCinchoProduct(product)) return STOCK_DIMENSION_KIND.PARA;
  if (isWalletProductName(product?.name)) return STOCK_DIMENSION_KIND.WALLET;
  return STOCK_DIMENSION_KIND.MARCA;
}

export function normalizeStockDimensionKey(value) {
  const hardware = normalizeHardwareCondition(value);
  if (hardware) return hardware;
  const audience = normalizeCinchoAudience(value);
  if (audience) return audience;
  const brand = extractStockBrand(value) || normalizeProductBrand(value);
  if (brand) {
    return composeWalletHardware(isSyntheticHardware(value), brand) || brand;
  }
  const raw = String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
  return raw || "NUEVO";
}

export function resolvePayloadHardware(locationId, product, raw, { allowResidual = false } = {}) {
  const kind = stockDimensionKind(locationId, product);
  if (kind === STOCK_DIMENSION_KIND.NONE) return "NUEVO";
  if (kind === STOCK_DIMENSION_KIND.HERRAJE) {
    return normalizeHardwareCondition(raw) || "NUEVO";
  }
  const residual = normalizeHardwareCondition(raw);
  if (allowResidual && residual) return residual;
  if (kind === STOCK_DIMENSION_KIND.PARA) {
    return normalizeCinchoAudience(raw);
  }
  const brand = extractStockBrand(raw) || normalizeProductBrand(raw);
  if (kind === STOCK_DIMENSION_KIND.WALLET) {
    return composeWalletHardware(isSyntheticHardware(raw), brand);
  }
  return brand;
}

export function isHerrajeDimension(value) {
  const hw = normalizeHardwareCondition(value);
  return hw === "NUEVO" || hw === "VIEJO";
}

/** En Entrecueros N/V no se muestra: residual queda como "—". */
export function kioskDimensionDisplayLabel(value, { entreCueros } = {}) {
  if (entreCueros) {
    if (isHerrajeDimension(value)) return "—";
    return resolveStockDimensionLabel(value) || getHardwareConditionLabel(value) || "—";
  }
  return getHardwareConditionLabel(value);
}

export function dimensionColumnLabel(kind, { entreCueros } = {}) {
  if (kind === STOCK_DIMENSION_KIND.PARA) return "Para";
  if (kind === STOCK_DIMENSION_KIND.WALLET || kind === STOCK_DIMENSION_KIND.MARCA) return "Marca";
  if (kind === STOCK_DIMENSION_KIND.NONE || entreCueros) return "Variante";
  return "Herraje";
}

export function catalogDimensionOptions(kind) {
  if (kind === STOCK_DIMENSION_KIND.HERRAJE) {
    return [
      { value: "NUEVO", label: "Nuevo" },
      { value: "VIEJO", label: "Viejo" },
    ];
  }
  if (kind === STOCK_DIMENSION_KIND.PARA) {
    return ENTRECUEROS_CINCHO_AUDIENCE_OPTIONS.map((opt) => ({
      value: opt.value,
      label: opt.label,
    }));
  }
  if (kind === STOCK_DIMENSION_KIND.WALLET) {
    return PRODUCT_BRAND_OPTIONS.flatMap((brand) => [
      { value: brand, label: brand },
      { value: `SINTETICO:${brand}`, label: `Sintética · ${brand}` },
    ]);
  }
  if (kind === STOCK_DIMENSION_KIND.MARCA) {
    return PRODUCT_BRAND_OPTIONS.map((brand) => ({ value: brand, label: brand }));
  }
  return [];
}

export function dimensionRequiredMessage(kind) {
  if (kind === STOCK_DIMENSION_KIND.PARA) return "indica si es Niño o Dama";
  if (kind === STOCK_DIMENSION_KIND.WALLET) return "indica la marca de la billetera";
  if (kind === STOCK_DIMENSION_KIND.MARCA) return "indica la marca";
  return "indica el herraje";
}

export function sameStockDimension(a, b) {
  return normalizeStockDimensionKey(a) === normalizeStockDimensionKey(b);
}
