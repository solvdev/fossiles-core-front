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

export const updateShipmentPackingItems = async (shipmentId, packingItems) => {
  if (!shipmentId || shipmentId === 'undefined' || shipmentId === 'null') {
    throw new Error('ID de envío inválido');
  }
  try {
    const response = await fetch(`${API_URL}/product-distributions/shipments/${shipmentId}/packing-items`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(packingItems || [])
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al guardar empaques del envío' }));
      throw new Error(errorData.message || 'Error al guardar empaques del envío');
    }

    return await response.json();
  } catch (error) {
    console.error('Update shipment packing items error:', error);
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

export const cancelShipment = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de envío inválido');
  }
  const response = await fetch(`${API_URL}/product-distributions/shipments/${id}/cancel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al anular envío' }));
    throw new Error(errorData.message || 'Error al anular envío');
  }
  return response.json();
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

/** Revierte envío SENT → CONFIRMED y devuelve stock a Bodega PT / Devoluciones. */
export const revertSentShipment = async (shipmentId) => {
  if (!shipmentId || shipmentId === 'undefined' || shipmentId === 'null') {
    throw new Error('ID de envío inválido');
  }
  const response = await fetch(`${API_URL}/product-distributions/shipments/${shipmentId}/revert-send`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al regresar envío a bodega' }));
    throw new Error(err.message || 'Error al regresar envío a bodega');
  }
  return response.json();
};

export const confirmShipmentDraft = async (shipmentId) => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/${shipmentId}/confirm-draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al confirmar envío' }));
    throw new Error(err.message || 'Error al confirmar envío');
  }
  return response.json();
};

/** OPK sin distribución: confirma borrador (si aplica) y registra salida PT → SENT. */
export const confirmAndSendOpkDirectShipment = async (shipmentOrId) => {
  const id = typeof shipmentOrId === 'object' ? shipmentOrId?.id : shipmentOrId;
  if (!id) {
    throw new Error('Envío inválido');
  }

  let shipment = typeof shipmentOrId === 'object' ? shipmentOrId : null;
  const initialStatus = String(shipment?.status || '').trim().toUpperCase();

  if (initialStatus === 'DRAFT' || !initialStatus) {
    shipment = await confirmShipmentDraft(id);
  }

  const status = String(shipment?.status || '').trim().toUpperCase();
  if (status === 'SENT' || status === 'DELIVERED' || status === 'COMPLETED') {
    return shipment;
  }
  if (status === 'CONFIRMED') {
    return sendShipment(shipment.id ?? id);
  }
  throw new Error(`No se pudo despachar el envío OPK. Estado actual: ${status || 'desconocido'}`);
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

export const repairDeliveredShipmentReceiptInventory = async (shipmentId, { force = false, mode = "add" } = {}) => {
  const params = new URLSearchParams();
  if (mode === "reset") {
    params.set("mode", "reset");
  } else if (force) {
    params.set("force", "true");
  }
  const query = params.toString();
  const response = await fetch(
    `${API_URL}/product-distributions/shipments/${shipmentId}/repair-receipt-inventory${query ? `?${query}` : ""}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al reparar inventario de recepción" }));
    throw new Error(err.message || "Error al reparar inventario de recepción");
  }
  return response.json();
};

export const reconcileDeliveredShipmentReceiptInventory = async (shipmentId) =>
  repairDeliveredShipmentReceiptInventory(shipmentId, { mode: "reset" });

export const auditDeliveredShipmentReceiptInventory = async (shipmentId) => {
  const response = await fetch(
    `${API_URL}/product-distributions/shipments/${shipmentId}/receipt-inventory-audit`,
    {
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al auditar inventario de recepción' }));
    throw new Error(err.message || 'Error al auditar inventario de recepción');
  }
  return response.json();
};

export const getShipmentsInTransit = async (kioskLocationId) => {
  const params = new URLSearchParams();
  if (kioskLocationId != null && kioskLocationId !== '') {
    params.set('kioskLocationId', String(kioskLocationId));
  }
  const query = params.toString();
  const response = await fetch(
    `${API_URL}/product-distributions/shipments/in-transit${query ? `?${query}` : ''}`,
    {
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener envíos en tránsito' }));
    throw new Error(err.message || 'Error al obtener envíos en tránsito');
  }
  return response.json();
};

export const countShipmentsInTransit = async (kioskLocationId) => {
  const params = new URLSearchParams();
  if (kioskLocationId != null && kioskLocationId !== '') {
    params.set('kioskLocationId', String(kioskLocationId));
  }
  const query = params.toString();
  const response = await fetch(
    `${API_URL}/product-distributions/shipments/in-transit/count${query ? `?${query}` : ''}`,
    {
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
    }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al contar envíos en tránsito' }));
    throw new Error(err.message || 'Error al contar envíos en tránsito');
  }
  const data = await response.json();
  return Number(data?.count || 0);
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

export const createStandaloneInternalShipment = async (payload) => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/standalone-internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al crear envío interno' }));
    throw new Error(err.message || 'Error al crear envío interno');
  }
  return response.json();
};

export const listStandaloneInternalShipments = async () => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/standalone-internal`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al listar envíos internos' }));
    throw new Error(err.message || 'Error al listar envíos internos');
  }
  return response.json();
};

export const createStandaloneKioskShipment = async (payload) => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/standalone-kiosk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al crear envío a kiosko' }));
    throw new Error(err.message || 'Error al crear envío a kiosko');
  }
  return response.json();
};

export const listStandaloneKioskShipments = async () => {
  const response = await fetch(`${API_URL}/product-distributions/shipments/standalone-kiosk`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al listar envíos directos a kiosko' }));
    throw new Error(err.message || 'Error al listar envíos directos a kiosko');
  }
  return response.json();
};

export const validateDispatchStock = async (products) => {
  const response = await fetch(`${API_URL}/product-distributions/validate-dispatch-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(products),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Stock insuficiente en Bodega PT' }));
    throw new Error(err.message || 'Stock insuficiente en Bodega PT');
  }
};

export const previewDispatchStock = async ({ productId, colorId, size }) => {
  const params = new URLSearchParams({ productId: String(productId) });
  if (colorId != null && colorId !== '') params.set('colorId', String(colorId));
  if (size != null && String(size).trim() !== '') params.set('size', String(size).trim());
  const response = await fetch(`${API_URL}/product-distributions/dispatch-stock-preview?${params}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al consultar stock' }));
    throw new Error(err.message || 'Error al consultar stock');
  }
  return response.json();
};

