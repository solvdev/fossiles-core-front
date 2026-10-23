/**
 * Reglas puras de «Armar el día»: agrupar productos en tareas y medir cada tarea contra el
 * límite de la mesa.
 *
 * Reglas que se conservan tal cual del Organizador de Tareas (espejo de
 * ProductionPlanningConstants en el back):
 *  - 4 h es lo ideal por tarea y 5 h el tope duro: sobre 5 h no se confirma.
 *  - Las líneas de OPL (venta en línea) no cuentan contra el límite.
 *  - Una tarea no mezcla OPs base distintas; las OPL pueden ir como extra.
 *
 * Nada aquí toca el servidor: el servidor vuelve a validar todo al confirmar.
 */
import { MAX_HOURS_PER_DESK, MAX_HOURS_PER_TASK_HARD_CAP } from "./taskHoursHelper";

const EPS = 1e-9;

/** Desde aquí la barra pasa a ámbar: 80 % de las 4 h ideales (3.2 h). */
export const NEAR_LIMIT_HOURS = Math.round(MAX_HOURS_PER_DESK * 0.8 * 100) / 100;

/** Horas por unidad cuando el producto no tiene tiempo configurado (igual que el back). */
export const DEFAULT_HOURS_PER_UNIT = 0.1;

const round2 = (n) => Math.round(n * 100) / 100;

/** Horas de una cantidad: mismo redondeo que el borrador del Organizador. */
export function lineHours(quantity, prdTimePerUnit) {
  return round2((Number(quantity) || 0) * (prdTimePerUnit || DEFAULT_HOURS_PER_UNIT));
}

export function taskTotalHours(task) {
  return round2((task?.lines || []).reduce(
    (sum, l) => sum + lineHours(l.quantity, l.prdTimePerUnit), 0));
}

/** Lo que cuenta contra el límite: las tareas de OPL pesan cero. */
export function taskBaseHours(task) {
  return task?.onlineSale ? 0 : taskTotalHours(task);
}

/**
 * Estado de una tarea frente al límite.
 *  - opl:  no cuenta contra el límite
 *  - ok:   hasta 3.2 h
 *  - near: de 3.2 h a 5 h (pasar de 4 h se permite, pero se avisa)
 *  - over: más de 5 h, no se puede confirmar
 */
export function limitStatus(task) {
  const baseHours = taskBaseHours(task);
  const totalHours = taskTotalHours(task);
  let level = "ok";
  if (task?.onlineSale) level = "opl";
  else if (baseHours > MAX_HOURS_PER_TASK_HARD_CAP + EPS) level = "over";
  else if (baseHours > NEAR_LIMIT_HOURS + EPS) level = "near";
  const shown = level === "opl" ? totalHours : baseHours;
  return {
    level,
    baseHours,
    totalHours,
    /** Relleno de la barra, en % de la escala 0–5 h. */
    pct: Math.min(shown / MAX_HOURS_PER_TASK_HARD_CAP, 1) * 100,
    overIdeal: level !== "opl" && baseHours > MAX_HOURS_PER_DESK + EPS,
  };
}

/** Cantidad de un ítem que ya está repartida entre las tareas. */
export function assignedQuantity(tasks, productionOrderItemId) {
  return (tasks || []).reduce((sum, t) => sum + (t.lines || [])
    .filter((l) => l.productionOrderItemId === productionOrderItemId)
    .reduce((s, l) => s + l.quantity, 0), 0);
}

/** Lo que de un ítem aún no está en ninguna tarea. */
export function leftoverQuantity(item, tasks) {
  return Math.max(0, (item.remainingQuantity || 0) - assignedQuantity(tasks, item.productionOrderItemId));
}

let idSeq = 0;
const defaultNewId = () => `t${++idSeq}`;

function emptyTask(order, newId) {
  return {
    clientId: newId(),
    orderId: order.id,
    orderCode: order.code,
    family: order.family || null,
    onlineSale: !!order.onlineSale,
    luisFelipe: !!order.luisFelipe,
    groupId: order.groupId || null,
    groupCode: order.groupCode || null,
    customerName: order.customerName || null,
    lines: [],
  };
}

