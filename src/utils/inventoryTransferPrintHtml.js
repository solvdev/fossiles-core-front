import { escapeHtml } from "utils/shipmentPrintDocumentHtml";

function formatWhen(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-GT", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch (_e) {
    return escapeHtml(String(iso));
  }
}

function slipSection(t) {
  const type = t.productId ? "Producto" : t.materialId ? "Material" : "—";
  const item =
    t.productName || t.materialName || t.productCode || t.materialSku || "—";
  const color = t.colorName ? `<tr><th>Color</th><td>${escapeHtml(t.colorName)}</td></tr>` : "";
  return `
    <section class="slip">
      <h2>Boleta de traslado</h2>
      <table class="meta">
        <tr><th>ID</th><td>${escapeHtml(String(t.id ?? ""))}</td></tr>
        <tr><th>Boleta física</th><td>${escapeHtml(t.physicalSlipNumber || "—")}</td></tr>
        <tr><th>Código</th><td>${escapeHtml(t.code || "—")}</td></tr>
        <tr><th>Tipo</th><td>${escapeHtml(type)}</td></tr>
        <tr><th>Ítem</th><td>${escapeHtml(item)}</td></tr>
        ${color}
        <tr><th>Cantidad</th><td>${escapeHtml(String(t.quantity ?? ""))}</td></tr>
        <tr><th>Origen</th><td>${escapeHtml(t.fromLocationName || "")} ${t.fromLocationCode ? "(" + escapeHtml(t.fromLocationCode) + ")" : ""}</td></tr>
        <tr><th>Destino</th><td>${escapeHtml(t.toLocationName || "")} ${t.toLocationCode ? "(" + escapeHtml(t.toLocationCode) + ")" : ""}</td></tr>
        <tr><th>Estado</th><td>${escapeHtml(t.status || "")}</td></tr>
        <tr><th>Fecha</th><td>${escapeHtml(formatWhen(t.transferDate))}</td></tr>
        <tr><th>Motivo</th><td>${escapeHtml(t.reason || "—")}</td></tr>
        <tr><th>Creado por</th><td>${escapeHtml(t.createdByName || "—")}</td></tr>
      </table>
    </section>
  `;
}

export function getInventoryTransferSlipStyles() {
  return `
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #222; margin: 24px; }
    h1 { font-size: 18px; }
    h2 { font-size: 15px; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    .meta th { text-align: left; width: 140px; padding: 4px 8px; background: #f6f6f6; border: 1px solid #ddd; }
    .meta td { padding: 4px 8px; border: 1px solid #ddd; }
    hr { border: none; border-top: 1px dashed #999; margin: 24px 0; }
  `;
}

/** @param {any[]} transfers filas como en la tabla de transferencias */
export function buildInventoryTransfersPrintHtml(transfers) {
  const list = Array.isArray(transfers) ? transfers.filter(Boolean) : [];
  const inner = list.map((t, i) => (i > 0 ? "<hr/>" : "") + slipSection(t)).join("");
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Boleta(s) de traslado</title>
  <style>${getInventoryTransferSlipStyles()}</style>
</head>
<body>
  <h1>Boleta(s) de traslado (${list.length})</h1>
  ${inner}
</body>
</html>`;
}

export function openInventoryTransferPrintWindow(html) {
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
