import routes from "routes.js";

const ADMIN_PREFIX = "/admin";

/** Rutas preferidas para encargadas (en orden). */
const ENCARGADA_LANDING_PRIORITY = [`${ADMIN_PREFIX}/kiosk-sales`];

const DASHBOARD_LANDING_PATHS = [
  `${ADMIN_PREFIX}/dashboard-production`,
  `${ADMIN_PREFIX}/dashboard-sales`,
];

let cachedAdminRoutes = null;

function normalizePermissionCodes(permissionCode) {
  if (!permissionCode) return [];
  if (Array.isArray(permissionCode)) return permissionCode.filter(Boolean);
  if (String(permissionCode).includes("|")) {
    return String(permissionCode).split("|").map((c) => c.trim()).filter(Boolean);
  }
  return [permissionCode];
}

function permissionGranted(userPermissions, routePermission) {
  const required = normalizePermissionCodes(routePermission);
  if (required.length === 0) return true;
  if (!Array.isArray(userPermissions) || userPermissions.length === 0) return false;
  if (userPermissions.includes("ADMIN_FULL_ACCESS") || userPermissions.includes("SUPER_ADMIN")) {
    return true;
  }
  return required.some((code) => userPermissions.includes(code));
}

function mergeRoutePermissions(existingCodes, nextCode) {
  return [...new Set([...existingCodes, ...normalizePermissionCodes(nextCode)])];
}

function collectAdminRoutes(routeList = routes) {
  const byPath = new Map();

  const addEntry = (path, viewPermission) => {
    const codes = normalizePermissionCodes(viewPermission);
    if (codes.length === 0) return;
    const existing = byPath.get(path);
    if (!existing) {
      byPath.set(path, { path, permissions: codes });
      return;
    }
    byPath.set(path, {
      path,
      permissions: mergeRoutePermissions(existing.permissions, codes),
    });
  };

  (routeList || []).forEach((route) => {
    if (route.collapse && Array.isArray(route.views)) {
      collectAdminRoutes(route.views).forEach((entry) => {
        entry.permissions.forEach((code) => addEntry(entry.path, code));
      });
      return;
    }
    if (route.layout === ADMIN_PREFIX && route.path) {
      addEntry(`${ADMIN_PREFIX}${route.path}`, route.permissions?.view || null);
    }
  });

  return Array.from(byPath.values());
}

function getAdminRoutes() {
  if (!cachedAdminRoutes) {
    cachedAdminRoutes = collectAdminRoutes();
  }
  return cachedAdminRoutes;
}

function firstAccessibleFromPaths(permissions, paths) {
  const adminRoutes = getAdminRoutes();
  for (const path of paths) {
    const route = adminRoutes.find((entry) => entry.path === path);
    if (route && permissionGranted(permissions, route.permissions)) {
      return path;
    }
  }
  return null;
}

/**
 * Resuelve la ruta inicial según permisos del usuario.
 * Encargadas con POS → kiosko ventas primero.
 * Resto: dashboard si tiene permiso, si no la primera vista permitida del menú.
 */
export function resolveDefaultLandingRoute(permissions, options = {}) {
  const { isEncargada = false } = options;
  const adminRoutes = getAdminRoutes();

  if (isEncargada) {
    const encargadaLanding = firstAccessibleFromPaths(permissions, ENCARGADA_LANDING_PRIORITY);
    if (encargadaLanding) return encargadaLanding;
  }

  const dashboardLanding = firstAccessibleFromPaths(permissions, DASHBOARD_LANDING_PATHS);
  if (dashboardLanding) return dashboardLanding;

  for (const route of adminRoutes) {
    if (permissionGranted(permissions, route.permissions)) {
      return route.path;
    }
  }

  return `${ADMIN_PREFIX}/dashboard-production`;
}

export function userHasAnyAccessibleRoute(permissions) {
  return getAdminRoutes().some((route) => permissionGranted(permissions, route.permissions));
}
