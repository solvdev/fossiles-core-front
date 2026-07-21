import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

async function apiRequest(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const detail = errorData.message || errorData.error || errorData.detail;
    throw new Error(detail || `Error en inventario kiosko (${response.status})`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export const getKioscoStock = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/stock`);

export const getKioscoMovimientos = async (locationId, filters = {}) => {
  const params = new URLSearchParams();
  if (filters.productId) params.append("productId", String(filters.productId));
  if (filters.colorId) params.append("colorId", String(filters.colorId));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/kiosco-inventory/${locationId}/movimientos${suffix}`);
};

export const getKioscoStockBajo = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/stock-bajo`);

export const getKioscoConsolidado = async () =>
  apiRequest(`/kiosco-inventory/reporte/consolidado`);

export const startKioscoConteo = async (locationId, from, to) => {
  const params = new URLSearchParams({ from, to });
  return apiRequest(`/kiosco-inventory/${locationId}/conteo-fisico?${params.toString()}`, { method: "POST" });
};

export const getKioscoConteoReport = async (countId, { asOf } = {}) => {
  const params = new URLSearchParams();
  if (asOf) params.set("asOf", asOf);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/kiosco-inventory/conteo-fisico/${countId}${suffix}`);
};

export const getKioscoSubconteo = async (countId, asOf) =>
  getKioscoConteoReport(countId, { asOf });

export const saveKioscoConteoItems = async (countId, items) =>
  apiRequest(`/kiosco-inventory/conteo-fisico/${countId}/items`, { method: "PUT", body: items });

export const pollKioscoConteoLiveSession = async (countId, since) => {
  const params = new URLSearchParams();
  if (since) params.set("since", since);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/kiosco-inventory/conteo-fisico/${countId}/live-session${suffix}`, { method: "POST" });
};

export const terminarKioscoConteo = async (countId) =>
  apiRequest(`/kiosco-inventory/conteo-fisico/${countId}/terminar`, { method: "POST" });

export const revisarKioscoConteo = async (countId, notes) =>
  apiRequest(`/kiosco-inventory/conteo-fisico/${countId}/revisar`, { method: "POST", body: { notes } });

export const getKioscoConteoHistorial = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/conteo-fisico/historial`);

export const cerrarKioscoConteo = async (countId) =>
  apiRequest(`/kiosco-inventory/conteo-fisico/${countId}/cerrar`, { method: "POST" });

export const getKioscoConteoAlertas = async (locationId) => {
  const params = new URLSearchParams();
  if (locationId) params.append("locationId", String(locationId));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/kiosco-inventory/conteo-fisico/alertas${suffix}`);
};

export const getKioscoNotificationRecipients = async () =>
  apiRequest(`/kiosco-inventory/notificacion-destinatarios`);

export const addKioscoNotificationRecipient = async (payload) =>
  apiRequest(`/kiosco-inventory/notificacion-destinatarios`, { method: "POST", body: payload });

export const removeKioscoNotificationRecipient = async (recipientId) =>
  apiRequest(`/kiosco-inventory/notificacion-destinatarios/${recipientId}`, { method: "DELETE" });

export const registrarKioscoEntrada = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/entrada`, { method: "POST", body: payload });

export const registrarKioscoVenta = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/venta`, { method: "POST", body: payload });

export const registrarKioscoDevolucionDeposito = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/devolucion-deposito`, { method: "POST", body: payload });

export const registrarKioscoDevolucionCliente = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/devolucion-cliente`, { method: "POST", body: payload });

export const registrarKioscoTraslado = async (payload) =>
  apiRequest(`/kiosco-inventory/traslado`, { method: "POST", body: payload });

export const lookupKioscoTrasladoBoleta = async (number) =>
  apiRequest(`/kiosco-inventory/traslado/boleta?number=${encodeURIComponent(String(number || "").trim())}`);

export const registrarKioscoMerma = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/merma`, { method: "POST", body: payload });

export const registrarKioscoAjuste = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/ajuste`, { method: "POST", body: payload });

export const registrarKioscoAnulacion = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/anular-factura`, { method: "POST", body: payload });

export const registrarKioscoCambio = async (locationId, payload) =>
  apiRequest(`/kiosco-inventory/${locationId}/cambio`, { method: "POST", body: payload });

export const initializeKioscoInventory = async (locationId = null, userId = null) => {
  const params = new URLSearchParams();
  if (locationId) {
    params.append("locationId", String(locationId));
  }
  if (userId) {
    params.append("userId", String(userId));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest(`/kiosco-inventory/initialize${suffix}`, { method: "POST" });
};

export const reconcileKioscoShipmentEntries = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/reconcile-shipment-entries`, { method: "POST" });

export const previewKioscoShipmentEntriesReconcile = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/reconcile-shipment-entries/preview`);

export const getKioscoOpeningInventoryStatus = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/inventario-inicial/estado`);

export const startKioscoOpeningInventory = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/inventario-inicial`, { method: "POST" });

export const getKioscoOpeningInventory = async (openingInventoryId) =>
  apiRequest(`/kiosco-inventory/inventario-inicial/${openingInventoryId}`);

export const saveKioscoOpeningInventoryItems = async (openingInventoryId, items) =>
  apiRequest(`/kiosco-inventory/inventario-inicial/${openingInventoryId}/items`, {
    method: "PUT",
    body: items,
  });

export const applyKioscoOpeningInventory = async (openingInventoryId, payload = {}) =>
  apiRequest(`/kiosco-inventory/inventario-inicial/${openingInventoryId}/aplicar`, {
    method: "POST",
    body: payload,
  });

export const getKioscoOpeningInventoryHistorial = async (locationId) =>
  apiRequest(`/kiosco-inventory/${locationId}/inventario-inicial/historial`);
