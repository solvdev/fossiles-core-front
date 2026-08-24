/** Observaciones de usuario en product_shipment.notes (sin metadatos DESTINO/packing/etc.). */

const isShipmentNotesMetaLine = (line) => {
  const upper = String(line || "").trim().toUpperCase();
  if (!upper) return false;
  if (upper.startsWith("DESTINO:")) return true;
  if (upper.startsWith("DOCUMENT_DATE:")) return true;
  if (upper.startsWith("__")) return true;
  if (upper.startsWith("INTERNAL_ENVI")) return true;
  if (upper.startsWith("REQUEST_TYPE:")) return true;
  if (upper.startsWith("DISCOUNT_PERCENT:")) return true;
  if (upper.startsWith("DISCOUNT_AMOUNT:")) return true;
  if (upper.startsWith("APPLY_HALF_PRICE:")) return true;
  if (upper.startsWith("COLABORADOR_PHONE:")) return true;
  if (upper.startsWith("COLABORADOR_NIT:")) return true;
  return false;
};

export function extractShipmentUserObservation(notes) {
  return String(notes || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !isShipmentNotesMetaLine(line))
    .join("\n")
    .trim();
}

export function mergeShipmentUserObservation(existingNotes, observation) {
  const metaLines = String(existingNotes || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && isShipmentNotesMetaLine(line));
  const obs = String(observation || "").trim();
  const parts = [...metaLines];
  if (obs) parts.push(obs);
  return parts.join("\n").trim() || null;
}
