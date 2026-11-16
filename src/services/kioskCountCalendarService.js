import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
const BASE = "/kiosk-count-calendar";

async function apiRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_URL}${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail = errorData.message || errorData.error || errorData.detail;
    throw new Error(detail || `Error en el calendario de conteos (${response.status})`);
  }
  return response.json();
}

export const getCountCalendar = (month, supervisorUserId) => {
  const params = new URLSearchParams();
  if (month) params.append("month", month);
  if (supervisorUserId) params.append("supervisorUserId", String(supervisorUserId));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(suffix);
};

/** Genera UNA semana (cualquier día de esa semana) para las supervisoras indicadas. */
export const generateCountWeek = ({ weekStart, supervisorUserIds, redo = false, month }) =>
  apiRequest("/generate", { method: "POST", body: { weekStart, supervisorUserIds, redo, month } });

export const updateCountVisit = (id, changes) =>
  apiRequest(`/visits/${id}`, { method: "PATCH", body: changes });

/** Agrega una visita a mano; si el kiosco ya tuvo su visita del mes queda como revisita. */
export const addCountVisit = ({ locationId, visitDate, note, month }) =>
  apiRequest("/visits", { method: "POST", body: { locationId, visitDate, note, month } });

export const addCountBlockedDay = (date, reason) =>
  apiRequest("/blocked-days", { method: "POST", body: { date, reason } });

export const removeCountBlockedDay = (date) =>
  apiRequest(`/blocked-days?date=${encodeURIComponent(date)}`, { method: "DELETE" });
