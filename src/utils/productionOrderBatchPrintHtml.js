import * as XLSX from "xlsx-js-style";
import { formatDateGt } from "utils/dateTimeHelper";
import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import {
  escapeHtml,
  buildCinchoDetailTableHtml,
  buildNormalColorMatrixTableHtml,
  collectCinchoSizesUnion,
  coerceSizesMap,
  getPrintOrientationToolbarHtml,
  groupKeyForNormalItem,
  itemLineQty,
  addObservationCount,
  formatObservationsByColor,
  formatObservationsWithCounts,
  mergeCinchoItemsByProductCodeAndColor,
  partitionSizes,
  rowTotalFromSizes,
} from "utils/productionOrderPrintHtml";

const TYPE_LABELS = {
  CINCHOS: "CINCHOS",
  CINCHOS_FOSSILES: "CINCHOS FOSSILES",
  CINCHOS_MARCAS: "CINCHOS MARCAS",
  MARCAS: "MARCAS",
  OPV: "OPV",
  NORMAL: "KIOSKO",
  DISTRIBUTION: "DISTRIBUCIÓN",
  VENTA_EN_LINEA: "VENTA EN LÍNEA",
  CLIENTE_KIOSKO: "CLIENTE KIOSKO",
  INTERNA: "INTERNA",
};

const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En Progreso",
  IN_QA: "En Progreso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export function getTypeLabel(type) {
  return TYPE_LABELS[type] || type || "-";
}

export function getStatusLabel(status) {
  return STATUS_LABELS[status] || status || "-";
}

function getTotalQuantity(items) {
  if (!items?.length) return 0;
  return items.reduce((total, item) => {
    if (item.sizes) {
      return total + Object.values(item.sizes).reduce((sum, qty) => sum + (qty || 0), 0);
    }
    return total + (item.quantity || 0);
  }, 0);
}

function getProducedQuantity(items) {
  if (!items?.length) return 0;
  return items.reduce((total, item) => {
    const planned = item.sizes
      ? Object.values(item.sizes).reduce((sum, qty) => sum + (qty || 0), 0)
      : Number(item.quantity || 0);
    const received = Number(item.warehouseReceivedQty || 0);
    return total + Math.min(Math.max(received, 0), Math.max(planned, 0));
  }, 0);
}

export function getOrderQtyProgress(items) {
  const total = getTotalQuantity(items);
  const produced = getProducedQuantity(items);
  const pending = Math.max(total - produced, 0);
  const pct = total > 0 ? Math.round((produced / total) * 100) : 0;
  return { total, produced, pending, pct };
}

export function getProcessStage(order) {
  const qty = getOrderQtyProgress(order?.items);
  if (order?.status === "CANCELLED") return { key: "CANCELLED", label: "Cancelada" };
  if (order?.status === "PENDING") return { key: "PENDING_PRODUCTION", label: "Pendiente en Producción" };
  if (order?.status === "IN_PROGRESS") return { key: "IN_PRODUCTION", label: "En Producción" };
  if (order?.status === "COMPLETED" && qty.pending > 0) return { key: "IN_BODEGA", label: "Pendiente en Bodega PT" };
  if (order?.status === "COMPLETED" && qty.pending <= 0) return { key: "READY_DISPATCH", label: "Lista para Despacho" };
  return { key: "OTHER", label: order?.status || "Sin estado" };
}

export function getOrderProcessDates(orderId, tasks, fallbackStart, fallbackDelivery) {
  const orderTasks = (tasks || []).filter((task) => Number(task.productionOrderId) === Number(orderId));
  const toMs = (value) => {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };
  const startCandidates = [];
  orderTasks.forEach((task) => {
    const started = toMs(task.startedAt);
    const scheduled = toMs(task.scheduledDate);
    if (started != null) startCandidates.push(started);
    if (scheduled != null) startCandidates.push(scheduled);
  });
  const deliveryCandidates = [];
  orderTasks.forEach((task) => {
    const completed = toMs(task.completedAt);
    if (completed != null) deliveryCandidates.push(completed);
  });
  return {
    startValue: startCandidates.length ? new Date(Math.min(...startCandidates)).toISOString() : fallbackStart,
    deliveryValue: deliveryCandidates.length ? new Date(Math.max(...deliveryCandidates)).toISOString() : fallbackDelivery,
  };
}

