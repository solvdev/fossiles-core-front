import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

async function apiRequest(path) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail = errorData.message || errorData.error || errorData.detail;
    throw new Error(detail || `Error al consultar inventario de productos (${response.status})`);
  }

  return response.json();
}

function queryParams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const getProductMovementsAccountingLocations = async () =>
  apiRequest(`/product-movements-accounting/locations`);

export const getProductMovementsAccountingStocks = async (filters = {}) =>
  apiRequest(`/product-movements-accounting/stocks${queryParams(filters)}`);

export const getProductMovementsAccounting = async (filters = {}) =>
  apiRequest(`/product-movements-accounting/movements${queryParams(filters)}`);
