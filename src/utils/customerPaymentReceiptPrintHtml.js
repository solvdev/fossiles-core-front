import { escapeHtml } from "utils/shipmentPrintDocumentHtml";
import { formatAccountMoney, getConceptLabel, PAYMENT_METHODS } from "services/customerAccountService";

function fmtMoney(value) {
  return escapeHtml(formatAccountMoney(value));
}

function fmtDate(value) {
  if (!value) return "—";
  return escapeHtml(String(value).slice(0, 10));
}

function paymentMethodLabel(value) {
  const match = PAYMENT_METHODS.find((m) => m.value === value);
  return match ? match.label : value || "—";
}

export function buildCustomerPaymentReceiptPrintHtml(entry, customer = {}) {
  const gross = entry.grossCollectedAmount ?? entry.amount;
  const discount = Number(entry.paymentDiscountAmount) || 0;
  const concept = getConceptLabel(entry.movementConceptCode);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Recibo ${escapeHtml(entry.receiptNumber || entry.id || "")}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .meta { margin-bottom: 16px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; }
    .num { text-align: right; }
    .totals { margin-top: 16px; width: 320px; margin-left: auto; }
    .totals td { border: none; padding: 4px 8px; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Recibo de cobro / descarga</h1>
  <div class="meta">
    <div><strong>Cliente:</strong> ${escapeHtml(customer.customerName || customer.name || "—")}</div>
    <div><strong>Clave:</strong> ${escapeHtml(customer.legacyCode || "—")}</div>
    <div><strong>Recibo caja:</strong> ${escapeHtml(entry.receiptNumber || "—")}</div>
    <div><strong>Concepto:</strong> ${escapeHtml(concept)}</div>
    <div><strong>Fecha cobro:</strong> ${fmtDate(entry.collectionDate)}</div>
    <div><strong>Fecha registro:</strong> ${fmtDate(entry.entryDate)}</div>
    <div><strong>Método:</strong> ${escapeHtml(paymentMethodLabel(entry.paymentMethod))}</div>
    <div><strong>No. factura / ENVP:</strong> ${escapeHtml(entry.invoiceNumber || entry.vendorShipmentNumber || "—")}</div>
    <div><strong>Documento:</strong> ${escapeHtml(entry.documentNumber || entry.productionOrderCode || "—")}</div>
  </div>
  <table class="totals">
    <tr><td>Bruto cobrado</td><td class="num">${fmtMoney(gross)}</td></tr>
    <tr><td>Descuento</td><td class="num">${discount > 0 ? fmtMoney(discount) : "—"}</td></tr>
    <tr><td><strong>Efectivo cobrado</strong></td><td class="num"><strong>${fmtMoney(entry.amount)}</strong></td></tr>
    ${discount > 0 ? `<tr><td>Total descarga al saldo</td><td class="num">${fmtMoney(gross)}</td></tr>` : ""}
  </table>
  <p style="margin-top:24px;font-size:11px;color:#666;">Impreso ${new Date().toLocaleString("es-GT")}</p>
</body>
</html>`;
}

export function buildCustomerSettlementPrintHtml(settlement, customer = {}, doc = {}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Liquidación documento</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .meta { margin-bottom: 16px; line-height: 1.5; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    .num { text-align: right; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Devolución / Descuento y descarga</h1>
  <div class="meta">
    <div><strong>Cliente:</strong> ${escapeHtml(customer.customerName || customer.name || "—")}</div>
    <div><strong>Clave:</strong> ${escapeHtml(customer.legacyCode || "—")}</div>
    <div><strong>Documento:</strong> ${escapeHtml(doc.documentNumber || doc.orderCode || "—")}</div>
    <div><strong>No. factura / ENVP:</strong> ${escapeHtml(doc.invoiceNumber || "—")}</div>
  </div>
  <table>
    <tr><td>Saldo inicial</td><td class="num">${fmtMoney(settlement.initialBalance)}</td></tr>
    <tr><td>Descuento comercial</td><td class="num">${fmtMoney(settlement.commercialDiscount)}</td></tr>
    <tr><td>Saldo después descuento</td><td class="num">${fmtMoney(settlement.balanceAfterDiscount)}</td></tr>
    <tr><td>Descarga bruta</td><td class="num">${fmtMoney(settlement.paymentGross)}</td></tr>
    <tr><td>Descuento al cobrar</td><td class="num">${fmtMoney(settlement.paymentDiscountAtCollection)}</td></tr>
    <tr><td>Efectivo cobrado</td><td class="num">${fmtMoney(settlement.paymentNet)}</td></tr>
    <tr><td><strong>Saldo final documento</strong></td><td class="num"><strong>${fmtMoney(settlement.finalBalance)}</strong></td></tr>
  </table>
  <p style="margin-top:24px;font-size:11px;color:#666;">Impreso ${new Date().toLocaleString("es-GT")}</p>
</body>
</html>`;
}

export function buildCustomerReturnVoucherPrintHtml(entry, customer = {}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Boleta devolución ${escapeHtml(entry.returnVoucherNumber || "")}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .meta { margin-bottom: 16px; line-height: 1.5; }
    .num { text-align: right; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Boleta de devolución</h1>
  <div class="meta">
    <div><strong>No. boleta:</strong> ${escapeHtml(entry.returnVoucherNumber || "—")}</div>
    <div><strong>Cliente:</strong> ${escapeHtml(customer.customerName || customer.name || "—")}</div>
    <div><strong>Clave:</strong> ${escapeHtml(customer.legacyCode || "—")}</div>
    <div><strong>Fecha devolución:</strong> ${fmtDate(entry.returnDate || entry.entryDate)}</div>
    <div><strong>Documento:</strong> ${escapeHtml(entry.documentNumber || entry.productionOrderCode || "—")}</div>
    <div><strong>No. factura / ENVP:</strong> ${escapeHtml(entry.invoiceNumber || entry.vendorShipmentNumber || "—")}</div>
    <div><strong>Motivo:</strong> ${escapeHtml(entry.returnReason || entry.description || "—")}</div>
    <div><strong>Valor devuelto:</strong> <span class="num">${fmtMoney(entry.amount)}</span></div>
  </div>
  <p style="margin-top:24px;font-size:11px;color:#666;">Impreso ${new Date().toLocaleString("es-GT")}</p>
</body>
</html>`;
}

export function openAccountPrintWindow(html) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch (_e) {
      /* ignore */
    }
  }, 400);
  return true;
}
