import { escapeHtml } from "./productionOrderPrintHtml";

const ORDER_TYPE_LABELS = {
  NORMAL: "Kiosko",
  DISTRIBUTION: "Distribución",
  VENTA_EN_LINEA: "Venta en línea",
  CLIENTE_KIOSKO: "Cliente kiosko",
  CINCHOS: "Cinchos",
  CINCHOS_FOSSILES: "Cinchos Fossiles",
  CINCHOS_MARCAS: "Cinchos marcas",
  MARCAS: "Marcas",
  INTERNA: "Interna (OPI)",
};

const WORKFLOW_LABELS = {
  PENDING_LEATHER: "Pendiente cuero",
  PENDING_DIE_CUT: "Pendiente troquelado",
  PENDING_TABLE_ENTRY: "Pendiente entrada a mesa",
  PENDING_MATERIAL_DELIVERY: "Pendiente entrega materiales",
  READY_TO_START: "Lista para iniciar",
  IN_PRODUCTION: "En producción",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

function orderTypeLabel(ot) {
  const k = String(ot || "").trim().toUpperCase();
  return ORDER_TYPE_LABELS[k] || ot || "—";
}

function workflowLabel(wf) {
  const k = String(wf || "").trim().toUpperCase();
  return WORKFLOW_LABELS[k] || wf || "—";
}

function formatDateHeading(iso) {
  if (!iso) return "";
  const parts = String(iso).split("T")[0].split("-");
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return String(iso);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("es-GT", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function fmtQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? "—");
  return v.toLocaleString("es-GT", { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

/**
 * HTML del cuerpo: recetas BOM por tarea/producto para el día (tareas programadas;
 * incluye productos con materiales ya entregados para que el listado coincida con la pantalla).
 * @param {Array<Record<string, unknown>>} tasks
 */
export function buildMaterialsDayRecipesBodyHtml(tasks) {
  const list = (tasks || []).filter((t) => t && String(t.status || "").toUpperCase() !== "CANCELLED");
  if (list.length === 0) {
    return `<p class="empty">No hay tareas programadas para esta fecha.</p>`;
  }

  const sorted = [...list].sort((a, b) => {
    const opA = String(a.productionOrderCode || "").localeCompare(String(b.productionOrderCode || ""), "es");
    if (opA !== 0) return opA;
    return String(a.taskCode || "").localeCompare(String(b.taskCode || ""), "es");
  });

  const blocks = sorted
    .map((task) => {
      const products = (task.products || []).filter((p) => {
        if (!p) return false;
        if (p.requiresMaterials === false) return false;
        return (p.recipe || []).length > 0;
      });
      if (products.length === 0) return "";

      const op = escapeHtml(task.productionOrderCode || "—");
      const tc = escapeHtml(task.taskCode || `Tarea #${task.taskId}`);
      const ot = escapeHtml(orderTypeLabel(task.orderType));
      const wf = escapeHtml(workflowLabel(task.workflowStatus));
      const st = escapeHtml(String(task.status || "—"));

      const productBlocks = products
        .map((p) => {
          const delivered = Boolean(p.materialsDelivered);
          const code = escapeHtml((p.productCode || "").trim() || "—");
          const name = escapeHtml(p.productName || "—");
          const color = p.colorName ? escapeHtml(String(p.colorName)) : "";
          const qty = fmtQty(p.quantity ?? 0);
          const rows = (p.recipe || [])
            .map((m) => {
              const sku = escapeHtml((m.materialSku || `#${m.materialId}`).trim());
              const mat = escapeHtml(m.materialName || "—");
              const req = escapeHtml(fmtQty(m.totalQuantity));
              const unit = escapeHtml(m.measurementUnit || "—");
              const disp =
                m.availableStock != null && m.availableStock !== ""
                  ? escapeHtml(fmtQty(m.availableStock))
                  : "—";
              const warn =
                m.sufficientStock === false
                  ? '<span class="warn">Stock bajo</span>'
                  : '<span class="ok">OK</span>';
              const picked = m.picked ? "✓" : "";
              return `<tr><td>${picked}</td><td>${sku}</td><td>${mat}</td><td class="num">${req}</td><td>${unit}</td><td class="num">${disp}</td><td>${warn}</td></tr>`;
            })
            .join("");

          return `
            <div class="product${delivered ? " product--delivered" : ""}">
              <div class="product-head">
                <strong>${code}</strong> — ${name}
                ${color ? ` <span class="muted">· ${color}</span>` : ""}
                <span class="qty">Cant. ${escapeHtml(qty)}${
                  delivered ? ' <span class="tag-ent">Materiales entregados</span>' : ""
                }</span>
              </div>
              <table class="recipe">
                <thead>
                  <tr>
                    <th class="chk">Prep.</th>
                    <th>SKU</th>
                    <th>Material</th>
                    <th class="num">Requerido</th>
                    <th>U.</th>
                    <th class="num">Disp.</th>
                    <th>Inv.</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </div>`;
        })
        .join("");

      if (!productBlocks.trim()) return "";

      return `
        <section class="task-block">
          <header class="task-head">
            <div><span class="label">OP</span> ${op}</div>
            <div><span class="label">Tarea</span> ${tc}</div>
            <div><span class="label">Tipo OP</span> ${ot}</div>
            <div><span class="label">Workflow</span> ${wf}</div>
            <div><span class="label">Estado</span> ${st}</div>
          </header>
          ${productBlocks}
        </section>`;
    })
    .filter(Boolean)
    .join("");

  if (!blocks.trim()) {
    return `<p class="empty">No hay líneas de receta (BOM) para las tareas de esta fecha.</p>`;
  }

  return blocks;
}

/**
 * Abre ventana de impresión con recetas del día (solo datos ya cargados o pasados).
 * @param {Array<Record<string, unknown>>} tasks
 * @param {string} dateIso YYYY-MM-DD
 */
export function openMaterialsDayRecipesPrintWindow(tasks, dateIso) {
  const title = `Recetas materiales — ${dateIso || ""}`;
  const heading = formatDateHeading(dateIso);
  const body = buildMaterialsDayRecipesBodyHtml(tasks);
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 14px 16px 24px; color: #111; font-size: 11px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .sub { color: #555; font-size: 12px; margin-bottom: 14px; }
    .empty { color: #666; font-size: 13px; }
    .task-block { margin-bottom: 18px; border: 1px solid #ccc; border-radius: 6px; padding: 10px 12px; }
    .task-head { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #e0e0e0; font-size: 11px; }
    .task-head .label { color: #666; font-weight: 600; margin-right: 4px; }
    .product { margin-top: 10px; }
    .product-head { margin-bottom: 6px; font-size: 11px; }
    .product-head .muted { color: #555; }
    .product-head .qty { float: right; font-weight: 700; }
    table.recipe { width: 100%; border-collapse: collapse; font-size: 10px; }
    table.recipe th, table.recipe td { border: 1px solid #bbb; padding: 4px 5px; vertical-align: top; }
    table.recipe th { background: #f0f3f6; text-align: left; }
    table.recipe .num { text-align: right; white-space: nowrap; }
    table.recipe .chk { width: 36px; text-align: center; }
    .warn { color: #b71c1c; font-weight: 700; }
    .ok { color: #2e7d32; }
    .product--delivered { opacity: 0.92; }
    .tag-ent { font-size: 9px; font-weight: 700; color: #1565c0; margin-left: 6px; }
    @media print {
      body { padding: 8px; }
      /* avoid: el navegador podía omitir bloques largos que no cabían en una página */
      .task-block { break-inside: auto; page-break-inside: auto; }
      .product { break-inside: auto; page-break-inside: auto; }
    }
  </style>
</head>
<body>
  <h1>Recetas del día — bodega materiales</h1>
  <div class="sub">${escapeHtml(heading)} · <strong>Todas</strong> las tareas con fecha de programación en este día (incluye materiales ya entregados). Cola del día actual según el servidor.</div>
  ${body}
  <script>window.onload=function(){window.print();}</script>
</body>
</html>`);
  win.document.close();
}
