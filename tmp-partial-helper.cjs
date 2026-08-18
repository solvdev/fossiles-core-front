var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils/partialReleaseHelper.js
var partialReleaseHelper_exports = {};
__export(partialReleaseHelper_exports, {
  applyDraftLineIncluded: () => applyDraftLineIncluded,
  applyDraftSizeIncluded: () => applyDraftSizeIncluded,
  buildPartialReleaseLinesPayload: () => buildPartialReleaseLinesPayload,
  buildShipmentProductsFromPartialReleaseLines: () => buildShipmentProductsFromPartialReleaseLines,
  countDraftTotalUnits: () => countDraftTotalUnits,
  countPartialReleaseLineRows: () => countPartialReleaseLineRows,
  countPartialReleaseSavedLines: () => countPartialReleaseSavedLines,
  draftLineHasDraftQuantity: () => draftLineHasDraftQuantity,
  draftLinesForReviewFromRelease: () => draftLinesForReviewFromRelease,
  filterShipmentsByPartialReleaseId: () => filterShipmentsByPartialReleaseId,
  findLinkedPartialRelease: () => findLinkedPartialRelease,
  initDraftLinesFromAvailability: () => initDraftLinesFromAvailability,
  initDraftLinesFromRelease: () => initDraftLinesFromRelease,
  isPartialReleaseShipment: () => isPartialReleaseShipment,
  lineUsesSizeBreakdown: () => lineUsesSizeBreakdown,
  maxDraftLineQuantity: () => maxDraftLineQuantity,
  orderAllowsPartialReleases: () => orderAllowsPartialReleases,
  partialReleaseLineHasQuantity: () => partialReleaseLineHasQuantity,
  releaseLineCount: () => releaseLineCount,
  releaseTotalUnits: () => releaseTotalUnits,
  resolvePartialReleaseShipmentProducts: () => resolvePartialReleaseShipmentProducts,
  resolveShipmentLinesForPrint: () => resolveShipmentLinesForPrint,
  shouldUseSyntheticFullOrderDocument: () => shouldUseSyntheticFullOrderDocument,
  sumDraftLineQuantity: () => sumDraftLineQuantity,
  sumPartialReleaseLineQuantity: () => sumPartialReleaseLineQuantity,
  validateDraftLines: () => validateDraftLines
});
module.exports = __toCommonJS(partialReleaseHelper_exports);

// src/utils/cinchoProductionHelper.js
var CINCHO_ORDER_TYPES = ["CINCHOS", "CINCHOS_FOSSILES", "CINCHOS_MARCAS"];
function isCinchoOrderType(orderType) {
  const t = String(orderType || "").trim().toUpperCase();
  return CINCHO_ORDER_TYPES.includes(t);
}

// src/utils/luisFelipeVendorHelper.js
var stripDiacritics = (value) => String(value || "").normalize("NFD").replace(/\p{M}/gu, "");
var normalizeSellerName = (value) => stripDiacritics(String(value || "").trim()).toUpperCase();
var isLuisFelipeSeller = (sellerName) => normalizeSellerName(sellerName).includes("LUIS FELIPE");

