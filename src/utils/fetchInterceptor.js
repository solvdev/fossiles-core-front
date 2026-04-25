/**
 * Interceptor global para fetch que detecta tokens expirados (401)
 * y redirige automáticamente al login
 */

import { handleTokenExpiration } from '../services/authService';

// Guardar el fetch original
const originalFetch = window.fetch;

// Flag para evitar múltiples redirecciones simultáneas
let isRedirecting = false;

// Interceptar todas las peticiones fetch
window.fetch = async function(...args) {
  try {
    const response = await originalFetch.apply(this, args);
    
    // Si la respuesta es 401 (Unauthorized), el token expiró
    if (response.status === 401) {
      // Verificar que sea una petición a nuestra API (no a recursos estáticos, imágenes, etc.)
      const url = args[0];
      if (typeof url === 'string' && url.includes('/api/') && !isRedirecting) {
        isRedirecting = true;
        // Usar setTimeout para permitir que la respuesta se procese antes de redirigir
        setTimeout(() => {
          handleTokenExpiration();
        }, 100);
      }
    }
    
    return response;
  } catch (error) {
    throw error;
  }
};

// Exportar el fetch original por si se necesita en algún lugar
export { originalFetch as fetch };