function getOrderBrandDisplay(order) {
  if (order?.orderType !== "MARCAS") return "-";
  const brands = Array.from(new Set((order.items || []).map((item) => item.brandName).filter(Boolean)));
  return brands.length > 0 ? brands.join(", ") : "-";
}

function getItemExportLines(item) {
  const sizes = item?.sizes && typeof item.sizes === "object" ? item.sizes : null;
  const sizeEntries = sizes ? Object.entries(sizes).filter(([, qty]) => Number(qty || 0) > 0) : [];
  if (sizeEntries.length > 0) {
    return sizeEntries.map(([size, qty]) => ({ size, plannedQty: Number(qty || 0) }));
  }
  return [{ size: item?.size || "", plannedQty: Number(item?.quantity || 0) }];
}

/** Prefijo y correlativo desde código (OPCK-8 → OPCK, 8). */
export function parseOpCodeParts(code) {
  const raw = String(code || "").trim().toUpperCase();
  const dashed = raw.match(/^([A-Z]{2,}(?:-[A-Z]+)?)-(\d+)$/);
  if (dashed) {
    return { prefix: dashed[1], number: Number(dashed[2]) };
  }
  const compact = raw.match(/^([A-Z]+)(\d+)$/);
  if (compact) {
    return { prefix: compact[1], number: Number(compact[2]) };
  }
  const tail = raw.match(/(\d+)$/);
  const prefix = tail ? raw.slice(0, tail.index).replace(/-+$/, "") : raw;
  return { prefix: prefix || raw, number: tail ? Number(tail[1]) : null };
}

/** Ordenar por código OP (OPK-5, OPC-18, etc.). */
export function sortProductionOrdersByCode(orders) {
  return [...(orders || [])].sort((a, b) =>
    String(a?.code || "").localeCompare(String(b?.code || ""), "es", {
      numeric: true,
      sensitivity: "base",
    })
  );
}

export function buildProductionOrderDocSection(order, { tasks, generatedAt } = {}) {
  const processDates = getOrderProcessDates(order.id, tasks, order.startDate, order.deliveryDate);
  const qtyProgress = getOrderQtyProgress(order.items);
  const stage = getProcessStage(order);
  const customer =
    order.orderType === "DISTRIBUTION" && order.distributionNumber
      ? order.distributionNumber
      : order.customerName || "-";
  const showBrandColumn = order.orderType === "MARCAS";
  const brandMetaRow = showBrandColumn
    ? `
              <tr>
                <th>Marcas</th>
                <td>${escapeHtml(getOrderBrandDisplay(order))}</td>
                <th>Total planificado</th>
                <td>${escapeHtml(String(qtyProgress.total))}</td>
              </tr>`
    : `
              <tr>
                <th>Total planificado</th>
                <td>${escapeHtml(String(qtyProgress.total))}</td>
                <th></th>
                <td></td>
              </tr>`;
  const detailTableHtml = isCinchoOrderType(order.orderType)
    ? buildCinchoDetailTableHtml(order)
    : buildNormalColorMatrixTableHtml(order);
  const orderObservation = String(order.observations || "").trim();
  const orderObservationBlock = orderObservation
    ? `
          <div class="order-observation">
            <strong>Observación:</strong>
            <div>${escapeHtml(orderObservation)}</div>
          </div>`
    : "";
  const at = generatedAt || new Date().toLocaleString("es-GT");

  return `
        <section class="op-doc">
          <div class="op-title">
            <div>
              <div class="brand">FOSSILES</div>
              <h1>Orden de Producción</h1>
            </div>
            <div class="op-code">${escapeHtml(order.code || "-")}</div>
          </div>

          <table class="meta">
            <tbody>
              <tr>
                <th>Tipo</th>
                <td>${escapeHtml(getTypeLabel(order.orderType))}</td>
                <th>Estado</th>
                <td>${escapeHtml(getStatusLabel(order.status))}</td>
              </tr>
              <tr>
                <th>Proceso</th>
                <td>${escapeHtml(stage.label)}</td>
                <th></th>
                <td></td>
              </tr>
              <tr>
                <th>Cliente/Distribución</th>
                <td>${escapeHtml(customer)}</td>
                <th>Vendedor</th>
                <td>${escapeHtml(order.orderType === "DISTRIBUTION" ? "-" : order.sellerName || "-")}</td>
              </tr>
              ${brandMetaRow}
              <tr>
                <th>Inicio</th>
                <td>${escapeHtml(processDates.startValue ? formatDateGt(processDates.startValue) : "-")}</td>
                <th>Entrega</th>
                <td>${escapeHtml(processDates.deliveryValue ? formatDateGt(processDates.deliveryValue) : "-")}</td>
              </tr>
              <tr>
                <th>Generado</th>
                <td>${escapeHtml(at)}</td>
                <th></th>
                <td></td>
              </tr>
            </tbody>
          </table>

          ${orderObservationBlock}

          ${detailTableHtml}
        </section>
      `;
}

