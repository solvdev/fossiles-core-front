/** Etiquetas y formato compartidos por las vistas de Facturas FEL (Contabilidad). */

export const TAX_INVOICE_STATUS = {
  CERTIFIED: { label: "Certificada", color: "success" },
  DRAFT: { label: "Sin firmar", color: "warning", detail: "Borrador" },
  SKIPPED: { label: "Sin firmar", color: "warning", detail: "Omitida (FEL apagado)" },
  FAILED: { label: "Error FEL", color: "danger" },
  VOID: { label: "Anulada", color: "dark" },
};

export const TAX_INVOICE_SOURCE_LABELS = {
  MANUAL: "Manual",
  KIOSK_SALE: "POS kiosko",
  ONLINE_SALE: "Venta en línea",
  FEL_NOTE: "Nota de crédito/débito",
};

export const TAX_INVOICE_DOCUMENT_TYPES = {
  FACT: { label: "Factura", short: "FACT" },
  FCAM: { label: "Factura cambiaria", short: "FCAM" },
  NCRE: { label: "Nota de crédito", short: "NCRE" },
  NDEB: { label: "Nota de débito", short: "NDEB" },
};

export function taxInvoiceStatus(status) {
  const key = String(status || "").toUpperCase();
  return TAX_INVOICE_STATUS[key] || { label: status || "—", color: "secondary" };
}

export function taxInvoiceDocumentLabel(documentType) {
  const key = String(documentType || "").toUpperCase();
  return TAX_INVOICE_DOCUMENT_TYPES[key]?.label || "Factura";
}

export function isCreditDebitNote(documentType) {
  return ["NCRE", "NDEB"].includes(String(documentType || "").toUpperCase());
}

/** Q 1,234.50 */
export function formatQuetzales(value) {
  return `Q ${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 1 en vez de 1.000; conserva decimales reales (0.5). */
export function formatQuantity(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

/** SAT 2.2.4 regla 11: FACT/FCAM a CF debe ser menor a Q2,500.00. */
export const CONSUMIDOR_FINAL_LIMIT = 2500;
