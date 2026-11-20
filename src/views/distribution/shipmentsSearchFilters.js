/**
 * Consulta «Envíos»: filtros ↔ URL (para compartir el enlace), filtros → API y etiquetas.
 * Todo es función pura.
 */

export const PAGE_SIZE = 50;
export const EXPORT_MAX = 500;

export const PROVENANCES = [
  { key: "DIRECTO", label: "Directo a kiosco", cls: "directo" },
  { key: "DISTRIBUCION", label: "Distribución", cls: "dist" },
  { key: "REPOSICION", label: "Reposición", cls: "repo" },
  { key: "OP", label: "Orden de producción", cls: "op" },
  { key: "PARCIAL", label: "Liberación parcial", cls: "parcial" },
  { key: "ENVP", label: "ENVP (producción)", cls: "envp" },
  { key: "ENVI", label: "ENVI interno", cls: "envi" },
  { key: "PENDIENTE", label: "Pendiente de producción", cls: "pend" },
  { key: "HISTORICO", label: "Histórico", cls: "hist" },
  { key: "OTRO", label: "Otro", cls: "hist" },
];

export const STATUSES = [
  { key: "DRAFT", label: "Borrador" },
  { key: "CONFIRMED", label: "Listo para enviar" },
  { key: "SENT", label: "En tránsito" },
  { key: "DELIVERED", label: "Entregado" },
  { key: "CANCELLED", label: "Cancelado" },
];

export const DATE_FIELDS = [
  { key: "created", label: "de creación" },
  { key: "sent", label: "de envío" },
  { key: "received", label: "de recepción" },
  { key: "doc", label: "del documento" },
];

export const ORIGINS = [
  { key: "DEVOLUCIONES", label: "Devoluciones" },
  { key: "BODEGA_PT", label: "Bodega PT" },
  { key: "MIXTO", label: "Mixto (las dos cubetas)" },
];

export const OP_TYPES = ["OPK", "OPCK", "OPC", "OPV", "OPL", "OPI"];

export const ORDERS = [
  { key: "date-desc", label: "Más recientes primero" },
  { key: "date-asc", label: "Más antiguos primero" },
  { key: "kiosk", label: "Kiosco (por número de envío)" },
  { key: "number", label: "Número de envío" },
  { key: "units", label: "Más unidades" },
];

const provenanceByKey = Object.fromEntries(PROVENANCES.map((p) => [p.key, p]));
export const provenanceMeta = (key) => provenanceByKey[key] || { key, label: key || "—", cls: "hist" };
export const provenanceLabel = (item) => provenanceMeta(item?.provenance).label;
export const dateFieldLabel = (key) => (DATE_FIELDS.find((d) => d.key === key) || DATE_FIELDS[0]).label;
export const originLabel = (key) => (ORIGINS.find((o) => o.key === key) || {}).label || "";

/** Texto en la URL → nombre del filtro del API. */
const TEXT_PARAMS = [
  ["envio", "shipmentNumber", "Envío"],
  ["distribucion", "distributionNumber", "Distribución"],
  ["op", "productionOrderCode", "OP"],
  ["producto", "product", "Producto"],
  ["persona", "person", "Persona"],
  ["notas", "notes", "Notas"],
];
export const TEXT_FILTERS = TEXT_PARAMS.map(([, key, label]) => ({ key, label }));

const csv = (value) =>
  String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

export const emptyFilters = () => ({
  dateField: "created",
  from: "",
  to: "",
  kioskIds: [],
  provenances: [],
  statuses: [],
  shipmentNumber: "",
  distributionNumber: "",
  productionOrderCode: "",
  productionOrderType: "",
  product: "",
  dispatchOrigin: "",
  receiptDifference: false,
  pendingProduction: false,
  person: "",
  notes: "",
  order: "date-desc",
  page: 0,
});

