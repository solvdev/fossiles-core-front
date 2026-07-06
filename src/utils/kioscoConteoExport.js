import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";

const COUNT_LOCATION_KEYS = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "E", "BO"];
const DIFF_ALERT_THRESHOLD = 3;

const COLORS = {
  border: "D1D5DB",
  titleBg: "DBEAFE",
  metaBg: "F9FAFB",
  tableHeaderBg: "F3F4F6",
  categoryBg: "E5E7EB",
  subtotalBg: "F9FAFB",
  totalBg: "1F2937",
  totalText: "FFFFFF",
  alertBg: "FEF2F2",
  diffBad: "DC2626",
  diffOk: "16A34A",
  zebraBg: "FAFAFA",
};

const thinBorder = {
  top: { style: "thin", color: { rgb: COLORS.border } },
  right: { style: "thin", color: { rgb: COLORS.border } },
  bottom: { style: "thin", color: { rgb: COLORS.border } },
  left: { style: "thin", color: { rgb: COLORS.border } },
};

const fillStyle = (rgb) => ({ fgColor: { rgb } });

const KARDEX_HEADERS = [
  { key: "inventarioInicial", label: "Ini." },
  { key: "comprasAjustes", label: "Comp." },
  { key: "anulacionCompras", label: "A.C." },
  { key: "entradas", label: "Ent." },
  { key: "ventas", label: "Vtas." },
  { key: "anulacionVenta", label: "A.V." },
  { key: "salida", label: "Sal." },
  { key: "inventarioFinal", label: "Fin." },
];

const escape = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function buildHeaderRows(report) {
  return [
    ["Conteo físico de inventario kiosco"],
    ["Kiosko", report.locationName || report.locationCode || "—"],
    ["Período", `${report.periodFrom || ""} a ${report.periodTo || ""}`],
    ["Estado", report.status || "—"],
    ["Generado por", report.generatedByName || "—"],
    ["Generado el", report.generatedAt ? String(report.generatedAt).slice(0, 19).replace("T", " ") : "—"],
    ["Revisado por", report.reviewedByName || "Pendiente"],
    ["Notas", report.notes || ""],
    ["Exportado", formatNowGt()],
    [],
  ];
}

function buildTableHeaders(showKardex) {
  const headers = ["Código", "Producto", "Color", "Tallas"];
  if (showKardex) {
    KARDEX_HEADERS.forEach((col) => headers.push(col.label));
  }
  COUNT_LOCATION_KEYS.forEach((k) => headers.push(k));
  headers.push("Total físico", "Diferencia");
  return headers;
}

function buildDataRow(row, showKardex) {
  const cells = [
    row.productCode || "",
    row.productName || "",
    row.colorName || "—",
    row.sizesSummary || "",
  ];
  if (showKardex) {
    KARDEX_HEADERS.forEach((col) => cells.push(row[col.key] ?? 0));
  }
  COUNT_LOCATION_KEYS.forEach((k) => cells.push((row.counts || {})[k] ?? 0));
  cells.push(row.total ?? 0, row.diferencia ?? 0);
  return cells;
}

function buildSubtotalRow(label, sub, showKardex) {
  const cells = label === "TOTAL GENERAL" ? [label, "", "", ""] : ["", label, "", ""];
  if (showKardex) {
    KARDEX_HEADERS.forEach((col) => cells.push(sub[col.key] ?? 0));
  }
  COUNT_LOCATION_KEYS.forEach((k) => cells.push((sub.counts || {})[k] ?? 0));
  cells.push(sub.total ?? 0, sub.diferencia ?? 0);
  return cells;
}

function buildSheetRows(report, showKardex) {
  const rows = [...buildHeaderRows(report)];
  rows.push(buildTableHeaders(showKardex));

  (report.categories || []).forEach((cat) => {
    const titleRow = new Array(buildTableHeaders(showKardex).length).fill("");
    titleRow[0] = cat.categoryName || "Sin categoría";
    rows.push(titleRow);

    (cat.rows || []).forEach((row) => {
      rows.push(buildDataRow(row, showKardex));
    });

    if (cat.subtotal) {
      rows.push(buildSubtotalRow(`Subtotal — ${cat.categoryName || ""}`, cat.subtotal, showKardex));
    }
    rows.push([]);
  });

  if (report.totalGeneral) {
    rows.push(buildSubtotalRow("TOTAL GENERAL", report.totalGeneral, showKardex));
  }
  return rows;
}

