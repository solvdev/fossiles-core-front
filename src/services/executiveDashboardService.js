import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

/**
 * Tablero gerencial: un solo GET con producción, órdenes, ventas de kioscos, rentabilidad y finanzas.
 * `days` = ventana hasta hoy (por defecto 30). `refresh` ignora el caché de 60 s del backend.
 */
export const getExecutiveDashboard = async ({ days, refresh, signal } = {}) => {
  const query = new URLSearchParams();
  if (days) query.append("days", String(days));
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
