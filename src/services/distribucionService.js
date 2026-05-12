/**
 * Servicio para gestión de distribuciones
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

// ========== DISTRIBUCIONES ==========

export const getDistribuciones = async () => {
  try {
    const response = await fetch(`${API_URL}/distribuciones`, {
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
    console.error('Get distribuciones error:', error);
    throw error;
  }
};

export const getDistribucionById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/distribuciones/${id}`, {
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
    console.error('Get distribucion error:', error);
    throw error;
  }
};

export const createDistribucion = async (distribucionData) => {
  try {
    const response = await fetch(`${API_URL}/distribuciones`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(distribucionData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear distribución' }));
      throw new Error(errorData.message || 'Error al crear distribución');
    }

    return await response.json();
  } catch (error) {
    console.error('Create distribucion error:', error);
    throw error;
  }
};

export const updateDistribucion = async (id, distribucionData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/distribuciones/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(distribucionData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar distribución' }));
      throw new Error(errorData.message || 'Error al actualizar distribución');
    }

    return await response.json();
  } catch (error) {
    console.error('Update distribucion error:', error);
    throw error;
  }
};

export const deleteDistribucion = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/distribuciones/${id}`, {
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
    console.error('Delete distribucion error:', error);
    throw error;
  }
};

export const finalizarDistribucion = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/distribuciones/${id}/finalizar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al finalizar distribución' }));
      throw new Error(errorData.message || 'Error al finalizar distribución');
    }

    return await response.json();
  } catch (error) {
    console.error('Finalizar distribucion error:', error);
    throw error;
  }
};

// ========== ENVIOS ==========

export const getEnviosByDistribucion = async (distribucionId) => {
  if (!distribucionId || distribucionId === 'undefined' || distribucionId === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/distribuciones/${distribucionId}/envios`, {
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
    console.error('Get envios error:', error);
    throw error;
  }
};

export const getEnvioById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de envío inválido');
  }
  try {
    const response = await fetch(`${API_URL}/distribuciones/envios/${id}`, {
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
    console.error('Get envio error:', error);
    throw error;
  }
};

export const createOrUpdateEnvio = async (distribucionId, envioData) => {
  if (!distribucionId || distribucionId === 'undefined' || distribucionId === 'null') {
    throw new Error('ID de distribución inválido');
  }
  try {
    const response = await fetch(`${API_URL}/distribuciones/${distribucionId}/envios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(envioData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear/actualizar envío' }));
      throw new Error(errorData.message || 'Error al crear/actualizar envío');
    }

    return await response.json();
  } catch (error) {
    console.error('Create or update envio error:', error);
    throw error;
  }
};

export const deleteEnvio = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de envío inválido');
  }
  try {
    const response = await fetch(`${API_URL}/distribuciones/envios/${id}`, {
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
    console.error('Delete envio error:', error);
    throw error;
  }
};

/** Salida de inventario en Bodega PT (post finalizar distribución, flujo legacy /api/distribuciones). */
export const enviarEnvioDistribucion = async (envioId) => {
  if (!envioId || envioId === 'undefined' || envioId === 'null') {
    throw new Error('ID de envío inválido');
  }
  const response = await fetch(`${API_URL}/distribuciones/envios/${envioId}/enviar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al registrar envío desde Bodega PT' }));
    throw new Error(errorData.message || 'Error al registrar envío desde Bodega PT');
  }
  return await response.json();
};

/** Ingreso de inventario al kiosko (recepción del envío en tránsito). */
export const confirmarRecepcionEnvioDistribucion = async (envioId) => {
  if (!envioId || envioId === 'undefined' || envioId === 'null') {
    throw new Error('ID de envío inválido');
  }
  const response = await fetch(`${API_URL}/distribuciones/envios/${envioId}/confirmar-recepcion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al confirmar recepción en kiosko' }));
    throw new Error(errorData.message || 'Error al confirmar recepción en kiosko');
  }
  return await response.json();
};

