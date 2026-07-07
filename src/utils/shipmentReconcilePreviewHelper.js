const ACTION_META = {
  DELETE_ENTRADA: { label: "Eliminar ENTRADA", color: "danger" },
  TRIM_ENTRADA: { label: "Recortar ENTRADA", color: "warning" },
  DELETE_MERMA: { label: "Eliminar MERMA cuadre", color: "secondary" },
  ADD_ENTRADA: { label: "Agregar ENTRADA", color: "success" },
  NORMALIZE_KARDEX: { label: "Normalizar kardex", color: "info" },
  RECALCULATE_STOCK: { label: "Recalcular stock", color: "light" },
};

export const getReconcileActionMeta = (type) =>
  ACTION_META[type] || { label: type || "Acción", color: "secondary" };

export const formatReconcilePreviewSummary = (preview) => {
  if (!preview) {
    return "";
  }
  const parts = [];
  if (preview.shipmentsReviewed > 1) {
    parts.push(`${preview.shipmentsReviewed} envíos revisados`);
  }
  if (preview.linesWithChanges > 0) {
    parts.push(`${preview.linesWithChanges} línea(s) con cambios`);
  }
  if (preview.entradasToDelete > 0) {
    parts.push(`${preview.entradasToDelete} ENTRADA(s) a eliminar`);
  }
  if (preview.entradasToTrim > 0) {
    parts.push(`${preview.entradasToTrim} ENTRADA(s) a recortar`);
  }
  if (preview.entradasToAdd > 0) {
    parts.push(`${preview.entradasToAdd} ENTRADA(s) a agregar`);
  }
  if (preview.mermasToDelete > 0) {
    parts.push(`${preview.mermasToDelete} MERMA(s) a eliminar`);
  }
  if (preview.kardexLinesToNormalize > 0) {
    parts.push(`${preview.kardexLinesToNormalize} ajuste(s) de kardex`);
  }
  if (preview.stockRowsToRecalculate > 0) {
    parts.push(`${preview.stockRowsToRecalculate} fila(s) de stock a recalcular`);
  }
  return parts.join(" · ");
};

export const formatReconcilePreviewLineLabel = (line) => {
  const code = line?.productCode || line?.productName || "Producto";
  const color = line?.colorName ? ` · ${line.colorName}` : "";
  const shipment = line?.shipmentNumber ? ` (envío ${line.shipmentNumber})` : "";
  return `${code}${color}${shipment}`;
};
