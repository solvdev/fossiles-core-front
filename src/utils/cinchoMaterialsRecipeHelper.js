/**
 * Recetas BOM solo lectura para líneas de OP cincho (sin tareas).
 *
 * Mantener alineado con fossiles-mobile-inventory/src/utils/cinchoOrderRecipe.ts
 * y con el backend:
 * - TaskController.buildProductWithRecipe (BOM activo "A", preferencia colorId, total = bomQty × piezas OP)
 * - ProductionOrderController al crear OP: piezas = quantity + sum(sizes) cuando sizes no vacío
 */

export const CINCHO_MATERIALS_READONLY_TITLE =
  "Recetas — orden cincho (solo referencia, sin tareas)";

export const CINCHO_MATERIALS_READONLY_SUB =
  "Bodega usa esto como guía; no registra entrega por tarea en órdenes cincho.";

/**
 * @param {Record<string, unknown>|null|undefined} sizes talla -> cantidad
 * @returns {number}
 */
function sumSizesMap(sizes) {
  if (!sizes || typeof sizes !== "object" || Array.isArray(sizes)) return 0;
  return Object.values(sizes).reduce((acc, v) => acc + Number(v || 0), 0);
}

/**
 * Igual que el total usado al generar solicitudes de materiales en ProductionOrderController (~167–172).
 * @param {{ quantity?: number|null, sizes?: Record<string, number>|null }} item
 */
export function effectivePieceQuantityForOrderItem(item) {
  const q = Number(item?.quantity || 0);
  const sumSz = sumSizesMap(item?.sizes);
  if (sumSz > 0) return q + sumSz;
  return q;
}

/**
 * @param {Array<{ status?: string, colorId?: number|null }>} boms
 * @param {number|null|undefined} colorId
 * @returns {object|null} BOM elegido o null
 */
export function pickActiveBomForProductColor(boms, colorId) {
  const list = Array.isArray(boms) ? boms : [];
  const actives = list.filter((b) => String(b?.status || "").toUpperCase() === "A");
  if (actives.length === 0) return null;
  const cid = colorId != null ? Number(colorId) : null;
  if (cid != null && !Number.isNaN(cid)) {
    const match = actives.find((b) => Number(b?.colorId) === cid);
    if (match) return match;
  }
  return actives[0];
}

/**
 * @param {object} material — fila de getMaterials()
 */
function materialAvailableStock(material) {
  if (!material) return 0;
  const q = material.quantity != null ? Number(material.quantity) : NaN;
  if (Number.isFinite(q)) return q;
  const cs = material.currentStock != null ? Number(material.currentStock) : NaN;
  if (Number.isFinite(cs)) return cs;
  return 0;
}

/**
 * @param {object|null} bom
 * @param {number} pieceQty cantidad de piezas de la línea OP
 * @param {Map<number, object>|Record<number, object>} materialsById
 * @returns {Array<{ materialId: number, materialSku?: string, materialName?: string, quantityPerUnit: number, totalQuantity: number, availableStock: number, sufficientStock: boolean, measurementUnit?: string }>}
 */
export function buildReadOnlyRecipeLinesFromBom(bom, pieceQty, materialsById) {
  if (!bom?.items?.length) return [];
  const qtyPieces = Number(pieceQty) > 0 ? Number(pieceQty) : 0;
  const getMat = (id) => {
    if (materialsById instanceof Map) return materialsById.get(Number(id));
    return materialsById?.[Number(id)];
  };
  return bom.items.map((bi) => {
    const mid = Number(bi.materialId);
    const mat = getMat(mid);
    const qpu = bi.quantity != null ? Number(bi.quantity) : 0;
    const totalQty = qpu * qtyPieces;
    const availableStock = materialAvailableStock(mat);
    const sufficientStock = availableStock >= totalQty;
    return {
      materialId: mid,
      materialSku: mat?.sku || "",
      materialName: mat?.name || "",
      quantityPerUnit: qpu,
      totalQuantity: totalQty,
      availableStock,
      sufficientStock,
      measurementUnit: bi.measurementUnit || "",
    };
  });
}

/**
 * @param {Array<object>} orderItems — production order items
 * @param {function(number): Promise<Array>} getBomsByProductId
 * @param {Array<object>} materialsList — getMaterials()
 * @returns {Promise<Array<{ key: string, productId: number|null, productCode?: string, productName?: string, colorName?: string, pieceQty: number, recipe: ReturnType<typeof buildReadOnlyRecipeLinesFromBom> }>>}
 */
export async function buildCinchoReadOnlyRecipeBlocks(orderItems, getBomsByProductId, materialsList) {
  const materialsById = new Map(
    (materialsList || []).map((m) => [Number(m.id), m])
  );
  const items = Array.isArray(orderItems) ? orderItems : [];
  const blocks = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const pid = item?.productId != null ? Number(item.productId) : NaN;
    if (!Number.isFinite(pid)) continue;
    const pieceQty = effectivePieceQuantityForOrderItem(item);
    const boms = await getBomsByProductId(pid);
    const bom = pickActiveBomForProductColor(boms, item?.colorId);
    const recipe = buildReadOnlyRecipeLinesFromBom(bom, pieceQty, materialsById);
    blocks.push({
      key: `cincho-${item?.id ?? i}-${pid}-${item?.colorId ?? "x"}`,
      productId: pid,
      productCode: item?.productCode || "",
      productName: item?.productName || "",
      colorName: item?.colorName || "",
      pieceQty,
      recipe,
    });
  }
  return blocks;
}
