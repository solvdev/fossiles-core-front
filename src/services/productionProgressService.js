/**
 * Avance de producción por orden (Dashboard de Producción, pestaña «Avance por orden»).
 */
import { getAuthHeader } from './authService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/** Todas las OP activas con sus piezas por etapa, líneas y tareas, en una sola petición. */
export const getOrderProgress = async () => {
  const response = await fetch(`${API_URL}/production-progress/orders`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al calcular el avance de las órdenes' }));
    throw new Error(err.message || 'Error al calcular el avance de las órdenes');
  }
  return response.json();
};
