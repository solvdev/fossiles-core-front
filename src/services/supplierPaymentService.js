import { getAuthHeader } from "./authService";

/**
 * Cuentas por pagar, pagos a proveedores y su configuración (bancos, formas de pago, formato de cheque).
 * Base: /api/supplier-payments.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
const BASE = `${API_URL}/supplier-payments`;
const DOCS = `${API_URL}/payable-documents`;

const request = async (path, { method = "GET", body } = {}, fallback = "No se pudo completar la operación.") => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || fallback);
  }
  return response.json();
};

export const getPayables = (scope) => {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  return request(`/payables${query}`, {}, "No se pudieron cargar las cuentas por pagar.");
};

export const getSupplierPayments = () => request("/payments", {}, "No se pudieron cargar los pagos.");

/** body: { supplierId, paymentMethodId, bankAccountId, payDate, payeeName, reference, concept, allocations: [{ purchaseOrderId, amount }] } */
export const createSupplierPayment = (body) =>
  request("/payments", { method: "POST", body }, "No se pudo registrar el pago.");

export const voidSupplierPayment = (id, reason) =>
  request(`/payments/${id}/void`, { method: "POST", body: { reason } }, "No se pudo anular el pago.");

/** Datos para dibujar los cheques (con su formato). No cambia nada. */
export const getChequePrintData = (ids) =>
  request("/payments/print-data", { method: "POST", body: { ids } }, "No se pudieron preparar los cheques.");

/** Se llama después de imprimir: marca los cheques como impresos y devuelve la lista actualizada. */
export const markChequesPrinted = (ids) =>
  request("/payments/mark-printed", { method: "POST", body: { ids } }, "No se pudieron marcar los cheques como impresos.");

export const getPaymentConfig = () => request("/config", {}, "No se pudo cargar la configuración de pagos.");

export const savePayablesStart = (date) =>
  request("/config/payables-start", { method: "PUT", body: { date } }, "No se pudo guardar la fecha.");

const saveConfig = (kind, id, body, fallback) =>
  request(`/config/${kind}${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body }, fallback);

export const saveChequeLayout = (id, body) => saveConfig("layouts", id, body, "No se pudo guardar el formato del cheque.");
export const saveBankAccount = (id, body) => saveConfig("accounts", id, body, "No se pudo guardar la cuenta.");
export const savePaymentMethod = (id, body) => saveConfig("methods", id, body, "No se pudo guardar la forma de pago.");

// ------------------------------------------------------------------ Documentos por pagar

const docRequest = async (path, { method = "GET", body } = {}, fallback) => {
  const response = await fetch(`${DOCS}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || fallback);
  }
  return response.json();
};

/** body: { supplierId, payeeName, concept, documentNumber, issueDate, dueDate, amount }. Devuelve las cuentas por pagar. */
export const createPayableDocument = (body) =>
  docRequest("", { method: "POST", body }, "No se pudo guardar el documento por pagar.");

export const voidPayableDocument = (id, reason) =>
  docRequest(`/${id}/void`, { method: "POST", body: { reason } }, "No se pudo anular el documento.");

/** Genera las rentas de kioscos y otras rentas de un mes («AAAA-MM») como documentos por pagar. Se puede repetir sin duplicar. */
export const generateRentPayables = (month) =>
  docRequest("/generate-rents", { method: "POST", body: { month } }, "No se pudieron generar las rentas.");

export const downloadPayablesTemplate = async () => {
  const response = await fetch(`${DOCS}/template`, { headers: getAuthHeader() });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "No se pudo descargar la plantilla de saldos.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = match?.[1] || "saldos-por-pagar.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

/** Revisa (apply = false) o aplica la plantilla de saldos iniciales. */
export const importPayablesTemplate = async (file, { apply = false } = {}) => {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${DOCS}/import?dryRun=${apply ? "false" : "true"}`, {
    method: "POST",
    headers: getAuthHeader(),
    body: form,
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "No se pudo leer la plantilla de saldos.");
  }
  return response.json();
};
