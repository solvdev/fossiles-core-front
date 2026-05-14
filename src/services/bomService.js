/**
 * Servicio para gestión de BOMs (Bill of Materials)
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getBoms = async () => {
  try {
    const response = await fetch(`${API_URL}/boms`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener BOMs' }));
      throw new Error(errorData.message || 'Error al obtener BOMs');
    }

    return await response.json();
  } catch (error) {
    console.error('Get BOMs error:', error);
    throw error;
  }
};

export const getBomById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de BOM inválido');
  }
  try {
    const response = await fetch(`${API_URL}/boms/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener BOM' }));
      throw new Error(errorData.message || 'Error al obtener BOM');
    }

    return await response.json();
  } catch (error) {
    console.error('Get BOM error:', error);
    throw error;
  }
};

export const copyBomItemsFrom = async (targetId, sourceId) => {
  if (!targetId || !sourceId) {
    throw new Error('IDs de BOM inválidos');
  }
  try {
    const response = await fetch(`${API_URL}/boms/${targetId}/copy-items-from/${sourceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al copiar líneas de BOM' }));
      throw new Error(errorData.message || 'Error al copiar líneas de BOM');
    }

    return await response.json();
  } catch (error) {
    console.error('Copy BOM items error:', error);
    throw error;
  }
};

export const getBomsByProductId = async (productId) => {
  if (!productId || productId === 'undefined' || productId === 'null') {
    throw new Error('ID de producto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/boms/product/${productId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener BOMs del producto' }));
      throw new Error(errorData.message || 'Error al obtener BOMs del producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Get BOMs by product error:', error);
    throw error;
  }
};

export const createBom = async (bomData) => {
  try {
    const response = await fetch(`${API_URL}/boms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(bomData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear BOM' }));
      throw new Error(errorData.message || 'Error al crear BOM');
    }

    return await response.json();
  } catch (error) {
    console.error('Create BOM error:', error);
    throw error;
  }
};

export const updateBom = async (id, bomData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de BOM inválido');
  }
  try {
    const response = await fetch(`${API_URL}/boms/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(bomData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar BOM' }));
      throw new Error(errorData.message || 'Error al actualizar BOM');
    }

    return await response.json();
  } catch (error) {
    console.error('Update BOM error:', error);
    throw error;
  }
};

export const deleteBom = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de BOM inválido');
  }
  try {
    const response = await fetch(`${API_URL}/boms/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      let errorMessage = 'Error al eliminar BOM';
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || errorMessage;
      } catch (e) {
        // Si no se puede parsear el JSON, usar el mensaje por defecto
      }
      throw new Error(errorMessage);
    }

    return true;
  } catch (error) {
    console.error('Delete BOM error:', error);
    throw error;
  }
};

