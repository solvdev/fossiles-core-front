import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const headers = () => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
});

const toQuery = (params) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.append(key, String(value));
    }
  });
  const raw = query.toString();
  return raw ? `?${raw}` : "";
};

const parseJson = async (response, fallbackMessage) => {
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }
  const errorData = await response.json().catch(() => ({ message: fallbackMessage }));
  throw new Error(errorData.message || fallbackMessage);
};

export const getSalesDashboard = async ({ startDate, endDate, kioskLocationId, scope } = {}) => {
  const response = await fetch(
    `${API_URL}/sales/dashboard${toQuery({ startDate, endDate, kioskLocationId, scope })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el dashboard de ventas.");
};

export const getUnifiedSales = async ({ startDate, endDate, channel, kioskLocationId, limit } = {}) => {
  const response = await fetch(
    `${API_URL}/sales/unified${toQuery({ startDate, endDate, channel, kioskLocationId, limit })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudieron cargar las ventas.");
};
