import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getAccountingEntriesByDocument = async (documentType, documentId) => {
  try {
    const response = await fetch(`${API_URL}/accounting-entries/document/${documentType}/${documentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener asientos contables' }));
      throw new Error(errorData.message || 'Error al obtener asientos contables');
    }

    return await response.json();
  } catch (error) {
    console.error('Get accounting entries by document error:', error);
    throw error;
  }
};

export const getAccountingEntriesByDocumentType = async (documentType) => {
  try {
    const response = await fetch(`${API_URL}/accounting-entries/document-type/${documentType}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener asientos contables' }));
      throw new Error(errorData.message || 'Error al obtener asientos contables');
    }

    return await response.json();
  } catch (error) {
    console.error('Get accounting entries by document type error:', error);
    throw error;
  }
};

export const getAccountingEntriesByAccount = async (accountCode) => {
  try {
    const response = await fetch(`${API_URL}/accounting-entries/account/${accountCode}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener asientos contables' }));
      throw new Error(errorData.message || 'Error al obtener asientos contables');
    }

    return await response.json();
  } catch (error) {
    console.error('Get accounting entries by account error:', error);
    throw error;
  }
};

export const getAccountingEntriesByDateRange = async (startDate, endDate) => {
  try {
    const start = startDate instanceof Date ? startDate.toISOString() : startDate;
    const end = endDate instanceof Date ? endDate.toISOString() : endDate;
    
    const response = await fetch(`${API_URL}/accounting-entries/date-range?startDate=${start}&endDate=${end}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener asientos contables' }));
      throw new Error(errorData.message || 'Error al obtener asientos contables');
    }

    return await response.json();
  } catch (error) {
    console.error('Get accounting entries by date range error:', error);
    throw error;
  }
};

export const getAllAccountingEntries = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.documentType) params.append('documentType', filters.documentType);
    if (filters.accountCode) params.append('accountCode', filters.accountCode);
    if (filters.startDate) params.append('startDate', filters.startDate instanceof Date ? filters.startDate.toISOString() : filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate instanceof Date ? filters.endDate.toISOString() : filters.endDate);

    const url = `${API_URL}/accounting-entries${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener asientos contables' }));
      throw new Error(errorData.message || 'Error al obtener asientos contables');
    }

    return await response.json();
  } catch (error) {
    console.error('Get all accounting entries error:', error);
    throw error;
  }
};