function getBatchPrintDocumentStyles() {
  return `
            body { font-family: Arial, sans-serif; color: #111; margin: 0; font-size: 10.5px; }
            .print-meta { margin: 0 0 8px; color: #555; font-size: 10px; }
            .print-toolbar {
              padding: 10px 12px;
              background: #eef1f4;
              margin: 0 0 10px;
              border: 1px solid #ccc;
              display: flex;
              align-items: center;
              gap: 8px;
              flex-wrap: wrap;
            }
            .print-toolbar-label { font-weight: 600; margin-right: 4px; }
            .print-toolbar-btn {
              padding: 6px 12px;
              cursor: pointer;
              border: 1px solid #888;
              background: #fff;
              border-radius: 4px;
              font-size: 12px;
            }
            .print-toolbar-primary {
              background: #2563eb;
              color: #fff;
              border-color: #1d4ed8;
            }
            .print-toolbar-active {
              background: #dbeafe;
              border-color: #2563eb;
              font-weight: 700;
            }
            .batch-cover {
              border: 1px solid #111;
              padding: 12px;
              margin-bottom: 14px;
              page-break-after: always;
            }
            .batch-cover h2 { margin: 0 0 8px; font-size: 16px; }
            .batch-cover ul { margin: 0; padding-left: 18px; font-size: 11px; }
            .batch-unified-doc {
              border: 1px solid #111;
              padding: 10px;
              margin-bottom: 8px;
            }
            .batch-title-row { margin-bottom: 10px; }
            .batch-subtitle { margin: 4px 0 0; color: #444; font-size: 11px; }
            .section-h { font-size: 13px; margin: 14px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
            .batch-summary thead th { background: #e8eef5; }
            .batch-summary td, .batch-summary th { font-size: 10px; }
            .col-op { min-width: 52px; background: #f8fafc; font-weight: 700; }
            .op-cell { vertical-align: top; }
            tr.op-first-row td { border-top: 2px solid #333; }
            .lines-unified { margin-top: 4px; }
            .empty-detail { padding: 8px; color: #666; }
            .op-doc {
              border: 1px solid #111;
              padding: 10px;
              margin-bottom: 12px;
              page-break-after: always;
            }
            .op-doc:last-child { page-break-after: auto; }
            .op-title { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
            .brand { font-size: 12px; font-weight: 700; letter-spacing: 1px; }
            h1 { margin: 2px 0 0; font-size: 18px; }
            .op-code { font-size: 20px; font-weight: 700; border: 1px solid #111; padding: 6px 10px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #777; padding: 5px 6px; vertical-align: top; overflow-wrap: anywhere; }
            th { background: #f3f4f6; font-weight: 700; text-align: left; }
            .meta { margin-bottom: 10px; table-layout: fixed; }
            .meta th { width: 18%; }
            .meta td { width: 32%; }
            .order-observation {
              border: 1px solid #777;
              background: #fafafa;
              margin: 0 0 10px;
              padding: 6px 8px;
              line-height: 1.3;
            }
            .order-observation strong { display: block; margin-bottom: 3px; }
            .lines-cincho,
            .lines-color-matrix { table-layout: auto; font-size: 9px; }
            .lines-cincho thead { display: table-header-group; }
            .lines-cincho th,
            .lines-cincho td { padding: 3px 4px; text-align: center; }
            .lines-cincho .col-code,
            .lines-cincho .col-comments,
            .lines-cincho .col-comments-h,
            .lines-color-matrix .col-comments { text-align: left; }
            .lines-cincho .group-h { font-size: 9px; }
            .lines-color-matrix th,
            .lines-color-matrix td {
              padding: 4px 5px;
              text-align: center;
              font-size: 9px;
            }
            .lines-color-matrix td:nth-child(1),
            .lines-color-matrix td:nth-child(2) { text-align: left; }
            body:not(.layout-landscape) .lines-cincho,
            body:not(.layout-landscape) .lines-color-matrix { font-size: 8px; }
            .total-row td,
            .total-row th { background: #f9fafb; }
            .numeric { text-align: right; white-space: nowrap; }
            @media print {
              .no-print { display: none !important; }
              .print-toolbar { display: none !important; }
            }
          `;
}

