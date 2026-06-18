import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const headers = () => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
});

/**
 * @returns {Promise<{ effectiveDate: string, numDesks: number }>}
 */
export async function getDeskCountForDate(dateYmd) {
  const q = new URLSearchParams({ date: dateYmd });
  const response = await fetch(`${API_URL}/production/desks-count?${q}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al cargar cantidad de mesas" }));
    throw new Error(err.message || "Error al cargar cantidad de mesas");
  }
  return response.json();
}

/**
 * @param {string} dateYmd
 * @param {number} numDesks
 * @returns {Promise<{ effectiveDate: string, numDesks: number }>}
 */
export async function replaceDeskCountForDate(dateYmd, numDesks) {
  const q = new URLSearchParams({ date: dateYmd });
  const response = await fetch(`${API_URL}/production/desks-count?${q}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ numDesks }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al guardar cantidad de mesas" }));
    throw new Error(err.message || "Error al guardar cantidad de mesas");
  }
  return response.json();
}

