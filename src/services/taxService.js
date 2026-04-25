/**
 * Servicio para gestión de Impuestos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getTaxes = async () => {
  try {
    const response = await fetch(`${API_URL}/taxes`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener impuestos' }));
      throw new Error(errorData.message || 'Error al obtener impuestos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get taxes error:', error);
    throw error;
  }
};

export const getTaxById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de impuesto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/taxes/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener impuesto' }));
      throw new Error(errorData.message || 'Error al obtener impuesto');
    }

    return await response.json();
  } catch (error) {
    console.error('Get tax error:', error);
    throw error;
  }
};

export const createTax = async (taxData) => {
  try {
    const response = await fetch(`${API_URL}/taxes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(taxData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear impuesto' }));
      throw new Error(errorData.message || 'Error al crear impuesto');
    }

    return await response.json();
  } catch (error) {
    console.error('Create tax error:', error);
    throw error;
  }
};

export const updateTax = async (id, taxData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de impuesto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/taxes/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(taxData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar impuesto' }));
      throw new Error(errorData.message || 'Error al actualizar impuesto');
    }

    return await response.json();
  } catch (error) {
    console.error('Update tax error:', error);
    throw error;
  }
};

export const deleteTax = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de impuesto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/taxes/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar impuesto' }));
      throw new Error(errorData.message || 'Error al eliminar impuesto');
    }

    return true;
  } catch (error) {
    console.error('Delete tax error:', error);
    throw error;
  }
};

