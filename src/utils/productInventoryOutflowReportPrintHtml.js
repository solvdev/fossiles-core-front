import { escapeHtml } from "utils/shipmentPrintDocumentHtml";
import { formatDateTimeGt } from "utils/dateTimeHelper";

function formatQty(n) {
  if (n == null || n === "") return "—";
  const v = parseFloat(n);
  if (Number.isNaN(v)) return escapeHtml(String(n));
  return Math.abs(v).toFixed(3);
}

function rowCells(r) {
  const doc = [r.referenceNumber, r.orderCode, r.distributionCode].filter(Boolean).join(" / ") || "—";
  return `
    <tr>
      <td>${escapeHtml(formatDateTimeGt(r.movementDate))}</td>
      <td>${escapeHtml(r.sourceLabel || r.sourceCategory || "—")}</td>
      <td>${escapeHtml(r.orderType || "—")}</td>
      <td>${escapeHtml(doc)}</td>
      <td>${escapeHtml(r.productCode || "")} ${escapeHtml(r.productName || "")}</td>
      <td>${escapeHtml(r.colorName || "—")}</td>
      <td>${escapeHtml(r.locationName || "—")}</td>
      <td>${escapeHtml(r.destinationLocationName || "—")}</td>
      <td class="num">${formatQty(r.quantity)}</td>
      <td class="num">${formatQty(r.quantityBefore)}</td>
      <td class="num">${formatQty(r.quantityAfter)}</td>
      <td>${escapeHtml(r.description || "—")}</td>
    </tr>
  `;
}

export function buildProductInventoryOutflowReportPrintHtml(rows, filtersSummary) {
  const list = Array.isArray(rows) ? rows : [];
  const body = list.map(rowCells).join("");
  const summary = filtersSummary ? `<p class="summary">${escapeHtml(filtersSummary)}</p>` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Reporte de salidas de inventario</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; margin: 20px; }
    h1 { font-size: 16px; margin-bottom: 4px; }
    .summary { font-size: 11px; color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; font-weight: 600; }
    td.num { text-align: right; }
    @media print { body { margin: 10px; } }
  </style>
</head>
<body>
  <h1>Reporte de salidas de inventario de productos (${list.length})</h1>
  ${summary}
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Origen</th>
        <th>Tipo OP</th>
        <th>Documento</th>
        <th>Producto</th>
        <th>Color</th>
        <th>Ubicación origen</th>
        <th>Destino</th>
        <th>Cantidad</th>
        <th>Antes</th>
        <th>Después</th>
        <th>Descripción</th>
      </tr>
    </thead>
    <tbody>
      ${body || '<tr><td colspan="12">Sin datos</td></tr>'}
    </tbody>
  </table>
</body>
</html>`;
}

export function openProductInventoryOutflowPrintWindow(html) {
  const w = window.open("", "_blank", "noopener,noreferrer");
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    try {
      w.print();
    } catch (_e) {
      /* ignore */
    }
  }, 250);
  return true;
}
