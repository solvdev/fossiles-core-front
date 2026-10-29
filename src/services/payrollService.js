import { getAuthHeader } from "./authService";

/**
 * Planilla quincenal y cargos a colaboradores. Base: /api/payroll.
 * Estados de planilla: BORRADOR → APROBADA → PAGADA, o ANULADA desde borrador o aprobada.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
const BASE = `${API_URL}/payroll`;

const jsonHeaders = () => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
});

const toQuery = (params) => {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || String(value).trim() === "") return;
    query.append(key, String(value));
  });
  const raw = query.toString();
  return raw ? `?${raw}` : "";
};

/** Nombre de los campos que puede rechazar la validación del backend. */
const FIELD_LABELS = {
  salary: "Salario",
  bonification: "Bonificación",
  bankAccount: "Cuenta",
  paymentMethod: "Forma de pago",
  nit: "NIT",
  igssAffiliation: "Afiliación IGSS",
  value: "Valor",
  code: "Parámetro",
  effectiveFrom: "Rige desde",
  description: "Motivo",
  firstChequeNumber: "Primer cheque",
  bankName: "Banco",
  notes: "Notas",
  reason: "Motivo",
};

const parseJson = async (response, fallbackMessage) => {
  if (response.ok) {
    return response.status === 204 ? null : response.json();
  }
  const errorData = await response.json().catch(() => ({ message: fallbackMessage }));
  // Con un error de validación se muestra el detalle por campo (`errors`) en lugar del mensaje general.
  const details = errorData.errors && typeof errorData.errors === "object"
    ? Object.entries(errorData.errors).map(([field, message]) => `${FIELD_LABELS[field] || field}: ${message}`)
    : [];
  throw new Error(details.length > 0 ? details.join(". ") : errorData.message || fallbackMessage);
};

const post = async (path, body, fallbackMessage) => {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: jsonHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseJson(response, fallbackMessage);
};

/* ------------------------------ Planillas ------------------------------ */

/**
 * Días de pago desde el mes anterior, con la planilla que ya tengan.
 * Con 6 por grupo (dos por mes) se cubren el mes anterior, el actual y el siguiente.
 */
export const getPayDays = async (payGroup, count = 6) => {
  const response = await fetch(`${BASE}/pay-days${toQuery({ payGroup, count })}`, { headers: jsonHeaders() });
  return parseJson(response, "No se pudieron cargar los días de pago.");
};

export const getPayrollRuns = async () => {
  const response = await fetch(`${BASE}/runs`, { headers: jsonHeaders() });
  return parseJson(response, "No se pudieron cargar las planillas.");
};

export const getPayrollRun = async (id) => {
  const response = await fetch(`${BASE}/runs/${id}`, { headers: jsonHeaders() });
  return parseJson(response, "No se pudo cargar la planilla.");
};

/** body: { payGroup, scheduledDate, bankName?, notes? } */
export const createPayrollRun = (body) => post("/runs", body, "No se pudo preparar la planilla.");

export const recalculatePayrollRun = (id) => post(`/runs/${id}/recalculate`, undefined, "No se pudo recalcular la planilla.");

export const approvePayrollRun = (id) => post(`/runs/${id}/approve`, undefined, "No se pudo aprobar la planilla.");

/** body: { firstChequeNumber, bankName? } */
export const assignPayrollCheques = (id, body) => post(`/runs/${id}/cheques`, body, "No se pudieron numerar los cheques.");

export const payPayrollRun = (id) => post(`/runs/${id}/pay`, undefined, "No se pudo registrar el pago.");

export const annulPayrollRun = (id, reason) => post(`/runs/${id}/annul`, { reason }, "No se pudo anular la planilla.");

/** Fecha real de pago (no después de la programada ni más de 10 días antes). En borrador recalcula. */
export const changePayrollPayDate = (id, payDate) =>
  post(`/runs/${id}/pay-date`, { payDate }, "No se pudo cambiar la fecha de pago.");

/* ------------------------------ Fichas ------------------------------ */

export const getPayrollProfiles = async () => {
  const response = await fetch(`${BASE}/profiles`, { headers: jsonHeaders() });
  return parseJson(response, "No se pudieron cargar las fichas de planilla.");
};

/** Reemplaza todos los datos de planilla de la ficha: lo que va vacío queda vacío. */
export const updatePayrollProfile = async (employeeId, body) => {
  const response = await fetch(`${BASE}/profiles/${employeeId}`, {
    method: "PUT",
    headers: jsonHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(response, "No se pudo guardar la ficha.");
};

/* ------------------------------ Parámetros ------------------------------ */

export const getPayrollParameters = async () => {
  const response = await fetch(`${BASE}/parameters`, { headers: jsonHeaders() });
  return parseJson(response, "No se pudieron cargar los parámetros de planilla.");
};

/** body: { code, value, effectiveFrom, description? } */
export const addPayrollParameter = (body) => post("/parameters", body, "No se pudo registrar el parámetro.");

/* ------------------------------ Cargos a colaboradores ------------------------------ */

export const getEmployeeCharges = async (filters = {}) => {
  const response = await fetch(`${BASE}/charges${toQuery(filters)}`, { headers: jsonHeaders() });
  return parseJson(response, "No se pudieron cargar los cargos a colaboradores.");
};

/** settlementMethod: DESCUENTO, TRANSFERENCIA o EFECTIVO. */
export const decideEmployeeCharge = (id, settlementMethod) =>
  post(`/charges/${id}/settlement`, { settlementMethod }, "No se pudo guardar la decisión.");

export const markEmployeeChargePaid = (id) => post(`/charges/${id}/mark-paid`, undefined, "No se pudo marcar como pagado.");

export const cancelEmployeeCharge = (id) => post(`/charges/${id}/cancel`, undefined, "No se pudo anular el cargo.");