export const filtersFromParams = (params) => {
  const f = emptyFilters();
  const field = params.get("fecha");
  if (DATE_FIELDS.some((d) => d.key === field)) f.dateField = field;
  f.from = params.get("desde") || "";
  f.to = params.get("hasta") || "";
  f.kioskIds = csv(params.get("kiosco")).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  f.provenances = csv(params.get("procedencia")).map((v) => v.toUpperCase());
  f.statuses = csv(params.get("estado")).map((v) => v.toUpperCase());
  TEXT_PARAMS.forEach(([param, key]) => {
    f[key] = params.get(param) || "";
  });
  f.productionOrderType = (params.get("tipoOp") || "").toUpperCase();
  f.dispatchOrigin = (params.get("origen") || "").toUpperCase();
  f.receiptDifference = params.get("diferencia") === "1";
  f.pendingProduction = params.get("pendiente") === "1";
  const order = params.get("orden");
  if (ORDERS.some((o) => o.key === order)) f.order = order;
  const page = Number(params.get("pagina"));
  f.page = Number.isFinite(page) && page > 1 ? page - 1 : 0;
  return f;
};

/** Solo lo que difiere del estado vacío, para que el enlace sea corto. */
export const paramsFromFilters = (f) => {
  const p = new URLSearchParams();
  if (f.dateField && f.dateField !== "created") p.set("fecha", f.dateField);
  if (f.from) p.set("desde", f.from);
  if (f.to) p.set("hasta", f.to);
  if (f.kioskIds?.length) p.set("kiosco", f.kioskIds.join(","));
  if (f.provenances?.length) p.set("procedencia", f.provenances.join(","));
  if (f.statuses?.length) p.set("estado", f.statuses.join(","));
  TEXT_PARAMS.forEach(([param, key]) => {
    const v = String(f[key] || "").trim();
    if (v) p.set(param, v);
  });
  if (f.productionOrderType) p.set("tipoOp", f.productionOrderType);
  if (f.dispatchOrigin) p.set("origen", f.dispatchOrigin);
  if (f.receiptDifference) p.set("diferencia", "1");
  if (f.pendingProduction) p.set("pendiente", "1");
  if (f.order && f.order !== "date-desc") p.set("orden", f.order);
  if (f.page > 0) p.set("pagina", String(f.page + 1));
  return p;
};

export const apiFilters = (f, { page = f.page, size = PAGE_SIZE } = {}) => ({
  dateField: f.dateField,
  from: f.from,
  to: f.to,
  kioskIds: f.kioskIds,
  provenances: f.provenances,
  statuses: f.statuses,
  shipmentNumber: f.shipmentNumber.trim(),
  distributionNumber: f.distributionNumber.trim(),
  productionOrderCode: f.productionOrderCode.trim(),
  productionOrderType: f.productionOrderType,
  product: f.product.trim(),
  dispatchOrigin: f.dispatchOrigin,
  receiptDifference: f.receiptDifference,
  pendingProduction: f.pendingProduction,
  person: f.person.trim(),
  notes: f.notes.trim(),
  order: f.order,
  page,
  size,
});

/** Atajos de fecha: los últimos N días hasta hoy (fecha local YYYY-MM-DD). */
export const lastDaysRange = (days, today = new Date()) => {
  const ymd = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const from = new Date(today);
  from.setDate(today.getDate() - days);
  return { from: ymd(from), to: ymd(today) };
};

/** Fecha que se muestra en la columna según el campo elegido. */
export const itemDate = (item, dateField) => {
  if (dateField === "sent") return item.sentAt;
  if (dateField === "received") return item.receivedAt;
  if (dateField === "doc") return item.documentDate;
  return item.createdAt;
};

/** Subtítulo de la procedencia: distribución, OP o «sin distribución». */
export const provenanceDetail = (item) => {
  if (item.provenance === "DIRECTO") return item.distributionNumber ? `${item.distributionNumber} (antigua)` : "sin distribución";
  const parts = [];
  if (item.productionOrderCode) parts.push(item.productionOrderCode);
  if (item.distributionNumber) parts.push(item.distributionNumber);
  return parts.join(" · ");
};

export const linesSummary = (item, max = 2) => {
  const lines = Array.isArray(item.products) ? item.products : [];
  if (!lines.length) return item.provenance === "HISTORICO" ? "Sin productos (histórico)" : "Sin productos";
  const text = lines
    .slice(0, max)
    .map((l) => [l.productCode, l.colorName, l.size].filter(Boolean).join(" "))
    .join(", ");
  return lines.length > max ? `${text} +${lines.length - max}` : text;
};
