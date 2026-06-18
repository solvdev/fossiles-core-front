import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const headers = () => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
});

/**
 * @returns {Promise<{ effectiveDate: string, numDesks: number, assignments: { desk: number, supervisorName: string }[] }>}
 */
export async function getDeskSupervisorsForDate(dateYmd) {
  const q = new URLSearchParams({ date: dateYmd });
  const response = await fetch(`${API_URL}/production/desk-supervisors?${q}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al cargar encargados de mesa" }));
    throw new Error(err.message || "Error al cargar encargados de mesa");
  }
  return response.json();
}

/**
 * @param {string} dateYmd
 * @param {{ desk: number, supervisorName: string }[]} assignments
 */
export async function replaceDeskSupervisorsForDate(dateYmd, assignments) {
  const q = new URLSearchParams({ date: dateYmd });
  const response = await fetch(`${API_URL}/production/desk-supervisors?${q}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(assignments || []),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al guardar encargados" }));
    throw new Error(err.message || "Error al guardar encargados");
  }
  return response.json();
}
