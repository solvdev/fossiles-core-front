/**
 * Subcadenas del nombre de rol (ya en mayúsculas) que pueden ver
 * "Ventas de kioscos por categoría". Misma regla que
 * KioskAccessHelper.hasKioskSalesByCategoryReportAccess (fossiles-core-back#280):
 * ADMIN cubre SUPER_ADMIN y ADMIN_FULL_ACCESS; LOGIST cubre LOGISTICA y LOGISTICO;
 * CONTABIL cubre CONTABILIDAD.
 *
 * Solo oculta el menú y bloquea la ruta. No es control de acceso:
 * GET /api/reports/kiosk-sales-by-category debe responder 403 al resto.
 */
export const KIOSK_SALES_BY_CATEGORY_ROLE_NAME_TOKENS = ["ADMIN", "LOGIST", "CONTABIL"];
