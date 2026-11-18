import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const toKioskIdsParam = (kioskIds) => {
  if (Array.isArray(kioskIds)) {
    return kioskIds.map((id) => String(id).trim()).filter(Boolean).join(",");
  }
  return String(kioskIds || "").trim();
};

/**
 * Ventas de kioscos por categoría.
 * GET /reports/kiosk-sales-by-category?from=YYYY-MM-DD&to=YYYY-MM-DD&kioskIds=1,2,3
 * Omitir kioskIds = todos los kioscos. from/to inclusive (fechas de Guatemala).
 * Respuesta: { from, to, rows: [{ categoryId, categoryName, units, totalAmount, totalAmountNoIva }],
 * totals: { units, totalAmount, totalAmountNoIva } }. Filas ordenadas por totalAmount desc.
 */
export const getKioskSalesByCategory = async ({ from, to, kioskIds } = {}) => {
  const params = new URLSearchParams();
  if (from) params.append("from", from);
  if (to) params.append("to", to);
  const ids = toKioskIdsParam(kioskIds);
  if (ids) params.append("kioskIds", ids);

  const response = await fetch(`${API_URL}/reports/kiosk-sales-by-category?${params.toString()}`, {
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
    const errorData = await response.json().catch(() => ({
      message: "No se pudo generar el reporte de ventas de kioscos",
    }));
    throw new Error(errorData.message || "No se pudo generar el reporte de ventas de kioscos");
  }

  return response.json();
};
