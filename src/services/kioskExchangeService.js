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

export const listKioskExchanges = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/exchanges${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudieron cargar las boletas de cambio.");
};

export const listPendingReintegros = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/exchanges/pending-reintegros${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudieron cargar los reintegros pendientes.");
};

export const getKioskExchangeById = async (id, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/exchanges/${id}${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar la boleta de cambio.");
};

export const lookupKioskSale = async (query, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/sales/lookup${toQuery({ query, kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se encontró la venta indicada.");
};

export const previewKioskExchange = async (payload) => {
  const response = await fetch(`${API_URL}/kiosk-pos/exchanges/preview`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo calcular la boleta de cambio.");
};

export const completeKioskExchange = async (payload) => {
  const response = await fetch(`${API_URL}/kiosk-pos/exchanges`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo registrar la boleta de cambio.");
};

export const completeKioskSimpleReturn = async (payload) => {
  const response = await fetch(`${API_URL}/kiosk-pos/returns`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo registrar la devolución.");
};

export const reintegrateKioskReturn = async (slipId, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/exchanges/${slipId}/reintegrate${toQuery({ kioskLocationId })}`,
    {
      method: "POST",
      headers: headers(),
    }
  );
  return parseJson(response, "No se pudo reintegrar la devolución.");
};
