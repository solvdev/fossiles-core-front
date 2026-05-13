/**
 * URLs embebidas en QR para despacho PT (escaneo desde app móvil Bodega PT).
 * Deben coincidir con el parser en fossiles-mobile-inventory (ptDispatchScan).
 */

export function getPublicFrontBaseUrl() {
  const configured = process.env.REACT_APP_FRONTEND_URL;
  if (
    configured &&
    !String(configured).includes("localhost") &&
    !String(configured).includes("127.0.0.1")
  ) {
    return String(configured).replace(/\/$/, "");
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, "");
  }
  return "";
}

/**
 * Venta en línea: despacho paquetería (onlineSaleId + opcional OP de venta en línea).
 */
export function buildPtDispatchOnlineUrl(baseUrl, { onlineSaleId, productionOrderId } = {}) {
  const b = String(baseUrl || "").replace(/\/$/, "");
  const id = encodeURIComponent(String(onlineSaleId ?? ""));
  const po =
    productionOrderId != null && String(productionOrderId).trim() !== ""
      ? `&productionOrderId=${encodeURIComponent(String(productionOrderId).trim())}`
      : "";
  return `${b}/public/pt-dispatch/online?onlineSaleId=${id}${po}`;
}

/**
 * Envío de distribución (Bodega PT / kioskos) — etiqueta por envío (compatibilidad).
 */
export function buildPtDispatchDistributionShipmentUrl(baseUrl, shipmentId) {
  const b = String(baseUrl || "").replace(/\/$/, "");
  return `${b}/public/pt-dispatch/distribution-shipment?shipmentId=${encodeURIComponent(String(shipmentId))}`;
}

/**
 * Distribución completa: un QR abre en la app la lista de envíos con tarjetas y swipe por envío.
 */
export function buildPtDispatchDistributionUrl(baseUrl, distributionId) {
  const b = String(baseUrl || "").replace(/\/$/, "");
  return `${b}/public/pt-dispatch/distribution?distributionId=${encodeURIComponent(String(distributionId))}`;
}
