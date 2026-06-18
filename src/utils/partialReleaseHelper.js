import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import { isLuisFelipeSeller } from "utils/luisFelipeVendorHelper";
import { isEntreCuerosCustomerOpv } from "utils/prepareShipmentsOrderHelper";

/** OPV (Luis Felipe o Entre Cueros), OPC (cinchos), OPCK u OPK (kiosko). */
export function orderAllowsPartialReleases(order) {
  if (!order) return false;
  if (isLuisFelipeSeller(order.sellerName)) return true;
  if (isEntreCuerosCustomerOpv(order)) return true;
  if (isCinchoOrderType(order.orderType)) return true;
  const type = String(order.orderType || "").trim().toUpperCase();
  if (type === "CLIENTE_KIOSKO" || type === "NORMAL") return true;
  const code = String(order.code || "").trim().toUpperCase();
  return code.startsWith("OPK-");
}

function mergePayloadLine(existing, incoming, cincho) {
  if (cincho && incoming.sizes) {
    const sizes = { ...(existing.sizes || {}) };
    Object.entries(incoming.sizes).forEach(([size, qty]) => {
      const q = Number(qty);
      if (q > 0) sizes[String(size)] = (sizes[String(size)] || 0) + q;
    });
    if (!Object.keys(sizes).length) return existing;
    return { productionOrderItemId: existing.productionOrderItemId, sizes };
  }
  const q = Number(existing.quantity || 0) + Number(incoming.quantity || 0);
  if (q <= 0) return existing;
  return { productionOrderItemId: existing.productionOrderItemId, quantity: q };
}

export function buildPartialReleaseLinesPayload(draftLines, orderType) {
  const cincho = isCinchoOrderType(orderType);
  const byItem = new Map();
  (draftLines || []).forEach((row) => {
    if (row.included === false) return;
    const itemId = row.productionOrderItemId;
    if (!itemId) return;
    let line = null;
    if (cincho && row.sizes && typeof row.sizes === "object") {
      const sizes = {};
      Object.entries(row.sizes).forEach(([size, qty]) => {
        const q = Number(qty);
        if (q > 0) sizes[String(size)] = q;
      });
      if (!Object.keys(sizes).length) return;
      line = { productionOrderItemId: itemId, sizes };
    } else {
      const q = Number(row.quantity || 0);
      if (q <= 0) return;
      line = { productionOrderItemId: itemId, quantity: q };
    }
    const prev = byItem.get(String(itemId));
    byItem.set(String(itemId), prev ? mergePayloadLine(prev, line, cincho) : line);
  });
  return Array.from(byItem.values());
}

function zeroCinchoSizes(row) {
  const sizes = {};
  const keys = row.orderedSizes
    ? Object.keys(row.orderedSizes)
    : row.sizes
      ? Object.keys(row.sizes)
      : [];
  keys.forEach((size) => {
    sizes[size] = 0;
  });
  return sizes;
}

export function initDraftLinesFromAvailability(availabilityRows, orderType) {
  const cincho = isCinchoOrderType(orderType);
  return (availabilityRows || []).map((row) => {
    if (cincho && row.orderedSizes) {
      return {
        productionOrderItemId: row.productionOrderItemId,
        productCode: row.productCode,
        productName: row.productName,
        colorName: row.colorName,
        orderedTotal: row.orderedTotal,
        pendingTotal: row.pendingTotal,
        orderedSizes: row.orderedSizes,
        pendingSizes: row.pendingSizes,
        included: false,
        sizes: zeroCinchoSizes(row),
      };
    }
    return {
      productionOrderItemId: row.productionOrderItemId,
      productCode: row.productCode,
      productName: row.productName,
      colorName: row.colorName,
      orderedTotal: row.orderedTotal,
      pendingTotal: row.pendingTotal,
      included: false,
      quantity: 0,
    };
  });
}

