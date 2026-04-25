/**
 * Servicio para gestión de colores
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getColors = async () => {
  try {
    const response = await fetch(`${API_URL}/colors`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener colores' }));
      throw new Error(errorData.message || 'Error al obtener colores');
    }

    return await response.json();
  } catch (error) {
    console.error('Get colors error:', error);
    throw error;
  }
};

export const getColorById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de color inválido');
  }
  try {
    const response = await fetch(`${API_URL}/colors/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener color' }));
      throw new Error(errorData.message || 'Error al obtener color');
    }

    return await response.json();
  } catch (error) {
    console.error('Get color error:', error);
    throw error;
  }
};

export const createColor = async (colorData) => {
  try {
    const response = await fetch(`${API_URL}/colors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(colorData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear color' }));
      throw new Error(errorData.message || 'Error al crear color');
    }

    return await response.json();
  } catch (error) {
    console.error('Create color error:', error);
    throw error;
  }
};

export const createColors = async (colorNames) => {
  try {
    const response = await fetch(`${API_URL}/colors/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ names: colorNames })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear colores' }));
      throw new Error(errorData.message || 'Error al crear colores');
    }

    return await response.json();
  } catch (error) {
    console.error('Create colors error:', error);
    throw error;
  }
};

export const updateColor = async (id, colorData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de color inválido');
  }
  try {
    const response = await fetch(`${API_URL}/colors/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(colorData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar color' }));
      throw new Error(errorData.message || 'Error al actualizar color');
    }

    return await response.json();
  } catch (error) {
    console.error('Update color error:', error);
    throw error;
  }
};

export const deleteColor = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de color inválido');
  }
  try {
    const response = await fetch(`${API_URL}/colors/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar color' }));
      throw new Error(errorData.message || 'Error al eliminar color');
    }

    return true;
  } catch (error) {
    console.error('Delete color error:', error);
    throw error;
  }
};
