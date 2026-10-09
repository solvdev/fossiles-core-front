import { isCinchoOrderType } from "utils/cinchoProductionHelper";

const stripDiacritics = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

export const normalizeSellerName = (value) => stripDiacritics(String(value || "").trim()).toUpperCase();

/** Vendedor Luis Felipe (cualquier tipo de OP, incluidos cinchos). */
export const isLuisFelipeSeller = (sellerName) => normalizeSellerName(sellerName).includes("LUIS FELIPE");

/** Flujo OPV vendedor: empaques, costo de envío, ENVP y formato de impresión especial. */
export const isLuisFelipeVendorFlow = (_orderType, sellerName) => isLuisFelipeSeller(sellerName);

/** OPC (cinchos) de Luis Felipe: el destino es un cliente del catálogo, nunca un kiosco. */
export const isLuisFelipeOpcOrder = (orderType, sellerName) =>
  isCinchoOrderType(orderType) && isLuisFelipeSeller(sellerName);

/**
 * La orden puede marcarse "para kiosco" (destino = kiosco o texto libre): OP normal (OPK) y OPC de cualquier
 * vendedor que no sea Luis Felipe. Las OPC de Luis Felipe van a clientes del catálogo.
 */
export const orderAllowsKioskDestination = (orderType, sellerName) =>
  String(orderType || "").trim().toUpperCase() === "NORMAL"
  || (isCinchoOrderType(orderType) && !isLuisFelipeSeller(sellerName));
