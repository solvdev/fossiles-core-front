/**
 * Servicio para alertas y anuncios del sistema en tiempo real (Broadcast)
 */

import { getAuthHeader, getToken } from './authService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/**
 * Igual que getActiveAnnouncement pero lanza error si el back no contesta.
 * El banner lo usa para no confundir "servidor caído" con "no hay aviso".
 */
export const fetchActiveAnnouncement = async () => {
  const response = await fetch(`${API_URL}/system-announcements/active`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader()
    }
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Error al consultar anuncio' }));
    throw new Error(errorData.message || 'Error al consultar anuncio');
  }

  return await response.json();
};

/**
 * Obtiene el anuncio activo actual si existe
 */
export const getActiveAnnouncement = async () => {
  try {
    return await fetchActiveAnnouncement();
  } catch (error) {
    console.warn('Get active announcement error:', error);
    return null;
  }
};

/**
 * Consulta si el back ya terminó de arrancar. Devuelve { bootId, serverNowEpochMs } o null si no contesta.
 */
export const pingServer = async () => {
  try {
    const response = await fetch(`${API_URL}/system-announcements/ping`, { method: 'GET', cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    return null;
  }
};

/**
 * Momento local (Date.now()) en que vence el anuncio, corrigiendo la diferencia de reloj con el servidor.
 * Con un back viejo (sin epoch) usa remainingSeconds.
 */
export const getAnnouncementDeadline = (announcement) => {
  if (!announcement) return null;
  if (announcement.expiresAtEpochMs && announcement.serverNowEpochMs) {
    return Date.now() + (announcement.expiresAtEpochMs - announcement.serverNowEpochMs);
  }
  return Date.now() + (Number(announcement.remainingSeconds) || 0) * 1000;
};

/**
 * Emite una nueva alerta global de sistema
 * @param {Object} payload { title, message, durationMinutes, durationSeconds, announcementType, targetAction }
 */
export const broadcastAnnouncement = async (payload) => {
  try {
    const response = await fetch(`${API_URL}/system-announcements/broadcast`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al emitir alerta' }));
      throw new Error(errorData.message || 'Error al emitir alerta');
    }

    return await response.json();
  } catch (error) {
    console.error('Broadcast announcement error:', error);
    throw error;
  }
};

/**
 * Cancela la alerta activa actual
 */
export const dismissAnnouncement = async () => {
  try {
    const response = await fetch(`${API_URL}/system-announcements/dismiss`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al cancelar alerta' }));
      throw new Error(errorData.message || 'Error al cancelar alerta');
    }

    return await response.json();
  } catch (error) {
    console.error('Dismiss announcement error:', error);
    throw error;
  }
};

/**
 * Suscribe a eventos Server-Sent Events (SSE) para recibir alertas en tiempo real
 * @param {Function} onAnnouncement Callback llamado cuando llega un anuncio { title, message, remainingSeconds, ... }
 * @param {Function} onDismiss Callback llamado cuando se cancela la alerta
 * @param {Function} onError Callback opcional ante errores de conexión
 * @param {Object} extra { onInit({ bootId }), onRestarting() } opcionales
 * @returns {Function} Función de limpieza para cerrar la conexión SSE
 */
export const subscribeToAnnouncements = (onAnnouncement, onDismiss, onError, extra = {}) => {
  const token = getToken();
  if (!token) {
    return () => {};
  }

  let eventSource = null;
  let retryTimeout = null;
  let isClosed = false;

  const connect = () => {
    if (isClosed) return;

    try {
      const streamUrl = `${API_URL}/system-announcements/stream?token=${encodeURIComponent(token)}`;
      eventSource = new EventSource(streamUrl);

      eventSource.addEventListener('ANNOUNCEMENT', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onAnnouncement) onAnnouncement(data);
        } catch (e) {
          console.warn('Error parseando evento ANNOUNCEMENT:', e);
        }
      });

      eventSource.addEventListener('DISMISS', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (onDismiss) onDismiss(data);
        } catch (e) {
          if (onDismiss) onDismiss({});
        }
      });

      eventSource.addEventListener('INIT', (event) => {
        // Conexión confirmada por backend; bootId cambia en cada reinicio
        try {
          const data = JSON.parse(event.data);
          if (extra.onInit) extra.onInit(data);
        } catch (e) {
          // INIT sin JSON (back viejo)
        }
      });

      eventSource.addEventListener('RESTARTING', () => {
        if (extra.onRestarting) extra.onRestarting();
      });

      eventSource.addEventListener('PING', () => {
        // Heartbeat recibido
      });

      eventSource.onerror = (err) => {
        if (eventSource) {
          eventSource.close();
        }
        if (onError) onError(err);

        // Reintentar conexión después de 5 segundos si no se ha cerrado manualmente
        if (!isClosed) {
          retryTimeout = setTimeout(connect, 5000);
        }
      };
    } catch (e) {
      console.warn('Error inicializando EventSource:', e);
      if (!isClosed) {
        retryTimeout = setTimeout(connect, 10000);
      }
    }
  };

  connect();

  return () => {
    isClosed = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    if (eventSource) eventSource.close();
  };
};
