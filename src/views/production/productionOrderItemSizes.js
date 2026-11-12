import {
  isCinchoInventoryProduct,
  isCinchoInventoryProductByCodeAndName,
  isCinchoOrderType,
} from "utils/cinchoProductionHelper";

/**
 * Belt (cincho) size helpers for ProductionOrderForm.
 * Payload field is `sizes` (Map of size -> qty), e.g. { "32": 2, "34": 1 }.
 * Not `sizesData`. Keys are trimmed and upper-cased; zero quantities are omitted.
 */

/** Size -> qty, omitting zeros. Keys are trimmed and upper-cased. */
export function buildPositiveSizes(sizes = {}) {
  if (!sizes || typeof sizes !== "object" || Array.isArray(sizes)) {
    return {};
  }
  return Object.entries(sizes).reduce((acc, [size, qty]) => {
    const key = String(size).trim().toUpperCase();
    const quantity = parseInt(qty, 10);
    if (key && quantity > 0) {
      acc[key] = quantity;
    }
    return acc;
  }, {});
}

export function sumPositiveSizes(sizes = {}) {
  return Object.values(buildPositiveSizes(sizes)).reduce((sum, qty) => sum + qty, 0);
}

export function sizesPayload(sizes) {
  const positive = buildPositiveSizes(sizes);
  return Object.keys(positive).length > 0 ? positive : null;
}

/** Belt item: OPC order, or cincho product (FOSS code / name with "cincho"). */
export function isBeltProductionItem(item, catalogById, orderType) {
  if (isCinchoOrderType(orderType)) return true;
  const product = item?.productId != null ? catalogById?.[Number(item.productId)] : null;
  if (isCinchoInventoryProduct(product)) return true;
  return isCinchoInventoryProductByCodeAndName(item?.productCode, item?.productName);
}

export function productionItemProductLabel(item, catalogById) {
  const product = item?.productId != null ? catalogById?.[Number(item.productId)] : null;
  const code = String(product?.code || item?.productCode || "").trim();
  const name = String(product?.name || item?.productName || "").trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || "el producto";
}

/**
 * When a belt item has sizes, their sum must equal quantity.
 * Quantity null/empty means it is auto-derived from sizes (OPC behavior).
 */
export function cinchoItemSizesError(item, catalogById, orderType) {
  if (!isBeltProductionItem(item, catalogById, orderType)) return null;
  const sizes = buildPositiveSizes(item?.sizes);
  if (Object.keys(sizes).length === 0) return null;
  if (item?.quantity == null || item.quantity === "") return null;
  const qty = parseInt(item.quantity, 10);
  const sum = sumPositiveSizes(sizes);
  if (!Number.isFinite(qty) || sum === qty) return null;
  const label = productionItemProductLabel(item, catalogById);
  return `Las tallas de "${label}" deben sumar la cantidad del ítem (${qty}), pero suman ${sum}.`;
}

export function firstCinchoSizesError(items, catalogById, orderType) {
  for (const item of items || []) {
    const err = cinchoItemSizesError(item, catalogById, orderType);
    if (err) return err;
  }
  return null;
}
