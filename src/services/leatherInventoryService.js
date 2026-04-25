import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

const headers = () => ({ 'Content-Type': 'application/json', ...getAuthHeader() });

const handleResponse = async (response, fallbackMsg) => {
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: fallbackMsg }));
    throw new Error(err.message || fallbackMsg);
  }
  return response.json();
};

// ─── Inventario ────────────────────────────────────────────────
export const getLeatherInventory = async () => {
  const res = await fetch(`${API_URL}/leather/inventory`, { headers: headers() });
  return handleResponse(res, 'Error al obtener inventario de cuero');
};

// ─── Movimientos ───────────────────────────────────────────────
export const getLeatherMovements = async (params = {}) => {
  const query = new URLSearchParams();
  if (params.materialId) query.set('materialId', params.materialId);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  const qs = query.toString();
  const res = await fetch(`${API_URL}/leather/movements${qs ? '?' + qs : ''}`, { headers: headers() });
  return handleResponse(res, 'Error al obtener movimientos de cuero');
};

export const getLeatherKardex = async (materialId, from, to) => {
  const res = await fetch(
    `${API_URL}/leather/kardex/${materialId}?from=${from}&to=${to}`,
    { headers: headers() }
  );
  return handleResponse(res, 'Error al obtener kardex de cuero');
};

export const getLeatherMovementsByPO = async (productionOrderId) => {
  const res = await fetch(
    `${API_URL}/leather/movements/production-order/${productionOrderId}`,
    { headers: headers() }
  );
  return handleResponse(res, 'Error al obtener consumos de cuero por orden');
};

// ─── Inicializar inventario faltante ────────────────────────────
export const initializeLeatherInventory = async () => {
  const res = await fetch(`${API_URL}/leather/inventory/initialize`, {
    method: 'POST', headers: headers()
  });
  return handleResponse(res, 'Error al inicializar inventario de cuero');
};

// ─── Recepción ─────────────────────────────────────────────────
export const createLeatherReception = async (data) => {
  const res = await fetch(`${API_URL}/leather/reception`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data)
  });
  return handleResponse(res, 'Error al registrar recepción de cuero');
};

// ─── Entrega a Producción ──────────────────────────────────────
export const createLeatherDelivery = async (data) => {
  const res = await fetch(`${API_URL}/leather/delivery`, {
    method: 'POST', headers: headers(), body: JSON.stringify(data)
  });
  return handleResponse(res, 'Error al registrar entrega de cuero');
};

// ─── Editar movimiento (datos descriptivos) ────────────────────
export const updateLeatherMovement = async (id, data) => {
  const res = await fetch(`${API_URL}/leather/movements/${id}`, {
    method: 'PUT', headers: headers(), body: JSON.stringify(data)
  });
  return handleResponse(res, 'Error al editar movimiento');
};

// ─── Anular movimiento ─────────────────────────────────────────
export const cancelLeatherMovement = async (id, reason) => {
  const res = await fetch(`${API_URL}/leather/movements/${id}/cancel`, {
    method: 'POST', headers: headers(), body: JSON.stringify({ reason })
  });
  return handleResponse(res, 'Error al anular movimiento');
};

