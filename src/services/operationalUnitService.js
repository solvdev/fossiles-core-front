/**
 * Servicio para gestión de unidades operativas
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getOperationalUnits = async () => {
  try {
    const response = await fetch(`${API_URL}/operational-units`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener unidades operativas' }));
      throw new Error(errorData.message || 'Error al obtener unidades operativas');
    }

    return await response.json();
  } catch (error) {
    console.error('Get operational units error:', error);
    throw error;
  }
};

export const getOperationalUnitById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de unidad operativa inválido');
  }
  try {
    const response = await fetch(`${API_URL}/operational-units/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener unidad operativa' }));
      throw new Error(errorData.message || 'Error al obtener unidad operativa');
    }

    return await response.json();
  } catch (error) {
    console.error('Get operational unit error:', error);
    throw error;
  }
};

export const createOperationalUnit = async (operationalUnitData) => {
  try {
    const response = await fetch(`${API_URL}/operational-units`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(operationalUnitData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear unidad operativa' }));
      throw new Error(errorData.message || 'Error al crear unidad operativa');
    }

    return await response.json();
  } catch (error) {
    console.error('Create operational unit error:', error);
    throw error;
  }
};

export const updateOperationalUnit = async (id, operationalUnitData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de unidad operativa inválido');
  }
  try {
    const response = await fetch(`${API_URL}/operational-units/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(operationalUnitData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar unidad operativa' }));
      throw new Error(errorData.message || 'Error al actualizar unidad operativa');
    }

    return await response.json();
  } catch (error) {
    console.error('Update operational unit error:', error);
    throw error;
  }
};

export const deleteOperationalUnit = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de unidad operativa inválido');
  }
  try {
    const response = await fetch(`${API_URL}/operational-units/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar unidad operativa' }));
      throw new Error(errorData.message || 'Error al eliminar unidad operativa');
    }

    return true;
  } catch (error) {
    console.error('Delete operational unit error:', error);
    throw error;
  }
};

