/**
 * Servicio de autenticación
 * Maneja el login, guardado de token y validación
 */

import { API_URL, buildApiUrl } from '../config/apiConfig';

/**
 * Guarda el token en localStorage
 */
export const saveToken = (token) => {
  localStorage.setItem('authToken', token);
  localStorage.setItem('authTokenTime', new Date().toISOString());
  // Disparar evento personalizado para que AuthContext se recargue
  window.dispatchEvent(new Event('authTokenChanged'));
};

/**
 * Obtiene el token del localStorage
 */
export const getToken = () => {
  return localStorage.getItem('authToken');
};

/**
 * Elimina el token del localStorage
 */
export const removeToken = () => {
  localStorage.removeItem('authToken');
  localStorage.removeItem('authTokenTime');
  localStorage.removeItem('userData');
};

/**
 * Verifica si hay un token guardado y válido
 * Esta es una verificación básica - la validación real se hace en el backend
 */
export const isAuthenticated = () => {
  const token = getToken();
  // Verificar que el token exista y no esté vacío
  if (!token || token.trim() === '' || token === 'null' || token === 'undefined') {
    // Limpiar si hay un token inválido
    if (localStorage.getItem('authToken')) {
      removeToken();
    }
    return false;
  }
  // Verificar que también existan los datos del usuario
  const userData = localStorage.getItem('userData');
  if (!userData || userData === 'null' || userData === 'undefined') {
    // Si no hay datos de usuario, limpiar el token inválido
    removeToken();
    return false;
  }
  try {
    // Intentar parsear los datos del usuario para verificar que sean válidos
    JSON.parse(userData);
  } catch (e) {
    // Si los datos no son JSON válido, limpiar
    removeToken();
    return false;
  }
  return true;
};

/**
 * Realiza el login
 * @param {string} usernameOrEmail - Usuario o email
 * @param {string} encryptedPassword - Contraseña encriptada con AES
 * @returns {Promise<Object>} - Datos del usuario y token
 */
export const login = async (usernameOrEmail, encryptedPassword) => {
  try {
    const response = await fetch(buildApiUrl('/auth/login'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        usernameOrEmail,
        encryptedPassword
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error de autenticación' }));
      throw new Error(errorData.message || 'Credenciales inválidas');
    }

    const data = await response.json();
    
    // Guardar datos del usuario
    localStorage.setItem('userData', JSON.stringify({
      id: data.id,
      username: data.username,
      email: data.email,
      status: data.status
    }));

    // Guardar token al final para disparar el evento con userData ya disponible
    saveToken(data.token);

    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

/**
 * Valida el token con el backend
 */
export const validateToken = async () => {
  const token = getToken();
  if (!token || token.trim() === '') {
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout de 5 segundos
    
    const response = await fetch(buildApiUrl('/auth/validate'), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Si el token no es válido (401, 403), limpiarlo
      if (response.status === 401 || response.status === 403) {
        removeToken();
      }
      return false;
    }

    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('Token validation timeout');
    } else {
      console.error('Token validation error:', error);
    }
    // Si hay un error de red o timeout, asumir que el token podría ser válido
    // pero no podemos verificarlo, así que retornar false para ser seguro
    return false;
  }
};

/**
 * Obtiene los datos del usuario guardados
 */
export const getUserData = () => {
  const userData = localStorage.getItem('userData');
  return userData ? JSON.parse(userData) : null;
};

/**
 * Realiza el logout
 * Limpia el token y los datos del usuario del localStorage
 * Opcionalmente notifica al backend
 */
export const logout = async () => {
  const token = getToken();
  
  // Opcional: notificar al backend sobre el logout
  if (token) {
    try {
      await fetch(buildApiUrl('/auth/logout'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => {
        // Si falla la petición, continuar con el logout local
        console.warn('No se pudo notificar al backend sobre el logout');
      });
    } catch (error) {
      // Continuar con el logout local aunque falle la notificación
      console.warn('Error al notificar logout al backend:', error);
    }
  }
  
  // Limpiar datos locales
  removeToken();
  
  // Limpiar cache de permisos
  try {
    const { clearPermissionCache } = await import('../utils/permissionHelper');
    clearPermissionCache();
  } catch (error) {
    // Si falla, continuar
    console.warn('Error al limpiar cache de permisos:', error);
  }
};

/**
 * Obtiene el header de autorización para las peticiones
 */
export const getAuthHeader = () => {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

/**
 * Maneja la expiración del token y redirige al login
 */
export const handleTokenExpiration = () => {
  // Limpiar el token y datos del usuario
  removeToken();
  
  // Solo redirigir si no estamos ya en la página de login
  if (window.location.pathname !== '/auth/login') {
    // Usar window.location.href para una redirección completa
    // Esto asegura que se recargue la aplicación y se limpie el estado
    window.location.href = '/auth/login';
  }
};

/**
 * Wrapper para fetch que intercepta errores 401 y redirige al login
 * @param {string} url - URL de la petición
 * @param {object} options - Opciones de fetch
 * @returns {Promise<Response>} - Respuesta de la petición
 */
export const authenticatedFetch = async (url, options = {}) => {
  // Agregar el token de autenticación si existe
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // Si el token expiró (401 Unauthorized), redirigir al login
    if (response.status === 401) {
      handleTokenExpiration();
      throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
    }

    return response;
  } catch (error) {
    // Si es un error de red y tenemos token, podría ser que expiró
    if (error.name === 'TypeError' && token) {
      // No hacer nada aquí, dejar que el error se propague
    }
    throw error;
  }
};

