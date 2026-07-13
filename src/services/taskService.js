/**
 * Servicio para gestión de tareas de producción por mesa
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

const headers = () => ({
  'Content-Type': 'application/json',
  ...getAuthHeader()
});

export const getTasks = async () => {
  const response = await fetch(`${API_URL}/tasks`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener tareas' }));
    throw new Error(err.message || 'Error al obtener tareas');
  }
  return response.json();
};

export const getTaskById = async (id) => {
  const response = await fetch(`${API_URL}/tasks/${id}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener tarea' }));
    throw new Error(err.message || 'Error al obtener tarea');
  }
  return response.json();
};

export const getTasksByProductionOrder = async (productionOrderId) => {
  const response = await fetch(`${API_URL}/tasks/production-order/${productionOrderId}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener tareas' }));
    throw new Error(err.message || 'Error al obtener tareas');
  }
  return response.json();
};

export const getTasksByDesk = async (desk) => {
  const response = await fetch(`${API_URL}/tasks/desk/${desk}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener tareas por mesa' }));
    throw new Error(err.message || 'Error al obtener tareas por mesa');
  }
  return response.json();
};

export const getTasksByDate = async (date) => {
  const response = await fetch(`${API_URL}/tasks/date/${date}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener tareas por fecha' }));
    throw new Error(err.message || 'Error al obtener tareas por fecha');
  }
  return response.json();
};

export const updateTaskStatus = async (id, status) => {
  const response = await fetch(`${API_URL}/tasks/${id}/status`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ status })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar estado' }));
    throw new Error(err.message || 'Error al actualizar estado');
  }
  return response.json();
};

export const getTaskTicket = async (id) => {
  const response = await fetch(`${API_URL}/tasks/${id}/ticket`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener boleta' }));
    throw new Error(err.message || 'Error al obtener boleta');
  }
  return response.json();
};

export const getTicketsByProductionOrder = async (productionOrderId) => {
  const response = await fetch(`${API_URL}/tasks/production-order/${productionOrderId}/tickets`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener boletas' }));
    throw new Error(err.message || 'Error al obtener boletas');
  }
  return response.json();
};

export const scheduleTask = async (id, data) => {
  const response = await fetch(`${API_URL}/tasks/${id}/schedule`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al programar tarea' }));
    throw new Error(err.message || 'Error al programar tarea');
  }
  return response.json();
};

export const moveTaskItem = async (taskItemId, targetDesk, targetDate) => {
  const response = await fetch(`${API_URL}/tasks/move-item`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({
      taskItemId,
      targetDesk: targetDesk != null ? Number(targetDesk) : null,
      targetDate: targetDate || null,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al mover producto entre mesas' }));
    throw new Error(err.message || 'Error al mover producto entre mesas');
  }
  // { taskItemId, sourceTask, sourceTaskDeletedId, targetTask }
  return response.json();
};

export const updateTaskStartedAt = async (taskId, startedAt) => {
  const response = await fetch(`${API_URL}/tasks/${taskId}/started-at`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ startedAt }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar hora de inicio' }));
    throw new Error(err.message || 'Error al actualizar hora de inicio');
  }
  return response.json();
};

export const toggleDieCut = async (id, dieCutReady) => {
  const response = await fetch(`${API_URL}/tasks/${id}/die-cut`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ dieCutReady })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar troquelado' }));
    throw new Error(err.message || 'Error al actualizar troquelado');
  }
  return response.json();
};

export const setLeatherDelivery = async (id, delivered) => {
  const response = await fetch(`${API_URL}/tasks/${id}/leather-delivery`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ delivered })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar entrega de cuero' }));
    throw new Error(err.message || 'Error al actualizar entrega de cuero');
  }
  return response.json();
};

export const setTaskItemLeatherDelivery = async (taskId, taskItemId, delivered) => {
  const response = await fetch(`${API_URL}/tasks/${taskId}/leather-delivery/item/${taskItemId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ delivered })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar entrega de cuero por producto' }));
    throw new Error(err.message || 'Error al actualizar entrega de cuero por producto');
  }
  return response.json();
};

export const setMaterialsDelivery = async (id, delivered, force = false) => {
  const response = await fetch(`${API_URL}/tasks/${id}/materials-delivery`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ delivered, force: Boolean(force) })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar entrega de materiales' }));
    throw new Error(err.message || 'Error al actualizar entrega de materiales');
  }
  return response.json();
};

export const setTaskItemMaterialsDelivery = async (taskId, taskItemId, delivered, force = false) => {
  const response = await fetch(`${API_URL}/tasks/${taskId}/materials-delivery/item/${taskItemId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ delivered, force: Boolean(force) })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar entrega de materiales por producto' }));
    throw new Error(err.message || 'Error al actualizar entrega de materiales por producto');
  }
  return response.json();
};

export const bulkDieCut = async (productionOrderId, dieCutReady) => {
  const response = await fetch(`${API_URL}/tasks/production-order/${productionOrderId}/die-cut`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ dieCutReady })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar troquelado masivo' }));
    throw new Error(err.message || 'Error al actualizar troquelado masivo');
  }
  return response.json();
};

// ==================== MATERIALS VIEW ====================

export const getMaterialsView = async (date, options = {}) => {
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (options.includeDelivered) params.append('includeDelivered', 'true');
  if (options.scheduleDay) params.append('scheduleDay', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_URL}/tasks/materials-view${qs}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener vista de materiales' }));
    throw new Error(err.message || 'Error al obtener vista de materiales');
  }
  return response.json();
};

export const getMaterialsViewByOrder = async (productionOrderId, options = {}) => {
  const params = new URLSearchParams();
  if (options.includeDelivered) params.append('includeDelivered', 'true');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_URL}/tasks/materials-view/production-order/${productionOrderId}${qs}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener vista de materiales' }));
    throw new Error(err.message || 'Error al obtener vista de materiales');
  }
  return response.json();
};

export const setTaskItemMaterialPick = async (taskId, taskItemId, materialId, picked) => {
  const response = await fetch(
    `${API_URL}/tasks/${taskId}/materials-pick/item/${taskItemId}/material/${materialId}`,
    {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ picked: Boolean(picked) }),
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar línea de receta' }));
    throw new Error(err.message || 'Error al actualizar línea de receta');
  }
  return response.json();
};

export const updateTaskWaste = async (id, wasteQuantity, wasteNotes) => {
  const response = await fetch(`${API_URL}/tasks/${id}/waste`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ wasteQuantity, wasteNotes })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al registrar desperdicio' }));
    throw new Error(err.message || 'Error al registrar desperdicio');
  }
  return response.json();
};

export const getDesksCount = async () => {
  const response = await fetch(`${API_URL}/tasks/desks-count`, { headers: headers() });
  if (!response.ok) return { count: 12 };
  return response.json();
};

export const deleteTask = async (id) => {
  const response = await fetch(`${API_URL}/tasks/${id}`, {
    method: 'DELETE',
    headers: headers()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al eliminar tarea' }));
    throw new Error(err.message || 'Error al eliminar tarea');
  }
  return true;
};

export const getDaySaleCandidates = async (taskId) => {
  const response = await fetch(`${API_URL}/tasks/${taskId}/day-sale-candidates`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener productos de venta del dia' }));
    throw new Error(err.message || 'Error al obtener productos de venta del dia');
  }
  return response.json();
};

export const addDaySaleItemsToTask = async (taskId, productionOrderItemIds) => {
  const response = await fetch(`${API_URL}/tasks/${taskId}/day-sale-items`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ productionOrderItemIds })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al agregar productos de venta del dia' }));
    throw new Error(err.message || 'Error al agregar productos de venta del dia');
  }
  return response.json();
};

// ==================== ORGANIZADOR DE TAREAS ====================

/**
 * OPs activas con ítems que aún tienen cantidad restante sin tarea.
 * @param {Object} filters { type: 'OPL'|'REGULAR'|'ALL', search: string }
 */
