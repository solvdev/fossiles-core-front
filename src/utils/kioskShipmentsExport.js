import * as XLSX from "xlsx-js-style";
import { boldFont, thinBorder } from "./kioskReportExcelStyle";
import { formatDateGt, formatDateTimeGt, formatNowGt } from "./dateTimeHelper";
import { escapeHtml } from "./shipmentPrintDocumentHtml";
import { formatPackingItemLabel, getShipmentPackingItems } from "./shipmentPackingHelper";
import { extractShipmentUserObservation } from "./shipmentNotesObservationHelper";
import { getPublicFrontBaseUrl, buildPtDispatchDistributionUrl } from "./ptDispatchQr";
import { PRINT_FONT_FAMILY, PRINT_PAPER_HEIGHT_MM, PRINT_PAPER_WIDTH_MM } from "./prepareShipmentsOrderHelper";

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
// PDF: mismo documento que se imprime en Distribución > Preparar envíos
// (hoja carta, Times New Roman en negrita, tabla Cod./Producto/Color/Cantidad/Medida/Precio/Total,
// Observación y Vo. Bo. / Recibido).
// ---------------------------------------------------------------------------

const PAPER_WIDTH_MM = PRINT_PAPER_WIDTH_MM;
const PAPER_HEIGHT_MM = PRINT_PAPER_HEIGHT_MM;
const MARGIN_TOP_MM = 5;
const MARGIN_RIGHT_MM = 3;
const MARGIN_BOTTOM_MM = 3;
const MARGIN_LEFT_MM = 3;
const HARDWARE_SAFE_INSET_MM = 5;
const CONTENT_WIDTH_MM = Math.max(90, PAPER_WIDTH_MM - MARGIN_LEFT_MM - MARGIN_RIGHT_MM - HARDWARE_SAFE_INSET_MM * 2);
const SOURCE_ADDRESS = "Bodega Principal";

