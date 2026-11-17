import { amountInWordsQ } from "./amountInWords";
import { escapeHtml } from "./shipmentPrintDocumentHtml";
import { formatAmount, formatPlaceDate, payeeFontSize } from "./payrollPrintHtml";

/**
 * Cheque de proveedor a partir de un formato configurable: papel en milímetros y, por cada dato, su distancia desde
 * arriba y desde el lado izquierdo o derecho. El mismo cálculo dibuja la vista previa y el cheque que se imprime.
 */

export const FONT_FAMILIES = {
  TIMES: "'Times New Roman', Times, serif",
  ARIAL: "Arial, Helvetica, sans-serif",
  COURIER: "'Courier New', Courier, monospace",
};

export const FONT_LABELS = { TIMES: "Times New Roman", ARIAL: "Arial", COURIER: "Courier" };

/** Datos que puede llevar un cheque, en el orden de la tabla del formato. */
export const FIELD_LABELS = {
  DATE: "Fecha",
  AMOUNT: "Monto en números",
  PAYEE: "Pagar a (beneficiario)",
  WORDS: "Monto en letras",
  CONCEPT: "Concepto",
  NUMBER: "Número de cheque",
  LEGEND: "Leyenda",
};
export const FIELD_ORDER = ["DATE", "AMOUNT", "PAYEE", "WORDS", "CONCEPT", "NUMBER", "LEGEND"];

export const LEGEND_TEXT = "NO NEGOCIABLE";

/** Un cheque de ejemplo para la vista previa y la hoja de prueba. */
export const SAMPLE_CHEQUE = {
  payeeName: "PROVEEDOR EJEMPLO, SOCIEDAD ANONIMA",
  amount: 24500,
  payDate: new Date().toISOString().slice(0, 10),
  chequeNumber: "99645601/GCF",
  concept: "Compra de materiales, OC-00112 y OC-00121",
};

/** Texto de cada dato para un cheque. */
export function chequeFieldText(key, item) {
  switch (key) {
    case "DATE":
      return formatPlaceDate(item.payDate);
    case "AMOUNT":
      return formatAmount(item.amount);
    case "PAYEE":
      return String(item.payeeName || "").toUpperCase();
    case "WORDS":
      return amountInWordsQ(item.amount);
    case "CONCEPT":
      return item.concept || "";
    case "NUMBER":
      return item.chequeNumber || "";
    case "LEGEND":
      return LEGEND_TEXT;
    default:
      return "";
  }
}

/**
 * Posición y tamaño de un dato, en milímetros y puntos. El beneficiario y el monto en letras tienen un ancho máximo
 * para no pasarse a la casilla del monto ni salirse del papel; los nombres largos bajan de tamaño.
 */
export function chequeFieldBox(field, layout, item) {
  const fromRight = field.side === "RIGHT";
  const room = Math.max(layout.widthMm - field.edge - 10, 10);
  let width = null;
  let wrap = false;
  let size = field.size;
  if (field.key === "PAYEE") {
    width = Math.min(115, Math.max(layout.widthMm - field.edge - 30, 20));
    if (item && field.size >= 11) size = Math.min(field.size, payeeFontSize(chequeFieldText("PAYEE", item)));
  } else if (field.key === "WORDS" || field.key === "CONCEPT") {
    width = room;
    wrap = true;
  }
  return { top: field.top, edge: field.edge, fromRight, width, wrap, size };
}

const fieldCss = (box) => {
  const horizontal = box.fromRight ? `right:${box.edge}mm;text-align:right;` : `left:${box.edge}mm;`;
  const width = box.width ? `width:${box.width}mm;` : "";
  return `top:${box.top}mm;${horizontal}${width}font-size:${box.size}pt;white-space:${box.wrap ? "normal" : "nowrap"};${box.width && !box.wrap ? "overflow:hidden;" : ""}`;
};

function chequeSection(item, layout, guides) {
  const fields = (layout.fields || []).filter((f) => f.on);
  const frame = guides ? "outline:0.3mm dashed #888;" : "";
  return `<section class="cheque" style="width:${layout.widthMm}mm;height:${layout.heightMm}mm;${frame}">
${fields
  .map((field) => `  <div class="cf" style="${fieldCss(chequeFieldBox(field, layout, item))}">${escapeHtml(chequeFieldText(field.key, item))}</div>`)
  .join("\n")}
</section>`;
}

function documentHtml(title, layout, sections) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><title>${escapeHtml(title)}</title>
<style>
  @page { size: ${layout.widthMm}mm ${layout.heightMm}mm; margin: 0; }
  body { margin: 0; font-family: ${FONT_FAMILIES[layout.fontFamily] || FONT_FAMILIES.TIMES}; color: #000; }
  .cheque { position: relative; page-break-after: always; overflow: hidden; }
  .cheque:last-child { page-break-after: auto; }
  .cf { position: absolute; line-height: 1.15; }
</style></head>
<body>${sections.join("\n")}</body></html>`;
}

/** Los cheques de los pagos elegidos; todos deben tener el mismo formato (tamaño de papel). */
export function buildSupplierChequesHtml(items) {
  const layout = items[0].layout;
  return documentHtml(`Cheques ${items.map((i) => i.paymentNumber).join(", ")}`, layout,
    items.map((item) => chequeSection(item, item.layout, false)));
}

/** Hoja de prueba: un cheque de ejemplo con el marco del papel, para comparar con un cheque en blanco. */
export function buildChequeTestHtml(layout) {
  return documentHtml(`Hoja de prueba · ${layout.name}`, layout, [chequeSection(SAMPLE_CHEQUE, layout, true)]);
}

/** True si todos los cheques usan el mismo tamaño de papel. */
export function sameChequePaper(items) {
  const first = items[0].layout;
  return items.every((i) => i.layout.widthMm === first.widthMm && i.layout.heightMm === first.heightMm);
}
