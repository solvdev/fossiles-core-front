import * as XLSX from "xlsx-js-style";
import { boldFont, thinBorder } from "./kioskReportExcelStyle";

/**
 * Exportación del "Valor del inventario" por kiosco (Finanzas > Valor del inventario):
 * sólo kiosco y valor en producto (existencias × precio de venta del POS), con total.
 */

const moneyFmt = '"Q"#,##0.00;-"Q"#,##0.00';
const fillGray = { fgColor: { rgb: "D9D9D9" } };
const fillLight = { fgColor: { rgb: "F2F2F2" } };
const baseFont = { name: "Calibri", sz: 11, color: { rgb: "000000" } };

/** "2026-10-14T09:30:00" -> "14/10/2026 09:30". */
export const fmtGeneratedAt = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso || "");
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
};

/** Filas de la tabla (función pura): [kiosco, valor] y el total al final. */
export const buildStockValueRows = (data) => [
  ...(data?.sites || []).map((s) => [s.siteName, Number(s.saleValue) || 0]),
  ["Total", Number(data?.totals?.saleValue) || 0],
];

export const stockValueFileName = (data, ext) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data?.generatedAt || "");
  return `Valor_Inventario_Kioscos_${m ? `${m[1]}-${m[2]}-${m[3]}` : ""}.${ext}`;
};

export const exportStockValueExcel = (data) => {
  const header = 2;
  const aoa = [
    ["VALOR DEL INVENTARIO POR KIOSCO"],
    [`Existencias al ${fmtGeneratedAt(data?.generatedAt)} · a precio de venta`],
    ["Kiosco", "Valor en producto"],
    ...buildStockValueRows(data),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  aoa.forEach((row, r) => {
    row.forEach((value, c) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (!cell) return;
      if (r === 0) cell.s = { font: { ...boldFont, sz: 14 } };
      else if (r === 1) cell.s = { font: { ...baseFont, italic: true, color: { rgb: "666666" } } };
      else if (r === header) cell.s = { font: boldFont, fill: fillGray, border: thinBorder, alignment: { horizontal: c === 0 ? "left" : "center" } };
      else {
        const isTotal = r === aoa.length - 1;
        cell.s = { border: thinBorder, font: isTotal ? boldFont : baseFont, ...(isTotal ? { fill: fillLight } : {}) };
        if (cell.t === "n") {
          cell.z = moneyFmt;
          cell.s.alignment = { horizontal: "right" };
        }
      }
    });
  });
  ws["!cols"] = [{ wch: 32 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Valor inventario");
  const fileName = stockValueFileName(data, "xlsx");
  XLSX.writeFile(wb, fileName);
  return fileName;
};

const money = (v) => `Q ${Number(v || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const exportStockValuePdf = async (data) => {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const margin = 40;
  const pageH = pdf.internal.pageSize.getHeight();
  const nameW = 300;
  const valueW = 160;
  const rowH = 18;
  const rows = buildStockValueRows(data);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.setTextColor(30);
  pdf.text("Valor del inventario por kiosco", margin, margin + 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100);
  pdf.text(`Existencias al ${fmtGeneratedAt(data?.generatedAt)} · a precio de venta`, margin, margin + 26);

  let y = margin + 40;
  const drawHeader = () => {
    pdf.setFillColor(230, 230, 230);
    pdf.rect(margin, y, nameW + valueW, rowH, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(40);
    pdf.text("Kiosco", margin + 6, y + 12.5);
    pdf.text("Valor en producto", margin + nameW + valueW - 6, y + 12.5, { align: "right" });
    y += rowH;
  };
  drawHeader();
  rows.forEach(([name, value], i) => {
    const isTotal = i === rows.length - 1;
    if (y + rowH > pageH - margin) {
      pdf.addPage();
      y = margin;
      drawHeader();
    }
    if (isTotal) {
      pdf.setFillColor(242, 242, 242);
      pdf.rect(margin, y, nameW + valueW, rowH, "F");
    }
    pdf.setFont("helvetica", isTotal ? "bold" : "normal");
    pdf.setFontSize(9.5);
    pdf.setTextColor(20);
    pdf.text(String(name), margin + 6, y + 12.5);
    pdf.text(money(value), margin + nameW + valueW - 6, y + 12.5, { align: "right" });
    pdf.setDrawColor(225);
    pdf.line(margin, y + rowH, margin + nameW + valueW, y + rowH);
    y += rowH;
  });

  const fileName = stockValueFileName(data, "pdf");
  pdf.save(fileName);
  return fileName;
};
