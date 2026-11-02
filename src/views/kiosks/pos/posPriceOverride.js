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
 * En Entrecueros el back trata cualquier unitPrice > 0 como override: lo saca del
 * volumen y lo cobra final. Solo se envía si un usuario autorizado tecleó el monto.
 */
export function entrecuerosLineSendsUnitPrice(line, { canEditPrices = false } = {}) {
  return Boolean(canEditPrices)
    && isUnitPriceEdited(line)
    && Number(line?.unitPrice) > 0
    && !isPosPackagingItem(line);
}

/** Líneas que enviarán unitPrice. El resto sigue en el volumen de Entrecueros. */
export function cartLinesForEntrecuerosVolume(cart, options) {
  return (cart || []).filter((line) => !entrecuerosLineSendsUnitPrice(line, options));
}

/**
 * Campos de precio para POST /kiosk-pos/sales.
 * null = no enviar unitPrice ni priceFinal.
 *
 * Estándar (no cambia):
 * - Chip Final: precio actual y priceFinal true, aunque no se haya tecleado otro monto.
 * - unitPriceEdited en Con desc.: monto tecleado y priceFinal false.
 * - Catálogo en 0 con monto > 0: unitPrice y priceFinal según el chip.
 * - Con desc. sin monto editado: no se envía nada.
 * - Sin permiso de edición solo se conserva el catálogo en 0 (igual que main).
 *
 * Entrecueros: unitPrice solo si entrecuerosLineSendsUnitPrice. Esas mismas líneas
 * quedan fuera del volumen.
 */
export function posSaleItemPriceFields(line, { entrecueros = false, canEditPrices = true } = {}) {
  const unitPrice = Number(line?.unitPrice);
  if (!(unitPrice > 0)) return null;

  if (entrecueros) {
    if (!entrecuerosLineSendsUnitPrice(line, { canEditPrices })) return null;
    return {
      unitPrice,
      priceFinal: isPosPriceFinalChip(line),
    };
  }

  if (!canEditPrices) {
    if (!isCatalogZeroPosLine(line)) return null;
    return {
      unitPrice,
      priceFinal: isPosPackagingItem(line) ? true : isPosPriceFinalChip(line),
    };
  }

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
export function posLineChargesFinalPrice(line, options) {
  return Boolean(posSaleItemPriceFields(line, options)?.priceFinal);
}

export function buildPosSaleItem(line, options) {
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
  const price = posSaleItemPriceFields(line, options);
  if (price) {
    item.unitPrice = price.unitPrice;
    item.priceFinal = price.priceFinal;
  }
  return item;
}
