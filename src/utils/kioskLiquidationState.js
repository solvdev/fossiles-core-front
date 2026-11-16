/**
 * El estado de una liquidación lo define el conteo físico (única fuente): Contado → Revisado → Cerrado.
 * Un conteo cerrado es una liquidación hecha.
 */
export const COUNT_STATE = {
  NONE: { label: "Por contar", tone: "none", hint: "La visita ya se hizo; falta que el conteo se registre en el sistema." },
  DRAFT: { label: "Contando", tone: "none", hint: "El conteo está en borrador." },
  CONTADO: { label: "Por revisar", tone: "warn", hint: "La supervisora terminó el conteo; contabilidad empieza a revisar." },
  REVISADO: { label: "Revisado", tone: "info", hint: "Contabilidad ya lo revisó; falta cerrarlo." },
  CERRADO: { label: "Liquidada", tone: "ok", hint: "Contabilidad cerró el conteo." },
};

export const countState = (row) => COUNT_STATE[row?.countStatus || "NONE"] || COUNT_STATE.NONE;

/** Ruta del conteo físico del kiosco (pestaña Conteo del inventario). */
export const countLink = (row) =>
  row?.countId ? `/admin/kiosk-inventory?location=${row.locationId}&count=${row.countId}` : null;
