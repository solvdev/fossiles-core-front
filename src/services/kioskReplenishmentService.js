import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/** Sugerencia de reposición por kiosco (venta + envíos recientes, categorías A/B/C). */
export const getKioskReplenishmentSuggestion = async ({ windowDays, locationIds } = {}) => {
  const params = new URLSearchParams();
  if (windowDays) params.append('windowDays', String(windowDays));
  (locationIds || []).forEach((id) => params.append('locationIds', String(id)));
  const query = params.toString();
  const response = await fetch(`${API_URL}/kiosk-replenishment/suggestion${query ? `?${query}` : ''}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al calcular la reposición' }));
    throw new Error(err.message || 'Error al calcular la reposición');
  }
  return response.json();
};

/**
 * Crea la distribución de reposición con un envío por kiosco (todo o nada). Cada kiosco lleva sus líneas con
 * `quantity` (lo que se manda), `suggestedQuantity` (lo que propuso el cálculo) y `shortage` (lo que falta en bodega,
 * que queda como envío pendiente de producción).
 */
export const createReplenishmentDistribution = async (payload) => {
  const response = await fetch(`${API_URL}/kiosk-replenishment/distributions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al crear la distribución de reposición' }));
    throw new Error(err.message || 'Error al crear la distribución de reposición');
  }
  return response.json();
};
