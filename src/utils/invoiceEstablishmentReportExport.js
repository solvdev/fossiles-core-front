import * as XLSX from "xlsx-js-style";

/** Fecha de emisión (YYYY-MM-DD) de una fila del reporte; el API ya la manda en hora de Guatemala. */
export const rowYmd = (row) => String(row?.issuedAt || "").slice(0, 10);

/** YYYY-MM-DD → dd/mm/yyyy */
export const formatYmdSlash = (ymd) => {
  const [y, m, d] = String(ymd || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
};

/** Monto con signo: las notas de crédito restan. */
export const signedAmount = (row) => {
  const amount = Number(row?.totalAmount || 0);
  return String(row?.documentType || "").toUpperCase() === "NCRE" ? -amount : amount;
};

/** Resumen de un conjunto de filas: emitidos, anulados y total neto (solo emitidos). */
export const summarizeRows = (rows) =>
  (rows || []).reduce(
    (acc, row) => {
      if (String(row?.status || "").toUpperCase() === "ANULADO") {
        acc.voided += 1;
      } else {
        acc.emitted += 1;
        acc.total += signedAmount(row);
      }
      acc.documents += 1;
      return acc;
    },
    { documents: 0, emitted: 0, voided: 0, total: 0 }
  );

const excelSerial = (ymd) => {
  const [y, m, d] = String(ymd || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return Date.UTC(y, m - 1, d) / 86400000 + 25569;
};

const font = { name: "Calibri", sz: 10, color: { rgb: "1F2937" } };
const border = { style: "thin", color: { rgb: "D9E1E8" } };
const allBorders = { top: border, bottom: border, left: border, right: border };
const headerStyle = {
  font: { ...font, bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "1F2937" } },
  border: allBorders,
  alignment: { vertical: "center", horizontal: "left" },
};
const moneyFmt = '"Q"#,##0.00';

const HEADERS = [
  "serie",
  "numero_correlativo",
  "adendas",
  "establecimiento",
  "tipo_documento",
  "id_receptor",
  "nombre_receptor",
  "estado",
  "fecha_emision",
  "gran_total",
];
const WIDTHS = [12, 18, 12, 34, 20, 15, 42, 11, 14, 15];

const text = (value, style) => ({ t: "s", v: String(value ?? ""), s: style });

/** Hoja con las mismas columnas del reporte SAT: encabezado en fila 1, filtros y total al final. */
const buildSheet = (rows) => {
  const ws = {};
  HEADERS.forEach((label, c) => {
    ws[XLSX.utils.encode_cell({ r: 0, c })] = text(label, headerStyle);
  });

  rows.forEach((row, i) => {
    const r = i + 1;
    const voided = String(row.status || "").toUpperCase() === "ANULADO";
    const rowFont = voided ? { ...font, color: { rgb: "9B241B" } } : font;
    const base = { font: rowFont, border: allBorders };
    const cells = [
      text(row.felSerie, base),
      text(row.felNumero, base),
      text(row.internalNumber, base),
      text(row.establishmentLabel, base),
      text(row.documentTypeLabel, base),
      text(row.customerTaxId, base),
      text(row.customerName, base),
      text(row.status, base),
    ];
    const serial = excelSerial(rowYmd(row));
    cells.push(
      serial == null
        ? text("", base)
        : { t: "n", v: serial, z: "dd/mm/yyyy", s: { ...base, alignment: { horizontal: "center" } } }
    );
    cells.push({
      t: "n",
      v: Number(row.totalAmount || 0),
      z: moneyFmt,
      s: { ...base, alignment: { horizontal: "right" } },
    });
    cells.forEach((cell, c) => {
      ws[XLSX.utils.encode_cell({ r, c })] = cell;
    });
  });

  const lastDataRow = rows.length;
  const summary = summarizeRows(rows);
  const totalRow = lastDataRow + 2;
  const bold = { font: { ...font, bold: true } };
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 6 })] = text("TOTAL EMITIDO (neto de notas de crédito)", {
    ...bold,
    alignment: { horizontal: "right" },
  });
  ws[XLSX.utils.encode_cell({ r: totalRow, c: 9 })] = {
    t: "n",
    v: summary.total,
    z: moneyFmt,
    s: { ...bold, alignment: { horizontal: "right" } },
  };
  ws[XLSX.utils.encode_cell({ r: totalRow + 1, c: 6 })] = text("Emitidos / anulados", {
    ...bold,
    alignment: { horizontal: "right" },
  });
  ws[XLSX.utils.encode_cell({ r: totalRow + 1, c: 9 })] = text(`${summary.emitted} / ${summary.voided}`, {
    ...bold,
    alignment: { horizontal: "right" },
  });

  ws["!ref"] = `A1:J${totalRow + 2}`;
  ws["!cols"] = WIDTHS.map((wch) => ({ wch }));
  ws["!rows"] = [{ hpt: 22 }];
  ws["!autofilter"] = { ref: `A1:J${Math.max(lastDataRow + 1, 2)}` };
  return ws;
};

/** Nombre de hoja válido en Excel (≤31 caracteres, sin : \ / ? * [ ]). */
const sheetName = (label, used) => {
  const base = String(label || "SIN ESTABLECIMIENTO").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "HOJA";
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    name = `${base.slice(0, 28)} ${n}`;
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
};

/**
 * Excel como el reporte SAT: una hoja por establecimiento (y una hoja TODOS al inicio cuando hay varios),
 * sin detalle de líneas, con filtros de columna.
 */
export const exportInvoiceEstablishmentReportToExcel = ({ rows, fromDate, toDate }) => {
  const list = rows || [];
  const byEstablishment = new Map();
  list.forEach((row) => {
    const key = row.establishmentLabel || "SIN ESTABLECIMIENTO";
    if (!byEstablishment.has(key)) byEstablishment.set(key, []);
    byEstablishment.get(key).push(row);
  });

  const wb = XLSX.utils.book_new();
  const used = new Set();
  if (byEstablishment.size > 1) {
    XLSX.utils.book_append_sheet(wb, buildSheet(list), sheetName("TODOS", used));
  }
  byEstablishment.forEach((groupRows, label) => {
    XLSX.utils.book_append_sheet(wb, buildSheet(groupRows), sheetName(label, used));
  });
  if (!wb.SheetNames.length) {
    XLSX.utils.book_append_sheet(wb, buildSheet([]), sheetName("SIN DATOS", used));
  }

  const range = fromDate && toDate && fromDate !== toDate ? `${fromDate}_${toDate}` : fromDate || toDate || "reporte";
  XLSX.writeFile(wb, `FACTURAS_POR_ESTABLECIMIENTO_${range}.xlsx`);
};
