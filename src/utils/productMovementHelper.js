/** Tipos de movimiento del kardex de producto terminado (Bodega PT / Devoluciones). */
export const PRODUCT_MOVEMENT_TYPE_LABELS = {
  PRODUCTION_ENTRY: "Entrada por Producción",
  SALE_EXIT: "Salida por Venta",
  TRANSFER_IN: "Transferencia Entrada",
  TRANSFER_OUT: "Transferencia Salida",
  ADJUSTMENT: "Ajuste",
  RETURN: "Devolución",
  ONLINE_SALE_DISPATCH: "Despacho venta online",
  ONLINE_SALE_DISPATCH_REVERSAL: "Anulación despacho online",
  ONLINE_SALE_PREPARE: "Preparación venta online",
  ONLINE_SALE_PREPARE_REVERSAL: "Anulación preparación online",
  ONLINE_SALE_RETURN: "Devolución venta online",
  SHIPMENT: "Envío",
  SHIPMENT_REVERSAL: "Anulación envío",
};

/**
 * Tono visual por tipo (mismas clases que Ledger Lab de kioscos):
 * in = entra, sale = venta, out = sale, bad = anulación, adj = ajuste.
 */
export const PRODUCT_MOVEMENT_TYPE_TONE = {
  PRODUCTION_ENTRY: "in",
  TRANSFER_IN: "in",
  RETURN: "in",
  ONLINE_SALE_RETURN: "in",
  SALE_EXIT: "sale",
  ONLINE_SALE_DISPATCH: "sale",
  ONLINE_SALE_PREPARE: "sale",
  TRANSFER_OUT: "out",
  SHIPMENT: "out",
  SHIPMENT_REVERSAL: "bad",
  ONLINE_SALE_DISPATCH_REVERSAL: "bad",
  ONLINE_SALE_PREPARE_REVERSAL: "bad",
  ADJUSTMENT: "adj",
};

export const productMovementTypeLabel = (type) => {
  if (!type) return "—";
  return PRODUCT_MOVEMENT_TYPE_LABELS[type] || type;
};

export const productMovementTypeTone = (type) => PRODUCT_MOVEMENT_TYPE_TONE[type] || "adj";

/** Diferencia after − before; null si falta alguno. */
export const movementDelta = (before, after) => {
  if (before == null || after == null) return null;
  const b = Number(before);
  const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  return a - b;
};

/** Tallas con cantidad distinta de cero, ordenadas numéricamente. */
export const sortedNonZeroSizeEntries = (sizes) => {
  if (!sizes || typeof sizes !== "object") return [];
  return Object.entries(sizes)
    .filter(([, v]) => Number(v) !== 0)
    .sort((a, b) => Number(a[0]) - Number(b[0])
      || String(a[0]).localeCompare(String(b[0]), "es", { numeric: true }));
};
