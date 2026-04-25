/**
 * Servicio para gestión de monedas
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getCurrencies = async () => {
  try {
    const response = await fetch(`${API_URL}/currencies`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener monedas' }));
      throw new Error(errorData.message || 'Error al obtener monedas');
    }

    return await response.json();
  } catch (error) {
    console.error('Get currencies error:', error);
    throw error;
  }
};

export const getCurrencyById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de moneda inválido');
  }
  try {
    const response = await fetch(`${API_URL}/currencies/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener moneda' }));
      throw new Error(errorData.message || 'Error al obtener moneda');
    }

    return await response.json();
  } catch (error) {
    console.error('Get currency error:', error);
    throw error;
  }
};

export const createCurrency = async (currencyData) => {
  try {
    const response = await fetch(`${API_URL}/currencies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(currencyData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear moneda' }));
      throw new Error(errorData.message || 'Error al crear moneda');
    }

    return await response.json();
  } catch (error) {
    console.error('Create currency error:', error);
    throw error;
  }
};

export const updateCurrency = async (id, currencyData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de moneda inválido');
  }
  try {
    const response = await fetch(`${API_URL}/currencies/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(currencyData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar moneda' }));
      throw new Error(errorData.message || 'Error al actualizar moneda');
    }

    return await response.json();
  } catch (error) {
    console.error('Update currency error:', error);
    throw error;
  }
};

export const deleteCurrency = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de moneda inválido');
  }
  try {
    const response = await fetch(`${API_URL}/currencies/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar moneda' }));
      throw new Error(errorData.message || 'Error al eliminar moneda');
    }

    return true;
  } catch (error) {
    console.error('Delete currency error:', error);
    throw error;
  }
};
