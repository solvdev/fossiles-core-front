/**
 * Ayudas puras de la conciliación de ventas en línea: etiquetas, formatos, filtros y reglas de la interfaz.
 * No llaman a la API; se prueban con datos en memoria.
 */

export const STATUS_META = {
  PENDIENTE_REVISION: { label: "Pendiente de revisión", color: "warning", icon: "◔" },
  CONCILIADO_AUTO: { label: "Conciliado automático", color: "success", icon: "✓" },
  CONCILIADO_MANUAL: { label: "Conciliado manual", color: "success", icon: "✎" },
  CON_DIFERENCIAS: { label: "Con diferencias", color: "danger", icon: "≠" },
  INFORMACION_INCOMPLETA: { label: "Información incompleta", color: "info", icon: "…" },
  POSIBLE_DUPLICADO: { label: "Posible duplicado", color: "danger", icon: "⧉" },
  REQUIERE_AUTORIZACION: { label: "Requiere autorización", color: "warning", icon: "⚑" },
  CONCILIADO_CON_AJUSTE: { label: "Conciliado con ajuste", color: "success", icon: "±" },
  EXCLUIDO: { label: "Excluido", color: "secondary", icon: "∅" },
};

export const RECONCILED_STATUSES = ["CONCILIADO_AUTO", "CONCILIADO_MANUAL", "CONCILIADO_CON_AJUSTE"];

export const PROBLEM_LABELS = {
  PENDIENTE_AUTORIZACION: "Diferencia pendiente de autorización",
  PAGO_DUPLICADO: "Pago duplicado",
  MONTO_INCORRECTO: "Monto incorrecto",
  REFERENCIA_NO_ENCONTRADA: "Referencia no encontrada",
  VENTA_SIN_ENVIO: "Venta sin envío relacionado",
  DATOS_INSUFICIENTES: "Datos insuficientes",
  FECHA_INCONSISTENTE: "Fecha inconsistente",
  COMISION_INCORRECTA: "Comisión incorrecta",
  ENVIO_SIN_VENTA: "Envío sin venta asociada",
};

export const METHOD_LABELS = {
  CONTRA_ENTREGA: "Contra entrega",
  CONTRA_ENTREGA_DEPOSITO: "Contra entrega depósito",
  DEPOSITO_LISTO: "Depósito",
  DEPOSITO_PENDIENTE: "Depósito pendiente",
  TRANSFERENCIA_LISTA: "Transferencia",
  TRANSFERENCIA_PENDIENTE: "Transferencia pendiente",
  VISALINK_PAGADO: "Visalink",
  VISALINK_PENDIENTE: "Visalink pendiente",
  TARJETA_PAGADO: "TD/TC",
};

export const CARRIER_LABELS = {
  FORZA_DELIVERY: "Forza Delivery",
  GUATEX: "Guatex",
  MOTORISTA: "Motorista",
};

export const SOURCE_LABELS = {
  CARRIER: "Liquidación del transportista",
  BANK: "Extracto bancario",
  CARD: "Reporte de tarjeta",
  CASH: "Efectivo del motorista",
  MANUAL: "Captura manual",
};

export const EVENT_LABELS = {
  CASO_CREADO: "Caso creado",
  ESTADO_CAMBIO: "Cambio de estado",
  FONDO_APLICADO: "Fondo aplicado",
  APLICACION_ANULADA: "Aplicación anulada",
  CONCILIADO_MANUAL: "Conciliado a mano",
  REABIERTO: "Reabierto",
  EXCLUIDO: "Excluido",
  REINCORPORADO: "Reincorporado",
  OBSERVACION: "Observación",
  AJUSTE_PROPUESTO: "Ajuste propuesto",
  AJUSTE_AUTORIZADO: "Ajuste autorizado",
  AJUSTE_RECHAZADO: "Ajuste rechazado",
  MONTO_ACTUALIZADO: "Monto actualizado desde la venta",
  GUIA_ACTUALIZADA: "Guía actualizada",
  DESCARGADO: "Descargado en lote",
  LOTE_ANULADO: "Lote anulado",
};

export const labelOf = (map, key, fallback = "—") => (key && map[key]) || key || fallback;

