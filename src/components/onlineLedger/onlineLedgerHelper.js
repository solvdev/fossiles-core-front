/**
 * Libro de ventas en línea: cálculos y etiquetas compartidos por las tres hojas (Ventas, Comisiones, Moto).
 * El cálculo de comisiones es el mismo del backend (OnlineSaleLedgerService.commissions), que es el que va al Excel.
 */

export const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const formatQ = (v) =>
  `Q${num(v).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatMoney = (v) =>
  v === null || v === undefined || v === ""
    ? ""
    : num(v).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatDay = (iso) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const pad = (n) => String(n).padStart(2, "0");
export const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Primer y último día del mes de `iso` desplazado `delta` meses. */
export const monthRange = (iso, delta = 0) => {
  const base = iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`) : new Date();
  const first = new Date(base.getFullYear(), base.getMonth() + delta, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return { from: toIso(first), to: toIso(last) };
};

export const periodLabel = (from, to) => {
  if (!from || !to) return "Todo el historial";
  const full = monthRange(from);
  if (full.from === from && full.to === to) {
    const text = new Date(`${from}T12:00:00`).toLocaleDateString("es-GT", { month: "long", year: "numeric" });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return from === to ? formatDay(from) : `${formatDay(from)} al ${formatDay(to)}`;
};

// ── Transporte: motorista amarillo, Forza naranja, Guatex celeste ──
export const CARRIERS = {
  MOTORISTA: { key: "moto", label: "Motorista" },
  FORZA: { key: "forza", label: "Forza" },
  GUATEX: { key: "guatex", label: "Guatex" },
};

export const carrierOf = (carrier) => {
  const c = String(carrier || "").toUpperCase();
  if (c.startsWith("MOTO")) return CARRIERS.MOTORISTA;
  if (c.startsWith("FORZA")) return CARRIERS.FORZA;
  if (c.startsWith("GUATEX")) return CARRIERS.GUATEX;
  return { key: "none", label: c ? c.replace(/_/g, " ") : "Sin transporte" };
};

// Listas para escribir en la hoja (el servidor reconoce estas palabras y también abreviaturas).
export const CARRIER_OPTIONS = ["Motorista", "Forza", "Guatex"];

// ── Red social: emoji + nombre ──
const SOCIAL = {
  WHATSAPP: { icon: "💬", label: "WhatsApp" },
  FACEBOOK: { icon: "📘", label: "Facebook" },
  INSTAGRAM: { icon: "📷", label: "Instagram" },
  WEB: { icon: "🌐", label: "Página web" },
  TIKTOK: { icon: "🎵", label: "TikTok" },
};
export const SOCIAL_OPTIONS = Object.values(SOCIAL).map((s) => s.label);
export const socialOf = (sn) => {
  const key = String(sn || "").toUpperCase().replace(/\s+/g, "_");
  if (SOCIAL[key]) return SOCIAL[key];
  if (key.includes("WEB")) return SOCIAL.WEB;
  const text = String(sn || "").replace(/_/g, " ").trim();
  return { icon: "", label: text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "" };
};

const STATUS = {
  PENDIENTE: { label: "Pendiente", tone: "wait" },
  EN_PRODUCCION: { label: "En producción", tone: "info" },
  PRODUCIDO: { label: "Producido", tone: "info" },
  ENVIADO: { label: "Enviado", tone: "info" },
  ENTREGADO: { label: "Entregado", tone: "ok" },
  CANCELADO: { label: "Cancelado", tone: "void" },
  ANULADA: { label: "Anulado", tone: "void" },
  DEVOLUCION: { label: "Devolución", tone: "ret" },
};
export const STATUS_OPTIONS = ["Pendiente", "En producción", "Producido", "Enviado", "Entregado", "Cancelado", "Anulado", "Devolución"];
export const statusOf = (status) =>
  STATUS[String(status || "").toUpperCase()] || { label: status || "—", tone: "wait" };

export const isReturn = (row) => String(row.status || "").toUpperCase() === "DEVOLUCION";
export const isVoided = (row) => ["ANULADA", "CANCELADO"].includes(String(row.status || "").toUpperCase());
export const isExchange = (row) => String(row.observations || "").trim().toUpperCase().startsWith("CAMBIO");

/** Clase de la fila: el estado manda sobre el transporte (como la leyenda del Excel). */
export const rowTone = (row) => {
  if (isVoided(row)) return "void";
  if (isReturn(row)) return "ret";
  if (isExchange(row)) return "exch";
  return "";
};

export const netOf = (row) =>
  row.netAmount !== null && row.netAmount !== undefined ? num(row.netAmount) : num(row.totalAmount) - num(row.shippingCost);

/** Fecha de envío y forma de pago que se muestran cuando Contabilidad no ha anotado otra. */
export const effectiveSentDate = (row) => row.sentDate || row.dispatchedDate || "";
export const effectiveAuthorization = (row) => row.accountingAuthorization || row.paymentAuthorization || "";
export const effectivePaymentForm = (row) => row.paymentForm || row.paymentMethodDisplay || "";

/** Falta el envío real de una venta que sí salió (no anulada). */
export const isPendingReview = (row) =>
  !isVoided(row) && (row.realShippingCost === null || row.realShippingCost === undefined);

export const sellerLabel = (row) => String(row.salesperson || "").trim() || "Sin vendedor";

/**
 * Comisión por vendedor, igual que la hoja de Excel:
 * ventas − devoluciones − anuladas − envío real − comisiones del transporte = subtotal;
 * subtotal − IVA = ventas netas; 2% de las netas − faltantes = total a pagar.
 */
export const computeCommissions = (rows, commissionRate = 0.02, vatRate = 0.12) => {
  const bySeller = new Map();
  (rows || []).forEach((r) => {
    const label = sellerLabel(r);
    const key = label.toUpperCase();
    if (!bySeller.has(key)) {
      bySeller.set(key, {
        seller: label, salesCount: 0, sales: 0, returnsCount: 0, returns: 0, voidedCount: 0, voided: 0,
        realShipping: 0, carrierCommissions: 0, shortages: 0, pending: 0,
      });
    }
    const acc = bySeller.get(key);
    const total = num(r.totalAmount);
    acc.salesCount += 1;
    acc.sales += total;
    if (isReturn(r)) { acc.returnsCount += 1; acc.returns += total; }
    else if (isVoided(r)) { acc.voidedCount += 1; acc.voided += total; }
    acc.realShipping += num(r.realShippingCost);
    acc.carrierCommissions += num(r.carrierCommission);
    acc.shortages += num(r.shortageAmount);
    if (isPendingReview(r)) acc.pending += 1;
  });
  return Array.from(bySeller.values())
    .map((acc) => {
      const subtotal = acc.sales - acc.returns - acc.voided - acc.realShipping - acc.carrierCommissions;
      const vat = round2((subtotal / (1 + vatRate)) * vatRate);
      const netSales = subtotal - vat;
      const commission = round2(netSales * commissionRate);
      return { ...acc, subtotal, vat, netSales, commission, totalToPay: commission - acc.shortages };
    })
    .sort((a, b) => b.sales - a.sales);
};

/** «Dato de contabilidad»: venta por transporte y el mismo cálculo sobre todo el periodo. */
export const computeAccountingSummary = (rows, commissionRate = 0.02, vatRate = 0.12) => {
  const s = {
    byCarrier: { moto: 0, guatex: 0, forza: 0, none: 0 },
    commissionByCarrier: { moto: 0, guatex: 0, forza: 0, none: 0 },
    total: 0, realShipping: 0, returnsCount: 0, returns: 0, voidedCount: 0, voided: 0, shortages: 0,
  };
  (rows || []).forEach((r) => {
    const k = carrierOf(r.carrier).key;
    const total = num(r.totalAmount);
    s.byCarrier[k] += total;
    s.commissionByCarrier[k] += num(r.carrierCommission);
    s.total += total;
    s.realShipping += num(r.realShippingCost);
    if (isReturn(r)) { s.returnsCount += 1; s.returns += total; }
    else if (isVoided(r)) { s.voidedCount += 1; s.voided += total; }
    s.shortages += num(r.shortageAmount);
  });
  const commissions = Object.values(s.commissionByCarrier).reduce((a, b) => a + b, 0);
  s.subtotal = s.total - s.realShipping - commissions - s.returns - s.voided;
  s.vat = round2((s.subtotal / (1 + vatRate)) * vatRate);
  s.netSales = s.subtotal - s.vat;
  s.commission = round2(s.netSales * commissionRate);
  s.totalToPay = s.commission - s.shortages;
  return s;
};

/** Texto en minúsculas y sin tildes para buscar. */
export const fold = (text) =>
  String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const matchesQuery = (row, query) => {
  const q = fold(query).trim();
  if (!q) return true;
  const haystack = fold([
    row.customerName, row.phone, row.address, row.products, row.colors, row.shipmentNumber, row.guideNumber,
    row.paymentAuthorization, row.accountingAuthorization, row.salesperson, row.email, row.depositSlipNumber, row.accountingNote,
  ].join(" | "));
  return q.split(/\s+/).every((word) => haystack.includes(word));
};
