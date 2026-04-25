/**
 * Servicio para gestión de colores de materiales
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getMaterialColors = async () => {
  try {
    const response = await fetch(`${API_URL}/material-colors`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener colores de materiales' }));
      throw new Error(errorData.message || 'Error al obtener colores de materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material colors error:', error);
    throw error;
  }
};

export const getMaterialColorById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de color de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/material-colors/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener color de material' }));
      throw new Error(errorData.message || 'Error al obtener color de material');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material color error:', error);
    throw error;
  }
};

export const createMaterialColor = async (colorData) => {
  try {
    const response = await fetch(`${API_URL}/material-colors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(colorData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear color de material' }));
      throw new Error(errorData.message || 'Error al crear color de material');
    }

    return await response.json();
  } catch (error) {
    console.error('Create material color error:', error);
    throw error;
  }
};

export const updateMaterialColor = async (id, colorData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de color de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/material-colors/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(colorData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar color de material' }));
      throw new Error(errorData.message || 'Error al actualizar color de material');
    }

    return await response.json();
  } catch (error) {
    console.error('Update material color error:', error);
    throw error;
  }
};

export const createMaterialColors = async (colorNames) => {
  try {
    const response = await fetch(`${API_URL}/material-colors/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ names: colorNames })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear colores de materiales' }));
      throw new Error(errorData.message || 'Error al crear colores de materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Create material colors error:', error);
    throw error;
  }
};

export const deleteMaterialColor = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de color de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/material-colors/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      let errorMessage = 'Error al eliminar color de material';
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
    console.error('Delete material color error:', error);
    throw error;
  }
};

