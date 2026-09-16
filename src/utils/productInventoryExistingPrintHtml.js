import { escapeHtml } from "utils/shipmentPrintDocumentHtml";
import { formatNowGt } from "utils/dateTimeHelper";
import { flattenInventoryVariantsToSizeRows } from "utils/inventoryVariantHelper";
import { openProductInventoryOutflowPrintWindow } from "utils/productInventoryOutflowReportPrintHtml";

function formatQty(n) {
  const v = parseFloat(n);
  if (!Number.isFinite(v)) return "0";
  return v.toLocaleString("es-GT", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function sortPrintLines(a, b) {
  const loc = String(a.locationName || "").localeCompare(String(b.locationName || ""), "es");
  if (loc) return loc;
  const code = String(a.productCode || "").localeCompare(String(b.productCode || ""), "es", { numeric: true });
  if (code) return code;
  const name = String(a.productName || "").localeCompare(String(b.productName || ""), "es");
  if (name) return name;
  const color = String(a.colorName || "").localeCompare(String(b.colorName || ""), "es");
  if (color) return color;
  return String(a.size || "").localeCompare(String(b.size || ""), "es", { numeric: true });
}

/**
 * Convierte filas de inventario (con variantes) en líneas con stock existente (> 0).
 */
export function toExistingProductInventoryPrintLines(variantRows) {
  const lines = [];
  (variantRows || []).forEach((item) => {
    flattenInventoryVariantsToSizeRows([item]).forEach((r) => {
      if (!(r.quantity > 0)) return;
      lines.push({
        locationId: item.locationId ?? r.locationId,
        locationName: item.locationName || "Sin ubicación",
        locationCode: item.locationCode || "",
        productCode: item.productCode || "N/A",
        productName: item.productName || "N/A",
        colorName: r.colorName || "Sin color",
        size: r.size || "—",
        quantity: r.quantity,
      });
    });
  });
  return lines.sort(sortPrintLines);
}

function groupByLocation(lines) {
  const map = new Map();
  lines.forEach((line) => {
    const key = String(line.locationId ?? line.locationName ?? "SIN");
    if (!map.has(key)) {
      map.set(key, {
        locationName: line.locationName,
        locationCode: line.locationCode,
        rows: [],
        totalQty: 0,
      });
    }
    const group = map.get(key);
    group.rows.push(line);
    group.totalQty += line.quantity;
  });
  return Array.from(map.values());
}

function locationSection(group) {
  const code = group.locationCode ? ` (${escapeHtml(group.locationCode)})` : "";
  const body = group.rows
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.productCode)}</td>
      <td>${escapeHtml(r.productName)}</td>
      <td>${escapeHtml(r.colorName)}</td>
      <td>${escapeHtml(r.size)}</td>
      <td class="num">${formatQty(r.quantity)}</td>
    </tr>`
    )
    .join("");

  return `
    <section>
      <h2>${escapeHtml(group.locationName)}${code}</h2>
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Color</th>
            <th>Talla</th>
            <th>Cantidad</th>
          </tr>
        </thead>
        <tbody>
          ${body}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="4">Total bodega (${group.rows.length} línea${group.rows.length === 1 ? "" : "s"})</td>
            <td class="num">${formatQty(group.totalQty)}</td>
          </tr>
        </tfoot>
      </table>
    </section>`;
}

export function buildProductInventoryExistingPrintHtml(lines, { title } = {}) {
  const list = Array.isArray(lines) ? lines : [];
  const groups = groupByLocation(list);
  const grandTotal = list.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
  const heading = title || "Inventario de productos existentes";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(heading)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #222; margin: 18px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 18px 0 8px; }
    .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
    th { background: #f0f0f0; font-weight: 600; }
    tfoot td { font-weight: 700; background: #f8f9fa; }
    td.num { text-align: right; white-space: nowrap; }
    @media print { body { margin: 10px; } section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(heading)}</h1>
  <p class="meta">Generado: ${escapeHtml(formatNowGt())} · Solo productos con stock · ${list.length} línea(s) · Total: ${formatQty(grandTotal)}</p>
  ${groups.map(locationSection).join("") || "<p>Sin productos con stock.</p>"}
</body>
</html>`;
}

export function openProductInventoryExistingPrintWindow(html) {
  return openProductInventoryOutflowPrintWindow(html);
}
