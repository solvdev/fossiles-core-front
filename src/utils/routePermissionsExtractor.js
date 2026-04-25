/**
 * Utilidad para extraer permisos de las rutas definidas en routes.js
 * y generar un reporte de permisos para sincronización con el backend
 */

/**
 * Extrae todos los permisos definidos en las rutas
 * @param {Array} routes - Array de rutas del archivo routes.js
 * @returns {Array} Array de objetos con información de permisos
 */
export const extractPermissionsFromRoutes = (routes) => {
  const permissions = [];
  const processedPaths = new Set();

  const processRoute = (route, parentModule = null) => {
    // Si es un collapse, procesar sus views
    if (route.collapse && route.views) {
      route.views.forEach(view => processRoute(view, route.module || parentModule));
      return;
    }

    // Si no tiene path, saltar
    if (!route.path) return;

    // Construir el path completo
    const fullPath = `${route.layout || '/admin'}${route.path}`;
    
    // Evitar duplicados
    if (processedPaths.has(fullPath)) return;
    processedPaths.add(fullPath);

    // Si tiene objeto permissions, extraer los permisos
    if (route.permissions) {
      const module = route.module || parentModule || 'GENERAL';
      
      // Extraer permisos individuales
      // Manejar tanto strings como arrays (para compatibilidad)
      const processPermission = (permissionCode, action, actionName) => {
        if (!permissionCode) return;
        
        // Si es array, procesar cada permiso
        if (Array.isArray(permissionCode)) {
          permissionCode.forEach(code => {
            permissions.push({
              code: code,
              name: `${route.name || route.path} - ${actionName}`,
              description: `Permiso para ${actionName.toLowerCase()} en ${route.name || route.path}`,
              module: module,
              routePath: fullPath,
              action: action,
            });
          });
        } else {
          // Si es string, procesar normalmente
          permissions.push({
            code: permissionCode,
            name: `${route.name || route.path} - ${actionName}`,
            description: `Permiso para ${actionName.toLowerCase()} en ${route.name || route.path}`,
            module: module,
            routePath: fullPath,
            action: action,
          });
        }
      };
      
      processPermission(route.permissions.view, 'VER', 'Ver');
      processPermission(route.permissions.create, 'CREAR', 'Crear');
      processPermission(route.permissions.edit, 'EDITAR', 'Editar');
      processPermission(route.permissions.delete, 'ELIMINAR', 'Eliminar');
      processPermission(route.permissions.approve, 'APROBAR', 'Aprobar');
      
      // También procesar permisos específicos adicionales (materialsView, productsView, etc.)
      if (route.permissions.materialsView) {
        processPermission(route.permissions.materialsView, 'VER', 'Ver Materiales');
      }
      if (route.permissions.materialsCreate) {
        processPermission(route.permissions.materialsCreate, 'CREAR', 'Crear Materiales');
      }
      if (route.permissions.materialsEdit) {
        processPermission(route.permissions.materialsEdit, 'EDITAR', 'Editar Materiales');
      }
      if (route.permissions.productsView) {
        processPermission(route.permissions.productsView, 'VER', 'Ver Productos');
      }
      if (route.permissions.productsCreate) {
        processPermission(route.permissions.productsCreate, 'CREAR', 'Crear Productos');
      }
      if (route.permissions.productsEdit) {
        processPermission(route.permissions.productsEdit, 'EDITAR', 'Editar Productos');
      }
    }
  };

  routes.forEach(route => processRoute(route));
  
  return permissions;
};

/**
 * Genera un reporte de sincronización comparando permisos de rutas con permisos en BD
 * @param {Array} routePermissions - Permisos extraídos de rutas
 * @param {Array} dbPermissions - Permisos existentes en la base de datos
 * @returns {Object} Reporte con permisos faltantes y huérfanos
 */
export const generateSyncReport = (routePermissions, dbPermissions) => {
  const routePermissionCodes = new Set(routePermissions.map(p => p.code));
  const dbPermissionCodes = new Set(dbPermissions.map(p => p.code));

  const missing = routePermissions.filter(p => !dbPermissionCodes.has(p.code));
  const orphaned = dbPermissions.filter(p => !routePermissionCodes.has(p.code));

  return {
    totalInRoutes: routePermissions.length,
    totalInDB: dbPermissions.length,
    missing: missing,
    orphaned: orphaned,
    synced: routePermissions.filter(p => dbPermissionCodes.has(p.code)).length,
  };
};

/**
 * Obtiene el permiso requerido para una ruta específica
 * @param {Array} routes - Array de rutas
 * @param {string} path - Path completo de la ruta (ej: '/admin/materials')
 * @param {string} action - Acción requerida ('view', 'create', 'edit', 'delete', 'approve')
 * @returns {string|null} Código del permiso o null si no se encuentra
 */
export const getRequiredPermissionForRoute = (routes, path, action = 'view') => {
  const processRoute = (route) => {
    if (route.collapse && route.views) {
      for (const view of route.views) {
        const result = processRoute(view);
        if (result) return result;
      }
      return null;
    }

    const fullPath = `${route.layout || '/admin'}${route.path}`;
    if (fullPath === path && route.permissions) {
      return route.permissions[action] || route.permissions.view || null;
    }

    return null;
  };

  for (const route of routes) {
    const result = processRoute(route);
    if (result) return result;
  }

  return null;
};

