import * as XLSX from "xlsx-js-style";
import { formatDateTimeGt, formatNowGt } from "./dateTimeHelper";
import { DIRECTIONS, DIRECTION_ORDER, fmtDay, summarizeKardex } from "./kardexModel";
import {
  MONEY,
  buildSummarySheetFrom,
  buildTableSheet,
  cell,
  centerStyle,
  numStyle,
  statusStyle,
  textStyle,
  totalNum,
  totalStyle,
  wrapStyle,
} from "./reportExcelKit";

const QTY = "#,##0.###";

/**
 * Excel del kardex: hoja «Resumen» (totales y cómo leerlo) y hoja «Movimientos» (una fila por movimiento,
 * con entra, sale y saldo en columnas separadas y el estado en color).
 * options: { title, rows, filtersLabel, showItem, itemLabel, showLocation, showColor, showValue }
 */
export function buildKardexWorkbook({
  title = "Kardex",
  rows,
  filtersLabel = "",
  showItem = true,
  itemLabel = "Ítem",
  showColor = false,
  showLocation = false,
  showValue = true,
}) {
  const subtitle = [filtersLabel, `Generado ${formatNowGt()}`].filter(Boolean).join("  ·  ");
  const sum = summarizeKardex(rows);

  const byDir = DIRECTION_ORDER.map((k) => {
    const list = rows.filter((r) => r.direction === k);
    return {
      key: k,
      count: list.length,
      qty: list.reduce((a, r) => a + r.qtyIn + r.qtyOut, 0),
      value: list.reduce((a, r) => a + r.value, 0),
    };
  });

  const summary = buildSummarySheetFrom({
    title,
    heading: "Movimientos, entradas, salidas y saldo",
    subtitle: sum.count ? `${subtitle}  ·  Del ${fmtDay(sum.from)} al ${fmtDay(sum.to)}` : subtitle,
    tableTitle: "Resumen por tipo",
    headers: showValue ? ["Tipo", "Movimientos", "Cantidad", "Valor (Q)"] : ["Tipo", "Movimientos", "Cantidad"],
    rows: byDir.map((d) => {
      const dir = DIRECTIONS[d.key];
      const line = [cell(dir.plural, statusStyle(dir.xlsText, dir.xlsFill)), cell(d.count, numStyle("#,##0")), cell(d.qty, numStyle(QTY))];
      if (showValue) line.push(cell(d.value, numStyle(MONEY)));
      return line;
    }),
    totalRow: showValue
      ? [cell("TOTAL", totalStyle), cell(sum.count, totalNum("#,##0")), cell(sum.totalIn + sum.totalOut, totalNum(QTY)), cell(sum.valueIn + sum.valueOut, totalNum(MONEY))]
      : [cell("TOTAL", totalStyle), cell(sum.count, totalNum("#,##0")), cell(sum.totalIn + sum.totalOut, totalNum(QTY))],
    notes: [
      `Entra: cantidad que aumentó la existencia. Sale: cantidad que la disminuyó. Neto del período: ${sum.net >= 0 ? "+" : ""}${sum.net.toLocaleString("es-GT", { maximumFractionDigits: 3 })}.`,
      sum.single && sum.closing !== null
        ? `Saldo inicial ${(sum.opening ?? 0).toLocaleString("es-GT", { maximumFractionDigits: 3 })} y saldo final ${sum.closing.toLocaleString("es-GT", { maximumFractionDigits: 3 })}.`
        : "Esta lista mezcla varios ítems o ubicaciones: el saldo se lee fila por fila.",
      "Saldo: lo que quedó en existencia después de cada movimiento.",
      "Hoja «Movimientos»: una fila por movimiento, con filtros en el encabezado.",
    ],
    widths: showValue ? [22, 16, 18, 20] : [22, 16, 18],
  });

  const columns = [
    { label: "Fecha", width: 17, get: (r) => formatDateTimeGt(r.date), style: () => centerStyle },
    {
      label: "Movimiento",
      width: 30,
      get: (r) => r.typeLabel,
      style: (r) => {
        const d = DIRECTIONS[r.direction];
        return statusStyle(d.xlsText, d.xlsFill);
      },
    },
    { label: "Referencia", width: 18, get: (r) => r.reference, style: () => textStyle },
  ];
  if (showItem) {
    columns.push(
      { label: "Código", width: 14, get: (r) => r.code, style: () => textStyle },
      { label: itemLabel, width: 34, get: (r) => r.name, style: () => textStyle }
    );
  }
  if (showColor) columns.push({ label: "Color", width: 16, get: (r) => r.color, style: () => textStyle });
  if (showLocation) columns.push({ label: "Ubicación", width: 26, get: (r) => r.location, style: () => textStyle });
  columns.push(
    { label: "Entra", width: 12, get: (r) => r.qtyIn || "", style: () => numStyle(QTY), total: "sum", totalFmt: QTY },
    { label: "Sale", width: 12, get: (r) => r.qtyOut || "", style: () => numStyle(QTY), total: "sum", totalFmt: QTY },
    { label: "Saldo antes", width: 13, get: (r) => (r.before === null ? "" : r.before), style: () => numStyle(QTY) },
    { label: "Saldo después", width: 14, get: (r) => (r.after === null ? "" : r.after), style: () => numStyle(QTY) }
  );
  if (showValue) {
    columns.push(
      { label: "Costo unitario (Q)", width: 16, get: (r) => r.unitCost || "", style: () => numStyle(MONEY) },
      { label: "Valor (Q)", width: 16, get: (r) => r.value || "", style: () => numStyle(MONEY) }
    );
  }
  columns.push({
    label: "Detalle",
    width: 60,
    get: (r) => [r.description, r.fifo ? `FIFO: ${r.fifo}` : ""].filter(Boolean).join(" · "),
    style: () => wrapStyle,
  });

  const detail = buildTableSheet({
    title: `${title}: movimientos`,
    subtitle,
    columns,
    rows,
    freezeCols: 2,
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, summary, "Resumen");
  XLSX.utils.book_append_sheet(wb, detail, "Movimientos");
  return wb;
}

export function exportKardexExcel({ fileName = "kardex", ...options }) {
  const wb = buildKardexWorkbook(options);
  XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
