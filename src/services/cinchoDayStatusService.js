import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const headers = () => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
});

/**
 * @param {string} dateYmd
 * @returns {Promise<{ workDate: string, statuses: { productionOrderId: number, productionOrderItemId: number, delivered: boolean }[] }>}
 */
export async function getCinchoDayStatuses(dateYmd) {
  const q = new URLSearchParams({ date: dateYmd });
  const response = await fetch(`${API_URL}/production/cincho-day-status?${q}`, {
    headers: headers(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al cargar entregas de cinchos" }));
    throw new Error(err.message || "Error al cargar entregas de cinchos");
  }
  return response.json();
}

/**
 * @param {{ workDate: string, productionOrderId: number, productionOrderItemId: number, delivered: boolean }} body
 */
export async function setCinchoDayDelivered(body) {
  const response = await fetch(`${API_URL}/production/cincho-day-status`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al guardar entregado" }));
    throw new Error(err.message || "Error al guardar entregado");
  }
  return response.json();
}

/**
 * @param {{ workDate: string, productionOrderId: number, productionOrderItemId: number, workStatus: string }} body
 */
export async function setCinchoDayWorkStatus(body) {
  const response = await fetch(`${API_URL}/production/cincho-day-status/work-status`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al guardar estado de trabajo" }));
    throw new Error(err.message || "Error al guardar estado de trabajo");
  }
  return response.json();
}
