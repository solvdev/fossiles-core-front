import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";

/** Avance por orden en piezas: etapas, filtros, textos y exportación a Excel. */

export const ORDER_TYPE_LABELS = {
  NORMAL: "Normal",
  CLIENTE_KIOSKO: "Kiosko",
  VENTA_EN_LINEA: "Venta en línea",
  INTERNA: "Interna",
  MARCAS: "Marcas",
  CINCHOS_FOSSILES: "Cinchos",
};

export const ORDER_STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En proceso",
  IN_QA: "En QA",
};

/** Etapas de la más avanzada a la más atrasada (así se llena la barra, de izquierda a derecha). */
export const STAGES = [
  { key: "done", label: "Terminadas", short: "terminadas", color: "#10b981", text: "#047857", xls: "D1FAE5" },
  { key: "warehouse", label: "En bodega/QA", short: "en bodega/QA", color: "#8b5cf6", text: "#6d28d9", xls: "EDE9FE" },
  { key: "inProgress", label: "En mesa", short: "en mesa", color: "#3b82f6", text: "#1d4ed8", xls: "DBEAFE" },
  { key: "pending", label: "Por iniciar", short: "por iniciar", color: "#fbbf24", text: "#b45309", xls: "FEF3C7" },
  { key: "noTask", label: "Sin tarea", short: "sin tarea", color: "#d1d5db", text: "#4b5563", xls: "F3F4F6" },
];

export const TASK_STATUS = {
  IN_PROGRESS: { label: "En mesa", color: "#1d4ed8", bg: "#dbeafe" },
  PENDING: { label: "Por iniciar", color: "#b45309", bg: "#fef3c7" },
  AWAITING_WAREHOUSE: { label: "En bodega/QA", color: "#6d28d9", bg: "#ede9fe" },
  COMPLETED: { label: "Terminada", color: "#047857", bg: "#d1fae5" },
};

export const WORKFLOW_LABELS = {
  PENDING_LEATHER: "Falta cuero",
  PENDING_DIE_CUT: "Falta troquelar",
  PENDING_TABLE_ENTRY: "Sin mesa asignada",
  PENDING_MATERIAL_DELIVERY: "Faltan materiales",
  READY_TO_START: "Lista para iniciar",
  IN_PRODUCTION: "Trabajándose",
  PENDING_WAREHOUSE_RECEIPT: "Esperando recepción en bodega",
  COMPLETED: "Terminada",
};

export const fmtInt = (v) => Number(v || 0).toLocaleString("es-GT");
export const fmtDate = (v) => {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : String(v);
};

const EMPTY_STAGES = { units: 0, noTask: 0, pending: 0, inProgress: 0, warehouse: 0, done: 0 };

export const pctOf = (part, total) => (total > 0 ? Math.round((Number(part || 0) * 100) / total) : 0);

/** «120 pzas: 20 terminadas · 10 en bodega/QA · …» sin las etapas en cero. */
export function stagesText(stages) {
  const s = stages || EMPTY_STAGES;
  const parts = STAGES.filter((st) => Number(s[st.key] || 0) > 0).map((st) => `${fmtInt(s[st.key])} ${st.short}`);
  return `${fmtInt(s.units)} pzas${parts.length ? `: ${parts.join(" · ")}` : ""}`;
}

/** Texto de la fecha de entrega: «Atrasada 3 días», «Hoy», «Mañana», «Faltan 5 días». */
export function deliveryLabel(order) {
  const d = order?.daysToDelivery;
  if (d == null) return { text: "Sin fecha", tone: "#6b7280", bg: "#f3f4f6" };
  if (d < 0) return { text: `Atrasada ${Math.abs(d)} ${Math.abs(d) === 1 ? "día" : "días"}`, tone: "#b91c1c", bg: "#fee2e2" };
  if (d === 0) return { text: "Entrega hoy", tone: "#b45309", bg: "#fef3c7" };
  if (d === 1) return { text: "Entrega mañana", tone: "#b45309", bg: "#fef3c7" };
  if (d <= 3) return { text: `Faltan ${d} días`, tone: "#b45309", bg: "#fffbeb" };
  return { text: `Faltan ${d} días`, tone: "#047857", bg: "#ecfdf5" };
}

// LocalDateTime de Java (hora Guatemala, sin zona) → Date. Guatemala es siempre UTC-6.
const GT_OFFSET_H = 6;
const parseGt = (value) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || ""));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + GT_OFFSET_H, +m[5]));
};