const NUMERIC_COL_START = 4;

function ensureCell(ws, rowIdx, colIdx, value) {
  const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
  if (!ws[cellRef]) {
    ws[cellRef] = { t: "s", v: value ?? "" };
  }
  return cellRef;
}

function styleCell(ws, rowIdx, colIdx, style) {
  const cellRef = ensureCell(ws, rowIdx, colIdx, "");
  ws[cellRef].s = { ...(ws[cellRef].s || {}), ...style };
}

function styleRowRange(ws, rowIdx, colCount, style) {
  for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
    styleCell(ws, rowIdx, colIdx, style);
  }
}

function applySheetLayout(ws, showKardex, merges) {
  const colCount = buildTableHeaders(showKardex).length;

  ws["!merges"] = merges;
  ws["!cols"] = Array.from({ length: colCount }, (_, i) => ({
    wch: i === 1 ? 28 : i >= NUMERIC_COL_START && i < colCount - 2 ? 8 : 14,
  }));
}

function applyConteoSheetStyles(ws, report, showKardex) {
  const colCount = buildTableHeaders(showKardex).length;
  const diffCol = colCount - 1;
  const headerOffset = buildHeaderRows(report).length;
  const merges = [{ s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } }];

  applySheetLayout(ws, showKardex, merges);

  styleRowRange(ws, 0, colCount, {
    font: { name: "Arial", sz: 13, bold: true, color: { rgb: "1E3A8A" } },
    alignment: { vertical: "center", horizontal: "center" },
    border: thinBorder,
    fill: fillStyle(COLORS.titleBg),
  });
  ws["!rows"] = [{ hpt: 28 }];

  for (let rowIdx = 1; rowIdx < headerOffset - 1; rowIdx += 1) {
    styleCell(ws, rowIdx, 0, {
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "374151" } },
      alignment: { vertical: "center", horizontal: "left" },
      border: thinBorder,
      fill: fillStyle(COLORS.metaBg),
    });
    styleCell(ws, rowIdx, 1, {
      font: { name: "Arial", sz: 10, color: { rgb: "111827" } },
      alignment: { vertical: "center", horizontal: "left", wrapText: true },
      border: thinBorder,
      fill: fillStyle(COLORS.metaBg),
    });
  }

  styleRowRange(ws, headerOffset, colCount, {
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "111827" } },
    alignment: { vertical: "center", horizontal: "center", wrapText: true },
    border: thinBorder,
    fill: fillStyle(COLORS.tableHeaderBg),
  });

  let rowIdx = headerOffset + 1;
  (report.categories || []).forEach((cat) => {
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: colCount - 1 } });
    styleRowRange(ws, rowIdx, colCount, {
      font: { name: "Arial", sz: 10, bold: true, color: { rgb: "111827" } },
      alignment: { vertical: "center", horizontal: "left" },
      border: thinBorder,
      fill: fillStyle(COLORS.categoryBg),
    });
    rowIdx += 1;

    (cat.rows || []).forEach((row, rowIndex) => {
      const isAlert = Math.abs(row.diferencia ?? 0) >= DIFF_ALERT_THRESHOLD;
      const isZebra = rowIndex % 2 === 1;
      const rowFill = isAlert ? COLORS.alertBg : isZebra ? COLORS.zebraBg : "FFFFFF";
      const diffColor = (row.diferencia ?? 0) !== 0 ? COLORS.diffBad : COLORS.diffOk;

      for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
        const isNumeric = colIdx >= NUMERIC_COL_START;
        styleCell(ws, rowIdx, colIdx, {
          font: {
            name: "Arial",
            sz: 10,
            bold: colIdx === diffCol,
            color: { rgb: colIdx === diffCol ? diffColor : "111827" },
          },
          alignment: {
            vertical: "center",
            horizontal: isNumeric ? "right" : "left",
            wrapText: colIdx === 1,
          },
          border: thinBorder,
          fill: fillStyle(rowFill),
        });
      }
      rowIdx += 1;
    });

    if (cat.subtotal) {
      for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
        const isNumeric = colIdx >= NUMERIC_COL_START;
        styleCell(ws, rowIdx, colIdx, {
          font: { name: "Arial", sz: 10, bold: true, color: { rgb: "111827" } },
          alignment: {
            vertical: "center",
            horizontal: isNumeric ? "right" : "left",
            wrapText: colIdx === 1,
          },
          border: thinBorder,
          fill: fillStyle(COLORS.subtotalBg),
        });
      }
      rowIdx += 1;
    }

    rowIdx += 1;
  });

  if (report.totalGeneral) {
    merges.push({ s: { r: rowIdx, c: 0 }, e: { r: rowIdx, c: 2 } });
    ws["!merges"] = merges;

    const totalDiff = report.totalGeneral.diferencia ?? 0;
    const totalDiffColor = totalDiff !== 0 ? "FCA5A5" : "86EFAC";

    for (let colIdx = 0; colIdx < colCount; colIdx += 1) {
      const isNumeric = colIdx >= NUMERIC_COL_START;
      styleCell(ws, rowIdx, colIdx, {
        font: {
          name: "Arial",
          sz: 10,
          bold: true,
          color: { rgb: colIdx === diffCol ? totalDiffColor : COLORS.totalText },
        },
        alignment: {
          vertical: "center",
          horizontal: colIdx < 3 ? "left" : isNumeric ? "right" : "left",
        },
        border: thinBorder,
        fill: fillStyle(COLORS.totalBg),
      });
    }
  } else {
    ws["!merges"] = merges;
  }
}