/** Misma lógica que el backend: tallas con cantidad > 0, o quantity > 0. */
export function partialReleaseLineHasQuantity(line, orderType) {
  if (!line) return false;
  const cincho = isCinchoOrderType(orderType);
  if (cincho && line.sizes && typeof line.sizes === "object") {
    const sizeKeys = Object.keys(line.sizes);
    if (sizeKeys.length > 0) {
      if (sizeKeys.some((k) => Number(line.sizes[k]) > 0)) return true;
    }
  }
  return Number(line.quantity || 0) > 0;
}

export function applyDraftLineIncluded(row, included, orderType) {
  const cincho = isCinchoOrderType(orderType);
  if (!included) {
    if (cincho && (row.orderedSizes || row.sizes)) {
      return { ...row, included: false, sizes: zeroCinchoSizes(row) };
    }
    return { ...row, included: false, quantity: 0 };
  }
  if (cincho && (row.orderedSizes || row.sizes)) {
    const sizes = { ...zeroCinchoSizes(row) };
    Object.keys(sizes).forEach((size) => {
      const pending =
        row.pendingSizes?.[size] != null ? Number(row.pendingSizes[size]) : 0;
      sizes[size] = pending > 0 ? pending : 0;
    });
    const hasAny = Object.values(sizes).some((q) => Number(q) > 0);
    return { ...row, included: hasAny, sizes };
  }
  const pending = Number(row.pendingTotal) || 0;
  return {
    ...row,
    included: pending > 0,
    quantity: pending > 0 ? pending : 0,
  };
}

export function applyDraftSizeIncluded(row, sizeKey, included) {
  const pending =
    row.pendingSizes?.[sizeKey] != null ? Number(row.pendingSizes[sizeKey]) : 0;
  const sizes = { ...(row.sizes || {}) };
  sizes[sizeKey] = included && pending > 0 ? pending : 0;
  const rowIncluded = Object.values(sizes).some((q) => Number(q) > 0);
  return { ...row, sizes, included: rowIncluded };
}

export function countDraftTotalUnits(draftLines, orderType) {
  return (draftLines || []).reduce(
    (sum, row) => sum + sumPartialReleaseLineQuantity(row, orderType),
    0
  );
}

export function validateDraftLines(draftLines, orderType) {
  const cincho = isCinchoOrderType(orderType);
  const rows = draftLines || [];
  let totalUnits = 0;

  for (const row of rows) {
    if (row.included === false) continue;
    if (cincho && row.sizes && typeof row.sizes === "object") {
      for (const [size, qty] of Object.entries(row.sizes)) {
        const q = Number(qty) || 0;
        if (q <= 0) continue;
        const pending =
          row.pendingSizes?.[size] != null ? Number(row.pendingSizes[size]) : null;
        if (pending != null && q > pending) {
          return {
            ok: false,
            message: `${row.productCode || "Producto"} talla ${size}: máximo ${pending} pendiente.`,
          };
        }
        totalUnits += q;
      }
      continue;
    }
    const q = Number(row.quantity || 0);
    if (q <= 0) continue;
    const pending = row.pendingTotal != null ? Number(row.pendingTotal) : null;
    if (pending != null && q > pending) {
      return {
        ok: false,
        message: `${row.productCode || "Producto"}: máximo ${pending} unidades pendientes.`,
      };
    }
    totalUnits += q;
  }

  if (totalUnits <= 0) {
    return {
      ok: false,
      message: "Marque al menos un producto e indique cantidad mayor a cero.",
    };
  }
  return { ok: true, totalUnits };
}

export function countPartialReleaseLineRows(release) {
  return (release?.lines || []).length;
}

/** Productos de impresión / envío a partir de líneas guardadas del parcial (no la OP completa). */
export function buildShipmentProductsFromPartialReleaseLines(lines, orderType) {
  const cincho = isCinchoOrderType(orderType);
  const products = [];
  (lines || []).forEach((line) => {
    if (!partialReleaseLineHasQuantity(line, orderType)) return;
    if (cincho && line.sizes && typeof line.sizes === "object") {
      Object.entries(line.sizes).forEach(([size, qty]) => {
        const q = Number(qty);
        if (q > 0) {
          products.push({
            productId: line.productId,
            productCode: line.productCode,
            productName: line.productName,
            colorId: line.colorId,
            colorName: line.colorName,
            size: String(size).trim().toUpperCase(),
            quantity: q,
          });
        }
      });
      return;
    }
    const q = Number(line.quantity || 0);
    if (q > 0) {
      products.push({
        productId: line.productId,
        productCode: line.productCode,
        productName: line.productName,
        colorId: line.colorId,
        colorName: line.colorName,
        size: "",
        quantity: q,
      });
    }
  });
  return products;
}