function orderCustomerLabel(order) {
  if (order?.orderType === "DISTRIBUTION" && order?.distributionNumber) {
    return order.distributionNumber;
  }
  return order.customerName || "—";
}

function detectBatchTableMode(orders) {
  const list = orders || [];
  if (!list.length) return "flat";
  const cinchoCount = list.filter((o) => isCinchoOrderType(o.orderType)).length;
  if (cinchoCount === list.length) return "cincho";
  if (cinchoCount === 0) return "matrix";
  return "flat";
}

function batchRangeLabel(sortedOrders) {
  if (!sortedOrders.length) return "—";
  if (sortedOrders.length === 1) return sortedOrders[0].code || "—";
  const first = sortedOrders[0].code || "";
  const last = sortedOrders[sortedOrders.length - 1].code || "";
  const samePrefix =
    parseOpCodeParts(first).prefix &&
    parseOpCodeParts(first).prefix === parseOpCodeParts(last).prefix;
  if (samePrefix) return `${first} … ${last}`;
  return `${first} … ${last} (${sortedOrders.length} OP)`;
}

function buildBatchIntroHtml(orders, generatedAt) {
  const sorted = sortProductionOrdersByCode(orders);
  return `
    <section class="batch-unified-doc">
      <div class="batch-title-row">
        <div>
          <div class="brand">FOSSILES</div>
          <h1>Órdenes de producción — lote unificado</h1>
          <p class="batch-subtitle">${escapeHtml(batchRangeLabel(sorted))} · ${sorted.length} orden(es) · ${escapeHtml(generatedAt || "")}</p>
        </div>
      </div>
  `;
}

/** Cuadro resumen: una fila por OP (sin observaciones). */
function buildBatchClientsSummaryTableHtml(orders, tasks) {
  const sorted = sortProductionOrdersByCode(orders);
  const rows = sorted
    .map((order) => {
      const processDates = getOrderProcessDates(order.id, tasks, order.startDate, order.deliveryDate);
      const qtyProgress = getOrderQtyProgress(order.items);
      return `
        <tr>
          <td><strong>${escapeHtml(order.code || "-")}</strong></td>
          <td>${escapeHtml(orderCustomerLabel(order))}</td>
          <td>${escapeHtml(order.orderType === "DISTRIBUTION" ? "—" : order.sellerName || "—")}</td>
          <td>${escapeHtml(getTypeLabel(order.orderType))}</td>
          <td>${escapeHtml(processDates.deliveryValue ? formatDateGt(processDates.deliveryValue) : "—")}</td>
          <td class="numeric">${escapeHtml(String(qtyProgress.total))}</td>
        </tr>`;
    })
    .join("");

  return `
      <h2 class="section-h">Resumen por cliente / OP</h2>
      <table class="meta batch-summary">
        <thead>
          <tr>
            <th>OP</th>
            <th>Cliente / destino</th>
            <th>Vendedor</th>
            <th>Tipo</th>
            <th>Entrega</th>
            <th>Total uds.</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
  `;
}

function buildBatchIntroWithSummaryHtml(orders, tasks, generatedAt) {
  return buildBatchIntroHtml(orders, generatedAt) + buildBatchClientsSummaryTableHtml(orders, tasks);
}

