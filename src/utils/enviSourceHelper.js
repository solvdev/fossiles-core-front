import { formatQty } from "utils/standaloneInternalShipmentHelper";

export const ENVI_SOURCE = {
  RETURNS: "DEVOLUCIONES",
  PT: "BODEGA_PT",
  BOTH: "AMBAS",
};

/** Hay desglose por bodega para elegir (el back lo manda en las solicitudes pendientes). */
export function hasStockByWarehouse(request) {
  return Boolean(request?.lines?.length)
    && request.lines.every((line) => line.returnsAvailable != null && line.ptAvailable != null);
}

/** Una fila por producto + color + talla: es la unidad con la que se elige la bodega. */
export function groupLinesForSource(lines) {
  const byKey = new Map();
  (lines || []).forEach((line) => {
    const key = `${line.productId}|${line.colorId ?? ""}|${String(line.size || "").trim().toUpperCase()}`;
    const quantity = Number(line.quantity) || 0;
    const current = byKey.get(key);
    if (current) {
      current.quantity += quantity;
      return;
    }
    byKey.set(key, { ...line, key, quantity });
  });
  return Array.from(byKey.values());
}

/** Bodegas posibles para una fila. «Ambas» solo aparece cuando ninguna alcanza por sí sola pero juntas sí. */
export function sourceOptionsForLine(line) {
  const needed = Number(line?.quantity) || 0;
  const returns = Number(line?.returnsAvailable) || 0;
  const pt = Number(line?.ptAvailable) || 0;
  const options = [
    { value: ENVI_SOURCE.RETURNS, label: `Devoluciones (hay ${formatQty(returns)})`, enabled: returns >= needed },
    { value: ENVI_SOURCE.PT, label: `Bodega PT (hay ${formatQty(pt)})`, enabled: pt >= needed },
  ];
  if (returns < needed && pt < needed && returns + pt >= needed) {
    options.push({
      value: ENVI_SOURCE.BOTH,
      label: `Ambas (${formatQty(returns)} + ${formatQty(needed - returns)})`,
      enabled: true,
    });
  }
  return options;
}

/** Primera bodega que alcanza (Devoluciones primero); vacío si ninguna. */
export function defaultSourceForLine(line) {
  return sourceOptionsForLine(line).find((option) => option.enabled)?.value || "";
}
