/**
 * Servicio para gestión de inventario
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/**
 * Obtiene el inventario agregado de materiales (sin ubicación)
 * Devuelve el stock total de cada material sumando todas las ubicaciones
 */
export const getAggregatedMaterialInventory = async () => {
  try {
    const response = await fetch(`${API_URL}/inventory/materials/aggregated`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario de materiales' }));
      throw new Error(errorData.message || 'Error al obtener inventario de materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Get aggregated material inventory error:', error);
    throw error;
  }
};

/**
 * Obtiene todo el inventario (todas las ubicaciones)
 */
export const getAllInventory = async () => {
  try {
    const response = await fetch(`${API_URL}/inventory`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario' }));
      throw new Error(errorData.message || 'Error al obtener inventario');
    }

    return await response.json();
  } catch (error) {
    console.error('Get all inventory error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario de un material específico
 */
export const getInventoryByMaterial = async (materialId) => {
  if (!materialId || materialId === 'undefined' || materialId === 'null') {
    throw new Error('ID de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/material/${materialId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario del material' }));
      throw new Error(errorData.message || 'Error al obtener inventario del material');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory by material error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario de una ubicación específica
 */
export const getInventoryByLocation = async (locationId) => {
  if (!locationId || locationId === 'undefined' || locationId === 'null') {
    throw new Error('ID de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/location/${locationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario de la ubicación' }));
      throw new Error(errorData.message || 'Error al obtener inventario de la ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory by location error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario de un material en una ubicación específica
 */
export const getInventoryByMaterialAndLocation = async (materialId, locationId) => {
  if (!materialId || !locationId) {
    throw new Error('Material ID y Location ID son requeridos');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/material/${materialId}/location/${locationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario' }));
      throw new Error(errorData.message || 'Error al obtener inventario');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory by material and location error:', error);
    throw error;
  }
};

/**
 * Crea o actualiza el inventario de un material en una ubicación
 */
export const createOrUpdateInventory = async (inventoryData) => {
  try {
    const response = await fetch(`${API_URL}/inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(inventoryData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear/actualizar inventario' }));
      throw new Error(errorData.message || 'Error al crear/actualizar inventario');
    }

    return await response.json();
  } catch (error) {
    console.error('Create or update inventory error:', error);
    throw error;
  }
};

/**
 * Actualiza el inventario de un material en una ubicación
 */
export const updateInventory = async (inventoryData) => {
  try {
    const response = await fetch(`${API_URL}/inventory`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(inventoryData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar inventario' }));
      throw new Error(errorData.message || 'Error al actualizar inventario');
    }

    return await response.json();
  } catch (error) {
    console.error('Update inventory error:', error);
    throw error;
  }
};

// ========== MATERIAL INVENTORY (SIN UBICACIÓN) ==========

/**
 * Obtiene el inventario de un material específico (sin ubicación)
 */
export const getMaterialInventory = async (materialId) => {
  if (!materialId || materialId === 'undefined' || materialId === 'null') {
    throw new Error('ID de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/materials/${materialId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario del material' }));
      throw new Error(errorData.message || 'Error al obtener inventario del material');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material inventory error:', error);
    throw error;
  }
};

// ========== MATERIAL KARDEX (SIN UBICACIÓN) ==========

/**
 * Obtiene el kardex de un material (sin ubicación)
 */
export const getMaterialKardex = async (materialId) => {
  if (!materialId || materialId === 'undefined' || materialId === 'null') {
    throw new Error('ID de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/materials/${materialId}/kardex`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex del material' }));
      throw new Error(errorData.message || 'Error al obtener kardex del material');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material kardex error:', error);
    throw error;
  }
};

/**
 * Obtiene el kardex de materiales por tipo de movimiento
 */
export const getMaterialKardexByMovementType = async (movementType) => {
  if (!movementType) {
    throw new Error('Tipo de movimiento es requerido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/materials/kardex/movement-type/${movementType}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex por tipo de movimiento' }));
      throw new Error(errorData.message || 'Error al obtener kardex por tipo de movimiento');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material kardex by movement type error:', error);
    throw error;
  }
};

/**
 * Obtiene el kardex de materiales por referencia
 */
export const getMaterialKardexByReference = async (referenceType, referenceId) => {
  if (!referenceType || !referenceId) {
    throw new Error('Tipo de referencia e ID son requeridos');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/materials/kardex/reference/${referenceType}/${referenceId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex por referencia' }));
      throw new Error(errorData.message || 'Error al obtener kardex por referencia');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material kardex by reference error:', error);
    throw error;
  }
};

// ========== KARDEX (PRODUCTOS - CON UBICACIÓN) ==========

/**
 * Obtiene el kardex de un material (con ubicación - para productos)
 */
export const getKardexByMaterial = async (materialId) => {
  if (!materialId || materialId === 'undefined' || materialId === 'null') {
    throw new Error('ID de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/kardex/material/${materialId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex del material' }));
      throw new Error(errorData.message || 'Error al obtener kardex del material');
    }

    return await response.json();
  } catch (error) {
    console.error('Get kardex by material error:', error);
    throw error;
  }
};

/**
 * Obtiene el kardex de una ubicación
 */
export const getKardexByLocation = async (locationId) => {
  if (!locationId || locationId === 'undefined' || locationId === 'null') {
    throw new Error('ID de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/kardex/location/${locationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex de la ubicación' }));
      throw new Error(errorData.message || 'Error al obtener kardex de la ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Get kardex by location error:', error);
    throw error;
  }
};

/**
 * Obtiene el kardex de un material en una ubicación específica
 */
export const getKardexByMaterialAndLocation = async (materialId, locationId) => {
  if (!materialId || !locationId) {
    throw new Error('Material ID y Location ID son requeridos');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/kardex/material/${materialId}/location/${locationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex' }));
      throw new Error(errorData.message || 'Error al obtener kardex');
    }

    return await response.json();
  } catch (error) {
    console.error('Get kardex by material and location error:', error);
    throw error;
  }
};

/**
 * Obtiene el kardex por tipo de movimiento
 */
export const getKardexByMovementType = async (movementType) => {
  if (!movementType) {
    throw new Error('Tipo de movimiento es requerido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/kardex/movement-type/${movementType}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex por tipo de movimiento' }));
      throw new Error(errorData.message || 'Error al obtener kardex por tipo de movimiento');
    }

    return await response.json();
  } catch (error) {
    console.error('Get kardex by movement type error:', error);
    throw error;
  }
};

