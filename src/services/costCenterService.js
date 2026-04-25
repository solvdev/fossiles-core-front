/**
 * Servicio para gestión de centros de costo
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getCostCenters = async () => {
  try {
    const response = await fetch(`${API_URL}/cost-centers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener centros de costo' }));
      throw new Error(errorData.message || 'Error al obtener centros de costo');
    }

    return await response.json();
  } catch (error) {
    console.error('Get cost centers error:', error);
    throw error;
  }
};

export const getCostCenterById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de centro de costo inválido');
  }
  try {
    const response = await fetch(`${API_URL}/cost-centers/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener centro de costo' }));
      throw new Error(errorData.message || 'Error al obtener centro de costo');
    }

    return await response.json();
  } catch (error) {
    console.error('Get cost center error:', error);
    throw error;
  }
};

export const createCostCenter = async (costCenterData) => {
  try {
    const response = await fetch(`${API_URL}/cost-centers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(costCenterData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear centro de costo' }));
      throw new Error(errorData.message || 'Error al crear centro de costo');
    }

    return await response.json();
  } catch (error) {
    console.error('Create cost center error:', error);
    throw error;
  }
};

export const updateCostCenter = async (id, costCenterData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de centro de costo inválido');
  }
  try {
    const response = await fetch(`${API_URL}/cost-centers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(costCenterData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar centro de costo' }));
      throw new Error(errorData.message || 'Error al actualizar centro de costo');
    }

    return await response.json();
  } catch (error) {
    console.error('Update cost center error:', error);
    throw error;
  }
};

export const deleteCostCenter = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de centro de costo inválido');
  }
  try {
    const response = await fetch(`${API_URL}/cost-centers/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar centro de costo' }));
      throw new Error(errorData.message || 'Error al eliminar centro de costo');
    }

    return true;
  } catch (error) {
    console.error('Delete cost center error:', error);
    throw error;
  }
};

