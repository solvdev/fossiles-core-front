/**
 * Servicio para gestión de Series de Documentos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getDocumentSeries = async () => {
  try {
    const response = await fetch(`${API_URL}/document-series`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener series de documentos' }));
      throw new Error(errorData.message || 'Error al obtener series de documentos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get document series error:', error);
    throw error;
  }
};

export const getDocumentSeriesById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de serie de documento inválido');
  }
  try {
    const response = await fetch(`${API_URL}/document-series/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener serie de documento' }));
      throw new Error(errorData.message || 'Error al obtener serie de documento');
    }

    return await response.json();
  } catch (error) {
    console.error('Get document series error:', error);
    throw error;
  }
};

export const getNextCorrelative = async (documentType, series) => {
  try {
    const response = await fetch(`${API_URL}/document-series/next/${documentType}/${series}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener siguiente correlativo' }));
      throw new Error(errorData.message || 'Error al obtener siguiente correlativo');
    }

    return await response.json();
  } catch (error) {
    console.error('Get next correlative error:', error);
    throw error;
  }
};

export const createDocumentSeries = async (seriesData) => {
  try {
    const response = await fetch(`${API_URL}/document-series`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(seriesData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear serie de documento' }));
      throw new Error(errorData.message || 'Error al crear serie de documento');
    }

    return await response.json();
  } catch (error) {
    console.error('Create document series error:', error);
    throw error;
  }
};

export const updateDocumentSeries = async (id, seriesData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de serie de documento inválido');
  }
  try {
    const response = await fetch(`${API_URL}/document-series/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(seriesData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar serie de documento' }));
      throw new Error(errorData.message || 'Error al actualizar serie de documento');
    }

    return await response.json();
  } catch (error) {
    console.error('Update document series error:', error);
    throw error;
  }
};

export const resetCorrelative = async (id, newValue) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de serie de documento inválido');
  }
  try {
    const response = await fetch(`${API_URL}/document-series/${id}/reset-correlative?newValue=${newValue}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al resetear correlativo' }));
      throw new Error(errorData.message || 'Error al resetear correlativo');
    }

    return await response.json();
  } catch (error) {
    console.error('Reset correlative error:', error);
    throw error;
  }
};

export const deleteDocumentSeries = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de serie de documento inválido');
  }
  try {
    const response = await fetch(`${API_URL}/document-series/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar serie de documento' }));
      throw new Error(errorData.message || 'Error al eliminar serie de documento');
    }

    return true;
  } catch (error) {
    console.error('Delete document series error:', error);
    throw error;
  }
};

