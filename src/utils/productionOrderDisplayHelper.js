import { formatDateDdMmYyGt } from "./dateTimeHelper";

const contextSuffix = (order) => {
  if (!order) return "";
  if (order.orderType === "DISTRIBUTION" && order.distributionNumber) {
    return String(order.distributionNumber);
  }
  return order.customerName || order.originLabel || order.orderType || "";
};

/** Código (o correlativo) y fecha corta; sin sufijo de cliente/tipo */
export function formatProductionOrderCodeDate(order) {
  if (!order) return "";
  const code = order.code || order.productionOrderCode || "—";
  const dateStr = formatDateDdMmYyGt(order.startDate || order.createdAt);
  return dateStr ? `${code} - ${dateStr}` : code;
}

/** Etiqueta para listas, selects y autocompletado: código - fecha · contexto */
export function formatProductionOrderSelectLabel(order) {
  if (!order) return "";
  const code = order.code || order.productionOrderCode || "—";
  const dateStr = formatDateDdMmYyGt(order.startDate || order.createdAt);
  const ctx = contextSuffix(order);
  const core = dateStr ? `${code} - ${dateStr}` : code;
  if (ctx) return `${core} · ${ctx}`;
  return core;
}
