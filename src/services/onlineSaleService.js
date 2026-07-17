/**
 * Servicio para gestión de ventas online
 */

import { getAuthHeader } from './authService';
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080/api';

const headers = () => ({
  'Content-Type': 'application/json',
  ...getAuthHeader()
});

// ─── CRUD ────────────────────────────────────────────────────────

export const createOnlineSale = async (data) => {
  const response = await fetch(`${API_URL}/online-sales`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al crear venta' }));
    throw new Error(err.message || 'Error al crear venta');
  }
  return response.json();
};

export const getAllOnlineSales = async () => {
  const response = await fetch(`${API_URL}/online-sales`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener ventas' }));
    throw new Error(err.message || 'Error al obtener ventas');
  }
  return response.json();
};

export const getOnlineSaleById = async (id) => {
  const response = await fetch(`${API_URL}/online-sales/${id}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener venta' }));
    throw new Error(err.message || 'Error al obtener venta');
  }
  return response.json();
};

export const updateOnlineSale = async (id, data) => {
  const response = await fetch(`${API_URL}/online-sales/${id}`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al actualizar venta' }));
    throw new Error(err.message || 'Error al actualizar venta');
  }
  return response.json();
};

export const deleteOnlineSale = async (id) => {
  const response = await fetch(`${API_URL}/online-sales/${id}`, {
    method: 'DELETE',
    headers: headers()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al eliminar venta' }));
    throw new Error(err.message || 'Error al eliminar venta');
  }
  return true;
};

// ─── Filtros ─────────────────────────────────────────────────────

export const getOnlineSalesByDate = async (date) => {
  const response = await fetch(`${API_URL}/online-sales/by-date?date=${date}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al filtrar ventas' }));
    throw new Error(err.message || 'Error al filtrar ventas');
  }
  return response.json();
};

export const getOnlineSalesBySalesperson = async (salesperson) => {
  const response = await fetch(`${API_URL}/online-sales/by-salesperson?salesperson=${encodeURIComponent(salesperson)}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al filtrar ventas' }));
    throw new Error(err.message || 'Error al filtrar ventas');
  }
  return response.json();
};

export const getOnlineSalesByDateAndSalesperson = async (date, salesperson) => {
  const response = await fetch(`${API_URL}/online-sales/by-date-and-salesperson?date=${date}&salesperson=${encodeURIComponent(salesperson)}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al filtrar ventas' }));
    throw new Error(err.message || 'Error al filtrar ventas');
  }
  return response.json();
};

export const getEligibleForProduction = async (startDate, endDate) => {
  let url = `${API_URL}/online-sales/eligible-for-production`;
  const params = new URLSearchParams();
  if (startDate) params.append('startDate', startDate);
  if (endDate) params.append('endDate', endDate);
  const query = params.toString();
  if (query) url += `?${query}`;

  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener ventas elegibles' }));
    throw new Error(err.message || 'Error al obtener ventas elegibles');
  }
  return response.json();
};

// ─── Rango de fechas (para resumen mensual) ─────────────────────

