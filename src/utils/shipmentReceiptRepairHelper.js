/**
 * Mensajes de resultado al sincronizar inventario kiosco desde un envío entregado.
 */
export const formatShipmentReceiptRepairMessage = (result) => {
  const repairedLines = Number(result?.repairedLines ?? result?.linesReconciled ?? 0);
  const warnings = Array.isArray(result?.warnings) ? result.warnings.filter(Boolean) : [];

  let message;
  if (repairedLines > 0) {
    message = `Inventario sincronizado: ${repairedLines} línea(s) cargada(s) al kiosko.`;
  } else if (warnings.length > 0) {
    message = "No se cargaron líneas nuevas. Revise empaques SUM- en el envío o el SKU del material.";
  } else {
    message = "El inventario kiosco ya coincidía con todas las líneas de este envío.";
  }

  if (warnings.length > 0) {
    message += `\n\nAdvertencias:\n${warnings.map((w) => `• ${w}`).join("\n")}`;
  }

  return { message, repairedLines, warnings };
};

/**
 * Mensajes al cuadrar inventario/kardex con envíos (reconciliación silenciosa admin).
 */
export const formatShipmentReconcileMessage = (result) => {
  const linesReconciled = Number(result?.linesReconciled ?? 0);
  const duplicatesRemoved = Number(result?.duplicatesRemoved ?? 0);
  const stockRowsRecalculated = Number(result?.stockRowsRecalculated ?? 0);
  const warnings = Array.isArray(result?.warnings) ? result.warnings.filter(Boolean) : [];

  let message;
  if (linesReconciled > 0 || duplicatesRemoved > 0) {
    message = `Inventario cuadrado: ${linesReconciled} línea(s) ajustada(s)`;
    if (duplicatesRemoved > 0) {
      message += `, ${duplicatesRemoved} duplicado(s) eliminado(s)`;
    }
    if (stockRowsRecalculated > 0) {
      message += `, ${stockRowsRecalculated} fila(s) de stock recalculada(s)`;
    }
    message += ".";
  } else {
    message = "El inventario y kardex ya coincidían con los envíos entregados.";
  }

  if (warnings.length > 0) {
    message += `\n\nAdvertencias:\n${warnings.map((w) => `• ${w}`).join("\n")}`;
  }

  return { message, linesReconciled, duplicatesRemoved, warnings };
};
