export const KIOSCO_MOVEMENT_TYPE_LABELS = {
  ENTRADA: "Entrada",
  VENTA: "Venta",
  DEVOLUCION_DEPOSITO: "Dev. bodega",
  DEVOLUCION_CLIENTE: "Dev. de cliente",
  DEVOLUCION_A_CLIENTE: "Dev. a cliente",
  TRASLADO_SALIDA: "Traslado salida",
  TRASLADO_ENTRADA: "Traslado entrada",
  MERMA: "Merma",
  AJUSTE: "Ajuste",
  ANULACION: "Anulación venta",
  CAMBIO: "Cambio",
};

export const normalizeKioscoMovementType = (type) => {
  if (type == null || type === "") return "";
  if (typeof type === "string") return type;
  if (typeof type === "object") {
    if (type.name) return String(type.name);
    if (type.value) return String(type.value);
  }
  return String(type);
};

export const getKioscoMovementTypeLabel = (type, movement = null) => {
  const normalized = normalizeKioscoMovementType(type);
  if (normalized === "CAMBIO" && movement) {
    const before = Number(movement.stockBefore);
    const after = Number(movement.stockAfter);
    if (Number.isFinite(before) && Number.isFinite(after) && before !== after) {
      return after > before ? "Cambio (entrada)" : "Cambio (salida)";
    }
  }
  return KIOSCO_MOVEMENT_TYPE_LABELS[normalized] || normalized || "—";
};

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
  if (movement?.physicalSlipNumber) return movement.physicalSlipNumber;
  if (movement?.referenceNumber) return movement.referenceNumber;
  const ref = movement?.referenceId;
  if (ref == null || ref === "") return "—";
  const type = normalizeKioscoMovementType(movement?.movementType);
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
  const type = normalizeKioscoMovementType(movement?.movementType);
  return type === "TRASLADO_ENTRADA"
    || type === "TRASLADO_SALIDA"
    || movement?.referenceType === "SHIPMENT"
    || movement?.referenceType === "TRANSFER"
    || Boolean(movement?.originLocationId || movement?.destinationLocationId);
};

export const KIOSK_LEDGER_LAB_USERNAME = "eramirez";

export const canEditKioskLedger = (username) =>
  String(username || "").trim().toLowerCase() === KIOSK_LEDGER_LAB_USERNAME;

export const ymdFromValue = (value) => {
  if (value == null || value === "") return "";
  return String(value).slice(0, 10);
};

export const buildKioskMovementsAccountingUrl = ({
  locationId,
  productId,
  colorId,
  from,
  to,
  type,
  referenceTerm,
  sizeKey,
} = {}) => {
  const params = new URLSearchParams();
  if (locationId) params.set("locationId", String(locationId));
  if (productId) params.set("productId", String(productId));
  if (colorId) params.set("colorId", String(colorId));
  if (from) params.set("from", ymdFromValue(from));
  if (to) params.set("to", ymdFromValue(to));
  if (type) params.set("type", String(type));
  if (referenceTerm) params.set("referenceTerm", String(referenceTerm));
  if (sizeKey) params.set("sizeKey", String(sizeKey));
  const qs = params.toString();
  return `/admin/kiosk-movements-accounting${qs ? `?${qs}` : ""}`;
};

export const accountingMovementToLabUpdate = (movement, typeOverride) => ({
  kioscoStockId: movement?.kioscoStockId ?? null,
  movementType: typeOverride || normalizeKioscoMovementType(movement?.tipoMovimiento || movement?.movementType),
  quantity: movement?.cantidad ?? movement?.quantity ?? null,
  sizeKey: movement?.talla || movement?.sizeKey || null,
  stockBefore: movement?.stockAntes ?? movement?.stockBefore ?? null,
  stockAfter: movement?.stockDespues ?? movement?.stockAfter ?? null,
  physicalSlipNumber: movement?.boletaFisica || movement?.physicalSlipNumber || null,
  reason: movement?.motivo || movement?.reason || null,
});
