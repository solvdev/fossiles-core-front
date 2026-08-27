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

/**
 * Agrupa piezas de recepción por producto + color + talla (línea OP).
 * Así se puede recibir/rechazar por lote en vez de pieza por pieza.
 */
export const warehouseUnitGroupKey = (unit) => {
  const itemId = unit?.productionOrderItemId ?? unit?.productId ?? "x";
  const colorId = unit?.colorId ?? "";
  const size = String(unit?.sizeKey || "").trim();
  return `${itemId}|${colorId}|${size}`;
};

export const groupWarehouseUnits = (units = []) => {
  const map = new Map();
  (units || []).forEach((unit) => {
    const key = warehouseUnitGroupKey(unit);
    if (!map.has(key)) {
      map.set(key, {
        key,
        productionOrderItemId: unit.productionOrderItemId,
        productId: unit.productId,
        productCode: unit.productCode,
        productName: unit.productName,
        colorId: unit.colorId,
        colorName: unit.colorName,
        sizeKey: unit.sizeKey || null,
        units: [],
        pendingUnits: [],
        receivedCount: 0,
        rejectedCount: 0,
        shippedCount: 0,
      });
    }
    const group = map.get(key);
    group.units.push(unit);
    const status = unit.receiptStatus || "PENDING";
    const shipped = !!unit.shippedAt || unit.shipped;
    if (shipped) {
      group.shippedCount += 1;
    } else if (status === "RECEIVED") {
      group.receivedCount += 1;
    } else if (status === "REJECTED") {
      group.rejectedCount += 1;
    } else {
      group.pendingUnits.push(unit);
    }
  });

  return [...map.values()]
    .map((group) => {
      const pendingUnits = [...group.pendingUnits].sort((a, b) =>
        String(a.unitLabel || "").localeCompare(String(b.unitLabel || ""), "es", { numeric: true })
      );
      return {
        ...group,
        pendingUnits,
        pendingCount: pendingUnits.length,
        totalCount: group.units.length,
      };
    })
    .sort((a, b) => {
      const code = String(a.productCode || "").localeCompare(String(b.productCode || ""), "es");
      if (code !== 0) return code;
      const color = String(a.colorName || "").localeCompare(String(b.colorName || ""), "es");
      if (color !== 0) return color;
      return String(a.sizeKey || "").localeCompare(String(b.sizeKey || ""), "es", { numeric: true });
    });
};

export const formatWarehouseGroupTitle = (group) => {
  const parts = [];
  if (group?.colorName) parts.push(group.colorName);
  if (group?.productCode) parts.push(group.productCode);
  if (group?.sizeKey) parts.push(`Talla ${group.sizeKey}`);
  return parts.join(" · ") || "Producto";
};

export const ORDER_TYPE_FILTER_OPTIONS = [
  { value: "ALL", label: "Todas" },
  { value: "VENTA_EN_LINEA", label: "OPL (en línea)" },
  { value: "DISTRIBUTION", label: "Distribución" },
  { value: "NORMAL", label: "OP normales" },
];

/** Presets de trabajo diario en recepción PT. */
export const RECEIPT_WORK_PRESETS = [
  { value: "PENDING", label: "Pendientes de recibir" },
  { value: "OPL", label: "Solo OPL" },
  { value: "TODAY", label: "De hoy" },
  { value: "ALL", label: "Todas visibles" },
];

export const getOrderTypeGroup = (order) => {
  if (order?.orderType === "VENTA_EN_LINEA") return "VENTA_EN_LINEA";
  if (order?.orderType === "DISTRIBUTION") return "DISTRIBUTION";
  return "NORMAL";
};

export const getOrderTypeLabel = (order) => {
  const group = getOrderTypeGroup(order);
  if (group === "VENTA_EN_LINEA") return "OPL";
  if (group === "DISTRIBUTION") return "Distribución";
  return "OP";
};

