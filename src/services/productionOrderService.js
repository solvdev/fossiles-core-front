/**
 * Servicio para gestión de órdenes de producción
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getProductionOrders = async () => {
  try {
    const response = await fetch(`${API_URL}/production-orders`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener órdenes de producción' }));
      throw new Error(errorData.message || 'Error al obtener órdenes de producción');
    }

    return await response.json();
  } catch (error) {
    console.error('Get production orders error:', error);
    throw error;
  }
};

export const getProductionOrderById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de orden de producción inválido');
  }
  try {
    const response = await fetch(`${API_URL}/production-orders/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener orden de producción' }));
      throw new Error(errorData.message || 'Error al obtener orden de producción');
    }

    return await response.json();
  } catch (error) {
    console.error('Get production order error:', error);
    throw error;
  }
};

export const getProductionOrdersByType = async (orderType) => {
  try {
    const response = await fetch(`${API_URL}/production-orders/type/${orderType}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener órdenes por tipo' }));
      throw new Error(errorData.message || 'Error al obtener órdenes por tipo');
    }

    return await response.json();
  } catch (error) {
    console.error('Get production orders by type error:', error);
    throw error;
  }
};

export const getProductionOrdersByStatus = async (status) => {
  try {
    const response = await fetch(`${API_URL}/production-orders/status/${status}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener órdenes por estado' }));
      throw new Error(errorData.message || 'Error al obtener órdenes por estado');
    }

    return await response.json();
  } catch (error) {
    console.error('Get production orders by status error:', error);
    throw error;
  }
};

export const createProductionOrder = async (orderData) => {
  try {
    const response = await fetch(`${API_URL}/production-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear orden de producción' }));
      throw new Error(errorData.message || 'Error al crear orden de producción');
    }

    return await response.json();
  } catch (error) {
    console.error('Create production order error:', error);
    throw error;
  }
};

export const updateProductionOrder = async (id, orderData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de orden de producción inválido');
  }
  try {
    const response = await fetch(`${API_URL}/production-orders/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar orden de producción' }));
      throw new Error(errorData.message || 'Error al actualizar orden de producción');
    }

    return await response.json();
  } catch (error) {
    console.error('Update production order error:', error);
    throw error;
  }
};

/** Estado solo para OP CINCHOS_FOSSILES / CINCHOS_MARCAS (PENDING, IN_PROGRESS, COMPLETED, CANCELLED). */
export const updateManagedCinchoOrderStatus = async (id, status) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de orden de producción inválido');
  }
  try {
    const response = await fetch(`${API_URL}/production-orders/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar estado de cinchos' }));
      throw new Error(errorData.message || 'Error al actualizar estado de cinchos');
    }

    return await response.json();
  } catch (error) {
    console.error('Update managed cincho order status error:', error);
    throw error;
  }
};

// ==================== WAREHOUSE VIEW ====================

export const getWarehouseView = async (status) => {
  try {
    const params = status ? `?status=${status}` : '';
    const response = await fetch(`${API_URL}/production-orders/warehouse-view${params}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener vista de bodega' }));
      throw new Error(errorData.message || 'Error al obtener vista de bodega');
    }

    return await response.json();
  } catch (error) {
    console.error('Get warehouse view error:', error);
    throw error;
  }
};

// ==================== CUSTOMER SHIPMENTS ====================

export const getCustomerShipments = async (productionOrderId) => {
  try {
    const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/customer-shipments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener envíos de clientes' }));
      throw new Error(errorData.message || 'Error al obtener envíos de clientes');
    }

    return await response.json();
  } catch (error) {
    console.error('Get customer shipments error:', error);
    throw error;
  }
};

export const dispatchCustomerShipment = async (productionOrderId, onlineSaleId, data = {}) => {
  try {
    const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/dispatch-customer/${onlineSaleId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al despachar envío' }));
      throw new Error(errorData.message || 'Error al despachar envío');
    }

    return await response.json();
  } catch (error) {
    console.error('Dispatch customer shipment error:', error);
    throw error;
  }
};

export const getWarehouseWorkspace = async (productionOrderId) => {
  try {
    const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/warehouse-workspace`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al cargar workspace de bodega' }));
      throw new Error(errorData.message || 'Error al cargar workspace de bodega');
    }
    return await response.json();
  } catch (error) {
    console.error('Get warehouse workspace error:', error);
    throw error;
  }
};

export const updateWarehouseUnitsReceipt = async (productionOrderId, data) => {
  try {
    const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/warehouse-units/receipt`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al registrar recepción por pieza' }));
      throw new Error(errorData.message || 'Error al registrar recepción por pieza');
    }
    return await response.json();
  } catch (error) {
    console.error('Update warehouse units receipt error:', error);
    throw error;
  }
};

export const closeWarehouseReceipt = async (productionOrderId) => {
  try {
    const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/warehouse-receipt/close`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al cerrar recepción en bodega' }));
      throw new Error(errorData.message || 'Error al cerrar recepción en bodega');
    }
    return await response.json();
  } catch (error) {
    console.error('Close warehouse receipt error:', error);
    throw error;
  }
};

export const receiveWarehouseProducts = async (productionOrderId, data) => {
  try {
    const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/warehouse-receipt`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al registrar recepción en bodega PT' }));
      throw new Error(errorData.message || 'Error al registrar recepción en bodega PT');
    }
    return await response.json();
  } catch (error) {
    console.error('Receive warehouse products error:', error);
    throw error;
  }
};

// ==================== MATERIAL CONSUMPTION ====================

export const consumeMaterials = async (productionOrderId) => {
  const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/consume-materials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al consumir materiales' }));
    throw new Error(err.message || 'Error al consumir materiales');
  }
  return response.json();
};

