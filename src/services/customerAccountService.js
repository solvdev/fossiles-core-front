/**
 * Servicio de cuentas por cobrar — clientes vendedor Luis Felipe (OPV / OPC)
 */

import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const parseError = async (response, fallback) => {
  const errorData = await response.json().catch(() => ({ message: fallback }));
  throw new Error(errorData.message || fallback);
};

export const MOVEMENT_CONCEPTS = [
  { code: "1", label: "Factura", entryType: "CHARGE", description: "Cargo / factura" },
  { code: "2", label: "Nota de crédito", entryType: "CREDIT_NOTE", description: "Nota de crédito" },
  { code: "3", label: "Cheque", entryType: "PAYMENT", paymentMethod: "CHEQUE", description: "Abono con cheque" },
  { code: "4", label: "Efectivo", entryType: "PAYMENT", paymentMethod: "EFECTIVO", description: "Abono en efectivo" },
  { code: "5", label: "Anticipo", entryType: "PAYMENT", description: "Anticipo a favor del cliente" },
  { code: "11", label: "Descarga", entryType: "PAYMENT", description: "Descarga de crédito cobrado" },
];

export const getMovementConcept = (code) => MOVEMENT_CONCEPTS.find((c) => c.code === String(code));

export const getCustomerAccountSummary = async ({
  search = "",
  luisFelipeOnly = true,
  positiveBalanceOnly = false,
  regionCode,
  routeNumber,
  routeLocationCode,
} = {}) => {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("luisFelipeOnly", String(luisFelipeOnly));
  params.set("positiveBalanceOnly", String(positiveBalanceOnly));
  if (regionCode) params.set("regionCode", regionCode);
  if (routeNumber != null && routeNumber !== "") params.set("routeNumber", String(routeNumber));
  if (routeLocationCode) params.set("routeLocationCode", routeLocationCode);

  const response = await fetch(`${API_URL}/customer-accounts/summary?${params}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
  });
  if (!response.ok) await parseError(response, "Error al cargar cuentas por cobrar");
  return response.json();
};

export const searchReceivableDocuments = async ({
  search = "",
  orderKind,
  chargeStatus,
  hasCharge,
  hasPayment,
  regionCode,
  routeNumber,
  routeLocationCode,
  limit = 200,
} = {}) => {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (orderKind) params.set("orderKind", orderKind);
  if (chargeStatus) params.set("chargeStatus", chargeStatus);
  if (hasCharge != null) params.set("hasCharge", String(hasCharge));
  if (hasPayment != null) params.set("hasPayment", String(hasPayment));
  if (regionCode) params.set("regionCode", regionCode);
  if (routeNumber != null && routeNumber !== "") params.set("routeNumber", String(routeNumber));
  if (routeLocationCode) params.set("routeLocationCode", routeLocationCode);
  params.set("limit", String(limit));

  const response = await fetch(`${API_URL}/customer-accounts/receivable-search?${params}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
  });
  if (!response.ok) await parseError(response, "Error al buscar documentos por cobrar");
  return response.json();
};

export const getCustomerAccountPrintReport = async ({
  search = "",
  luisFelipeOnly = true,
  positiveBalanceOnly = false,
  from,
  to,
  regionCode,
  routeNumber,
  routeLocationCode,
} = {}) => {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("luisFelipeOnly", String(luisFelipeOnly));
  params.set("positiveBalanceOnly", String(positiveBalanceOnly));
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (regionCode) params.set("regionCode", regionCode);
  if (routeNumber != null && routeNumber !== "") params.set("routeNumber", String(routeNumber));
  if (routeLocationCode) params.set("routeLocationCode", routeLocationCode);

  const response = await fetch(`${API_URL}/customer-accounts/print-report?${params}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
  });
  if (!response.ok) await parseError(response, "Error al generar reporte");
  return response.json();
};

export const getCustomerAccountBalance = async (customerId) => {
  const response = await fetch(`${API_URL}/customer-accounts/customers/${customerId}/balance`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
  });
  if (!response.ok) await parseError(response, "Error al obtener saldo");
  return response.json();
};

export const getCustomerAccountStatement = async (customerId, { from, to } = {}) => {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const response = await fetch(
    `${API_URL}/customer-accounts/customers/${customerId}/statement${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
    }
  );
  if (!response.ok) await parseError(response, "Error al cargar estado de cuenta");
  return response.json();
};

