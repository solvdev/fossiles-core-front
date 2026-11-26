// Elección por línea de la bodega de salida al enviar, cuando la principal no alcanza para todo.

export const SHIPMENT_SOURCE = {
  PRIMARY: "PRIMARY",
  FALLBACK: "FALLBACK",
  BOTH: "BOTH",
};

const num = (value) => Number(value) || 0;

export const formatShipmentQty = (value) => {
  const n = num(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

/** La línea puede salir de la bodega de respaldo (los cinchos no). */
export function lineAllowsFallback(line) {
  return line?.fallbackQuantity != null;
}

/** Bodegas posibles para una línea; solo se habilita la que alcanza. */
export function shipmentSourceOptions(line, primaryLabel, fallbackLabel) {
  const needed = num(line?.requiredQuantity);
  const primary = num(line?.primaryAvailable);
  const options = [
    {
      value: SHIPMENT_SOURCE.PRIMARY,
      label: `${primaryLabel} (hay ${formatShipmentQty(primary)})`,
      enabled: primary >= needed,
    },
  ];
  if (!lineAllowsFallback(line)) return options;

  const fallback = num(line.fallbackQuantity);
  options.push({
    value: SHIPMENT_SOURCE.FALLBACK,
    label: `Todo de ${fallbackLabel} (hay ${formatShipmentQty(fallback)})`,
    enabled: fallback >= needed,
  });
  if (primary > 0 && primary < needed && primary + fallback >= needed) {
    options.push({
      value: SHIPMENT_SOURCE.BOTH,
      label: `${primaryLabel} ${formatShipmentQty(primary)} + ${fallbackLabel} ${formatShipmentQty(needed - primary)}`,
      enabled: true,
    });
  }
  return options;
}

/** La principal si alcanza; si no, queda sin elegir para que el usuario lo autorice. */
export function defaultShipmentSource(line) {
  return num(line?.primaryAvailable) >= num(line?.requiredQuantity) ? SHIPMENT_SOURCE.PRIMARY : "";
}

/** Atajo «todo de respaldo» o «solo el faltante» para una línea; null si no le aplica. */
export function bulkShipmentSource(line, wholeFallback) {
  const needed = num(line?.requiredQuantity);
  const primary = num(line?.primaryAvailable);
  const fallback = num(line?.fallbackQuantity);
  if (wholeFallback) {
    return lineAllowsFallback(line) && fallback >= needed ? SHIPMENT_SOURCE.FALLBACK : null;
  }
  if (primary >= needed) return SHIPMENT_SOURCE.PRIMARY;
  if (!lineAllowsFallback(line) || primary + fallback < needed) return null;
  return primary > 0 ? SHIPMENT_SOURCE.BOTH : SHIPMENT_SOURCE.FALLBACK;
}