/** Línea de tarea a partir de un ítem del listado de OPs. */
export function lineFromItem(item, quantity) {
  const line = {
    productionOrderItemId: item.productionOrderItemId,
    productCode: item.productCode,
    productName: item.productName,
    colorName: item.colorName || null,
    quantity,
    prdTimePerUnit: item.prdTimePerUnit || DEFAULT_HOURS_PER_UNIT,
    unitsPerTask: item.unitsPerTask || null,
    remainingQuantity: item.remainingQuantity,
  };
  // En una tarea consolidada cada línea recuerda su OP.
  if (item.orderId) {
    line.orderId = item.orderId;
    line.orderCode = item.orderCode;
  }
  return line;
}

// ==================== OP consolidada ====================
//
// Varias OPV (o varias OPC) pequeñas de Luis Felipe se juntan en una OP consolidada desde el
// Tablero. Aquí sus tareas se arman juntas: productos de todas sus órdenes en las mismas
// tareas, con el mismo límite de 4 h ideal y 5 h tope. La OP de la primera línea es la
// cabecera y cada línea recuerda su OP. El servidor solo acepta mezclar órdenes de la misma
// consolidada activa (consolidateVendorOrders).

/** Prefijo que el servidor pone en las observaciones de una tarea consolidada. */
export const CONSOLIDATED_PREFIX = "Consolidada ";

/**
 * Consolidada y OPs de una tarea ya guardada, leídas de sus observaciones
 * («Consolidada LF-OPV-007: OPV-64, OPV-65 | notas»). null si no es consolidada.
 */
export function parseConsolidated(observations) {
  const text = String(observations || "").trim();
  const m = /^Consolidada\s+([^:]+):\s*([^|]*)/.exec(text);
  if (!m) return null;
  const codes = m[2].split(",").map((c) => c.trim()).filter(Boolean);
  return codes.length > 1 ? { groupCode: m[1].trim(), codes } : null;
}

/** OPs distintas que trabaja una tarea, en el orden de sus líneas. */
export function taskOrderCodes(task) {
  const codes = [];
  (task?.lines || []).forEach((l) => {
    const code = l.orderCode || task.orderCode;
    if (code && !codes.includes(code)) codes.push(code);
  });
  if (codes.length === 0 && task?.orderCode) codes.push(task.orderCode);
  return codes;
}

/** Tarea de una OP consolidada que de verdad junta más de una de sus órdenes. */
export function isConsolidatedTask(task) {
  return !!task?.groupId && !task.onlineSale && taskOrderCodes(task).length > 1;
}

/** Cabecera = OP de la primera línea. */
function withHeaderFromLines(task, ordersById) {
  const first = task.lines[0];
  const head = first?.orderId ? ordersById.get(first.orderId) : null;
  return head ? { ...task, orderId: head.id, orderCode: head.code, customerName: head.customerName || null } : { ...task };
}

/**
 * Reparte líneas de las órdenes de UNA consolidada en tareas de hasta `idealHours`, sin
 * importar de qué orden es cada una. Cada línea debe traer su `orderId` y `orderCode`.
 */
export function packGroupLines(lines, orders, opts = {}) {
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));
  const firstOrder = ordersById.get(lines[0]?.orderId) || { id: null, code: null };
  const wanted = (lines || []).map((l) => ({ item: { ...l }, quantity: l.quantity }));
  return packOrderLines(firstOrder, wanted, opts).map((t) => withHeaderFromLines(t, ordersById));
}

/**
 * Junta las tareas de cada OP consolidada: las de sus órdenes pasan a repartirse juntas.
 * Las tareas consolidadas quedan donde estaba la primera de su grupo; las demás no cambian.
 */
export function consolidateGroups(tasks, orders, opts = {}) {
  const ordersById = new Map((orders || []).map((o) => [o.id, o]));
  const byGroup = new Map();
  (tasks || []).forEach((t) => {
    if (!t.groupId || t.onlineSale || t.lines.length === 0) return;
    if (!byGroup.has(t.groupId)) byGroup.set(t.groupId, []);
    byGroup.get(t.groupId).push(t);
  });
  let out = tasks;
  byGroup.forEach((groupTasks) => {
    const orderIds = new Set(groupTasks.flatMap((t) => t.lines.map((l) => l.orderId || t.orderId)));
    if (orderIds.size < 2) return;
    const lines = [];
    groupTasks.forEach((t) => t.lines.forEach((l) => {
      const orderId = l.orderId || t.orderId;
      const same = lines.find((x) => x.productionOrderItemId === l.productionOrderItemId);
      if (same) same.quantity += l.quantity;
      else lines.push({ ...l, orderId, orderCode: l.orderCode || ordersById.get(orderId)?.code || t.orderCode });
    }));
    const ids = new Set(groupTasks.map((t) => t.clientId));
    const at = out.findIndex((t) => ids.has(t.clientId));
    const rest = out.filter((t) => !ids.has(t.clientId));
    out = [...rest.slice(0, at), ...packGroupLines(lines, orders, opts), ...rest.slice(at)];
  });
  return out;
}

