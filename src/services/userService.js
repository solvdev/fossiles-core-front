/**
 * Servicio para gestión de usuarios
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';


/**
 * Obtiene todos los usuarios
 */
export const getUsers = async () => {
  try {
    const response = await fetch(`${API_URL}/users`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener usuarios' }));
      throw new Error(errorData.message || 'Error al obtener usuarios');
    }

    return await response.json();
  } catch (error) {
    console.error('Get users error:', error);
    throw error;
  }
};

/**
 * Obtiene un usuario por ID
 */
export const getUserById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de usuario inválido');
  }
  try {
    const response = await fetch(`${API_URL}/users/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener usuario' }));
      throw new Error(errorData.message || 'Error al obtener usuario');
    }

    return await response.json();
  } catch (error) {
    console.error('Get user error:', error);
    throw error;
  }
};

/**
 * Crea un nuevo usuario
 */
export const createUser = async (userData) => {
  try {
    const response = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(userData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear usuario' }));
      throw new Error(errorData.message || 'Error al crear usuario');
    }

    return await response.json();
  } catch (error) {
    console.error('Create user error:', error);
    throw error;
  }
};

/**
 * Actualiza un usuario
 */
export const updateUser = async (id, userData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de usuario inválido');
  }
  try {
    const response = await fetch(`${API_URL}/users/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(userData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar usuario' }));
      throw new Error(errorData.message || 'Error al actualizar usuario');
    }

    return await response.json();
  } catch (error) {
    console.error('Update user error:', error);
    throw error;
  }
};

/**
 * Cambia el estado de un usuario
 */
export const changeUserStatus = async (id, status) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de usuario inválido');
  }
  try {
    const response = await fetch(`${API_URL}/users/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al cambiar estado del usuario' }));
      throw new Error(errorData.message || 'Error al cambiar estado del usuario');
    }

    return await response.json();
  } catch (error) {
    console.error('Change user status error:', error);
    throw error;
  }
};

/**
 * Sube la foto de perfil de un usuario
 */
export const uploadUserProfilePhoto = async (id, file) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de usuario inválido');
  }
  if (!file) {
    throw new Error('Debe seleccionar una imagen');
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_URL}/users/${id}/profile-image`, {
      method: 'POST',
      headers: {
        ...getAuthHeader()
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al subir foto de perfil' }));
      throw new Error(errorData.message || 'Error al subir foto de perfil');
    }

    return await response.json();
  } catch (error) {
    console.error('Upload user profile photo error:', error);
    throw error;
  }
};

/**
 * Crea múltiples usuarios con la misma contraseña y configuración
 */
export const createMultipleUsers = async (usersData) => {
  const results = {
    success: [],
    errors: []
  };

  for (const userData of usersData) {
    try {
      const created = await createUser(userData);
      results.success.push(created);
    } catch (error) {
      results.errors.push({
        userData,
        error: error.message || 'Error al crear usuario'
      });
    }
  }

  return results;
};

