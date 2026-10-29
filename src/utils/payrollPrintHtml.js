import { amountInWordsQ } from "./amountInWords";
import { escapeHtml } from "./shipmentPrintDocumentHtml";

/**
 * Voucher y cheque de planilla, copiados de los formatos de Word actuales:
 * Planta-Vouchers.doc (21 × 13.6 cm, renglones centrados en Arial) y Planta-Cheques.doc (16.5 × 7 cm, Times New Roman).
 */

const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO",
  "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

/** Iniciales que trae el formato actual al pie del voucher. */
export const VOUCHER_INITIALS = "EP";

/**
 * Posición de cada dato del cheque en milímetros desde la esquina superior izquierda, calculada con los márgenes,
 * renglones y espacios del formato de Word.
 */
export const CHEQUE_LAYOUT = {
  date: { top: 17, left: 20 },
  amount: { top: 25.7, right: 10 },
  payee: { top: 26.4, left: 19.4 },
  words: { top: 30.5, left: 18.3 },
};

/** Ancho del renglón del beneficiario antes de la casilla del monto, que va en el mismo renglón. */
export const PAYEE_WIDTH_MM = 115;

/** Los nombres largos bajan de tamaño para caber en el renglón sin montarse sobre el monto. */
export function payeeFontSize(name) {
  const length = String(name || "").length;
  if (length <= 42) return 11;
  if (length <= 46) return 10;
  if (length <= 52) return 9;
  return 8;
}

const FONTS = {
  arial: "Arial, Helvetica, sans-serif",
  times: "'Times New Roman', Times, serif",
};

const parseIsoDate = (iso) => {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  return { year, month, day };
};

/** "GUATEMALA, 19 DE OCTUBRE DE 2026"; el voucher usa "DEL" antes del año. */
export function formatPlaceDate(isoDate, place = "GUATEMALA", beforeYear = "DE") {
  const { year, month, day } = parseIsoDate(isoDate);
  if (!year || !month || !day) return place;
  return `${place}, ${String(day).padStart(2, "0")} DE ${MONTHS[month - 1]} ${beforeYear} ${year}`;
}

