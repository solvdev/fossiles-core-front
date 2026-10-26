import { datedFileName, exportValueTableExcel, exportValueTablePdf, fmtGeneratedAt } from "./valueTableExport";

/**
 * Exportación del "Valor del inventario" por kiosco (Finanzas > Valor del inventario):
 * sólo kiosco y valor en producto (existencias × precio de venta del POS), con total.
 */

export { fmtGeneratedAt };

/** Filas de la tabla (función pura): [kiosco, valor] y el total al final. */
export const buildStockValueRows = (data) => [
  ...(data?.sites || []).map((s) => [s.siteName, Number(s.saleValue) || 0]),
  ["Total", Number(data?.totals?.saleValue) || 0],
];

const table = (data, ext) => ({
  title: "Valor del inventario por kiosco",
  subtitle: `Existencias al ${fmtGeneratedAt(data?.generatedAt)} · a precio de venta`,
  headers: ["Kiosco", "Valor en producto"],
  rows: buildStockValueRows(data),
  sheetName: "Valor inventario",
  fileName: datedFileName("Valor_Inventario_Kioscos", data?.generatedAt, ext),
});

export const exportStockValueExcel = (data) => exportValueTableExcel(table(data, "xlsx"));

export const exportStockValuePdf = (data) => exportValueTablePdf(table(data, "pdf"));
