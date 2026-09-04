/**
 * Tareas del organizador para una fecha de trabajo.
 * Hoja / descarga OPs del día: todas las OP/OPL con scheduledDate ese día,
 * con o sin mesa; excluye solo CANCELLED y COMPLETED.
 * Boletas: siguen exigiendo mesa + PENDING/IN_PROGRESS.
 */

const EXCLUDED_DAY_SHEET_STATUSES = new Set(["CANCELLED", "COMPLETED"]);
const ACTIVE_BOLETA_STATUSES = new Set(["PENDING", "IN_PROGRESS"]);

function hasAssignedDesk(task) {
  const d = task?.desk;
  return d !== null && d !== undefined && d !== "";
}

function statusUpper(task) {
  return String(task?.status || "").toUpperCase();
}

/**
 * Tareas del día para hoja de mesas / descarga e impresión de OPs.
 * Por defecto no exige mesa; excluye CANCELLED y COMPLETED.
 *
 * @param {object[]} tasks
 * @param {string} workDateYmd YYYY-MM-DD
 * @param {{
 *   statuses?: Set<string>,
 *   excludeStatuses?: Set<string>,
 *   requireDesk?: boolean,
 * }} [options]
 */
export function getOrganizerDayDeskTasks(tasks, workDateYmd, options = {}) {
  const date = String(workDateYmd || "").slice(0, 10);
  if (!date) return [];
  const requireDesk = options.requireDesk === true;
  const whitelist = options.statuses;
  const excludeStatuses = options.excludeStatuses || EXCLUDED_DAY_SHEET_STATUSES;

  return (tasks || []).filter((t) => {
    if (!t) return false;
    if (String(t.scheduledDate || "").slice(0, 10) !== date) return false;
    if (requireDesk && !hasAssignedDesk(t)) return false;
    const st = statusUpper(t);
    if (whitelist) return whitelist.has(st);
    return !excludeStatuses.has(st);
  });
}

/** Boletas del día: con mesa y activas (PENDING / IN_PROGRESS). */
export function getOrganizerDayBoletaTasks(tasks, workDateYmd) {
  return getOrganizerDayDeskTasks(tasks, workDateYmd, {
    requireDesk: true,
    statuses: ACTIVE_BOLETA_STATUSES,
  });
}

function taskLines(task) {
  const items = Array.isArray(task?.items) && task.items.length > 0 ? task.items : null;
  if (items) {
    return items.map((it) => ({
      productionOrderItemId: it.productionOrderItemId ?? null,
      productId: it.productId ?? null,
      productCode: it.productCode || "",
      productName: it.productName || "",
      colorId: it.colorId ?? null,
      colorName: it.colorName || "",
      quantity: Number(it.quantity || 0),
      sizes: it.sizes || null,
      observations: it.observations || "",
      daySaleExtra: Boolean(it.daySaleExtra),
    }));
  }
  return [{
    productionOrderItemId: task?.productionOrderItemId ?? null,
    productId: task?.productId ?? null,
    productCode: task?.productCode || "",
    productName: task?.productName || "",
    colorId: task?.colorId ?? null,
    colorName: task?.colorName || "",
    quantity: Number(task?.quantity || 0),
    sizes: null,
    observations: task?.observations || "",
    daySaleExtra: false,
  }];
}

function lineKey(line) {
  if (line.productionOrderItemId != null) return `poi:${line.productionOrderItemId}`;
  return [
    "pc",
    String(line.productCode || "").toUpperCase(),
    String((line.colorId ?? line.colorName) || "").toLowerCase(),
    line.daySaleExtra ? "dia" : "base",
  ].join("|");
}

function findOriginalOrderItem(origItems, line) {
  const items = origItems || [];
  if (line?.productionOrderItemId != null) {
    const byId = items.find((it) => Number(it.id) === Number(line.productionOrderItemId));
    if (byId) return byId;
  }
  if (line?.productId != null && line?.colorId != null) {
    const byIds = items.find(
      (it) => Number(it.productId) === Number(line.productId)
        && Number(it.colorId) === Number(line.colorId)
    );
    if (byIds) return byIds;
  }
  const code = String(line?.productCode || "").trim().toUpperCase();
  const color = String(line?.colorName || "").trim().toLowerCase();
  if (!code) return null;
  return items.find((it) =>
    String(it.productCode || "").trim().toUpperCase() === code
    && String(it.colorName || "").trim().toLowerCase() === color
  ) || null;
}

function resolveProjectedItemObservations(origItems, line) {
  const orig = findOriginalOrderItem(origItems, line);
  return String(orig?.observations || line?.observations || "").trim();
}

function mergeSizes(a, b) {
  if (!a && !b) return null;
  const out = { ...(a || {}) };
  Object.entries(b || {}).forEach(([size, qty]) => {
    out[size] = Number(out[size] || 0) + Number(qty || 0);
  });
  return out;
}

/**
 * Reduce OPs a solo las líneas/cantidades programadas en el organizador del día.
 * @param {object[]} orders
 * @param {object[]} dayDeskTasks
 */
export function projectOrdersToOrganizerDay(orders, dayDeskTasks) {
  const byOrder = new Map();
  (dayDeskTasks || []).forEach((t) => {
    const oid = Number(t.productionOrderId);
    if (!Number.isFinite(oid)) return;
    if (!byOrder.has(oid)) byOrder.set(oid, []);
    byOrder.get(oid).push(t);
  });

  return (orders || [])
    .filter((o) => byOrder.has(Number(o.id)))
    .map((order) => {
      const origItems = Array.isArray(order.items) ? order.items : [];
      const merged = new Map();
      byOrder.get(Number(order.id)).forEach((task) => {
        taskLines(task).forEach((line) => {
          if (!line.productCode && line.quantity <= 0) return;
          const key = lineKey(line);
          const observations = resolveProjectedItemObservations(origItems, line);
          const prev = merged.get(key);
          if (!prev) {
            merged.set(key, { ...line, observations });
            return;
          }
          prev.quantity = Number(prev.quantity || 0) + Number(line.quantity || 0);
          prev.sizes = mergeSizes(prev.sizes, line.sizes);
          if (!prev.observations && observations) prev.observations = observations;
        });
      });
      const items = Array.from(merged.values()).filter((it) => Number(it.quantity || 0) > 0);
      return {
        ...order,
        items,
        observations: String(order.observations || "").trim() || null,
      };
    });
}
