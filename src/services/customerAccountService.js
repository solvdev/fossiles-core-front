/**
 * Servicio de cuentas por cobrar — clientes vendedor Luis Felipe (OPV / OPC)
 */

import { getAuthHeader } from "./authService";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8080/api";

const parseError = async (response, fallback) => {
  const errorData = await response.json().catch(() => ({ message: fallback }));
  throw new Error(errorData.message || fallback);
};

const jsonHeaders = (requestId) => ({
  "Content-Type": "application/json",
  ...getAuthHeader(),
  ...(requestId ? { "X-Request-Id": String(requestId) } : {}),
});

/** Un id por acción del usuario. El backend puede ignorar el header. */
export const createClientRequestId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const rand = Math.floor(Math.random() * 16);
    const value = ch === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
};

/**
 * Marca una acción en curso. Devuelve el id de la petición, o null si ya hay una.
 * El segundo clic debe salir sin disparar otra solicitud.
 */
export const tryBeginSingleFlight = (gate) => {
  if (!gate || gate.current) return null;
  gate.current = true;
  return createClientRequestId();
};

export const endSingleFlight = (gate) => {
  if (gate) gate.current = false;
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
  allOrderTypes = false,
  limit = 500,
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
  if (allOrderTypes) params.set("allOrderTypes", "true");
  params.set("limit", String(limit));

  const response = await fetch(`${API_URL}/customer-accounts/receivable-search?${params}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
  });
  if (!response.ok) await parseError(response, "Error al buscar documentos por cobrar");
  return response.json();
};

/**
 * Cartera por documento (cargos, abonos, créditos, saldo) + anexo opcional de movimientos.
 * Solo trae documentos y clientes con saldo: lo saldado (cero) no forma parte de la cartera.
 */
export const getCustomerAccountPortfolioReport = async ({
  search = "",
  orderKind = "OPV",
  regionCode,
  routeNumber,
  routeLocationCode,
  includeMovements = false,
  movementsFrom,
  movementsTo,
} = {}) => {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  params.set("orderKind", orderKind);
  if (regionCode) params.set("regionCode", regionCode);
  if (routeNumber != null && routeNumber !== "") params.set("routeNumber", String(routeNumber));
  if (routeLocationCode) params.set("routeLocationCode", routeLocationCode);
  if (includeMovements) {
    params.set("includeMovements", "true");
    if (movementsFrom) params.set("movementsFrom", movementsFrom);
    if (movementsTo) params.set("movementsTo", movementsTo);
  }

  const response = await fetch(`${API_URL}/customer-accounts/portfolio-report?${params}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", ...getAuthHeader() },
  });
  if (!response.ok) await parseError(response, "Error al generar la cartera de clientes");
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

