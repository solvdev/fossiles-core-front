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

/**
 * Propone UNA semana (cualquier día de esa semana) como BORRADOR por aprobar. Con redo vuelve a proponer un borrador
 * que ya existe.
 */
export const generateCountWeek = ({ weekStart, supervisorUserIds, redo = false, month }) =>
  apiRequest("/generate", { method: "POST", body: { weekStart, supervisorUserIds, redo, month } });

/** Aprueba el borrador de la semana: el calendario de esa semana queda listo. */
export const approveCountWeek = ({ weekStart, supervisorUserIds, month }) =>
  apiRequest("/approve", { method: "POST", body: { weekStart, supervisorUserIds, month } });

/** Descarta el borrador de la semana. */
export const discardCountDraft = ({ weekStart, supervisorUserIds, month }) =>
  apiRequest("/discard", { method: "POST", body: { weekStart, supervisorUserIds, month } });

/** Cambios de una visita: visitDate, status, note o locationId (cambiar de kiosco). */
export const updateCountVisit = (id, changes) =>
  apiRequest(`/visits/${id}`, { method: "PATCH", body: changes });

/** Agrega una visita a mano; si el kiosco ya tuvo su visita del mes queda como revisita. */
export const addCountVisit = ({ locationId, visitDate, note, month }) =>
  apiRequest("/visits", { method: "POST", body: { locationId, visitDate, note, month } });

export const addCountBlockedDay = (date, reason) =>
  apiRequest("/blocked-days", { method: "POST", body: { date, reason } });

export const removeCountBlockedDay = (date) =>
  apiRequest(`/blocked-days?date=${encodeURIComponent(date)}`, { method: "DELETE" });

// ───────── Carga del Excel de contabilidad y liquidación semanal ─────────

/** Vista previa de la carga: qué se entendió del Excel, qué no tiene kiosco y qué fechas difieren del sistema. */
export const previewCountImport = (rows) => apiRequest("/import/preview", { method: "POST", body: { rows } });

export const applyCountImport = (rows) => apiRequest("/import/apply", { method: "POST", body: { rows } });

export const getLiquidationWeek = (week, supervisorUserId) => {
  const params = new URLSearchParams();
  if (week) params.append("week", week);
  if (supervisorUserId) params.append("supervisorUserId", String(supervisorUserId));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/liquidations${suffix}`);
};

/** Todas las liquidaciones del año (para el Excel «Liquidaciones por semana»). */
export const getLiquidationYear = (year) => apiRequest(`/liquidations/year?year=${encodeURIComponent(year)}`);

/** Llena los días libres de la semana con los conteos que aún no tienen fecha de liquidación. */
export const generateLiquidationWeek = ({ weekStart, supervisorUserIds }) =>
  apiRequest("/liquidations/generate", { method: "POST", body: { weekStart, supervisorUserIds } });

export const updateLiquidation = (id, changes) =>
  apiRequest(`/liquidations/${id}`, { method: "PATCH", body: changes });

/**
 * Fija a mano la fecha de liquidación de un conteo (y lo registra si el sistema no lo tiene). Si el sistema ya tiene
 * ese conteo, manda la fecha del sistema. Sin liquidationDate solo se registra el conteo.
 */
export const fixLiquidationManually = ({
  locationId,
  countDate,
  liquidationDate,
  liquidationDays,
  accountantUserIds,
  note,
  viewWeek,
}) =>
  apiRequest("/liquidations/manual", {
    method: "POST",
    body: { locationId, countDate, liquidationDate, liquidationDays, accountantUserIds, note, viewWeek },
  });
