/**
 * Servicio para gestión de categorías de productos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getProductCategories = async () => {
  try {
    const response = await fetch(`${API_URL}/product-categories`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener categorías' }));
      throw new Error(errorData.message || 'Error al obtener categorías');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product categories error:', error);
    throw error;
  }
};

export const getProductCategoryById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de categoría inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-categories/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener categoría' }));
      throw new Error(errorData.message || 'Error al obtener categoría');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product category error:', error);
    throw error;
  }
};

export const createProductCategory = async (categoryData) => {
  try {
    const response = await fetch(`${API_URL}/product-categories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(categoryData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear categoría' }));
      throw new Error(errorData.message || 'Error al crear categoría');
    }

    return await response.json();
  } catch (error) {
    console.error('Create product category error:', error);
    throw error;
  }
};

export const updateProductCategory = async (id, categoryData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de categoría inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-categories/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(categoryData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar categoría' }));
      throw new Error(errorData.message || 'Error al actualizar categoría');
    }

    return await response.json();
  } catch (error) {
    console.error('Update product category error:', error);
    throw error;
  }
};

export const deleteProductCategory = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de categoría inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-categories/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar categoría' }));
      throw new Error(errorData.message || 'Error al eliminar categoría');
    }

    return true;
  } catch (error) {
    console.error('Delete product category error:', error);
    throw error;
  }
};
