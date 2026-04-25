/**
 * Servicio para gestión de configuraciones del sistema
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

export const getSystemConfigs = async () => {
  try {
    const response = await fetch(`${API_URL}/system-config`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener configuraciones' }));
      throw new Error(errorData.message || 'Error al obtener configuraciones');
    }

    return await response.json();
  } catch (error) {
    console.error('Get system configs error:', error);
    throw error;
  }
};

export const getSystemConfigByKey = async (key) => {
  if (!key || key === 'undefined' || key === 'null') {
    throw new Error('Key de configuración inválida');
  }
  try {
    const response = await fetch(`${API_URL}/system-config/${key}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener configuración' }));
      throw new Error(errorData.message || 'Error al obtener configuración');
    }

    return await response.json();
  } catch (error) {
    console.error('Get system config error:', error);
    throw error;
  }
};

export const getProfitMargin = async () => {
  try {
    const config = await getSystemConfigByKey('PROFIT_MARGIN_PERCENTAGE');
    if (!config || !config.configValue) {
      return 50; // Valor por defecto: 50%
    }
    return parseFloat(config.configValue);
  } catch (error) {
    console.error('Get profit margin error:', error);
    return 50; // Valor por defecto en caso de error
  }
};

export const getManufacturingHourlyCost = async () => {
  try {
    // Calcular costo por hora basado en planilla y horas disponibles
    const payrollConfig = await getSystemConfigByKey('MANUFACTURING_TOTAL_PAYROLL');
    const hoursConfig = await getSystemConfigByKey('MANUFACTURING_AVAILABLE_HOURS');
    
    if (!payrollConfig || !payrollConfig.configValue || !hoursConfig || !hoursConfig.configValue) {
      return 50; // Valor por defecto si no está configurado
    }
    
    const totalPayroll = parseFloat(payrollConfig.configValue);
    const availableHours = parseFloat(hoursConfig.configValue);
    
    if (availableHours <= 0) {
      return 50; // Evitar división por cero
    }
    
    return totalPayroll / availableHours;
  } catch (error) {
    console.error('Get manufacturing hourly cost error:', error);
    return 50; // Valor por defecto en caso de error
  }
};

export const getManufacturingPayroll = async () => {
  try {
    const config = await getSystemConfigByKey('MANUFACTURING_TOTAL_PAYROLL');
    if (!config || !config.configValue) {
      return 0;
    }
    return parseFloat(config.configValue);
  } catch (error) {
    console.error('Get manufacturing payroll error:', error);
    return 0;
  }
};

export const getManufacturingAvailableHours = async () => {
  try {
    const config = await getSystemConfigByKey('MANUFACTURING_AVAILABLE_HOURS');
    if (!config || !config.configValue) {
      return 0;
    }
    return parseFloat(config.configValue);
  } catch (error) {
    console.error('Get manufacturing available hours error:', error);
    return 0;
  }
};

export const getManufacturingNumberOfTables = async () => {
  try {
    const config = await getSystemConfigByKey('MANUFACTURING_NUMBER_OF_TABLES');
    if (!config || !config.configValue) {
      return 12; // Valor por defecto: 12 mesas
    }
    return parseInt(config.configValue, 10);
  } catch (error) {
    console.error('Get manufacturing number of tables error:', error);
    return 12; // Valor por defecto en caso de error
  }
};

export const updateSystemConfig = async (key, configData) => {
  if (!key || key === 'undefined' || key === 'null') {
    throw new Error('Key de configuración inválida');
  }
  try {
    const response = await fetch(`${API_URL}/system-config/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(configData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al actualizar configuración' }));
      throw new Error(errorData.message || 'Error al actualizar configuración');
    }

    return await response.json();
  } catch (error) {
    console.error('Update system config error:', error);
    throw error;
  }
};

export const createSystemConfig = async (configData) => {
  try {
    const response = await fetch(`${API_URL}/system-config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(configData)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al crear configuración' }));
      throw new Error(errorData.message || 'Error al crear configuración');
    }

    return await response.json();
  } catch (error) {
    console.error('Create system config error:', error);
    throw error;
  }
};

export const deleteSystemConfig = async (key) => {
  if (!key || key === 'undefined' || key === 'null') {
    throw new Error('Key de configuración inválida');
  }
  try {
    const response = await fetch(`${API_URL}/system-config/${key}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al eliminar configuración' }));
      throw new Error(errorData.message || 'Error al eliminar configuración');
    }

    return true;
  } catch (error) {
    console.error('Delete system config error:', error);
    throw error;
  }
};

export const calculateManufacturingCosts = async (config) => {
  try {
    const response = await fetch(`${API_URL}/system-config/manufacturing/calculate-costs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({
        payrollCinchos: config.payrollCinchos,
        payrollMesas: config.payrollMesas,
        payrollWarehouse: config.payrollWarehouse,
        minutesCinchos: config.minutesCinchos,
        minutesMesas: config.minutesMesas,
        numberOfTablesMesas: config.numberOfTablesMesas
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al calcular costos' }));
      throw new Error(errorData.message || 'Error al calcular costos');
    }

    return await response.json();
  } catch (error) {
    console.error('Calculate manufacturing costs error:', error);
    throw error;
  }
};

export const saveManufacturingConfig = async (config) => {
  try {
    const response = await fetch(`${API_URL}/system-config/manufacturing/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({
        payrollCinchos: config.payrollCinchos,
        payrollMesas: config.payrollMesas,
        payrollWarehouse: config.payrollWarehouse,
        minutesCinchos: config.minutesCinchos,
        minutesMesas: config.minutesMesas,
        numberOfTablesMesas: config.numberOfTablesMesas
      })
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => 'Error al guardar configuración');
      throw new Error(errorData || 'Error al guardar configuración');
    }

    return await response.text();
  } catch (error) {
    console.error('Save manufacturing config error:', error);
    throw error;
  }
};

export const getCurrentManufacturingCosts = async () => {
  try {
    const response = await fetch(`${API_URL}/system-config/manufacturing/current-costs`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Error al obtener costos' }));
      throw new Error(errorData.message || 'Error al obtener costos');
    }

    return await response.json();
  } catch (error) {
    console.error('Get current manufacturing costs error:', error);
    throw error;
  }
};