/**
 * Parte las cantidades de UNA OP en tareas de hasta `idealHours`.
 *
 * @param order  OP (id, code, family, onlineSale, customerName)
 * @param wanted [{ item, quantity }]
 * @param opts   { idealHours = 4, newId }
 */
export function packOrderLines(order, wanted, opts = {}) {
  const idealHours = opts.idealHours ?? MAX_HOURS_PER_DESK;
  const newId = opts.newId || defaultNewId;
  const tasks = [];
  let current = null;
  let used = 0;

  (wanted || []).forEach(({ item, quantity }) => {
    const perUnit = item.prdTimePerUnit || DEFAULT_HOURS_PER_UNIT;
    let pending = quantity;
    while (pending > 0) {
      if (!current) {
        current = emptyTask(order, newId);
        tasks.push(current);
        used = 0;
      }
      const same = current.lines.find((l) => l.productionOrderItemId === item.productionOrderItemId);
      let fit = Math.floor((idealHours - used + EPS) / perUnit);
      // Unidades por tarea del producto: tope por tarea, contando lo que ya lleva de ese producto.
      if (item.unitsPerTask > 0) fit = Math.min(fit, item.unitsPerTask - (same ? same.quantity : 0));
      if (fit <= 0) {
        // No cabe ni una unidad: si la tarea ya tiene algo se abre otra; si está vacía se
        // fuerza una unidad (un producto de más de 4 h por unidad no se puede partir).
        if (current.lines.length > 0) { current = null; continue; }
        fit = 1;
      }
      const take = Math.min(pending, fit);
      if (same) same.quantity += take;
      else current.lines.push(lineFromItem(item, take));
      used += take * perUnit;
      pending -= take;
    }
  });
  return tasks;
}

/**
 * Capacidad de un día: depende de las mesas activas de esa fecha (puede variar de un día a
 * otro). Cada mesa aporta 4 h ideales y 5 h de tope; lo que ya está planificado se resta.
 * Las OPL no cuentan.
 */
export function dayCapacity({ numDesks, plannedHours = 0 } = {}) {
  const desks = Math.max(0, Math.floor(Number(numDesks) || 0));
  const idealHours = round2(desks * MAX_HOURS_PER_DESK);
  const hardHours = round2(desks * MAX_HOURS_PER_TASK_HARD_CAP);
  const planned = round2(Math.max(0, Number(plannedHours) || 0));
  return {
    desks,
    idealHours,
    hardHours,
    plannedHours: planned,
    remainingIdeal: round2(Math.max(0, idealHours - planned)),
    remainingHard: round2(Math.max(0, hardHours - planned)),
  };
}

/**
 * Qué tan lleno queda el día con `baseHours` más (las horas base de las tareas armadas).
 *  - none: no se conoce la capacidad (sin mesas cargadas)
 *  - ok:   cabe dentro de las horas ideales
 *  - near: pasa de las ideales pero no del tope
 *  - over: pasa del tope: no se confirma
 */
export function capacityStatus(baseHours, capacity) {
  if (!capacity || !capacity.hardHours) return { level: "none", usedHours: round2(baseHours || 0), pct: 0 };
  const usedHours = round2((capacity.plannedHours || 0) + (baseHours || 0));
  let level = "ok";
  if (usedHours > capacity.hardHours + EPS) level = "over";
  else if (usedHours > capacity.idealHours + EPS) level = "near";
  return { level, usedHours, pct: Math.min(usedHours / capacity.hardHours, 1) * 100 };
}

/**
 * Tareas sugeridas para las OPs marcadas.
 *
 * Orden: primero las OPL (en el orden en que vienen), luego las demás en el orden en que se
 * marcaron. Cada OP se agrupa por separado, porque una tarea no mezcla OPs base distintas,
 * salvo las órdenes de una misma OP consolidada, que se reparten juntas.
 *
 * Con `opts.budgetHours` (horas base que caben en el día) el reparto se detiene al llenarse:
 * lo que no cabe queda sin tarea, para otro día. Las OPL no gastan presupuesto. El criterio
 * es el tiempo de producción: de cada producto entra la cantidad que cabe en lo que queda.
 * Con `opts.picks` ({ itemId: unidades }) el jefe fija cuánto de un producto va hoy; esas
 * cantidades se respetan completas (y se descuentan primero del presupuesto).
 *
 * @param orders      OPs del listado (con items[].remainingQuantity)
 * @param selectedIds ids de las OPs marcadas, en orden de marcado
 * @param existing    tareas que ya existen (lo que ya tienen no se vuelve a repartir)
 */
