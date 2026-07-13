import { escapeHtml, getPrintOrientationToolbarHtml } from "./productionOrderPrintHtml";
import { formatDateGt } from "./dateTimeHelper";
import * as XLSX from "xlsx-js-style";

/** @param {{ rows: object[], colorColumns: { normKey: string, header: string }[], emptyMessage?: string|null, workDateYmd?: string, deskSupervisorLegend?: string }} model */
export function buildProductionTasksSheetTableHtml(model) {
  const { rows, colorColumns, emptyMessage, workDateYmd, deskSupervisorLegend } = model || {};
  const list = rows || [];
  const colors = colorColumns || [];
  const legendBlock =
    deskSupervisorLegend && String(deskSupervisorLegend).trim()
      ? `<p class="desk-legend" style="font-size:9px;line-height:1.35;margin:0 0 8px;color:#222;">${escapeHtml(
          deskSupervisorLegend
        )}</p>`
      : "";

  if (list.length === 0) {
    const msg = emptyMessage || "Sin tareas para listar.";
    const sub =
      workDateYmd != null
        ? `<p style="margin:4px 0 0;font-size:11px;color:#444;">Fecha de trabajo: ${escapeHtml(formatDateGt(workDateYmd))}</p>`
        : "";
    return `${legendBlock}<table class="tasks-sheet"><tbody><tr><td>${escapeHtml(msg)}</td></tr></tbody></table>${sub}`;
  }

  const headColors = colors
    .map((c) => `<th class="cell-qty">${escapeHtml(c.header)}</th>`)
    .join("");
  const bodyRows = list
    .map((row) => {
      const tipo = escapeHtml(row.tipo || "-");
      const op = escapeHtml(row.ops || "-");
      const mesas = escapeHtml(row.mesas || "-");
      const st = escapeHtml(row.estado || "-");
      const art = escapeHtml(row.article || "-");
      const colorCells = colors
        .map((col) => {
          const v = Number(row.qtyByNormKey?.[col.normKey] || 0);
          const show = v > 0 ? String(v) : "";
          return `<td class="cell-qty">${escapeHtml(show)}</td>`;
        })
        .join("");
      return `<tr><td class="cell-center">${tipo}</td><td class="cell-center">${op}</td><td class="cell-mesas">${mesas}</td><td class="cell-center">${st}</td><td class="cell-art">${art}</td>${colorCells}<td class="cell-obs cell-center"></td></tr>`;
    })
    .join("");

  const dateNote =
    workDateYmd != null
      ? `<p style="margin:4px 0 0;font-size:11px;color:#444;">Fecha de trabajo: ${escapeHtml(formatDateGt(workDateYmd))}</p>`
      : "";

  return `${legendBlock}
    <table class="tasks-sheet">
      <thead>
        <tr>
          <th class="cell-center">Tipo</th>
          <th class="cell-center">OP</th>
          <th class="cell-mesas">Mesas</th>
          <th class="cell-center">Estado</th>
          <th class="cell-art">Artículo</th>
          ${headColors}
          <th class="cell-obs cell-center">Observaciones</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>${dateNote}`;
}

export function openProductionTasksSheetPrintWindow(model, title = "Hoja de tareas") {
  const inner = buildProductionTasksSheetTableHtml(model);
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
          .tasks-sheet { width: 100%; border-collapse: collapse; table-layout: fixed; }
          .tasks-sheet th, .tasks-sheet td { border: 1px solid #555; padding: 4px 5px; vertical-align: middle; }
          .tasks-sheet thead th { text-align: center; }
          .tasks-sheet thead th.cell-art { text-align: left; }
          .tasks-sheet tbody td { text-align: center; }
          .tasks-sheet tbody td.cell-art { text-align: left; }
          .tasks-sheet th:not(.cell-art):not(.cell-obs) { background: #eef1f4; font-size: 9px; }
          .tasks-sheet th.cell-art { background: #eef1f4; font-size: 9px; }
          .tasks-sheet .cell-center { text-align: center; }
          .tasks-sheet .cell-art { width: 30%; min-width: 120px; }
          .tasks-sheet th.cell-mesas, .tasks-sheet td.cell-mesas {
            text-align: center;
            white-space: normal;
            width: auto;
            min-width: 72px;
            max-width: 140px;
            padding: 4px 4px;
            box-sizing: border-box;
          }
          .tasks-sheet th.cell-mesas { background: #eef1f4; }
          .tasks-sheet td.cell-mesas { background: #fff; }
          .tasks-sheet td.cell-qty {
            text-align: center;
            width: 26px;
            max-width: 30px;
            min-width: 24px;
            padding: 4px 2px;
            white-space: nowrap;
            box-sizing: border-box;
          }
          .tasks-sheet th.cell-qty {
            text-align: center;
            width: 52px;
            max-width: 64px;
            min-width: 44px;
            padding: 3px 2px;
            white-space: normal;
            font-size: 7.5px;
            line-height: 1.1;
            word-break: break-word;
            vertical-align: middle;
            box-sizing: border-box;
            background: #eef1f4;
          }
          .tasks-sheet th.cell-obs, .tasks-sheet td.cell-obs {
            min-width: 72px;
            width: 10%;
            height: 2.2em;
            background: #fff !important;
            text-align: center;
          }
          .tasks-sheet th.cell-obs { font-size: 9px; }
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

/**
 * Excel de la misma hoja de mesas (solo organizador de la fecha de trabajo).
 * @param {{ rows: object[], colorColumns: { normKey: string, header: string }[], workDateYmd?: string, deskSupervisorLegend?: string, emptyMessage?: string|null }} model
 */
export function downloadProductionTasksSheetExcel(model, fileName) {
  const { rows = [], colorColumns = [], workDateYmd, deskSupervisorLegend, emptyMessage } = model || {};
  const headers = [
    "Tipo",
    "OP",
    "Mesas",
    "Estado",
    "Artículo",
    ...colorColumns.map((c) => c.header),
    "Observaciones",
  ];
  const aoa = [headers];
  if (!rows.length) {
    aoa.push([emptyMessage || "Sin tareas del organizador para esta fecha."]);
  } else {
    rows.forEach((row) => {
      aoa.push([
        row.tipo || "",
        row.ops || "",
        row.mesas || "",
        row.estado || "",
        row.article || "",
        ...colorColumns.map((col) => {
          const v = Number(row.qtyByNormKey?.[col.normKey] || 0);
          return v > 0 ? v : "";
        }),
        "",
      ]);
    });
  }
  if (deskSupervisorLegend) {
    aoa.push([]);
    aoa.push(["Encargados", deskSupervisorLegend]);
  }
  if (workDateYmd) {
    aoa.push(["Fecha de trabajo", formatDateGt(workDateYmd)]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Mesas del día");
  const stamp = String(workDateYmd || "dia").replace(/-/g, "");
  XLSX.writeFile(wb, fileName || `hoja_mesas_${stamp}.xlsx`);
}
