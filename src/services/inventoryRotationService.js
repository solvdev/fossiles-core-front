import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

const get = async (path, params, fallbackMessage) => {
  const query = params.toString();
  const response = await fetch(`${API_URL}/inventory-rotation/${path}${query ? `?${query}` : ''}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: fallbackMessage }));
    throw new Error(err.message || fallbackMessage);
  }
  return response.json();
};

/** Rotación y cobertura del producto en kioscos (existencia vs. venta neta de la ventana). */
export const getProductRotation = async ({ windowDays, locationIds } = {}) => {
  const params = new URLSearchParams();
  if (windowDays) params.append('windowDays', String(windowDays));
  (locationIds || []).forEach((id) => params.append('locationIds', String(id)));
  return get('products', params, 'No se pudo calcular la rotación de producto');
};

/** Rotación y cobertura de materiales (existencia vs. consumo de la ventana). */
export const getMaterialRotation = async ({ windowDays } = {}) => {
  const params = new URLSearchParams();
  if (windowDays) params.append('windowDays', String(windowDays));
  return get('materials', params, 'No se pudo calcular la rotación de materiales');
};
