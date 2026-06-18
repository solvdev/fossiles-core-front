import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

async function apiRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Error en operación de inventario kiosko" }));
    throw new Error(errorData.message || "Error en operación de inventario kiosko");
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export const getKioscoStock = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/stock`);

export const getKioscoMovimientos = async (locationId, filters = {}) => {
  const params = new URLSearchParams();
  if (filters.productId) params.append("productId", String(filters.productId));
  if (filters.colorId) params.append("colorId", String(filters.colorId));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/kiosco-inventory/${locationId}/movimientos${suffix}`);
};

export const getKioscoStockBajo = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/stock-bajo`);

export const getKioscoConsolidado = async () =>
  apiRequest(`/kiosco-inventory/reporte/consolidado`);

export const registrarKioscoEntrada = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/entrada`, { method: "POST", body: payload });

export const registrarKioscoVenta = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/venta`, { method: "POST", body: payload });

export const registrarKioscoDevolucionDeposito = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/devolucion-deposito`, { method: "POST", body: payload });

export const registrarKioscoDevolucionCliente = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/devolucion-cliente`, { method: "POST", body: payload });

export const registrarKioscoTraslado = async (payload) =>
  apiRequest(`/kiosco-inventory/traslado`, { method: "POST", body: payload });

export const registrarKioscoMerma = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/merma`, { method: "POST", body: payload });

export const registrarKioscoAjuste = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/ajuste`, { method: "POST", body: payload });

export const registrarKioscoAnulacion = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/anular-factura`, { method: "POST", body: payload });

export const initializeKioscoInventory = async (locationId = null, userId = null) => {
  const params = new URLSearchParams();
  if (locationId) {
    params.append("locationId", String(locationId));
  }
  if (userId) {
    params.append("userId", String(userId));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/kiosco-inventory/initialize${suffix}`, { method: "POST" });
};
