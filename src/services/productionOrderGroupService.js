/**
 * OP consolidada del Centro de Producción: varias OPV (o varias OPC) de Luis Felipe que se
 * producen como una sola. Las órdenes originales conservan su envío y su cobro.
 */
import { getAuthHeader } from './authService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';
const BASE = `${API_URL}/production-order-groups`;

const headers = () => ({ 'Content-Type': 'application/json', ...getAuthHeader() });

const call = async (url, options, fallback) => {
  const response = await fetch(url, { headers: headers(), ...options });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error((body && body.message) || fallback);
  }
  return response.json();
};

/** Consolidadas activas con sus órdenes. */
export const getProductionOrderGroups = () =>
  call(BASE, { method: 'GET' }, 'No se pudieron cargar las OP consolidadas');

/** OPV u OPC abiertas de Luis Felipe que aún no están en ninguna consolidada. */
export const getProductionOrderGroupCandidates = (family) =>
  call(`${BASE}/candidates${family ? `?family=${encodeURIComponent(family)}` : ''}`, { method: 'GET' },
    'No se pudieron cargar las órdenes de Luis Felipe');

/** Detalle con los productos sumados, para la hoja. */
export const getProductionOrderGroup = (id) =>
  call(`${BASE}/${id}`, { method: 'GET' }, 'No se pudo cargar la OP consolidada');

export const createProductionOrderGroup = (productionOrderIds, observations) =>
  call(BASE, { method: 'POST', body: JSON.stringify({ productionOrderIds, observations }) },
    'No se pudo crear la OP consolidada');

export const dissolveProductionOrderGroup = (id) =>
  call(`${BASE}/${id}/dissolve`, { method: 'POST' }, 'No se pudo desagrupar la OP consolidada');
