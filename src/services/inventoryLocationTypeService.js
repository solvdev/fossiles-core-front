/**
 * Servicio para gestión de tipos de ubicación de inventario
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getInventoryLocationTypes = async () => {
  try {
    const response = await fetch(`${API_URL}/inventory-location-types`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener tipos de ubicación' }));
      throw new Error(errorData.message || 'Error al obtener tipos de ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory location types error:', error);
    throw error;
  }
};

export const getActiveInventoryLocationTypes = async () => {
  try {
    const response = await fetch(`${API_URL}/inventory-location-types/active`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener tipos de ubicación activos' }));
      throw new Error(errorData.message || 'Error al obtener tipos de ubicación activos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get active inventory location types error:', error);
    throw error;
  }
};

export const getInventoryLocationTypeById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de tipo de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory-location-types/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener tipo de ubicación' }));
      throw new Error(errorData.message || 'Error al obtener tipo de ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory location type error:', error);
    throw error;
  }
};

export const createInventoryLocationType = async (typeData) => {
  try {
    const response = await fetch(`${API_URL}/inventory-location-types`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(typeData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear tipo de ubicación' }));
      throw new Error(errorData.message || 'Error al crear tipo de ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Create inventory location type error:', error);
    throw error;
  }
};

export const updateInventoryLocationType = async (id, typeData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de tipo de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory-location-types/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(typeData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar tipo de ubicación' }));
      throw new Error(errorData.message || 'Error al actualizar tipo de ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Update inventory location type error:', error);
    throw error;
  }
};

export const deleteInventoryLocationType = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de tipo de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/inventory-location-types/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar tipo de ubicación' }));
      throw new Error(errorData.message || 'Error al eliminar tipo de ubicación');
    }

    return true;
  } catch (error) {
    console.error('Delete inventory location type error:', error);
    throw error;
  }
};

