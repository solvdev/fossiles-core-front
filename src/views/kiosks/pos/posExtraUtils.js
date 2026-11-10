/**
 * Complemento extra del POS: helpers puros para el carrito.
 *
 * Una línea con complemento es una línea aparte (key = baseKey|cx<id>) con cantidad bloqueada.
 * `unitPrice` sigue siendo el precio base (descuentos y promociones trabajan sobre él) y el extra por pieza
 * vive en `extraUnitAmount`; el servidor recalcula el precio al cobrar a partir de `extraRequest.id`.
 */

export const EXTRA_PENDING = "PENDING";
export const EXTRA_APPROVED = "APPROVED";
export const EXTRA_REJECTED = "REJECTED";

export const extraLineKey = (baseKey, requestId) => `${baseKey}|cx${requestId}`;

export const lineBaseKey = (line) => line?.baseKey || line?.key;

export const lineExtraUnit = (line) =>
  line?.extraRequest ? Number(line.extraUnitAmount || 0) : 0;

export const lineUnitWithExtra = (line) => Number(line?.unitPrice || 0) + lineExtraUnit(line);

export const lineTotalWithExtra = (line) =>
  Number(line?.quantity || 0) * lineUnitWithExtra(line);

const pickRequest = (request) => ({
  id: request.id,
  requestNumber: request.requestNumber || null,
  status: request.status || EXTRA_PENDING,
  description: request.description || "",
  extraAmount: Number(request.extraAmount || 0),
  rejectionReason: request.rejectionReason || null,
});

/**
 * Separa `pieces` piezas de una línea para el complemento solicitado. Si son todas, la línea completa
 * pasa a ser la línea con complemento; si no, el resto queda en la línea original.
 */
export const splitLineForExtra = (cart, lineKey, pieces, request) => {
  const idx = (cart || []).findIndex((line) => line.key === lineKey);
  if (idx < 0 || !request?.id) return cart;
  const line = cart[idx];
  const qty = Number(line.quantity || 0);
  const n = Math.min(Math.max(1, Math.floor(Number(pieces) || 1)), qty);
  const baseKey = lineBaseKey(line);
  const extraLine = {
    ...line,
    key: extraLineKey(baseKey, request.id),
    baseKey,
    quantity: n,
    extraUnitAmount: Number(request.extraAmount || 0),
    extraRequest: pickRequest(request),
  };
  const next = [...cart];
  if (n >= qty) {
    next.splice(idx, 1, extraLine);
  } else {
    next.splice(idx, 1, { ...line, quantity: qty - n }, extraLine);
  }
  return next;
};

/** Quita el complemento de una línea y devuelve sus piezas a la línea normal (o la restaura). */
export const mergeExtraBack = (cart, lineKey) => {
  const line = (cart || []).find((row) => row.key === lineKey);
  if (!line || !line.extraRequest) return cart;
  const baseKey = lineBaseKey(line);
  const base = cart.find((row) => row.key === baseKey && !row.extraRequest);
  if (base) {
    return cart
      .filter((row) => row.key !== lineKey)
      .map((row) =>
        row.key === baseKey
          ? { ...row, quantity: Number(row.quantity || 0) + Number(line.quantity || 0) }
          : row
      );
  }
  // eslint-disable-next-line no-unused-vars
  const { extraRequest, extraUnitAmount, baseKey: _baseKey, ...rest } = line;
  return cart.map((row) => (row.key === lineKey ? { ...rest, key: baseKey } : row));
};

/** Cantidad de las demás líneas que comparten el mismo producto/variante (stock compartido). */
export const siblingQty = (cart, line) => {
  const baseKey = lineBaseKey(line);
  return (cart || [])
    .filter((row) => row.key !== line.key && lineBaseKey(row) === baseKey)
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
};

/** Actualiza el estado de cada línea con complemento desde el mapa id → solicitud del servidor. */
export const applyExtraStatuses = (cart, requestsById) => {
  let changed = false;
  const next = (cart || []).map((line) => {
    const current = line.extraRequest;
    const fresh = current ? requestsById?.[current.id] : null;
    if (!fresh) return line;
    if (
      fresh.status === current.status
      && (fresh.rejectionReason || null) === (current.rejectionReason || null)
    ) {
      return line;
    }
    changed = true;
    return {
      ...line,
      extraRequest: {
        ...current,
        status: fresh.status,
        rejectionReason: fresh.rejectionReason || null,
      },
    };
  });
  return changed ? next : cart;
};

/** Motivo por el que no se puede cobrar todavía (null = se puede). */
export const extraCheckoutBlockReason = (cart) => {
  const lines = (cart || []).filter((line) => line.extraRequest);
  const pending = lines.filter((line) => line.extraRequest.status === EXTRA_PENDING).length;
  if (pending > 0) {
    return pending === 1
      ? "Hay 1 complemento pendiente de autorización."
      : `Hay ${pending} complementos pendientes de autorización.`;
  }
  const rejected = lines.filter((line) => line.extraRequest.status === EXTRA_REJECTED).length;
  if (rejected > 0) {
    return "Hay complementos rechazados: quita el complemento de esas líneas para cobrar.";
  }
  const other = lines.filter((line) => line.extraRequest.status !== EXTRA_APPROVED).length;
  if (other > 0) {
    return "Hay complementos que ya no están vigentes: quítalos para cobrar.";
  }
  return null;
};

export const cartHasExtra = (cart) => (cart || []).some((line) => line.extraRequest);

export const pendingExtraCount = (cart) =>
  (cart || []).filter((line) => line.extraRequest?.status === EXTRA_PENDING).length;

export const extraRequestIds = (cart) =>
  (cart || []).filter((line) => line.extraRequest).map((line) => line.extraRequest.id);

// --- Carritos en espera ---

export const serializeHeldCart = ({ cart, selectedPromotionId, notes, comments }) =>
  JSON.stringify({
    v: 1,
    cart: cart || [],
    selectedPromotionId: selectedPromotionId || "",
    notes: notes || "",
    comments: comments || "",
  });

export const parseHeldCart = (cartJson) => {
  try {
    const parsed = JSON.parse(cartJson || "{}");
    return {
      cart: Array.isArray(parsed.cart) ? parsed.cart : [],
      selectedPromotionId: parsed.selectedPromotionId || "",
      notes: parsed.notes || "",
      comments: parsed.comments || "",
    };
  } catch {
    return { cart: [], selectedPromotionId: "", notes: "", comments: "" };
  }
};

export const defaultHeldCartLabel = (cart, now = new Date()) => {
  const items = (cart || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${hh}:${mm} · ${items} ${items === 1 ? "pieza" : "piezas"}`;
};

/** Recalcula availableQty de las líneas con el inventario vigente (key base → stock). */
export const refreshAvailability = (cart, availableByKey) =>
  (cart || []).map((line) => {
    const baseKey = lineBaseKey(line);
    const stock = availableByKey?.[baseKey];
    return { ...line, availableQty: Number(stock || 0) };
  });
