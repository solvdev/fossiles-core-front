/**
 * Servicio para gestión de Configuración de Email
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getEmailConfigs = async () => {
  try {
    const response = await fetch(`${API_URL}/email-config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener configuraciones de email' }));
      throw new Error(errorData.message || 'Error al obtener configuraciones de email');
    }

    return await response.json();
  } catch (error) {
    console.error('Get email configs error:', error);
    throw error;
  }
};

export const getEmailConfigById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de configuración de email inválido');
  }
  try {
    const response = await fetch(`${API_URL}/email-config/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener configuración de email' }));
      throw new Error(errorData.message || 'Error al obtener configuración de email');
    }

    return await response.json();
  } catch (error) {
    console.error('Get email config error:', error);
    throw error;
  }
};

export const getActiveEmailConfig = async () => {
  try {
    const response = await fetch(`${API_URL}/email-config/active`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      return null; // No hay configuración activa
    }

    return await response.json();
  } catch (error) {
    console.error('Get active email config error:', error);
    return null;
  }
};

export const createEmailConfig = async (configData) => {
  try {
    const response = await fetch(`${API_URL}/email-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(configData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear configuración de email' }));
      throw new Error(errorData.message || 'Error al crear configuración de email');
    }

    return await response.json();
  } catch (error) {
    console.error('Create email config error:', error);
    throw error;
  }
};

export const updateEmailConfig = async (id, configData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de configuración de email inválido');
  }
  try {
    const response = await fetch(`${API_URL}/email-config/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(configData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar configuración de email' }));
      throw new Error(errorData.message || 'Error al actualizar configuración de email');
    }

    return await response.json();
  } catch (error) {
    console.error('Update email config error:', error);
    throw error;
  }
};

export const testEmailConnection = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de configuración de email inválido');
  }
  try {
    const response = await fetch(`${API_URL}/email-config/${id}/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al probar conexión' }));
      throw new Error(errorData.message || 'Error al probar conexión');
    }

    return await response.text();
  } catch (error) {
    console.error('Test email connection error:', error);
    throw error;
  }
};

export const deleteEmailConfig = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de configuración de email inválido');
  }
  try {
    const response = await fetch(`${API_URL}/email-config/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar configuración de email' }));
      throw new Error(errorData.message || 'Error al eliminar configuración de email');
    }

    return true;
  } catch (error) {
    console.error('Delete email config error:', error);
    throw error;
  }
};

