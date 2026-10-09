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

/**
 * Dashboard de ventas por fuente. Todos aceptan `refresh` (true = omite/invalida la caché de 60 s del backend)
 * y `signal` (AbortSignal) para cancelar la petición. `siteId` (solo kioskos) = id del sitio de Finanzas kioscos.
 */
const getDashboardSource = async (path, params, fallbackMessage) => {
  const { startDate, endDate, siteId, refresh, signal } = params || {};
  const response = await fetch(
    `${API_URL}/sales/dashboard/${path}${toQuery({
      startDate,
      endDate,
      siteId,
      refresh: refresh ? "true" : undefined,
    })}`,
    { headers: headers(), signal }
  );
  return parseJson(response, fallbackMessage);
};

export const getSalesConsolidated = ({ startDate, endDate, refresh, signal } = {}) =>
  getDashboardSource(
    "consolidated",
    { startDate, endDate, refresh, signal },
    "No se pudo cargar el consolidado de ventas."
  );

export const getSalesKiosks = ({ startDate, endDate, siteId, refresh, signal } = {}) =>
  getDashboardSource(
    "kiosks",
    { startDate, endDate, siteId, refresh, signal },
    "No se pudo cargar las ventas de kioskos."
  );

export const getSalesOnline = ({ startDate, endDate, refresh, signal } = {}) =>
  getDashboardSource("online", { startDate, endDate, refresh, signal }, "No se pudo cargar las ventas online.");

export const getSalesVendor = ({ startDate, endDate, refresh, signal } = {}) =>
  getDashboardSource(
    "vendor",
    { startDate, endDate, refresh, signal },
    "No se pudo cargar las ventas de Vendedor LF."
  );

export const getUnifiedSales = async ({ startDate, endDate, channel, kioskLocationId, limit } = {}) => {
  const response = await fetch(
    `${API_URL}/sales/unified${toQuery({ startDate, endDate, channel, kioskLocationId, limit })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudieron cargar las ventas.");
};

export const getOpvShipments = async ({
  search,
  orderStatus,
  shipmentStatus,
  customerId,
  from,
  to,
  hasShipment,
  limit = 300,
} = {}) => {
  const response = await fetch(
    `${API_URL}/sales/opv-shipments${toQuery({
      search,
      orderStatus,
      shipmentStatus,
      customerId,
      from,
      to,
      hasShipment,
      limit,
    })}`,
    { headers: headers() }
  );
  return parseJson(response, "No se pudo cargar envíos OPV.");
};