export const formatQ = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `Q${n.toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Diferencia recibido − cobrado. Nunca depende solo del color: lleva símbolo y texto.
 * @returns {{text:string, tone:"zero"|"short"|"over"|"none", symbol:string}}
 */
export const describeDifference = (row) => {
  if (!row) return { text: "—", tone: "none", symbol: "" };
  if (row.status === "EXCLUIDO") return { text: "—", tone: "none", symbol: "" };
  if (!row.hasReceipts) return { text: "Sin fondo", tone: "short", symbol: "◌" };
  const d = Number(row.difference);
  if (!Number.isFinite(d) || d === 0) return { text: "Q0.00", tone: "zero", symbol: "=" };
  const abs = formatQ(Math.abs(d));
  return d < 0
    ? { text: `-${abs}`, tone: "short", symbol: "▼" }
    : { text: `+${abs}`, tone: "over", symbol: "▲" };
};

/** Bootstrap color de la diferencia para la celda. */
export const differenceColor = (tone) => (tone === "zero" ? "text-success" : tone === "none" ? "text-muted" : "text-danger");

/** Acción masiva segura: solo casos pendientes sin diferencia de monto y sin lote. */
export const canBulkReconcile = (row) =>
  !!row && row.status === "PENDIENTE_REVISION" && Number(row.difference) === 0 && !row.batchId;

/**
 * Una venta se puede liquidar cuando el monto cuadra al centavo: ya conciliada, o solo con avisos (los avisos se aceptan al
 * liquidar y quedan en el historial). Con diferencia, falla crítica, sin pago o excluida no entra nunca.
 */
export const canSettle = (row) =>
  !!row && !row.batchId && row.status !== "EXCLUIDO"
  && (RECONCILED_STATUSES.includes(row.status) || (row.status === "PENDIENTE_REVISION" && Number(row.difference) === 0))
  && Number(row.pendingBalance) === 0;

/** Lo que se ve al escribir el monto, antes de guardar. Sin tolerancia: un centavo de diferencia ya no cuadra. */
export const draftResult = (expected, amount) => {
  if (amount === "" || amount === null || amount === undefined || !Number.isFinite(Number(amount))) return null;
  const cents = Math.round(Number(amount) * 100) - Math.round(Number(expected) * 100);
  if (cents === 0) return { ok: true, text: "✓ Cuadra" };
  return { ok: false, text: `! ${cents < 0 ? "Faltan" : "Sobran"} ${formatQ(Math.abs(cents) / 100)}` };
};

/** Pagos pendientes de guardar → cuerpo del guardado en bloque. Lo vacío o en cero no se envía. */
export const draftsToItems = (drafts) =>
  Object.entries(drafts)
    .filter(([, d]) => d.matchExpected || (d.amount !== "" && Number(d.amount) > 0))
    .map(([id, d]) => ({ caseId: Number(id), amount: d.matchExpected ? null : Number(d.amount), matchExpected: !!d.matchExpected, reference: (d.reference || "").trim() || null }));

export const bulkSummary =(rows, selectedIds) => {
  const selected = rows.filter((r) => selectedIds.has(r.id));
  const safe = selected.filter(canBulkReconcile);
  return { selected: selected.length, safe: safe.length, skipped: selected.length - safe.length };
};

export const hasAction = (detail, action) => !!detail && Array.isArray(detail.actions) && detail.actions.includes(action);

// ───────── filtros ─────────

export const EMPTY_FILTERS = {
  from: "",
  to: "",
  method: "",
  carrier: "",
  sellerId: "",
  status: "",
  batch: "",
  q: "",
  problem: "",
};

/** Mes en curso hasta hoy (hoy se pasa para poder probarlo). */
export const defaultFilters = (todayYmd) => {
  const today = todayYmd || new Date().toISOString().slice(0, 10);
  return { ...EMPTY_FILTERS, from: `${today.slice(0, 8)}01`, to: today };
};

/** Convierte los filtros de pantalla en parámetros de la API. Lo vacío no se envía. */
export const toQueryParams = (filters, extra = {}) => {
  const params = {};
  const f = filters || {};
  if (f.from) params.from = f.from;
  if (f.to) params.to = f.to;
  if (f.method) params.method = f.method;
  if (f.carrier) params.carrier = f.carrier;
  if (f.sellerId) params.sellerId = f.sellerId;
  if (f.status) params.status = f.status;
  if (f.q && f.q.trim()) params.q = f.q.trim();
  if (f.problem) params.problem = f.problem;
  if (f.batch === "NONE") params.withoutBatch = true;
  else if (f.batch) params.batchId = f.batch;
  Object.entries(extra).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params[k] = v;
  });
  return params;
};

export const toQueryString = (params) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => search.set(k, String(v)));
  const s = search.toString();
  return s ? `?${s}` : "";
};

const STORAGE_KEY = "recon-filters-v1";

/** Persistencia razonable de filtros. Si el navegador no deja guardar, se sigue sin ella. */
export const loadFilters = (storage, fallback) => {
  try {
    const raw = storage && storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return { ...fallback, ...Object.fromEntries(Object.entries(parsed).filter(([k]) => k in EMPTY_FILTERS)) };
  } catch (e) {
    return fallback;
  }
};

export const saveFilters = (storage, filters) => {
  try {
    if (storage) storage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch (e) {
    // sin almacenamiento: no pasa nada
  }
};

export const monthOf = (ymd) => (ymd && ymd.length >= 7 ? ymd.slice(0, 7) : "");

/** Primer y último día de un mes AAAA-MM (el último respeta meses de 28, 29, 30 y 31 días). */
export const monthRange = (month) => {
  const [y, m] = String(month || "").split("-").map(Number);
  if (!y || !m) return { from: "", to: "" };
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
};

/** Texto corto para el resultado de una importación de fondos. */
export const describeImport = (r) => {
  if (!r) return "";
  if (r.duplicateFile) return "Este archivo ya se había importado. No se procesó nada de nuevo.";
  const parts = [`${r.imported} filas importadas`, `${r.autoApplied} aplicadas solas`];
  if (r.ambiguous) parts.push(`${r.ambiguous} ambiguas`);
  if (r.unmatched) parts.push(`${r.unmatched} sin coincidencia`);
  if (r.blocked) parts.push(`${r.blocked} bloqueadas`);
  if (r.duplicatedRows) parts.push(`${r.duplicatedRows} repetidas`);
  if (r.rejectedRows) parts.push(`${r.rejectedRows} rechazadas`);
  return parts.join(" · ");
};

/** Atajos de teclado de la bandeja: devuelve la acción o null. */
export const shortcutAction = (key, { typing, hasOpen }) => {
  if (key === "Escape") return hasOpen ? "close" : null;
  if (typing) return null;
  if (key === "/") return "search";
  if (key === "j") return "next";
  if (key === "k") return "prev";
  if (key === "Enter") return "open";
  if (key === "c") return "reconcile";
  return null;
};
