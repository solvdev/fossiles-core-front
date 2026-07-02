import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const headers = () => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
});

const toQuery = (params) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.append(key, String(value));
    }
  });
  const raw = query.toString();
  return raw ? `?${raw}` : "";
};

const parseJson = async (response, fallbackMessage) => {
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }
  const errorData = await response.json().catch(() => ({ message: fallbackMessage }));
  throw new Error(errorData.message || fallbackMessage);
};

export const getKioskPosContext = async (kioskLocationId, filters = {}) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/context${toQuery({
      kioskLocationId,
      search: filters.search,
      categoryId: filters.categoryId,
      colorName: filters.colorName,
    })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el contexto POS del kiosko.");
};

export const createKioskPosSale = async (payload) => {
  const response = await fetch(`${API_URL}/kiosk-pos/sales`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo registrar la venta de kiosko.");
};

export const getKioskSaleById = async (saleId, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/sales/${saleId}${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el detalle de la venta.");
};

export const updateKioskSalePayment = async (saleId, payload, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/sales/${saleId}/payment${toQuery({ kioskLocationId })}`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(payload),
    }
  );
  return parseJson(response, "No se pudo actualizar la forma de pago.");
};

export const updateKioskSaleInvoiceContact = async (saleId, kioskLocationId, payload) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/sales/${saleId}/invoice-contact${toQuery({ kioskLocationId })}`,
    {
      method: "PATCH",
      headers: headers(),
      body: JSON.stringify(payload || {}),
    }
  );
  return parseJson(response, "No se pudo actualizar los datos de facturación.");
};

export const voidKioskSale = async (saleId, payload, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/sales/${saleId}/void${toQuery({ kioskLocationId })}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(payload),
    }
  );
  return parseJson(response, "No se pudo anular la venta.");
};

export const getMyKioskSales = async (startDate, endDate, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/sales/my-kiosk${toQuery({ startDate, endDate, kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el historial de ventas del kiosko.");
};

export const getMyKioskReport = async (startDate, endDate, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/reports/my-kiosk${toQuery({ startDate, endDate, kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el reporte del kiosko.");
};

export const getKioskManagerDashboard = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/dashboard/manager${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el resumen del kiosko.");
};

export const getGeneralKioskReport = async (startDate, endDate) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/reports/general${toQuery({ startDate, endDate })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el reporte general de kioskos.");
};

export const getCurrentCashSession = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/cash-session/current${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el estado de caja.");
};

export const openCashSession = async (kioskLocationId) => {
  const response = await fetch(`${API_URL}/kiosk-pos/cash-session/open`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ kioskLocationId: kioskLocationId ? Number(kioskLocationId) : null }),
  });
  return parseJson(response, "No se pudo abrir la caja.");
};

export const closeCashSession = async (sessionId, payload) => {
  const response = await fetch(`${API_URL}/kiosk-pos/cash-session/${sessionId}/close`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload || {}),
  });
  return parseJson(response, "No se pudo cerrar la caja.");
};

export const getKioskProductAvailability = async (productId, colorId, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/availability${toQuery({
      productId,
      colorId,
      includeCurrentKiosk: false,
      kioskLocationId,
    })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo consultar disponibilidad en otros kioskos.");
};

export const lookupTaxpayerByNit = async (taxId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/taxpayers/lookup${toQuery({ taxId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo consultar el NIT en FEL.");
};

/** @deprecated Use lookupTaxpayerByNit */
export const getKioskCustomerByTaxId = async (taxId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/customers/by-tax-id${toQuery({ taxId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo consultar datos de cliente por NIT.");
};

export const getKioskPromotions = async (activeOnly = true, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/promotions${toQuery({ activeOnly, kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudieron cargar las promociones.");
};

export const createKioskPromotion = async (payload) => {
  const response = await fetch(`${API_URL}/kiosk-pos/promotions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo crear la promoción.");
};

export const updateKioskPromotion = async (id, payload) => {
  const response = await fetch(`${API_URL}/kiosk-pos/promotions/${id}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo actualizar la promoción.");
};

export const registerDepositSlip = async (saleId, payload, kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/sales/${saleId}/deposit-slip${toQuery({ kioskLocationId })}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(payload),
    }
  );
  return parseJson(response, "No se pudo registrar la boleta de depósito.");
};

export const getPendingDepositSummary = async (kioskLocationId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/deposits/pending-summary${toQuery({ kioskLocationId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el resumen de depósitos pendientes.");
};
