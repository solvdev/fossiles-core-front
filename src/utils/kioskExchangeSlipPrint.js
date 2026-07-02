import { escapeHtml } from "utils/shipmentPrintDocumentHtml";

function fmtMoney(value) {
  const num = Number(value || 0);
  return escapeHtml(`Q ${num.toFixed(2)}`);
}

function fmtQty(value) {
  const num = Number(value || 0);
  return escapeHtml(Number.isInteger(num) ? String(num) : num.toFixed(2));
}

function fmtDate(value) {
  if (!value) return "—";
  return escapeHtml(String(value).slice(0, 10));
}

function lineDescription(line) {
  if (!line) return "—";
  const parts = [
    line.productCode,
    line.productName || line.returnedProductName || line.givenProductName,
    line.colorName || line.returnedColorName || line.givenColorName,
    line.size || line.returnedSize || line.givenSize ? `T.${line.size || line.returnedSize || line.givenSize}` : "",
  ].filter(Boolean);
  return escapeHtml(parts.join(" · "));
}

function buildProductRows(lines, amountKey) {
  return (lines || [])
    .map(
      (line) => `<tr>
        <td>${lineDescription(line)}</td>
        <td class="num">${fmtQty(line.quantity || line.returnedQuantity || line.givenQuantity)}</td>
        <td class="num">${fmtMoney(line.unitPrice || line[amountKey] / (line.quantity || 1))}</td>
        <td class="num">${fmtMoney(line.lineTotal || line[amountKey])}</td>
      </tr>`
    )
    .join("");
}

