/**
 * Script para enriquecer automáticamente todas las rutas con permisos
 * Ejecutar este script y copiar el resultado en routes.js
 */

// Mapeo de nombres de módulos
const MODULE_MAP = {
  "Dashboards": "DASHBOARDS",
  "Seguridad & Usuarios": "SEGURIDAD",
  "Organización": "ORGANIZACION",
  "Catálogos Base": "CATALOGOS",
  "Materiales": "MATERIALES",
  "Productos": "PRODUCTOS",
  "Producción": "PRODUCCION",
  "Inventarios": "INVENTARIOS",
  "Compras": "COMPRAS",
  "Distribución": "DISTRIBUCION",
  "Kioscos": "KIOSCOS",
  "Ventas": "VENTAS",
  "Reportes": "REPORTES",
  "Configuración General": "CONFIGURACION",
};

// Mapeo de nombres de pantallas a códigos de pantalla
const SCREEN_NAME_MAP = {
  "Producción": "PRODUCCION",
  "Ventas": "VENTAS",
  "Usuarios": "USUARIOS",
  "Roles": "ROLES",
  "Permisos": "PERMISOS",
  "Asignar Roles": "ASIGNAR_ROLES",
  "Asignar Permisos": "ASIGNAR_PERMISOS",
  "Vista de Permisos": "VISTA_PERMISOS",
  "Matriz de Permisos": "MATRIZ_PERMISOS",
  "Departamentos": "DEPARTAMENTOS",
  "Centros de Costo": "CENTROS_COSTO",
  "Unidades Operativas": "UNIDADES_OPERATIVAS",
  "Empleados": "EMPLEADOS",
  "Unidades de Medida": "UNIDADES_MEDIDA",
  "Categorías de Producto": "CATEGORIAS_PRODUCTO",
  "Colores": "COLORES",
  "Kioscos": "KIOSCOS",
  "Monedas": "MONEDAS",
  "Clientes": "CLIENTES",
  "Proveedores": "PROVEEDORES",
  "Materiales": "MATERIALES",
  "Colores de Materiales": "COLORES_MATERIALES",
  "Productos": "PRODUCTOS",
  "BOM (Bill of Materials)": "BOM",
  "BOM Items": "BOM_ITEMS",
  "Tiempos de Producción": "TIEMPOS_PRODUCCION",
  "Precios de Productos": "PRECIOS_PRODUCTOS",
  "Órdenes de Producción": "ORDENES_PRODUCCION",
  "Plan de Producción Diario": "PLAN_PRODUCCION_DIARIO",
  "Tareas por Estación": "TAREAS_ESTACION",
  "Inventario Materiales": "INVENTARIO_MATERIALES",
  "Inventario Productos": "INVENTARIO_PRODUCTOS",
  "Kardex Materiales": "KARDEX_MATERIALES",
  "Kardex Productos": "KARDEX_PRODUCTOS",
  "Transferencias": "TRANSFERENCIAS",
  "Ajustes de Inventario": "AJUSTES",
  "Tipos Ubicación": "TIPOS_UBICACION",
  "Inventario Crítico": "INVENTARIO_CRITICO",
  "Mis Solicitudes": "SOLICITUDES",
  "Revisar Solicitudes": "REVISAR_SOLICITUDES",
  "Órdenes de Compra": "ORDENES_COMPRA",
  "Recepción de Materiales": "RECEPCION_MATERIALES",
  "Asientos Contables": "ASIENTOS_CONTABLES",
  "Inteligencia de Stock": "INTELIGENCIA_STOCK",
  "Historial de Consumo": "HISTORIAL_CONSUMO",
  "Distribuciones": "DISTRIBUCIONES",
  "Nueva Distribución": "NUEVA_DISTRIBUCION",
  "Detalle Distribución": "DETALLE_DISTRIBUCION",
  "Preparar Envíos": "PREPARAR_ENVIOS",
  "Envíos en Tránsito": "ENVIOS_TRANSITO",
  "Confirmación de Recepción": "CONFIRMACION_RECEPCION",
  "Inventario del Kiosko": "INVENTARIO_KIOSKO",
  "Ventas del Kiosko": "VENTAS_KIOSKO",
  "Devoluciones / Reintegros": "DEVOLUCIONES_REINTEGROS",
  "Ventas Totales": "VENTAS_TOTALES",
  "Ventas por Vendedor": "VENTAS_VENDEDOR",
  "Ventas Online": "VENTAS_ONLINE",
  "Facturación / Recibos": "FACTURACION_RECIBOS",
  "Impuestos": "IMPUESTOS",
  "Series de Documentos": "SERIES_DOCUMENTOS",
  "Formatos de Impresión": "FORMATOS_IMPRESION",
  "Configuración del Sistema": "CONFIGURACION_SISTEMA",
};

/**
 * Genera código de permiso
 */
function generatePermissionCode(module, screen, action) {
  return `${module}.${screen}.${action}`;
}

/**
 * Genera objeto permissions para una ruta
 */
function generatePermissions(module, screenName, routeName) {
  const screen = SCREEN_NAME_MAP[screenName] || screenName.toUpperCase().replace(/[\s-]/g, '_');
  
  // Determinar acciones basándose en el nombre de la ruta
  let actions = ["VER"];
  
  if (routeName.includes("List") || routeName.includes("Lista") || routeName.includes("Gestión") || 
      routeName.includes("Materiales") || routeName.includes("Productos") || routeName.includes("Usuarios") ||
      routeName.includes("Roles") || routeName.includes("Permisos") || routeName.includes("Departamentos") ||
      routeName.includes("Empleados") || routeName.includes("Órdenes") || routeName.includes("Solicitudes")) {
    actions = ["VER", "CREAR", "EDITAR", "ELIMINAR"];
  }
  
  if (routeName.includes("Form") || routeName.includes("Nuevo") || routeName.includes("Editar")) {
    actions = ["CREAR", "EDITAR"];
  }
  
  if (routeName.includes("Revisar") || routeName.includes("Aprobar") || routeName.includes("Revisión")) {
    actions = ["VER", "APROBAR"];
  }
  
  if (routeName.includes("Dashboard") || routeName.includes("Reporte") || routeName.includes("Vista") ||
      routeName.includes("Kardex") || routeName.includes("Inventario") || routeName.includes("Historial") ||
      routeName.includes("Inteligencia")) {
    actions = ["VER"];
  }
  
  if (routeName.includes("Matriz") || routeName.includes("Asignar")) {
    actions = ["VER", "EDITAR"];
  }
  
  const permissions = {};
  actions.forEach(action => {
    const key = action.toLowerCase();
    permissions[key] = generatePermissionCode(module, screen, action);
  });
  
  return permissions;
}

/**
 * Enriquece una ruta con permisos
 */
function enrichRoute(route, parentModule = null) {
  if (route.permissions) {
    return route; // Ya tiene permisos
  }
  
  const module = route.module || parentModule || "GENERAL";
  const screenName = route.name;
  const permissions = generatePermissions(module, screenName, route.name);
  
  return {
    ...route,
    module,
    permissions,
  };
}

/**
 * Enriquece todas las rutas recursivamente
 */
export function enrichAllRoutes(routes, parentModule = null) {
  return routes.map(route => {
    if (route.collapse && route.views) {
      const module = route.module || MODULE_MAP[route.name] || parentModule;
      return {
        ...route,
        module,
        views: enrichAllRoutes(route.views, module),
      };
    } else {
      return enrichRoute(route, parentModule);
    }
  });
}

