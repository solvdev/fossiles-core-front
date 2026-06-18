const stripDiacritics = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

export const normalizeSellerName = (value) => stripDiacritics(String(value || "").trim()).toUpperCase();

/** Vendedor Luis Felipe (cualquier tipo de OP, incluidos cinchos). */
export const isLuisFelipeSeller = (sellerName) => normalizeSellerName(sellerName).includes("LUIS FELIPE");

/** Flujo OPV vendedor: empaques, costo de envío, ENVP y formato de impresión especial. */
export const isLuisFelipeVendorFlow = (_orderType, sellerName) => isLuisFelipeSeller(sellerName);
