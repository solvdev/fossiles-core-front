/**
 * Servicio para sincronizar permisos desde routes.js con la base de datos
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/**
 * Sincroniza permisos desde las rutas con la base de datos
 * @param {Array} permissions - Array de permisos extraídos de routes.js
 * @returns {Promise<Object>} Resultado de la sincronización
 */
export const syncPermissions = async (permissions) => {
  try {
    const response = await fetch(`${API_URL}/permissions/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ permissions })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al sincronizar permisos' }));
      throw new Error(errorData.message || 'Error al sincronizar permisos');
    }

    return await response.json();
  } catch (error) {
    console.error('Sync permissions error:', error);
    throw error;
  }
};

/**
 * Obtiene el reporte de sincronización sin aplicar cambios
 * @param {Array} permissions - Array de permisos extraídos de routes.js
 * @returns {Promise<Object>} Reporte de sincronización
 */
export const getSyncReport = async (permissions) => {
  try {
    const response = await fetch(`${API_URL}/permissions/sync/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ permissions })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener reporte' }));
      throw new Error(errorData.message || 'Error al obtener reporte de sincronización');
    }

    return await response.json();
  } catch (error) {
    console.error('Get sync report error:', error);
    throw error;
  }
};

