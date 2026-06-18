/** Metadatos de envío interno ENVI sin orden de producción (notes en product_shipment). */

export function parseStandaloneInternalMeta(notes) {
  const lines = String(notes || "").split("\n");
  let recipientName = "";
  let recipientPhone = "";
  let recipientTaxId = "";
  let applyHalfPrice = true;
  let documentDate = "";
  let requestType = "PLANILLA";
  let discountPercent = null;
  let discountAmount = null;

  lines.forEach((raw) => {
    const line = String(raw || "").trim();
    const upper = line.toUpperCase();
    if (upper.startsWith("DESTINO:")) {
      const dest = line.slice(8).trim();
      const m = dest.match(/^Personal interno\s*[—-]\s*(.+?)(?:\s*\/\s*(?:Planilla|Defectos))?\s*$/i);
      recipientName = m ? m[1].trim() : dest;
    } else if (upper.startsWith("COLABORADOR_PHONE:")) {
      recipientPhone = line.slice(18).trim();
    } else if (upper.startsWith("COLABORADOR_NIT:")) {
      recipientTaxId = line.slice(16).trim();
    } else if (upper.startsWith("APPLY_HALF_PRICE:0")) {
      applyHalfPrice = false;
    } else if (upper.startsWith("REQUEST_TYPE:DEFECTOS")) {
      requestType = "DEFECTOS";
    } else if (upper.startsWith("REQUEST_TYPE:PLANILLA")) {
      requestType = "PLANILLA";
    } else if (upper.startsWith("DOCUMENT_DATE:")) {
      documentDate = line.slice(14).trim();
    } else if (upper.startsWith("DISCOUNT_PERCENT:")) {
      const value = Number(line.slice(17).trim());
      if (Number.isFinite(value)) discountPercent = value;
    } else if (upper.startsWith("DISCOUNT_AMOUNT:")) {
      const value = Number(line.slice(16).trim());
      if (Number.isFinite(value)) discountAmount = value;
    }
  });

  if (requestType === "DEFECTOS" && discountPercent == null && discountAmount == null && applyHalfPrice) {
    discountPercent = 50;
  }

  return {
    recipientName,
    recipientPhone,
    recipientTaxId,
    applyHalfPrice,
    documentDate,
    requestType,
    discountPercent,
    discountAmount,
  };
}

/** Precio unitario a cobrar según tipo de solicitud y descuento. */
export function computeInternalEnviUnitPrice(catalogPrice, meta) {
  const ref = Number(catalogPrice);
  if (!Number.isFinite(ref) || ref <= 0) return null;

  if (meta?.discountAmount != null && Number(meta.discountAmount) >= 0) {
    return Number(meta.discountAmount);
  }
  if (meta?.discountPercent != null && Number(meta.discountPercent) >= 0) {
    return ref * (Number(meta.discountPercent) / 100);
  }
  if (meta?.requestType === "PLANILLA" || meta?.applyHalfPrice !== false) {
    return ref * 0.5;
  }
  return ref;
}

export function getInternalEnviPriceNote(metaOrHalf) {
  const meta =
    metaOrHalf != null && typeof metaOrHalf === "object"
      ? metaOrHalf
      : { applyHalfPrice: metaOrHalf !== false };

  if (meta.discountAmount != null && Number(meta.discountAmount) >= 0) {
    return `Precio unitario Q${Number(meta.discountAmount).toFixed(2)}`;
  }
  if (meta.discountPercent != null && Number(meta.discountPercent) >= 0) {
    return `Precio ${Number(meta.discountPercent)}% sobre precio de venta de catálogo`;
  }
  if (meta.applyHalfPrice !== false) {
    return "Precio 50% de descuento sobre precio de venta de catálogo";
  }
  return "Precios de referencia de catálogo.";
}

const REQUEST_TYPE_PRINT_LABELS = {
  PLANILLA: "Planilla",
  DEFECTOS: "Defectos",
};

/** Texto legible para la sección Notas del ENVIO INTERNO impreso. */
export function buildInternalEnviPrintNotes(notes) {
  const meta = parseStandaloneInternalMeta(notes);
  const recipient = meta.recipientName || "Colaborador";
  const typeLabel = REQUEST_TYPE_PRINT_LABELS[meta.requestType] || "Planilla";
  let text = `INTERNAL_ENVI:1 DESTINO: Personal interno — ${recipient} / ${typeLabel}`;
  const userNotes = getStandaloneInternalUserNotes(notes);
  if (userNotes) {
    text += ` — ${userNotes}`;
  }
  return text;
}

