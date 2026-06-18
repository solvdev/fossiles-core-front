/** Prefijo en notes del envío (alineado con backend). */
export const OPC_DESTINO_PREFIX = "DESTINO:";

export function buildDefaultDestinationFromOrder(order) {
  if (!order) return "";
  const parts = [order.customerAddress, order.customerName].filter(
    (v) => v != null && String(v).trim() !== ""
  );
  return parts.join(" — ").trim();
}

export function extractDestinationFromShipmentNotes(rawNotes) {
  if (!rawNotes) return "";
  for (const line of String(rawNotes).split("\n")) {
    const trimmed = line.trim();
    if (trimmed.toUpperCase().startsWith(OPC_DESTINO_PREFIX)) {
      return trimmed.slice(OPC_DESTINO_PREFIX.length).trim();
    }
  }
  return "";
}

export function isOpcShipmentEligible(order) {
  if (!order?.id) return false;
  const type = String(order.orderType || "").trim().toUpperCase();
  return type === "CINCHOS" || type === "CINCHOS_FOSSILES" || type === "CINCHOS_MARCAS";
}
