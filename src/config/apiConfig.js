/**
 * Configuración centralizada de la API
 * Normaliza la URL base para evitar problemas de concatenación
 */

// Obtener la URL base de las variables de entorno
const getBaseApiUrl = () => {
  const envUrl = process.env.REACT_APP_API_URL;
  
  if (!envUrl) {
    return 'http://localhost:8080/api';
  }
  
  // Normalizar la URL: eliminar barras finales y asegurar que termine correctamente
  let normalizedUrl = envUrl.trim();
  
  // Detectar cualquier patrón que incluya una IP y puerto en medio de la ruta
  // Ejemplos: /auth/18.217.86.130:8080, /18.217.86.130:8080/api, etc.
  const ipPortPattern = /\/(\d+\.\d+\.\d+\.\d+:\d+)/;
  if (ipPortPattern.test(normalizedUrl)) {
    // Extraer solo el dominio base (protocolo + dominio, sin puerto en la ruta)
    const domainMatch = normalizedUrl.match(/^(https?:\/\/[^\/]+)/);
    if (domainMatch) {
      normalizedUrl = domainMatch[1] + '/api';
    } else {
      normalizedUrl = 'http://localhost:8080/api';
    }
  } else {
    // Si contiene /auth en cualquier parte (y no es parte del dominio), extraer solo el dominio base
    if (normalizedUrl.includes('/auth') && !normalizedUrl.match(/^https?:\/\/[^\/]+\/api\/auth/)) {
      const domainMatch = normalizedUrl.match(/^(https?:\/\/[^\/]+)/);
      if (domainMatch) {
        normalizedUrl = domainMatch[1] + '/api';
      }
    }
    
    // Eliminar barras finales
    normalizedUrl = normalizedUrl.replace(/\/+$/, '');
    
    // Asegurar que termine con /api
    if (!normalizedUrl.endsWith('/api')) {
      normalizedUrl = normalizedUrl + '/api';
    }
  }
  
  return normalizedUrl;
};

export const API_URL = getBaseApiUrl();

// Log para debugging (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 API Configuration:', {
    'REACT_APP_API_URL (raw)': process.env.REACT_APP_API_URL,
    'API_URL (normalized)': API_URL
  });
}

// Función helper para construir URLs de forma segura
export const buildApiUrl = (endpoint) => {
  // Asegurar que el endpoint comience con /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // Eliminar /api duplicado si el endpoint ya lo contiene
  const cleanEndpoint = normalizedEndpoint.startsWith('/api/') 
    ? normalizedEndpoint.replace(/^\/api/, '') 
    : normalizedEndpoint;
  
  return `${API_URL}${cleanEndpoint}`;
};

