import * as XLSX from "xlsx-js-style";

export const thinBorder = {
  top: { style: "thin", color: { rgb: "000000" } },
  right: { style: "thin", color: { rgb: "000000" } },
  bottom: { style: "thin", color: { rgb: "000000" } },
  left: { style: "thin", color: { rgb: "000000" } },
};

const fontBase = { name: "Calibri", sz: 11, color: { rgb: "000000" } };
export const boldFont = { ...fontBase, bold: true };
const headerFill = { fgColor: { rgb: "D9D9D9" } };

const ensureCell = (ws, r, c) => {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (!ws[addr]) ws[addr] = { t: "s", v: "" };
  return addr;
};

const patchCellStyle = (ws, r, c, patch) => {
  const addr = ensureCell(ws, r, c);
  const cell = ws[addr];
  cell.s = {
    ...(cell.s || {}),
    ...patch,
    font: patch.font || cell.s?.font || fontBase,
    alignment: {
      ...(cell.s?.alignment || {}),
      ...(patch.alignment || {}),
    },
    border: patch.border ?? thinBorder,
  };
};

/** Bordes y estilo de tabla como en el PDF (encabezado gris, celdas con borde negro). */
export const applyKioskReportTableStyles = (
  ws,
  headerRow,
  dataRowCount,
  colCount,
  { totalRow, moneyFmt, numCols = [] } = {}
) => {
  const numColSet = new Set(numCols);

  for (let c = 0; c < colCount; c += 1) {
    patchCellStyle(ws, headerRow, c, {
      font: boldFont,
      fill: headerFill,
      alignment: { horizontal: "center", vertical: "center" },
    });
  }

  for (let r = headerRow + 1; r < headerRow + 1 + dataRowCount; r += 1) {
    for (let c = 0; c < colCount; c += 1) {
      const addr = ensureCell(ws, r, c);
      if (moneyFmt && ws[addr].t === "n" && numColSet.has(c)) {
        ws[addr].z = moneyFmt;
      }
      patchCellStyle(ws, r, c, {
        alignment: {
          horizontal: numColSet.has(c) ? "right" : "left",
          vertical: "top",
        },
      });
    }
  }

  if (totalRow == null) return;

  for (let c = 0; c < colCount; c += 1) {
    const addr = ensureCell(ws, totalRow, c);
    if (moneyFmt && ws[addr].t === "n" && numColSet.has(c)) {
      ws[addr].z = moneyFmt;
    }
    patchCellStyle(ws, totalRow, c, {
      font: boldFont,
      alignment: {
        horizontal: numColSet.has(c) ? "right" : "left",
        vertical: "top",
      },
    });
  }
};