// ========== CRITICAL INVENTORY ==========

/**
 * Obtiene el inventario crítico (materiales con stock bajo)
 */
export const getCriticalInventory = async (locationId = null) => {
  try {
    const url = locationId 
      ? `${API_URL}/inventory/critical?locationId=${locationId}`
      : `${API_URL}/inventory/critical`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario crítico' }));
      throw new Error(errorData.message || 'Error al obtener inventario crítico');
    }

    return await response.json();
  } catch (error) {
    console.error('Get critical inventory error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario por categoría (Bodega MP, Bodega PT, etc.)
 */
export const getInventoryByCategory = async (category) => {
  if (!category) {
    throw new Error('Categoría es requerida');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/category/${category}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario por categoría' }));
      throw new Error(errorData.message || 'Error al obtener inventario por categoría');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory by category error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario agregado de múltiples ubicaciones de una categoría (ej: Todos los Kioskos)
 */
export const getAggregatedInventoryByCategory = async (category) => {
  if (!category) {
    throw new Error('Categoría es requerida');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/category/${category}/aggregated`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario agregado' }));
      throw new Error(errorData.message || 'Error al obtener inventario agregado');
    }

    return await response.json();
  } catch (error) {
    console.error('Get aggregated inventory by category error:', error);
    throw error;
  }
};

/**
 * Inicializa el inventario para materiales que no tienen registro
 * Crea registros con cantidad 0 para materiales faltantes
 */
export const initializeMissingInventory = async (locationId = null) => {
  try {
    const url = locationId 
      ? `${API_URL}/inventory/initialize?locationId=${locationId}`
      : `${API_URL}/inventory/initialize`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al inicializar inventario' }));
      throw new Error(errorData.message || 'Error al inicializar inventario');
    }

    return await response.json();
  } catch (error) {
    console.error('Initialize missing inventory error:', error);
    throw error;
  }
};

// ========== TRANSFERENCIAS DE INVENTARIO ==========

/**
 * Crea una transferencia de inventario entre ubicaciones
 */
export const createInventoryTransfer = async (transferData) => {
  try {
    const response = await fetch(`${API_URL}/inventory/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(transferData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear transferencia' }));
      throw new Error(errorData.message || 'Error al crear transferencia');
    }

    return await response.json();
  } catch (error) {
    console.error('Create inventory transfer error:', error);
    throw error;
  }
};

/**
 * Crea una transferencia masiva de inventario
 */
export const createBulkInventoryTransfer = async (bulkTransferData) => {
  try {
    const response = await fetch(`${API_URL}/inventory/transfers/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(bulkTransferData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear transferencia masiva' }));
      throw new Error(errorData.message || 'Error al crear transferencia masiva');
    }

    return await response.json();
  } catch (error) {
    console.error('Create bulk inventory transfer error:', error);
    throw error;
  }
};

/**
 * Obtiene todas las transferencias de inventario
 */
export const getInventoryTransfers = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.fromLocationId) params.append('fromLocationId', filters.fromLocationId);
    if (filters.toLocationId) params.append('toLocationId', filters.toLocationId);
    if (filters.productId) params.append('productId', filters.productId);
    if (filters.materialId) params.append('materialId', filters.materialId);
    
    const url = params.toString() 
      ? `${API_URL}/inventory/transfers?${params.toString()}`
      : `${API_URL}/inventory/transfers`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener transferencias' }));
      throw new Error(errorData.message || 'Error al obtener transferencias');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory transfers error:', error);
    throw error;
  }
};

/**
 * Obtiene una transferencia específica por ID
 */
export const getInventoryTransferById = async (transferId) => {
  if (!transferId) {
    throw new Error('ID de transferencia inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/transfers/${transferId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener transferencia' }));
      throw new Error(errorData.message || 'Error al obtener transferencia');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory transfer by id error:', error);
    throw error;
  }
};

// ========== AJUSTES DE INVENTARIO ==========

/**
 * Crea un ajuste manual de inventario
 */
export const createInventoryAdjustment = async (adjustmentData) => {
  try {
    const response = await fetch(`${API_URL}/inventory/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(adjustmentData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear ajuste' }));
      throw new Error(errorData.message || 'Error al crear ajuste');
    }

    return await response.json();
  } catch (error) {
    console.error('Create inventory adjustment error:', error);
    throw error;
  }
};

/**
 * Obtiene el historial de ajustes de inventario
 */
export const getInventoryAdjustments = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.materialId) params.append('materialId', filters.materialId);
    if (filters.productId) params.append('productId', filters.productId);
    if (filters.locationId) params.append('locationId', filters.locationId);
    if (filters.userId) params.append('userId', filters.userId);
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    
    const url = params.toString() 
      ? `${API_URL}/inventory/adjustments?${params.toString()}`
      : `${API_URL}/inventory/adjustments`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener ajustes' }));
      throw new Error(errorData.message || 'Error al obtener ajustes');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory adjustments error:', error);
    throw error;
  }
};

/**
 * Obtiene un ajuste específico por ID
 */
export const getInventoryAdjustmentById = async (adjustmentId) => {
  if (!adjustmentId) {
    throw new Error('ID de ajuste inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory/adjustments/${adjustmentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener ajuste' }));
      throw new Error(errorData.message || 'Error al obtener ajuste');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory adjustment by id error:', error);
    throw error;
  }
};

/**
 * Boleta de salida desde kiosko (sin destino de inventario).
 * body: { fromLocationId, materialId, quantity, reason?, referenceType?, referenceId?, referenceNumber? }
 */
export const registerKioskInventoryOutflow = async (body) => {
  const response = await fetch(`${API_URL}/inventory/outflows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader()
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al registrar salida' }));
    throw new Error(err.message || 'Error al registrar salida');
  }
  return response.json();
};

