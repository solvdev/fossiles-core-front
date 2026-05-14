import { escapeHtml, getPrintOrientationToolbarHtml } from "./productionOrderPrintHtml";

const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En proceso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

function taskStatusLabel(status) {
  const s = String(status || "").toUpperCase();
  return STATUS_LABELS[s] || status || "-";
}

function collectColorColumns(tasks) {
  const set = new Set();
  (tasks || []).forEach((t) => {
    if (!t || t.status === "CANCELLED") return;
    const cn = String(t.colorName || "").trim();
    if (cn) set.add(cn);
    (t.items || []).forEach((it) => {
      const c = String(it?.colorName || "").trim();
      if (c) set.add(c);
    });
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
}

function qtyForTaskColor(task, colorCol) {
  const items = task?.items || [];
  if (items.length > 0) {
    return items
      .filter((it) => String(it?.colorName || "").trim() === colorCol)
      .reduce((s, it) => s + Number(it?.quantity || 0), 0);
  }
  if (String(task?.colorName || "").trim() === colorCol) {
    return Number(task?.quantity || 0);
  }
  return 0;
}

function articleSummary(task) {
  const items = task?.items || [];
  if (items.length > 0) {
    const parts = items.map((it) => {
      const c = it?.productCode || "";
      const n = it?.productName || "";
      const q = it?.quantity != null ? ` (${it.quantity})` : "";
      if (c && n) return `${c} ${n}${q}`;
      return (c || n || "?") + q;
    });
    return Array.from(new Set(parts)).join("; ");
  }
  const c = task?.productCode || "";
  const n = task?.productName || "";
  if (c && n) return `${c} ${n}`;
  return c || n || "-";
}

/**
 * Tabla principal para la hoja de tareas del centro de producción.
 */
export function buildProductionTasksSheetTableHtml(tasks) {
  const list = (tasks || []).filter((t) => t && t.status !== "CANCELLED");
  const colors = collectColorColumns(list);

  if (list.length === 0) {
    return `<table class="tasks-sheet"><tbody><tr><td>Sin tareas para listar.</td></tr></tbody></table>`;
  }

  const headColors = colors.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const rows = list
    .map((task) => {
      const op = escapeHtml(task.productionOrderCode || "-");
      const st = escapeHtml(taskStatusLabel(task.status));
      const art = escapeHtml(articleSummary(task));
      const colorCells = colors
        .map((col) => {
          const v = qtyForTaskColor(task, col);
          const show = v > 0 ? String(v) : "";
          return `<td class="numeric">${escapeHtml(show)}</td>`;
        })
        .join("");
      return `<tr><td>${op}</td><td>${st}</td><td class="cell-art">${art}</td>${colorCells}<td class="cell-obs"></td></tr>`;
    })
    .join("");

  return `
    <table class="tasks-sheet">
      <thead>
        <tr>
          <th>OP</th>
          <th>Estado</th>
          <th>Artículo</th>
          ${headColors}
          <th class="cell-obs">Observaciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function openProductionTasksSheetPrintWindow(tasks, title = "Hoja de tareas") {
  const inner = buildProductionTasksSheetTableHtml(tasks);
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
          .tasks-sheet { width: 100%; border-collapse: collapse; table-layout: auto; }
          .tasks-sheet th, .tasks-sheet td { border: 1px solid #555; padding: 4px 5px; vertical-align: top; }
          .tasks-sheet th { background: #eef1f4; text-align: center; font-size: 9px; }
          .tasks-sheet .cell-art { text-align: left; max-width: 220px; }
          .tasks-sheet .cell-obs { min-width: 120px; height: 2.2em; background: #fafafa; }
          .numeric { text-align: right; white-space: nowrap; }
          @media print { .no-print { display: none !important; } }
        </style>
      </head>
      <body>
        ${getPrintOrientationToolbarHtml()}
        <h2 style="margin:8px 0 10px;font-size:14px;">${escapeHtml(title)}</h2>
        ${inner}
      </body>
    </html>
  `);
  win.document.close();
}