/** Agrupa productos de todas las OP del lote (mismo código/color en una fila). */
function mergeBatchMatrixGroups(orders) {
  const sorted = sortProductionOrdersByCode(orders);
  const groups = new Map();
  sorted.forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item) => {
      const key = groupKeyForNormalItem(item, order.orderType);
      if (!groups.has(key)) {
        groups.set(key, {
          productCode: item.productCode || "-",
          productName: item.productName || "-",
          brandName: item.brandName || "-",
          colorQty: {},
          observationsByColor: {},
        });
      }
      const g = groups.get(key);
      const cname = String(item?.colorName || "").trim() || "-";
      const qty = itemLineQty(item);
      g.colorQty[cname] = (g.colorQty[cname] || 0) + qty;
      const obs = String(item?.observations || "").trim();
      if (obs) {
        if (!g.observationsByColor[cname]) g.observationsByColor[cname] = [];
        addObservationCount(g.observationsByColor[cname], obs, qty);
      }
    });
  });
  const showBrand = sorted.some((o) => o.orderType === "MARCAS");
  const detailRows = Array.from(groups.values()).sort((a, b) => {
    const c0 = String(a.productCode || "").localeCompare(String(b.productCode || ""), "es", {
      numeric: true,
      sensitivity: "base",
    });
    if (c0 !== 0) return c0;
    return String(a.productName || "").localeCompare(String(b.productName || ""), "es", { sensitivity: "base" });
  });
  return { detailRows, showBrand };
}

/** Matriz color × producto: una fila por código (suma entre OP seleccionadas). */
function buildUnifiedMatrixDetailTable(orders) {
  const { detailRows, showBrand } = mergeBatchMatrixGroups(orders);
  const colorColumns = new Set();
  detailRows.forEach((g) => Object.keys(g.colorQty).forEach((c) => colorColumns.add(c)));
  const colors = Array.from(colorColumns).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
  if (!detailRows.length) {
    return `<p class="empty-detail">Sin líneas de producto en el lote.</p></section>`;
  }

  const headerCols = [
    "<th>CÓDIGO</th>",
    "<th>PRODUCTO</th>",
    ...(showBrand ? ["<th>MARCA</th>"] : []),
    ...colors.map((c) => `<th>${escapeHtml(c)}</th>`),
    "<th>TOTAL</th>",
    "<th>COMENTARIOS</th>",
  ].join("");

  const footTotals = colors.map(() => 0);
  const bodyRows = detailRows
    .map((g) => {
      let rowTotal = 0;
      const colorCells = colors.map((col, idx) => {
        const v = g.colorQty[col] || 0;
        rowTotal += v;
        footTotals[idx] += v;
        return `<td class="numeric">${v > 0 ? escapeHtml(String(v)) : ""}</td>`;
      });
      const obsJoined = formatObservationsByColor(g.observationsByColor, colors);
      return `
        <tr>
          <td>${escapeHtml(g.productCode)}</td>
          <td>${escapeHtml(g.productName)}</td>
          ${showBrand ? `<td>${escapeHtml(g.brandName)}</td>` : ""}
          ${colorCells.join("")}
          <td class="numeric">${escapeHtml(rowTotal)}</td>
          <td class="col-comments">${escapeHtml(obsJoined)}</td>
        </tr>`;
    })
    .join("");

  const matrixGrand = footTotals.reduce((a, b) => a + b, 0);
  const footColorCells = footTotals.map((t) => `<td class="numeric"><strong>${escapeHtml(t)}</strong></td>`).join("");
  const leadCols = 2 + (showBrand ? 1 : 0);

  return `
      <h2 class="section-h">Detalle consolidado del lote</h2>
      <table class="lines lines-color-matrix lines-unified">
        <thead><tr>${headerCols}</tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="${leadCols}"><strong>TOTAL LOTE</strong></td>
            ${footColorCells}
            <td class="numeric"><strong>${escapeHtml(matrixGrand)}</strong></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </section>`;
}

/** Cinchos: suma tallas de todas las OP por código + color. */
function mergeBatchCinchoLines(orders) {
  const allItems = [];
  sortProductionOrdersByCode(orders).forEach((order) => {
    (order.items || []).forEach((item) => allItems.push(item));
  });
  return mergeCinchoItemsByProductCodeAndColor(allItems);
}