const money = (amount) =>
  `Q${num(amount).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const currentUserName = () => {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "Usuario";
    const user = JSON.parse(raw);
    return user?.fullName || user?.name || user?.username || user?.email || "Usuario";
  } catch (_e) {
    return "Usuario";
  }
};

/** Filas de la tabla del documento: productos (con TALLA en el nombre) y luego el material de empaque. */
export const buildPrintRows = (shipment) => {
  const productRows = shipmentLines(shipment)
    .map((l) => {
      const qty = num(l.quantity);
      const unit = num(l.unitPrice);
      const size = String(l.size || "").trim().toUpperCase();
      return {
        code: l.productCode || "-",
        name: `${l.productName || "-"}${size ? ` TALLA ${size}` : ""}`,
        brand: String(l.brandName || "").trim(),
        color: l.colorName || "-",
        quantity: qty,
        uom: l.uomName || l.unitName || "Unidad",
        unitPrice: unit > 0 ? unit : 0,
        total: unit > 0 ? qty * unit : 0,
      };
    })
    .filter((r) => r.quantity > 0);
  const packingRows = getShipmentPackingItems(shipment)
    .map((p) => {
      const qty = num(p.quantity);
      const unit = num(p.unitPrice);
      return {
        code: p.materialSku || `SUM-${p.materialId}`,
        name: p.materialName || "Empaque",
        brand: "",
        color: "-",
        quantity: qty,
        uom: "Unidad",
        unitPrice: unit > 0 ? unit : 0,
        total: unit > 0 ? qty * unit : 0,
      };
    })
    .filter((r) => r.quantity > 0);
  return [...productRows, ...packingRows];
};

const PRINT_STYLES = `
  @page { size: ${PAPER_WIDTH_MM}mm ${PAPER_HEIGHT_MM}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { width: ${PAPER_WIDTH_MM}mm; }
  body {
    font-family: ${PRINT_FONT_FAMILY};
    font-size: 11.5px;
    font-weight: 700;
    color: #111;
    margin: 0;
    padding: ${MARGIN_TOP_MM}mm ${MARGIN_RIGHT_MM + HARDWARE_SAFE_INSET_MM}mm ${MARGIN_BOTTOM_MM}mm ${MARGIN_LEFT_MM + HARDWARE_SAFE_INSET_MM}mm;
    text-rendering: geometricPrecision;
  }
  table, th, td, strong, span, div { font-family: ${PRINT_FONT_FAMILY}; font-weight: 700; }
  .doc { width: ${CONTENT_WIDTH_MM}mm; min-height: auto; margin: 0 auto 2mm auto; break-inside: avoid-page; page-break-inside: avoid; }
  .doc-header { display: flex; flex-direction: row; align-items: flex-start; justify-content: space-between; gap: 3mm; width: 100%; margin-bottom: 1mm; }
  .doc-header-main { flex: 1 1 auto; min-width: 0; }
  .doc-header-qr { flex: 0 0 22mm; text-align: center; align-self: flex-start; padding-top: 1px; }
  .doc-header-qr img { width: 18mm; height: 18mm; display: block; margin: 0 auto; }
  .doc-header-qr-caption { font-size: 6.5px; margin-top: 1px; font-weight: 700; line-height: 1.05; max-width: 22mm; }
  .doc + .doc { break-before: page; page-break-before: always; }
  table { border-collapse: collapse; width: 100%; }
  .meta, .grid { table-layout: fixed; }
  .meta td { border: 0.25mm solid #111; padding: 3px 4px; vertical-align: top; line-height: 1.1; overflow-wrap: anywhere; }
  .grid th, .grid td { border: 0.25mm solid #111; padding: 3px 4px; line-height: 1.1; overflow-wrap: anywhere; }
  .grid thead th { text-align: left; background: #fff; font-weight: 700; }
  .grid th:nth-child(1), .grid td:nth-child(1) { width: 12%; }
  .grid th:nth-child(2), .grid td:nth-child(2) { width: 23%; }
  .grid:not(.grid-with-brand) th:nth-child(3), .grid:not(.grid-with-brand) td:nth-child(3) { width: 12%; }
  .grid:not(.grid-with-brand) th:nth-child(4), .grid:not(.grid-with-brand) td:nth-child(4) { width: 10%; }
  .grid:not(.grid-with-brand) th:nth-child(5), .grid:not(.grid-with-brand) td:nth-child(5) { width: 14%; }
  .grid:not(.grid-with-brand) th:nth-child(6), .grid:not(.grid-with-brand) td:nth-child(6) { width: 15%; }
  .grid:not(.grid-with-brand) th:nth-child(7), .grid:not(.grid-with-brand) td:nth-child(7) { width: 15%; }
  .grid.grid-with-brand th:nth-child(3), .grid.grid-with-brand td:nth-child(3) { width: 11%; }
  .grid.grid-with-brand th:nth-child(4), .grid.grid-with-brand td:nth-child(4) { width: 10%; }
  .grid.grid-with-brand th:nth-child(5), .grid.grid-with-brand td:nth-child(5) { width: 9%; }
  .grid.grid-with-brand th:nth-child(6), .grid.grid-with-brand td:nth-child(6) { width: 12%; }
  .grid.grid-with-brand th:nth-child(7), .grid.grid-with-brand td:nth-child(7) { width: 13%; }
  .grid.grid-with-brand th:nth-child(8), .grid.grid-with-brand td:nth-child(8) { width: 13%; }
  .numeric { text-align: right; white-space: nowrap; }
  .empty { text-align: center; color: #666; font-style: italic; }
  .total-row td { background: #fff; }
  .footer-meta { margin-top: 2px; }
`;

const shipmentDocHtml = (shipment, { qrDataUrl = "", printedBy = "" } = {}) => {
  const rows = buildPrintRows(shipment);
  const showBrand = rows.some((r) => r.brand);
  const cols = showBrand ? 8 : 7;
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = rows.reduce((s, r) => s + r.total, 0);
  const observation = extractShipmentUserObservation(shipment.notes) || "-";
  const origin = shipment.distributionNumber || shipment.productionOrderCode || "—";

  const bodyRows = rows
    .map(
      (r) => `<tr>
        <td>${escapeHtml(r.code)}</td>
        <td>${escapeHtml(r.name)}</td>
        ${showBrand ? `<td>${escapeHtml(r.brand || "—")}</td>` : ""}
        <td>${escapeHtml(r.color)}</td>
        <td class="numeric">${r.quantity}</td>
        <td>${escapeHtml(r.uom)}</td>
        <td class="numeric">${r.unitPrice > 0 ? money(r.unitPrice) : "-"}</td>
        <td class="numeric">${r.total > 0 ? money(r.total) : "-"}</td>
      </tr>`
    )
    .join("");

  const metaRows = `
    <tr>
      <td colspan="3"><strong>Direccion Envio:</strong> ${escapeHtml(SOURCE_ADDRESS)}</td>
      <td colspan="2"><strong>Fecha:</strong> ${escapeHtml(formatDateGt(shipmentDate(shipment)))}</td>
    </tr>
    <tr>
      <td colspan="3"><strong>Direccion Recibido:</strong> ${escapeHtml(shipment.locationName || "-")} ${shipment.locationCode ? `(${escapeHtml(shipment.locationCode)})` : ""}</td>
      <td colspan="2"><strong>Envio No:</strong> ${escapeHtml(shipment.shipmentNumber || shipment.id)}</td>
    </tr>
    <tr>
      <td colspan="3"><strong>Creado por:</strong> ${escapeHtml(shipment.createdByName || "—")}</td>
      <td colspan="2"><strong>Distribucion:</strong> ${escapeHtml(origin)}</td>
    </tr>
    <tr>
      <td colspan="5"><strong>Generado por:</strong> ${escapeHtml(printedBy)}</td>
    </tr>`;

  const header = qrDataUrl
    ? `<div class="doc-header">
        <div class="doc-header-main"><table class="meta">${metaRows}</table></div>
        <div class="doc-header-qr">
          <img src="${String(qrDataUrl).replace(/"/g, "&quot;")}" alt="QR" />
          <div class="doc-header-qr-caption">Escanear en app Bodega PT — distribución</div>
        </div>
      </div>`
    : `<table class="meta">${metaRows}</table>`;

  return `<section class="doc">
    ${header}
    <table class="grid${showBrand ? " grid-with-brand" : ""}">
      <thead><tr>
        <th>Cod.</th><th>Producto</th>${showBrand ? "<th>Marca</th>" : ""}<th>Color</th><th>Cantidad</th><th>Medida</th><th>Precio</th><th>Total</th>
      </tr></thead>
      <tbody>
        ${bodyRows || `<tr><td colspan="${cols}" class="empty">Sin productos</td></tr>`}
        <tr class="total-row">
          <td colspan="${showBrand ? 4 : 3}"><strong>Total</strong></td>
          <td class="numeric"><strong>${totalQty}</strong></td>
          <td></td><td></td>
          <td class="numeric"><strong>${totalAmount > 0 ? money(totalAmount) : "-"}</strong></td>
        </tr>
      </tbody>
    </table>
    <table class="meta footer-meta">
      <tr><td colspan="5"><strong>Observacion:</strong> ${escapeHtml(observation)}</td></tr>
      <tr><td colspan="2"><strong>Vo. Bo.:</strong></td><td colspan="3"><strong>Recibido:</strong></td></tr>
    </table>
  </section>`;
};

export const rangeText = (range) => {
  if (!range?.from && !range?.to) return "Todos";
  const f = (ymd) => (ymd ? formatDateGt(ymd) : "…");
  return `${f(range.from)} al ${f(range.to)}`;
};

/** QR de la distribución (misma liga que imprime Preparar envíos); vacío si no hay distribución o falla. */
const distributionQr = async (shipment, cache) => {
  const id = shipment?.distributionId;
  if (!id) return "";
  if (cache.has(id)) return cache.get(id);
  let dataUrl = "";
  try {
    const base = getPublicFrontBaseUrl();
    if (base) {
      const { default: QRCode } = await import("qrcode");
      dataUrl = await QRCode.toDataURL(buildPtDispatchDistributionUrl(base, id), { width: 120, margin: 1 });
    }
  } catch (_e) {
    /* sin QR si falla */
  }
  cache.set(id, dataUrl);
  return dataUrl;
};

export const buildKioskShipmentsPrintHtml = async (shipments, { kioskName = "" } = {}) => {
  const list = (shipments || []).filter(Boolean);
  const printedBy = currentUserName();
  const cache = new Map();
  const docs = [];
  for (const s of list) {
    // eslint-disable-next-line no-await-in-loop
    const qrDataUrl = await distributionQr(s, cache);
    docs.push(shipmentDocHtml(s, { qrDataUrl, printedBy }));
  }
  const title = list.length === 1 ? `Envio ${list[0].shipmentNumber || ""}` : `Envios ${kioskName}`;
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${PRINT_STYLES}</style>
</head>
<body>${docs.join("")}</body>
</html>`;
};

/**
 * Abre el documento en una pestaña nueva y lanza el diálogo de impresión
 * (ahí mismo se elige «Guardar como PDF»). Devuelve false si el navegador bloqueó la ventana.
 * La ventana se abre antes de armar el HTML para no perder el permiso del clic.
 */
export const openKioskShipmentsPrintWindow = async (shipments, opts = {}) => {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write('<!DOCTYPE html><html><body style="font-family:Arial;padding:24px">Preparando documento…</body></html>');
  try {
    const html = await buildKioskShipmentsPrintHtml(shipments, opts);
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
  } catch (err) {
    win.close();
    throw err;
  }
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
