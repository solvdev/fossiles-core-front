import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import { isLuisFelipeSeller, isLuisFelipeVendorFlow } from "utils/luisFelipeVendorHelper";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";

export const PRINT_PAPER_WIDTH_MM = 216;
export const PRINT_PAPER_HEIGHT_MM = 279.4;
export const PRINT_FONT_FAMILY = "'Times New Roman', Times, serif";

export function classifyPrepareOrder(order) {
  if (!order) return null;
  const type = String(order.orderType || "").trim().toUpperCase();
  const code = String(order.code || "").trim().toUpperCase();
  if (type === "INTERNA") return "OPI";
  if (type === "CLIENTE_KIOSKO" || code.startsWith("OPCK")) return "OPCK";
  if (isCinchoOrderType(type)) return "OPC";
  // NORMAL + Luis Felipe recibe correlativo OPV- en backend; no es OPK/kiosko.
  if (type === "MARCAS" || type === "OPV" || code.startsWith("OPV-")) return "OPV";
  if (isLuisFelipeSeller(order.sellerName)) return "OPV";
  if (type === "NORMAL" || code.startsWith("OPK-")) return "OPK";
  return null;
}

export function isDirectPrepareOrder(order) {
  return classifyPrepareOrder(order) != null;
}

function normalizeEntreCuerosToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** OPV del cliente Entre Cueros (sin límite de 10 líneas en impresión). */
export function isEntreCuerosCustomerOpv(order) {
  if (!order || classifyPrepareOrder(order) !== "OPV") return false;
  const customerToken = normalizeEntreCuerosToken(order.customerName);
  return customerToken.includes("ENTRECUEROS");
}

export function orderHasConfirmedShipment(shipments) {
  return (shipments || []).some((s) => {
    const st = String(s?.status || "").trim().toUpperCase();
    return st && st !== "DRAFT" && st !== "CANCELLED";
  });
}

/** OP pendiente de preparar envío (incluye documento OPV/OPI anulado sin envío activo). */
export function orderIsPendingForPrepare(order, shipments) {
  if (order?.vendorShipmentVoidedAt) {
    return !orderHasConfirmedShipment(shipments);
  }
  return !orderHasConfirmedShipment(shipments);
}

/** Convierte productos de un envío API a líneas de impresión OPV. */
export function mapShipmentProductsForOpvPrint(shipment) {
  return (shipment?.products || []).map((p, idx) => ({
    productId: p.productId,
    productCode: p.productCode,
    productName: p.productName,
    colorId: p.colorId,
    colorName: p.colorName,
    brandName: p.brandName || "",
    size: p.size || "",
    quantity: Number(p.quantity) || 0,
    unitPrice: Number(p.unitPrice) || 0,
    id: p.id || `shp-${idx}`,
    uomName: "Unidad",
    unitName: "Unidad",
  }));
}

export function orderItemsHaveBrand(items) {
  return (items || []).some((item) => String(item?.brandName || "").trim() !== "");
}

/** Clave estable para editar precio de una línea de la OP (por ítem, no por talla). */
export function opvItemPriceKey(item, index) {
  if (item?.id != null) return `id-${item.id}`;
  return `idx-${index}`;
}

export function resolveDefaultOpvUnitPrice(item, productCatalogById = {}) {
  const fromItem = Number(item?.unitPrice);
  if (Number.isFinite(fromItem) && fromItem > 0) return fromItem;
  const productId = Number(item?.productId);
  const product = Number.isFinite(productId) ? productCatalogById[productId] : null;
  const seller = Number(product?.sellerPrice);
  if (Number.isFinite(seller) && seller > 0) return seller;
  const sale = Number(product?.salePrice ?? product?.price);
  if (Number.isFinite(sale) && sale > 0) return sale;
  return 0;
}

