/**
 * Servicio para gestión de departamentos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getDepartments = async () => {
  try {
    const response = await fetch(`${API_URL}/departments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener departamentos' }));
      throw new Error(errorData.message || 'Error al obtener departamentos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get departments error:', error);
    throw error;
  }
};

export const getDepartmentById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de departamento inválido');
  }
  try {
    const response = await fetch(`${API_URL}/departments/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener departamento' }));
      throw new Error(errorData.message || 'Error al obtener departamento');
    }

    return await response.json();
  } catch (error) {
    console.error('Get department error:', error);
    throw error;
  }
};

export const createDepartment = async (departmentData) => {
  try {
    const response = await fetch(`${API_URL}/departments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(departmentData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear departamento' }));
      throw new Error(errorData.message || 'Error al crear departamento');
    }

    return await response.json();
  } catch (error) {
    console.error('Create department error:', error);
    throw error;
  }
};

export const updateDepartment = async (id, departmentData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de departamento inválido');
  }
  try {
    const response = await fetch(`${API_URL}/departments/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(departmentData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar departamento' }));
      throw new Error(errorData.message || 'Error al actualizar departamento');
    }

    return await response.json();
  } catch (error) {
    console.error('Update department error:', error);
    throw error;
  }
};

export const deleteDepartment = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de departamento inválido');
  }
  try {
    const response = await fetch(`${API_URL}/departments/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar departamento' }));
      throw new Error(errorData.message || 'Error al eliminar departamento');
    }

    return true;
  } catch (error) {
    console.error('Delete department error:', error);
    throw error;
  }
};

