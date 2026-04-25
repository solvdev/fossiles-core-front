import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getMaterialRequests = async (status = null) => {
  try {
    const url = status 
      ? `${API_URL}/material-requests?status=${status}`
      : `${API_URL}/material-requests`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener solicitudes de materiales' }));
      throw new Error(errorData.message || 'Error al obtener solicitudes de materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material requests error:', error);
    throw error;
  }
};

export const createMaterialRequest = async (requestData) => {
  try {
    const response = await fetch(`${API_URL}/material-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear solicitud de materiales' }));
      throw new Error(errorData.message || 'Error al crear solicitud de materiales');
    }

    return await response.json();
  } catch (error) {
    console.error('Create material request error:', error);
    throw error;
  }
};

export const approveMaterialRequest = async (id, approvedBy = null) => {
  try {
    const url = approvedBy 
      ? `${API_URL}/material-requests/${id}/approve?approvedBy=${approvedBy}`
      : `${API_URL}/material-requests/${id}/approve`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al aprobar solicitud' }));
      throw new Error(errorData.message || 'Error al aprobar solicitud');
    }

    return await response.json();
  } catch (error) {
    console.error('Approve material request error:', error);
    throw error;
  }
};

export const rejectMaterialRequest = async (id, rejectedBy = null, rejectionReason = null) => {
  try {
    let url = `${API_URL}/material-requests/${id}/reject`;
    const params = new URLSearchParams();
    if (rejectedBy) params.append('rejectedBy', rejectedBy);
    if (rejectionReason) params.append('rejectionReason', rejectionReason);
    if (params.toString()) url += '?' + params.toString();
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al rechazar solicitud' }));
      throw new Error(errorData.message || 'Error al rechazar solicitud');
    }

    return await response.json();
  } catch (error) {
    console.error('Reject material request error:', error);
    throw error;
  }
};

export const addReviewComments = async (id, reviewComments) => {
  try {
    const response = await fetch(`${API_URL}/material-requests/${id}/review-comments`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ reviewComments })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al agregar comentarios' }));
      throw new Error(errorData.message || 'Error al agregar comentarios');
    }

    return await response.json();
  } catch (error) {
    console.error('Add review comments error:', error);
    throw error;
  }
};

export const getMaterialRequestById = async (id) => {
  try {
    const response = await fetch(`${API_URL}/material-requests/${id}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener solicitud' }));
      throw new Error(errorData.message || 'Error al obtener solicitud');
    }

    return await response.json();
  } catch (error) {
    console.error('Get material request error:', error);
    throw error;
  }
};

export const updateMaterialRequest = async (id, requestData) => {
  try {
    const response = await fetch(`${API_URL}/material-requests/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(requestData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar solicitud' }));
      throw new Error(errorData.message || 'Error al actualizar solicitud');
    }

    return await response.json();
  } catch (error) {
    console.error('Update material request error:', error);
    throw error;
  }
};

export const deleteMaterialRequest = async (id) => {
  try {
    const response = await fetch(`${API_URL}/material-requests/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar solicitud' }));
      throw new Error(errorData.message || 'Error al eliminar solicitud');
    }

    return true;
  } catch (error) {
    console.error('Delete material request error:', error);
    throw error;
  }
};

