import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

// ========== MINOR EXPENSES ==========

export const getMinorExpenses = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.startDate) params.append('startDate', filters.startDate);
    if (filters.endDate) params.append('endDate', filters.endDate);
    if (filters.supplier) params.append('supplier', filters.supplier);
    if (filters.purchaserName) params.append('purchaserName', filters.purchaserName);
    if (filters.reimbursementStatus) params.append('reimbursementStatus', filters.reimbursementStatus);
    if (filters.invoiceNumber) params.append('invoiceNumber', filters.invoiceNumber);
    if (filters.description) params.append('description', filters.description);
    if (filters.purchaseNumberId) params.append('purchaseNumberId', filters.purchaseNumberId);

    const url = `${API_URL}/minor-expenses${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener gastos menores' }));
      throw new Error(errorData.message || 'Error al obtener gastos menores');
    }

    return await response.json();
  } catch (error) {
    console.error('Get minor expenses error:', error);
    throw error;
  }
};

export const getMinorExpenseById = async (id) => {
  try {
    const response = await fetch(`${API_URL}/minor-expenses/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener gasto' }));
      throw new Error(errorData.message || 'Error al obtener gasto');
    }

    return await response.json();
  } catch (error) {
    console.error('Get minor expense error:', error);
    throw error;
  }
};

export const createMinorExpense = async (expenseData) => {
  try {
    const response = await fetch(`${API_URL}/minor-expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(expenseData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear gasto' }));
      throw new Error(errorData.message || 'Error al crear gasto');
    }

    return await response.json();
  } catch (error) {
    console.error('Create minor expense error:', error);
    throw error;
  }
};

export const updateMinorExpense = async (id, expenseData) => {
  try {
    const response = await fetch(`${API_URL}/minor-expenses/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(expenseData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar gasto' }));
      throw new Error(errorData.message || 'Error al actualizar gasto');
    }

    return await response.json();
  } catch (error) {
    console.error('Update minor expense error:', error);
    throw error;
  }
};

export const deleteMinorExpense = async (id) => {
  try {
    const response = await fetch(`${API_URL}/minor-expenses/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar gasto' }));
      throw new Error(errorData.message || 'Error al eliminar gasto');
    }

    return true;
  } catch (error) {
    console.error('Delete minor expense error:', error);
    throw error;
  }
};

// ========== REIMBURSEMENTS ==========

export const getPendingReimbursements = async () => {
  try {
    const response = await fetch(`${API_URL}/minor-expenses/reimbursements/pending`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener reembolsos pendientes' }));
      throw new Error(errorData.message || 'Error al obtener reembolsos pendientes');
    }

    return await response.json();
  } catch (error) {
    console.error('Get pending reimbursements error:', error);
    throw error;
  }
};

export const markReimbursementAsPaid = async (id, paymentDate = null, paymentMethod = null) => {
  try {
    const params = new URLSearchParams();
    if (paymentDate) params.append('paymentDate', paymentDate);
    if (paymentMethod) params.append('paymentMethod', paymentMethod);

    const url = `${API_URL}/minor-expenses/reimbursements/${id}/mark-paid${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al marcar reembolso como pagado' }));
      throw new Error(errorData.message || 'Error al marcar reembolso como pagado');
    }

    return await response.json();
  } catch (error) {
    console.error('Mark reimbursement as paid error:', error);
    throw error;
  }
};

export const getReimbursementHistory = async (personId) => {
  try {
    const response = await fetch(`${API_URL}/minor-expenses/reimbursements/history/${personId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener historial de reembolsos' }));
      throw new Error(errorData.message || 'Error al obtener historial de reembolsos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get reimbursement history error:', error);
    throw error;
  }
};

// ========== SUMMARY ==========

export const getMinorExpenseSummary = async (startDate = null, endDate = null) => {
  try {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const url = `${API_URL}/minor-expenses/summary${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener resumen' }));
      throw new Error(errorData.message || 'Error al obtener resumen');
    }

    return await response.json();
  } catch (error) {
    console.error('Get minor expense summary error:', error);
    throw error;
  }
};

// ========== FILE UPLOAD ==========

export const uploadInvoiceFile = async (expenseId, file) => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/minor-expenses/${expenseId}/upload-invoice`, {
      method: 'POST',
      headers: {
        ...getAuthHeader()
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al subir archivo' }));
      throw new Error(errorData.message || 'Error al subir archivo');
    }

    return await response.json();
  } catch (error) {
    console.error('Upload invoice file error:', error);
    throw error;
  }
};

// ========== PURCHASE NUMBERS ==========

export const getAvailablePurchaseNumbers = async () => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/available`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener números de compra' }));
      throw new Error(errorData.message || 'Error al obtener números de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Get available purchase numbers error:', error);
    throw error;
  }
};

export const getAllPurchaseNumbers = async () => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener números de compra' }));
      throw new Error(errorData.message || 'Error al obtener números de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Get all purchase numbers error:', error);
    throw error;
  }
};

