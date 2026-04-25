/**
 * Servicio para gestión de clientes
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getCustomers = async () => {
  try {
    const response = await fetch(`${API_URL}/customers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener clientes' }));
      throw new Error(errorData.message || 'Error al obtener clientes');
    }

    return await response.json();
  } catch (error) {
    console.error('Get customers error:', error);
    throw error;
  }
};

export const getCustomerById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de cliente inválido');
  }
  try {
    const response = await fetch(`${API_URL}/customers/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener cliente' }));
      throw new Error(errorData.message || 'Error al obtener cliente');
    }

    return await response.json();
  } catch (error) {
    console.error('Get customer error:', error);
    throw error;
  }
};

export const createCustomer = async (customerData) => {
  try {
    const response = await fetch(`${API_URL}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(customerData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear cliente' }));
      throw new Error(errorData.message || 'Error al crear cliente');
    }

    return await response.json();
  } catch (error) {
    console.error('Create customer error:', error);
    throw error;
  }
};

export const updateCustomer = async (id, customerData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de cliente inválido');
  }
  try {
    const response = await fetch(`${API_URL}/customers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(customerData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar cliente' }));
      throw new Error(errorData.message || 'Error al actualizar cliente');
    }

    return await response.json();
  } catch (error) {
    console.error('Update customer error:', error);
    throw error;
  }
};

export const deleteCustomer = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de cliente inválido');
  }
  try {
    const response = await fetch(`${API_URL}/customers/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar cliente' }));
      throw new Error(errorData.message || 'Error al eliminar cliente');
    }

    return true;
  } catch (error) {
    console.error('Delete customer error:', error);
    throw error;
  }
};