export function exportConteoToExcel(report, { showKardex = true } = {}) {
  const rows = buildSheetRows(report, showKardex);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  applyConteoSheetStyles(ws, report, showKardex);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Conteo físico");

  const suffix = `${report.locationCode || "kiosko"}_${report.periodFrom || ""}_${report.periodTo || ""}`;
  XLSX.writeFile(wb, `Conteo_Fisico_${suffix}.xlsx`);
}

export function exportConteoToPdf(report, { showKardex = true } = {}) {
  const win = window.open("", "_blank");
  if (!win) return;

  const headerMeta = `
    <div class="meta-grid">
      <div><span>Kiosko</span><strong>${escape(report.locationName || report.locationCode || "—")}</strong></div>
      <div><span>Período</span><strong>${escape(report.periodFrom || "")} – ${escape(report.periodTo || "")}</strong></div>
      <div><span>Estado</span><strong>${escape(report.status || "—")}</strong></div>
      <div><span>Generado por</span><strong>${escape(report.generatedByName || "—")}</strong></div>
      <div><span>Revisado por</span><strong>${escape(report.reviewedByName || "Pendiente")}</strong></div>
      ${report.notes ? `<div class="full"><span>Notas</span><strong>${escape(report.notes)}</strong></div>` : ""}
    </div>
  `;

  const kardexHeaders = showKardex
    ? KARDEX_HEADERS.map((col) => `<th>${escape(col.label)}</th>`).join("")
    : "";
  const countHeaders = COUNT_LOCATION_KEYS.map((k) => `<th>${escape(k)}</th>`).join("");
  const colSpan = 4 + (showKardex ? KARDEX_HEADERS.length : 0) + COUNT_LOCATION_KEYS.length + 2;

  const theadHtml = `
    <tr>
      <th>Código</th><th>Producto</th><th>Color</th><th>Tallas</th>
      ${kardexHeaders}
      ${countHeaders}
      <th>Total</th><th>Dif.</th>
    </tr>
  `;

  const renderRow = (row, style = "") => {
    const kardexCells = showKardex
      ? KARDEX_HEADERS.map((col) => `<td class="num">${row[col.key] ?? 0}</td>`).join("")
      : "";
    const counts = COUNT_LOCATION_KEYS.map((k) => `<td class="num">${(row.counts || {})[k] ?? 0}</td>`).join("");
    const difClass = (row.diferencia ?? 0) !== 0 ? "dif-bad" : "dif-ok";
    const alertClass = Math.abs(row.diferencia ?? 0) >= DIFF_ALERT_THRESHOLD ? "alert-row" : "";
    return `<tr class="${alertClass}" style="${escape(style)}">
      <td>${escape(row.productCode || "")}</td>
      <td>${escape(row.productName || "")}</td>
      <td>${escape(row.colorName || "—")}</td>
      <td>${escape(row.sizesSummary || "")}</td>
      ${kardexCells}
      ${counts}
      <td class="num bold">${row.total ?? 0}</td>
      <td class="num bold ${difClass}">${row.diferencia ?? 0}</td>
    </tr>`;
  };

  let tbodyHtml = "";
  (report.categories || []).forEach((cat) => {
    tbodyHtml += `<tr class="cat-header"><td colspan="${colSpan}">${escape(cat.categoryName || "Sin categoría")}</td></tr>`;
    (cat.rows || []).forEach((row) => {
      tbodyHtml += renderRow(row);
    });
    if (cat.subtotal) {
      tbodyHtml += renderRow(
        { ...cat.subtotal, productCode: "", productName: `Subtotal — ${cat.categoryName || ""}`, colorName: "", sizesSummary: "" },
        "font-weight:600;background:#f9fafb"
      );
    }
  });

  const tg = report.totalGeneral;
  const tfootHtml = tg ? `<tfoot>
    <tr class="total-general">
      <td colspan="4">TOTAL GENERAL</td>
      ${showKardex ? KARDEX_HEADERS.map((col) => `<td class="num">${tg[col.key] ?? 0}</td>`).join("") : ""}
      ${COUNT_LOCATION_KEYS.map((k) => `<td class="num">${(tg.counts || {})[k] ?? 0}</td>`).join("")}
      <td class="num bold">${tg.total ?? 0}</td>
      <td class="num bold ${(tg.diferencia ?? 0) !== 0 ? "dif-bad" : "dif-ok"}">${tg.diferencia ?? 0}</td>
    </tr>
  </tfoot>` : "";

  win.document.write(`<!doctype html><html><head>
    <meta charset="utf-8"/>
    <title>Conteo Físico — ${escape(report.locationName || "")}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 12px; color: #111; }
      h1 { font-size: 15px; margin: 0 0 8px; }
      .meta-grid { display: flex; flex-wrap: wrap; gap: 8px 24px; margin-bottom: 12px; font-size: 11px; }
      .meta-grid div span { display: block; color: #666; font-size: 10px; }
      .meta-grid div.full { width: 100%; }
      table { width: 100%; border-collapse: collapse; font-size: 10px; }
      th, td { border: 1px solid #d1d5db; padding: 3px 5px; }
      th { background: #f3f4f6; font-weight: 700; text-align: center; }
      .num { text-align: right; }
      .bold { font-weight: 700; }
      .cat-header td { background: #e5e7eb; font-weight: 700; font-size: 10px; }
      .total-general td { background: #1f2937; color: #fff; font-weight: 700; }
      .dif-bad { color: #dc2626; }
      .dif-ok { color: #16a34a; }
      .alert-row td { background: #fef2f2; }
      @media print { body { margin: 6mm; } }
    </style>
  </head><body>
    <h1>Conteo Físico de Inventario — ${escape(report.locationName || report.locationCode || "")}</h1>
    ${headerMeta}
    <table>
      <thead>${theadHtml}</thead>
      <tbody>${tbodyHtml || `<tr><td colspan="${colSpan}" style="text-align:center">Sin datos</td></tr>`}</tbody>
      ${tfootHtml}
    </table>
    <script>window.onload = function(){ window.print(); };</script>
  </body></html>`);
  win.document.close();
}
