export const KIOSCO_MOVEMENT_TYPE_LABELS = {
  ENTRADA: "Entrada",
  VENTA: "Venta",
  DEVOLUCION_DEPOSITO: "Dev. depósito",
  DEVOLUCION_CLIENTE: "Dev. cliente",
  TRASLADO_SALIDA: "Traslado salida",
  TRASLADO_ENTRADA: "Traslado entrada",
  MERMA: "Merma",
  AJUSTE: "Ajuste",
  ANULACION: "Anulación venta",
  CAMBIO: "Cambio",
};

export const getKioscoMovementTypeLabel = (type) =>
  KIOSCO_MOVEMENT_TYPE_LABELS[String(type || "")] || type || "—";

export const formatKioscoMovementRoute = (movement) => {
  if (!movement) return "—";
  const origin = movement.originLocationName || movement.originLocationCode;
  const dest = movement.destinationLocationName || movement.destinationLocationCode;
  if (origin && dest) return `${origin} → ${dest}`;
  if (dest) return `→ ${dest}`;
  if (origin) return `${origin} →`;
  return "—";
};

export const formatKioscoMovementReference = (movement) => {
  if (movement?.referenceNumber) return movement.referenceNumber;
  const ref = movement?.referenceId;
  if (ref == null || ref === "") return "—";
  const type = String(movement?.movementType || "");
  if (type === "TRASLADO_ENTRADA" || type === "TRASLADO_SALIDA") {
    return `Traslado #${ref}`;
  }
  if (type === "ENTRADA" || type === "DEVOLUCION_DEPOSITO") {
    const reason = String(movement?.reason || "");
    if (reason.includes("Transferencia")) return `TRF-${ref}`;
    if (movement?.referenceType === "SHIPMENT") return `Envío #${ref}`;
  }
  if (type === "VENTA" || type === "ANULACION") return `Factura #${ref}`;
  return `#${ref}`;
};

export const formatKioscoMovementDetail = (movement) => {
  const reason = String(movement?.reason || "").trim();
  if (!reason) return "—";
  if (reason.startsWith("SHIPMENT_RCPT:")) {
    return `Recepción envío · ${reason.replace("SHIPMENT_RCPT:", "")}`;
  }
  if (reason.toLowerCase().includes("recepción envío") || reason.toLowerCase().includes("recepcion envio")) {
    return reason;
  }
  return reason;
};

export const getKioscoMovementSignedQuantity = (movement) => {
  const before = Number(movement?.stockBefore ?? 0);
  const after = Number(movement?.stockAfter ?? 0);
  const delta = after - before;
  if (delta !== 0) return delta > 0 ? `+${delta}` : String(delta);
  const qty = Number(movement?.quantity ?? 0);
  return qty || "—";
};

export const isKioscoTransferMovement = (movement) => {
  const type = String(movement?.movementType || "");
  return type === "TRASLADO_ENTRADA"
    || type === "TRASLADO_SALIDA"
    || movement?.referenceType === "SHIPMENT"
    || movement?.referenceType === "TRANSFER"
    || Boolean(movement?.originLocationId || movement?.destinationLocationId);
};