function buildUnifiedCinchoDetailTable(orders) {
  const mergedLines = mergeBatchCinchoLines(orders);
  const columnSizes = collectCinchoSizesUnion(mergedLines.map((ln) => ({ sizes: ln.sizes })));
  const { youth, adult, other } = partitionSizes(columnSizes);
  const sizeCols = [...youth, ...adult, ...other];
  const nSize = sizeCols.length;

  if (!mergedLines.length || !nSize) {
    return `<p class="empty-detail">Sin líneas con tallas en el lote.</p></section>`;
  }

  const headerRow1 = [];
  headerRow1.push(`<th rowspan="2" class="col-code">CÓDIGO</th>`);
  if (youth.length) headerRow1.push(`<th colspan="${youth.length}" class="group-h">NIÑO / NIÑA</th>`);
  if (adult.length) headerRow1.push(`<th colspan="${adult.length}" class="group-h">DAMA / CABALLERO</th>`);
  if (other.length) headerRow1.push(`<th colspan="${other.length}" class="group-h">OTRA(S)</th>`);
  headerRow1.push(`<th rowspan="2" class="col-total-h">TOTAL</th>`);
  headerRow1.push(`<th rowspan="2" class="col-color-h">COLOR</th>`);
  headerRow1.push(`<th rowspan="2" class="col-comments-h">COMENTARIOS</th>`);
  const headerRow2 = sizeCols.map((n) => `<th class="size-col">${escapeHtml(String(n))}</th>`).join("");

  const sizeTotals = sizeCols.map(() => 0);
  const bodyRows = mergedLines
    .map((item) => {
      const code = item.productCode || "-";
      const color = item.colorName || "-";
      const obs = String(item.observations ?? "").trim();
      const rt = rowTotalFromSizes(item, sizeCols);
      sizeCols.forEach((n, i) => {
        const sizes = coerceSizesMap(item?.sizes);
        const q = Number(sizes[String(n)] ?? sizes[n] ?? 0);
        if (q > 0) sizeTotals[i] += q;
      });
      const cells = sizeCols
        .map((n) => {
          const sizes = coerceSizesMap(item?.sizes);
          const q = Number(sizes[String(n)] ?? sizes[n] ?? 0);
          return `<td class="numeric size-cell">${q > 0 ? escapeHtml(String(q)) : ""}</td>`;
        })
        .join("");
      return `
        <tr>
          <td class="col-code">${escapeHtml(code)}</td>
          ${cells}
          <td class="numeric col-total">${escapeHtml(rt)}</td>
          <td class="col-color">${escapeHtml(color)}</td>
          <td class="col-comments">${escapeHtml(obs)}</td>
        </tr>`;
    })
    .join("");

  const grandTotal = sizeTotals.reduce((a, b) => a + b, 0);
  const footCells = sizeTotals.map((t) => `<td class="numeric"><strong>${escapeHtml(t)}</strong></td>`).join("");

  return `
      <h2 class="section-h">Detalle consolidado del lote</h2>
      <table class="lines lines-cincho lines-unified">
        <thead>
          <tr>${headerRow1.join("")}</tr>
          <tr>${headerRow2}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr class="total-row">
            <td><strong>TOTAL LOTE</strong></td>
            ${footCells}
            <td class="numeric"><strong>${escapeHtml(grandTotal)}</strong></td>
            <td></td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </section>`;
}

function flatLineMergeKey(item, line) {
  return [
    String(item?.productCode || "").trim(),
    String(item?.productName || "").trim(),
    String(item?.colorName || "").trim(),
    String(line?.size || "").trim() || "—",
  ].join("|||");
}

/** Mezcla de tipos: una fila por código + producto + color + talla. */
function mergeBatchFlatLines(orders) {
  const map = new Map();
  sortProductionOrdersByCode(orders).forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    items.forEach((item) => {
      getItemExportLines(item).forEach((line) => {
        const key = flatLineMergeKey(item, line);
        if (!map.has(key)) {
          map.set(key, {
            productCode: item.productCode || "-",
            productName: item.productName || "-",
            colorName: item.colorName || "-",
            size: line.size || "—",
            qty: 0,
            observationParts: [],
          });
        }
        const r = map.get(key);
        r.qty += Number(line.plannedQty || 0);
        const obs = String(item?.observations || "").trim();
        if (obs) addObservationCount(r.observationParts, obs, line.plannedQty || 1);
      });
    });
  });
  return Array.from(map.values())
    .map((r) => ({
      ...r,
      observations: formatObservationsWithCounts(r.observationParts) || "—",
    }))
    .sort((a, b) => {
      const c0 = String(a.productCode).localeCompare(String(b.productCode), "es", {
        numeric: true,
        sensitivity: "base",
      });
      if (c0 !== 0) return c0;
      const c1 = String(a.colorName).localeCompare(String(b.colorName), "es", { sensitivity: "base" });
      if (c1 !== 0) return c1;
      return String(a.size).localeCompare(String(b.size), "es", { numeric: true, sensitivity: "base" });
    });
}

