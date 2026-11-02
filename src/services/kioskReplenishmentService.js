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
