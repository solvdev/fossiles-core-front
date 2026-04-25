/**
 * Servicio para gestión de ubicaciones
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getLocations = async () => {
  try {
    const response = await fetch(`${API_URL}/locations`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener ubicaciones' }));
      throw new Error(errorData.message || 'Error al obtener ubicaciones');
    }

    return await response.json();
  } catch (error) {
    console.error('Get locations error:', error);
    throw error;
  }
};

export const getLocationById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/locations/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener ubicación' }));
      throw new Error(errorData.message || 'Error al obtener ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Get location error:', error);
    throw error;
  }
};

export const createLocation = async (locationData) => {
  try {
    const response = await fetch(`${API_URL}/locations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(locationData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear ubicación' }));
      throw new Error(errorData.message || 'Error al crear ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Create location error:', error);
    throw error;
  }
};

export const updateLocation = async (id, locationData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/locations/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(locationData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar ubicación' }));
      throw new Error(errorData.message || 'Error al actualizar ubicación');
    }

    return await response.json();
  } catch (error) {
    console.error('Update location error:', error);
    throw error;
  }
};

export const deleteLocation = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de ubicación inválido');
  }
  try {
    const response = await fetch(`${API_URL}/locations/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar ubicación' }));
      throw new Error(errorData.message || 'Error al eliminar ubicación');
    }

    return true;
  } catch (error) {
    console.error('Delete location error:', error);
    throw error;
  }
};
