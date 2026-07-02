export function canEditTaxInvoiceFel({ hasRole, hasAnyRole, hasPermission }) {
  if (typeof hasRole === "function" && hasRole("ADMIN")) {
    return true;
  }
  if (typeof hasAnyRole === "function" && hasAnyRole(["ADMIN", "ADMINISTRADOR", "CONTABILIDAD", "LOGISTICA", "LOGISTICO"])) {
    return true;
  }
  if (typeof hasPermission === "function") {
    if (hasPermission("CONTABILIDAD.FACTURAS.EDITAR")) return true;
    if (hasPermission("CONTABILIDAD.FACTURAS.CERTIFICAR")) return true;
  }
  return false;
}

export function toFelDateInputValue(value) {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
