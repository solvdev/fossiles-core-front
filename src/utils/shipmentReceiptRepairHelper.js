/**
 * Mensajes de resultado al sincronizar inventario kiosco desde un envío entregado.
 */
export const formatShipmentReceiptRepairMessage = (result) => {
  const repairedLines = Number(result?.repairedLines ?? 0);
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
