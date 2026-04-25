/**
 * Servicio para gestión de materiales
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getMaterials = async () => {
  try {
    const response = await fetch(`${API_URL}/materials`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener materiales' }));
      throw new Error(errorData.message || 'Error al obtener materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Get materials error:', error);
    throw error;
  }
};

export const getMaterialById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/materials/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener material' }));
      throw new Error(errorData.message || 'Error al obtener material');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material error:', error);
    throw error;
  }
};

export const createMaterial = async (materialData) => {
  try {
    const response = await fetch(`${API_URL}/materials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(materialData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear material' }));
      throw new Error(errorData.message || 'Error al crear material');
    }

    return await response.json();
  } catch (error) {
    console.error('Create material error:', error);
    throw error;
  }
};

export const updateMaterial = async (id, materialData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/materials/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(materialData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar material' }));
      throw new Error(errorData.message || 'Error al actualizar material');
    }

    return await response.json();
  } catch (error) {
    console.error('Update material error:', error);
    throw error;
  }
};

export const deleteMaterial = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/materials/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar material' }));
      throw new Error(errorData.message || 'Error al eliminar material');
    }

    return true;
  } catch (error) {
    console.error('Delete material error:', error);
    throw error;
  }
};

export const searchMaterials = async (query, activeOnly = true) => {
  try {
    const response = await fetch(`${API_URL}/materials/search?query=${encodeURIComponent(query)}&activeOnly=${activeOnly}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al buscar materiales' }));
      throw new Error(errorData.message || 'Error al buscar materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Search materials error:', error);
    throw error;
  }
};

export const getMaterialStickerData = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de material inválido');
  }
  try {
    const response = await fetch(`${API_URL}/materials/${id}/sticker`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener datos del sticker' }));
      throw new Error(errorData.message || 'Error al obtener datos del sticker');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material sticker data error:', error);
    throw error;
  }
};