export function countPartialReleaseSavedLines(release, orderType) {
  if (release?.savedLineCount != null && release.savedLineCount !== "") {
    return Number(release.savedLineCount) || 0;
  }
  return (release?.lines || []).filter((line) => partialReleaseLineHasQuantity(line, orderType)).length;
}

export function releaseLineCount(release) {
  if (release?.lineCount != null && release.lineCount !== "") {
    return Number(release.lineCount) || 0;
  }
  return countPartialReleaseLineRows(release);
}

export function releaseTotalUnits(release, orderType) {
  if (release?.totalUnits != null && release.totalUnits !== "") {
    return Number(release.totalUnits) || 0;
  }
  return (release?.lines || []).reduce(
    (sum, line) => sum + sumPartialReleaseLineQuantity(line, orderType),
    0
  );
}

export function sumPartialReleaseLineQuantity(line, orderType) {
  if (!partialReleaseLineHasQuantity(line, orderType)) return 0;
  const cincho = isCinchoOrderType(orderType);
  if (cincho && line.sizes && typeof line.sizes === "object") {
    return Object.values(line.sizes).reduce((s, q) => s + Math.max(0, Number(q) || 0), 0);
  }
  return Math.max(0, Number(line.quantity || 0));
}

export function initDraftLinesFromRelease(release, orderType, availabilityRows = []) {
  const cincho = isCinchoOrderType(orderType);
  const saved = (release?.lines || []).map((line) => {
    let sizes = cincho ? { ...(line.sizes || {}) } : undefined;
    if (cincho && (!sizes || !Object.keys(sizes).length) && line.orderedSizes) {
      sizes = zeroCinchoSizes(line);
    }
    if (cincho && Number(line.quantity || 0) > 0 && sizes && Object.keys(sizes).length) {
      const hasSizeQty = Object.values(sizes).some((q) => Number(q) > 0);
      if (!hasSizeQty) {
        const firstKey = Object.keys(sizes)[0];
        if (firstKey) sizes[firstKey] = Number(line.quantity);
      }
    }
    const hasQty = partialReleaseLineHasQuantity(
      { ...line, sizes, quantity: line.quantity },
      orderType
    );
    return {
      productionOrderItemId: line.productionOrderItemId,
      productCode: line.productCode,
      productName: line.productName,
      colorName: line.colorName,
      orderedTotal: line.orderedTotal,
      pendingTotal: line.pendingTotal,
      orderedSizes: line.orderedSizes,
      pendingSizes: line.pendingSizes,
      included: hasQty,
      quantity: cincho ? undefined : line.quantity || 0,
      sizes,
    };
  });
  if (saved.length > 0) {
    return saved;
  }
  return initDraftLinesFromAvailability(availabilityRows, orderType);
}

/** Líneas con cantidad > 0 para vista de solo lectura (generar envío). */
export function draftLinesForReviewFromRelease(release, orderType) {
  return (release?.lines || [])
    .filter((line) => partialReleaseLineHasQuantity(line, orderType))
    .map((line) => ({
      productionOrderItemId: line.productionOrderItemId,
      productCode: line.productCode,
      productName: line.productName,
      colorName: line.colorName,
      orderedTotal: line.orderedTotal,
      pendingTotal: line.pendingTotal,
      orderedSizes: line.orderedSizes,
      pendingSizes: line.pendingSizes,
      included: true,
      quantity: line.quantity,
      sizes: line.sizes ? { ...line.sizes } : undefined,
    }));
}