export const createPurchaseNumber = async (purchaseNumberData) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(purchaseNumberData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear número de compra' }));
      throw new Error(errorData.message || 'Error al crear número de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Create purchase number error:', error);
    throw error;
  }
};

export const getPurchaseNumberById = async (id) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener número de compra' }));
      throw new Error(errorData.message || 'Error al obtener número de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Get purchase number error:', error);
    throw error;
  }
};

export const updatePurchaseNumber = async (id, purchaseNumberData) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(purchaseNumberData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar número de compra' }));
      throw new Error(errorData.message || 'Error al actualizar número de compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Update purchase number error:', error);
    throw error;
  }
};

export const getPurchaseNumberExpenses = async (purchaseNumberId) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/${purchaseNumberId}/expenses`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener gastos de la compra' }));
      throw new Error(errorData.message || 'Error al obtener gastos de la compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Get purchase number expenses error:', error);
    throw error;
  }
};

// ========== PURCHASE NUMBER ITEMS ==========

export const getPurchaseNumberItems = async (purchaseNumberId) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/${purchaseNumberId}/items`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener artículos de la compra' }));
      throw new Error(errorData.message || 'Error al obtener artículos de la compra');
    }

    return await response.json();
  } catch (error) {
    console.error('Get purchase number items error:', error);
    throw error;
  }
};

export const createPurchaseNumberItem = async (purchaseNumberId, itemData) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/${purchaseNumberId}/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(itemData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear artículo' }));
      throw new Error(errorData.message || 'Error al crear artículo');
    }

    return await response.json();
  } catch (error) {
    console.error('Create purchase number item error:', error);
    throw error;
  }
};

export const updatePurchaseNumberItem = async (purchaseNumberId, itemId, itemData) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/${purchaseNumberId}/items/${itemId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(itemData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar artículo' }));
      throw new Error(errorData.message || 'Error al actualizar artículo');
    }

    return await response.json();
  } catch (error) {
    console.error('Update purchase number item error:', error);
    throw error;
  }
};

export const deletePurchaseNumberItem = async (purchaseNumberId, itemId) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/${purchaseNumberId}/items/${itemId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar artículo' }));
      throw new Error(errorData.message || 'Error al eliminar artículo');
    }

    return true;
  } catch (error) {
    console.error('Delete purchase number item error:', error);
    throw error;
  }
};

export const getPurchaseNumberItemById = async (purchaseNumberId, itemId) => {
  try {
    const response = await fetch(`${API_URL}/purchase-numbers/${purchaseNumberId}/items/${itemId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener artículo' }));
      throw new Error(errorData.message || 'Error al obtener artículo');
    }

    return await response.json();
  } catch (error) {
    console.error('Get purchase number item error:', error);
    throw error;
  }
};

// ========== COMPENSACIONES ==========

export const getCompensationsByPurchase = async (purchaseId) => {
  try {
    const response = await fetch(`${API_URL}/purchase-compensations/by-purchase/${purchaseId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener compensaciones' }));
      throw new Error(errorData.message || 'Error al obtener compensaciones');
    }
    return await response.json();
  } catch (error) {
    console.error('Get compensations error:', error);
    throw error;
  }
};

export const createCompensation = async (data) => {
  try {
    const response = await fetch(`${API_URL}/purchase-compensations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear compensación' }));
      throw new Error(errorData.message || 'Error al crear compensación');
    }
    return await response.json();
  } catch (error) {
    console.error('Create compensation error:', error);
    throw error;
  }
};

export const deleteCompensation = async (id) => {
  try {
    const response = await fetch(`${API_URL}/purchase-compensations/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar compensación' }));
      throw new Error(errorData.message || 'Error al eliminar compensación');
    }
    return true;
  } catch (error) {
    console.error('Delete compensation error:', error);
    throw error;
  }
};

export const getAvailableSurplus = async (purchaseId) => {
  try {
    const response = await fetch(`${API_URL}/purchase-compensations/available-surplus/${purchaseId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener sobrante' }));
      throw new Error(errorData.message || 'Error al obtener sobrante');
    }
    return await response.json();
  } catch (error) {
    console.error('Get available surplus error:', error);
    throw error;
  }
};