/** Filas para revisión de precios (una fila por talla si aplica). */
export function expandOrderItemsForOpvPriceLines(order, productCatalogById = {}) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lines = [];
  items.forEach((item, itemIndex) => {
    const key = opvItemPriceKey(item, itemIndex);
    const unitPrice = resolveDefaultOpvUnitPrice(item, productCatalogById);
    const base = {
      itemKey: key,
      itemIndex,
      productId: item.productId,
      productCode: item.productCode || "",
      productName: item.productName || "",
      colorId: item.colorId,
      colorName: item.colorName || "",
      brandName: item.brandName || "",
      unitPrice,
    };
    const sizesMap = item?.sizes && typeof item.sizes === "object" ? item.sizes : null;
    const entries = sizesMap ? Object.entries(sizesMap).filter(([, q]) => Number(q) > 0) : [];
    if (entries.length > 0) {
      entries.forEach(([sizeKey, qty]) => {
        lines.push({
          ...base,
          lineId: `${key}-${sizeKey}`,
          size: String(sizeKey),
          quantity: Number(qty) || 0,
        });
      });
    } else if (Number(item.quantity) > 0) {
      lines.push({
        ...base,
        lineId: `${key}-qty`,
        size: "",
        quantity: Number(item.quantity) || 0,
      });
    }
  });
  return lines;
}

export function applyOpvPricesToOrderItems(order, priceByItemKey) {
  const items = Array.isArray(order?.items) ? order.items : [];
  return items.map((item, index) => {
    const key = opvItemPriceKey(item, index);
    const raw = priceByItemKey[key];
    const parsed = Number(raw);
    const unitPrice = Number.isFinite(parsed) && parsed >= 0 ? parsed : item.unitPrice;
    return {
      ...item,
      unitPrice: unitPrice != null && unitPrice !== "" ? Number(unitPrice) : 0,
    };
  });
}

export function applyOrderItemPricesToShipmentProducts(order, products) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const matchItem = (productId, colorId) =>
    items.find((row) => {
      if (Number(row.productId) !== Number(productId)) return false;
      if (row.colorId == null && (colorId == null || colorId === "")) return true;
      return Number(row.colorId) === Number(colorId);
    });
  return (products || []).map((p) => {
    const item = matchItem(p.productId, p.colorId);
    const fromOrder = Number(item?.unitPrice);
    const next = {
      ...p,
      brandName: p.brandName || item?.brandName || "",
    };
    if (Number.isFinite(fromOrder) && fromOrder > 0) {
      next.unitPrice = fromOrder;
    }
    return next;
  });
}

export function buildOpvItemPriceUpdatePayload(order, itemsWithPrices) {
  const o = order || {};
  return {
    code: o.code,
    orderType: o.orderType,
    customerId: o.customerId || null,
    customerName: o.customerName || null,
    sellerName: o.sellerName || null,
    startDate: o.startDate || null,
    deliveryDate: o.deliveryDate || null,
    observations: o.observations ?? null,
    shippingCost: Number(o.shippingCost) || 0,
    packingItems: mapPackingItemsForApi(o.packingItems),
    status: o.status,
    items: (itemsWithPrices || []).map((item) => ({
      productId: item.productId,
      colorId: item.colorId,
      brandName: item.brandName,
      quantity: item.quantity,
      sizes: item.sizes,
      observations: item.observations,
      unitPrice: Number(item.unitPrice) || 0,
    })),
  };
}

export function buildShipmentProductsFromOrderItems(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const lines = [];
  items.forEach((item) => {
    if (!item?.productId) return;
    let addedFromSizes = false;
    if (item.sizes && typeof item.sizes === "object") {
      Object.entries(item.sizes).forEach(([size, qty]) => {
        const q = Number(qty);
        if (q > 0) {
          lines.push({
            productId: Number(item.productId),
            colorId: item.colorId != null ? Number(item.colorId) : null,
            size: String(size),
            quantity: q,
          });
          addedFromSizes = true;
        }
      });
    }
    if (!addedFromSizes && Number(item.quantity) > 0) {
      lines.push({
        productId: Number(item.productId),
        colorId: item.colorId != null ? Number(item.colorId) : null,
        size: "",
        quantity: Number(item.quantity),
      });
    }
  });
  return lines;
}

