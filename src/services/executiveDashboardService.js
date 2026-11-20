import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

/**
 * Tablero gerencial: un solo GET con producción, órdenes, ventas de kioscos, rentabilidad y finanzas.
 * `days` = ventana hasta hoy (por defecto 30). `refresh` ignora el caché de 60 s del backend.
 */
export const getExecutiveDashboard = async ({ days, finFrom, finTo, refresh, signal } = {}) => {
  const query = new URLSearchParams();
  if (days) query.append("days", String(days));
  if (finFrom) query.append("finFrom", finFrom);
  if (finTo) query.append("finTo", finTo);
  if (refresh) query.append("refresh", "true");
  const qs = query.toString();
  const response = await fetch(`${API_URL}/executive-dashboard${qs ? `?${qs}` : ""}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    signal,
  });
  if (!response.ok) {
    const fallback =
      response.status === 403
        ? "El tablero gerencial es solo para administradores."
        : "No se pudo cargar el tablero gerencial.";
    const error = await response.json().catch(() => ({ message: fallback }));
    throw new Error(error.message || fallback);
  }
  return response.json();
};

/** Solo Finanzas del tablero, por rango. El backend corta el rango en ayer (el día de hoy se cuenta al cerrar). */
export const getExecutiveFinance = async ({ from, to, signal } = {}) => {
  const query = new URLSearchParams();
  if (from) query.append("from", from);
  if (to) query.append("to", to);
  const response = await fetch(`${API_URL}/executive-dashboard/finance?${query.toString()}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "No se pudo cargar Finanzas." }));
    throw new Error(error.message || "No se pudo cargar Finanzas.");
  }
  return response.json();
};
