/**
 * Servicio para gestión de Formatos de Impresión
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getPrintFormats = async () => {
  try {
    const response = await fetch(`${API_URL}/print-formats`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener formatos de impresión' }));
      throw new Error(errorData.message || 'Error al obtener formatos de impresión');
    }

    return await response.json();
  } catch (error) {
    console.error('Get print formats error:', error);
    throw error;
  }
};

export const getPrintFormatById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de formato de impresión inválido');
  }
  try {
    const response = await fetch(`${API_URL}/print-formats/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener formato de impresión' }));
      throw new Error(errorData.message || 'Error al obtener formato de impresión');
    }

    return await response.json();
  } catch (error) {
    console.error('Get print format error:', error);
    throw error;
  }
};

export const getDefaultPrintFormat = async (documentType) => {
  try {
    const response = await fetch(`${API_URL}/print-formats/type/${documentType}/default`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      return null; // No hay formato por defecto
    }

    return await response.json();
  } catch (error) {
    console.error('Get default print format error:', error);
    return null;
  }
};

export const createPrintFormat = async (formatData) => {
  try {
    const response = await fetch(`${API_URL}/print-formats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(formatData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear formato de impresión' }));
      throw new Error(errorData.message || 'Error al crear formato de impresión');
    }

    return await response.json();
  } catch (error) {
    console.error('Create print format error:', error);
    throw error;
  }
};

export const updatePrintFormat = async (id, formatData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de formato de impresión inválido');
  }
  try {
    const response = await fetch(`${API_URL}/print-formats/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(formatData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar formato de impresión' }));
      throw new Error(errorData.message || 'Error al actualizar formato de impresión');
    }

    return await response.json();
  } catch (error) {
    console.error('Update print format error:', error);
    throw error;
  }
};

export const deletePrintFormat = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de formato de impresión inválido');
  }
  try {
    const response = await fetch(`${API_URL}/print-formats/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar formato de impresión' }));
      throw new Error(errorData.message || 'Error al eliminar formato de impresión');
    }

    return true;
  } catch (error) {
    console.error('Delete print format error:', error);
    throw error;
  }
};

