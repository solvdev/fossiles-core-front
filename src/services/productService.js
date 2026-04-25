/**
 * Servicio para gestión de productos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getProducts = async () => {
  try {
    const response = await fetch(`${API_URL}/products`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener productos' }));
      throw new Error(errorData.message || 'Error al obtener productos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get products error:', error);
    throw error;
  }
};

export const getProductById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de producto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/products/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener producto' }));
      throw new Error(errorData.message || 'Error al obtener producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product error:', error);
    throw error;
  }
};

export const createProduct = async (productData) => {
  try {
    const response = await fetch(`${API_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(productData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear producto' }));
      throw new Error(errorData.message || 'Error al crear producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Create product error:', error);
    throw error;
  }
};

export const updateProduct = async (id, productData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de producto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/products/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(productData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar producto' }));
      throw new Error(errorData.message || 'Error al actualizar producto');
    }

    return await response.json();
  } catch (error) {
    console.error('Update product error:', error);
    throw error;
  }
};

export const deleteProduct = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de producto inválido');
  }
  try {
    const response = await fetch(`${API_URL}/products/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      let errorMessage = 'Error al eliminar producto';
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
    console.error('Delete product error:', error);
    throw error;
  }
};

export const bulkUpdatePrices = async (percentage, categoryId = null) => {
  try {
    const requestBody = {
      percentage: percentage,
      categoryId: categoryId
    };

    const response = await fetch(`${API_URL}/products/bulk-price-update`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar precios' }));
      throw new Error(errorData.message || 'Error al actualizar precios');
    }

    const result = await response.text();
    return result;
  } catch (error) {
    console.error('Bulk update prices error:', error);
    throw error;
  }
};

export const bulkApplyDiscounts = async (percentage, categoryId = null) => {
  try {
    const requestBody = {
      percentage: percentage,
      categoryId: categoryId
    };

    const response = await fetch(`${API_URL}/products/bulk-discount-apply`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al aplicar descuentos' }));
      throw new Error(errorData.message || 'Error al aplicar descuentos');
    }

    const result = await response.text();
    return result;
  } catch (error) {
    console.error('Bulk apply discounts error:', error);
    throw error;
  }
};

export const bulkRemoveDiscounts = async (categoryId = null) => {
  try {
    const requestBody = categoryId ? { categoryId: categoryId } : null;

    const response = await fetch(`${API_URL}/products/bulk-discount-remove`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: requestBody ? JSON.stringify(requestBody) : null
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al remover descuentos' }));
      throw new Error(errorData.message || 'Error al remover descuentos');
    }

    const result = await response.text();
    return result;
  } catch (error) {
    console.error('Bulk remove discounts error:', error);
    throw error;
  }
};