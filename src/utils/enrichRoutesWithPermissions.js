/**
 * Utilidad para ayudar a enriquecer rutas con permisos
 * Este script puede ser usado para generar automáticamente objetos permissions basándose en convenciones
 */

/**
 * Genera código de permiso basándose en el módulo, nombre de pantalla y acción
 * @param {string} module - Módulo (ej: "INVENTARIOS", "COMPRAS")
 * @param {string} screenName - Nombre de la pantalla (ej: "AJUSTES", "ORDENES")
 * @param {string} action - Acción (VER, CREAR, EDITAR, ELIMINAR, APROBAR)
 * @returns {string} Código de permiso (ej: "INVENTARIOS.AJUSTES.VER")
 */
export const generatePermissionCode = (module, screenName, action) => {
  // Normalizar nombres: convertir a mayúsculas y reemplazar espacios/guiones
  const normalizedModule = module.toUpperCase().replace(/[\s-]/g, '_');
  const normalizedScreen = screenName.toUpperCase().replace(/[\s-]/g, '_');
  const normalizedAction = action.toUpperCase();
  
  return `${normalizedModule}.${normalizedScreen}.${normalizedAction}`;
};

/**
 * Genera objeto permissions para una ruta basándose en convenciones
 * @param {string} module - Módulo al que pertenece
 * @param {string} screenName - Nombre de la pantalla
 * @param {Array<string>} actions - Acciones disponibles (default: ["VER"])
 * @returns {Object} Objeto permissions
 */
export const generatePermissionsObject = (module, screenName, actions = ["VER"]) => {
  const permissions = {};
  
  actions.forEach(action => {
    const permissionCode = generatePermissionCode(module, screenName, action);
    const actionKey = action.toLowerCase();
    permissions[actionKey] = permissionCode;
  });
  
  return permissions;
};

/**
 * Mapea nombres de rutas comunes a nombres de pantallas para permisos
 */
const routeNameToScreenName = {
  "Materiales": "MATERIALES",
  "Productos": "PRODUCTOS",
  "Órdenes de Producción": "ORDENES_PRODUCCION",
  "Órdenes de Compra": "ORDENES_COMPRA",
  "Solicitudes": "SOLICITUDES",
  "Ajustes de Inventario": "AJUSTES",
  "Transferencias": "TRANSFERENCIAS",
  "Inventario Materiales": "INVENTARIO_MATERIALES",
  "Inventario Productos": "INVENTARIO_PRODUCTOS",
  "Kardex Materiales": "KARDEX_MATERIALES",
  "Kardex Productos": "KARDEX_PRODUCTOS",
  "Inventario Crítico": "INVENTARIO_CRITICO",
  "Recepción de Materiales": "RECEPCION_MATERIALES",
  "Asientos Contables": "ASIENTOS_CONTABLES",
  "Inteligencia de Stock": "INTELIGENCIA_STOCK",
  "Historial de Consumo": "HISTORIAL_CONSUMO",
  "Revisar Solicitudes": "REVISAR_SOLICITUDES",
  "Mis Solicitudes": "SOLICITUDES",
};

/**
 * Mapea módulos de collapse a módulos para permisos
 */
const collapseToModule = {
  "Inventarios": "INVENTARIOS",
  "Compras": "COMPRAS",
  "Producción": "PRODUCCION",
  "Distribución": "DISTRIBUCION",
  "Kioscos": "KIOSCOS",
  "Ventas": "VENTAS",
  "Reportes": "REPORTES",
  "Seguridad & Usuarios": "SEGURIDAD",
  "Organización": "ORGANIZACION",
  "Catálogos Base": "CATALOGOS",
  "Materiales": "MATERIALES",
  "Productos": "PRODUCTOS",
  "Configuración General": "CONFIGURACION",
  "Dashboards": "DASHBOARDS",
};

/**
 * Sugiere permisos para una ruta basándose en su contexto
 * @param {Object} route - Objeto de ruta
 * @param {string} parentModule - Módulo del collapse padre
 * @returns {Object} Objeto permissions sugerido
 */
export const suggestPermissionsForRoute = (route, parentModule = null) => {
  const module = route.module || parentModule || "GENERAL";
  const screenName = routeNameToScreenName[route.name] || route.name.toUpperCase().replace(/[\s-]/g, '_');
  
  // Determinar acciones basándose en el tipo de pantalla
  let actions = ["VER"];
  
  // Si es una lista, probablemente tenga crear/editar/eliminar
  if (route.name.includes("List") || route.name.includes("Lista") || route.name.includes("Gestión")) {
    actions = ["VER", "CREAR", "EDITAR", "ELIMINAR"];
  }
  
  // Si es un formulario específico
  if (route.name.includes("Form") || route.name.includes("Nuevo") || route.name.includes("Editar")) {
    actions = ["CREAR", "EDITAR"];
  }
  
  // Si es revisión/aprobación
  if (route.name.includes("Revisar") || route.name.includes("Aprobar") || route.name.includes("Revisión")) {
    actions = ["VER", "APROBAR"];
  }
  
  // Si es dashboard o reporte
  if (route.name.includes("Dashboard") || route.name.includes("Reporte") || route.name.includes("Vista")) {
    actions = ["VER"];
  }
  
  return generatePermissionsObject(module, screenName, actions);
};

/**
 * Enriquece una ruta con permisos si no los tiene
 * @param {Object} route - Objeto de ruta
 * @param {string} parentModule - Módulo del collapse padre
 * @returns {Object} Ruta enriquecida
 */
export const enrichRoute = (route, parentModule = null) => {
  if (route.permissions) {
    return route; // Ya tiene permisos
  }
  
  const module = route.module || parentModule || "GENERAL";
  const suggestedPermissions = suggestPermissionsForRoute(route, parentModule);
  
  return {
    ...route,
    module,
    permissions: suggestedPermissions,
  };
};

/**
 * Enriquece todas las rutas recursivamente
 * @param {Array} routes - Array de rutas
 * @param {string} parentModule - Módulo del collapse padre
 * @returns {Array} Rutas enriquecidas
 */
export const enrichAllRoutes = (routes, parentModule = null) => {
  return routes.map(route => {
    if (route.collapse && route.views) {
      // Es un collapse, procesar sus views
      const module = route.module || collapseToModule[route.name] || parentModule;
      return {
        ...route,
        module,
        views: enrichAllRoutes(route.views, module),
      };
    } else {
      // Es una ruta individual
      return enrichRoute(route, parentModule);
    }
  });
};

