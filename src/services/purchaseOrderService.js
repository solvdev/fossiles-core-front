import { getAuthHeader } from './authService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

// ========== PURCHASE ORDERS (Sistema Antiguo - Compras de Materiales) ==========

export const getPurchaseOrders = async (status = null) => {
  try {
    const url = status 
      ? `${API_URL}/purchase-orders?status=${status}`
      : `${API_URL}/purchase-orders`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener órdenes de compra' }));
      throw new Error(errorData.message || 'Error al obtener órdenes de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Get purchase orders error:', error);
    throw error;
  }
};

export const getPurchaseOrderById = async (id) => {
  try {
    const response = await fetch(`${API_URL}/purchase-orders/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener orden de compra' }));
      throw new Error(errorData.message || 'Error al obtener orden de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Get purchase order error:', error);
    throw error;
  }
};

export const createPurchaseOrder = async (orderData) => {
  try {
    const response = await fetch(`${API_URL}/purchase-orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(orderData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear orden de compra' }));
      throw new Error(errorData.message || 'Error al crear orden de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Create purchase order error:', error);
    throw error;
  }
};

export const cancelPurchaseOrder = async (id) => {
  try {
    const response = await fetch(`${API_URL}/purchase-orders/${id}/cancel`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al cancelar orden de compra' }));
      throw new Error(errorData.message || 'Error al cancelar orden de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Cancel purchase order error:', error);
    throw error;
  }
};

