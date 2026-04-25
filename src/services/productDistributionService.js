/**
 * Servicio para gestión de distribuciones de productos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

// ========== DISTRIBUTIONS ==========

export const getDistributions = async () => {
  try {
    const response = await fetch(`${API_URL}/product-distributions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener distribuciones' }));
      throw new Error(errorData.message || 'Error al obtener distribuciones');
    }

    return await response.json();
  } catch (error) {
    console.error('Get distributions error:', error);
    throw error;
  }
};

export const getDistributionById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener distribución' }));
      throw new Error(errorData.message || 'Error al obtener distribución');
    }

    return await response.json();
  } catch (error) {
    console.error('Get distribution error:', error);
    throw error;
  }
};

export const createDistribution = async (distributionData) => {
  try {
    const response = await fetch(`${API_URL}/product-distributions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(distributionData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear distribución' }));
      throw new Error(errorData.message || 'Error al crear distribución');
    }

    return await response.json();
  } catch (error) {
    console.error('Create distribution error:', error);
    throw error;
  }
};

export const updateDistribution = async (id, distributionData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(distributionData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar distribución' }));
      throw new Error(errorData.message || 'Error al actualizar distribución');
    }

    return await response.json();
  } catch (error) {
    console.error('Update distribution error:', error);
    throw error;
  }
};

export const deleteDistribution = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar distribución' }));
      throw new Error(errorData.message || 'Error al eliminar distribución');
    }

    return true;
  } catch (error) {
    console.error('Delete distribution error:', error);
    throw error;
  }
};

export const completeDistribution = async (id, options = {}) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const generateProductionOrder =
      options.generateProductionOrder === undefined ? false : Boolean(options.generateProductionOrder);
    const response = await fetch(
      `${API_URL}/product-distributions/${id}/complete?generateProductionOrder=${generateProductionOrder}`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al completar distribución' }));
      throw new Error(errorData.message || 'Error al completar distribución');
    }

    return await response.json();
  } catch (error) {
    console.error('Complete distribution error:', error);
    throw error;
  }
};

// ========== SHIPMENTS ==========

export const getShipmentsByDistribution = async (distributionId) => {
  if (!distributionId || distributionId === 'undefined' || distributionId === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/${distributionId}/shipments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener envíos' }));
      throw new Error(errorData.message || 'Error al obtener envíos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get shipments error:', error);
    throw error;
  }
};

export const getShipmentById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de envío inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/shipments/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener envío' }));
      throw new Error(errorData.message || 'Error al obtener envío');
    }

    return await response.json();
  } catch (error) {
    console.error('Get shipment error:', error);
    throw error;
  }
};

export const createOrUpdateShipment = async (distributionId, shipmentData) => {
  if (!distributionId || distributionId === 'undefined' || distributionId === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/${distributionId}/shipments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(shipmentData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear/actualizar envío' }));
      throw new Error(errorData.message || 'Error al crear/actualizar envío');
    }

    return await response.json();
  } catch (error) {
    console.error('Create or update shipment error:', error);
    throw error;
  }
};

export const updateShipmentProducts = async (shipmentId, products) => {
  if (!shipmentId || shipmentId === 'undefined' || shipmentId === 'null') {
    throw new Error('ID de envío inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/shipments/${shipmentId}/products`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(products)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar productos del envío' }));
      throw new Error(errorData.message || 'Error al actualizar productos del envío');
    }

    return await response.json();
  } catch (error) {
    console.error('Update shipment products error:', error);
    throw error;
  }
};

export const deleteShipment = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de envío inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/shipments/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar envío' }));
      throw new Error(errorData.message || 'Error al eliminar envío');
    }

    return true;
  } catch (error) {
    console.error('Delete shipment error:', error);
    throw error;
  }
};

// ========== TRANSIT & RECEIPT ==========

export const sendShipment = async (shipmentId) => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/${shipmentId}/send`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al enviar' }));
    throw new Error(err.message || 'Error al enviar');
  }
  return response.json();
};

export const confirmReceipt = async (shipmentId, data = {}) => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/${shipmentId}/confirm-receipt`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al confirmar recepción' }));
    throw new Error(err.message || 'Error al confirmar recepción');
  }
  return response.json();
};

export const getShipmentsInTransit = async () => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/in-transit`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener envíos en tránsito' }));
    throw new Error(err.message || 'Error al obtener envíos en tránsito');
  }
  return response.json();
};

export const getShipmentsByStatus = async (status) => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/by-status/${status}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener envíos' }));
    throw new Error(err.message || 'Error al obtener envíos');
  }
  return response.json();
};

export const getInventoryForShipment = async (shipmentId) => {
  if (!shipmentId || shipmentId === 'undefined' || shipmentId === 'null') {
    throw new Error('ID de envío inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/shipments/${shipmentId}/inventory`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener inventario' }));
      throw new Error(errorData.message || 'Error al obtener inventario');
    }

    return await response.json();
  } catch (error) {
    console.error('Get inventory for shipment error:', error);
    throw error;
  }
};

