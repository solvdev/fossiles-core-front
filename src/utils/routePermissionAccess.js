/**
 * Indica si el usuario tiene alguno de los permisos declarados en la ruta
 * (view, create, edit, delete, approve, etc.).
 */
export function routeGrantsAnyPermission(permissionsObj, hasPermission) {
  if (!permissionsObj || typeof hasPermission !== "function") return false;
  return Object.values(permissionsObj)
    .flat()
    .filter(Boolean)
    .some((code) => hasPermission(code));
}

export function isSidebarRouteVisible(view, hasPermission) {
  if (!view || view.showInSidebar === false) return false;
  return routeGrantsAnyPermission(view.permissions, hasPermission);
}
