/**
 * Ayudas para el listado de inventario de las pantallas de Movimientos
 * (kioscos) e Inventario Productos (bodegas):
 *  - mostrar solo lo que tiene existencia o todo,
 *  - total de piezas por color (sumando todos los códigos de producto).
 */

export const NO_COLOR_LABEL = "Sin color";

/** Piezas > 0. Los saldos negativos o en cero no cuentan como existencia. */
export const hasStockQty = (qty) => Number(qty) > 0;

export const colorLabelOf = (name) => {
  const text = String(name == null ? "" : name).trim();
  return text || NO_COLOR_LABEL;
};

/**
 * @param {Array} rows filas de inventario
 * @param {(row) => any} getColor devuelve el nombre del color de la fila
 * @param {(row) => any} getQty devuelve las piezas de la fila
 * @returns {{ total: number, colors: Array<{ color: string, total: number, products: number }> }}
 *   colores ordenados de mayor a menor cantidad; `products` = filas (código/variante) que lo componen.
 */
export const buildColorTotals = (rows, getColor, getQty) => {
  const byColor = new Map();
  let total = 0;
  (rows || []).forEach((row) => {
    const qty = Number(getQty(row)) || 0;
    const color = colorLabelOf(getColor(row));
    const entry = byColor.get(color) || { color, total: 0, products: 0 };
    entry.total += qty;
    entry.products += 1;
    byColor.set(color, entry);
    total += qty;
  });
  const colors = Array.from(byColor.values()).sort(
    (a, b) => b.total - a.total || a.color.localeCompare(b.color, "es", { numeric: true })
  );
  return { total, colors };
};
