/**
 * Kardex (materiales, producto terminado y archivo histórico) con un solo modelo:
 * cada movimiento se normaliza a «entra o sale una cantidad y queda este saldo», con un nombre
 * en español y un color por dirección. Así las tres pantallas y el Excel dicen lo mismo.
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v) => (v === null || v === undefined || v === "" ? null : num(v));

export const DIRECTIONS = {
  IN: { key: "IN", label: "Entrada", plural: "Entradas", color: "#047857", bg: "#d1fae5", xlsText: "065F46", xlsFill: "D1FAE5" },
  OUT: { key: "OUT", label: "Salida", plural: "Salidas", color: "#b91c1c", bg: "#fee2e2", xlsText: "991B1B", xlsFill: "FEE2E2" },
  ADJUST: { key: "ADJUST", label: "Ajuste", plural: "Ajustes", color: "#4338ca", bg: "#e0e7ff", xlsText: "3730A3", xlsFill: "E0E7FF" },
};

export const DIRECTION_ORDER = ["IN", "OUT", "ADJUST"];

/** Tipos de movimiento conocidos: nombre en español y si suman, restan o ajustan. */
export const MOVEMENT_TYPES = {
  // Materiales
  ENTRY: { label: "Entrada", dir: "IN" },
  EXIT: { label: "Salida", dir: "OUT" },
  ADJUSTMENT: { label: "Ajuste", dir: "ADJUST" },
  // Producto terminado
  PRODUCTION_ENTRY: { label: "Entrada de producción", dir: "IN" },
  SALE_EXIT: { label: "Venta", dir: "OUT" },
  TRANSFER_IN: { label: "Transferencia: entra", dir: "IN" },
  TRANSFER_OUT: { label: "Transferencia: sale", dir: "OUT" },
  RETURN: { label: "Devolución", dir: "IN" },
  ONLINE_SALE_DISPATCH: { label: "Despacho de venta en línea", dir: "OUT" },
  ONLINE_SALE_DISPATCH_REVERSAL: { label: "Anulación de despacho en línea", dir: "IN" },
  ONLINE_SALE_PREPARE: { label: "Preparación de venta en línea", dir: "OUT" },
  ONLINE_SALE_PREPARE_REVERSAL: { label: "Anulación de preparación en línea", dir: "IN" },
  ONLINE_SALE_RETURN: { label: "Devolución de venta en línea", dir: "IN" },
  SHIPMENT: { label: "Envío", dir: "OUT" },
  SHIPMENT_REVERSAL: { label: "Anulación de envío", dir: "IN" },
  RESERVE_RELEASE: { label: "Entrega desde la reserva", dir: "OUT" },
  // Línea que arma el servidor al juntar el kardex archivado: la limpieza dejó la bodega en 0.
  CORTE_INVENTARIO: { label: "Corte de inventario", dir: "ADJUST" },
};

const humanize = (type) => {
  const text = String(type || "").toLowerCase().replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Movimiento";
};

/** Nombre claro del movimiento; en materiales afina «Entrada»/«Salida» con la referencia. */
export function movementLabel(type, referenceType = "") {
  const ref = String(referenceType || "").toUpperCase();
  if (type === "ENTRY" && (ref.includes("PURCHASE") || ref.includes("RECEIPT"))) return "Entrada por compra";
  if (type === "EXIT" && (ref.includes("PRODUCTION") || ref.includes("TASK"))) return "Salida a producción";
  return MOVEMENT_TYPES[type]?.label || humanize(type);
}

/** Separa la nota «[FIFO: …]» de la descripción para mostrarla aparte. */
export function splitFifoNote(description) {
  const text = String(description || "");
  const match = text.match(/\[FIFO:.*?\]/);
  if (!match) return { text: text.trim(), fifo: "" };
  return { text: text.replace(match[0], "").replace(/\s{2,}/g, " ").trim(), fifo: match[0].replace(/^\[|\]$/g, "").replace(/^FIFO:\s*/i, "").trim() };
}

const toTs = (value) => {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : 0;
};

