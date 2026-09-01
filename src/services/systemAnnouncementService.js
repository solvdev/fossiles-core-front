/**
 * Servicio para alertas y anuncios del sistema en tiempo real (Broadcast)
 */

import { getAuthHeader, getToken } from './authService';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/**
 * Obtiene el anuncio activo actual si existe
 */
export const getActiveAnnouncement = async () => {
  try {
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
  } catch (error) {
    console.warn('Get active announcement error:', error);
    return null;
  }
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
 * @returns {Function} Función de limpieza para cerrar la conexión SSE
 */
export const subscribeToAnnouncements = (onAnnouncement, onDismiss, onError) => {
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

      eventSource.addEventListener('INIT', () => {
        // Conexión confirmada por backend
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
