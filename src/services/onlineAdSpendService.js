import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
const BASE = `${API_URL}/sales/online/ad-spend`;

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

/** 2xx -> JSON (204 -> null). Si falla, lanza Error con el mensaje en español del backend (BusinessException). */
const parseJson = async (response, fallbackMessage) => {
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }
  const errorData = await response.json().catch(() => ({}));
  if (errorData && errorData.message) throw new Error(errorData.message);
  if (response.status === 403) throw new Error("No tienes permiso para registrar la inversión en publicidad.");
  throw new Error(fallbackMessage);
};

/** Los cortes de red llegan como TypeError ('Failed to fetch'): se traducen; AbortError se deja pasar. */
const request = async (url, options, fallbackMessage) => {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error && error.name === "AbortError") throw error;
    throw new Error("No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.");
  }
  return parseJson(response, fallbackMessage);
};

/**
 * Inversión diaria en publicidad vs venta online. Contrato: docs/SALES-DASHBOARD-CONTRACT.md (addendum).
 * Un solo monto por día (todas las plataformas). El reporte no se cachea en el backend.
 */

/** GET /sales/online/ad-spend/report?startDate&endDate -> { startDate, endDate, totals, days[] } (máx. 400 días). */
export const getAdSpendReport = ({ startDate, endDate, signal } = {}) =>
  request(
    `${BASE}/report${toQuery({ startDate, endDate })}`,
    { headers: headers(), signal },
    "No se pudo cargar el reporte de publicidad vs ventas."
  );

/** PUT /sales/online/ad-spend/{date} body { amount, notes } -> AdSpendEntry (crea o actualiza ese día). */
export const saveAdSpend = (date, { amount, notes } = {}) =>
  request(
    `${BASE}/${encodeURIComponent(date)}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({ amount, notes: notes || null }),
    },
    "No se pudo guardar la inversión en publicidad."
  );

/** DELETE /sales/online/ad-spend/{date} -> 204 (borra la captura de ese día; si no existe, 204 igual). */
export const deleteAdSpend = (date) =>
  request(
    `${BASE}/${encodeURIComponent(date)}`,
    { method: "DELETE", headers: headers() },
    "No se pudo borrar la inversión en publicidad."
  );

/**
 * POST /sales/online/ad-spend/bulk body { entries: [{ date, amount, notes? }] } -> { saved, deleted }.
 * amount: null borra la captura de ese día. Máx. 400 entradas, fechas únicas, todo o nada.
 */
export const bulkSaveAdSpend = (entries) =>
  request(
    `${BASE}/bulk`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        entries: (entries || []).map((entry) =>
          entry.amount === null || entry.amount === undefined
            ? { date: entry.date, amount: null }
            : { date: entry.date, amount: entry.amount, notes: entry.notes || null }
        ),
      }),
    },
    "No se pudieron guardar los cambios de inversión."
  );
