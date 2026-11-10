import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const headers = () => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
});

async function getJson(url, fallback) {
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: fallback }));
    throw new Error(err.message || fallback);
  }
  return response.json();
}

/**
 * Cuadro de cinchos de un día del Tablero: órdenes con sus líneas de cincho/pulsera y el estado
 * de cada línea ese día. Reemplaza bajar todas las órdenes para filtrarlas en el navegador.
 */
export const getCinchoDay = (dateYmd) =>
  getJson(`${API_URL}/production/cinchos/day?${new URLSearchParams({ date: dateYmd })}`,
    "No se pudieron cargar los cinchos del día");

/**
 * Listado de «Cinchos en producción».
 * @param {{ scope?: string, source?: string, search?: string }} params
 *   scope ACTIVE | PENDING | IN_PROGRESS | COMPLETED | CANCELLED; source ALL | OPC | SALES
 */
export const getCinchoOrders = ({ scope = "ACTIVE", source = "ALL", search = "" } = {}) => {
  const q = new URLSearchParams({ scope, source });
  if (search && search.trim()) q.set("search", search.trim());
  return getJson(`${API_URL}/production/cinchos/orders?${q}`, "No se pudieron cargar los cinchos");
};
