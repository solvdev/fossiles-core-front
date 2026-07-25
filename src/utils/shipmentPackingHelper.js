/**
 * Empaques SUM- del envío: viven en packingItems (no en products).
 * Notas legacy pueden traer __PACKING_SUM__:[{materialId,name,quantity,...}]
 */

const PACKING_TAG = "__PACKING_SUM__:";

const toPositiveQty = (value) => {
  const qty = Number(value || 0);
  return Number.isFinite(qty) && qty > 0 ? qty : 0;
};

export const parsePackingFromShipmentNotes = (notesRaw) => {
  const text = String(notesRaw || "");
  const lines = text.split("\n");
  const line = lines.find((row) => row.startsWith(PACKING_TAG));
  if (!line) return [];
  try {
    const parsed = JSON.parse(line.slice(PACKING_TAG.length).trim());
    return (Array.isArray(parsed) ? parsed : [])
      .map((item) => ({
        materialId: Number(item?.materialId),
        materialSku: String(item?.sku || item?.materialSku || "").trim() || null,
        materialName: String(item?.name || item?.materialName || "").trim() || null,
        quantity: toPositiveQty(item?.quantity),
        unitPrice: item?.unitPrice != null ? Number(item.unitPrice) : null,
      }))
      .filter((item) => item.materialId > 0 && item.quantity > 0);
  } catch (_err) {
    return [];
  }
};

export const getShipmentPackingItems = (shipment) => {
  const apiItems = (shipment?.packingItems || [])
    .map((item) => ({
      materialId: Number(item?.materialId),
      materialSku: String(item?.materialSku || item?.sku || "").trim() || null,
      materialName: String(item?.materialName || item?.name || "").trim() || null,
      quantity: toPositiveQty(item?.quantity),
      unitPrice: item?.unitPrice != null ? Number(item.unitPrice) : null,
    }))
    .filter((item) => item.materialId > 0 && item.quantity > 0);
  if (apiItems.length > 0) return apiItems;
  return parsePackingFromShipmentNotes(shipment?.notes);
};

export const formatPackingItemLabel = (item) => {
  const sku = String(item?.materialSku || "").trim();
  const name = String(item?.materialName || "").trim();
  if (sku && name) return `${sku} - ${name}`;
  if (sku) return sku;
  if (name) return name;
  return item?.materialId ? `Empaque #${item.materialId}` : "Empaque SUM-";
};

export const shipmentPackingTotalQty = (shipment) =>
  getShipmentPackingItems(shipment).reduce((sum, item) => sum + Number(item.quantity || 0), 0);