export function buildKioskExchangeSlipPrintHtml(slip, preview) {
  const returned = preview?.returned || {
    productCode: slip?.returnedProductCode,
    productName: slip?.returnedProductName,
    colorName: slip?.returnedColorName,
    size: slip?.returnedSize,
    quantity: slip?.returnedQuantity,
    unitPrice: slip?.returnedAmount && slip?.returnedQuantity
      ? Number(slip.returnedAmount) / Number(slip.returnedQuantity)
      : slip?.returnedAmount,
    lineTotal: slip?.returnedAmount,
  };
  const given = preview?.given || {
    productCode: slip?.givenProductCode,
    productName: slip?.givenProductName,
    colorName: slip?.givenColorName,
    size: slip?.givenSize,
    quantity: slip?.givenQuantity,
    unitPrice: slip?.givenAmount && slip?.givenQuantity
      ? Number(slip.givenAmount) / Number(slip.givenQuantity)
      : slip?.givenAmount,
    lineTotal: slip?.givenAmount,
  };
  const ingreso = preview?.returnedAmount ?? slip?.returnedAmount;
  const egreso = preview?.givenAmount ?? slip?.givenAmount;
  const diferencia = preview?.differenceAmount ?? slip?.differenceAmount;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Boleta de cambio ${escapeHtml(slip?.slipNumber || "")}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 4px; text-align: center; letter-spacing: 0.04em; }
    .subtitle { text-align: center; margin-bottom: 16px; font-size: 13px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 16px; }
    .section-title { font-weight: bold; margin: 16px 0 6px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
    th { background: #f5f5f5; }
    .num { text-align: right; }
    .summary { margin-top: 16px; width: 360px; margin-left: auto; }
    .summary td { border: 1px solid #333; }
    .signatures { margin-top: 48px; display: grid; grid-template-columns: 1fr 1fr; gap: 48px; }
    .signatures div { border-top: 1px solid #333; padding-top: 6px; text-align: center; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>BOLETA DE CAMBIO</h1>
  <div class="subtitle">${escapeHtml(slip?.kioskName || "")}</div>
  <div class="meta">
    <div><strong>Serie / No.:</strong> ${escapeHtml(slip?.slipNumber || "—")}</div>
    <div><strong>Fecha:</strong> ${fmtDate(slip?.completedAt || slip?.createdAt)}</div>
    <div><strong>Venta original:</strong> ${escapeHtml(slip?.originalSaleNumber || preview?.originalSaleNumber || "—")}</div>
    <div><strong>Venta nueva:</strong> ${escapeHtml(slip?.newSaleNumber || "—")}</div>
    <div><strong>Motivo:</strong> ${escapeHtml(slip?.reason || "—")}</div>
    <div><strong>Atendió:</strong> ${escapeHtml(slip?.createdByName || "—")}</div>
  </div>

  <div class="section-title">Ingreso — producto devuelto</div>
  <table>
    <thead><tr><th>Artículo</th><th>Cant.</th><th>P. unit.</th><th>Total</th></tr></thead>
    <tbody>${buildProductRows([returned], "returnedAmount")}</tbody>
    <tfoot><tr><th colspan="3">Total ingreso</th><th class="num">${fmtMoney(ingreso)}</th></tr></tfoot>
  </table>

  <div class="section-title">Egreso — producto entregado</div>
  <table>
    <thead><tr><th>Artículo</th><th>Cant.</th><th>P. unit.</th><th>Total</th></tr></thead>
    <tbody>${buildProductRows([given], "givenAmount")}</tbody>
    <tfoot><tr><th colspan="3">Total egreso</th><th class="num">${fmtMoney(egreso)}</th></tr></tfoot>
  </table>

  <table class="summary">
    <tr><td>Ingreso</td><td class="num">${fmtMoney(ingreso)}</td></tr>
    <tr><td>Egreso</td><td class="num">${fmtMoney(egreso)}</td></tr>
    <tr><th>Diferencia cobrada</th><th class="num">${fmtMoney(diferencia)}</th></tr>
  </table>

  ${slip?.observations ? `<p style="margin-top:16px;"><strong>Observaciones:</strong> ${escapeHtml(slip.observations)}</p>` : ""}

  <div class="signatures">
    <div>Cliente</div>
    <div>Encargada / Cajera</div>
  </div>
  <p style="margin-top:24px;font-size:11px;color:#666;">Impreso ${new Date().toLocaleString("es-GT")}</p>
</body>
</html>`;
}

export function buildKioskReturnSlipPrintHtml(slip) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Devolución ${escapeHtml(slip?.slipNumber || "")}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #222; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .meta { line-height: 1.6; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
    .num { text-align: right; }
    @media print { body { margin: 12px; } }
  </style>
</head>
<body>
  <h1>Boleta de devolución</h1>
  <div class="meta">
    <div><strong>No.:</strong> ${escapeHtml(slip?.slipNumber || "—")}</div>
    <div><strong>Kiosko:</strong> ${escapeHtml(slip?.kioskName || "—")}</div>
    <div><strong>Venta original:</strong> ${escapeHtml(slip?.originalSaleNumber || "—")}</div>
    <div><strong>Fecha:</strong> ${fmtDate(slip?.createdAt)}</div>
    <div><strong>Apto reventa:</strong> ${slip?.apto ? "Sí" : "No"}</div>
    <div><strong>Motivo:</strong> ${escapeHtml(slip?.reason || "—")}</div>
  </div>
  <table>
    <thead><tr><th>Producto</th><th>Cant.</th><th>Valor devuelto</th></tr></thead>
    <tbody>
      <tr>
        <td>${lineDescription({
          productCode: slip?.returnedProductCode,
          productName: slip?.returnedProductName,
          colorName: slip?.returnedColorName,
          size: slip?.returnedSize,
        })}</td>
        <td class="num">${fmtQty(slip?.returnedQuantity)}</td>
        <td class="num">${fmtMoney(slip?.returnedAmount)}</td>
      </tr>
    </tbody>
  </table>
  <p style="margin-top:16px;">Reembolso en efectivo manual según política de tienda.</p>
  <p style="margin-top:24px;font-size:11px;color:#666;">Impreso ${new Date().toLocaleString("es-GT")}</p>
</body>
</html>`;
}

export function openExchangeSlipPrintWindow(html) {
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
