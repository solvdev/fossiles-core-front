import * as XLSX from "xlsx-js-style";

/**
 * Piezas comunes para que todos los Excel de los reportes de inventario se vean igual:
 * título, línea de filtros, encabezado oscuro, bordes suaves, números con formato,
 * encabezado y primeras columnas congelados, filtros y fila de totales.
 */

export const NAVY = "1F2937";

const line = { style: "thin", color: { rgb: "D1D5DB" } };
export const box = { top: line, right: line, bottom: line, left: line };

export const titleStyle = { font: { bold: true, sz: 16, color: { rgb: NAVY } } };
export const metaStyle = { font: { sz: 10, color: { rgb: "6B7280" } } };
export const sectionStyle = { font: { bold: true, sz: 12, color: { rgb: NAVY } } };
export const headStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: NAVY } },
  alignment: { horizontal: "center", vertical: "center", wrapText: true },
  border: box,
};
export const textStyle = { border: box, alignment: { vertical: "center" } };
export const wrapStyle = { border: box, alignment: { vertical: "center", wrapText: true } };
export const centerStyle = { border: box, alignment: { horizontal: "center", vertical: "center" } };
export const numStyle = (fmt) => ({
  border: box,
  numFmt: fmt,
  alignment: { horizontal: "right", vertical: "center" },
});
export const totalStyle = {
  font: { bold: true },
  fill: { fgColor: { rgb: "F3F4F6" } },
  border: box,
  alignment: { vertical: "center" },
};
export const totalNum = (fmt) => ({
  ...totalStyle,
  numFmt: fmt,
  alignment: { horizontal: "right", vertical: "center" },
});

/** Celda de un estado con su color (texto y fondo en hex sin #). */
export const statusStyle = (textRgb, fillRgb) => ({
  font: { bold: true, color: { rgb: textRgb } },
  fill: { fgColor: { rgb: fillRgb } },
  border: box,
  alignment: { horizontal: "center", vertical: "center" },
});

/** Número con el fondo y color de su estado (por ejemplo la cobertura de un renglón «Se agota»). */
export const tintedNumStyle = (textRgb, fillRgb, fmt) => ({
  ...numStyle(fmt),
  fill: { fgColor: { rgb: fillRgb } },
  font: { color: { rgb: textRgb } },
});

export const cell = (v, s) => ({ v: v ?? "", t: typeof v === "number" ? "n" : "s", s });

export const MONEY = '"Q"#,##0.00';
export const QTY = "#,##0.##";

/**
 * Hoja de detalle: título, subtítulo, encabezado, filas, total y todo el acabado.
 * columns: [{ label, width, get(row), style(row), total?: "sum", totalFmt? }]
 */
export function buildTableSheet({ title, subtitle, columns, rows, freezeCols = 2, totalLabel = "TOTAL" }) {
  const headerRow = 3;
  const aoa = [
    [cell(title, titleStyle)],
    [cell(subtitle, metaStyle)],
    [],
    columns.map((c) => cell(c.label, headStyle)),
  ];
  rows.forEach((r) => aoa.push(columns.map((c) => cell(c.get(r), c.style(r)))));
  if (columns.some((c) => c.total === "sum")) {
    aoa.push(
      columns.map((c, i) => {
        if (i === 0) return cell(totalLabel, totalStyle);
        if (c.total === "sum") {
          return cell(
            rows.reduce((acc, r) => acc + (Number(c.get(r)) || 0), 0),
            totalNum(c.totalFmt || QTY)
          );
        }
        return cell("", totalStyle);
      })
    );
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({ wch: c.width }));
  ws["!rows"] = [{ hpt: 24 }, {}, {}, { hpt: 34 }];
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: 0 },
      e: { r: headerRow + rows.length, c: columns.length - 1 },
    }),
  };
  ws["!freeze"] = { xSplit: freezeCols, ySplit: headerRow + 1 };
  ws["!views"] = [{ state: "frozen", xSplit: freezeCols, ySplit: headerRow + 1, showGridLines: false }];
  ws["!pageSetup"] = { orientation: "landscape", fitToWidth: 1, fitToHeight: 0 };
  ws["!margins"] = { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 };
  return ws;
}

/**
 * Hoja de resumen: título, subtítulo, una tabla (encabezado + filas ya armadas con `cell`) y notas al pie.
 * widths: ancho de cada columna. totalRow: fila ya armada o null.
 */
export function buildSummarySheetFrom({ title, heading, subtitle, tableTitle, headers, rows, totalRow, notesTitle, notes, widths }) {
  const aoa = [
    [cell(title, titleStyle)],
    [cell(heading, { font: { bold: true, sz: 12, color: { rgb: "4B5563" } } })],
    [cell(subtitle, metaStyle)],
    [],
    [cell(tableTitle, sectionStyle)],
    headers.map((h) => cell(h, headStyle)),
    ...rows,
  ];
  if (totalRow) aoa.push(totalRow);
  if (notes && notes.length) {
    aoa.push([]);
    aoa.push([cell(notesTitle || "Cómo leer este reporte", sectionStyle)]);
    notes.forEach((txt) => aoa.push([cell(`•  ${txt}`, { alignment: { wrapText: false } })]));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((w) => ({ wch: w }));
  ws["!rows"] = [{ hpt: 26 }, { hpt: 18 }, {}, {}, { hpt: 20 }, { hpt: 32 }];
  ws["!views"] = [{ showGridLines: false }];
  ws["!margins"] = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };
  return ws;
}
