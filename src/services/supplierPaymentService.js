import { getAuthHeader } from "./authService";

/**
 * Cuentas por pagar, pagos a proveedores y su configuración (bancos, formas de pago, formato de cheque).
 * Base: /api/supplier-payments.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
const BASE = `${API_URL}/supplier-payments`;

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

export const getPayables = () => request("/payables", {}, "No se pudieron cargar las cuentas por pagar.");

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