export function suggestGrouping(orders, selectedIds, existing = [], opts = {}) {
  const byId = new Map((orders || []).map((o) => [o.id, o]));
  const chosen = (selectedIds || []).map((id) => byId.get(id)).filter(Boolean);
  const oplFirst = [
    ...(orders || []).filter((o) => o.onlineSale && selectedIds.includes(o.id)),
    ...chosen.filter((o) => !o.onlineSale),
  ];
  const picks = opts.picks || {};
  const perUnitOf = (item) => item.prdTimePerUnit || DEFAULT_HOURS_PER_UNIT;
  const hasPick = (item) => picks[item.productionOrderItemId] !== undefined && picks[item.productionOrderItemId] !== null;

  const finite = Number.isFinite(opts.budgetHours);
  let budget = finite ? opts.budgetHours : Infinity;
  if (finite) {
    oplFirst.filter((o) => !o.onlineSale).forEach((order) => (order.items || []).forEach((item) => {
      if (!hasPick(item)) return;
      const qty = Math.min(Math.max(0, Math.floor(picks[item.productionOrderItemId])), leftoverQuantity(item, existing));
      budget -= qty * perUnitOf(item);
    }));
    budget = Math.max(0, budget);
  }

  const result = [];
  oplFirst.forEach((order) => {
    const wanted = [];
    (order.items || []).forEach((item) => {
      const left = leftoverQuantity(item, [...existing, ...result]);
      if (left <= 0) return;
      let quantity;
      if (hasPick(item)) {
        quantity = Math.min(Math.max(0, Math.floor(picks[item.productionOrderItemId])), left);
      } else if (order.onlineSale || !finite) {
        quantity = left;
      } else {
        quantity = Math.min(left, Math.floor((budget + EPS) / perUnitOf(item)));
        budget -= quantity * perUnitOf(item);
      }
      if (quantity > 0) wanted.push({ item, quantity });
    });
    result.push(...packOrderLines(order, wanted, opts));
  });
  // Las órdenes de una misma OP consolidada se reparten juntas.
  return consolidateGroups(result, orders, opts);
}

/**
 * «Arreglar sola»: deja la tarea en 4 h o menos y pasa el excedente a tareas nuevas.
 * Quita unidades de las últimas líneas hasta que la carga base cabe.
 *
 * @returns {{ task: object, extra: object[] }}
 */
export function splitOverflow(task, order, opts = {}) {
  const idealHours = opts.idealHours ?? MAX_HOURS_PER_DESK;
  if (task.onlineSale) return { task, extra: [] };
  const lines = task.lines.map((l) => ({ ...l }));
  const moved = [];
  const hoursOf = (ls) => ls.reduce((s, l) => s + lineHours(l.quantity, l.prdTimePerUnit), 0);

  while (lines.length > 0 && hoursOf(lines) > idealHours + EPS) {
    const last = lines[lines.length - 1];
    const excess = hoursOf(lines) - idealHours;
    const units = Math.min(last.quantity, Math.max(1, Math.ceil((excess - EPS) / last.prdTimePerUnit)));
    last.quantity -= units;
    moved.push({ item: last, quantity: units });
    if (last.quantity <= 0) lines.pop();
  }
  const extra = packOrderLines(order, moved.reverse().map((m) => ({
    item: { ...m.item, remainingQuantity: m.item.remainingQuantity },
    quantity: m.quantity,
  })), opts);
  return { task: { ...task, lines }, extra };
}

/**
 * Ordena las tareas como se van a repartir: primero las OPL (en el orden del listado, que ya
 * viene por prioridad) y luego las demás en el orden en que se marcaron sus OPs.
 */
export function sortTasksBySelection(tasks, orders, selectedIds) {
  const rank = new Map((selectedIds || []).map((id, i) => [id, i]));
  const position = new Map((orders || []).map((o, i) => [o.id, i]));
  const weight = (t) => (t.onlineSale ? -1 : rank.has(t.orderId) ? rank.get(t.orderId) : 1e6);
  return [...(tasks || [])].sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    if (wa !== wb) return wa - wb;
    if (wa === -1) return (position.get(a.orderId) ?? 0) - (position.get(b.orderId) ?? 0);
    return 0;
  });
}

