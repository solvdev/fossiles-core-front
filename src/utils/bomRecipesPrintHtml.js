import { escapeHtml, getPrintOrientationToolbarHtml } from "./productionOrderPrintHtml";

function materialLabel(materialById, materialId) {
  const m = materialById?.[materialId];
  if (!m) return `ID ${materialId}`;
  const sku = m.sku ? String(m.sku) : "";
  const name = m.name ? String(m.name) : "";
  if (sku && name) return `${sku} — ${name}`;
  return name || sku || `ID ${materialId}`;
}

/**
 * HTML: una caja por BOM con encabezado y tabla de líneas.
 */
export function buildBomRecipesDocumentInnerHtml(bomsDetailed, materialById, productLabelFn, colorLabelFn) {
  const list = Array.isArray(bomsDetailed) ? bomsDetailed : [];
  if (list.length === 0) {
    return `<p>No hay BOMs para imprimir.</p>`;
  }

  return list
    .map((bom) => {
      const title = escapeHtml(bom?.bomName || "BOM");
      const product = escapeHtml(productLabelFn(bom));
      const color = escapeHtml(colorLabelFn(bom));
      const items = Array.isArray(bom?.items) ? bom.items : [];
      const rows =
        items.length === 0
          ? `<tr><td colspan="4">Sin líneas</td></tr>`
          : items
              .map((it) => {
                const mat = escapeHtml(materialLabel(materialById, it.materialId));
                const qty = it.quantity != null ? escapeHtml(String(it.quantity)) : "";
                const meas = it.measurement != null ? escapeHtml(String(it.measurement)) : "";
                const unit = escapeHtml(it.measurementUnit || "");
                return `<tr><td>${mat}</td><td class="numeric">${qty}</td><td class="numeric">${meas}</td><td>${unit}</td></tr>`;
              })
              .join("");

      return `
        <section class="bom-recipe-box">
          <header class="bom-recipe-header">
            <div class="bom-recipe-title">${title}</div>
            <div class="bom-recipe-meta"><strong>Producto:</strong> ${product} &nbsp;|&nbsp; <strong>Color:</strong> ${color}</div>
          </header>
          <table class="bom-recipe-table">
            <thead>
              <tr><th>Material</th><th>Cantidad</th><th>Medida</th><th>Unidad</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </section>`;
    })
    .join("");
}

export function openBomRecipesPrintWindow(innerHtml, title = "Recetas BOM") {
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style id="print-page-size"></style>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; font-size: 10px; color: #111; }
          .bom-recipe-box { border: 2px solid #111; margin: 0 0 14px; padding: 8px 10px 10px; page-break-inside: avoid; }
          .bom-recipe-header { border-bottom: 1px solid #333; margin-bottom: 8px; padding-bottom: 6px; }
          .bom-recipe-title { font-size: 13px; font-weight: 700; }
          .bom-recipe-meta { font-size: 10px; margin-top: 4px; color: #333; }
          .bom-recipe-table { width: 100%; border-collapse: collapse; }
          .bom-recipe-table th, .bom-recipe-table td { border: 1px solid #666; padding: 4px 6px; }
          .bom-recipe-table th { background: #f0f0f0; font-size: 9px; text-align: left; }
          .numeric { text-align: right; }
          @media print { .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        ${getPrintOrientationToolbarHtml()}
        <h2 style="margin:8px 0 12px;font-size:15px;">${escapeHtml(title)}</h2>
        ${innerHtml}
      </body>
    </html>
  `);
  win.document.close();
}
