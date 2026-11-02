import { resolveDefaultOpvUnitPrice } from "./prepareShipmentsOrderHelper";

export function productionOrderLineIdForUpdate(item) {
  return item != null && item.id != null ? item.id : null;
}

/** Copy of a form line for insert: never reuse the original backend id. */
export function duplicateProductionOrderLine(item) {
  return { ...(item || {}), id: null };
}

function resolveFormItemUnitPrice(item, { showItemUnitPrice, productCatalogById, isVendorOpv }) {
  if (!showItemUnitPrice) return undefined;
  const n = Number(item.unitPrice);
  if (Number.isFinite(n) && n > 0) return n;
  const fallback = resolveDefaultOpvUnitPrice(item, productCatalogById, isVendorOpv);
  return fallback > 0 ? fallback : undefined;
}

export function buildProductionOrderFormItemsPayload(
  items,
  {
    includeId = false,
    orderType,
    showItemUnitPrice = false,
    productCatalogById = {},
    isVendorOpv = false,
  } = {}
) {
  return (items || []).map((item) => {
    const payload = {
      productId: item.productId,
      colorId: item.colorId,
      brandName: orderType === "MARCAS" ? item.brandName || null : null,
      quantity: item.quantity,
      sizes: item.sizes,
      observations: item.observations,
      unitPrice: resolveFormItemUnitPrice(item, {
        showItemUnitPrice,
        productCatalogById,
        isVendorOpv,
      }),
    };
    if (includeId) {
      payload.id = productionOrderLineIdForUpdate(item);
    }
    return payload;
  });
}
