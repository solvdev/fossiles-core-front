/**
 * Servicio de conciliación de ventas en línea (casos, fondos, ajustes, lotes y comisiones).
 */

import { getAuthHeader } from "./authService";
import { toQueryParams, toQueryString } from "../utils/reconciliationHelper";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
const BASE = `${API_URL}/reconciliation`;

const jsonHeaders = (extra = {}) => ({ "Content-Type": "application/json", ...getAuthHeader(), ...extra });

const parse = async (response, fallback) => {
  if (response.ok) return response.json();
  const error = await response.json().catch(() => ({ message: fallback }));
  throw new Error(error.message || fallback);
};

const get = async (path, fallback) => parse(await fetch(`${BASE}${path}`, { headers: jsonHeaders() }), fallback);

const post = async (path, body, fallback, headers = {}) =>
  parse(
    await fetch(`${BASE}${path}`, { method: "POST", headers: jsonHeaders(headers), body: body === undefined ? undefined : JSON.stringify(body) }),
    fallback
  );

const upload = async (path, formData, fallback) =>
  parse(await fetch(`${BASE}${path}`, { method: "POST", headers: getAuthHeader(), body: formData }), fallback);

// ───────── dashboard y bandeja ─────────

export const getDashboard = (filters) => get(`/dashboard${toQueryString(toQueryParams(filters))}`, "No se pudo cargar el dashboard");

export const getCases = (filters, { page = 0, size = 50, sort, dir } = {}) =>
  get(`/cases${toQueryString(toQueryParams(filters, { page, size, sort, dir }))}`, "No se pudo cargar la bandeja");

export const getCase = (id) => get(`/cases/${id}`, "No se pudo cargar el caso");

// ───────── casos ─────────

export const generateCases = (from, to) => post("/cases/generate", { from, to }, "No se pudieron generar los casos");
export const revalidatePeriod = (from, to) => post("/cases/revalidate", { from, to }, "No se pudo revalidar el período");
export const revalidateCase = (id) => post(`/cases/${id}/revalidate`, undefined, "No se pudo revalidar el caso");
export const reconcileCase = (id, observation) => post(`/cases/${id}/reconcile`, { reason: observation || "" }, "No se pudo conciliar el caso");
export const bulkReconcile = (ids, observation) => post("/cases/bulk-reconcile", { ids, observation }, "No se pudo conciliar en bloque");
export const reopenCase = (id, reason) => post(`/cases/${id}/reopen`, { reason }, "No se pudo reabrir el caso");
export const excludeCase = (id, reason) => post(`/cases/${id}/exclude`, { reason }, "No se pudo excluir el caso");
export const includeCase = (id) => post(`/cases/${id}/include`, undefined, "No se pudo reincorporar el caso");
export const observeCase = (id, text) => post(`/cases/${id}/observe`, { reason: text }, "No se pudo guardar la observación");
export const refreshAmount = (id, reason) => post(`/cases/${id}/refresh-amount`, { reason }, "No se pudo actualizar el monto");
export const applyReceipt = (caseId, receiptId, amount) =>
  post(`/cases/${caseId}/apply-receipt`, { receiptId, amount: amount || null }, "No se pudo aplicar el fondo");
export const voidApplication = (applicationId, reason) => post(`/applications/${applicationId}/void`, { reason }, "No se pudo anular la aplicación");

// ───────── fondos ─────────

export const importReceipts = (file, sourceType) => {
  const form = new FormData();
  form.append("file", file);
  form.append("sourceType", sourceType);
  return upload("/receipts/import", form, "No se pudo importar el archivo");
};
export const createReceipt = (data) => post("/receipts", data, "No se pudo guardar el fondo");
/** Pago escrito a mano: el ENVL o la guía identifican la venta. */
export const recordQuickReceipt = (data) => post("/receipts/quick", data, "No se pudo registrar el pago");
/** Pago escrito dentro del caso abierto. */
export const recordCaseReceipt = (caseId, data) => post(`/cases/${caseId}/record-receipt`, data, "No se pudo registrar el pago");
export const autoApplyReceipts = () => post("/receipts/auto-apply", undefined, "No se pudieron aplicar los fondos pendientes");
export const getUnappliedReceipts = (limit = 100) => get(`/receipts/unapplied?limit=${limit}`, "No se pudieron cargar los fondos sin aplicar");
export const voidReceipt = (id, reason) => post(`/receipts/${id}/void`, { reason }, "No se pudo anular el fondo");

// ───────── ajustes ─────────

export const proposeAdjustment = (caseId, reason) => post(`/cases/${caseId}/adjustments`, { reason }, "No se pudo proponer el ajuste");
export const getPendingAdjustments = () => get("/adjustments/pending", "No se pudieron cargar los ajustes pendientes");
export const authorizeAdjustment = (id) => post(`/adjustments/${id}/authorize`, undefined, "No se pudo autorizar el ajuste");
export const rejectAdjustment = (id, reason) => post(`/adjustments/${id}/reject`, { reason: reason || "" }, "No se pudo rechazar el ajuste");

// ───────── lotes ─────────

export const getBatches = () => get("/batches", "No se pudieron cargar los lotes");
export const createBatch = (data) => post("/batches", data, "No se pudo crear el lote");
export const closeBatch = (id, idempotencyKey) => post(`/batches/${id}/close`, undefined, "No se pudo cerrar el lote", { "Idempotency-Key": idempotencyKey });
export const voidBatch = (id, reason) => post(`/batches/${id}/void`, { reason }, "No se pudo anular el lote");
export const releaseCase = (batchId, caseId) => post(`/batches/${batchId}/release/${caseId}`, undefined, "No se pudo sacar el caso del lote");
export const getExports = () => get("/exports", "No se pudo cargar el historial de descargas");

/** Descarga el Excel del lote. Devuelve el nombre del archivo y su huella. */
export const downloadBatch = async (id) => {
  const response = await fetch(`${BASE}/batches/${id}/export`, { headers: getAuthHeader() });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "No se pudo descargar el archivo." }));
    throw new Error(error.message || "No se pudo descargar el archivo.");
  }
  const blob = await response.blob();
  const match = (response.headers.get("Content-Disposition") || "").match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || `conciliacion-${id}.xlsx`;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return { filename, sha256: response.headers.get("X-Content-Sha256") };
};

// ───────── comisiones y vendedores ─────────

export const getCommissions = (month) => get(`/commissions?month=${encodeURIComponent(month)}`, "No se pudieron cargar las comisiones");
export const calculateCommissions = (month) => post(`/commissions/calculate?month=${encodeURIComponent(month)}`, undefined, "No se pudieron calcular las comisiones");
export const closeCommissionMonth = (month) => post(`/commissions/close-month?month=${encodeURIComponent(month)}`, undefined, "No se pudo cerrar el mes");
export const getSellers = () => get("/sellers", "No se pudieron cargar los vendedores");
export const getMissingSellers = () => get("/sellers/missing", "No se pudo revisar el catálogo de vendedores");
export const createSeller = (name) => post("/sellers", { name }, "No se pudo agregar el vendedor");

// ───────── guías históricas ─────────

export const importGuides = (file, dryRun) => {
  const form = new FormData();
  form.append("file", file);
  form.append("dryRun", String(dryRun));
  return upload("/guides/import", form, "No se pudo importar el archivo de guías");
};
