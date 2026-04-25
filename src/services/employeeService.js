/**
 * Servicio para gestión de empleados
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

/**
 * Obtiene todos los empleados
 */
export const getEmployees = async () => {
  try {
    const response = await fetch(`${API_URL}/employees`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener empleados' }));
      throw new Error(errorData.message || 'Error al obtener empleados');
    }

    return await response.json();
  } catch (error) {
    console.error('Get employees error:', error);
    throw error;
  }
};

/**
 * Obtiene un empleado por ID
 */
export const getEmployeeById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de empleado inválido');
  }
  try {
    const response = await fetch(`${API_URL}/employees/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener empleado' }));
      throw new Error(errorData.message || 'Error al obtener empleado');
    }

    return await response.json();
  } catch (error) {
    console.error('Get employee error:', error);
    throw error;
  }
};

/**
 * Crea un nuevo empleado
 */
export const createEmployee = async (employeeData) => {
  try {
    const response = await fetch(`${API_URL}/employees`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(employeeData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear empleado' }));
      throw new Error(errorData.message || 'Error al crear empleado');
    }

    return await response.json();
  } catch (error) {
    console.error('Create employee error:', error);
    throw error;
  }
};

/**
 * Actualiza un empleado
 */
export const updateEmployee = async (id, employeeData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de empleado inválido');
  }
  try {
    const response = await fetch(`${API_URL}/employees/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(employeeData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar empleado' }));
      throw new Error(errorData.message || 'Error al actualizar empleado');
    }

    return await response.json();
  } catch (error) {
    console.error('Update employee error:', error);
    throw error;
  }
};

/**
 * Cambia el estado de un empleado
 */
export const changeEmployeeStatus = async (id, status) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de empleado inválido');
  }
  try {
    const response = await fetch(`${API_URL}/employees/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al cambiar estado del empleado' }));
      throw new Error(errorData.message || 'Error al cambiar estado del empleado');
    }

    return await response.json();
  } catch (error) {
    console.error('Change employee status error:', error);
    throw error;
  }
};

/**
 * Elimina un empleado
 */
export const deleteEmployee = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de empleado inválido');
  }
  try {
    const response = await fetch(`${API_URL}/employees/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar empleado' }));
      throw new Error(errorData.message || 'Error al eliminar empleado');
    }

    return true;
  } catch (error) {
    console.error('Delete employee error:', error);
    throw error;
  }
};

/**
 * Crea múltiples empleados
 */
export const createMultipleEmployees = async (employeesData) => {
  const results = {
    success: [],
    errors: []
  };

  for (const employeeData of employeesData) {
    try {
      const created = await createEmployee(employeeData);
      results.success.push(created);
    } catch (error) {
      results.errors.push({
        employeeData,
        error: error.message || 'Error al crear empleado'
      });
    }
  }

  return results;
};