/** «08:15» si es de hoy; «27/10 08:15» si es de otro día. */
export function timeLabel(value, todayYmd) {
  if (!value) return "";
  const text = String(value);
  const hhmm = text.slice(11, 16);
  if (todayYmd && text.slice(0, 10) === todayYmd) return hhmm;
  return `${text.slice(8, 10)}/${text.slice(5, 7)} ${hhmm}`;
}

/** Tiempo desde una hora del servidor hasta ahora: «2 h 10 min», «3 días». */
export function elapsedLabel(value, now = new Date()) {
  const start = parseGt(value);
  if (!start) return "";
  const min = Math.max(0, Math.round((now.getTime() - start.getTime()) / 60000));
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ${min % 60} min`;
  const days = Math.floor(min / (24 * 60));
  return `${days} ${days === 1 ? "día" : "días"}`;
}

export const taskProductsText = (task) =>
  (task?.lines || [])
    .map((l) => `${l.productCode || l.productName || "?"}${l.colorName ? ` ${l.colorName}` : ""} ×${fmtInt(l.quantity)}`)
    .join(", ");

export const orderTypesIn = (data) =>
  [...new Set((data?.orders || []).map((o) => o.orderType).filter(Boolean))].sort();

const addStages = (acc, s) => {
  Object.keys(EMPTY_STAGES).forEach((k) => {
    acc[k] += Number(s?.[k] || 0);
  });
  return acc;
};

/**
 * Filtra y recalcula totales.
 * - search mira OP, cliente, vendedor, productos de las líneas y códigos de tarea.
 * - onlyWorking: OP con al menos una tarea en mesa ahora.
 * - onlyLate: OP con la fecha de entrega vencida.
 */
export function buildProgressView(data, { orderType = "ALL", search = "", onlyWorking = false, onlyLate = false } = {}) {
  const term = search.trim().toLowerCase();
  const orders = (data?.orders || []).filter((o) => {
    if (orderType !== "ALL" && o.orderType !== orderType) return false;
    if (onlyWorking && !(o.tasksInProgress > 0)) return false;
    if (onlyLate && !o.late) return false;
    if (!term) return true;
    const hay = [
      o.code, o.customerName, o.sellerName,
      ...(o.lines || []).flatMap((l) => [l.productCode, l.productName, l.colorName, l.brandName]),
      ...(o.tasks || []).map((t) => t.code),
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(term);
  });

  const stages = orders.reduce((acc, o) => addStages(acc, o.stages), { ...EMPTY_STAGES });
  const inProgressTaskIds = new Set();
  orders.forEach((o) => (o.tasks || []).forEach((t) => {
    if (t.status === "IN_PROGRESS") inProgressTaskIds.add(t.taskId);
  }));
  const totals = {
    orders: orders.length,
    lateOrders: orders.filter((o) => o.late).length,
    lateUnits: orders.filter((o) => o.late).reduce((s, o) => s + Number(o.stages?.units || 0) - Number(o.stages?.done || 0), 0),
    ordersWorkingNow: orders.filter((o) => o.tasksInProgress > 0).length,
    tasksInProgress: inProgressTaskIds.size,
    stages,
  };
  return { orders, totals };
}

// ==================== Excel ====================

const border = { style: "thin", color: { rgb: "D1D5DB" } };
const cellBorder = { top: border, right: border, bottom: border, left: border };
const headStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "1F2937" } },
  alignment: { vertical: "center", wrapText: true },
  border: cellBorder,
};
const titleStyle = { font: { bold: true, sz: 14 } };
const metaStyle = { font: { color: { rgb: "6B7280" }, sz: 10 } };
const intStyle = { numFmt: "#,##0", border: cellBorder };
const pctStyle = { numFmt: "0%", border: cellBorder };
const textStyle = { border: cellBorder };
const lateTextStyle = { ...textStyle, font: { bold: true, color: { rgb: "B91C1C" } }, fill: { fgColor: { rgb: "FEF2F2" } } };
const boldTextStyle = { ...textStyle, font: { bold: true } };
const totalStyle = { font: { bold: true }, fill: { fgColor: { rgb: "F3F4F6" } }, border: cellBorder };
const totalIntStyle = { ...totalStyle, numFmt: "#,##0" };
const totalPctStyle = { ...totalStyle, numFmt: "0%" };
const stageHead = (rgb) => ({ ...headStyle, fill: { fgColor: { rgb } }, font: { bold: true, color: { rgb: "111827" } } });
const stageCell = (rgb) => ({ ...intStyle, fill: { fgColor: { rgb } } });

/** columns: [{ label, width, value(row), type: "text"|"int"|"pct", style?(row), head? }] */
function buildSheet(title, subtitle, columns, rows, totalRow) {
  const aoa = [
    [{ v: title, s: titleStyle }],
    [{ v: subtitle, s: metaStyle }],
    [],
    columns.map((c) => ({ v: c.label, s: c.head || headStyle })),
  ];
  rows.forEach((r) => {
    aoa.push(columns.map((c) => {
      const v = c.value(r);
      const custom = c.style ? c.style(r) : null;
      if (c.type === "int") return { v: Number(v || 0), t: "n", s: custom || intStyle };
      if (c.type === "pct") return { v: Number(v || 0), t: "n", s: custom || pctStyle };
      return { v: v ?? "", t: "s", s: custom || textStyle };
    }));
  });
  if (totalRow) {
    aoa.push(columns.map((c, i) => {
      const v = totalRow[i];
      if (v == null || v === "") return { v: "", s: totalStyle };
      if (c.type === "int") return { v: Number(v), t: "n", s: totalIntStyle };
      if (c.type === "pct") return { v: Number(v), t: "n", s: totalPctStyle };
      return { v, t: "s", s: totalStyle };
    }));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({ wch: c.width || 14 }));
  ws["!rows"] = [{ hpt: 22 }, {}, {}, { hpt: 30 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + rows.length, c: columns.length - 1 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 4 };
  return ws;
}

const ymd = (v) => (v ? String(v).slice(0, 10) : "");
const ymdhm = (v) => (v ? String(v).slice(0, 16).replace("T", " ") : "");
const yesNo = (v) => (v ? "Sí" : "No");

const stageColumns = (get) => STAGES.slice().reverse().map((st) => ({
  label: st.label, width: 11, type: "int", head: stageHead(st.xls), style: () => stageCell(st.xls),
  value: (r) => get(r)?.[st.key] || 0,
}));

export function exportOrderProgressExcel(view, filtersLabel) {
  const meta = `Generado ${formatNowGt()} · OP activas (pendiente, en proceso, en QA)${filtersLabel ? ` · ${filtersLabel}` : ""}`;
  const wb = XLSX.utils.book_new();
  const t = view.totals.stages;

  const orderCols = [
    { label: "OP", width: 13, value: (o) => o.code, style: () => boldTextStyle },
    { label: "Cliente", width: 26, value: (o) => o.customerName || "" },
    { label: "Tipo", width: 13, value: (o) => ORDER_TYPE_LABELS[o.orderType] || o.orderType || "" },
    { label: "Estado", width: 11, value: (o) => ORDER_STATUS_LABELS[o.status] || o.status || "" },
    { label: "Entrega", width: 11, value: (o) => ymd(o.deliveryDate) },
    { label: "Situación", width: 16, value: (o) => deliveryLabel(o).text, style: (o) => (o.late ? lateTextStyle : textStyle) },
    { label: "Piezas pedidas", width: 10, type: "int", value: (o) => o.stages?.units, style: () => ({ ...intStyle, font: { bold: true } }) },
    ...stageColumns((o) => o.stages),
    { label: "% terminado", width: 10, type: "pct", value: (o) => (o.stages?.units ? (o.stages.done || 0) / o.stages.units : 0) },
    { label: "Recibidas en bodega", width: 11, type: "int", value: (o) => o.receivedUnits },
    { label: "Tareas", width: 8, type: "int", value: (o) => o.taskCount },
    { label: "Tareas en mesa", width: 9, type: "int", value: (o) => o.tasksInProgress },
    {
      label: "Trabajándose ahora", width: 50,
      value: (o) => (o.tasks || []).filter((tk) => tk.status === "IN_PROGRESS")
        .map((tk) => `${tk.desk != null ? `Mesa ${tk.desk}` : "Sin mesa"}: ${tk.code} (${taskProductsText(tk)})${tk.paused ? " PAUSADA" : ""}${tk.delayed ? " ATRASADA" : ""}`)
        .join(" | "),
    },
  ];
  const stageTotals = STAGES.slice().reverse().map((st) => t[st.key]);
  XLSX.utils.book_append_sheet(wb, buildSheet("Avance por orden (piezas)", meta, orderCols, view.orders, [
    "TOTAL", `${fmtInt(view.totals.orders)} OP`, "", "", "", `${fmtInt(view.totals.lateOrders)} atrasadas`,
    t.units, ...stageTotals, t.units ? t.done / t.units : 0,
    view.orders.reduce((s, o) => s + Number(o.receivedUnits || 0), 0),
    view.orders.reduce((s, o) => s + Number(o.taskCount || 0), 0),
    view.totals.tasksInProgress, "",
  ]), "Resumen por OP");

  const taskRows = view.orders.flatMap((o) => (o.tasks || []).map((tk) => ({ o, tk })));
  const taskCols = [
    { label: "OP", width: 13, value: (r) => r.o.code, style: () => boldTextStyle },
    { label: "Cliente", width: 22, value: (r) => r.o.customerName || "" },
    { label: "Entrega OP", width: 11, value: (r) => ymd(r.o.deliveryDate) },
    { label: "Tarea", width: 12, value: (r) => r.tk.code, style: () => boldTextStyle },
    { label: "Estado", width: 13, value: (r) => TASK_STATUS[r.tk.status]?.label || r.tk.status || "" },
    { label: "Flujo", width: 22, value: (r) => WORKFLOW_LABELS[r.tk.workflowStatus] || r.tk.workflowStatus || "" },
    { label: "Mesa", width: 7, value: (r) => (r.tk.desk != null ? String(r.tk.desk) : r.tk.workedDesk != null ? `(${r.tk.workedDesk})` : "") },
    { label: "Piezas de la OP", width: 9, type: "int", value: (r) => r.tk.units },
    { label: "Productos", width: 40, value: (r) => taskProductsText(r.tk) },
    { label: "Extra de", width: 11, value: (r) => (r.tk.baseOrderCode ? r.tk.baseOrderCode : "") },
    { label: "Programada", width: 11, value: (r) => ymd(r.tk.scheduledDate) },
    { label: "Inició", width: 16, value: (r) => ymdhm(r.tk.startedAt) },
    { label: "Pausada desde", width: 16, value: (r) => (r.tk.paused ? ymdhm(r.tk.pausedAt) : "") },
    { label: "Atrasada", width: 9, value: (r) => (r.tk.delayed ? "Sí" : ""), style: (r) => (r.tk.delayed ? lateTextStyle : textStyle) },
    { label: "Terminó", width: 16, value: (r) => ymdhm(r.tk.completedAt) },
    { label: "Cuero entregado", width: 9, value: (r) => yesNo(r.tk.leatherDelivered) },
    { label: "Materiales entregados", width: 11, value: (r) => (r.tk.requiresMaterials ? yesNo(r.tk.materialsDelivered) : "No lleva") },
    { label: "Troquelado", width: 10, value: (r) => yesNo(r.tk.dieCutReady) },
  ];
  XLSX.utils.book_append_sheet(wb, buildSheet("Tareas por orden", meta, taskCols, taskRows, null), "Tareas");

  const lineRows = view.orders.flatMap((o) => (o.lines || []).map((l) => ({ o, l })));
  const lineCols = [
    { label: "OP", width: 13, value: (r) => r.o.code, style: () => boldTextStyle },
    { label: "Cliente", width: 22, value: (r) => r.o.customerName || "" },
    { label: "Entrega", width: 11, value: (r) => ymd(r.o.deliveryDate) },
    { label: "Código", width: 11, value: (r) => r.l.productCode || "" },
    { label: "Producto", width: 28, value: (r) => r.l.productName || "" },
    { label: "Color", width: 14, value: (r) => r.l.colorName || "" },
    { label: "Marca", width: 12, value: (r) => r.l.brandName || "" },
    { label: "Pedidas", width: 9, type: "int", value: (r) => r.l.stages?.units, style: () => ({ ...intStyle, font: { bold: true } }) },
    ...stageColumns((r) => r.l.stages),
    { label: "Recibidas en bodega", width: 11, type: "int", value: (r) => r.l.receivedUnits },
    { label: "Extras OPL", width: 9, type: "int", value: (r) => r.l.extraUnits },
  ];
  XLSX.utils.book_append_sheet(wb, buildSheet("Avance por línea de producto", meta, lineCols, lineRows, [
    "TOTAL", "", "", "", "", "", "", t.units, ...stageTotals, "", "",
  ]), "Por producto");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `avance_por_orden_${stamp}.xlsx`);
}
