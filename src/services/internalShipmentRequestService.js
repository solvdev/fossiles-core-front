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

export const listInternalShipmentRequests = async (filters = {}) => {
  const response = await fetch(`${API_URL}/internal-shipment-requests${toQuery(filters)}`, {
    headers: headers(),
  });
  return parseJson(response, "No se pudieron cargar las solicitudes.");
};

export const getInternalShipmentRequestById = async (id) => {
  const response = await fetch(`${API_URL}/internal-shipment-requests/${id}`, {
    headers: headers(),
  });
  return parseJson(response, "No se pudo cargar la solicitud.");
};

export const createInternalShipmentRequest = async (payload) => {
  const response = await fetch(`${API_URL}/internal-shipment-requests`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo crear la solicitud.");
};

export const approveInternalShipmentRequest = async (id) => {
  const response = await fetch(`${API_URL}/internal-shipment-requests/${id}/approve`, {
    method: "POST",
    headers: headers(),
  });
  return parseJson(response, "No se pudo aprobar la solicitud.");
};

export const rejectInternalShipmentRequest = async (id, reason) => {
  const response = await fetch(`${API_URL}/internal-shipment-requests/${id}/reject`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ reason }),
  });
  return parseJson(response, "No se pudo denegar la solicitud.");
};

export const listExistingEnviShipments = async () => {
  const response = await fetch(`${API_URL}/internal-shipment-requests/existing-envi`, {
    headers: headers(),
  });
  return parseJson(response, "No se pudieron cargar los ENVI existentes.");
};
