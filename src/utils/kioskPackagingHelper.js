export function isPackagingProductCode(code) {
  return String(code || "").trim().toUpperCase().startsWith("SUM");
}

/** Empaque: bandera isPackaging/packaging o código SUM. No cambia el filtro del kiosko. */
export function isPosPackagingItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.isPackaging || item.packaging) return true;
  return isPackagingProductCode(item.productCode) || isPackagingProductCode(item.code);
}

/** Kiosko sigue aceptando empaque. Entrecueros no. */
export function entrecuerosPosCanAddItem(isEntrecuerosPos, item) {
  if (!isEntrecuerosPos) return true;
  return !isPosPackagingItem(item);
}
