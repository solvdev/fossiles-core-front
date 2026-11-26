/**
 * Servicio para gestión de proveedores
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getSuppliers = async () => {
  try {
    const response = await fetch(`${API_URL}/suppliers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener proveedores' }));
      throw new Error(errorData.message || 'Error al obtener proveedores');
    }

    return await response.json();
  } catch (error) {
    console.error('Get suppliers error:', error);
    throw error;
  }
};

export const getSupplierById = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de proveedor inválido');
  }
  try {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener proveedor' }));
      throw new Error(errorData.message || 'Error al obtener proveedor');
    }

    return await response.json();
  } catch (error) {
    console.error('Get supplier error:', error);
    throw error;
  }
};

export const createSupplier = async (supplierData) => {
  try {
    const response = await fetch(`${API_URL}/suppliers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(supplierData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear proveedor' }));
      throw new Error(errorData.message || 'Error al crear proveedor');
    }

    return await response.json();
  } catch (error) {
    console.error('Create supplier error:', error);
    throw error;
  }
};

export const updateSupplier = async (id, supplierData) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de proveedor inválido');
  }
  try {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(supplierData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar proveedor' }));
      throw new Error(errorData.message || 'Error al actualizar proveedor');
    }

    return await response.json();
  } catch (error) {
    console.error('Update supplier error:', error);
    throw error;
  }
};

export const deleteSupplier = async (id) => {
  if (!id || id === 'undefined' || id === 'null') {
    throw new Error('ID de proveedor inválido');
  }
  try {
    const response = await fetch(`${API_URL}/suppliers/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar proveedor' }));
      throw new Error(errorData.message || 'Error al eliminar proveedor');
    }

    return true;
  } catch (error) {
    console.error('Delete supplier error:', error);
    throw error;
  }
};

// ------------------------------------------------------------------ Códigos de proveedor (PV001, PV002…)

const readError = async (response, fallback) => {
  const errorData = await response.json().catch(() => ({}));
  return new Error(errorData.message || fallback);
};

/** El siguiente código libre, para proponerlo al crear un proveedor. */
export const getNextSupplierCode = async () => {
  const response = await fetch(`${API_URL}/suppliers/next-code`, { headers: getAuthHeader() });
  if (!response.ok) throw await readError(response, 'No se pudo obtener el siguiente código.');
  const data = await response.json();
  return data.code;
};

export const downloadSupplierCodesTemplate = async () => {
  const response = await fetch(`${API_URL}/suppliers/codes/template`, { headers: getAuthHeader() });
  if (!response.ok) throw await readError(response, 'No se pudo descargar la plantilla de códigos.');
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'codigos-proveedores.xlsx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/** Revisa el Excel de códigos del sistema anterior. No cambia nada. */
export const previewSupplierCodes = async (file) => {
  const form = new FormData();
  form.append('file', file);
  const response = await fetch(`${API_URL}/suppliers/codes/preview`, { method: 'POST', headers: getAuthHeader(), body: form });
  if (!response.ok) throw await readError(response, 'No se pudo leer el archivo de códigos.');
  return response.json();
};

/** items: [{ row, code, supplierId, create, name, nit, phone }] */
export const applySupplierCodes = async (items) => {
  const response = await fetch(`${API_URL}/suppliers/codes/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ items }),
  });
  if (!response.ok) throw await readError(response, 'No se pudieron aplicar los códigos.');
  return response.json();
};

/** «13», «pv13» o «PV-013» → «PV013». Cadena vacía si no es un código. */
export const normalizeSupplierCode = (raw) => {
  const match = String(raw || '').trim().toUpperCase().match(/^(?:PV)?\s*-?\s*(\d{1,6})$/);
  if (!match) return '';
  const n = parseInt(match[1], 10);
  return n > 0 ? `PV${String(n).padStart(3, '0')}` : '';
};
