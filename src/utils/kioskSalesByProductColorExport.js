import * as XLSX from "xlsx-js-style";
import { applyKioskReportTableStyles } from "./kioskReportExcelStyle";
import { formatDateGt } from "./dateTimeHelper";

const moneyFmt = '"Q"#,##0.00';

export const periodLabel = (startDate, endDate) => {
  const from = startDate || "";
  const to = endDate || from;
  if (!from) return "";
  if (from === to) return formatDateGt(from);
  return `${formatDateGt(from)} — ${formatDateGt(to)}`;
};

export const formatShare = (qty, total) => {
  const n = Number(qty || 0);
  const t = Number(total || 0);
  if (t <= 0) return "0%";
  return `${((n * 100) / t).toFixed(1)}%`;
};

export const exportKioskSalesByProductColorExcel = ({
  report,
  rows,
  columns,
  kioskLabel,
  generatedByName,
  sheetTitle = "Ventas y stock",
}) => {
  const wb = XLSX.utils.book_new();
  const header = columns.map((col) => col.label);
  const aoa = [
    ["Ventas, entradas y stock de kiosko por producto y color"],
    [kioskLabel || "Todos los kioskos"],
    [`Periodo: ${periodLabel(report?.startDate, report?.endDate)}`],
    [`Generado por: ${generatedByName || ""}`],
    ["Entradas = recepción y traslados in del periodo. Stock = existencias actuales. Sin ventas anuladas ni kioskos piloto."],
    [],
    header,
    ...rows.map((row) => columns.map((col) => col.excelValue(row))),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const headerRow = 6;
  const numCols = columns
    .map((col, idx) => (col.numeric ? idx : null))
    .filter((idx) => idx != null);
  applyKioskReportTableStyles(ws, headerRow, rows.length, columns.length, {
    moneyFmt,
    numCols,
  });
  ws["!cols"] = columns.map((col) => ({ wch: col.width || 14 }));
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0, 31));
  const from = report?.startDate || "";
  const to = report?.endDate || from;
  XLSX.writeFile(wb, `ventas_kiosko_producto_color_${from}_${to}.xlsx`);
};
