/**
 * Vista en tabla del paso 2 de «Armar el día»: una fila por tarea × producto y una columna
 * por color, con Negro, Café, Tostado y Whisky primero y luego los demás colores que traigan
 * las órdenes. El pie compara lo repartido con lo que piden las órdenes marcadas.
 *
 * Una celda puede juntar varias líneas (ítems de OP) del mismo producto y color, por ejemplo
 * tallas o marcas distintas; por eso guarda los ids de sus ítems.
 */
import { compareColorNames } from "./colorOrder";
import { isConsolidatedTask, lineHours, limitStatus, taskOrderCodes } from "./dayPlanHelper";

export const NO_COLOR = "Sin color";

const colorOf = (x) => String(x?.colorName || "").trim() || NO_COLOR;

/**
 * @param tasks          tareas del borrador
 * @param selectedOrders OPs marcadas (con items[].remainingQuantity), para «Pide la orden»
 * @returns {{ colors: string[], groups: object[], placed: object, asked: object,
 *             placedTotal: number, askedTotal: number }}
 */
export function buildTaskTable(tasks, selectedOrders = []) {
  const colorSet = new Set();
  const asked = {};
  (selectedOrders || []).forEach((o) => (o.items || []).forEach((it) => {
    const c = colorOf(it);
    colorSet.add(c);
    asked[c] = (asked[c] || 0) + (Number(it.remainingQuantity) || 0);
  }));

  const placed = {};
  const groups = (tasks || []).map((task, index) => {
    const consolidated = isConsolidatedTask(task);
    const rows = new Map();
    task.lines.forEach((l) => {
      const orderCode = l.orderCode || task.orderCode;
      // En una consolidada el mismo producto de dos OP va en filas distintas: cada una se empaca aparte.
      const key = `${l.productCode || ""}|${consolidated ? orderCode : ""}`;
      if (!rows.has(key)) {
        rows.set(key, {
          key, productCode: l.productCode, productName: l.productName, orderCode,
          cells: {}, units: 0, hours: 0,
        });
      }
      const row = rows.get(key);
      const c = colorOf(l);
      colorSet.add(c);
      if (!row.cells[c]) row.cells[c] = { qty: 0, itemIds: [] };
      row.cells[c].qty += l.quantity;
      row.cells[c].itemIds.push(l.productionOrderItemId);
      row.units += l.quantity;
      row.hours += lineHours(l.quantity, l.prdTimePerUnit);
      placed[c] = (placed[c] || 0) + l.quantity;
    });
    const list = Array.from(rows.values()).sort((a, b) =>
      String(a.productCode || "").localeCompare(String(b.productCode || ""), "es", { numeric: true, sensitivity: "base" })
      || String(a.orderCode || "").localeCompare(String(b.orderCode || ""), "es", { numeric: true }));
    list.forEach((r) => { r.hours = Math.round(r.hours * 100) / 100; });
    return { task, index, status: limitStatus(task), codes: taskOrderCodes(task), consolidated, rows: list };
  });

  const colors = Array.from(colorSet).sort(compareColorNames);
  const sum = (m) => Object.values(m).reduce((a, b) => a + b, 0);
  return { colors, groups, placed, asked, placedTotal: sum(placed), askedTotal: sum(asked) };
}
