import * as XLSX from "xlsx-js-style";
import { boldFont, thinBorder } from "./kioskReportExcelStyle";
import { formatDateGt, formatDateTimeGt, formatNowGt } from "./dateTimeHelper";
import { escapeHtml } from "./shipmentPrintDocumentHtml";
import { formatPackingItemLabel, getShipmentPackingItems } from "./shipmentPackingHelper";

/**
 * Pestaña «Envíos» de Kioscos: etiquetas de estado, filtros y exportación a PDF (ventana de impresión)
 * y Excel de los envíos de un kiosko. Todo lo que no toca el navegador es función pura.
 */

// ---------------------------------------------------------------------------
// Estados
// ---------------------------------------------------------------------------

/** Grupos que ve el usuario en los filtros; cada uno agrupa varios estados técnicos. */
export const SHIPMENT_STATUS_GROUPS = [
  { key: "ALL", label: "Todos", statuses: null },
  { key: "TRANSIT", label: "En tránsito", statuses: ["SENT"], color: "warning" },
  { key: "RECEIVED", label: "Recibidos", statuses: ["DELIVERED", "RECEIVED", "COMPLETED"], color: "success" },
  { key: "PREP", label: "En preparación", statuses: ["DRAFT", "CONFIRMED"], color: "info" },
  { key: "CANCELLED", label: "Cancelados", statuses: ["CANCELLED", "CANCELED"], color: "danger" },
];

const STATUS_META = {
  DRAFT: { label: "Borrador", color: "secondary" },
  CONFIRMED: { label: "Listo para enviar", color: "info" },
  SENT: { label: "En tránsito", color: "warning" },
  DELIVERED: { label: "Entregado", color: "primary" },
  RECEIVED: { label: "Recibido", color: "success" },
  COMPLETED: { label: "Recibido", color: "success" },
  CANCELLED: { label: "Cancelado", color: "danger" },
  CANCELED: { label: "Cancelado", color: "danger" },
};

const normStatus = (status) => String(status || "").trim().toUpperCase();

export const shipmentStatusMeta = (status) =>
  STATUS_META[normStatus(status)] || { label: status || "—", color: "secondary" };

export const shipmentMatchesGroup = (shipment, groupKey) => {
  const group = SHIPMENT_STATUS_GROUPS.find((g) => g.key === groupKey);
  if (!group || !group.statuses) return true;
  return group.statuses.includes(normStatus(shipment?.status));
};

// ---------------------------------------------------------------------------
// Datos derivados
// ---------------------------------------------------------------------------

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Fecha con la que se ordena y se muestra el envío: cuando salió, o cuando se creó si aún no sale. */
export const shipmentDate = (shipment) => shipment?.sentAt || shipment?.createdAt || null;

export const shipmentLines = (shipment) => (Array.isArray(shipment?.products) ? shipment.products : []);

export const shipmentPieces = (shipment) => shipmentLines(shipment).reduce((s, l) => s + num(l.quantity), 0);

/** true si alguna línea ya trae cantidad recibida (se muestran las columnas de recepción). */
export const shipmentHasReceipt = (shipment) =>
  shipmentLines(shipment).some((l) => l.quantityReceived != null);

export const shipmentReceivedPieces = (shipment) =>
  shipmentLines(shipment).reduce((s, l) => s + num(l.quantityReceived), 0);

/** Tipo de herraje / marca solo cuando aporta (NUEVO / VIEJO / marca OPV). */
export const lineVariantLabel = (line) => {
  const parts = [];
  const hw = String(line?.hardwareCondition || "").trim();
  if (hw) parts.push(hw.charAt(0).toUpperCase() + hw.slice(1).toLowerCase());
  const brand = String(line?.brandName || "").trim();
  if (brand) parts.push(brand);
  return parts.join(" · ");
};

/** Texto de la ruta de origen: distribución u orden de producción. */
export const shipmentOriginLabel = (shipment) =>
  [shipment?.distributionNumber, shipment?.productionOrderCode].filter(Boolean).join(" · ");

