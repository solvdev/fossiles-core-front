import { escapeHtml } from "./productionOrderPrintHtml";
import { formatDateGt } from "./dateTimeHelper";
import { compareColorNames } from "./colorOrder";

/** «32:2 · 34:4», ordenadas por talla. */
export function sizesText(sizes) {
  const entries = Object.entries(sizes || {}).filter(([, n]) => Number(n) > 0);
  entries.sort(([a], [b]) => (Number(a) - Number(b)) || String(a).localeCompare(String(b)));
  return entries.map(([s, n]) => `${s}:${n}`).join(" · ");
}

/** «OPV-64: 3 · OPV-65: 2». */
export function byOrderText(byOrder) {
  return Object.entries(byOrder || {}).map(([code, n]) => `${code}: ${n}`).join(" · ");
}

/** HTML de la hoja de una OP consolidada: productos sumados y de qué OP sale cada parte. */
export function productionOrderGroupSheetHtml(group) {
  const orders = group?.orders || [];
  // Por producto y, dentro de cada uno, Negro, Café, Tostado y Whisky primero.
  const lines = [...(group?.lines || [])].sort((a, b) =>
    String(a.productCode || "").localeCompare(String(b.productCode || ""), "es", { numeric: true, sensitivity: "base" })
    || compareColorNames(a.colorName, b.colorName));
  const rows = lines.map((l) => `
    <tr>
      <td><b>${escapeHtml(l.productCode || "")}</b> ${escapeHtml(l.productName || "")}</td>
      <td>${escapeHtml(l.colorName || "—")}</td>
      <td>${escapeHtml(l.brandName || "—")}</td>
      <td>${escapeHtml(sizesText(l.sizes) || "—")}</td>
      <td class="num">${l.quantity}</td>
      <td class="small">${escapeHtml(byOrderText(l.byOrder))}</td>
      <td class="chk"></td>
    </tr>`).join("");
  const orderRows = orders.map((o) => `
    <tr>
      <td><b>${escapeHtml(o.code)}</b></td>
      <td>${escapeHtml(o.customerName || "")}</td>
      <td>${o.deliveryDate ? escapeHtml(formatDateGt(o.deliveryDate)) : "—"}</td>
      <td class="num">${o.units}</td>
    </tr>`).join("");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(group?.code || "OP consolidada")}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #222; margin: 18px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .sub { color: #555; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      th, td { border: 1px solid #bbb; padding: 5px 6px; text-align: left; vertical-align: top; }
      th { background: #f1ecfb; }
      .num { text-align: right; white-space: nowrap; }
      .small { font-size: 11px; color: #444; }
      .chk { width: 28px; }
      .tot td { font-weight: bold; }
      .note { border: 1px dashed #999; padding: 6px 8px; margin-bottom: 12px; }
      @media print { .no-print { display: none; } body { margin: 8mm; } }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom:10px"><button onclick="window.print()">Imprimir</button></div>
    <h1>OP consolidada ${escapeHtml(group?.code || "")}</h1>
    <div class="sub">
      ${group?.family === "OPC" ? "Cinchos (OPC)" : "Marroquinería (OPV)"} · Luis Felipe ·
      ${orders.length} órdenes · ${group?.totalUnits || 0} unidades
      ${group?.deliveryDate ? ` · entrega más próxima ${escapeHtml(formatDateGt(group.deliveryDate))}` : ""}
    </div>
    ${group?.observations ? `<div class="note">${escapeHtml(group.observations)}</div>` : ""}
    <table>
      <thead><tr><th>Producto</th><th>Color</th><th>Marca</th><th>Tallas</th><th class="num">Total</th><th>Por OP</th><th>✓</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="7">Sin productos.</td></tr>`}
        <tr class="tot"><td colspan="4">Total</td><td class="num">${group?.totalUnits || 0}</td><td colspan="2"></td></tr>
      </tbody>
    </table>
    <table>
      <thead><tr><th>Orden</th><th>Cliente</th><th>Entrega</th><th class="num">Unidades</th></tr></thead>
      <tbody>${orderRows}</tbody>
    </table>
    <div class="small">Cada orden conserva su envío y su cobro: al empacar, separe las piezas según la columna «Por OP».</div>
  </body>
</html>`;
}

/**
 * Abre la hoja. La ventana se abre antes de esperar al servidor: si se abre después, el
 * navegador la bloquea por no venir de un clic.
 */
export async function openProductionOrderGroupSheet(loadGroup) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write("<p style='font-family:Arial'>Preparando la hoja…</p>");
  try {
    const group = await loadGroup();
    win.document.open();
    win.document.write(productionOrderGroupSheetHtml(group));
    win.document.close();
    return true;
  } catch (err) {
    win.close();
    throw err;
  }
}
