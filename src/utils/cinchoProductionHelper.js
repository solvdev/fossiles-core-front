import { isPackagingProductCode } from "utils/kioskPackagingHelper";

/** Tipos de orden que usan rejilla por tallas (mismo criterio que el formulario de OP). */
export const CINCHO_ORDER_TYPES = ["CINCHOS", "CINCHOS_FOSSILES", "CINCHOS_MARCAS"];

export function isCinchoOrderType(orderType) {
  const t = String(orderType || "").trim().toUpperCase();
  return CINCHO_ORDER_TYPES.includes(t);
}

/** OPCF / OPCM: cinchos con vista y endpoint de estado dedicados. */
export function isManagedCinchoOrderType(orderType) {
  const t = String(orderType || "").trim().toUpperCase();
  return t === "CINCHOS_FOSSILES" || t === "CINCHOS_MARCAS";
}

/** Productos cincho de catálogo FOSS… (venta en línea). */
export function isFossCinchosProductCode(productCode) {
  const c = String(productCode || "").trim().toUpperCase();
  return c.startsWith("FOSS");
}

function normalizeForCinchoNameSearch(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/** Nombre de producto sugiere cincho (p. ej. contiene "cincho", con o sin tilde). */
export function productNameContainsCincho(name) {
  if (name == null || String(name).trim() === "") return false;
  return normalizeForCinchoNameSearch(name).includes("cincho");
}

/** Ajustes / inventario por talla: FOSS por código u otro cincho identificado por nombre. */
export function isCinchoInventoryProduct(product) {
  if (!product || isPackagingProductCode(product.code)) {
    return false;
  }
  return isFossCinchosProductCode(product.code) || productNameContainsCincho(product.name);
}

export function isCinchoInventoryProductByCodeAndName(productCode, productName) {
  if (isPackagingProductCode(productCode)) {
    return false;
  }
  return isFossCinchosProductCode(productCode) || productNameContainsCincho(productName);
}

/** Pulsera(s) en nombre — misma mesa que cinchos. */
export function productNameContainsPulsera(name) {
  if (name == null || String(name).trim() === "") return false;
  return normalizeForCinchoNameSearch(name).includes("pulsera");
}

/**
 * Líneas del cuadro mesa cinchos para ENRUTAR PRODUCCIÓN (mesa cinchos vs. tarea normal):
 * solo por nombre (cincho/pulsera). A diferencia de `isCinchoInventoryProductByCodeAndName`,
 * NO usa el prefijo de código FOSS — ese prefijo es de marca/catálogo general y no implica
 * por sí solo que el producto sea un cincho; usarlo aquí dejaba productos regulares con
 * código FOSS-... fuera del Organizador de Tareas. No reemplaza el uso de FOSS en inventario.
 */
export function isMesaCinchosLineProduct(productCode, productName) {
  return productNameContainsCincho(productName) || productNameContainsPulsera(productName);
}

/** OP con líneas cargadas: todas son cincho (p. ej. OPL solo cinchos) — no hay trabajo para el centro estándar. */
export function orderHasOnlyCinchoLineItems(order) {
  const items = order?.items;
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.every((it) =>
    isMesaCinchosLineProduct(it?.productCode, it?.productName)
  );
}

/** Al menos un ítem no es cincho/pulsera (OPL mixta u otras OP con líneas fuera de mesa cinchos). */
export function orderHasNonCinchoLineItem(order) {
  const items = order?.items;
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some(
    (it) => !isMesaCinchosLineProduct(it?.productCode, it?.productName)
  );
}

/** Correlativo unificado de cinchos: OPC, OPCF, OPCM. */
export function isOpcFamilyProductionOrderCode(code) {
  const c = String(code || "").trim().toUpperCase();
  return /^OPC(F|M)?-/i.test(c);
}

export function isCinchoTaskLineItem(item) {
  return isMesaCinchosLineProduct(item?.productCode, item?.productName);
}

export function buildProductionOrderIdMap(orders) {
  const map = new Map();
  (orders || []).forEach((o) => {
    if (o?.id != null) map.set(Number(o.id), o);
  });
  return map;
}

function taskLineItemsForCinchoCheck(task) {
  const items = task?.items;
  if (Array.isArray(items) && items.length > 0) return items;
  if (task?.productCode || task?.productName) {
    return [{ productCode: task.productCode, productName: task.productName }];
  }
  return [];
}

/** Tarea que no debe mostrarse en el centro de producción (mesas). */
export function shouldExcludeTaskFromTableCenter(task, orderById) {
  if (!task) return true;
  const poId = Number(task.productionOrderId);
  const order = orderById instanceof Map ? orderById.get(poId) : orderById?.[poId];
  if (order && isCinchoOrderType(order.orderType)) return true;
  if (isOpcFamilyProductionOrderCode(task.productionOrderCode)) return true;
  const lines = taskLineItemsForCinchoCheck(task);
  if (lines.length === 0) return false;
  return lines.every((it) => isCinchoTaskLineItem(it));
}

/** Copia de tarea para mesas: sin líneas cincho; null si no queda trabajo. */
export function taskForTableCenterView(task, orderById) {
  if (!task || shouldExcludeTaskFromTableCenter(task, orderById)) return null;

  const items = task.items;
  if (!Array.isArray(items) || items.length === 0) {
    if (isCinchoTaskLineItem({ productCode: task.productCode, productName: task.productName })) {
      return null;
    }
    return task;
  }

  const filtered = items.filter((it) => !isCinchoTaskLineItem(it));
  if (filtered.length === 0) return null;
  if (filtered.length === items.length) return task;

  const quantity = filtered.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
  const estimatedHours =
    Math.round(filtered.reduce((s, it) => s + (Number(it.estimatedHours) || 0), 0) * 100) / 100;
  return { ...task, items: filtered, quantity, estimatedHours };
}

/**
 * Tareas vivas del centro de producción: descarta cinchos y, además, CANCELLED y COMPLETED.
 *
 * Ese descarte de estados terminales es la razón de que el Centro de Producción y el
 * Organizador no puedan mostrar ni contar tareas completadas: pasa antes que cualquier
 * filtro de la pantalla. Si algún día hace falta consultarlas desde aquí, no basta con
 * quitar el filtro — hay que revisar también los calculos de carga por mesa y el selector
 * de jornada, que hoy dan por hecho que solo llegan tareas activas.
 *
 * El historico de completadas se consulta en Trazabilidad por OP y en Bandejas por Fase.
 *
 * Ojo: los consumidores que necesitan saber que cantidad ya se produjo (collectAssignedQuantities
 * en taskPlanningHelper) NO deben usar esta lista, sino la lista cruda, porque cuentan las
 * tareas completadas como cantidad ya cubierta.
 */
export function buildTableCenterTasks(tasks, productionOrders) {
  const orderById = buildProductionOrderIdMap(productionOrders);
  return (tasks || [])
    .filter((t) => t && t.status !== "CANCELLED" && t.status !== "COMPLETED")
    .map((t) => taskForTableCenterView(t, orderById))
    .filter(Boolean);
}
