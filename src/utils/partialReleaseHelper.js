import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import { isLuisFelipeSeller } from "utils/luisFelipeVendorHelper";
import { isEntreCuerosCustomer, isEntreCuerosCustomerOpv } from "utils/prepareShipmentsOrderHelper";

/** Kiosko POS Entre Cueros (`locations.id`). */
export const ENTRECUEROS_KIOSK_LOCATION_ID = 42;

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

/** Agrupa por producto + color + talla (Entre Cueros / kiosko 42). */
export function orderUsesVariantGroupedPartialEditor(order, locationId) {
  if (isEntreCuerosCustomer(order) || isEntreCuerosCustomerOpv(order)) return true;
  if (Number(locationId) === ENTRECUEROS_KIOSK_LOCATION_ID) return true;
  if (Number(order?.locationId) === ENTRECUEROS_KIOSK_LOCATION_ID) return true;
  return false;
}

function normalizeVariantSize(size) {
  return String(size || "").trim().toUpperCase();
}

export function variantGroupKey(row, sizeKey = "") {
  const productId = row?.productId != null && row.productId !== "" ? Number(row.productId) : 0;
  const colorId =
    row?.colorId == null || row.colorId === "" ? "nc" : Number(row.colorId);
  return `${productId}:${colorId}:${normalizeVariantSize(sizeKey)}`;
}

function catalogFields(row) {
  return {
    productionOrderItemId: row.productionOrderItemId,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    colorId: row.colorId,
    colorName: row.colorName,
  };
}

function lookupSizeQty(map, sizeKey) {
  if (!map || typeof map !== "object" || sizeKey == null || sizeKey === "") return null;
  if (map[sizeKey] != null) return Number(map[sizeKey]) || 0;
  const match = Object.keys(map).find((key) => normalizeVariantSize(key) === normalizeVariantSize(sizeKey));
  return match != null ? Number(map[match]) || 0 : null;
}

function memberPending(row, sizeKey) {
  if (sizeKey) {
    const pending = lookupSizeQty(row.pendingSizes, sizeKey);
    if (pending != null) return Math.max(0, pending);
    const ordered = lookupSizeQty(row.orderedSizes, sizeKey);
    if (ordered != null) return Math.max(0, ordered);
    return 0;
  }
  const pending = Number(row.pendingTotal);
  if (Number.isFinite(pending) && pending >= 0) return pending;
  return Math.max(0, Number(row.orderedTotal) || 0);
}

function memberOrdered(row, sizeKey) {
  if (sizeKey) return Math.max(0, lookupSizeQty(row.orderedSizes, sizeKey) || 0);
  return Math.max(0, Number(row.orderedTotal) || 0);
}

function memberSend(row, sizeKey) {
  if (sizeKey) return Math.max(0, lookupSizeQty(row.sizes, sizeKey) || 0);
  return Math.max(0, Number(row.quantity) || 0);
}

function explodeDraftLinesToVariants(draftLines) {
  const variants = [];
  (draftLines || []).forEach((row) => {
    if (!row) return;
    if (lineUsesSizeBreakdown(row)) {
      const sizeKeys = Object.keys(row.orderedSizes || row.sizes || {});
      sizeKeys.forEach((size) => {
        const sizeKey = normalizeVariantSize(size);
        if (!sizeKey) return;
        variants.push({
          row,
          sizeKey,
          ordered: memberOrdered(row, size),
          pending: memberPending(row, size),
          send: memberSend(row, size),
        });
      });
      return;
    }
    variants.push({
      row,
      sizeKey: "",
      ordered: memberOrdered(row, ""),
      pending: memberPending(row, ""),
      send: memberSend(row, ""),
    });
  });
  return variants;
}

