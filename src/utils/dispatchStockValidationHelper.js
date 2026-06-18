import { validateDispatchStock } from "services/productDistributionService";
import { isCinchoOrderType } from "utils/cinchoProductionHelper";

export function mapShipmentProductLines(products) {
  return (products || [])
    .map((p) => ({
      productId: Number(p.productId),
      colorId: p.colorId === null || p.colorId === undefined || p.colorId === "" ? null : Number(p.colorId),
      size: String(p.size || p.sizeLabel || "").trim().toUpperCase() || undefined,
      quantity: Number(p.quantity) || 0,
    }))
    .filter((p) => Number.isFinite(p.productId) && p.productId > 0 && p.quantity > 0);
}

export function buildStockProductsFromPartialDraft(draftLines, orderType, availabilityRows) {
  const cincho = isCinchoOrderType(orderType);
  const availByItem = new Map(
    (availabilityRows || []).map((r) => [String(r.productionOrderItemId), r])
  );
  const products = [];
  (draftLines || []).forEach((row) => {
    if (row.included === false) return;
    const avail = availByItem.get(String(row.productionOrderItemId));
    const productId = avail?.productId;
    const colorId = avail?.colorId ?? null;
    if (!productId) return;
    if (cincho && row.sizes && typeof row.sizes === "object") {
      Object.entries(row.sizes).forEach(([size, qty]) => {
        const q = Number(qty);
        if (q > 0) products.push({ productId, colorId, size, quantity: q });
      });
    } else {
      const q = Number(row.quantity || 0);
      if (q > 0) products.push({ productId, colorId, quantity: q });
    }
  });
  return products;
}

/**
 * Valida stock en Devoluciones + Bodega PT antes de enviar (misma regla que el backend).
 */
export async function assertDispatchStockForProducts(products) {
  const lines = mapShipmentProductLines(products);
  if (!lines.length) {
    throw new Error("No hay productos con cantidad para validar stock.");
  }
  await validateDispatchStock(lines);
}
