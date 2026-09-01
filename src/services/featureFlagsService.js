/**
 * Feature flags públicos del backend (sin autenticación).
 * Permiten al frontend evitar abrir SSE o hacer polling cuando el servidor
 * tiene deshabilitada una función (ej. servidor de pruebas con RAM limitada).
 */

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

const DEFAULT_FLAGS = {
  userActivityTrackingEnabled: true,
  systemAnnouncementsEnabled: true,
};

let cachedFlagsPromise = null;

/**
 * Obtiene los feature flags del backend. El resultado se cachea en memoria
 * durante la sesión (una sola petición por carga de la aplicación).
 */
export const getFeatureFlags = () => {
  if (!cachedFlagsPromise) {
    cachedFlagsPromise = fetch(`${API_URL}/public/feature-flags`)
      .then((response) => (response.ok ? response.json() : DEFAULT_FLAGS))
      .catch(() => DEFAULT_FLAGS);
  }
  return cachedFlagsPromise;
};
