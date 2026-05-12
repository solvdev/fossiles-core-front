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

export const getTaskQueue = async () => {
  const response = await fetch(`${API_URL}/tasks/queue`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener cola de tareas' }));
    throw new Error(err.message || 'Error al obtener cola de tareas');
  }
  return response.json();
};

export const getScheduleDates = async () => {
  const response = await fetch(`${API_URL}/tasks/schedule-dates`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener fechas' }));
    throw new Error(err.message || 'Error al obtener fechas');
  }
  return response.json();
};

export const generateTasksForOrder = async (productionOrderId, force = false) => {
  const query = force ? "?force=true" : "";
  const response = await fetch(`${API_URL}/tasks/generate/${productionOrderId}${query}`, {
    method: 'POST',
    headers: headers()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al generar tareas' }));
    throw new Error(err.message || 'Error al generar tareas');
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

export const setMaterialsDelivery = async (id, delivered) => {
  const response = await fetch(`${API_URL}/tasks/${id}/materials-delivery`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ delivered })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar entrega de materiales' }));
    throw new Error(err.message || 'Error al actualizar entrega de materiales');
  }
  return response.json();
};

export const setTaskItemMaterialsDelivery = async (taskId, taskItemId, delivered) => {
  const response = await fetch(`${API_URL}/tasks/${taskId}/materials-delivery/item/${taskItemId}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ delivered })
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

export const getMaterialsView = async (date) => {
  const params = date ? `?date=${date}` : '';
  const response = await fetch(`${API_URL}/tasks/materials-view${params}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener vista de materiales' }));
    throw new Error(err.message || 'Error al obtener vista de materiales');
  }
  return response.json();
};

export const getMaterialsViewByOrder = async (productionOrderId) => {
  const response = await fetch(`${API_URL}/tasks/materials-view/production-order/${productionOrderId}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener vista de materiales' }));
    throw new Error(err.message || 'Error al obtener vista de materiales');
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

export const optimizePendingTasks = async (date, dryRun = false) => {
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (dryRun) params.append('dryRun', 'true');
  const query = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(`${API_URL}/tasks/optimize-pending${query}`, {
    method: 'POST',
    headers: headers()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al optimizar tareas pendientes' }));
    throw new Error(err.message || 'Error al optimizar tareas pendientes');
  }
  return response.json();
};

export const rebalanceTasksByDay = async (date, desksCount) => {
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (desksCount) params.append('desksCount', String(desksCount));
  const query = params.toString() ? `?${params.toString()}` : '';

  const response = await fetch(`${API_URL}/tasks/rebalance-day${query}`, {
    method: 'POST',
    headers: headers()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al redistribuir tareas del dia' }));
    throw new Error(err.message || 'Error al redistribuir tareas del dia');
  }
  return response.json();
};

export const getDistributionQueueProductionOrders = async (startDate, horizonDays = 5) => {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  params.append('horizonDays', String(horizonDays || 5));

  const response = await fetch(`${API_URL}/tasks/distribution-queue/production-orders?${params.toString()}`, {
    headers: headers(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al cargar cola de distribución' }));
    throw new Error(err.message || 'Error al cargar cola de distribución');
  }
  return response.json();
};

export const planTasksWindow = async (startDate, desksCount, horizonDays = 5, productionOrderId = undefined, schedulingPriorities = undefined) => {
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (desksCount) params.append('desksCount', String(desksCount));
  if (horizonDays) params.append('horizonDays', String(horizonDays));
  if (productionOrderId) params.append('productionOrderId', String(productionOrderId));

  const query = params.toString() ? `?${params.toString()}` : '';

  const body =
    schedulingPriorities && typeof schedulingPriorities === 'object' && Object.keys(schedulingPriorities).length > 0
      ? JSON.stringify({ schedulingPriorities })
      : undefined;

  const response = await fetch(`${API_URL}/tasks/plan-window${query}`, {
    method: 'POST',
    headers: headers(),
    body,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al planificar ventana' }));
    throw new Error(err.message || 'Error al planificar ventana');
  }
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

/**
 * Genera tareas directamente para todas las órdenes VENTA_EN_LINEA que aún
 * no tienen tareas. Permite usar el plan diario con solo ventas online,
 * sin necesitar que existan tareas de otras órdenes regulares.
 */
export const generateForPendingOnlineSales = async () => {
  const response = await fetch(`${API_URL}/tasks/generate-for-pending-online-sales`, {
    method: 'POST',
    headers: headers()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al generar tareas de ventas online' }));
    throw new Error(err.message || 'Error al generar tareas de ventas online');
  }
  return response.json();
};