// src/utils/prepareShipmentsOrderHelper.js
function classifyPrepareOrder(order) {
  if (!order) return null;
  const type = String(order.orderType || "").trim().toUpperCase();
  const code = String(order.code || "").trim().toUpperCase();
  if (type === "INTERNA") return "OPI";
  if (type === "CLIENTE_KIOSKO" || code.startsWith("OPCK")) return "OPCK";
  if (isCinchoOrderType(type)) return "OPC";
  if (type === "MARCAS" || type === "OPV" || code.startsWith("OPV-")) return "OPV";
  if (isLuisFelipeSeller(order.sellerName)) return "OPV";
  if (type === "NORMAL" || code.startsWith("OPK-")) return "OPK";
  return null;
}
function normalizeEntreCuerosToken(value) {
  return String(value || "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function isEntreCuerosCustomerOpv(order) {
  if (!order || classifyPrepareOrder(order) !== "OPV") return false;
  const customerToken = normalizeEntreCuerosToken(order.customerName);
  return customerToken.includes("ENTRECUEROS");
}

// src/utils/partialReleaseHelper.js
function orderAllowsPartialReleases(order) {
  if (!order) return false;
  if (isLuisFelipeSeller(order.sellerName)) return true;
  if (isEntreCuerosCustomerOpv(order)) return true;
  if (isCinchoOrderType(order.orderType)) return true;
  const type = String(order.orderType || "").trim().toUpperCase();
  if (type === "CLIENTE_KIOSKO" || type === "NORMAL") return true;
  const code = String(order.code || "").trim().toUpperCase();
  return code.startsWith("OPK-");
}
function sizeMapHasKeys(sizes) {
  return Boolean(sizes && typeof sizes === "object" && Object.keys(sizes).length > 0);
}
function sizeMapHasPositiveQty(sizes) {
  if (!sizeMapHasKeys(sizes)) return false;
  return Object.values(sizes).some((q) => Number(q) > 0);
}
function lineUsesSizeBreakdown(line) {
  return sizeMapHasKeys(line?.sizes) || sizeMapHasKeys(line?.orderedSizes);
}
function mergePayloadLine(existing, incoming) {
  if (incoming.sizes) {
    const sizes = { ...existing.sizes || {} };
    Object.entries(incoming.sizes).forEach(([size, qty]) => {
      const q2 = Number(qty);
      if (q2 > 0) sizes[String(size)] = (sizes[String(size)] || 0) + q2;
    });
    if (!Object.keys(sizes).length) return existing;
    return { productionOrderItemId: existing.productionOrderItemId, sizes };
  }
  const q = Number(existing.quantity || 0) + Number(incoming.quantity || 0);
  if (q <= 0) return existing;
  return { productionOrderItemId: existing.productionOrderItemId, quantity: q };
}
function draftLineHasDraftQuantity(row, orderType) {
  if (!row) return false;
  if (lineUsesSizeBreakdown(row) || sizeMapHasKeys(row.sizes)) {
    return sizeMapHasPositiveQty(row.sizes);
  }
  return Number(row.quantity || 0) > 0;
}
function sumDraftLineQuantity(row, orderType) {
  if (!draftLineHasDraftQuantity(row, orderType)) return 0;
  if (sizeMapHasKeys(row.sizes)) {
    return Object.values(row.sizes).reduce((s, q) => s + Math.max(0, Number(q) || 0), 0);
  }
  return Math.max(0, Number(row.quantity || 0));
}
function buildPartialReleaseLinesPayload(draftLines, orderType) {
  const byItem = /* @__PURE__ */ new Map();
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
  const keys = row.orderedSizes ? Object.keys(row.orderedSizes) : row.sizes ? Object.keys(row.sizes) : [];
  keys.forEach((size) => {
    sizes[size] = 0;
  });
  return sizes;
}
function initDraftLinesFromAvailability(availabilityRows, orderType) {
  return (availabilityRows || []).map((row) => {
    if (sizeMapHasKeys(row.orderedSizes)) {
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
        sizes: zeroCinchoSizes(row)
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
      quantity: 0
    };
  });
}
function partialReleaseLineHasQuantity(line, orderType) {
  if (!line) return false;
  if (sizeMapHasKeys(line.sizes)) {
    return sizeMapHasPositiveQty(line.sizes);
  }
  return Number(line.quantity || 0) > 0;
}
function suggestedQtyForRow(row, sizeKey) {
  if (sizeKey != null) {
    const pending2 = row.pendingSizes?.[sizeKey] != null ? Number(row.pendingSizes[sizeKey]) : 0;
    if (pending2 > 0) return pending2;
    return row.orderedSizes?.[sizeKey] != null ? Number(row.orderedSizes[sizeKey]) : 0;
  }
  const pending = Number(row.pendingTotal) || 0;
  if (pending > 0) return pending;
  return Number(row.orderedTotal) || 0;
}
function applyDraftLineIncluded(row, included, orderType) {
  if (!included) {
    if (lineUsesSizeBreakdown(row)) {
      return { ...row, included: false, sizes: zeroCinchoSizes(row) };
    }
    return { ...row, included: false, quantity: 0 };
  }
  if (lineUsesSizeBreakdown(row)) {
    const sizes = { ...zeroCinchoSizes(row) };
    Object.keys(sizes).forEach((size) => {
      const suggested2 = suggestedQtyForRow(row, size);
      sizes[size] = suggested2 > 0 ? suggested2 : 0;
    });
    const hasAny = Object.values(sizes).some((q) => Number(q) > 0);
    return { ...row, included: hasAny, sizes };
  }
  const suggested = suggestedQtyForRow(row);
  return {
    ...row,
    included: suggested > 0,
    quantity: suggested > 0 ? suggested : 0
  };
}
function applyDraftSizeIncluded(row, sizeKey, included) {
  const suggested = suggestedQtyForRow(row, sizeKey);
  const sizes = { ...row.sizes || {} };
  sizes[sizeKey] = included && suggested > 0 ? suggested : 0;
  const rowIncluded = Object.values(sizes).some((q) => Number(q) > 0);
  return { ...row, sizes, included: rowIncluded };
}
function countDraftTotalUnits(draftLines, orderType) {
  return (draftLines || []).reduce(
    (sum, row) => sum + sumDraftLineQuantity(row, orderType),
    0
  );
}
function maxDraftLineQuantity(row, sizeKey) {
  if (sizeKey != null) {
    const ordered2 = row.orderedSizes?.[sizeKey] != null ? Number(row.orderedSizes[sizeKey]) : null;
    if (ordered2 != null && ordered2 > 0) return ordered2;
    const pending2 = row.pendingSizes?.[sizeKey] != null ? Number(row.pendingSizes[sizeKey]) : null;
    return pending2 != null && pending2 > 0 ? pending2 : void 0;
  }
  const ordered = row.orderedTotal != null ? Number(row.orderedTotal) : null;
  if (ordered != null && ordered > 0) return ordered;
  const pending = row.pendingTotal != null ? Number(row.pendingTotal) : null;
  return pending != null && pending > 0 ? pending : void 0;
}
function validateDraftLines(draftLines, orderType) {
  const rows = draftLines || [];
  const totalUnits = rows.reduce(
    (sum, row) => sum + sumDraftLineQuantity(row, orderType),
    0
  );
  if (totalUnits <= 0) {
    return {
      ok: false,
      message: "Marque al menos un producto e indique cantidad mayor a cero."
    };
  }
  return { ok: true, totalUnits };
}
function countPartialReleaseLineRows(release) {
  return (release?.lines || []).length;
}
function findLinkedPartialRelease(shipment, releases) {
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
function isPartialReleaseShipment(shipment, linkedRelease) {
  if (!linkedRelease?.lines?.length || !shipment?.id) return false;
  if (shipment.partialReleaseId != null && shipment.partialReleaseId !== "" && String(shipment.partialReleaseId) === String(linkedRelease.id)) {
    return true;
  }
  if (linkedRelease.shipmentId != null && String(linkedRelease.shipmentId) === String(shipment.id)) {
    return true;
  }
  return false;
}
function filterShipmentsByPartialReleaseId(docs, focusId, releases) {
  if (!focusId) return docs || [];
  const rows = docs || [];
  return rows.filter((s) => {
    if (String(s.partialReleaseId || "") === String(focusId)) return true;
    const linked = findLinkedPartialRelease(s, releases);
    return linked && String(linked.id) === String(focusId);
  });
}
function shouldUseSyntheticFullOrderDocument({
  realShipmentCount = 0,
  partialReleaseCount = 0,
  focusedPartialReleaseId = ""
} = {}) {
  if (Number(realShipmentCount) > 0) return false;
  if (focusedPartialReleaseId) return false;
  if (Number(partialReleaseCount) > 0) return false;
  return true;
}
function resolvePartialReleaseShipmentProducts(shipment, linkedRelease, orderType) {
  if (!linkedRelease?.lines?.length || !shipment?.id) return null;
  const products = buildShipmentProductsFromPartialReleaseLines(linkedRelease.lines, orderType);
  if (!products.length) return null;
  if (isPartialReleaseShipment(shipment, linkedRelease)) {
    return products;
  }
  return null;
}
function resolveShipmentLinesForPrint(shipment, order, partialList) {
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
function buildShipmentProductsFromPartialReleaseLines(lines, orderType) {
  const products = [];
  (lines || []).forEach((line) => {
    if (!partialReleaseLineHasQuantity(line, orderType)) return;
    if (sizeMapHasKeys(line.sizes)) {
      Object.entries(line.sizes).forEach(([size, qty]) => {
        const q2 = Number(qty);
        if (q2 > 0) {
          products.push({
            productId: line.productId,
            productCode: line.productCode,
            productName: line.productName,
            colorId: line.colorId,
            colorName: line.colorName,
            size: String(size).trim().toUpperCase(),
            quantity: q2
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
        quantity: q
      });
    }
  });
  return products;
}
function countPartialReleaseSavedLines(release, orderType) {
  if (release?.savedLineCount != null && release.savedLineCount !== "") {
    return Number(release.savedLineCount) || 0;
  }
  return (release?.lines || []).filter((line) => partialReleaseLineHasQuantity(line, orderType)).length;
}
function releaseLineCount(release) {
  if (release?.lineCount != null && release.lineCount !== "") {
    return Number(release.lineCount) || 0;
  }
  return countPartialReleaseLineRows(release);
}
function releaseTotalUnits(release, orderType) {
  if (release?.totalUnits != null && release.totalUnits !== "") {
    return Number(release.totalUnits) || 0;
  }
  return (release?.lines || []).reduce(
    (sum, line) => sum + sumPartialReleaseLineQuantity(line, orderType),
    0
  );
}
function sumPartialReleaseLineQuantity(line, orderType) {
  if (!partialReleaseLineHasQuantity(line, orderType)) return 0;
  if (sizeMapHasKeys(line.sizes)) {
    return Object.values(line.sizes).reduce((s, q) => s + Math.max(0, Number(q) || 0), 0);
  }
  return Math.max(0, Number(line.quantity || 0));
}
function initDraftLinesFromRelease(release, orderType, availabilityRows = []) {
  const savedByItemId = /* @__PURE__ */ new Map();
  (release?.lines || []).forEach((line) => {
    if (line?.productionOrderItemId != null) {
      savedByItemId.set(String(line.productionOrderItemId), line);
    }
  });
  const baseRows = (availabilityRows || []).length > 0 ? availabilityRows : release?.lines || [];
  const merged = baseRows.map((base) => {
    const saved = savedByItemId.get(String(base.productionOrderItemId));
    const line = saved || base;
    const useSizes = lineUsesSizeBreakdown(line) || lineUsesSizeBreakdown(base);
    let sizes = useSizes ? { ...line.sizes || {} } : void 0;
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
    const hasQty = saved ? partialReleaseLineHasQuantity({ ...line, sizes, quantity: line.quantity }, orderType) : false;
    return {
      productionOrderItemId: line.productionOrderItemId ?? base.productionOrderItemId,
      productCode: line.productCode ?? base.productCode,
      productName: line.productName ?? base.productName,
      colorName: line.colorName ?? base.colorName,
      orderedTotal: line.orderedTotal ?? base.orderedTotal,
      pendingTotal: line.pendingTotal ?? base.pendingTotal,
      orderedSizes: line.orderedSizes ?? base.orderedSizes,
      pendingSizes: line.pendingSizes ?? base.pendingSizes,
      included: hasQty,
      quantity: useSizes ? void 0 : saved ? line.quantity || 0 : 0,
      sizes
    };
  });
  if (merged.length > 0) {
    return merged;
  }
  return initDraftLinesFromAvailability(availabilityRows, orderType);
}
function draftLinesForReviewFromRelease(release, orderType) {
  return (release?.lines || []).filter((line) => partialReleaseLineHasQuantity(line, orderType)).map((line) => ({
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
    sizes: line.sizes ? { ...line.sizes } : void 0
  }));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  applyDraftLineIncluded,
  applyDraftSizeIncluded,
  buildPartialReleaseLinesPayload,
  buildShipmentProductsFromPartialReleaseLines,
  countDraftTotalUnits,
  countPartialReleaseLineRows,
  countPartialReleaseSavedLines,
  draftLineHasDraftQuantity,
  draftLinesForReviewFromRelease,
  filterShipmentsByPartialReleaseId,
  findLinkedPartialRelease,
  initDraftLinesFromAvailability,
  initDraftLinesFromRelease,
  isPartialReleaseShipment,
  lineUsesSizeBreakdown,
  maxDraftLineQuantity,
  orderAllowsPartialReleases,
  partialReleaseLineHasQuantity,
  releaseLineCount,
  releaseTotalUnits,
  resolvePartialReleaseShipmentProducts,
  resolveShipmentLinesForPrint,
  shouldUseSyntheticFullOrderDocument,
  sumDraftLineQuantity,
  sumPartialReleaseLineQuantity,
  validateDraftLines
});
