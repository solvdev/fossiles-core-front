import { getAuthHeader } from "./authService";

/**
 * Contabilidad > Rentas. Base: /api/kiosk-rents.
 * Kioscos: arrendador, día de pago y contrato. El monto lo calcula el back desde Finanzas (ALQUILER).
 * Otras (oficina, bodega, otro): CRUD en /others; el monto viaja en monthlyAmount. Sin pagos ni historial.
 */

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
const BASE = `${API_URL}/kiosk-rents`;

const parseJson = async (response, fallbackMessage) => {
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json().catch(() => null);
  }
  const errorData = await response.json().catch(() => ({}));
  throw new Error(errorData.message || errorData.error || errorData.detail || fallbackMessage);
};

const saveBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

export const getKioskRents = async () => {
  const response = await fetch(BASE, { headers: getAuthHeader() });
  return parseJson(response, "No se pudieron cargar las rentas.");
};

/** body: { landlordName, paymentDay, contractStart, contractEnd, note } (fechas "YYYY-MM-DD"). Devuelve la lista. */
export const saveKioskRent = async (locationId, body) => {
  const response = await fetch(`${BASE}/${locationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  return parseJson(response, "No se pudo guardar la renta.");
};

/** Quita los datos del contrato del kiosco (la renta de Finanzas no se toca). Devuelve la lista. */
export const clearKioskRent = async (locationId) => {
  const response = await fetch(`${BASE}/${locationId}`, { method: "DELETE", headers: getAuthHeader() });
  return parseJson(response, "No se pudieron quitar los datos de la renta.");
};

/** body: { name, description, category, landlordName, monthlyAmount, paymentDay, contractStart, contractEnd, note }. */
export const createOtherRent = async (body) => {
  const response = await fetch(`${BASE}/others`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  return parseJson(response, "No se pudo crear la renta.");
};

/** Igual que create; actualiza por rentId. */
export const saveOtherRent = async (rentId, body) => {
  const response = await fetch(`${BASE}/others/${rentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  return parseJson(response, "No se pudo guardar la renta.");
};

/** Baja lógica (active=false). */
export const deactivateOtherRent = async (rentId) => {
  const response = await fetch(`${BASE}/others/${rentId}`, { method: "DELETE", headers: getAuthHeader() });
  return parseJson(response, "No se pudo desactivar la renta.");
};

export const downloadKioskRentTemplate = async () => {
  const response = await fetch(`${BASE}/template`, { headers: getAuthHeader() });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || "No se pudo descargar la plantilla de rentas.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  saveBlob(blob, match?.[1] || "rentas-kioscos.xlsx");
};

/** Revisa (apply = false) o aplica la plantilla. Devuelve { applied, readRows, blankRows, unchangedRows, changes, errors }. */
export const importKioskRentTemplate = async (file, { apply = false } = {}) => {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${BASE}/import?dryRun=${apply ? "false" : "true"}`, {
    method: "POST",
    headers: getAuthHeader(),
    body: form,
  });
  return parseJson(response, "No se pudo leer la plantilla de rentas.");
};
