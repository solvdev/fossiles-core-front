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

export const listTaxInvoices = async (filters = {}) => {
  const response = await fetch(`${API_URL}/tax-invoices${toQuery(filters)}`, {
    headers: headers(),
  });
  return parseJson(response, "No se pudieron cargar las facturas.");
};

export const getTaxInvoiceSummary = async () => {
  const response = await fetch(`${API_URL}/tax-invoices/summary`, {
    headers: headers(),
  });
  return parseJson(response, "No se pudo cargar el resumen de facturas.");
};

export const getTaxInvoiceById = async (id) => {
  const response = await fetch(`${API_URL}/tax-invoices/${id}`, {
    headers: headers(),
  });
  return parseJson(response, "No se pudo cargar la factura.");
};

export const getTaxInvoiceAttempts = async (id) => {
  const response = await fetch(`${API_URL}/tax-invoices/${id}/attempts`, {
    headers: headers(),
  });
  return parseJson(response, "No se pudo cargar la bitácora de la factura.");
};

export const createManualTaxInvoice = async (payload) => {
  const response = await fetch(`${API_URL}/tax-invoices/manual`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudo crear la factura manual.");
};

export const issueTaxInvoiceFromKioskSale = async (saleId) => {
  const response = await fetch(`${API_URL}/tax-invoices/from-kiosk-sale/${saleId}`, {
    method: "POST",
    headers: headers(),
  });
  return parseJson(response, "No se pudo emitir la factura POS.");
};

export const issueTaxInvoiceFromOnlineSale = async (saleId) => {
  const response = await fetch(`${API_URL}/tax-invoices/from-online-sale/${saleId}`, {
    method: "POST",
    headers: headers(),
  });
  return parseJson(response, "No se pudo emitir la factura de venta online.");
};

export const retryTaxInvoice = async (id) => {
  const response = await fetch(`${API_URL}/tax-invoices/${id}/retry`, {
    method: "POST",
    headers: headers(),
  });
  return parseJson(response, "No se pudo reintentar la certificación FEL.");
};

export const updateTaxInvoiceFelMetadata = async (id, payload) => {
  const response = await fetch(`${API_URL}/tax-invoices/${id}/fel-metadata`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(payload),
  });
  return parseJson(response, "No se pudieron actualizar los datos FEL.");
};

const FEL_INVOICE_REPORT_BASE_URL =
  "https://report.feel.com.gt/ingfacereport/ingfacereport_documento";

export const getFelInvoiceReportUrl = (felUuid) => {
  const uuid = String(felUuid || "").trim();
  if (!uuid) return null;
  return `${FEL_INVOICE_REPORT_BASE_URL}?uuid=${encodeURIComponent(uuid)}`;
};

export const openFelInvoiceReport = (felUuid) => {
  const url = getFelInvoiceReportUrl(felUuid);
  if (!url) {
    throw new Error("No hay UUID FEL para descargar la factura.");
  }
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Permite ventanas emergentes para descargar la factura.");
  }
  return url;
};

export const downloadTaxInvoiceCertifiedXml = async (id, suggestedFilename) => {
  const response = await fetch(`${API_URL}/tax-invoices/${id}/certified-xml`, {
    headers: getAuthHeader(),
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "No se pudo descargar el XML certificado." }));
    throw new Error(errorData.message || "No se pudo descargar el XML certificado.");
  }
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || suggestedFilename || `factura-${id}.xml`;
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return filename;
};