/** Filas agrupadas por producto + color + talla para el editor Entre Cueros. */
export function groupDraftLinesByVariant(draftLines) {
  const groups = [];
  const index = new Map();
  explodeDraftLinesToVariants(draftLines).forEach((variant) => {
    const key = variantGroupKey(variant.row, variant.sizeKey);
    let group = index.get(key);
    if (!group) {
      group = {
        key,
        productId: variant.row.productId,
        productCode: variant.row.productCode,
        productName: variant.row.productName,
        colorId: variant.row.colorId,
        colorName: variant.row.colorName,
        size: variant.sizeKey,
        orderedTotal: 0,
        pendingTotal: 0,
        sendQty: 0,
        members: [],
      };
      index.set(key, group);
      groups.push(group);
    }
    group.orderedTotal += variant.ordered;
    group.pendingTotal += variant.pending;
    group.sendQty += variant.send;
    group.members.push(variant);
  });
  return groups.sort((a, b) => {
    const product = String(a.productCode || "").localeCompare(String(b.productCode || ""), "es");
    if (product !== 0) return product;
    const color = String(a.colorName || "").localeCompare(String(b.colorName || ""), "es");
    if (color !== 0) return color;
    return String(a.size || "").localeCompare(String(b.size || ""), "es", { numeric: true });
  });
}

export function remainingAfterGroupSend(group) {
  return Math.max(0, Number(group?.pendingTotal || 0) - Number(group?.sendQty || 0));
}

/** Reparte «enviar» entre las líneas del grupo (FIFO por ítem de OP), sin pasar lo pendiente. */
export function applyGroupSendQty(draftLines, groupKey, sendQty) {
  const group = groupDraftLinesByVariant(draftLines).find((row) => row.key === groupKey);
  if (!group) return draftLines || [];
  const maxSend = Math.max(0, Number(group.pendingTotal) || 0);
  let remaining = Math.max(0, Math.min(maxSend, Math.floor(Number(sendQty) || 0)));
  const allocations = new Map();
  group.members
    .slice()
    .sort(
      (a, b) =>
        Number(a.row.productionOrderItemId) - Number(b.row.productionOrderItemId)
    )
    .forEach((member) => {
      const cap = Math.max(0, member.pending);
      const take = Math.min(cap, remaining);
      remaining -= take;
      allocations.set(`${member.row.productionOrderItemId}:${member.sizeKey}`, take);
    });

  return (draftLines || []).map((row) => {
    const isMember = group.members.some(
      (member) => member.row.productionOrderItemId === row.productionOrderItemId
    );
    if (!isMember) return row;
    if (lineUsesSizeBreakdown(row)) {
      const sizes = { ...zeroCinchoSizes(row), ...(row.sizes || {}) };
      Object.keys({ ...(row.orderedSizes || {}), ...sizes }).forEach((size) => {
        const sizeKey = normalizeVariantSize(size);
        if (variantGroupKey(row, sizeKey) !== groupKey) return;
        sizes[size] = allocations.get(`${row.productionOrderItemId}:${sizeKey}`) ?? 0;
      });
      const included = Object.values(sizes).some((qty) => Number(qty) > 0);
      return { ...row, sizes, included };
    }
    const take = allocations.get(`${row.productionOrderItemId}:`) ?? 0;
    return { ...row, quantity: take, included: take > 0 };
  });
}

function sizeMapHasKeys(sizes) {
  return Boolean(sizes && typeof sizes === "object" && Object.keys(sizes).length > 0);
}

function sizeMapHasPositiveQty(sizes) {
  if (!sizeMapHasKeys(sizes)) return false;
  return Object.values(sizes).some((q) => Number(q) > 0);
}

/** La línea se captura por talla si hay desglose (OPC u OPV/OPK/OPCK con sizes). */
export function lineUsesSizeBreakdown(line) {
  return sizeMapHasKeys(line?.sizes) || sizeMapHasKeys(line?.orderedSizes);
}