export const validateMaterials = async (productionOrderId) => {
  const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/validate-materials`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al validar materiales' }));
    throw new Error(err.message || 'Error al validar materiales');
  }
  return response.json();
};

export const getConsumptionHistory = async (productionOrderId) => {
  const response = await fetch(`${API_URL}/production-orders/${productionOrderId}/consumption-history`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener historial de consumos' }));
    throw new Error(err.message || 'Error al obtener historial de consumos');
  }
  return response.json();
};

// ==================== DASHBOARD & REPORTS ====================

export const getDashboardStats = async (from, to) => {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  const response = await fetch(`${API_URL}/production-orders/dashboard-stats?${params}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener estadísticas' }));
    throw new Error(err.message || 'Error al obtener estadísticas');
  }
  return response.json();
};

export const getProductionDashboardV2 = async (from, to) => {
  const params = new URLSearchParams();
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  const query = params.toString();
  const response = await fetch(`${API_URL}/production-orders/dashboard-v2${query ? `?${query}` : ''}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener dashboard de producción' }));
    throw new Error(err.message || 'Error al obtener dashboard de producción');
  }
  return response.json();
};

export const getProductionReports = async (type = 'daily', from, to) => {
  const params = new URLSearchParams();
  if (type) params.append('type', type);
  if (from) params.append('from', from);
  if (to) params.append('to', to);
  const response = await fetch(`${API_URL}/production-orders/reports?${params}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener reportes' }));
    throw new Error(err.message || 'Error al obtener reportes');
  }
  return response.json();
};

export const voidVendorShipmentDocument = async (orderId) => {
  if (!orderId || orderId === 'undefined' || orderId === 'null') {
    throw new Error('ID de orden de producción inválido');
  }
  const response = await fetch(`${API_URL}/production-orders/${orderId}/void-shipment-document`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al anular documento de envío' }));
    throw new Error(errorData.message || 'Error al anular documento de envío');
  }
  return response.json();
};

export const getProductionOrderShipments = async (orderId) => {
  if (!orderId || orderId === 'undefined' || orderId === 'null') {
    throw new Error('ID de orden de producción inválido');
  }
  const response = await fetch(`${API_URL}/production-orders/${orderId}/shipments`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al obtener envíos de la orden' }));
    throw new Error(errorData.message || 'Error al obtener envíos de la orden');
  }
  return response.json();
};

export const createProductionOrderShipment = async (orderId, payload) => {
  if (!orderId || orderId === 'undefined' || orderId === 'null') {
    throw new Error('ID de orden de producción inválido');
  }
  const response = await fetch(`${API_URL}/production-orders/${orderId}/shipments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al crear envío' }));
    throw new Error(errorData.message || 'Error al crear envío');
  }
  return response.json();
};

export const generateProductionOrderShipment = async (orderId, payload) => {
  if (!orderId || orderId === 'undefined' || orderId === 'null') {
    throw new Error('ID de orden de producción inválido');
  }
  const response = await fetch(`${API_URL}/production-orders/${orderId}/shipments/generate-from-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al generar envío' }));
    throw new Error(errorData.message || 'Error al generar envío');
  }
  return response.json();
};

export const getProductionOrderPartialReleases = async (orderId) => {
  if (!orderId) throw new Error('ID de orden de producción inválido');
  const response = await fetch(`${API_URL}/production-orders/${orderId}/partial-releases`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al cargar liberaciones parciales' }));
    throw new Error(errorData.message || 'Error al cargar liberaciones parciales');
  }
  return response.json();
};

export const getProductionOrderPartialRelease = async (orderId, releaseId) => {
  if (!orderId) throw new Error('ID de orden de producción inválido');
  if (!releaseId) throw new Error('ID de liberación inválido');
  const response = await fetch(
    `${API_URL}/production-orders/${orderId}/partial-releases/${releaseId}`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    }
  );
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al cargar liberación parcial' }));
    throw new Error(errorData.message || 'Error al cargar liberación parcial');
  }
  return response.json();
};

export const createProductionOrderPartialRelease = async (orderId, payload) => {
  if (!orderId) throw new Error('ID de orden de producción inválido');
  const response = await fetch(`${API_URL}/production-orders/${orderId}/partial-releases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload || {})
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al crear liberación parcial' }));
    throw new Error(errorData.message || 'Error al crear liberación parcial');
  }
  return response.json();
};

export const updatePartialRelease = async (releaseId, payload) => {
  if (!releaseId) throw new Error('ID de liberación inválido');
  const response = await fetch(`${API_URL}/partial-releases/${releaseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload || {})
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al actualizar liberación parcial' }));
    throw new Error(errorData.message || 'Error al actualizar liberación parcial');
  }
  return response.json();
};

export const deletePartialRelease = async (releaseId) => {
  if (!releaseId) throw new Error('ID de liberación inválido');
  const response = await fetch(`${API_URL}/partial-releases/${releaseId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al eliminar liberación parcial' }));
    throw new Error(errorData.message || 'Error al eliminar liberación parcial');
  }
  return true;
};

export const generatePartialReleaseShipment = async (releaseId, payload) => {
  if (!releaseId) throw new Error('ID de liberación inválido');
  const response = await fetch(`${API_URL}/partial-releases/${releaseId}/generate-shipment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload || {})
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al generar envío del parcial' }));
    throw new Error(errorData.message || 'Error al generar envío del parcial');
  }
  return response.json();
};

export const deleteProductionOrder = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de orden de producción inválido');
  }
  try {
    const response = await fetch(`${API_URL}/production-orders/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar orden de producción' }));
      throw new Error(errorData.message || 'Error al eliminar orden de producción');
    }

    return true;
  } catch (error) {
    console.error('Delete production order error:', error);
    throw error;
  }
};

