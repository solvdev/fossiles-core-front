import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getOrdersByStatusReport = async (startDate, endDate) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await fetch(`${API_URL}/purchase-reports/orders-by-status?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener reporte' }));
      throw new Error(errorData.message || 'Error al obtener reporte');
    }

    return await response.json();
  } catch (error) {
    console.error('Get orders by status report error:', error);
    throw error;
  }
};

export const getPurchasesBySupplierReport = async (startDate, endDate) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await fetch(`${API_URL}/purchase-reports/purchases-by-supplier?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener reporte' }));
      throw new Error(errorData.message || 'Error al obtener reporte');
    }

    return await response.json();
  } catch (error) {
    console.error('Get purchases by supplier report error:', error);
    throw error;
  }
};

export const getCurrentInventoryReport = async () => {
  try {
    const response = await fetch(`${API_URL}/purchase-reports/current-inventory`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener reporte' }));
      throw new Error(errorData.message || 'Error al obtener reporte');
    }

    return await response.json();
  } catch (error) {
    console.error('Get current inventory report error:', error);
    throw error;
  }
};

export const getCriticalMaterialsReport = async () => {
  try {
    const response = await fetch(`${API_URL}/purchase-reports/critical-materials`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener reporte' }));
      throw new Error(errorData.message || 'Error al obtener reporte');
    }

    return await response.json();
  } catch (error) {
    console.error('Get critical materials report error:', error);
    throw error;
  }
};

export const getAccountingEntriesReport = async (startDate, endDate, documentType) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (documentType) params.append('documentType', documentType);
    
    const response = await fetch(`${API_URL}/purchase-reports/accounting-entries?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener reporte' }));
      throw new Error(errorData.message || 'Error al obtener reporte');
    }

    return await response.json();
  } catch (error) {
    console.error('Get accounting entries report error:', error);
    throw error;
  }
};

export const getExecutiveDashboard = async (startDate, endDate) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const response = await fetch(`${API_URL}/purchase-reports/executive-dashboard?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener dashboard' }));
      throw new Error(errorData.message || 'Error al obtener dashboard');
    }

    return await response.json();
  } catch (error) {
    console.error('Get executive dashboard error:', error);
    throw error;
  }
};

export const getProductAverageCostsReport = async () => {
  try {
    const response = await fetch(`${API_URL}/purchase-reports/product-average-costs`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener reporte de costos' }));
      throw new Error(errorData.message || 'Error al obtener reporte de costos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get product average costs report error:', error);
    throw error;
  }
};