function mergePayloadLine(existing, incoming) {
  if (incoming.sizes) {
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

/** Cantidad capturada en el borrador (ignora el flag «included», solo mira tallas/cantidad). */
export function draftLineHasDraftQuantity(row, orderType) {
  if (!row) return false;
  if (lineUsesSizeBreakdown(row) || sizeMapHasKeys(row.sizes)) {
    return sizeMapHasPositiveQty(row.sizes);
  }
  return Number(row.quantity || 0) > 0;
}

export function sumDraftLineQuantity(row, orderType) {
  if (!draftLineHasDraftQuantity(row, orderType)) return 0;
  if (sizeMapHasKeys(row.sizes)) {
    return Object.values(row.sizes).reduce((s, q) => s + Math.max(0, Number(q) || 0), 0);
  }
  return Math.max(0, Number(row.quantity || 0));
}

export function buildPartialReleaseLinesPayload(draftLines, orderType) {
  const byItem = new Map();
  (draftLines || []).forEach((row) => {
    if (!draftLineHasDraftQuantity(row, orderType)) return;
    const itemId = row.productionOrderItemId;
    if (!itemId) return;
    let line = null;
    if (lineUsesSizeBreakdown(row) || sizeMapHasKeys(row.sizes)) {
      const sizes = {};
      Object.entries(row.sizes || {}).forEach(([size, qty]) => {
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
    byItem.set(String(itemId), prev ? mergePayloadLine(prev, line) : line);
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
  return (availabilityRows || []).map((row) => {
    if (sizeMapHasKeys(row.orderedSizes)) {
      return {
        ...catalogFields(row),
        orderedTotal: row.orderedTotal,
        pendingTotal: row.pendingTotal,
        orderedSizes: row.orderedSizes,
        pendingSizes: row.pendingSizes,
        included: false,
        sizes: zeroCinchoSizes(row),
      };
    }
    return {
      ...catalogFields(row),
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
  if (sizeMapHasKeys(line.sizes)) {
    return sizeMapHasPositiveQty(line.sizes);
  }
  return Number(line.quantity || 0) > 0;
}

function suggestedQtyForRow(row, sizeKey) {
  if (sizeKey != null) {
    const pending =
      row.pendingSizes?.[sizeKey] != null ? Number(row.pendingSizes[sizeKey]) : 0;
    if (pending > 0) return pending;
    return row.orderedSizes?.[sizeKey] != null ? Number(row.orderedSizes[sizeKey]) : 0;
  }
  const pending = Number(row.pendingTotal) || 0;
  if (pending > 0) return pending;
  return Number(row.orderedTotal) || 0;
}

export function setDraftLinesIncluded(draftLines, included, orderType) {
  return (draftLines || []).map((row) => applyDraftLineIncluded(row, included, orderType));
}

export function applyDraftLineIncluded(row, included, orderType) {
  if (!included) {
    if (lineUsesSizeBreakdown(row)) {
      return { ...row, included: false, sizes: zeroCinchoSizes(row) };
    }
    return { ...row, included: false, quantity: 0 };
  }
  if (lineUsesSizeBreakdown(row)) {
    const sizes = { ...zeroCinchoSizes(row) };
    Object.keys(sizes).forEach((size) => {
      const suggested = suggestedQtyForRow(row, size);
      sizes[size] = suggested > 0 ? suggested : 0;
    });
    const hasAny = Object.values(sizes).some((q) => Number(q) > 0);
    return { ...row, included: hasAny, sizes };
  }
  const suggested = suggestedQtyForRow(row);
  return {
    ...row,
    included: suggested > 0,
    quantity: suggested > 0 ? suggested : 0,
  };
}

export function applyDraftSizeIncluded(row, sizeKey, included) {
  const suggested = suggestedQtyForRow(row, sizeKey);
  const sizes = { ...(row.sizes || {}) };
  sizes[sizeKey] = included && suggested > 0 ? suggested : 0;
  const rowIncluded = Object.values(sizes).some((q) => Number(q) > 0);
  return { ...row, sizes, included: rowIncluded };
}

export function countDraftTotalUnits(draftLines, orderType) {
  return (draftLines || []).reduce(
    (sum, row) => sum + sumDraftLineQuantity(row, orderType),
    0
  );
}

export function maxDraftLineQuantity(row, sizeKey) {
  if (sizeKey != null) {
    const ordered =
      row.orderedSizes?.[sizeKey] != null ? Number(row.orderedSizes[sizeKey]) : null;
    if (ordered != null && ordered > 0) return ordered;
    const pending =
      row.pendingSizes?.[sizeKey] != null ? Number(row.pendingSizes[sizeKey]) : null;
    return pending != null && pending > 0 ? pending : undefined;
  }
  const ordered = row.orderedTotal != null ? Number(row.orderedTotal) : null;
  if (ordered != null && ordered > 0) return ordered;
  const pending = row.pendingTotal != null ? Number(row.pendingTotal) : null;
  return pending != null && pending > 0 ? pending : undefined;
}

export function validateDraftLines(draftLines, orderType) {
  const rows = draftLines || [];
  const totalUnits = rows.reduce(
    (sum, row) => sum + sumDraftLineQuantity(row, orderType),
    0
  );

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

/** Busca la liberación parcial ligada a un envío (por shipmentId o partialReleaseId). */
export function findLinkedPartialRelease(shipment, releases) {
  const rows = releases || [];
  if (!shipment?.id) return null;
  const byShipment = rows.find(
    (r) => r.shipmentId != null && String(r.shipmentId) === String(shipment.id)
  );
  if (byShipment) return byShipment;
  if (shipment.partialReleaseId != null && shipment.partialReleaseId !== "") {
    return rows.find((r) => String(r.id) === String(shipment.partialReleaseId)) || null;
  }
  return null;
}

/** Envío ligado a una liberación parcial (por id o por shipmentId en el parcial). */
export function isPartialReleaseShipment(shipment, linkedRelease) {
  if (!linkedRelease?.lines?.length || !shipment?.id) return false;
  if (
    shipment.partialReleaseId != null &&
    shipment.partialReleaseId !== "" &&
    String(shipment.partialReleaseId) === String(linkedRelease.id)
  ) {
    return true;
  }
  if (linkedRelease.shipmentId != null && String(linkedRelease.shipmentId) === String(shipment.id)) {
    return true;
  }
  return false;
}

/** Envíos visibles al enfocar un parcial: nunca cae al documento completo de la OP. */
export function filterShipmentsByPartialReleaseId(docs, focusId, releases) {
  if (!focusId) return docs || [];
  const rows = docs || [];
  return rows.filter((s) => {
    if (String(s.partialReleaseId || "") === String(focusId)) return true;
    const linked = findLinkedPartialRelease(s, releases);
    return linked && String(linked.id) === String(focusId);
  });
}

/** Documento sintético de la OP completa: solo si no hay envíos ni parciales. */
export function shouldUseSyntheticFullOrderDocument({
  realShipmentCount = 0,
  partialReleaseCount = 0,
  focusedPartialReleaseId = "",
} = {}) {
  if (Number(realShipmentCount) > 0) return false;
  if (focusedPartialReleaseId) return false;
  if (Number(partialReleaseCount) > 0) return false;
  return true;
}

/** Líneas del parcial para listado/impresión; null si no aplica reemplazo. */
export function resolvePartialReleaseShipmentProducts(shipment, linkedRelease, orderType) {
  if (!linkedRelease?.lines?.length || !shipment?.id) return null;
  const products = buildShipmentProductsFromPartialReleaseLines(linkedRelease.lines, orderType);
  if (!products.length) return null;
  if (isPartialReleaseShipment(shipment, linkedRelease)) {
    return products;
  }
  return null;
}

/**
 * Productos a mostrar en impresión / exportación (parcial si aplica, no la OP completa).
 */
export function resolveShipmentLinesForPrint(shipment, order, partialList) {
  if (!shipment) return [];
  if (Array.isArray(shipment._printProducts) && shipment._printProducts.length > 0) {
    return shipment._printProducts;
  }
  const releases = partialList?.releases || partialList || [];
  const linked = findLinkedPartialRelease(shipment, releases);
  const partialProducts = resolvePartialReleaseShipmentProducts(shipment, linked, order?.orderType);
  if (partialProducts?.length) {
    return partialProducts;
  }
  return shipment.products || [];
}

/** Productos de impresión / envío a partir de líneas guardadas del parcial (no la OP completa). */
export function buildShipmentProductsFromPartialReleaseLines(lines, orderType) {
  const products = [];
  (lines || []).forEach((line) => {
    if (!partialReleaseLineHasQuantity(line, orderType)) return;
    if (sizeMapHasKeys(line.sizes)) {
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
  if (sizeMapHasKeys(line.sizes)) {
    return Object.values(line.sizes).reduce((s, q) => s + Math.max(0, Number(q) || 0), 0);
  }
  return Math.max(0, Number(line.quantity || 0));
}

export function initDraftLinesFromRelease(release, orderType, availabilityRows = []) {
  const savedByItemId = new Map();
  (release?.lines || []).forEach((line) => {
    if (line?.productionOrderItemId != null) {
      savedByItemId.set(String(line.productionOrderItemId), line);
    }
  });

  const baseRows =
    (availabilityRows || []).length > 0
      ? availabilityRows
      : release?.lines || [];

  const merged = baseRows.map((base) => {
    const saved = savedByItemId.get(String(base.productionOrderItemId));
    const line = saved || base;
    const useSizes = lineUsesSizeBreakdown(line) || lineUsesSizeBreakdown(base);
    let sizes = useSizes ? { ...(line.sizes || {}) } : undefined;
    if (useSizes && (!sizes || !Object.keys(sizes).length) && (line.orderedSizes || base.orderedSizes)) {
      sizes = zeroCinchoSizes(line.orderedSizes ? line : base);
    }
    if (useSizes && Number(line.quantity || 0) > 0 && sizes && Object.keys(sizes).length) {
      const hasSizeQty = Object.values(sizes).some((q) => Number(q) > 0);
      if (!hasSizeQty && saved) {
        const firstKey = Object.keys(sizes)[0];
        if (firstKey) sizes[firstKey] = Number(line.quantity);
      }
    }
    if (useSizes && !saved) {
      sizes = zeroCinchoSizes(base.orderedSizes ? base : line);
    }
    const hasQty = saved
      ? partialReleaseLineHasQuantity({ ...line, sizes, quantity: line.quantity }, orderType)
      : false;
    return {
      ...catalogFields(base),
      ...catalogFields(line),
      productionOrderItemId: line.productionOrderItemId ?? base.productionOrderItemId,
      productId: line.productId ?? base.productId,
      colorId: line.colorId ?? base.colorId,
      orderedTotal: line.orderedTotal ?? base.orderedTotal,
      pendingTotal: line.pendingTotal ?? base.pendingTotal,
      orderedSizes: line.orderedSizes ?? base.orderedSizes,
      pendingSizes: line.pendingSizes ?? base.pendingSizes,
      included: hasQty,
      quantity: useSizes ? undefined : saved ? line.quantity || 0 : 0,
      sizes,
    };
  });

  if (merged.length > 0) {
    return merged;
  }
  return initDraftLinesFromAvailability(availabilityRows, orderType);
}

/** Líneas con cantidad > 0 para vista de solo lectura (generar envío). */
export function draftLinesForReviewFromRelease(release, orderType) {
  return (release?.lines || [])
    .filter((line) => partialReleaseLineHasQuantity(line, orderType))
    .map((line) => ({
      ...catalogFields(line),
      orderedTotal: line.orderedTotal,
      pendingTotal: line.pendingTotal,
      orderedSizes: line.orderedSizes,
      pendingSizes: line.pendingSizes,
      included: true,
      quantity: line.quantity,
      sizes: line.sizes ? { ...line.sizes } : undefined,
    }));
}
