import {
  escapeHtml,
  getShipmentDocumentStyles,
  buildShipmentDocumentInnerHtml,
} from "utils/shipmentPrintDocumentHtml";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { getInternalEnviPriceNote, parseStandaloneInternalMeta, buildInternalEnviPrintNotes, isStandaloneInternalShipment, getStandaloneInternalUserNotes } from "utils/standaloneInternalShipmentHelper";

/**
 * Mismo layout que el documento de venta en línea / envío (shipmentPrintDocumentHtml),
 * con título comercial "ENVIO INTERNO", sin QR — solo constancia.
 */
export function buildOpShipmentPrintDocumentHtml({ order, shipment, rows, applyHalfPrice, pricingMeta, requestType }) {
  const orderType = String(order?.orderType || "");
  const isOpi = orderType === "INTERNA";
  const rowList = Array.isArray(rows) ? rows : [];
  const meta = pricingMeta || parseStandaloneInternalMeta(shipment?.notes);
  if (applyHalfPrice !== undefined && pricingMeta == null) {
    meta.applyHalfPrice = applyHalfPrice;
  }
  if (requestType && !meta.requestType) {
    meta.requestType = requestType;
  }
  const standaloneEnvi = isStandaloneInternalShipment(shipment);

  const items = rowList
    .map((r) => {
      const qty = Number(r.quantity) || 0;
      const ref = r.refPrice != null && Number.isFinite(Number(r.refPrice)) ? Number(r.refPrice) : 0;
      const disp =
        r.displayPrice != null && Number.isFinite(Number(r.displayPrice)) ? Number(r.displayPrice) : null;
      const unitPrice = disp != null && disp >= 0 ? disp : ref;
      const lineTotal = qty * unitPrice;
      return {
        productCode: r.productCode || "",
        productName: r.productName || "",
        colorName: r.colorName || "",
        size: r.size || "",
        quantity: qty,
        unitPrice,
        subtotal: lineTotal,
      };
    })
    .filter((it) => it.quantity > 0);

  const netAmount = items.reduce((s, it) => s + (Number(it.subtotal) || 0), 0);
  const totalAmount = netAmount;

  const dateStr = getTodayYmdGuatemala();

  const destino =
    shipment?.locationName || shipment?.locationCode || (isOpi ? "Entrega interna" : "");

  const priceNote = isOpi || standaloneEnvi
    ? getInternalEnviPriceNote(meta)
    : "Precios de referencia de catálogo.";

  const sale = {
    customerName: order?.customerName || "—",
    address: order?.customerAddress || "—",
    phone: order?.customerPhone || "—",
    phone2: order?.customerPhone || "—",
    saleNumber: order?.code || String(order?.id || ""),
    shipmentNumber:
      shipment?.shipmentNumber ||
      order?.vendorShipmentNumber ||
      shipment?.vendorShipmentNumber ||
      order?.code ||
      String(shipment?.id || ""),
    saleDate: dateStr,
    shippingCarrier: null,
    guideNumber: "",
    invoiceTaxId: order?.customerTaxId || order?.invoiceTaxId || "CF",
    salesperson: order?.sellerName || "—",
    paymentMethod: "",
    items,
    netAmount,
    totalAmount,
    shippingCost: 0,
  };

  const docNo = String(sale.shipmentNumber || sale.saleNumber || "");

  const docSubtitle = isOpi
    ? `Constancia — ${priceNote}`
    : destino
      ? `Constancia — Destino: ${destino}`
      : "Constancia de envío";

  const inner = buildShipmentDocumentInnerHtml(sale, {
    docType: "ENVIO",
    docNo,
    netAmount: sale.netAmount,
    totalAmount: sale.totalAmount,
    shippingCost: 0,
    businessTitle: "ENVIO INTERNO",
    docTitleDisplay: "ENVIO INTERNO",
    docSubtitle,
    constanciaInterna: true,
  });

  const printNotes = standaloneEnvi
    ? buildInternalEnviPrintNotes(shipment?.notes)
    : (getStandaloneInternalUserNotes(shipment?.notes) || String(shipment?.notes || "").trim());

  const notesSection =
    printNotes
      ? `<div class="section" style="padding:6px 10px;font-size:11px;border-bottom:1px solid #777"><strong>Notas:</strong> ${escapeHtml(
          printNotes
        )}</div>`
      : "";

  const ANCHOR_CLIENT =
    "\n            <div class=\"section\">\n              <div style=\"display:flex;justify-content:space-between;gap:16px\">";
  const body = notesSection && inner.includes(ANCHOR_CLIENT)
    ? inner.replace(ANCHOR_CLIENT, `${notesSection}${ANCHOR_CLIENT}`)
    : inner;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>ENVIO INTERNO ${escapeHtml(docNo)}</title>
    <style>${getShipmentDocumentStyles()}</style>
  </head>
  <body>${body}</body>
</html>`;
}

/**
 * Abre una ventana y escribe el HTML. Debe llamarse en la misma pila que el clic del usuario
 * (sin await antes); si no, el navegador suele bloquear la ventana emergente.
 */
export function openOpShipmentPrintWindow(html) {
  const w = window.open("", "_blank");
  if (!w) return false;
  try {
    w.opener = null;
  } catch (_e) {
    /* ignore */
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  const runPrint = () => {
    try {
      w.print();
    } catch (_e) {
      /* ignore */
    }
  };
  if (w.document.readyState === "complete") {
    setTimeout(runPrint, 0);
  } else {
    w.addEventListener("load", () => setTimeout(runPrint, 0), { once: true });
  }
  return true;
}
