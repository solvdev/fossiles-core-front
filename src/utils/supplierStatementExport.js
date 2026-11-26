import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";

/** Estado de cuenta de proveedores: PDF (como el reporte «Pagos generales») y Excel. */

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** «2026-09-26» → «26/Sep/26», como el reporte del sistema anterior. */
export const shortDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return "";
  return `${d}/${MONTHS[m - 1]}/${String(y).slice(2)}`;
};

export const money = (value) =>
  Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const KIND_LABEL = { ALL: "Todos los documentos", ORDERS: "Compras", DOCUMENTS: "Servicios y otros", OPENING: "Saldos iniciales", RENTS: "Rentas" };

export const rangeText = (data) => {
  const from = data.fromCode || (data.groups[0]?.code ?? "");
  const to = data.toCode || (data.groups[data.groups.length - 1]?.code ?? "");
  return from || to ? `Del proveedor ${from || "—"} al proveedor ${to || "—"}` : "Todos los proveedores";
};

const fileStamp = (data) => `estado-cuenta-proveedores-${String(data.cutoff).slice(0, 10)}`;

/** groups: los grupos ya filtrados en pantalla (antigüedad, búsqueda). */
export function statementPdf(data, groups, { bucketLabel, printedBy } = {}) {
  const pdf = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 12;
  const col = { concept: M, doc: 88, apli: 112, venc: 132, cargos: 160, abonos: 182, saldo: W - M };
  let y = 0;

  const header = () => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Impreso ${new Date().toLocaleString("es-GT")}${printedBy ? ` · ${printedBy}` : ""}`, M, 10);
    pdf.text(`Corte al ${shortDate(data.cutoff)}`, W - M, 10, { align: "right" });
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("FOSSILES", W / 2, 11, { align: "center" });
    pdf.setFontSize(11);
    pdf.text("Estado de cuenta de proveedores", W / 2, 17, { align: "center" });
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    const extras = [KIND_LABEL[data.kind] || "", data.onlyBalance ? "solo con saldo" : "", bucketLabel || ""].filter(Boolean);
    pdf.text(`${rangeText(data)}${extras.length ? ` · ${extras.join(" · ")}` : ""}`, M, 25);
    y = 30;
    pdf.setLineWidth(0.4);
    pdf.line(M, y, W - M, y);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    pdf.text("CONCEPTO", col.concept, y + 4);
    pdf.text("DOCUMENTO", col.doc, y + 4, { align: "right" });
    pdf.text("F. APLI.", col.apli, y + 4, { align: "right" });
    pdf.text("F. VENC.", col.venc, y + 4, { align: "right" });
    pdf.text("CARGOS", col.cargos, y + 4, { align: "right" });
    pdf.text("ABONOS", col.abonos, y + 4, { align: "right" });
    pdf.text("SALDOS", col.saldo, y + 4, { align: "right" });
    y += 6;
    pdf.line(M, y, W - M, y);
    y += 5;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.5);
  };

  const ensure = (space) => {
    if (y + space > H - 14) {
      pdf.addPage();
      header();
    }
  };

  header();
  const totals = { charges: 0, credits: 0 };
  groups.forEach((g) => {
    ensure(14);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    const title = `${g.code || "S/C"}   ${g.name || ""}`;
    pdf.text(pdf.splitTextToSize(title, 140)[0], M, y);
    pdf.setFont("helvetica", "normal");
    if (g.phone) pdf.text(String(g.phone), W - M, y, { align: "right" });
    y += 4;
    if (g.payeeName) {
      pdf.setFontSize(7.5);
      pdf.text(`Cheque a nombre de ${g.payeeName}`, M + 4, y);
      y += 3.6;
    }
    pdf.setFontSize(8.5);
    let charges = 0;
    let credits = 0;
    g.lines.forEach((l) => {
      ensure(5);
      pdf.text(pdf.splitTextToSize(l.concept || "", 44)[0], col.concept, y);
      pdf.text(pdf.splitTextToSize(String(l.document || ""), 40)[0], col.doc, y, { align: "right" });
      pdf.text(shortDate(l.issueDate), col.apli, y, { align: "right" });
      pdf.text(shortDate(l.dueDate), col.venc, y, { align: "right" });
      pdf.text(money(l.charges), col.cargos, y, { align: "right" });
      pdf.text(money(l.credits), col.abonos, y, { align: "right" });
      pdf.text(`${money(l.balance)}Q`, col.saldo, y, { align: "right" });
      charges += Number(l.charges);
      credits += Number(l.credits);
      y += 4.2;
    });
    ensure(8);
    pdf.setLineDashPattern([0.8, 0.8], 0);
    pdf.line(col.cargos - 24, y - 2.6, W - M, y - 2.6);
    pdf.setLineDashPattern([], 0);
    pdf.setFont("helvetica", "bold");
    pdf.text(money(charges), col.cargos, y + 0.8, { align: "right" });
    pdf.text(money(credits), col.abonos, y + 0.8, { align: "right" });
    pdf.text(money(charges - credits), col.saldo, y + 0.8, { align: "right" });
    pdf.setFont("helvetica", "normal");
    y += 7;
    totals.charges += charges;
    totals.credits += credits;
  });
  ensure(10);
  pdf.setLineWidth(0.4);
  pdf.line(M, y - 3, W - M, y - 3);
  pdf.setFont("helvetica", "bold");
  pdf.text(`Total general · ${groups.length} proveedores`, M, y + 1);
  pdf.text(money(totals.charges), col.cargos, y + 1, { align: "right" });
  pdf.text(money(totals.credits), col.abonos, y + 1, { align: "right" });
  pdf.text(`${money(totals.charges - totals.credits)}Q`, col.saldo, y + 1, { align: "right" });

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(`Página ${i} de ${pages}`, W - M, H - 7, { align: "right" });
  }
  pdf.save(`${fileStamp(data)}.pdf`);
}

export function statementExcel(data, groups) {
  const rows = [];
  groups.forEach((g) => {
    g.lines.forEach((l) => {
      rows.push({
        Código: g.code || "",
        Proveedor: g.name || "",
        "Cheque a nombre de": g.payeeName || "",
        Teléfono: g.phone || "",
        Concepto: l.concept || "",
        Documento: l.document || "",
        "Orden de compra": l.orderCode || "",
        "F. apli.": l.issueDate || "",
        "F. venc.": l.dueDate || "",
        "Días vencido": l.balance > 0 && l.daysLate > 0 ? l.daysLate : "",
        Cargos: Number(l.charges),
        Abonos: Number(l.credits),
        Saldo: Number(l.balance),
        Pagos: (l.payments || []).map((p) => `${p.label} (${p.number})`).join(", "),
      });
    });
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [8, 40, 28, 16, 22, 16, 14, 11, 11, 10, 13, 13, 13, 30].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Estado de cuenta");
  XLSX.writeFile(wb, `${fileStamp(data)}.xlsx`);
}