export const getOrganizerOrders = async ({ type = 'ALL', search = '' } = {}) => {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (search) params.set('search', search);
  const response = await fetch(`${API_URL}/tasks/organizer/orders?${params.toString()}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener órdenes del organizador' }));
    throw new Error(err.message || 'Error al obtener órdenes del organizador');
  }
  return response.json();
};

/**
 * Crea una tarea manual desde el organizador.
 * @param {Object} payload { productionOrderId, items: [{productionOrderItemId, quantity, daySaleExtra}], desk?, scheduledDate?, observations? }
 */
export const createManualTask = async (payload) => {
  const response = await fetch(`${API_URL}/tasks/organizer/manual`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al crear la tarea' }));
    throw new Error(err.message || 'Error al crear la tarea');
  }
  return response.json();
};

/** Tareas PENDING atrasadas (fecha pasada) o sin fecha, con o sin mesa. */
export const getBacklogTasks = async () => {
  const response = await fetch(`${API_URL}/tasks/organizer/backlog`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener tareas pendientes' }));
    throw new Error(err.message || 'Error al obtener tareas pendientes');
  }
  return response.json();
};

/** "Limpiar mesas": libera mesa y fecha de todas las tareas PENDING (no toca en progreso/completadas). */
export const clearAllDesks = async () => {
  const response = await fetch(`${API_URL}/tasks/organizer/clear-desks`, {
    method: 'POST',
    headers: headers()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al limpiar mesas' }));
    throw new Error(err.message || 'Error al limpiar mesas');
  }
  return response.json();
};

