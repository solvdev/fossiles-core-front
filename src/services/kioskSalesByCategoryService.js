import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const toKioskIdsParam = (kioskIds) => {
  if (Array.isArray(kioskIds)) {
    return kioskIds.map((id) => String(id).trim()).filter(Boolean).join(",");
  }
  return String(kioskIds || "").trim();
};

const DEFAULT_ERROR = "No se pudo generar el reporte de ventas de kioscos";

const fetchReport = async (path, params) => {
  const response = await fetch(`${API_URL}${path}?${params.toString()}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("No tienes acceso a este reporte.");
    }
    const errorData = await response.json().catch(() => ({ message: DEFAULT_ERROR }));
    throw new Error(errorData.message || DEFAULT_ERROR);
  }

  return response.json();
};

/**
 * Ventas de kioscos por categoría.
 * GET /reports/kiosk-sales-by-category?from=YYYY-MM-DD&to=YYYY-MM-DD&kioskIds=1,2,3&compare=true
 * Omitir kioskIds = todos los kioscos. from/to inclusive (fechas de Guatemala).
 * Respuesta: { from, to, rows: [{ categoryId, categoryName, subgroupCode, subgroupLabel,
 * units, totalAmount, totalAmountNoIva }], totals: { units, totalAmount, totalAmountNoIva,
 * packagingUnits, packagingAmount } }.
 * Una fila por categoría+subgrupo, ordenadas por totalAmount desc. subgroup* puede faltar (backend viejo).
 * El empaque (bolsas y cajas SUM-) viene como subgrupo EMPAQUE y no entra en totals.units.
 * Con compare=true agrega previousFrom, previousTo y previous (mismo reporte del periodo anterior).
 */
export const getKioskSalesByCategory = async ({ from, to, kioskIds, compare } = {}) => {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  const ids = toKioskIdsParam(kioskIds);
  if (ids) params.append("kioskIds", ids);
  if (compare) params.append("compare", "true");
  return fetchReport("/reports/kiosk-sales-by-category", params);
};

/**
 * Productos de una categoría de más a menos vendidos.
 * GET /reports/kiosk-sales-by-category/top-products?from&to&kioskIds&categoryId&subgroupCode&compare
 * Sin categoryId = «Sin categoría». Sin subgroupCode = todos los subgrupos (sin empaque).
 * Respuesta: { from, to, previousFrom, previousTo, categoryId, categoryName, subgroupCode, kioskCount,
 * totals: { units, totalAmount, totalAmountNoIva, products, previousUnits, previousAmount },
 * items: [{ productId, productCode, productName, subgroupCode, subgroupLabel, units, totalAmount,
 * totalAmountNoIva, kiosksSold, previousUnits, previousAmount, topColors: [{ color, units }] }] }.
 */
export const getKioskTopProducts = async ({ from, to, kioskIds, categoryId, subgroupCode, compare } = {}) => {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  const ids = toKioskIdsParam(kioskIds);
  if (ids) params.append("kioskIds", ids);
  if (categoryId != null && categoryId !== "") params.append("categoryId", String(categoryId));
  if (subgroupCode) params.append("subgroupCode", subgroupCode);
  if (compare) params.append("compare", "true");
  return fetchReport("/reports/kiosk-sales-by-category/top-products", params);
};