export const createCustomerAccountEntry = async (customerId, payload, { requestId } = {}) => {
  const response = await fetch(`${API_URL}/customer-accounts/customers/${customerId}/entries`, {
    method: "POST",
    headers: jsonHeaders(requestId),
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

export const voidCustomerAccountEntry = async (entryId, voidReason, { requestId } = {}) => {
  const response = await fetch(`${API_URL}/customer-accounts/entries/${entryId}/void`, {
    method: "PUT",
    headers: jsonHeaders(requestId),
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

const BALANCE_EPSILON = 0.005;

/**
 * ¿Sigue el cliente en la cartera `kind` (OPV/OPC)? Mientras deba algo en esa cartera o tenga crédito a favor.
 * Un cliente en cero ya no debe nada y no se lista. Con `dueOnly` quedan solo los que tienen deuda.
 */
export const hasPortfolioBalance = (row, kind, { dueOnly = false } = {}) => {
  const due = Number(kind === "OPC" ? row?.balanceDueOpc : row?.balanceDueOpv) || 0;
  if (due > BALANCE_EPSILON) return true;
  if (dueOnly) return false;
  const credit = Number(row?.creditBalance ?? splitAccountBalance(row?.balance).creditBalance) || 0;
  return credit > BALANCE_EPSILON;
};

export const formatAccountMoney = (value) => {
  const num = Number(value || 0);
  return `Q ${num.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** `totalCreditNotes` del resumen. Si el API no lo manda, es cero. */
export const creditNotesAmount = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
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
  COVERED: "Cubierto por otro cargo",
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

const CREDIT_ENTRY_TYPES = new Set(["PAYMENT", "CREDIT_NOTE", "RETURN"]);

export const entryAppliesToCharge = (entryType) => CREDIT_ENTRY_TYPES.has(entryType);

const sameEntryId = (left, right) =>
  left != null && right != null && String(left) === String(right);

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Un abono, nota de crédito o devolución se anida bajo un cargo solo si
 * appliedToEntryId apunta a ese cargo y el cargo no está anulado.
 * No se adivina por envío, factura ni orden.
 */
export const findParentChargeId = (line, charges = []) => {
  if (!line || !CREDIT_ENTRY_TYPES.has(line.entryType)) return null;
  if (line.appliedToEntryId == null) return null;
  const parent = (Array.isArray(charges) ? charges : []).find(
    (charge) =>
      charge &&
      charge.status !== "VOID" &&
      (charge.entryType == null || charge.entryType === "CHARGE") &&
      sameEntryId(charge.id, line.appliedToEntryId)
  );
  return parent ? parent.id : null;
};

/**
 * Agrupa líneas del estado de cuenta: solo Facturas (y saldo inicial) en la tabla;
 * descargas, NC, pagos y devoluciones van como hijos del cargo (Ver detalle).
 */
export const groupStatementLines = (lines = [], openingBalance = 0) => {
  const list = Array.isArray(lines) ? lines : [];
  const charges = list.filter((line) => line.entryType === "CHARGE" && line.status !== "VOID");
  const childrenByChargeId = new Map();
  const nestedIds = new Set();

  list.forEach((line) => {
    if (!CREDIT_ENTRY_TYPES.has(line.entryType)) return;
    const parentId = findParentChargeId(line, charges);
    if (parentId == null) return;
    const children = childrenByChargeId.get(parentId) || [];
    children.push(line);
    childrenByChargeId.set(parentId, children);
    nestedIds.add(line.id);
  });

  // Tabla principal: facturas, saldo inicial y créditos sin cargo vinculado.
  const topLevel = list.filter((line) => !nestedIds.has(line.id));

  // El saldo se recalcula sobre las filas visibles: cada factura absorbe los abonos aplicados a ella
  // (crédito = abonos del documento), de modo que Débito − Crédito = pendiente y el saldo acumulado
  // no arrastra facturas ya liquidadas.
  let running = Number(openingBalance) || 0;
  const displayLines = topLevel.map((line) => {
    const children = (childrenByChargeId.get(line.id) || []).slice();
    const activeChildren = children.filter((c) => c.status === "ACTIVE");
    const appliedTotal = activeChildren.reduce((sum, c) => sum + (Number(c.credit) || 0), 0);
    const isActive = line.status === "ACTIVE";
    const isCharge = line.entryType === "CHARGE" && isActive;
    const debit = Number(line.debit) || 0;
    const credit = isCharge ? appliedTotal : Number(line.credit) || 0;
    if (isActive) running += debit - credit;
    return {
      ...line,
      credit,
      childEntries: children,
      childCount: activeChildren.length,
      chargeBalanceDue: isCharge ? Math.max(0, debit - appliedTotal) : line.chargeBalanceDue,
      runningBalance: isActive ? Math.round(running * 100) / 100 : null,
    };
  });
  return { displayLines, childrenByChargeId };
};

export const isChargeLine = (line) => line?.entryType === "CHARGE";

/** Totales del estado de cuenta. Las filas VOID no entran, haya o no toggle de anulados. */
export const sumStatementTotals = (lines = []) => {
  const totals = {
    totalCharges: 0,
    totalPayments: 0,
    totalCreditNotes: 0,
    totalReturns: 0,
    netMovement: 0,
  };
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    if (!line || line.status === "VOID") return;
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    totals.netMovement += debit - credit;
    if (line.entryType === "CHARGE") totals.totalCharges += debit;
    else if (line.entryType === "PAYMENT") totals.totalPayments += credit;
    else if (line.entryType === "CREDIT_NOTE") totals.totalCreditNotes += credit;
    else if (line.entryType === "RETURN") totals.totalReturns += credit;
  });
  return {
    totalCharges: roundMoney(totals.totalCharges),
    totalPayments: roundMoney(totals.totalPayments),
    totalCreditNotes: roundMoney(totals.totalCreditNotes),
    totalReturns: roundMoney(totals.totalReturns),
    netMovement: roundMoney(totals.netMovement),
  };
};

/** Filas de la tabla. Por defecto oculta anulados; los totales no dependen de este filtro. */
export const filterStatementDisplayLines = (displayLines = [], { showVoided = false } = {}) => {
  const list = Array.isArray(displayLines) ? displayLines : [];
  if (showVoided) return list;
  return list.filter((line) => line.status !== "VOID");
};

/** Cargos no anulados, con saldo abierto ya neto de abonos activos. */
export const listOpenCharges = (lines = []) => {
  const { displayLines } = groupStatementLines(lines, 0);
  return displayLines.filter((line) => line.entryType === "CHARGE" && line.status !== "VOID");
};

export const formatOpenChargeLabel = (charge) => {
  const kind = charge?.orderKind || "—";
  const order = charge?.productionOrderCode || charge?.documentNumber || charge?.orderCode || "—";
  const envp = charge?.invoiceNumber || charge?.vendorShipmentNumber || "—";
  return `${kind} · ${order} · ENVP ${envp} · Saldo ${formatAccountMoney(charge?.chargeBalanceDue)}`;
};

const orderIdFromCharge = (charge) => {
  const orderId = charge?.productionOrderId;
  if (orderId == null || orderId === "") return null;
  const parsed = Number(orderId);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Arma el cuerpo de alta.
 * Pago, nota de crédito y devolución envían appliedToEntryId y copian productionOrderId
 * y orderKind del cargo elegido. No usan la orden ni el tipo que tenga la pantalla.
 * El alta de cargo no cambia.
 */
export const buildAccountEntryPayload = ({ entryType, conceptCode, form, charge = null }) => {
  const amount = Number(form.amount);
  const receipt = String(form.receiptNumber || "").trim();
  const movementConceptCode =
    conceptCode == null || conceptCode === "OPENING" || conceptCode === "RETURN" ? null : conceptCode;
  const payload = {
    entryType,
    movementConceptCode,
    entryDate: form.entryDate,
    collectionDate: entryType === "PAYMENT" ? form.collectionDate || null : null,
    amount,
    grossCollectedAmount: entryType === "PAYMENT" ? amount : null,
    reference: form.reference || receipt || null,
    receiptNumber: receipt || null,
    description: form.description || null,
    paymentMethod: entryType === "PAYMENT" ? form.paymentMethod || null : null,
  };

  if (entryAppliesToCharge(entryType)) {
    payload.appliedToEntryId = Number(form.appliedToEntryId);
    payload.productionOrderId = orderIdFromCharge(charge);
    payload.orderKind = charge?.orderKind ? String(charge.orderKind) : null;
    return payload;
  }

  payload.productionOrderId = form.productionOrderId ? Number(form.productionOrderId) : null;
  payload.partialReleaseId = form.partialReleaseId ? Number(form.partialReleaseId) : null;
  payload.productShipmentId = form.productShipmentId ? Number(form.productShipmentId) : null;
  payload.vendorShipmentNumber = form.vendorShipmentNumber || null;
  return payload;
};
