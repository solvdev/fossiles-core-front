const envEnabled = (value) => String(value || "").trim().toLowerCase() === "true";

/**
 * Herramientas admin POS/contabilidad. Activar en .env cuando las necesites:
 *
 * REACT_APP_ENABLE_POS_TAX_INVOICE_BACKFILL=true
 * REACT_APP_ENABLE_POS_SALE_RESTORE=true
 */
export const KIOSK_POS_ADMIN_TOOLS = {
  taxInvoiceBackfill: envEnabled(process.env.REACT_APP_ENABLE_POS_TAX_INVOICE_BACKFILL),
  saleRestore: envEnabled(process.env.REACT_APP_ENABLE_POS_SALE_RESTORE),
};