export function formatAmount(value) {
  const number = Number(value) || 0;
  return number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Los dos renglones del concepto: el puesto (campo CONCEPTO) y el texto del pago con la quincena. */
export function payrollConceptLines(line, run) {
  const { year, month, day } = parseIsoDate(run.periodStart);
  const half = day >= 16 ? "SEGUNDA" : "PRIMERA";
  const period = `DE LA ${half} QUINCENA DE ${MONTHS[(month || 1) - 1]} ${year || ""}`.trim();
  const payment = line.employmentType === "SERVICIOS"
    ? "PAGO DE SERVICIOS"
    : "PAGO DE SUELDO MAS BONIFICACION DECTO. LEY";
  return [String(line.position || "").trim().toUpperCase(), `${payment} ${period}`];
}

/** Concepto en una línea: "AUXILIAR DE CONTABILIDAD PAGO DE SUELDO MAS BONIFICACION DECTO. LEY DE LA SEGUNDA QUINCENA DE NOVIEMBRE 2025". */
export function buildPayrollConcept(line, run) {
  return payrollConceptLines(line, run).filter(Boolean).join(" ");
}

/** Un párrafo de Word: interlineado sencillo (1.15 del tamaño), sin espacio antes ni después. */
const paragraph = (html, { size, font = "arial", bold = false, align = "left", indentCm = 0, keepSpaces = false }) =>
  `<div style="font-family:${FONTS[font]};font-size:${size}pt;line-height:${(size * 1.15).toFixed(2)}pt;`
  + `text-align:${align};${bold ? "font-weight:bold;" : ""}${indentCm ? `padding-left:${indentCm}cm;` : ""}`
  + `${keepSpaces ? "white-space:pre;" : ""}">${html || "&nbsp;"}</div>`;

const spaces = (count) => " ".repeat(count);

function voucherPage(line, run) {
  const [position, payment] = payrollConceptLines(line, run);
  return `<section class="voucher">
${paragraph(escapeHtml(String(line.employeeName || "").toUpperCase()), { size: 12, bold: true, align: "center" })}
${paragraph("", { size: 10, align: "center" })}
${paragraph("CONCEPTO:", { size: 10, bold: true, align: "center" })}
${paragraph("", { size: 2 })}
${paragraph("", { size: 10 })}
${paragraph("", { size: 10 })}
${paragraph(escapeHtml(position), { size: 10, align: "center" })}
${paragraph(escapeHtml(payment), { size: 10, align: "center" })}
${paragraph("", { size: 2 })}
${paragraph(`Q&nbsp;&nbsp;${formatAmount(line.netPay)}`, { size: 10, align: "center" })}
${paragraph("", { size: 8 })}
${paragraph("TOTAL, EN LETRAS:", { size: 8 })}
${paragraph(escapeHtml(amountInWordsQ(line.netPay)), { size: 8, indentCm: 0.63 })}
${paragraph("", { size: 4 })}
${paragraph("", { size: 10 })}
${paragraph(escapeHtml(formatPlaceDate(run.payDate, "GUATEMALA", "DEL")), { size: 10, align: "center" })}
${paragraph("", { size: 5, font: "times" })}
${paragraph(escapeHtml(spaces(12) + (run.bankName || "")), { size: 12, font: "times", keepSpaces: true })}
${paragraph("", { size: 12, font: "times" })}
${paragraph("", { size: 10, font: "times" })}
${paragraph(escapeHtml(line.chequeNumber || ""), { size: 10, font: "times", indentCm: 0.63 })}
${paragraph("", { size: 12, font: "times" })}
${paragraph(escapeHtml(spaces(8) + VOUCHER_INITIALS), { size: 12, font: "times", keepSpaces: true })}
</section>`;
}

const chequeField = (position, html, size, extra = "") => {
  const horizontal = position.right != null ? `right:${position.right}mm;text-align:right;` : `left:${position.left}mm;`;
  return `<div class="cf" style="top:${position.top}mm;${horizontal}font-size:${size}pt;${extra}">${html}</div>`;
};

function chequePage(line, run, layout) {
  const payee = String(line.employeeName || "").toUpperCase();
  return `<section class="cheque">
  ${chequeField(layout.date, escapeHtml(formatPlaceDate(run.payDate)), 10)}
  ${chequeField(layout.amount, formatAmount(line.netPay), 10)}
  ${chequeField(layout.payee, escapeHtml(payee), payeeFontSize(payee), `width:${PAYEE_WIDTH_MM}mm;overflow:hidden;`)}
  ${chequeField(layout.words, escapeHtml(amountInWordsQ(line.netPay)), 9, "width:130mm;white-space:normal;")}
</section>`;
}

/** Líneas que llevan cheque: forma de pago CHEQUE, número asignado y líquido mayor que cero. */
export function chequeLines(run) {
  return (run.lines || []).filter((line) =>
    line.paymentMethod === "CHEQUE" && line.chequeNumber && Number(line.netPay) > 0);
}

export function buildPayrollVouchersHtml(run, lines = chequeLines(run)) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><title>Vouchers planilla ${escapeHtml(String(run.id))}</title>
<style>
  @page { size: 210mm 136mm; margin: 0; }
  body { margin: 0; color: #000; }
  .voucher { box-sizing: border-box; width: 210mm; height: 136mm; padding: 15mm 30mm 19mm 31.7mm;
    overflow: hidden; page-break-after: always; }
  .voucher:last-child { page-break-after: auto; }
</style></head>
<body>${lines.map((line) => voucherPage(line, run)).join("\n")}</body></html>`;
}

export function buildPayrollChequesHtml(run, lines = chequeLines(run), layout = CHEQUE_LAYOUT) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><title>Cheques planilla ${escapeHtml(String(run.id))}</title>
<style>
  @page { size: 165mm 70mm; margin: 0; }
  body { margin: 0; font-family: ${FONTS.times}; color: #000; }
  .cheque { position: relative; width: 165mm; height: 70mm; page-break-after: always; overflow: hidden; }
  .cheque:last-child { page-break-after: auto; }
  .cf { position: absolute; white-space: nowrap; line-height: 1.15; }
</style></head>
<body>${lines.map((line) => chequePage(line, run, layout)).join("\n")}</body></html>`;
}

export function openPayrollPrintWindow(html) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch (_e) {
      /* el usuario puede imprimir desde la ventana */
    }
  }, 400);
  return true;
}
