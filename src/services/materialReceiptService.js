import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getMaterialReceipts = async () => {
  try {
    const response = await fetch(`${API_URL}/material-receipts`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener recepciones de materiales' }));
      throw new Error(errorData.message || 'Error al obtener recepciones de materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material receipts error:', error);
    throw error;
  }
};

export const createMaterialReceipt = async (receiptData) => {
  try {
    const response = await fetch(`${API_URL}/material-receipts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(receiptData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear recepción de materiales' }));
      throw new Error(errorData.message || 'Error al crear recepción de materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Create material receipt error:', error);
    throw error;
  }
};

export const updateMaterialReceipt = async (receiptId, receiptData) => {
  try {
    const response = await fetch(`${API_URL}/material-receipts/${receiptId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(receiptData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar recepción de materiales' }));
      throw new Error(errorData.message || 'Error al actualizar recepción de materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Update material receipt error:', error);
    throw error;
  }
};

