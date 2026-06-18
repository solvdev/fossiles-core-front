import * as XLSX from "xlsx";
import { formatDateTimeGt } from "utils/dateTimeHelper";

function docLabel(r) {
  return [r.referenceNumber, r.orderCode, r.distributionCode].filter(Boolean).join(" / ") || "";
}

export function exportProductInventoryOutflowReportExcel(rows, fileName = "reporte-salidas-inventario.xlsx") {
  const list = Array.isArray(rows) ? rows : [];
  const data = list.map((r) => ({
    Fecha: formatDateTimeGt(r.movementDate),
    Origen: r.sourceLabel || r.sourceCategory || "",
    "Tipo OP": r.orderType || "",
    Documento: docLabel(r),
    Producto: r.productCode ? `${r.productCode} - ${r.productName || ""}` : r.productName || "",
    Color: r.colorName || "",
    "Ubicación origen": r.locationName || "",
    Destino: r.destinationLocationName || "",
    Cantidad: r.quantity != null ? Math.abs(parseFloat(r.quantity) || 0) : "",
    "Saldo antes": r.quantityBefore ?? "",
    "Saldo después": r.quantityAfter ?? "",
    Descripción: r.description || "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Salidas");
  XLSX.writeFile(wb, fileName);
}
