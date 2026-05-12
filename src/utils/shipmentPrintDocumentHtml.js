import { SHIPPING_CARRIERS } from "services/onlineSaleService";

export function getSimplePaymentLabel(paymentMethod) {
  const method = String(paymentMethod || "").toUpperCase();
  if (!method) return "—";

  const isPending = method.includes("PENDIENTE");

  if (method.includes("VISALINK")) return isPending ? "VISALINK PENDIENTE" : "VISALINK";
  if (method.includes("TARJETA")) return "TARJETA";
  if (method.includes("CONTRA_ENTREGA") || method.includes("EFECTIVO")) return "CONTRA ENTREGA";
  if (method.includes("DEPOSITO")) return isPending ? "DEPÓSITO PENDIENTE" : "DEPÓSITO";
  if (method.includes("TRANSFERENCIA")) return isPending ? "TRANSFERENCIA PENDIENTE" : "TRANSFERENCIA";

  return method.replaceAll("_", " ");
}

export function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDateDisplay(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = String(isoDate).split("-");
  if (!year || !month || !day) return String(isoDate);
  return `${day}/${month}/${year}`;
}

const UNITS_WORDS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const TENS_WORDS = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS_WORDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

const toWordsBelowHundred = (n) => {
  if (n < 10) return UNITS_WORDS[n];
  if (n >= 10 && n < 16) {
    const teens = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE"];
    return teens[n - 10];
  }
  if (n < 20) return `DIECI${UNITS_WORDS[n - 10].toLowerCase()}`.toUpperCase();
  if (n === 20) return "VEINTE";
  if (n < 30) return `VEINTI${UNITS_WORDS[n - 20].toLowerCase()}`.toUpperCase();
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  return unit ? `${TENS_WORDS[ten]} Y ${UNITS_WORDS[unit]}` : TENS_WORDS[ten];
};

const toWordsBelowThousand = (n) => {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const hundredText = HUNDREDS_WORDS[hundred];
  const restText = toWordsBelowHundred(rest);
  if (hundredText && restText) return `${hundredText} ${restText}`;
  return hundredText || restText;
};

function numberToWordsEs(rawNumber) {
  const number = Math.floor(Math.max(0, Number(rawNumber) || 0));
  if (number === 0) return "CERO";
  if (number >= 1000000000) return String(number);

  const millions = Math.floor(number / 1000000);
  const thousands = Math.floor((number % 1000000) / 1000);
  const hundreds = number % 1000;
  const parts = [];

  if (millions > 0) {
    if (millions === 1) parts.push("UN MILLON");
    else parts.push(`${toWordsBelowThousand(millions)} MILLONES`);
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push("MIL");
    else parts.push(`${toWordsBelowThousand(thousands)} MIL`);
  }
  if (hundreds > 0) parts.push(toWordsBelowThousand(hundreds));
  return parts.join(" ").replaceAll("  ", " ").trim();
}

function amountToWordsQ(amount) {
  const numericAmount = Math.max(0, Number(amount) || 0);
  const whole = Math.floor(numericAmount);
  const cents = Math.round((numericAmount - whole) * 100);
  return `${numberToWordsEs(whole)} QUETZALES CON ${String(cents).padStart(2, "0")}/100`;
}

export function getShipmentDocumentStyles(extra = "") {
  return `
            @page { size: letter; margin: 10mm; }
            body { font-family: Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
            .doc { border: 1px solid #777; min-height: 252mm; width: 100%; max-width: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
            .doc + .doc { break-before: page; page-break-before: always; }
            .section { border-bottom: 1px solid #777; padding: 8px 10px; }
            .top { display: flex; justify-content: space-between; align-items: flex-start; }
            .title { text-align: right; }
            .title h2 { margin: 0; letter-spacing: 1px; font-size: 22px; }
            .title .num { font-size: 24px; font-weight: bold; margin-top: 2px; }
            .line { display: flex; gap: 8px; margin: 2px 0; }
            .label { min-width: 70px; color: #333; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px dashed #777; padding: 4px 6px; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
            th { text-align: center; background: #f7f7f7; }
            .totals { width: 280px; margin-left: auto; margin-top: 8px; }
            .totals td { border: 1px solid #777; }
            .content-main { flex: 1; }
            .bottom-block { margin-top: auto; }
            .footer { padding: 8px 10px; font-size: 11px; }
            .signature { margin-top: 18px; width: 220px; border-top: 1px solid #777; text-align: center; padding-top: 2px; }
            ${extra}
  `.trim();
}

