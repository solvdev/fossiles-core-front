import { isPosPackagingItem } from "utils/kioskPackagingHelper";

/**
 * Administración, kiosko A15 y cualquier kiosko cuyo nombre incluya Miraflores.
 * El modo (estándar o Entrecueros) no limita el permiso.
 */
export function canEditPosPrices({ admin = false, kioskCode = "", kioskName = "" } = {}) {
  if (admin) return true;
  const code = String(kioskCode || "").trim().toUpperCase();
  const name = String(kioskName || "").trim().toUpperCase();
  return code === "A15" || name.includes("MIRAFLORES");
}

/** El cajero cambió el monto. El chip Final / Con desc. no enciende esta marca. */
export function isUnitPriceEdited(line) {
  return Boolean(line?.unitPriceEdited);
}

export function isCatalogZeroPosLine(line) {
  return !(Number(line?.catalogUnitPrice) > 0);
}

/** Chip: true = Final (sin descuento), false = Con desc. */
export function isPosPriceFinalChip(line) {
  return Boolean(line?.priceEdited);
}

/**
 * Líneas editadas no entran al volumen de Entrecueros (ni al tramo ni a la cortesía).
 */
export function cartLinesForEntrecuerosVolume(cart) {
  return (cart || []).filter((line) => !isUnitPriceEdited(line));
}

/**
 * Campos de precio para POST /kiosk-pos/sales.
 * null = no enviar unitPrice ni priceFinal.
 *
 * - Chip Final: se envía el precio actual de la línea y priceFinal true, aunque
 *   el cajero no haya tecleado otro monto.
 * - unitPriceEdited en Con desc.: se envía el monto tecleado y priceFinal false.
 * - Catálogo en 0 con monto > 0: se envía unitPrice y priceFinal según el chip.
 * - Con desc. sin monto editado, y líneas sin Final: no se envía nada.
 * - Empaque: sin chip; si se envía el monto capturado, queda final.
 */
export function posSaleItemPriceFields(line) {
  const unitPrice = Number(line?.unitPrice);
  if (!(unitPrice > 0)) return null;

  if (isPosPackagingItem(line)) {
    if (isCatalogZeroPosLine(line)) {
      return { unitPrice, priceFinal: true };
    }
    return null;
  }

  const finalChip = isPosPriceFinalChip(line);
  if (!isUnitPriceEdited(line) && !isCatalogZeroPosLine(line) && !finalChip) return null;
  return {
    unitPrice,
    priceFinal: finalChip,
  };
}

/** El back no aplicará descuento de POS/promo sobre esta línea. */
export function posLineChargesFinalPrice(line) {
  return Boolean(posSaleItemPriceFields(line)?.priceFinal);
}

export function buildPosSaleItem(line) {
  const item = {
    productId: line.productId,
    colorId: line.colorId || null,
    size: line.size || null,
    hardwareCondition: line.hardwareCondition || "NUEVO",
    quantity: Number(line.quantity || 0),
  };
  if (line.extraRequest) {
    item.extraRequestId = line.extraRequest.id;
  }
  const price = posSaleItemPriceFields(line);
  if (price) {
    item.unitPrice = price.unitPrice;
    item.priceFinal = price.priceFinal;
  }
  return item;
}
