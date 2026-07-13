import { getTodayYmdGuatemala } from "./dateTimeHelper";
import { buildDeskSupervisorLegendLine, mesasListWithSupervisors } from "./deskSupervisorDisplay";

const STATUS_LABELS_PRINT = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En proceso",
};

const COLOR_PRIORITY = [
  { keys: ["negro", "negra"], header: "Negro" },
  { keys: ["cafe"], header: "Café" },
  { keys: ["tostado"], header: "Tostado" },
  { keys: ["whisky", "whiskey"], header: "Whisky" },
];

function stripDiacritics(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function normalizeColorKey(name) {
  return stripDiacritics(String(name || "").trim()).toLowerCase();
}

function priorityMatch(normKey) {
  for (let i = 0; i < COLOR_PRIORITY.length; i++) {
    const { keys } = COLOR_PRIORITY[i];
    for (const k of keys) {
      if (normKey === k || normKey.startsWith(`${k} `)) return i;
    }
  }
  return -1;
}

function headerLabelForColorNormKey(normKey, fallbackDisplay) {
  const idx = priorityMatch(normKey);
  if (idx >= 0) return COLOR_PRIORITY[idx].header;
  return fallbackDisplay || normKey;
}

function sortColorNormKeys(normKeys, displayByNormKey) {
  const unique = [...new Set(normKeys)].filter(Boolean);
  return unique.sort((a, b) => {
    const pa = priorityMatch(a);
    const pb = priorityMatch(b);
    if (pa !== pb) {
      if (pa === -1) return 1;
      if (pb === -1) return -1;
      return pa - pb;
    }
    const la = headerLabelForColorNormKey(a, displayByNormKey.get(a));
    const lb = headerLabelForColorNormKey(b, displayByNormKey.get(b));
    return la.localeCompare(lb, "es", { sensitivity: "base" });
  });
}

/**
 * Etiqueta legible para la hoja impresa según tipo de OP y prefijo de código.
 */
function formatProductionOrderTypeSheetLabel(orderType, productionOrderCode) {
  const ot = String(orderType || "").trim().toUpperCase();
  const code = String(productionOrderCode || "").trim().toUpperCase();
  if (ot === "VENTA_EN_LINEA" || code.startsWith("OPL-")) return "Venta en línea";
  if (ot === "CLIENTE_KIOSKO" || code.startsWith("OPCK-")) return "Kiosko";
  if (ot === "INTERNA" || ot === "OPI" || code.startsWith("OPI-")) return "Orden interna";
  if (ot === "DISTRIBUTION" || code.startsWith("OPD-")) return "Distribución";
  if (ot.startsWith("CINCHOS") || /^OPC/.test(code)) return "Cinchos";
  if (ot === "MARCAS" || ot === "OPV" || code.startsWith("OPV-")) return "OPV";
  if (ot === "NORMAL") {
    if (code.startsWith("OPV-")) return "OPV";
    if (code.startsWith("OPK-")) return "OPK";
    return "OPK";
  }
  if (code.startsWith("OPK-")) return "OPK";
  if (code.startsWith("OPL-")) return "Venta en línea";
  if (ot) return ot;
  return "-";
}

function flattenTaskLines(task, orderMap) {
  const opCode = String(task.productionOrderCode || "").trim();
  const po = orderMap.get(Number(task.productionOrderId));
  const tipo = formatProductionOrderTypeSheetLabel(po?.orderType, opCode);
  const items = Array.isArray(task.items) && task.items.length > 0 ? task.items : null;

  const lines = [];
  if (items) {
    for (const it of items) {
      const pc = String(it.productCode || "").trim();
      if (!pc) continue;
      const colorName = String(it.colorName || "").trim();
      lines.push({
        productKey: pc.toUpperCase(),
        productCode: pc,
        productName: String(it.productName || "").trim(),
        colorName,
        qty: Number(it.quantity || 0),
        opCode,
        desk: task.desk,
        tipo,
        status: task.status,
      });
    }
    return lines;
  }
  const pc = String(task.productCode || "").trim();
  if (!pc) return lines;
  lines.push({
    productKey: pc.toUpperCase(),
    productCode: pc,
    productName: String(task.productName || "").trim(),
    colorName: String(task.colorName || "").trim(),
    qty: Number(task.quantity || 0),
    opCode,
    desk: task.desk,
    tipo,
    status: task.status,
  });
  return lines;
}

function hasAssignedDesk(task) {
  const d = task.desk;
  if (d === null || d === undefined || d === "") return false;
  return true;
}

/**
 * @param {object[]} tasks
 * @param {object[]} productionOrders
 * @param {{
 *   workDateYmd?: string,
 *   deskSupervisorByDesk?: Record<number|string, string>,
 *   numDesksForLegend?: number,
 * }} [options]
 */
export function buildProductionTasksSheetPrintModel(tasks, productionOrders, options = {}) {
  const workDateYmd = String(options.workDateYmd || getTodayYmdGuatemala()).slice(0, 10);
  const deskSupervisorByDesk = options.deskSupervisorByDesk || {};
  const numDesksForLegend =
    options.numDesksForLegend && options.numDesksForLegend > 0
      ? options.numDesksForLegend
      : 12;
  const deskSupervisorLegend = buildDeskSupervisorLegendLine(deskSupervisorByDesk, numDesksForLegend);
  const orderMap = new Map((productionOrders || []).map((o) => [Number(o.id), o]));

  const filtered = (tasks || []).filter((t) => {
    if (!t) return false;
    if (String(t.scheduledDate || "").slice(0, 10) !== workDateYmd) return false;
    if (!hasAssignedDesk(t)) return false;
    const st = String(t.status || "").toUpperCase();
    if (st !== "PENDING" && st !== "IN_PROGRESS") return false;
    return true;
  });

  const lines = [];
  for (const t of filtered) {
    lines.push(...flattenTaskLines(t, orderMap));
  }

  if (lines.length === 0) {
    return {
      workDateYmd,
      deskSupervisorLegend,
      rows: [],
      colorColumns: [],
      emptyMessage:
        "No hay tareas del organizador pendientes o en proceso con mesa asignada para esta fecha.",
    };
  }

  /** @type {Map<string, { productCode: string, productName: string, opCodes: Set<string>, mesas: Set<number>, tipos: Set<string>, statuses: Set<string>, qtyByNormKey: Map<string, number> }>} */
  const groups = new Map();
  /** @type {Map<string, string>} */
  const displayByNormKey = new Map();

  for (const ln of lines) {
    const g = groups.get(ln.productKey) || {
      productKey: ln.productKey,
      productCode: ln.productCode,
      productName: ln.productName,
      opCodes: new Set(),
      mesas: new Set(),
      tipos: new Set(),
      statuses: new Set(),
      qtyByNormKey: new Map(),
    };
    if (ln.productName && (!g.productName || ln.productName.length > g.productName.length)) {
      g.productName = ln.productName;
    }
    if (ln.opCode) g.opCodes.add(ln.opCode);
    if (ln.desk != null && ln.desk !== "") g.mesas.add(Number(ln.desk));
    g.tipos.add(ln.tipo);
    if (ln.status) g.statuses.add(String(ln.status).toUpperCase());
    const nk = normalizeColorKey(ln.colorName);
    if (nk) {
      if (!displayByNormKey.has(nk)) displayByNormKey.set(nk, ln.colorName || nk);
      g.qtyByNormKey.set(nk, (g.qtyByNormKey.get(nk) || 0) + ln.qty);
    }
    groups.set(ln.productKey, g);
  }

  if (groups.size === 0) {
    return {
      workDateYmd,
      deskSupervisorLegend,
      rows: [],
      colorColumns: [],
      emptyMessage:
        "No hay tareas del organizador con mesa para esta fecha (sin líneas de producto válidas).",
    };
  }

  const allNormKeys = [];
  for (const g of groups.values()) {
    for (const k of g.qtyByNormKey.keys()) allNormKeys.push(k);
  }
  const sortedNormKeys = sortColorNormKeys(allNormKeys, displayByNormKey);
  const colorColumns = sortedNormKeys.map((normKey) => ({
    normKey,
    header: headerLabelForColorNormKey(normKey, displayByNormKey.get(normKey)),
  }));

  const rows = [...groups.values()]
    .sort((a, b) => a.productCode.localeCompare(b.productCode, "es", { sensitivity: "base" }))
    .map((g) => {
      const ops = [...g.opCodes].filter(Boolean).sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
      const mesasSorted = [...g.mesas].sort((a, b) => a - b);
      const mesas = mesasListWithSupervisors(mesasSorted, deskSupervisorByDesk);
      const tipos = [...g.tipos].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
      const estadoParts = [...g.statuses].map((s) => STATUS_LABELS_PRINT[s] || s);
      const estado = [...new Set(estadoParts)].sort().join(", ");
      const article = [g.productCode, g.productName].filter(Boolean).join(" ").trim() || g.productCode;
      const qtyByNormKey = Object.fromEntries(g.qtyByNormKey);
      return {
        tipo: tipos.join(", "),
        ops: ops.join(", "),
        mesas,
        estado,
        article,
        qtyByNormKey,
      };
    });

  return { workDateYmd, deskSupervisorLegend, rows, colorColumns, emptyMessage: null };
}