export const getOrderCustomerHint = (order) => {
  const names = (order?.customerShipments || [])
    .map((s) => String(s?.customerName || "").trim())
    .filter(Boolean);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
};

export const getOrderProductHint = (order, max = 3) => {
  const codes = [];
  const seen = new Set();
  (order?.items || []).forEach((item) => {
    const code = String(item?.productCode || "").trim();
    if (!code || seen.has(code)) return;
    seen.add(code);
    codes.push(code);
  });
  if (codes.length === 0) return "Sin productos";
  const shown = codes.slice(0, max).join(" · ");
  return codes.length > max ? `${shown} +${codes.length - max}` : shown;
};

const buildOrderSearchHaystack = (order) => {
  const itemBits = (order?.items || [])
    .map((item) => `${item?.productCode || ""} ${item?.productName || ""} ${item?.colorName || ""}`)
    .join(" ");
  const customerBits = (order?.customerShipments || [])
    .map((s) => `${s?.customerName || ""} ${s?.saleNumber || ""} ${s?.address || ""} ${s?.observations || ""}`)
    .join(" ");
  const kioskBits = (order?.kioskShipments || [])
    .map((s) => `${s?.shipmentNumber || ""} ${s?.locationName || ""}`)
    .join(" ");
  return [
    order?.productionOrderCode,
    order?.orderType,
    order?.distributionNumber,
    order?.deliveryDate,
    order?.startDate,
    order?.observations,
    itemBits,
    customerBits,
    kioskBits,
  ].join(" ").toLowerCase();
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

export const filterOrders = (orders, {
  orderTypeFilter = "ALL",
  searchTerm = "",
  recent = "30",
  receiptPreset = "ALL",
  pendingFirst = false,
} = {}) => {
  const term = String(searchTerm || "").trim().toLowerCase();
  const today = getTodayYmdGuatemala();
  let minDate = null;
  if (recent && recent !== "ALL") {
    const days = Number(recent);
    if (Number.isFinite(days) && days > 0) {
      minDate = shiftYmdGuatemala(today, -(days - 1));
    }
  }

  let typeFilter = orderTypeFilter;
  if (receiptPreset === "OPL") typeFilter = "VENTA_EN_LINEA";

  return (orders || [])
    .filter((order) => {
      if (typeFilter !== "ALL" && getOrderTypeGroup(order) !== typeFilter) {
        return false;
      }
      if (receiptPreset === "PENDING" && getPendingReceiptQty(order) <= 0) {
        return false;
      }
      if (receiptPreset === "TODAY") {
        const date = getOrderFilterDateYmd(order);
        if (date !== today) return false;
      }
      if (minDate) {
        const date = getOrderFilterDateYmd(order);
        if (!date || date < minDate) return false;
      }
      if (!term) return true;
      return buildOrderSearchHaystack(order).includes(term);
    })
    .sort((a, b) => {
      if (pendingFirst) {
        const pa = getPendingReceiptQty(a) > 0 ? 0 : 1;
        const pb = getPendingReceiptQty(b) > 0 ? 0 : 1;
        if (pa !== pb) return pa - pb;
      }
      const da = getOrderFilterDateYmd(a);
      const db = getOrderFilterDateYmd(b);
      return db.localeCompare(da);
    });
};

export const PAGE_SIZE_RECEIPT = 20;

export const getOrderQtyProgress = (order, summary) => {
  const ws = summary || order?.warehouseWorkspaceSummary;
  if (ws) {
    const total = Number(ws.totalUnits || 0);
    const produced = Number(ws.receivedUnits || 0) + Number(ws.rejectedUnits || 0);
    const pending = Number(ws.pendingUnits || 0);
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
  const ws = order?.warehouseWorkspaceSummary;
  if (ws) return Number(ws.pendingUnits || 0);
  return (order.items || []).reduce((sum, item) => {
    const planned = Number(item.quantity || 0);
    const received = Number(item.warehouseReceivedQty || 0);
    return sum + Math.max(planned - received, 0);
  }, 0);
};
