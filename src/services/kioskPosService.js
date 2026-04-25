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

export const getKioskPosContext = async (kioskLocationId) => {
  const response = await fetch(`${API_URL}/kiosk-pos/context${toQuery({ kioskLocationId })}`, {
    headers: headers(),
  });
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

export const getGeneralKioskReport = async (startDate, endDate) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/reports/general${toQuery({ startDate, endDate })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar el reporte general de kioskos.");
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

export const getKioskCustomerByTaxId = async (taxId) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/customers/by-tax-id${toQuery({ taxId })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo consultar datos de cliente por NIT.");
};

export const getKioskPromotions = async (activeOnly = true) => {
  const response = await fetch(
    `${API_URL}/kiosk-pos/promotions${toQuery({ activeOnly })}`,
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