/** Normaliza una fila del servidor (materiales, producto o archivo histórico). */
export function normalizeKardexRow(r, index = 0) {
  const known = MOVEMENT_TYPES[r.movementType];
  const qin = num(r.cantidadEntrada);
  const qout = num(r.cantidadSalida);
  const rawQty = numOrNull(r.quantity);

  let change = qin - qout;
  if (change === 0 && rawQty !== null && rawQty !== 0) {
    if (known?.dir === "IN") change = Math.abs(rawQty);
    else if (known?.dir === "OUT") change = -Math.abs(rawQty);
    else change = rawQty;
  }

  const dir = known?.dir || (change > 0 ? "IN" : change < 0 ? "OUT" : "ADJUST");
  const entering = change > 0;
  const value = entering ? num(r.totalEntrada) || num(r.totalCost) : num(r.totalSalida) || num(r.totalCost);
  const unitCost = entering ? num(r.costoUnitarioEntrada) || num(r.unitCost) : num(r.costoUnitarioSalida) || num(r.unitCost);
  const note = splitFifoNote(r.description);

  return {
    key: String(r.id ?? `row-${index}`),
    id: r.id ?? index,
    date: r.movementDate || r.createdAt || "",
    ts: toTs(r.movementDate || r.createdAt),
    type: r.movementType || "",
    typeLabel: movementLabel(r.movementType, r.referenceType),
    direction: dir,
    change,
    qtyIn: change > 0 ? change : 0,
    qtyOut: change < 0 ? -change : 0,
    before: numOrNull(r.quantityBefore),
    after: numOrNull(r.quantityAfter),
    unitCost,
    value,
    reference: r.referenceNumber || r.referenceType || "",
    referenceType: r.referenceType || "",
    referenceId: r.referenceId ?? null,
    description: note.text,
    fifo: note.fifo,
    // Ítem
    itemId: r.materialId ?? r.productId ?? null,
    name: r.materialName || r.productName || "",
    code: r.materialSku || r.productCode || "",
    unit: r.uomCode || r.uomName || "",
    color: r.colorName || "",
    size: r.sizeLabel || "",
    location: r.locationName || "",
    locationCode: r.locationCode || "",
    locationId: r.locationId ?? null,
    archive: r.archiveReference || "",
    lots: (r.lotesFifo || []).map((l) => ({
      date: l.fechaEntrada,
      quantity: num(l.cantidad),
      unitCost: num(l.costoUnitario),
      total: num(l.total),
    })),
  };
}

export const normalizeKardexRows = (rows) => (rows || []).map((r, i) => normalizeKardexRow(r, i));

/** Más reciente primero (o al revés); a igual fecha manda el orden de registro. */
export function sortKardexRows(rows, dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (a.ts !== b.ts) return (a.ts - b.ts) * sign;
    return (num(a.id) - num(b.id)) * sign;
  });
}

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** `from` y `to` son YYYY-MM-DD; el texto busca en referencia, descripción y datos del ítem. */
export function filterKardexRows(rows, { direction = "ALL", type = "ALL", from = "", to = "", search = "" } = {}) {
  const q = norm(search).trim();
  return rows.filter((r) => {
    if (direction !== "ALL" && r.direction !== direction) return false;
    if (type !== "ALL" && r.type !== type) return false;
    const day = String(r.date).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (!q) return true;
    return norm(
      `${r.typeLabel} ${r.reference} ${r.description} ${r.name} ${r.code} ${r.color} ${r.location} ${r.locationCode}`
    ).includes(q);
  });
}

export function countByDirection(rows) {
  const out = { IN: 0, OUT: 0, ADJUST: 0 };
  rows.forEach((r) => {
    out[r.direction] += 1;
  });
  return out;
}

/** Tipos que sí aparecen en los datos, para que el filtro nunca ofrezca uno que no existe ni omita uno que sí. */
export function typesPresent(rows) {
  const map = new Map();
  rows.forEach((r) => {
    const g = map.get(r.type) || { key: r.type, label: r.typeLabel, direction: r.direction, count: 0 };
    g.count += 1;
    map.set(r.type, g);
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

const seriesKey = (r) => `${r.itemId}|${r.color}|${r.size}|${r.locationId ?? r.location}`;

/**
 * Totales del kardex. Con un solo ítem (y ubicación) hay saldo inicial y final; con varios solo el neto,
 * porque sumar saldos de cosas distintas no significa nada.
 */
export function summarizeKardex(rows) {
  const out = { count: rows.length, totalIn: 0, totalOut: 0, net: 0, valueIn: 0, valueOut: 0, single: false, opening: null, closing: null, from: "", to: "" };
  if (!rows.length) return out;
  rows.forEach((r) => {
    out.totalIn += r.qtyIn;
    out.totalOut += r.qtyOut;
    if (r.change > 0) out.valueIn += r.value;
    else if (r.change < 0) out.valueOut += r.value;
  });
  out.net = out.totalIn - out.totalOut;
  const asc = sortKardexRows(rows, "asc");
  out.from = asc[0].date;
  out.to = asc[asc.length - 1].date;
  out.single = new Set(rows.map(seriesKey)).size === 1;
  if (out.single) {
    out.opening = asc[0].before;
    out.closing = asc[asc.length - 1].after;
  }
  return out;
}

export const fmtNum = (v) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-GT", { maximumFractionDigits: 3 });
};

export const fmtMoney = (v) =>
  `Q${num(v).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDay = (v) => {
  if (!v) return "—";
  const [y, m, d] = String(v).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : String(v);
};

/** Cantidad con signo para la fila: «+12», «−3». */
export const signedQty = (change) => {
  if (!change) return "0";
  return `${change > 0 ? "+" : "−"}${fmtNum(Math.abs(change))}`;
};