export function isStandaloneInternalShipment(shipment) {
  if (!shipment) return false;
  if (shipment.productionOrderId != null || shipment.distributionId != null) {
    return false;
  }
  const notes = String(shipment.notes || "").toLowerCase();
  if (notes.includes("internal_envi") || notes.includes("personal interno")) {
    return true;
  }
  return /^ENVI-\d+$/i.test(String(shipment.shipmentNumber || "").trim());
}

/** Cualquier documento ENVI interno (standalone o ligado a OPI INTERNA). */
export function isInternalEnviShipment(shipment) {
  if (!shipment) return false;
  if (/^ENVI-\d+$/i.test(String(shipment.shipmentNumber || "").trim())) {
    return true;
  }
  return isStandaloneInternalShipment(shipment);
}

export function resolveInternalEnviCollaborator(shipment) {
  const meta = parseStandaloneInternalMeta(shipment?.notes);
  if (meta.recipientName) return meta.recipientName;
  const location = String(shipment?.locationName || "").trim();
  const fromLocation = location.match(/^Personal interno\s*[—-]\s*(.+?)(?:\s*\/\s*(?:Planilla|Defectos))?\s*$/i);
  if (fromLocation) return fromLocation[1].trim();
  return location || "—";
}

export function formatInternalRequestTypeLabel(source) {
  const requestType = source?.requestType || "PLANILLA";
  if (requestType === "PLANILLA") {
    return "Planilla (50%)";
  }
  if (source?.discountAmount != null && Number(source.discountAmount) >= 0) {
    return `Defectos (Q${Number(source.discountAmount).toFixed(2)})`;
  }
  if (source?.discountPercent != null && Number(source.discountPercent) >= 0) {
    return `Defectos (${Number(source.discountPercent)}%)`;
  }
  return "Defectos (50%)";
}

export function resolveInternalEnviTypeLabel(shipment) {
  if (shipment?.productionOrderId) {
    return shipment.productionOrderCode
      ? `OPI — ${shipment.productionOrderCode}`
      : "OPI (INTERNA)";
  }
  const meta = parseStandaloneInternalMeta(shipment?.notes);
  return formatInternalRequestTypeLabel(meta);
}

export function getStandaloneInternalUserNotes(notes) {
  return String(notes || "")
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter((line) => {
      if (!line) return false;
      const upper = line.toUpperCase();
      return (
        !upper.startsWith("INTERNAL_ENVI:") &&
        !upper.startsWith("DESTINO:") &&
        !upper.startsWith("COLABORADOR_PHONE:") &&
        !upper.startsWith("COLABORADOR_NIT:") &&
        !upper.startsWith("APPLY_HALF_PRICE:") &&
        !upper.startsWith("REQUEST_TYPE:") &&
        !upper.startsWith("DOCUMENT_DATE:") &&
        !upper.startsWith("DISCOUNT_PERCENT:") &&
        !upper.startsWith("DISCOUNT_AMOUNT:")
      );
    })
    .join("\n")
    .trim();
}

export function buildPseudoOrderFromStandaloneShipment(shipment) {
  const meta = parseStandaloneInternalMeta(shipment?.notes);
  const dateStr =
    meta.documentDate ||
    (shipment?.sentAt && String(shipment.sentAt).slice(0, 10)) ||
    (shipment?.createdAt && String(shipment.createdAt).slice(0, 10)) ||
    new Date().toISOString().slice(0, 10);
  return {
    orderType: "INTERNA",
    customerName: meta.recipientName || shipment?.locationName || "Colaborador",
    customerAddress: "—",
    customerPhone: meta.recipientPhone || "—",
    customerTaxId: meta.recipientTaxId || "CF",
    code: shipment?.shipmentNumber || String(shipment?.id || ""),
    vendorShipmentNumber: shipment?.shipmentNumber || "",
    sellerName: "—",
    startDate: dateStr,
    deliveryDate: dateStr,
  };
}

export function buildPricingMetaFromRequest(request) {
  if (!request || request.requestType !== "DEFECTOS") {
    return { requestType: "PLANILLA", discountPercent: 50, applyHalfPrice: true };
  }
  if (request.discountAmount != null && Number(request.discountAmount) >= 0) {
    return {
      requestType: "DEFECTOS",
      discountAmount: Number(request.discountAmount),
      applyHalfPrice: false,
    };
  }
  const percent = Number(request.discountPercent);
  return {
    requestType: "DEFECTOS",
    discountPercent: Number.isFinite(percent) ? percent : 50,
    applyHalfPrice: Number.isFinite(percent) && percent === 50,
  };
}
