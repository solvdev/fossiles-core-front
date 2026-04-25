/**
 * Servicio para gestión de proveedores
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getSuppliers = async () => {
  try {
    const response = await fetch(`${API_URL}/suppliers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener proveedores' }));
      throw new Error(errorData.message || 'Error al obtener proveedores');
    }

    return await response.json();
  } catch (error) {
    console.error('Get suppliers error:', error);
    throw error;
  }
};

export const getSupplierById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de proveedor inválido');
  }
  try {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener proveedor' }));
      throw new Error(errorData.message || 'Error al obtener proveedor');
    }

    return await response.json();
  } catch (error) {
    console.error('Get supplier error:', error);
    throw error;
  }
};

export const createSupplier = async (supplierData) => {
  try {
    const response = await fetch(`${API_URL}/suppliers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(supplierData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear proveedor' }));
      throw new Error(errorData.message || 'Error al crear proveedor');
    }

    return await response.json();
  } catch (error) {
    console.error('Create supplier error:', error);
    throw error;
  }
};

export const updateSupplier = async (id, supplierData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de proveedor inválido');
  }
  try {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(supplierData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar proveedor' }));
      throw new Error(errorData.message || 'Error al actualizar proveedor');
    }

    return await response.json();
  } catch (error) {
    console.error('Update supplier error:', error);
    throw error;
  }
};

export const deleteSupplier = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de proveedor inválido');
  }
  try {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar proveedor' }));
      throw new Error(errorData.message || 'Error al eliminar proveedor');
    }

    return true;
  } catch (error) {
    console.error('Delete supplier error:', error);
    throw error;
  }
};
