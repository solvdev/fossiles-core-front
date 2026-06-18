import { getProducts } from "services/productService";
import { getProductionOrderById } from "services/productionOrderService";
import {
  buildPseudoOrderFromStandaloneShipment,
  computeInternalEnviUnitPrice,
  parseStandaloneInternalMeta,
} from "utils/standaloneInternalShipmentHelper";
import {
  buildOpShipmentPrintDocumentHtml,
  openOpShipmentPrintWindow,
} from "utils/productionOrderOpShipmentPrintHtml";

export function buildOpiPrintRows(shipment, pricingMeta, saleRefById) {
  const meta =
    pricingMeta && typeof pricingMeta === "object"
      ? pricingMeta
      : parseStandaloneInternalMeta(shipment?.notes);
  const list = shipment._printProducts || shipment.products || [];
  return list
    .map((p) => {
      const pid = Number(p.productId);
      let refNum = null;
      if (Number.isFinite(pid) && pid > 0) {
        const fromCat = Number(saleRefById[pid]);
        if (Number.isFinite(fromCat) && fromCat > 0) {
          refNum = fromCat;
        }
      }
      if (refNum == null || refNum <= 0) {
        const fromLine = Number(p.unitPrice || 0);
        refNum = Number.isFinite(fromLine) && fromLine > 0 ? fromLine : null;
      }
      const display = refNum != null ? computeInternalEnviUnitPrice(refNum, meta) : null;
      return {
        productCode: p.productCode || "",
        productName: p.productName || "",
        colorName: p.colorName || "",
        size: p.size || "",
        quantity: p.quantity,
        refPrice: refNum,
        displayPrice: display,
      };
    })
    .filter((r) => Number(r.quantity) > 0);
}

export async function printStandaloneEnviShipment(shipment) {
  const products = await getProducts();
  const saleRefById = {};
  (products || []).forEach((p) => {
    const id = Number(p.id);
    const price = Number(p.salePrice ?? p.price ?? 0);
    if (Number.isFinite(id) && id > 0 && Number.isFinite(price) && price > 0) {
      saleRefById[id] = price;
    }
  });
  const meta = parseStandaloneInternalMeta(shipment?.notes);
  const order = buildPseudoOrderFromStandaloneShipment(shipment);
  const rows = buildOpiPrintRows(shipment, meta, saleRefById);
  const html = buildOpShipmentPrintDocumentHtml({
    order,
    shipment,
    rows,
    pricingMeta: meta,
    requestType: meta.requestType,
  });
  return openOpShipmentPrintWindow(html);
}

/** Imprime ENVI standalone o ligado a OPI (INTERNA). */
export async function printInternalEnviShipment(shipment) {
  const products = await getProducts();
  const saleRefById = {};
  (products || []).forEach((p) => {
    const id = Number(p.id);
    const price = Number(p.salePrice ?? p.price ?? 0);
    if (Number.isFinite(id) && id > 0 && Number.isFinite(price) && price > 0) {
      saleRefById[id] = price;
    }
  });

  if (shipment?.productionOrderId) {
    const order = await getProductionOrderById(shipment.productionOrderId);
    const meta = { requestType: "PLANILLA", discountPercent: 50, applyHalfPrice: true };
    const rows = buildOpiPrintRows(shipment, meta, saleRefById);
    const html = buildOpShipmentPrintDocumentHtml({
      order,
      shipment,
      rows,
      pricingMeta: meta,
    });
    return openOpShipmentPrintWindow(html);
  }

  return printStandaloneEnviShipment(shipment);
}
