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
    const errorData = await response.json().catch(() => ({}));
    const detail = errorData.message || errorData.error || errorData.detail;
    throw new Error(detail || `Error en Product Ledger Lab (${response.status})`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

function labParams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export const productLedgerLabListLocations = async () =>
  apiRequest(`/product-ledger-lab/locations`);

export const productLedgerLabListStocks = async (filters = {}) =>
  apiRequest(`/product-ledger-lab/stocks${labParams(filters)}`);

export const productLedgerLabListMovements = async (filters = {}) =>
  apiRequest(`/product-ledger-lab/movements${labParams(filters)}`);

export const productLedgerLabGetMovement = async (id) =>
  apiRequest(`/product-ledger-lab/movements/${id}`);

export const productLedgerLabCreateMovement = async (payload) =>
  apiRequest(`/product-ledger-lab/movements`, { method: "POST", body: payload });

export const productLedgerLabUpdateMovement = async (id, payload) =>
  apiRequest(`/product-ledger-lab/movements/${id}`, { method: "PUT", body: payload });

export const productLedgerLabDeleteMovement = async (id) =>
  apiRequest(`/product-ledger-lab/movements/${id}`, { method: "DELETE" });

export const productLedgerLabUpdateStock = async (stockId, payload) =>
  apiRequest(`/product-ledger-lab/stocks/${stockId}`, { method: "PUT", body: payload });

export const productLedgerLabReplayStock = async (stockId) =>
  apiRequest(`/product-ledger-lab/stocks/${stockId}/replay`, { method: "POST" });

export const productLedgerLabReplayAllStocks = async (locationId) =>
  apiRequest(`/product-ledger-lab/locations/${locationId}/replay-all`, { method: "POST" });
