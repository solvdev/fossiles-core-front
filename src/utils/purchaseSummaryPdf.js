import { jsPDF } from "jspdf";

const MONTHS_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

const formatMoney = (value) => Number(value || 0).toLocaleString("es-GT", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const parseDate = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const formatMonthYearTitle = (dateValue) => {
  const date = parseDate(dateValue);
  return `COMPRAS DE ${MONTHS_ES[date.getMonth()]} DE ${date.getFullYear()}`;
};

const formatLongDateGt = (dateValue) => {
  const date = parseDate(dateValue);
  return `GUATEMALA, ${date.getDate()} DE ${MONTHS_ES[date.getMonth()]} DE ${date.getFullYear()}`;
};

const getPurchaseDisplayNumber = (purchaseNumber) => {
  if (!purchaseNumber) return "";
  const match = String(purchaseNumber).match(/(\d+)\s*$/);
  return match ? String(parseInt(match[1], 10)) : String(purchaseNumber);
};

const calcLineTotal = (item) => {
  const qty = Number(item.quantity) || 0;
  const unitCost = item.isPurchased && item.actualPrice != null
    ? Number(item.actualPrice)
    : Number(item.estimatedPrice) || 0;
  return Math.round(qty * unitCost * 100) / 100;
};

const buildItemDescription = (item, expense) => {
  let description = (item.itemName || "").trim();
  if (item.description) {
    description += ` ${String(item.description).trim()}`;
  }
  if (expense?.invoiceNumber) {
    description += ` Fact. ${expense.invoiceNumber}`;
  }
  return description.toUpperCase();
};

const drawTableHeader = (pdf, margin, y, colX, colW, pageW) => {
  const tableWidth = pageW - margin * 2;
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.3);
  pdf.rect(margin, y - 5, tableWidth, 8);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text("CANTIDAD", colX.qty + colW.qty / 2, y, { align: "center" });
  pdf.text("DESCRIPCION", colX.desc + 2, y);
  pdf.text("COSTO APROX.", colX.cost + colW.cost / 2, y, { align: "center" });
  pdf.text("TOTAL", colX.total + colW.total / 2, y, { align: "center" });
};

export const downloadPurchaseSummaryPdf = ({ purchase, items, expenses }) => {
  if (!purchase) {
    throw new Error("No hay información de la compra");
  }
  if (!items || items.length === 0) {
    throw new Error("No hay artículos para exportar");
  }

  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const refDate = purchase.createdAt || new Date().toISOString();

  const colX = {
    qty: margin,
    desc: margin + 22,
    cost: margin + 118,
    total: margin + 153,
  };
  const colW = { qty: 20, desc: 94, cost: 33, total: 33 };
  const tableWidth = pageW - margin * 2;

  const expenseByItemId = new Map();
  const expenseById = new Map();
  (expenses || []).forEach((expense) => {
    expenseById.set(expense.id, expense);
    if (expense.purchaseNumberItemId) {
      expenseByItemId.set(expense.purchaseNumberItemId, expense);
    }
  });

  let y = 18;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text("INDUSTRIAS FUTURA", pageW / 2, y, { align: "center" });

  const displayNumber = getPurchaseDisplayNumber(purchase.purchaseNumber);
  if (displayNumber) {
    const boxW = 18;
    const boxH = 10;
    const boxX = pageW - margin - boxW;
    pdf.setLineWidth(0.4);
    pdf.rect(boxX, 10, boxW, boxH);
    pdf.setFontSize(11);
    pdf.text(displayNumber, boxX + boxW / 2, 17, { align: "center" });
  }

  y += 8;
  pdf.setFontSize(12);
  pdf.text(formatMonthYearTitle(refDate), pageW / 2, y, { align: "center" });

  if (purchase.description) {
    y += 6;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(String(purchase.description).toUpperCase(), pageW / 2, y, { align: "center" });
  }

  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`Número de compra: ${purchase.purchaseNumber || "N/A"}`, margin, y);
  y += 5;
  if (purchase.status) {
    pdf.text(`Estado: ${purchase.status}`, margin, y);
    y += 5;
  }
  if (purchase.totalAmount != null) {
    pdf.text(`Total estimado compra: Q ${formatMoney(purchase.totalAmount)}`, margin, y);
    y += 5;
  }

  y += 4;
  drawTableHeader(pdf, margin, y, colX, colW, pageW);
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);

  let grandTotal = 0;

  items.forEach((item) => {
    const expense = expenseByItemId.get(item.id)
      || (item.minorExpenseId ? expenseById.get(item.minorExpenseId) : null);
    const qty = Number(item.quantity) || 0;
    const unitCost = item.isPurchased && item.actualPrice != null
      ? Number(item.actualPrice)
      : Number(item.estimatedPrice) || 0;
    const lineTotal = calcLineTotal(item);
    grandTotal += lineTotal;

    const description = buildItemDescription(item, expense);
    const descLines = pdf.splitTextToSize(description, colW.desc - 4);
    const cellH = Math.max(8, descLines.length * 3.8 + 3);

    if (y + cellH > pageH - 25) {
      pdf.addPage();
      y = 20;
      drawTableHeader(pdf, margin, y, colX, colW, pageW);
      y += 8;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8.5);
    }

    pdf.rect(margin, y, colW.qty, cellH);
    pdf.rect(colX.desc - 2, y, colW.desc, cellH);
    pdf.rect(colX.cost - 2, y, colW.cost, cellH);
    pdf.rect(colX.total - 2, y, colW.total, cellH);

    pdf.text(String(qty), colX.qty + colW.qty / 2, y + cellH / 2 + 1, { align: "center" });
    pdf.text(descLines, colX.desc + 2, y + 4);
    pdf.text(`Q ${formatMoney(unitCost)}`, colX.cost + colW.cost / 2, y + cellH / 2 + 1, { align: "center" });
    pdf.text(`Q ${formatMoney(lineTotal)}`, colX.total + colW.total / 2, y + cellH / 2 + 1, { align: "center" });

    y += cellH;
  });

  if (y + 10 > pageH - 20) {
    pdf.addPage();
    y = 20;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.rect(colX.cost - 2, y, colW.cost, 8);
  pdf.rect(colX.total - 2, y, colW.total, 8);
  pdf.text(`Q ${formatMoney(grandTotal)}`, colX.total + colW.total / 2, y + 5.5, { align: "center" });

  y += 16;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(formatLongDateGt(refDate), pageW / 2, y, { align: "center" });

  const safeName = String(purchase.purchaseNumber || "compra").replace(/[^\w.-]+/g, "_");
  pdf.save(`Resumen_Compra_${safeName}.pdf`);
};