function buildUnifiedFlatDetailTable(orders) {
  const rows = mergeBatchFlatLines(orders);
  if (!rows.length) {
    return `<p class="empty-detail">Sin líneas de producto en el lote.</p></section>`;
  }

  const body = rows
    .map((r) => `
      <tr>
        <td>${escapeHtml(r.productCode)}</td>
        <td>${escapeHtml(r.productName)}</td>
        <td>${escapeHtml(r.colorName)}</td>
        <td>${escapeHtml(r.size)}</td>
        <td class="numeric">${escapeHtml(r.qty)}</td>
        <td class="col-comments">${escapeHtml(r.observations)}</td>
      </tr>`)
    .join("");

  return `
      <h2 class="section-h">Detalle consolidado del lote</h2>
      <table class="lines lines-flat-unified">
        <thead>
          <tr>
            <th>Código</th>
            <th>Producto</th>
            <th>Color</th>
            <th>Talla</th>
            <th>Cant.</th>
            <th>Comentarios</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

export function buildUnifiedBatchDocumentHtml(orders, options = {}) {
  const sorted = sortProductionOrdersByCode(orders);
  if (!sorted.length) return "";
  const generatedAt = options.generatedAt || new Date().toLocaleString("es-GT");
  const tasks = options.tasks || [];
  const includeSummary = options.includeSummary !== false;
  const intro = includeSummary
    ? buildBatchIntroWithSummaryHtml(sorted, tasks, generatedAt)
    : buildBatchIntroHtml(sorted, generatedAt);
  const mode = detectBatchTableMode(sorted);
  if (mode === "cincho") return intro + buildUnifiedCinchoDetailTable(sorted);
  if (mode === "matrix") return intro + buildUnifiedMatrixDetailTable(sorted);
  return intro + buildUnifiedFlatDetailTable(sorted);
}

/**
 * Abre ventana con OPs seleccionadas (mismo formato que imprimir una OP).
 */
export function openProductionOrdersBatchPrintWindow(orders, options = {}) {
  const sorted = sortProductionOrdersByCode(orders);
  if (!sorted.length) return false;
  const generatedAt = new Date().toLocaleString("es-GT");
  const tasks = options.tasks || [];
  const landscape = options.orientation === "landscape";
  const includeSummary = options.includeSummary !== false;
  const bodyHtml = buildUnifiedBatchDocumentHtml(sorted, { tasks, generatedAt, includeSummary });
  const codesLabel = batchRangeLabel(sorted);
  const orientNote = landscape ? "Horizontal" : "Vertical";
  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>OPs ${escapeHtml(codesLabel.slice(0, 80))}</title>
          <style id="print-page-size"></style>
          <style>${getBatchPrintDocumentStyles()}</style>
        </head>
        <body>
          ${getPrintOrientationToolbarHtml(landscape)}
          <div class="print-meta no-print">${sorted.length} orden(es) · ${orientNote}${includeSummary ? " · con resumen" : " · sin resumen"} · ${escapeHtml(generatedAt)}</div>
          ${bodyHtml}
        </body>
      </html>
    `);
  win.document.close();
  return true;
}