/** Texto sobre el que busca el cuadro «Buscar» (número, origen, productos, colores, notas). */
export const shipmentSearchText = (shipment) =>
  [
    shipment?.shipmentNumber,
    shipment?.distributionNumber,
    shipment?.productionOrderCode,
    shipment?.createdByName,
    shipment?.notes,
    ...shipmentLines(shipment).flatMap((l) => [l.productCode, l.productName, l.colorName, l.size]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const filterShipments = (shipments, { groupKey = "ALL", query = "" } = {}) => {
  const q = String(query || "").trim().toLowerCase();
  return (shipments || []).filter(
    (s) => shipmentMatchesGroup(s, groupKey) && (!q || shipmentSearchText(s).includes(q))
  );
};

/** Conteo por grupo de estado, sobre la lista ya filtrada por búsqueda. */
export const countByGroup = (shipments) => {
  const counts = {};
  SHIPMENT_STATUS_GROUPS.forEach((g) => {
    counts[g.key] = (shipments || []).filter((s) => shipmentMatchesGroup(s, g.key)).length;
  });
  return counts;
};

// ---------------------------------------------------------------------------
// Nombres de archivo
// ---------------------------------------------------------------------------

export const safeFileName = (text) =>
  String(text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");

export const buildExportFileName = (shipments, kioskName, range, ext) => {
  const kiosk = safeFileName(kioskName) || "Kiosko";
  if ((shipments || []).length === 1) {
    return `Envio_${safeFileName(shipments[0].shipmentNumber || shipments[0].id)}_${kiosk}.${ext}`;
  }
  const from = range?.from || "";
  const to = range?.to || "";
  return `Envios_${kiosk}${from ? `_${from}` : ""}${to ? `_a_${to}` : ""}.${ext}`;
};

// ---------------------------------------------------------------------------
// PDF (documento imprimible, un envío por hoja)
// ---------------------------------------------------------------------------

const PRINT_STYLES = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #1f2937; margin: 0; }
  .doc { padding: 22px 26px; page-break-after: always; }
  .doc:last-child { page-break-after: auto; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111827; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #6b7280; font-weight: 700; }
  .title { font-size: 22px; font-weight: 800; margin: 2px 0 0; }
  .pill { display: inline-block; border: 1.5px solid #111827; border-radius: 999px; padding: 3px 12px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 16px; margin-bottom: 16px; }
  .cell .k { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 700; }
  .cell .v { font-size: 13px; font-weight: 600; margin-top: 1px; }
  table.lines { width: 100%; border-collapse: collapse; }
  table.lines th { background: #e5e7eb; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 7px; border: 1px solid #9ca3af; }
  table.lines td { padding: 6px 7px; border: 1px solid #d1d5db; vertical-align: top; }
  table.lines tbody tr:nth-child(even) td { background: #f9fafb; }
  table.lines .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  table.lines .c { text-align: center; }
  table.lines tfoot td { font-weight: 800; background: #f3f4f6; border-top: 2px solid #111827; }
  .muted { color: #6b7280; font-size: 10.5px; }
  .diff-neg { color: #b91c1c; font-weight: 700; }
  .diff-pos { color: #047857; font-weight: 700; }
  h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; margin: 16px 0 6px; color: #374151; }
  .box { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 10px; background: #fafafa; white-space: pre-wrap; }
  ul.pack { margin: 0; padding-left: 18px; }
  .sign { display: flex; gap: 28px; margin-top: 46px; }
  .sign div { flex: 1; border-top: 1px solid #111827; padding-top: 4px; text-align: center; font-size: 10.5px; color: #374151; }
  .foot { margin-top: 14px; font-size: 9.5px; color: #9ca3af; text-align: right; }
  .summary-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .summary-table th { background: #e5e7eb; text-align: left; font-size: 10px; text-transform: uppercase; padding: 6px 7px; border: 1px solid #9ca3af; }
  .summary-table td { padding: 6px 7px; border: 1px solid #d1d5db; }
  .summary-table .n { text-align: right; }
  .summary-table tfoot td { font-weight: 800; background: #f3f4f6; border-top: 2px solid #111827; }
  @page { size: letter; margin: 10mm; }
  @media print { .doc { padding: 0; } }
`;

const cell = (label, value) =>
  `<div class="cell"><div class="k">${escapeHtml(label)}</div><div class="v">${escapeHtml(value || "—")}</div></div>`;

const diffCell = (line) => {
  const d = line.quantityDifference != null ? num(line.quantityDifference) : num(line.quantityReceived) - num(line.quantity);
  if (!d) return "0";
  return `<span class="${d < 0 ? "diff-neg" : "diff-pos"}">${d > 0 ? "+" : ""}${d}</span>`;
};

const shipmentDocHtml = (shipment, { kioskName, generatedAt }) => {
  const lines = shipmentLines(shipment);
  const hasReceipt = shipmentHasReceipt(shipment);
  const status = shipmentStatusMeta(shipment.status);
  const packing = getShipmentPackingItems(shipment);

  const rows = lines
    .map((l, i) => {
      const variant = lineVariantLabel(l);
      return `<tr>
        <td class="c">${i + 1}</td>
        <td>${escapeHtml(l.productCode || "")}</td>
        <td>${escapeHtml(l.productName || "")}${variant ? `<div class="muted">${escapeHtml(variant)}</div>` : ""}${
          l.receivedLineNotes ? `<div class="muted">Nota: ${escapeHtml(l.receivedLineNotes)}</div>` : ""
        }</td>
        <td>${escapeHtml(l.colorName || "—")}</td>
        <td class="c">${escapeHtml(l.size || "—")}</td>
        <td class="n"><strong>${num(l.quantity)}</strong></td>
        ${hasReceipt ? `<td class="n">${l.quantityReceived != null ? num(l.quantityReceived) : "—"}</td><td class="n">${l.quantityReceived != null ? diffCell(l) : "—"}</td>` : ""}
      </tr>`;
    })
    .join("");

  const totalCols = hasReceipt
    ? `<td class="n">${shipmentPieces(shipment)}</td><td class="n">${shipmentReceivedPieces(shipment)}</td><td></td>`
    : `<td class="n">${shipmentPieces(shipment)}</td>`;

  const packHtml = packing.length
    ? `<h3>Material de empaque</h3><ul class="pack">${packing
        .map((p) => `<li>${escapeHtml(formatPackingItemLabel(p))} — <strong>${num(p.quantity)}</strong></li>`)
        .join("")}</ul>`
    : "";

  const notes = String(shipment.notes || "").trim();
  const recvNotes = String(shipment.receivedNotes || "").trim();

  return `<section class="doc">
    <div class="head">
      <div>
        <div class="brand">Fossiles · Envío a kiosko</div>
        <div class="title">${escapeHtml(shipment.shipmentNumber || `#${shipment.id}`)}</div>
      </div>
      <div class="pill">${escapeHtml(status.label)}</div>
    </div>
    <div class="grid">
      ${cell("Kiosko", shipment.locationName || kioskName)}
      ${cell("Fecha de envío", shipment.sentAt ? formatDateTimeGt(shipment.sentAt) : "Aún no enviado")}
      ${cell("Fecha de recepción", shipment.receivedAt ? formatDateTimeGt(shipment.receivedAt) : "Pendiente")}
      ${cell("Creado", shipment.createdAt ? formatDateTimeGt(shipment.createdAt) : "")}
      ${cell("Creado por", shipment.createdByName)}
      ${cell("Origen", shipmentOriginLabel(shipment))}
    </div>
    <table class="lines">
      <thead><tr>
        <th class="c" style="width:28px">#</th><th style="width:90px">Código</th><th>Producto</th><th style="width:100px">Color</th><th class="c" style="width:50px">Talla</th>
        <th class="n" style="width:62px">Enviado</th>${hasReceipt ? `<th class="n" style="width:62px">Recibido</th><th class="n" style="width:62px">Dif.</th>` : ""}
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="${hasReceipt ? 8 : 6}" class="c muted">Sin líneas</td></tr>`}</tbody>
      <tfoot><tr><td colspan="5">Total · ${lines.length} línea${lines.length === 1 ? "" : "s"}</td>${totalCols}</tr></tfoot>
    </table>
    ${packHtml}
    ${notes ? `<h3>Observaciones</h3><div class="box">${escapeHtml(notes)}</div>` : ""}
    ${recvNotes ? `<h3>Notas de recepción</h3><div class="box">${escapeHtml(recvNotes)}</div>` : ""}
    <div class="sign"><div>Despachó</div><div>Transportista</div><div>Recibió (kiosko)</div></div>
    <div class="foot">Generado ${escapeHtml(generatedAt)}</div>
  </section>`;
};

/** Hoja de resumen al inicio cuando se imprimen varios envíos a la vez. */
const summaryDocHtml = (shipments, { kioskName, rangeLabel, generatedAt }) => {
  const rows = shipments
    .map(
      (s) => `<tr>
        <td><strong>${escapeHtml(s.shipmentNumber || s.id)}</strong></td>
        <td>${escapeHtml(formatDateGt(shipmentDate(s)))}</td>
        <td>${escapeHtml(shipmentStatusMeta(s.status).label)}</td>
        <td class="n">${shipmentLines(s).length}</td>
        <td class="n">${shipmentPieces(s)}</td>
      </tr>`
    )
    .join("");
  const totalPieces = shipments.reduce((sum, s) => sum + shipmentPieces(s), 0);
  return `<section class="doc">
    <div class="head">
      <div>
        <div class="brand">Fossiles · Envíos a kiosko</div>
        <div class="title">${escapeHtml(kioskName || "Kiosko")}</div>
      </div>
      <div class="pill">${shipments.length} envío${shipments.length === 1 ? "" : "s"}</div>
    </div>
    <div class="grid">
      ${cell("Período", rangeLabel)}
      ${cell("Piezas enviadas", String(totalPieces))}
      ${cell("Generado", generatedAt)}
    </div>
    <table class="summary-table">
      <thead><tr><th>Envío</th><th>Fecha</th><th>Estado</th><th class="n">Líneas</th><th class="n">Piezas</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="n">${shipments.reduce((s, x) => s + shipmentLines(x).length, 0)}</td><td class="n">${totalPieces}</td></tr></tfoot>
    </table>
  </section>`;
};

export const rangeText = (range) => {
  if (!range?.from && !range?.to) return "Todos";
  const f = (ymd) => (ymd ? formatDateGt(ymd) : "…");
  return `${f(range.from)} al ${f(range.to)}`;
};

export const buildKioskShipmentsPrintHtml = (shipments, { kioskName = "", range = null } = {}) => {
  const list = (shipments || []).filter(Boolean);
  const generatedAt = formatNowGt();
  const rangeLabel = rangeText(range);
  const docs = list.map((s) => shipmentDocHtml(s, { kioskName, generatedAt })).join("");
  const summary = list.length > 1 ? summaryDocHtml(list, { kioskName, rangeLabel, generatedAt }) : "";
  const title =
    list.length === 1
      ? `Envío ${list[0].shipmentNumber || ""} · ${kioskName}`
      : `Envíos · ${kioskName}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>${summary}${docs}</body>
</html>`;
};

/**
 * Abre el documento en una pestaña nueva y lanza el diálogo de impresión
 * (ahí mismo se elige «Guardar como PDF»). Devuelve false si el navegador bloqueó la ventana.
 */
export const openKioskShipmentsPrintWindow = (shipments, opts = {}) => {
  const html = buildKioskShipmentsPrintHtml(shipments, opts);
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
      /* el usuario puede imprimir con Ctrl+P */
    }
  }, 300);
  return true;
};

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const baseFont = { name: "Calibri", sz: 11, color: { rgb: "000000" } };
const fillGray = { fgColor: { rgb: "D9D9D9" } };
const fillLight = { fgColor: { rgb: "F2F2F2" } };

const styleAoa = (ws, aoa, { headerRows = [], totalRows = [], titleRows = [], numCols = [], noBorderRows = [] }) => {
  aoa.forEach((row, r) => {
    row.forEach((_v, c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cellObj = ws[addr];
      if (!cellObj) return;
      if (titleRows.includes(r)) {
        cellObj.s = { font: { ...boldFont, sz: r === titleRows[0] ? 14 : 11 } };
      } else if (noBorderRows.includes(r)) {
        cellObj.s = { font: c === 0 ? boldFont : baseFont };
      } else if (headerRows.includes(r)) {
        cellObj.s = {
          font: boldFont,
          fill: fillGray,
          border: thinBorder,
          alignment: { horizontal: numCols.includes(c) ? "center" : "left", vertical: "center", wrapText: true },
        };
      } else if (totalRows.includes(r)) {
        cellObj.s = {
          font: boldFont,
          fill: fillLight,
          border: thinBorder,
          alignment: { horizontal: numCols.includes(c) ? "right" : "left" },
        };
      } else {
        cellObj.s = {
          font: baseFont,
          border: thinBorder,
          alignment: { horizontal: numCols.includes(c) ? "right" : "left", vertical: "top" },
        };
      }
    });
  });
};

const uniqueSheetName = (base, used) => {
  const clean = String(base || "Hoja").replace(/[\\/?*[\]:]/g, "-").slice(0, 28) || "Hoja";
  let name = clean;
  let i = 2;
  while (used.has(name.toLowerCase())) {
    name = `${clean.slice(0, 25)}-${i}`;
    i += 1;
  }
  used.add(name.toLowerCase());
  return name;
};

/** Hoja con el documento de un solo envío: datos arriba y líneas debajo. */
const buildSingleShipmentSheet = (shipment, kioskName) => {
  const hasReceipt = shipmentHasReceipt(shipment);
  const lines = shipmentLines(shipment);
  const status = shipmentStatusMeta(shipment.status).label;
  const header = ["#", "Código", "Producto", "Color", "Talla", "Tipo", "Enviado", ...(hasReceipt ? ["Recibido", "Diferencia"] : [])];
  const info = [
    [`ENVÍO ${shipment.shipmentNumber || shipment.id}`],
    [`Kiosko: ${shipment.locationName || kioskName}`],
    [`Estado: ${status}`],
    [`Fecha de envío: ${shipment.sentAt ? formatDateTimeGt(shipment.sentAt) : "Aún no enviado"}`],
    [`Fecha de recepción: ${shipment.receivedAt ? formatDateTimeGt(shipment.receivedAt) : "Pendiente"}`],
    [`Creado por: ${shipment.createdByName || "—"}`],
    [`Origen: ${shipmentOriginLabel(shipment) || "—"}`],
    [""],
  ];
  const body = lines.map((l, i) => [
    i + 1,
    l.productCode || "",
    l.productName || "",
    l.colorName || "",
    l.size || "",
    lineVariantLabel(l),
    num(l.quantity),
    ...(hasReceipt
      ? [
          l.quantityReceived != null ? num(l.quantityReceived) : "",
          l.quantityReceived != null
            ? l.quantityDifference != null
              ? num(l.quantityDifference)
              : num(l.quantityReceived) - num(l.quantity)
            : "",
        ]
      : []),
  ]);
  const total = [
    "",
    "",
    `TOTAL · ${lines.length} línea${lines.length === 1 ? "" : "s"}`,
    "",
    "",
    "",
    shipmentPieces(shipment),
    ...(hasReceipt ? [shipmentReceivedPieces(shipment), ""] : []),
  ];
  const aoa = [...info, header, ...body, total];
  const headerRow = info.length;
  const totalRow = aoa.length - 1;

  const packing = getShipmentPackingItems(shipment);
  if (packing.length) {
    aoa.push([""], ["MATERIAL DE EMPAQUE"]);
    packing.forEach((p) => aoa.push(["", formatPackingItemLabel(p), "", "", "", "", num(p.quantity)]));
  }
  const notes = String(shipment.notes || "").trim();
  if (notes) aoa.push([""], ["OBSERVACIONES"], [notes]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const numCols = hasReceipt ? [0, 6, 7, 8] : [0, 6];
  styleAoa(ws, aoa, {
    titleRows: [0],
    noBorderRows: [1, 2, 3, 4, 5, 6],
    headerRows: [headerRow],
    totalRows: [totalRow],
    numCols,
  });
  // Filas de datos del cuerpo con bordes (styleAoa las trata como filas normales); las de empaque/notas no.
  for (let r = totalRow + 1; r < aoa.length; r += 1) {
    aoa[r].forEach((_v, c) => {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr]) ws[addr].s = { font: aoa[r][0] && String(aoa[r][0]).match(/^[A-ZÁÉÍÓÚ ]+$/) ? boldFont : baseFont };
    });
  }
  ws["!cols"] = [
    { wch: 5 }, { wch: 16 }, { wch: 40 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 11 },
    ...(hasReceipt ? [{ wch: 11 }, { wch: 11 }] : []),
  ];
  ws["!merges"] = [];
  return ws;
};

const buildSummarySheet = (shipments, kioskName, range) => {
  const header = ["Envío", "Fecha", "Estado", "Origen", "Creado por", "Líneas", "Piezas enviadas", "Piezas recibidas", "Fecha recepción", "Observaciones"];
  const body = shipments.map((s) => [
    s.shipmentNumber || s.id,
    formatDateGt(shipmentDate(s)),
    shipmentStatusMeta(s.status).label,
    shipmentOriginLabel(s),
    s.createdByName || "",
    shipmentLines(s).length,
    shipmentPieces(s),
    shipmentHasReceipt(s) ? shipmentReceivedPieces(s) : "",
    s.receivedAt ? formatDateGt(s.receivedAt) : "",
    String(s.notes || "").trim(),
  ]);
  const total = [
    `TOTAL · ${shipments.length}`, "", "", "", "",
    shipments.reduce((a, s) => a + shipmentLines(s).length, 0),
    shipments.reduce((a, s) => a + shipmentPieces(s), 0),
    "", "", "",
  ];
  const info = [
    [`ENVÍOS A ${String(kioskName || "KIOSKO").toUpperCase()}`],
    [`Período: ${rangeText(range)} · Generado: ${formatNowGt()}`],
    [""],
  ];
  const aoa = [...info, header, ...body, total];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  styleAoa(ws, aoa, {
    titleRows: [0],
    noBorderRows: [1],
    headerRows: [info.length],
    totalRows: [aoa.length - 1],
    numCols: [5, 6, 7],
  });
  ws["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 8 }, { wch: 15 }, { wch: 16 }, { wch: 15 }, { wch: 40 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: info.length, c: 0 }, e: { r: aoa.length - 2, c: header.length - 1 } }) };
  return ws;
};

/** Hoja plana (una fila por línea de envío) pensada para filtrar o armar tablas dinámicas. */
const buildDetailSheet = (shipments) => {
  const hasReceipt = shipments.some(shipmentHasReceipt);
  const header = ["Envío", "Fecha", "Estado", "Código", "Producto", "Color", "Talla", "Tipo", "Enviado", ...(hasReceipt ? ["Recibido", "Diferencia"] : [])];
  const body = [];
  shipments.forEach((s) => {
    shipmentLines(s).forEach((l) => {
      body.push([
        s.shipmentNumber || s.id,
        formatDateGt(shipmentDate(s)),
        shipmentStatusMeta(s.status).label,
        l.productCode || "",
        l.productName || "",
        l.colorName || "",
        l.size || "",
        lineVariantLabel(l),
        num(l.quantity),
        ...(hasReceipt
          ? [
              l.quantityReceived != null ? num(l.quantityReceived) : "",
              l.quantityReceived != null
                ? l.quantityDifference != null ? num(l.quantityDifference) : num(l.quantityReceived) - num(l.quantity)
                : "",
            ]
          : []),
      ]);
    });
  });
  const aoa = [header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const numCols = hasReceipt ? [8, 9, 10] : [8];
  styleAoa(ws, aoa, { headerRows: [0], numCols });
  ws["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 40 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 10 }, ...(hasReceipt ? [{ wch: 10 }, { wch: 11 }] : [])];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(aoa.length - 1, 0), c: header.length - 1 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
};

/**
 * Un envío → una hoja con el documento. Varios → «Resumen» (una fila por envío) y «Detalle»
 * (una fila por línea, lista para filtrar).
 */
export const exportKioskShipmentsExcel = (shipments, { kioskName = "", range = null } = {}) => {
  const list = (shipments || []).filter(Boolean);
  if (!list.length) throw new Error("No hay envíos para exportar.");
  const wb = XLSX.utils.book_new();
  const used = new Set();
  if (list.length === 1) {
    XLSX.utils.book_append_sheet(
      wb,
      buildSingleShipmentSheet(list[0], kioskName),
      uniqueSheetName(list[0].shipmentNumber || "Envio", used)
    );
  } else {
    XLSX.utils.book_append_sheet(wb, buildSummarySheet(list, kioskName, range), uniqueSheetName("Resumen", used));
    XLSX.utils.book_append_sheet(wb, buildDetailSheet(list), uniqueSheetName("Detalle", used));
  }
  const fileName = buildExportFileName(list, kioskName, range, "xlsx");
  XLSX.writeFile(wb, fileName);
  return fileName;
};
