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

/**
 * Mesas especiales (maquila): número fijo fuera de las de planta, con nombre.
 * @returns {Promise<{ id: number, desk: number, name: string, kind: string, active: boolean }[]>}
 */
export async function listSpecialDesks() {
  const response = await fetch(`${API_URL}/production/desks-count/special`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al cargar la mesa de maquila" }));
    throw new Error(err.message || "Error al cargar la mesa de maquila");
  }
  return response.json();
}

/**
 * Crea o actualiza la mesa especial con ese número.
 * @param {{ desk: number, name: string, active?: boolean }} body
 */
export async function saveSpecialDesk(body) {
  const response = await fetch(`${API_URL}/production/desks-count/special`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ kind: "MAQUILA", active: true, ...body }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al guardar la mesa de maquila" }));
    throw new Error(err.message || "Error al guardar la mesa de maquila");
  }
  return response.json();
}

/** Desactiva la mesa especial (el back no deja si tiene tareas abiertas). */
export async function deactivateSpecialDesk(desk) {
  const response = await fetch(`${API_URL}/production/desks-count/special/${encodeURIComponent(desk)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al quitar la mesa de maquila" }));
    throw new Error(err.message || "Error al quitar la mesa de maquila");
  }
  return response.json();
}
