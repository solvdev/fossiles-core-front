/**
 * Variantes de inventario de producto: color (fila en product_inventory_location)
 * y tallas (mapa sizes / sizes_data en esa fila).
 */

/** Texto compacto: talla → cantidad */
export function formatInventorySizesLine(sizes) {
  if (!sizes || typeof sizes !== "object") return null;
  const keys = Object.keys(sizes).filter((k) => sizes[k] != null && String(sizes[k]).trim() !== "");
  if (!keys.length) return null;
  return keys
    .sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return String(a).localeCompare(String(b), "es", { numeric: true });
    })
    .map((k) => `${k}: ${parseFloat(sizes[k] || 0).toFixed(3)}`)
    .join(" · ");
}

export function hasInventorySizeBreakdown(sizes) {
  return formatInventorySizesLine(sizes) != null;
}

/** Filas para tabla Color × Talla a partir de líneas de inventario por color. */
export function flattenInventoryVariantsToSizeRows(variants) {
  const rows = [];
  (variants || []).forEach((v) => {
    const colorLabel = v.colorName || (v.colorId ? `Color #${v.colorId}` : "Sin color");
    const sizes = v.sizes && typeof v.sizes === "object" ? v.sizes : null;
    const sizeKeys =
      sizes && Object.keys(sizes).filter((k) => sizes[k] != null && String(sizes[k]).trim() !== "");
    if (sizeKeys && sizeKeys.length > 0) {
      sizeKeys
        .sort((a, b) => {
          const na = parseFloat(a);
          const nb = parseFloat(b);
          if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
          return String(a).localeCompare(String(b), "es", { numeric: true });
        })
        .forEach((size) => {
          rows.push({
            key: `${v.id || v.productId}-${v.colorId || "n"}-${size}`,
            colorId: v.colorId,
            colorName: colorLabel,
            size,
            quantity: parseFloat(sizes[size] || 0),
            productId: v.productId,
            locationId: v.locationId,
          });
        });
    } else {
      const qty = parseFloat(v.currentStock ?? v.quantity ?? 0);
      rows.push({
        key: `${v.id || v.productId}-${v.colorId || "n"}-total`,
        colorId: v.colorId,
        colorName: colorLabel,
        size: null,
        quantity: qty,
        productId: v.productId,
        locationId: v.locationId,
      });
    }
  });
  return rows;
}