export const getOnlineSalesByDateRange = async (startDate, endDate) => {
  const response = await fetch(`${API_URL}/online-sales/by-date-range?startDate=${startDate}&endDate=${endDate}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener ventas del rango' }));
    throw new Error(err.message || 'Error al obtener ventas del rango');
  }
  return response.json();
};

// ─── Resumen ─────────────────────────────────────────────────────

/** Resumen agregado: un día (`startDate` solo) o rango inclusive (`startDate`–`endDate`). */
export const getDailySummary = async (startDate, endDate) => {
  const from = startDate || endDate;
  const to = endDate || startDate;
  const params = new URLSearchParams();
  if (from === to) {
    params.set("date", from);
  } else {
    params.set("startDate", from);
    params.set("endDate", to);
  }
  const response = await fetch(`${API_URL}/online-sales/daily-summary?${params.toString()}`, {
    headers: headers(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: "Error al obtener resumen" }));
    throw new Error(err.message || "Error al obtener resumen");
  }
  return response.json();
};

// ─── Producción ──────────────────────────────────────────────────

/**
 * Nuevo flujo: bodega PT revisa inventario primero.
 * - Ventas con stock → despachadas desde inventario (status PRODUCIDO)
 * - Ventas sin stock → se crean órdenes de producción
 * Retorna: { message, fulfilledFromInventory, productionOrdersCreated, fulfilledCount, productionCount, bodegaPtFound }
 */
export const processFulfillment = async (saleIds) => {
  const response = await fetch(`${API_URL}/online-sales/process-fulfillment`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ saleIds })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al procesar ventas' }));
    throw new Error(err.message || 'Error al procesar ventas');
  }
  return response.json();
};

/** Preview: revisa si cada venta se puede cumplir desde inventario de BODEGA_PT */
export const previewFulfillment = async (saleIds) => {
  const response = await fetch(`${API_URL}/online-sales/fulfillment-preview`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ saleIds })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al previsualizar inventario' }));
    throw new Error(err.message || 'Error al previsualizar inventario');
  }
  return response.json();
};

/**
 * Preview por item: stock por bodega (Devoluciones / BODEGA_PT) y accion sugerida.
 * Retorna: { saleId, saleNumber, customerName, overallStatus, items: [{...}] }
 */
export const getSaleItemsPreview = async (saleId) => {
  const response = await fetch(`${API_URL}/online-sales/${saleId}/items-preview`, {
    headers: headers()
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener preview de items' }));
    throw new Error(err.message || 'Error al obtener preview de items');
  }
  return response.json();
};

/**
 * Resuelve venta mixta: items DISPATCH se despachan, items PRODUCE se mueven a sub-pedido y crean OP.
 * items: [{ saleItemId, action: 'DISPATCH' | 'PRODUCE' }]
 */
export const resolveMixedSale = async (saleId, items) => {
  const response = await fetch(`${API_URL}/online-sales/${saleId}/resolve-mixed`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ items })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al resolver venta mixta' }));
    throw new Error(err.message || 'Error al resolver venta mixta');
  }
  return response.json();
};

/** Flujo legado: crea orden de producción directamente sin revisar inventario */
export const createProductionOrderFromSales = async (saleIds) => {
  const response = await fetch(`${API_URL}/online-sales/create-production-order`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ saleIds })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al crear orden de producción' }));
    throw new Error(err.message || 'Error al crear orden de producción');
  }
  return response.json();
};

// ─── Importación CSV ─────────────────────────────────────────────

export const importOnlineSales = async (sales) => {
  const response = await fetch(`${API_URL}/online-sales/import`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(sales)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al importar ventas' }));
    throw new Error(err.message || 'Error al importar ventas');
  }
  return response.json();
};

// ─── Constantes compartidas ──────────────────────────────────────

export const PAYMENT_METHODS = [
  { value: 'CONTRA_ENTREGA', label: 'Contra Entrega', shipping: 30 },
  { value: 'CONTRA_ENTREGA_DEPOSITO', label: 'Contra Entrega Depósito', shipping: 30 },
  // Pago web: siempre pagado (TARJETA_PAGADO). Visalink = transferencia/chat.
  { value: 'TARJETA_PAGADO', label: 'Tarjeta', shipping: 15 },
  { value: 'VISALINK_PAGADO', label: 'Visalink Pagado', shipping: 15 },
  { value: 'VISALINK_PENDIENTE', label: 'Visalink Pendiente', shipping: 15 },
  { value: 'DEPOSITO_LISTO', label: 'Depósito Listo', shipping: 15 },
  { value: 'DEPOSITO_PENDIENTE', label: 'Depósito Pendiente', shipping: 15 },
];

export const SALESPERSONS = [
  { value: 'Anthony Ixcajo', label: 'Anthony Ixcajo' },
  { value: 'Eduardo Ramirez', label: 'Eduardo Ramirez' },
  { value: 'Luisa Marquez', label: 'Luisa Marquez' },
];

export const SOCIAL_NETWORKS = [
  { value: 'WHATSAPP', label: 'WhatsApp', icon: '💬', color: '#25D366' },
  { value: 'FACEBOOK', label: 'Facebook', icon: '📘', color: '#1877F2' },
  { value: 'INSTAGRAM', label: 'Instagram', icon: '📷', color: '#E4405F' },
  { value: 'WEB', label: 'Página Web', icon: '🌐', color: '#555' },
];

export const SHIPPING_CARRIERS = [
  { value: 'FORZA_DELIVERY', label: 'FORZA DELIVERY' },
  { value: 'GUATEX', label: 'GUATEX' },
  { value: 'MOTORISTA', label: 'MOTORISTA' },
];

export const SALE_STATUSES = [
  { value: 'PENDIENTE', label: 'Pendiente', color: 'warning' },
  { value: 'EN_PRODUCCION', label: 'En Producción', color: 'info' },
  { value: 'PRODUCIDO', label: 'Producido', color: 'primary' },
  { value: 'ENVIADO', label: 'Enviado', color: 'secondary' },
  { value: 'ENTREGADO', label: 'Entregado', color: 'success' },
  { value: 'CANCELADO', label: 'Cancelado', color: 'danger' },
  { value: 'DEVOLUCION', label: 'Devolución', color: 'dark' },
  { value: 'ANULADA', label: 'Anulada', color: 'danger' },
];

// ─── Devolver / Anular venta ─────────────────────────────────────

export const returnOnlineSale = async (id, data) => {
  const response = await fetch(`${API_URL}/online-sales/${id}/return`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al devolver venta' }));
    throw new Error(err.message || 'Error al devolver venta');
  }
  return response.json();
};

export const voidOnlineSale = async (id, reason) => {
  const response = await fetch(`${API_URL}/online-sales/${id}/void`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ reason })
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al anular venta' }));
    throw new Error(err.message || 'Error al anular venta');
  }
  return response.json();
};

export const registerOnlineSaleShipment = async (id, data) => {
  const response = await fetch(`${API_URL}/online-sales/${id}/shipment`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(data || {})
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al registrar envio' }));
    throw new Error(err.message || 'Error al registrar envio');
  }
  return response.json();
};

// ─── Inventario de devoluciones ──────────────────────────────────

export const getReturnInventory = async (startDate, endDate) => {
  let url = `${API_URL}/online-sales/returns`;
  if (startDate && endDate) url += `?startDate=${startDate}&endDate=${endDate}`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener devoluciones' }));
    throw new Error(err.message || 'Error al obtener devoluciones');
  }
  return response.json();
};

export const getReturnEvents = async (startDate, endDate) => {
  let url = `${API_URL}/online-sales/return-events`;
  if (startDate && endDate) url += `?startDate=${startDate}&endDate=${endDate}`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener eventos de devolución' }));
    throw new Error(err.message || 'Error al obtener eventos de devolución');
  }
  return response.json();
};

export const getReturnForPrint = async (returnId) => {
  const response = await fetch(`${API_URL}/online-sales/returns/${returnId}`, { headers: headers() });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al obtener devolución para impresión' }));
    throw new Error(err.message || 'Error al obtener devolución para impresión');
  }
  return response.json();
};

export const createOnlineSaleExchange = async (onlineSaleId, data) => {
  const response = await fetch(`${API_URL}/online-sales/${onlineSaleId}/exchange`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(data || {})
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: 'Error al registrar cambio' }));
    throw new Error(err.message || 'Error al registrar cambio');
  }
  return response.json();
};