/**
 * Cuerpo del documento (div.doc) para componer varias páginas en una sola ventana de impresión.
 */
export function buildShipmentDocumentInnerHtml(sale, opts = {}) {
  const docType = String(opts.docType || "ENVIO").toUpperCase();
  const docNo = String(opts.docNo || sale.shipmentNumber || sale.saleNumber || sale.id || "");
  const saleDateStr = sale.saleDate || new Date().toISOString().split("T")[0];
  const items =
    sale.items && sale.items.length > 0
      ? sale.items
      : [
          {
            productCode: sale.productCode,
            productName: sale.productName,
            colorName: sale.colorName,
            size: sale.size,
            quantity: sale.quantity || 1,
            unitPrice: sale.unitPrice || 0,
            subtotal: sale.netAmount || sale.totalAmount || 0,
          },
        ];
  const totalItems = items.reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 0), 0);
  const netAmount = parseFloat(opts.netAmount ?? sale.netAmount) || 0;
  const totalAmount = parseFloat(opts.totalAmount ?? sale.totalAmount) || 0;
  const carrierLabel = SHIPPING_CARRIERS.find((c) => c.value === sale.shippingCarrier)?.label || sale.shippingCarrier || "—";
  const paymentLabel = getSimplePaymentLabel(sale.paymentMethod);
  const shippingAmount = parseFloat(opts.shippingCost ?? sale.shippingCost) || 0;
  const relatedShipmentNumber = opts.relatedShipmentNumber || "";
  const copyLabel = opts.copyLabel || "";
  const businessTitle = opts.businessTitle || "VENTA EN LINEA FOSSILES";

  const docTitle = docType === "DEVOLUCION" ? "DEVOLUCIÓN" : docType === "CAMBIO" ? "CAMBIO" : "ENVIO";
  const docSubtitle =
    docType === "DEVOLUCION"
      ? "Documento de devolución"
      : docType === "CAMBIO"
        ? "Envío por cambio (Q0)"
        : "Preparación";

  const relatedLine =
    (docType === "DEVOLUCION" || docType === "CAMBIO") && relatedShipmentNumber
      ? `<div class="line"><span class="label">Relacionado:</span><span>${escapeHtml(String(relatedShipmentNumber))}</span></div>`
      : "";

  const rowsHtml = items
    .map((it) => {
      const qty = parseInt(it.quantity, 10) || 1;
      const unitPrice = parseFloat(it.unitPrice) || 0;
      const lineTotal = parseFloat(it.subtotal) || unitPrice * qty;
      const description = [it.productName || "", it.colorName || "", it.size ? `Talla ${it.size}` : ""]
        .filter(Boolean)
        .join(" - ");
      return `
        <tr>
          <td>${escapeHtml(it.productCode || "")}</td>
          <td style="text-align:center">${qty}</td>
          <td>${escapeHtml(description)}</td>
          <td style="text-align:right">Q. ${unitPrice.toFixed(2)}</td>
          <td style="text-align:right">Q. ${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    })
    .join("");

  const copyLine = copyLabel
    ? `<div class="section" style="padding:4px 10px;font-size:10px;color:#555">${escapeHtml(copyLabel)}</div>`
    : "";

  return `
          <div class="doc">
            <div class="section top">
              <div>
                <div style="font-size:14px;font-weight:bold;letter-spacing:1px">FOSSILES</div>
                <div style="font-size:20px;font-weight:bold">${escapeHtml(businessTitle)}</div>
                <div>Km. 17 Carretera San Juan Sacatepequez</div>
                <div>17-05, Zona 6 de Mixco Guatemala C.A.</div>
                <div>Telefono PBX: 2462-5700</div>
              </div>
              <div class="title">
                <h2>${escapeHtml(docTitle)}</h2>
                <div style="font-size:11px;color:#555;margin-top:2px">${escapeHtml(docSubtitle)}</div>
                <div>No. <span class="num">${escapeHtml(docNo)}</span></div>
              </div>
            </div>
            ${copyLine}

            <div class="section">
              <div style="display:flex;justify-content:space-between;gap:16px">
                <div style="flex:1">
                  <div class="line"><span class="label">Cliente:</span><span>${escapeHtml(sale.customerName || "—")}</span></div>
                  <div class="line"><span class="label">Direccion:</span><span>${escapeHtml(sale.address || "—")}</span></div>
                  <div class="line"><span class="label">Telefono:</span><span>${escapeHtml(sale.phone || "—")}</span></div>
                  <div class="line"><span class="label">Enviar:</span><span>${escapeHtml(sale.phone2 || "—")}</span></div>
                </div>
                <div style="flex:1">
                  <div class="line"><span class="label">Pedido:</span><span>#${escapeHtml(String(sale.saleNumber || sale.id || ""))}</span></div>
                  <div class="line"><span class="label">N° envío:</span><span>${escapeHtml(sale.shipmentNumber || "—")}</span></div>
                  ${relatedLine}
                  <div class="line"><span class="label">Fecha:</span><span>${escapeHtml(formatDateDisplay(saleDateStr))}</span></div>
                  <div class="line"><span class="label">Transporte:</span><span>${escapeHtml(carrierLabel)}</span></div>
                  <div class="line"><span class="label">No. Guía:</span><span>${escapeHtml(sale.guideNumber || "—")}</span></div>
                  <div class="line"><span class="label">Nit:</span><span>${escapeHtml(sale.invoiceTaxId || "CF")}</span></div>
                  <div class="line"><span class="label">Vendedor:</span><span>${escapeHtml(sale.salesperson || "—")}</span></div>
                </div>
              </div>
            </div>

            <div class="section content-main">
              <table>
                <thead>
                  <tr>
                    <th style="width:16%">Codigo</th>
                    <th style="width:10%">Cantidad</th>
                    <th>Descripcion</th>
                    <th style="width:15%">P.Unitario</th>
                    <th style="width:15%">Total</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
              <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px">
                <div>El total de articulos es: <strong>${totalItems.toFixed(2)}</strong></div>
                <div>Forma de pago: <strong>${escapeHtml(paymentLabel)}</strong></div>
              </div>
              <table class="totals">
                <tr><td>SUBTOTAL: Q.</td><td style="text-align:right">${netAmount.toFixed(2)}</td></tr>
                <tr><td>ENVIO: Q.</td><td style="text-align:right">${shippingAmount.toFixed(2)}</td></tr>
                <tr><td>DESCUENTO: Q.</td><td style="text-align:right">0.00</td></tr>
                <tr><td><strong>TOTAL: Q.</strong></td><td style="text-align:right"><strong>${totalAmount.toFixed(2)}</strong></td></tr>
              </table>
            </div>

            <div class="bottom-block">
              <div class="section" style="font-size:11px">
                <strong>TOTAL EN LETRAS:</strong> ${escapeHtml(amountToWordsQ(totalAmount))}
              </div>

              <div class="footer">
                <div class="signature">Vo.Bo.</div>
                <div style="margin-top:8px">DOCUMENTO DE ${escapeHtml(docTitle)} (referencia interna y paquetería).</div>
                <div>${docType === "DEVOLUCION" ? "Documento para control de devolución." : "No indica que el pedido haya salido de bodega; el despacho se confirma en bodega PT."}</div>
              </div>
            </div>
          </div>
  `;
}

export function buildShipmentDocumentHtml(sale, opts = {}) {
  const docType = String(opts.docType || "ENVIO").toUpperCase();
  const docTitle = docType === "DEVOLUCION" ? "DEVOLUCIÓN" : docType === "CAMBIO" ? "CAMBIO" : "ENVIO";
  const docNo = String(opts.docNo || sale.shipmentNumber || sale.saleNumber || sale.id || "");
  const inner = buildShipmentDocumentInnerHtml(sale, opts);

  return `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>${escapeHtml(docTitle)} ${escapeHtml(docNo)}</title>
          <style>${getShipmentDocumentStyles()}</style>
        </head>
        <body>${inner}</body>
      </html>
    `;
}
