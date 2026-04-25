/**
 * Utilidad para manejar permisos del usuario
 */

import { getAuthHeader } from '../services/authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

let cachedUserPermissions = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * Obtiene los permisos del usuario actual
 * @returns {Promise<Array<string>>} Array de códigos de permisos
 */
export const getUserPermissions = async () => {
  // Verificar cache
  if (cachedUserPermissions && cacheTimestamp && (Date.now() - cacheTimestamp) < CACHE_DURATION) {
    return cachedUserPermissions;
  }

  try {
    const response = await fetch(`${API_URL}/users/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token expirado, limpiar cache
        cachedUserPermissions = null;
        cacheTimestamp = null;
        return [];
      }
      throw new Error('Error al obtener permisos del usuario');
    }

    const user = await response.json();
    
    // Extraer todos los permisos de los roles del usuario
    const permissions = new Set();
    if (user.roles) {
      user.roles.forEach(role => {
        if (role.permissions) {
          role.permissions.forEach(permission => {
            permissions.add(permission.code);
          });
        }
      });
    }

    const permissionArray = Array.from(permissions);
    
    // Debug: Log de permisos obtenidos
    console.log('Permisos del usuario:', permissionArray);
    console.log('Tiene ADMIN_FULL_ACCESS:', permissionArray.includes('ADMIN_FULL_ACCESS'));
    
    // Guardar en cache
    cachedUserPermissions = permissionArray;
    cacheTimestamp = Date.now();
    
    return permissionArray;
  } catch (error) {
    console.error('Error al obtener permisos:', error);
    return [];
  }
};

/**
 * Verifica si el usuario tiene un permiso específico
 * @param {string} permissionCode - Código del permiso a verificar
 * @returns {Promise<boolean>}
 */
export const hasPermission = async (permissionCode) => {
  if (!permissionCode) return false;
  
  const permissions = await getUserPermissions();
  
  // Si tiene ADMIN_FULL_ACCESS, tiene todos los permisos
  if (permissions.includes('ADMIN_FULL_ACCESS')) {
    return true;
  }
  
  return permissions.includes(permissionCode);
};

/**
 * Verifica si el usuario tiene al menos uno de los permisos especificados
 * @param {Array<string>} permissionCodes - Array de códigos de permisos
 * @returns {Promise<boolean>}
 */
export const hasAnyPermission = async (permissionCodes) => {
  if (!permissionCodes || permissionCodes.length === 0) return false;
  
  const permissions = await getUserPermissions();
  
  // Si tiene ADMIN_FULL_ACCESS, tiene todos los permisos
  if (permissions.includes('ADMIN_FULL_ACCESS')) {
    return true;
  }
  
  return permissionCodes.some(code => permissions.includes(code));
};

/**
 * Verifica si el usuario tiene todos los permisos especificados
 * @param {Array<string>} permissionCodes - Array de códigos de permisos
 * @returns {Promise<boolean>}
 */
export const hasAllPermissions = async (permissionCodes) => {
  if (!permissionCodes || permissionCodes.length === 0) return false;
  
  const permissions = await getUserPermissions();
  
  // Si tiene ADMIN_FULL_ACCESS, tiene todos los permisos
  if (permissions.includes('ADMIN_FULL_ACCESS')) {
    return true;
  }
  
  return permissionCodes.every(code => permissions.includes(code));
};

/**
 * Limpia el cache de permisos
 */
export const clearPermissionCache = () => {
  cachedUserPermissions = null;
  cacheTimestamp = null;
};

