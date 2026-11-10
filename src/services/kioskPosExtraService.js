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

const post = async (path, body, fallbackMessage) => {
  const response = await fetch(`${API_URL}/kiosk-pos${path}`, {
    method: "POST",
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseJson(response, fallbackMessage);
};

// --- Complemento extra (solicitud + autorización) ---

export const createExtraRequest = (payload) =>
  post("/extra-requests", payload, "No se pudo enviar la solicitud de complemento.");

/** Solicitudes del día del kiosko (pendientes, aprobadas, rechazadas sin descartar). */
export const listExtraRequests = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/extra-requests${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudieron cargar las solicitudes de complemento.");
};

export const listPendingExtraRequests = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/extra-requests/pending-authorizations${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudieron cargar los complementos pendientes.");
};

export const authorizeExtraRequest = (id) =>
  post(`/extra-requests/${id}/authorize`, undefined, "No se pudo autorizar el complemento.");

export const rejectExtraRequest = (id, reason) =>
  post(`/extra-requests/${id}/reject`, { reason }, "No se pudo rechazar el complemento.");

export const cancelExtraRequest = (id) =>
  post(`/extra-requests/${id}/cancel`, undefined, "No se pudo cancelar la solicitud.");

// --- Ventas (carritos) en espera ---

export const holdKioskCart = (payload) =>
  post("/held-carts", payload, "No se pudo dejar la venta en espera.");

export const listHeldCarts = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/held-carts${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudieron cargar las ventas en espera.");
};

export const resumeHeldCart = (id) =>
  post(`/held-carts/${id}/resume`, undefined, "No se pudo retomar la venta en espera.");

export const discardHeldCart = async (id) => {
  const response = await fetch(`${API_URL}/kiosk-pos/held-carts/${id}`, {
    method: "DELETE",
    headers: headers(),
  });
  return parseJson(response, "No se pudo descartar la venta en espera.");
};
