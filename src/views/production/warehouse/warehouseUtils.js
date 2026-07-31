import { getTodayYmdGuatemala, shiftYmdGuatemala } from "utils/dateTimeHelper";

export const RECENT_DATE_OPTIONS = [
  { value: "7", label: "Últimos 7 días" },
  { value: "30", label: "Últimos 30 días" },
  { value: "90", label: "Últimos 90 días" },
  { value: "ALL", label: "Todas las fechas" },
];

export const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En Progreso",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

export const STATUS_STYLES = {
  PENDING: { backgroundColor: "#ffc107", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  IN_PROGRESS: { backgroundColor: "#17a2b8", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  COMPLETED: { backgroundColor: "#28a745", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  CANCELLED: { backgroundColor: "#dc3545", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
};

export const DEFAULT_BADGE_STYLE = { backgroundColor: "#6c757d", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 };

export const SALE_STATUS_STYLES = {
  PENDIENTE: { backgroundColor: "#ffc107", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  EN_PRODUCCION: { backgroundColor: "#17a2b8", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  PRODUCIDO: { backgroundColor: "#007bff", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  ENVIADO: { backgroundColor: "#28a745", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  ENTREGADO: { backgroundColor: "#343a40", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  CANCELADO: { backgroundColor: "#dc3545", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
};

export const DISPATCH_TYPE_LABELS = {
  KIOSK_DISTRIBUTION: "Distribución a Kioscos",
  CUSTOMER_SHIPMENTS: "Envíos a Clientes",
  DIRECT: "Producción Directa",
};

export const DISPATCH_TYPE_STYLES = {
  KIOSK_DISTRIBUTION: { backgroundColor: "#28a745", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  CUSTOMER_SHIPMENTS: { backgroundColor: "#17a2b8", color: "#fff", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
  DIRECT: { backgroundColor: "#e9ecef", color: "#333", padding: "4px 8px", borderRadius: "4px", fontSize: "0.8em", fontWeight: 600 },
};

export const REJECTION_REASON_OPTIONS = [
  "Costura defectuosa",
  "Color incorrecto",
  "Acabado defectuoso",
  "Medida incorrecta",
];

export const UNIT_RECEIPT_LABELS = {
  PENDING: "Pendiente",
  RECEIVED: "Recibida",
  REJECTED: "Rechazada",
};

export const getOrderTypeGroup = (order) => {
  if (order?.orderType === "VENTA_EN_LINEA") return "VENTA_EN_LINEA";
  if (order?.orderType === "DISTRIBUTION") return "DISTRIBUTION";
  return "NORMAL";
};

/** Fecha de la OP para filtrar (YYYY-MM-DD), alineada a lo que se muestra en el código. */
export const getOrderFilterDateYmd = (order) => {
  const raw =
    order?.startDate ||
    order?.deliveryDate ||
    order?.createdAt ||
    order?.productionOrderCreatedAt ||
    "";
  const s = String(raw).trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
};

export const filterOrders = (orders, { orderTypeFilter, searchTerm, recent = "30" }) => {
  const term = String(searchTerm || "").trim().toLowerCase();
  let minDate = null;
  if (recent && recent !== "ALL") {
    const days = Number(recent);
    if (Number.isFinite(days) && days > 0) {
      minDate = shiftYmdGuatemala(getTodayYmdGuatemala(), -(days - 1));
    }
  }

  return (orders || [])
    .filter((order) => {
      if (orderTypeFilter !== "ALL" && getOrderTypeGroup(order) !== orderTypeFilter) {
        return false;
      }
      if (minDate) {
        const date = getOrderFilterDateYmd(order);
        if (!date || date < minDate) return false;
      }
      if (!term) return true;
      const haystack = `${order.productionOrderCode || ""} ${order.orderType || ""} ${order.distributionNumber || ""} ${order.deliveryDate || ""} ${order.startDate || ""}`
        .toLowerCase();
      return haystack.includes(term);
    })
    .sort((a, b) => {
      const da = getOrderFilterDateYmd(a);
      const db = getOrderFilterDateYmd(b);
      return db.localeCompare(da);
    });
};

export const getOrderQtyProgress = (order, summary) => {
  if (summary) {
    const total = Number(summary.totalUnits || 0);
    const produced = Number(summary.receivedUnits || 0) + Number(summary.rejectedUnits || 0);
    const pending = Number(summary.pendingUnits || 0);
    const pct = total > 0 ? Math.round((produced / total) * 100) : 0;
    return { total, produced, pending, pct };
  }
  const total = Number(order?.totalQuantity || 0);
  const produced = (order?.items || []).reduce((sum, item) => {
    const planned = Number(item?.quantity || 0);
    const received = Number(item?.warehouseReceivedQty || 0);
    return sum + Math.min(Math.max(received, 0), Math.max(planned, 0));
  }, 0);
  const pending = Math.max(total - produced, 0);
  const pct = total > 0 ? Math.round((produced / total) * 100) : 0;
  return { total, produced, pending, pct };
};

export const getPendingReceiptQty = (order) => {
  return (order.items || []).reduce((sum, item) => {
    const planned = Number(item.quantity || 0);
    const received = Number(item.warehouseReceivedQty || 0);
    return sum + Math.max(planned - received, 0);
  }, 0);
};
