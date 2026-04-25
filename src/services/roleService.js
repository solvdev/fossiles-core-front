/**
 * Servicio para gestión de roles
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getRoles = async () => {
  try {
    const response = await fetch(`${API_URL}/roles`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener roles' }));
      throw new Error(errorData.message || 'Error al obtener roles');
    }

    return await response.json();
  } catch (error) {
    console.error('Get roles error:', error);
    throw error;
  }
};

export const getRoleById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de rol inválido');
  }
  try {
    const response = await fetch(`${API_URL}/roles/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener rol' }));
      throw new Error(errorData.message || 'Error al obtener rol');
    }

    return await response.json();
  } catch (error) {
    console.error('Get role error:', error);
    throw error;
  }
};

export const createRole = async (roleData) => {
  try {
    const response = await fetch(`${API_URL}/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(roleData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear rol' }));
      throw new Error(errorData.message || 'Error al crear rol');
    }

    return await response.json();
  } catch (error) {
    console.error('Create role error:', error);
    throw error;
  }
};

export const updateRole = async (id, roleData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de rol inválido');
  }
  try {
    const response = await fetch(`${API_URL}/roles/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(roleData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar rol' }));
      throw new Error(errorData.message || 'Error al actualizar rol');
    }

    return await response.json();
  } catch (error) {
    console.error('Update role error:', error);
    throw error;
  }
};

export const deleteRole = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de rol inválido');
  }
  try {
    const response = await fetch(`${API_URL}/roles/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar rol' }));
      throw new Error(errorData.message || 'Error al eliminar rol');
    }

    return true;
  } catch (error) {
    console.error('Delete role error:', error);
    throw error;
  }
};
