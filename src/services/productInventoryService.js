/**
 * Servicio para gestión de inventario de productos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/**
 * Obtiene todo el inventario de productos (todas las ubicaciones)
 */
export const getAllProductInventory = async () => {
  try {
    const response = await fetch(`${API_URL}/product-inventory`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario de productos' }));
      throw new Error(errorData.message || 'Error al obtener inventario de productos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get all product inventory error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario de un producto específico
 */
export const getProductInventoryByProduct = async (productId) => {
  if (!productId || productId === 'undefined' || productId === 'null') {
    throw new Error('ID de producto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/product/${productId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario del producto' }));
      throw new Error(errorData.message || 'Error al obtener inventario del producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product inventory by product error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario de productos de una ubicación específica
 */
export const getProductInventoryByLocation = async (locationId) => {
  if (!locationId || locationId === 'undefined' || locationId === 'null') {
    throw new Error('ID de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/location/${locationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario de productos de la ubicación' }));
      throw new Error(errorData.message || 'Error al obtener inventario de productos de la ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product inventory by location error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario de productos de una ubicación específica SIN AGRUPAR
 * (incluye variantes por color)
 */
export const getProductInventoryByLocationVariants = async (locationId) => {
  if (!locationId || locationId === 'undefined' || locationId === 'null') {
    throw new Error('ID de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/location/${locationId}/variants`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario por variantes' }));
      throw new Error(errorData.message || 'Error al obtener inventario por variantes');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product inventory by location variants error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario de un producto en una ubicación específica
 */
export const getProductInventoryByProductAndLocation = async (productId, locationId, colorId = null) => {
  if (!productId || !locationId) {
    throw new Error('Product ID y Location ID son requeridos');
  }
  try {
    let url = `${API_URL}/product-inventory/product/${productId}/location/${locationId}`;
    if (colorId) {
      url += `?colorId=${colorId}`;
    }
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario de producto' }));
      throw new Error(errorData.message || 'Error al obtener inventario de producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product inventory by product and location error:', error);
    throw error;
  }
};

/**
 * Crea o actualiza el inventario de un producto en una ubicación
 */
export const createOrUpdateProductInventory = async (inventoryData) => {
  try {
    const response = await fetch(`${API_URL}/product-inventory`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(inventoryData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear/actualizar inventario de producto' }));
      throw new Error(errorData.message || 'Error al crear/actualizar inventario de producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Create or update product inventory error:', error);
    throw error;
  }
};

/**
 * Actualiza el inventario de un producto en una ubicación
 */
export const updateProductInventory = async (inventoryData) => {
  try {
    const response = await fetch(`${API_URL}/product-inventory`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(inventoryData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar inventario de producto' }));
      throw new Error(errorData.message || 'Error al actualizar inventario de producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Update product inventory error:', error);
    throw error;
  }
};

// ========== KARDEX ==========

/**
 * Obtiene el kardex de un producto
 */
export const getProductKardexByProduct = async (productId) => {
  if (!productId || productId === 'undefined' || productId === 'null') {
    throw new Error('ID de producto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/kardex/product/${productId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex del producto' }));
      throw new Error(errorData.message || 'Error al obtener kardex del producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product kardex by product error:', error);
    throw error;
  }
};

/**
 * Obtiene el kardex de una ubicación
 */
export const getProductKardexByLocation = async (locationId) => {
  if (!locationId || locationId === 'undefined' || locationId === 'null') {
    throw new Error('ID de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/kardex/location/${locationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex de productos de la ubicación' }));
      throw new Error(errorData.message || 'Error al obtener kardex de productos de la ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product kardex by location error:', error);
    throw error;
  }
};

/**
 * Obtiene el kardex de un producto en una ubicación específica
 */
export const getProductKardexByProductAndLocation = async (productId, locationId) => {
  if (!productId || !locationId) {
    throw new Error('Product ID y Location ID son requeridos');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/kardex/product/${productId}/location/${locationId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener kardex de producto' }));
      throw new Error(errorData.message || 'Error al obtener kardex de producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product kardex by product and location error:', error);
    throw error;
  }
};

/**
 * Obtiene el kardex por tipo de movimiento
 */
export const getProductKardexByMovementType = async (movementType) => {
  if (!movementType) {
    throw new Error('Tipo de movimiento es requerido');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/kardex/movement-type/${movementType}`, {
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
    console.error('Get product kardex by movement type error:', error);
    throw error;
  }
};

// ========== CRITICAL INVENTORY ==========

/**
 * Obtiene el inventario crítico de productos (productos con stock bajo o sin stock)
 */
export const getCriticalProductInventory = async (locationId = null) => {
  try {
    const url = locationId 
      ? `${API_URL}/product-inventory/critical?locationId=${locationId}`
      : `${API_URL}/product-inventory/critical`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario crítico de productos' }));
      throw new Error(errorData.message || 'Error al obtener inventario crítico de productos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get critical product inventory error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario de productos por categoría (Bodega PT, etc.)
 */
export const getProductInventoryByCategory = async (category) => {
  if (!category) {
    throw new Error('Categoría es requerida');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/category/${category}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario de productos por categoría' }));
      throw new Error(errorData.message || 'Error al obtener inventario de productos por categoría');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product inventory by category error:', error);
    throw error;
  }
};

/**
 * Obtiene el inventario agregado de múltiples ubicaciones de una categoría (ej: Todos los Kioskos)
 */
export const getAggregatedProductInventoryByCategory = async (category) => {
  if (!category) {
    throw new Error('Categoría es requerida');
  }
  try {
    const response = await fetch(`${API_URL}/product-inventory/category/${category}/aggregated`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario agregado de productos' }));
      throw new Error(errorData.message || 'Error al obtener inventario agregado de productos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get aggregated product inventory by category error:', error);
    throw error;
  }
};

/**
 * Inicializa el inventario para productos que no tienen registro
 * Compara todos los productos existentes con los que están en inventario
 * Crea registros con cantidad 0 para productos faltantes en la categoría especificada
 * 
 * @param {string} category - Categoría de ubicación (KIOSKO, BODEGA_PT, VENDEDOR, ONLINE)
 * @param {number} locationId - ID de ubicación específica (opcional, para kiosko específico)
 */
export const initializeMissingProductInventory = async (category = null, locationId = null) => {
  try {
    const params = new URLSearchParams();
    if (category) {
      params.append('category', category);
    }
    if (locationId) {
      params.append('locationId', locationId);
    }
    
    const url = params.toString() 
      ? `${API_URL}/product-inventory/initialize?${params.toString()}`
      : `${API_URL}/product-inventory/initialize`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al inicializar inventario de productos' }));
      throw new Error(errorData.message || 'Error al inicializar inventario de productos');
    }

    return await response.json();
  } catch (error) {
    console.error('Initialize missing product inventory error:', error);
    throw error;
  }
};