/**
 * Ajusta las tareas a lo que de verdad queda por repartir. Se usa cuando el servidor avisa
 * que alguien más tomó unidades. Se recorta en el orden de las tareas, así que las primeras
 * (las de mayor prioridad) conservan sus unidades y el recorte cae en las últimas.
 *
 * @returns {{ tasks: object[], changed: boolean }}
 */
export function clampTasksToRemaining(tasks, orders) {
  const remaining = new Map();
  (orders || []).forEach((o) => (o.items || []).forEach((i) => {
    remaining.set(i.productionOrderItemId, i.remainingQuantity || 0);
  }));
  const used = new Map();
  let changed = false;
  const next = [];
  (tasks || []).forEach((t) => {
    const lines = [];
    t.lines.forEach((l) => {
      const room = Math.max(0, (remaining.get(l.productionOrderItemId) ?? 0) - (used.get(l.productionOrderItemId) || 0));
      const quantity = Math.min(l.quantity, room);
      if (quantity !== l.quantity) changed = true;
      if (quantity > 0) {
        used.set(l.productionOrderItemId, (used.get(l.productionOrderItemId) || 0) + quantity);
        lines.push({ ...l, quantity, remainingQuantity: remaining.get(l.productionOrderItemId) });
      }
    });
    if (lines.length > 0) next.push({ ...t, lines });
    else changed = true;
  });
  return { tasks: next, changed };
}

/** Motivos por los que no se puede pasar a «Revisar». */
export function planBlockers(tasks) {
  const out = [];
  (tasks || []).forEach((t, i) => {
    if (!t.lines.length) out.push(`La tarea ${i + 1} está vacía`);
    else if (limitStatus(t).level === "over") {
      out.push(`La tarea ${i + 1} pasa de ${MAX_HOURS_PER_TASK_HARD_CAP} h`);
    }
  });
  return out;
}

/** Totales para el resumen del paso 2. */
export function summarizePlan(tasks) {
  let baseHours = 0;
  let oplHours = 0;
  (tasks || []).forEach((t) => {
    if (t.onlineSale) oplHours += taskTotalHours(t);
    else baseHours += taskBaseHours(t);
  });
  return {
    count: (tasks || []).length,
    baseHours: round2(baseHours),
    oplHours: round2(oplHours),
    problems: planBlockers(tasks).length,
  };
}

/**
 * Cuerpo para vista previa / confirmar.
 *
 * Las líneas de OPL viajan siempre como extra (el servidor las fuerza igual).
 *
 * @param tasks
 * @param {{ anchorDate: string, horizonDays?: number, orderPriorities?: object,
 *           dates?: Record<string,string>, planFingerprint?: string, acceptChanges?: boolean }} ctx
 */
export function buildDayPlanPayload(tasks, ctx) {
  const body = {
    anchorDate: ctx.anchorDate,
    horizonDays: ctx.horizonDays ?? 5,
    orderPriorities: ctx.orderPriorities || {},
    tasks: (tasks || []).map((t) => ({
      clientId: t.clientId,
      productionOrderId: t.orderId,
      scheduledDate: (ctx.dates && ctx.dates[t.clientId]) || null,
      observations: t.observations || null,
      consolidateVendorOrders: isConsolidatedTask(t),
      items: t.lines.map((l) => ({
        productionOrderItemId: l.productionOrderItemId,
        quantity: l.quantity,
        daySaleExtra: !!t.onlineSale,
      })),
    })),
  };
  if (ctx.planFingerprint) body.planFingerprint = ctx.planFingerprint;
  if (ctx.acceptChanges) body.acceptChanges = true;
  return body;
}

/**
 * Prioridad de las OPs que no son OPL: el orden en que se marcaron, desde 2
 * (0 y 1 están reservados para venta en línea y kiosko; el servidor descarta lo que pase de 99).
 */
export function orderPrioritiesFromSelection(orders, selectedIds) {
  const byId = new Map((orders || []).map((o) => [o.id, o]));
  const map = {};
  let next = 2;
  (selectedIds || []).forEach((id) => {
    const o = byId.get(id);
    if (!o || o.onlineSale) return;
    map[String(id)] = Math.min(next++, 99);
  });
  return map;
}
