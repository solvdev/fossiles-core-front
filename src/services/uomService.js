/**
 * Servicio para gestión de unidades de medida (UOM)
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getUoms = async () => {
  try {
    const response = await fetch(`${API_URL}/uoms`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener unidades de medida' }));
      throw new Error(errorData.message || 'Error al obtener unidades de medida');
    }

    return await response.json();
  } catch (error) {
    console.error('Get UOMs error:', error);
    throw error;
  }
};

export const getUomById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de unidad de medida inválido');
  }
  try {
    const response = await fetch(`${API_URL}/uoms/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener unidad de medida' }));
      throw new Error(errorData.message || 'Error al obtener unidad de medida');
    }

    return await response.json();
  } catch (error) {
    console.error('Get UOM error:', error);
    throw error;
  }
};

export const createUom = async (uomData) => {
  try {
    const response = await fetch(`${API_URL}/uoms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(uomData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear unidad de medida' }));
      throw new Error(errorData.message || 'Error al crear unidad de medida');
    }

    return await response.json();
  } catch (error) {
    console.error('Create UOM error:', error);
    throw error;
  }
};

export const updateUom = async (id, uomData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de unidad de medida inválido');
  }
  try {
    const response = await fetch(`${API_URL}/uoms/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(uomData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar unidad de medida' }));
      throw new Error(errorData.message || 'Error al actualizar unidad de medida');
    }

    return await response.json();
  } catch (error) {
    console.error('Update UOM error:', error);
    throw error;
  }
};

export const deleteUom = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de unidad de medida inválido');
  }
  try {
    const response = await fetch(`${API_URL}/uoms/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar unidad de medida' }));
      throw new Error(errorData.message || 'Error al eliminar unidad de medida');
    }

    return true;
  } catch (error) {
    console.error('Delete UOM error:', error);
    throw error;
  }
};

