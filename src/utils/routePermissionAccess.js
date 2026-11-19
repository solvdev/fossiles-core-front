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

/** Igual que KioskAccessHelper.normalizeRole: mayúsculas y sin acentos. */
export function normalizeRoleName(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/Á/g, "A")
    .replace(/É/g, "E")
    .replace(/Í/g, "I")
    .replace(/Ó/g, "O")
    .replace(/Ú/g, "U");
}

/**
 * True si algún nombre de rol contiene una de las subcadenas.
 * Sin lista, la ruta no restringe por rol.
 */
export function roleNamesIncludeAny(roles, tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) return true;
  const needles = tokens.map((token) => normalizeRoleName(token)).filter(Boolean);
  if (needles.length === 0) return true;
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => {
    if (role == null) return false;
    const name = normalizeRoleName(typeof role === "string" ? role : role.name);
    if (!name) return false;
    return needles.some((token) => name.includes(token));
  });
}

export function isSidebarRouteVisible(view, hasPermission, roles) {
  if (!view || view.showInSidebar === false) return false;
  if (!routeGrantsAnyPermission(view.permissions, hasPermission)) return false;
  return roleNamesIncludeAny(roles, view.roleNameIncludes);
}