/** Impresión individual por OP (una hoja por orden). */
export function openProductionOrdersPerOpPrintWindow(orders, options = {}) {
  const sorted = sortProductionOrdersByCode(orders);
  if (!sorted.length) return false;
  const generatedAt = new Date().toLocaleString("es-GT");
  const tasks = options.tasks || [];
  const sections = sorted.map((order) => buildProductionOrderDocSection(order, { tasks, generatedAt })).join("");
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>OPs por hoja</title>
          <style id="print-page-size"></style>
          <style>${getBatchPrintDocumentStyles()}</style>
        </head>
        <body>
          ${getPrintOrientationToolbarHtml()}
          ${sections}
        </body>
      </html>
    `);
  win.document.close();
  return true;
}

const EXPORT_HEADERS = [
  "OP",
  "Tipo",
  "Proceso",
  "Estado",
  "Cliente/Dist.",
  "Vendedor",
  "Marca",
  "Inicio",
  "Entrega",
  "Cod. Producto",
  "Producto",
  "Color",
  "Talla",
  "Planificado",
  "Observaciones",
  "Avance OP",
];

export function buildUnifiedExportRows(orders, tasks = []) {
  const rows = [];
  sortProductionOrdersByCode(orders).forEach((order) => {
    const processDates = getOrderProcessDates(order.id, tasks, order.startDate, order.deliveryDate);
    const qtyProgress = getOrderQtyProgress(order.items);
    const stage = getProcessStage(order);
    const customer =
      order.orderType === "DISTRIBUTION" && order.distributionNumber
        ? order.distributionNumber
        : order.customerName || "-";
    const items = Array.isArray(order.items) ? order.items : [];
    const base = [
      order.code || "-",
      getTypeLabel(order.orderType),
      stage.label,
      getStatusLabel(order.status),
      customer,
      order.orderType === "DISTRIBUTION" ? "-" : order.sellerName || "-",
      order.orderType === "MARCAS" ? getOrderBrandDisplay(order) : "-",
      processDates.startValue ? formatDateGt(processDates.startValue) : "-",
      processDates.deliveryValue ? formatDateGt(processDates.deliveryValue) : "-",
    ];
    if (items.length === 0) {
      rows.push([...base, "-", "-", "-", "-", 0, "-", `${qtyProgress.pct}%`]);
      return;
    }
    items.forEach((item) => {
      getItemExportLines(item).forEach((line) => {
        rows.push([
          ...base,
          item.productCode || "-",
          item.productName || "-",
          item.colorName || "-",
          line.size || "-",
          line.plannedQty,
          item.observations || "-",
          `${qtyProgress.pct}%`,
        ]);
      });
    });
  });
  return rows;
}

function buildSummarySheetRows(orders, tasks) {
  return [
    ["OP", "Cliente", "Vendedor", "Tipo", "Entrega", "Total uds."],
    ...sortProductionOrdersByCode(orders).map((order) => {
      const processDates = getOrderProcessDates(order.id, tasks, order.startDate, order.deliveryDate);
      const qty = getOrderQtyProgress(order.items);
      return [
        order.code || "-",
        orderCustomerLabel(order),
        order.orderType === "DISTRIBUTION" ? "—" : order.sellerName || "—",
        getTypeLabel(order.orderType),
        processDates.deliveryValue ? formatDateGt(processDates.deliveryValue) : "—",
        qty.total,
      ];
    }),
  ];
}

/** Filas de detalle Excel: mismos criterios de consolidación que la impresión. */
function buildMergedBatchDetailExcelRows(orders) {
  const mode = detectBatchTableMode(orders);
  if (mode === "matrix") {
    const { detailRows } = mergeBatchMatrixGroups(orders);
    const rows = [];
    detailRows.forEach((g) => {
      Object.entries(g.colorQty).forEach(([color, qty]) => {
        if (Number(qty || 0) <= 0) return;
        rows.push([
          g.productCode,
          g.productName,
          color,
          "—",
          qty,
          formatObservationsWithCounts(g.observationsByColor[color] || []) || "—",
        ]);
      });
    });
    return rows;
  }
  if (mode === "cincho") {
    const lines = mergeBatchCinchoLines(orders);
    const rows = [];
    lines.forEach((item) => {
      const sizes = coerceSizesMap(item.sizes);
      Object.entries(sizes).forEach(([size, qty]) => {
        const q = Number(qty || 0);
        if (q <= 0) return;
        rows.push([
          item.productCode || "-",
          "—",
          item.colorName || "-",
          size,
          q,
          item.observations || "—",
        ]);
      });
    });
    return rows;
  }
  return mergeBatchFlatLines(orders).map((r) => [
    r.productCode,
    r.productName,
    r.colorName,
    r.size,
    r.qty,
    r.observations,
  ]);
}

/** Excel: resumen + detalle unificado (sin hoja por OP). */
export function downloadProductionOrdersBatchExcel(orders, tasks = []) {
  const sorted = sortProductionOrdersByCode(orders);
  if (!sorted.length) return false;

  const wb = XLSX.utils.book_new();
  const wsResumen = XLSX.utils.aoa_to_sheet(buildSummarySheetRows(sorted, tasks));
  XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen_clientes");

  const detailHeaders = ["Cod. Producto", "Producto", "Color", "Talla", "Cant.", "Comentarios"];
  const detailRows = buildMergedBatchDetailExcelRows(sorted);
  const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
  XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle_unificado");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `ordenes_produccion_${stamp}.xlsx`);
  return true;
}
