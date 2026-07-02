export const OPERATION_OPTIONS = [
  { value: "ENTRADA", label: "Entrada de stock" },
  { value: "VENTA", label: "Venta" },
  { value: "CAMBIO", label: "Cambio de producto" },
  { value: "DEVOLUCION_DEPOSITO", label: "Devolución a depósito" },
  { value: "DEVOLUCION_CLIENTE", label: "Devolución de cliente" },
  { value: "TRASLADO", label: "Traslado entre kioskos" },
  { value: "MERMA", label: "Merma" },
  { value: "AJUSTE", label: "Ajuste por conteo físico" },
  { value: "ANULACION", label: "Anulación de factura" },
];

export function isPositiveInteger(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0;
}

export function validateCommonStockForm({ locationId, productId, quantity }) {
  if (!locationId) {
    return "Debes seleccionar un kiosko.";
  }
  if (!productId) {
    return "Debes seleccionar un producto.";
  }
  if (!isPositiveInteger(quantity)) {
    return "La cantidad debe ser un entero mayor a cero.";
  }
  return "";
}

export function validateTransferForm({ locationOriginId, locationDestinationId, productId, quantity }) {
  if (!locationOriginId || !locationDestinationId) {
    return "Debes seleccionar origen y destino.";
  }
  if (String(locationOriginId) === String(locationDestinationId)) {
    return "Origen y destino deben ser distintos.";
  }
  if (!productId) {
    return "Debes seleccionar un producto.";
  }
  if (!isPositiveInteger(quantity)) {
    return "La cantidad debe ser un entero mayor a cero.";
  }
  return "";
}

export function validateAnulacionForm({ locationId, productId, quantity, reason, productLeftKiosk }) {
  const commonError = validateCommonStockForm({ locationId, productId, quantity });
  if (commonError) {
    return commonError;
  }
  if (String(reason || "").trim() === "") {
    return "El motivo es obligatorio para anular.";
  }
  if (typeof productLeftKiosk !== "boolean") {
    return "Debes indicar si el producto salió del kiosko.";
  }
  return "";
}

export function isSaleBelowMinimum(stockRow, quantityToSell) {
  if (!stockRow) return false;
  const quantity = Number(quantityToSell || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) return false;
  const current = Number(stockRow.currentStock || 0);
  const minimum = Number(stockRow.minimumStock || 0);
  return current - quantity <= minimum;
}

export function canSell(stockRow, quantityToSell) {
  if (!stockRow) return false;
  const quantity = Number(quantityToSell || 0);
  if (!Number.isInteger(quantity) || quantity <= 0) return false;
  return Number(stockRow.currentStock || 0) >= quantity;
}

export function validateKardexRangeForm({ locationId, from, to }) {
  if (!locationId) {
    return "Debes seleccionar un kiosko.";
  }
  if (!from || !to) {
    return "Debes indicar el rango de fechas (desde y hasta).";
  }
  if (new Date(from) > new Date(to)) {
    return "La fecha inicial no puede ser posterior a la fecha final.";
  }
  return "";
}

export function sortMovementsDesc(list) {
  return [...(list || [])].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    if (aTime !== bTime) return bTime - aTime;
    return Number(b.id || 0) - Number(a.id || 0);
  });
}
