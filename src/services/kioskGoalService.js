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

export const getKioskGoalProgress = async (kioskLocationId, year, month) => {
  const response = await fetch(
    `${API_URL}/kiosk-goals/progress${toQuery({ kioskLocationId, year, month })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar la meta del kiosko.");
};

export const getKioskGoalHistory = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-goals/history${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el histórico de metas del kiosko.");
};

export const upsertKioskGoal = async (kioskLocationId, payload) => {
  const response = await fetch(
    `${API_URL}/kiosk-goals${toQuery({ kioskLocationId })}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(payload),
    }
  );
  return parseJson(response, "No se pudo guardar la meta del kiosko.");
};

export const getSupervisorAssignments = async (supervisorUserId) => {
  const response = await fetch(
    `${API_URL}/kiosk-goals/supervisor-assignments${toQuery({ supervisorUserId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar la asignación de kioskos de la supervisora.");
};

export const updateSupervisorAssignments = async (supervisorUserId, kioskLocationIds) => {
  const response = await fetch(
    `${API_URL}/kiosk-goals/supervisor-assignments${toQuery({ supervisorUserId })}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ kioskLocationIds }),
    }
  );
  return parseJson(response, "No se pudo guardar la asignación de kioskos de la supervisora.");
};

export const getSupervisorAggregateDashboard = async (supervisorUserId, year, month) => {
  const response = await fetch(
    `${API_URL}/kiosk-goals/supervisor-dashboard${toQuery({ supervisorUserId, year, month })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el resumen de la supervisora.");
};

export const getEligibleSupervisors = async () => {
  const response = await fetch(`${API_URL}/kiosk-goals/eligible-supervisors`, { headers: headers() });
  return parseJson(response, "No se pudo cargar la lista de supervisoras.");
};
