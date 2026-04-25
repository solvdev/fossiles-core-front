/**
 * Servicio para gestión de permisos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getPermissions = async () => {
  try {
    const response = await fetch(`${API_URL}/permissions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener permisos' }));
      throw new Error(errorData.message || 'Error al obtener permisos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get permissions error:', error);
    throw error;
  }
};

export const getPermissionById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de permiso inválido');
  }
  try {
    const response = await fetch(`${API_URL}/permissions/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener permiso' }));
      throw new Error(errorData.message || 'Error al obtener permiso');
    }

    return await response.json();
  } catch (error) {
    console.error('Get permission error:', error);
    throw error;
  }
};

export const createPermission = async (permissionData) => {
  try {
    const response = await fetch(`${API_URL}/permissions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(permissionData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear permiso' }));
      throw new Error(errorData.message || 'Error al crear permiso');
    }

    return await response.json();
  } catch (error) {
    console.error('Create permission error:', error);
    throw error;
  }
};

export const updatePermission = async (id, permissionData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de permiso inválido');
  }
  try {
    const response = await fetch(`${API_URL}/permissions/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(permissionData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar permiso' }));
      throw new Error(errorData.message || 'Error al actualizar permiso');
    }

    return await response.json();
  } catch (error) {
    console.error('Update permission error:', error);
    throw error;
  }
};

export const deletePermission = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de permiso inválido');
  }
  try {
    const response = await fetch(`${API_URL}/permissions/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar permiso' }));
      throw new Error(errorData.message || 'Error al eliminar permiso');
    }

    return true;
  } catch (error) {
    console.error('Delete permission error:', error);
    throw error;
  }
};
