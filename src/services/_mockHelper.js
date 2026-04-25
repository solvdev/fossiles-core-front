/**
 * Helper para simular llamadas API durante desarrollo de wireframe
 * TEMPORALMENTE: Simula delay de red sin hacer llamadas reales
 */

export const mockDelay = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retorna array vacío (para listas)
 */
export const mockEmptyArray = async () => {
  await mockDelay();
  return [];
};

/**
 * Retorna objeto mock genérico
 */
export const mockObject = async (id, data = {}) => {
  await mockDelay();
  return {
    id: id || Date.now(),
    ...data
  };
};

/**
 * Retorna true (para operaciones de eliminación)
 */
export const mockSuccess = async () => {
  await mockDelay();
  return true;
};