export function mapPackingItemsForApi(packingItems) {
  return (packingItems || [])
    .map((item) => ({
      materialId: Number(item.materialId),
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    }))
    .filter((item) => item.materialId > 0 && item.quantity > 0);
}

export function buildDefaultDestinationFromOrder(order) {
  if (!order) return "";
  const parts = [order.customerAddress, order.customerName].filter(
    (v) => v != null && String(v).trim() !== ""
  );
  return parts.join(" — ").trim();
}

/** Fecha del documento de envío: hoy (GT) si la OP no trae fecha. */
export function getDefaultShipmentDocumentDate(order) {
  const raw = order?.deliveryDate || order?.startDate;
  if (raw) {
    const text = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  }
  return getTodayYmdGuatemala();
}

export function initShipmentGenerateForm(order) {
  const o = order || {};
  return {
    customerName: String(o.customerName || "").trim(),
    customerAddress: String(o.customerAddress || "").trim(),
    customerPhone: String(o.customerPhone || "").trim(),
    customerTaxId: String(o.customerTaxId || "CF").trim() || "CF",
    shippingCost:
      o.shippingCost != null && o.shippingCost !== ""
        ? String(Number(o.shippingCost))
        : "0",
    documentDate: getDefaultShipmentDocumentDate(o),
    destination: buildDefaultDestinationFromOrder(o),
  };
}

export function buildDestinationFromForm(form) {
  const dest = String(form?.destination || "").trim();
  if (dest) return dest;
  const parts = [form?.customerAddress, form?.customerName]
    .map((v) => (v != null ? String(v).trim() : ""))
    .filter(Boolean);
  return parts.join(" — ").trim();
}

export function buildProductionOrderUpdatePayload(order, form) {
  const o = order || {};
  const items = Array.isArray(o.items) ? o.items : [];
  return {
    code: o.code,
    orderType: o.orderType,
    customerId: o.customerId || null,
    customerName: String(form.customerName || "").trim() || null,
    sellerName: o.sellerName || null,
    startDate: form.documentDate || null,
    deliveryDate: form.documentDate || null,
    observations: o.observations ?? null,
    shippingCost: Number.parseFloat(form.shippingCost) || 0,
    packingItems: mapPackingItemsForApi(o.packingItems),
    items: items.map((item) => ({
      productId: item.productId,
      colorId: item.colorId,
      brandName: item.brandName,
      quantity: item.quantity,
      sizes: item.sizes,
      observations: item.observations,
      unitPrice: item.unitPrice != null ? Number(item.unitPrice) : undefined,
    })),
  };
}

export function mergeOrderWithShipmentForm(order, form) {
  if (!order) return order;
  return {
    ...order,
    customerName: String(form.customerName || "").trim() || order.customerName,
    customerAddress: String(form.customerAddress || "").trim() || order.customerAddress,
    customerPhone: String(form.customerPhone || "").trim() || order.customerPhone,
    customerTaxId: String(form.customerTaxId || "").trim() || order.customerTaxId,
    shippingCost: Number.parseFloat(form.shippingCost) || 0,
    deliveryDate: form.documentDate || order.deliveryDate,
    startDate: form.documentDate || order.startDate,
  };
}

export { isLuisFelipeVendorFlow };

export function buildPartialPanelOrder(productionOrder) {
  const o = productionOrder || {};
  return {
    id: o.id,
    code: o.code,
    orderType: o.orderType,
    sellerName: o.sellerName,
    customerName: o.customerName,
    customerAddress: o.customerAddress,
    customerPhone: o.customerPhone,
    customerTaxId: o.customerTaxId,
    shippingCost: o.shippingCost,
    packingItems: o.packingItems,
    vendorShipmentNumber: o.vendorShipmentNumber,
    items: o.items,
    deliveryDate: o.deliveryDate,
  };
}
