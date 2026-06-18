/**
 * Mapeo de rutas a permisos requeridos
 * Cada ruta debe tener el permiso READ correspondiente para ser accesible
 */

export const routePermissions = {
  // DASHBOARDS
  '/admin/dashboard-production': 'DASHBOARD_PRODUCTION_VIEW',
  '/admin/dashboard-sales': 'DASHBOARD_SALES_VIEW',

  // SEGURIDAD & USUARIOS
  '/admin/users': 'USER_READ',
  '/admin/roles': 'ROLE_READ',
  '/admin/permissions': 'PERMISSION_READ',
  '/admin/user-roles': 'USER_ROLE_ASSIGN',
  '/admin/role-permissions': 'ROLE_PERMISSION_ASSIGN',
  '/admin/permissions-overview': 'PERMISSION_READ',

  // ORGANIZACIÓN
  '/admin/departments': 'DEPARTMENT_READ',
  '/admin/cost-centers': 'COST_CENTER_READ',
  '/admin/operational-units': 'OPERATIONAL_UNIT_READ',

  // CATÁLOGOS BASE
  '/admin/uom': 'UOM_READ',
  '/admin/product-categories': 'PRODUCT_CATEGORY_READ',
  '/admin/colors': 'COLOR_READ',
  '/admin/locations': 'LOCATION_READ',
  '/admin/currencies': 'CURRENCY_READ',
  '/admin/suppliers': 'SUPPLIER_READ',
  '/admin/customers': 'CUSTOMER_READ',

  // MATERIALES
  '/admin/materials': 'MATERIAL_READ',
  '/admin/materials-inventory': 'MATERIAL_INVENTORY_VIEW',
  '/admin/materials-kardex': 'MATERIAL_KARDEX_VIEW',
  '/admin/material-colors': 'MATERIAL_READ', // Usa el mismo permiso que materiales

  // PRODUCTOS
  '/admin/products': 'PRODUCT_READ',
  '/admin/bom': 'BOM_READ',
  '/admin/bom-items': 'BOM_ITEM_READ',
  '/admin/production-times': 'PRODUCTION_TIME_READ',
  '/admin/product-prices': 'PRODUCT_READ', // Usa el mismo permiso que productos

  // PRODUCCIÓN
  '/admin/production-orders': 'PRODUCTION_ORDER_READ',
  '/admin/daily-production-plan': 'DAILY_PRODUCTION_PLAN_VIEW',
  '/admin/tasks-by-station': 'TASK_VIEW',

  // INVENTARIOS
  '/admin/inventory-by-location': 'INVENTORY_VIEW',
  '/admin/inventory-kardex': 'INVENTORY_KARDEX_VIEW',
  '/admin/inventory-transfers': 'INVENTORY_TRANSFER_CREATE',
  '/admin/critical-inventory': 'CRITICAL_INVENTORY_VIEW',

  // DISTRIBUCIÓN
  '/admin/prepare-shipments': 'SHIPMENT_PREPARE',
  '/admin/authorize-shipments': 'DISTRIBUCION.AUTORIZAR_ENVIOS.VER',
  '/admin/shipments-in-transit': 'SHIPMENT_IN_TRANSIT_VIEW',
  '/admin/receipt-confirmation': 'SHIPMENT_RECEIPT_CONFIRM',

  // KIOSCOS
  '/admin/kiosk-inventory': 'KIOSK_INVENTORY_VIEW',
  '/admin/kiosk-sales': 'KIOSK_SALE_VIEW',
  '/admin/kiosk-returns': 'KIOSK_RETURN_VIEW',

  // VENTAS
  '/admin/total-sales': 'SALES_TOTAL_VIEW',
  '/admin/sales-by-seller': 'SALES_BY_SELLER_VIEW',
  '/admin/online-sales': 'SALES_ONLINE_VIEW',
  '/admin/invoicing': 'CONTABILIDAD.FACTURAS.VER',
  '/admin/accounting/invoices': 'CONTABILIDAD.FACTURAS.VER',
  '/admin/accounting/invoices/new': 'CONTABILIDAD.FACTURAS.CREAR',
  '/admin/customer-accounts': 'VENTAS.CUENTAS_COBRAR.VER',

  // REPORTES
  '/admin/production-reports': 'REPORT_PRODUCTION_VIEW',
  '/admin/inventory-reports': 'REPORT_INVENTORY_VIEW',
  '/admin/sales-reports': 'REPORT_SALES_VIEW',
  '/admin/cost-reports': 'REPORT_COST_VIEW',
  '/admin/kiosk-performance': 'REPORT_KIOSK_PERFORMANCE_VIEW',

  // CONFIGURACIÓN GENERAL
  '/admin/taxes': 'CONFIG_TAX_READ',
  '/admin/document-series': 'CONFIG_DOCUMENT_SERIES_READ',
  '/admin/print-formats': 'CONFIG_PRINT_FORMAT_READ',
  '/admin/email-config': 'CONFIG_NOTIFICATION_READ',
  '/admin/notifications-config': 'CONFIG_NOTIFICATION_READ',
  '/admin/system-settings': 'SYSTEM_SETTINGS_UPDATE',
};

/**
 * Obtiene el permiso requerido para una ruta
 * @param {string} path - Ruta a verificar
 * @returns {string|null} Código del permiso requerido o null si no requiere permiso específico
 */
export const getRequiredPermission = (path) => {
  return routePermissions[path] || null;
};