export const getLfSalesDocuments = async (customerId, { withBalance = true } = {}) => {
  const params = new URLSearchParams();
  params.set("withBalance", String(withBalance));
  const response = await fetch(
    `${API_URL}/customer-accounts/customers/${customerId}/lf-documents?${params}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
    }
  );
  if (!response.ok) await parseError(response, "Error al cargar documentos LF");
  return response.json();
};

export const getReceivableDocuments = async (customerId, { orderKind } = {}) => {
  const params = new URLSearchParams();
  if (orderKind) params.set("orderKind", orderKind);
  const qs = params.toString();
  const response = await fetch(
    `${API_URL}/customer-accounts/customers/${customerId}/receivable-documents${qs ? `?${qs}` : ""}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
    }
  );
  if (!response.ok) await parseError(response, "Error al cargar documentos pendientes");
  return response.json();
};

export const createCustomerAccountEntry = async (customerId, payload) => {
  const response = await fetch(`${API_URL}/customer-accounts/customers/${customerId}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(payload),
  });
  if (!response.ok) await parseError(response, "Error al registrar movimiento");
  return response.json();
};

export const createCustomerAccountDocumentSettlement = async (customerId, payload) => {
  const response = await fetch(
    `${API_URL}/customer-accounts/customers/${customerId}/entries/document-settlement`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeader() },
      body: JSON.stringify(payload),
    }
  );
  if (!response.ok) await parseError(response, "Error al registrar devolución/descuento");
  return response.json();
};

export const voidCustomerAccountEntry = async (entryId, voidReason) => {
  const response = await fetch(`${API_URL}/customer-accounts/entries/${entryId}/void`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify({ voidReason }),
  });
  if (!response.ok) await parseError(response, "Error al anular movimiento");
  return response.json();
};

export const splitAccountBalance = (value) => {
  const net = Number(value) || 0;
  return {
    balanceDue: net > 0 ? net : 0,
    creditBalance: net < 0 ? Math.abs(net) : 0,
    netBalance: net,
  };
};

export const formatAccountMoney = (value) => {
  const num = Number(value || 0);
  return `Q ${num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const badgeBase = {
  color: "#fff",
  fontWeight: 600,
  padding: "6px 12px",
  borderRadius: "4px",
  display: "inline-block",
  fontSize: "0.85rem",
};

export const getDueBadgeStyle = (value) => ({
  ...badgeBase,
  backgroundColor: Number(value) > 0 ? "#e67e22" : "#566573",
});

export const getCreditBadgeStyle = (value) => ({
  ...badgeBase,
  backgroundColor: Number(value) > 0 ? "#148f77" : "#566573",
});

/** @deprecated usar getDueBadgeStyle / getCreditBadgeStyle */
export const getBalanceBadgeStyle = (value) => {
  const balance = Number(value) || 0;
  if (balance > 0) return getDueBadgeStyle(balance);
  if (balance < 0) return getCreditBadgeStyle(Math.abs(balance));
  return { ...badgeBase, backgroundColor: "#566573" };
};

export const ENTRY_TYPE_LABELS = {
  CHARGE: "Cargo",
  PAYMENT: "Pago / Abono",
  CREDIT_NOTE: "Nota de crédito",
  OPENING_BALANCE: "Saldo inicial",
  RETURN: "Devolución",
};

export const CHARGE_STATUS_LABELS = {
  NONE: "Sin cargo",
  CHARGED: "Cargado",
  PARTIAL: "Parcial",
  PAID: "Pagado",
  OPEN: "Pendiente",
};

export const PAYMENT_METHODS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "DEPOSITO", label: "Depósito" },
  { value: "OTRO", label: "Otro" },
];

export const getConceptLabel = (code) => {
  const concept = getMovementConcept(code);
  return concept ? `${concept.code} — ${concept.label}` : code || "—";
};
