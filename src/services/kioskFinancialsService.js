import { getAuthHeader } from "./authService";

/**
 * Finanzas por kiosco. Contrato: fossiles-core-back/docs/KIOSK-FINANCIALS-CONTRACT.md
 * Base: /api/kiosk-financials. JSON camelCase. Porcentajes como decimales (0.18 = 18 %).
 * Cada función es una llamada fetch independiente: se puede mockear con jest.mock del módulo.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
const BASE = `${API_URL}/kiosk-financials`;

const jsonHeaders = () => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
});

// Multipart: el navegador fija el Content-Type con el boundary.
const authOnlyHeaders = () => ({ ...getAuthHeader() });

const toQuery = (params) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const v = Array.isArray(value) ? value.join(",") : String(value);
    if (v.trim() !== "") query.append(key, v);
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

/* ------------------------------ Sitios ------------------------------ */

export const getKioskSites = async () => {
  const response = await fetch(`${BASE}/sites`, { headers: jsonHeaders() });
  return parseJson(response, "No se pudieron cargar los sitios.");
};

/** body: { name, status?, closedOn? } -> crea sitio histórico (locationId null). */
export const createKioskSite = async (body) => {
  const response = await fetch(`${BASE}/sites`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(response, "No se pudo crear el sitio.");
};

/**
 * body: { name?, status?, closedOn?, posGoLiveOverride?, clearGoLiveOverride?, aliases? }
 * Para limpiar el override enviar { clearGoLiveOverride: true }.
 */
export const updateKioskSite = async (id, body) => {
  const response = await fetch(`${BASE}/sites/${id}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(response, "No se pudo actualizar el sitio.");
};

/* --------------------------- Configuración --------------------------- */

export const getKioskConfig = async ({ year, siteId, month } = {}) => {
  const response = await fetch(`${BASE}/config${toQuery({ year, siteId, month })}`, {
    headers: jsonHeaders(),
  });
  return parseJson(response, "No se pudo cargar la configuración de costos.");
};

/** payload: { year, changes: [{ siteId, month, goal?, productCostPct?, ..., costs?: {CODE: n|null} }] } */
export const saveKioskConfigBulk = async (payload) => {
  const response = await fetch(`${BASE}/config/bulk`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudieron guardar los cambios.");
};

/** payload: { fromYear, fromMonth, toYear, toMonths, siteIds, include, overwrite } */
export const copyKioskConfig = async (payload) => {
  const response = await fetch(`${BASE}/config/copy`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo copiar la configuración.");
};

/* ------------------------------ Importación ------------------------------ */

/**
 * files: File[] -> multipart, campo `files` repetido.
 * periods (opcional): { "<nombre de archivo>": { year, month } } para corregir el mes de los reportes del formato nuevo.
 */
export const previewKioskImport = async (files, periods) => {
  const form = new FormData();
  (files || []).forEach((file) => form.append("files", file, file.name));
  if (periods && Object.keys(periods).length > 0) form.append("periods", JSON.stringify(periods));
  const response = await fetch(`${BASE}/imports/preview`, {
    method: "POST",
    headers: authOnlyHeaders(),
    body: form,
  });
  return parseJson(response, "No se pudieron analizar los archivos.");
};

/** payload: { replaceExisting, files: [{ fileName, sha256, year, month, siteMapping, resolutions, data }] } */
export const commitKioskImport = async (payload) => {
  const response = await fetch(`${BASE}/imports/commit`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo completar la importación.");
};

export const revertKioskImport = async (batchId) => {
  const response = await fetch(`${BASE}/imports/${batchId}/revert`, {
    method: "POST",
    headers: jsonHeaders(),
  });
  return parseJson(response, "No se pudo revertir el lote.");
};

export const listKioskImports = async () => {
  const response = await fetch(`${BASE}/imports`, { headers: jsonHeaders() });
  return parseJson(response, "No se pudo cargar el historial de importaciones.");
};

/* -------------------------------- Reportes -------------------------------- */

/** month omitido = año completo. siteIds: number[] | string. */
export const getKioskPnl = async ({ year, month, siteIds } = {}) => {
  const response = await fetch(`${BASE}/pnl${toQuery({ year, month, siteIds })}`, {
    headers: jsonHeaders(),
  });
  return parseJson(response, "No se pudo cargar el P&L por kiosco.");
};

export const getKioskDailyMatrix = async ({ year, month, siteIds } = {}) => {
  const response = await fetch(`${BASE}/daily-matrix${toQuery({ year, month, siteIds })}`, {
    headers: jsonHeaders(),
  });
  return parseJson(response, "No se pudo cargar la matriz de ventas diarias.");
};

/** mode: 'SAME_PERIOD' | 'FULL_MONTH'. */
export const getKioskCompare = async ({
  year,
  baseYear,
  fromMonth,
  toMonth,
  mode,
  siteIds,
} = {}) => {
  const response = await fetch(
    `${BASE}/compare${toQuery({ year, baseYear, fromMonth, toMonth, mode, siteIds })}`,
    { headers: jsonHeaders() }
  );
  return parseJson(response, "No se pudo cargar el comparativo.");
};

export const getKioskCompleteness = async ({ year } = {}) => {
  const response = await fetch(`${BASE}/completeness${toQuery({ year })}`, {
    headers: jsonHeaders(),
  });
  return parseJson(response, "No se pudo cargar la completitud de datos.");
};
