import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

const parseError = async (response, fallback) => {
  const err = await response.json().catch(() => ({ message: fallback }));
  throw new Error(err.message || fallback);
};

/**
 * Envío directo a un cliente de Luis Felipe (sin OP). Queda confirmado; se envía con sendShipment de siempre,
 * que descarga la bodega y genera el cargo en cuentas por cobrar.
 */
export const createDirectSaleShipment = async (payload) => {
  const response = await fetch(`${API_URL}/direct-sale-shipments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) await parseError(response, 'No se pudo crear el envío directo');
  return response.json();
};

export const listDirectSaleShipments = async ({ customerId, days } = {}) => {
  const params = new URLSearchParams();
  if (customerId) params.set('customerId', String(customerId));
  if (days) params.set('days', String(days));
  const response = await fetch(`${API_URL}/direct-sale-shipments?${params}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) await parseError(response, 'No se pudieron cargar los envíos directos');
  return response.json();
};

export const getDirectSaleShipment = async (id) => {
  const response = await fetch(`${API_URL}/direct-sale-shipments/${id}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) await parseError(response, 'No se pudo cargar el envío directo');
  return response.json();
};
