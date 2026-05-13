/** Tipos de orden que usan rejilla por tallas (mismo criterio que el formulario de OP). */
export const CINCHO_ORDER_TYPES = ["CINCHOS", "CINCHOS_FOSSILES", "CINCHOS_MARCAS"];

export function isCinchoOrderType(orderType) {
  const t = String(orderType || "").trim().toUpperCase();
  return CINCHO_ORDER_TYPES.includes(t);
}

/** OPCF / OPCM: cinchos con vista y endpoint de estado dedicados. */
export function isManagedCinchoOrderType(orderType) {
  const t = String(orderType || "").trim().toUpperCase();
  return t === "CINCHOS_FOSSILES" || t === "CINCHOS_MARCAS";
}

/** Productos cincho de catálogo FOSS… (venta en línea). */
export function isFossCinchosProductCode(productCode) {
  const c = String(productCode || "").trim().toUpperCase();
  return c.startsWith("FOSS");
}
