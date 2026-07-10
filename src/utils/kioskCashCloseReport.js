import * as XLSX from "xlsx-js-style";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { formatDateTimeGt } from "./dateTimeHelper";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const formatCashCloseMoneyQ = (value) => {
  const n = Number(value || 0);
  return `Q${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatCashCloseDateTime = (value) => {
  const label = formatDateTimeGt(value);
  if (!label || label === "-") return "—";
  return label;
};

const formatGeneratedByLine = (name, when) => {
  const who = String(name || "").trim().toUpperCase() || "USUARIO";
  const whenLabel = formatCashCloseDateTime(when || new Date())
    .replace(/\//g, "-")
    .replace(/,\s*/g, " ")
    .replace(/\s*a\.?\s*m\.?/gi, "")
    .replace(/\s*p\.?\s*m\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${who} EL ${whenLabel}`;
};

export const cashClosePaymentRowClass = (kind) => {
  const k = String(kind || "").toUpperCase();
  if (k === "CASH") return "pay-cash";
  if (k === "CARD") return "pay-card";
  if (k === "MIXED") return "pay-mixed";
  return "pay-other";
};

const amountFill = (kind) => {
  const k = String(kind || "").toUpperCase();
  if (k === "CASH") return "F7A8C4";
  if (k === "CARD") return "9EC5FE";
  if (k === "MIXED") return "7DD3C7";
  return "E9ECEF";
};

const reportStyles = `
  .kiosk-cash-close-report {
    font-family: Calibri, Arial, sans-serif;
    font-size: 11pt;
    color: #000;
    background: #fff;
    padding: 8px 4px 16px;
  }
  .kiosk-cash-close-report .title {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    margin: 0 0 10px;
    letter-spacing: 0.5px;
  }
  .kiosk-cash-close-report .meta { margin: 2px 0; }
  .kiosk-cash-close-report .meta strong { font-weight: bold; }
  .kiosk-cash-close-report table.sales {
    width: 100%;
    border-collapse: collapse;
    margin-top: 14px;
  }
  .kiosk-cash-close-report table.sales th,
  .kiosk-cash-close-report table.sales td {
    border: 1px solid #222;
    padding: 4px 6px;
    vertical-align: middle;
  }
  .kiosk-cash-close-report table.sales th {
    background: #f0f0f0;
    text-align: left;
    font-weight: bold;
  }
  .kiosk-cash-close-report td.num,
  .kiosk-cash-close-report th.num { text-align: right; white-space: nowrap; }
  .kiosk-cash-close-report tr.pay-card td.amount { background: #9ec5fe; font-weight: bold; }
  .kiosk-cash-close-report tr.pay-mixed td.amount { background: #7dd3c7; font-weight: bold; }
  .kiosk-cash-close-report tr.pay-cash td.amount { background: #f7a8c4; font-weight: bold; }
  .kiosk-cash-close-report tr.pay-other td.amount { background: #e9ecef; font-weight: bold; }
  .kiosk-cash-close-report tr.subtotal td { font-weight: bold; background: #fff; }
  .kiosk-cash-close-report tr.disbursement td.amount { background: #8fd19e; font-weight: bold; }
  .kiosk-cash-close-report .summary {
    margin-top: 18px;
    width: 420px;
    max-width: 100%;
  }
  .kiosk-cash-close-report .summary-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
    border-bottom: 1px solid #ddd;
  }
  .kiosk-cash-close-report .summary-row .label { font-weight: bold; }
  .kiosk-cash-close-report .summary-row .value { text-align: right; min-width: 110px; }
  .kiosk-cash-close-report .summary-row.highlight .value {
    background: #ffe566;
    padding: 2px 6px;
    font-weight: bold;
  }
  .kiosk-cash-close-report .summary-row.strong .value { font-weight: bold; }
  .kiosk-cash-close-report .defs {
    margin-top: 22px;
    font-size: 9.5pt;
    color: #333;
    border-top: 1px solid #999;
    padding-top: 10px;
  }
  .kiosk-cash-close-report .defs h4 { margin: 0 0 6px; font-size: 10.5pt; }
  .kiosk-cash-close-report .defs p { margin: 0 0 6px; }
`;

/** Cuerpo HTML del reporte (para modal / captura PDF). */
export const buildKioskCashCloseReportBodyHtml = (report) => {
  const sales = Array.isArray(report?.sales) ? report.sales : [];
  const disbursements = Array.isArray(report?.disbursements) ? report.disbursements : [];

  const saleRows = sales.map((line) => `
    <tr class="${cashClosePaymentRowClass(line.paymentKind)}">
      <td>${escapeHtml(line.saleNumber || "—")}</td>
      <td>${escapeHtml(line.invoiceNumber || "—")}</td>
      <td>${escapeHtml(line.paymentLabel || line.paymentMethod || "—")}</td>
      <td class="num amount">${escapeHtml(formatCashCloseMoneyQ(line.amount))}</td>
      <td>${escapeHtml(formatCashCloseDateTime(line.soldAt))}</td>
    </tr>`).join("");

  const disbursementRows = disbursements.map((d) => `
    <tr class="disbursement">
      <td colspan="2"><strong>DESEMBOLSO</strong></td>
      <td>${escapeHtml(d.description || "—")}</td>
      <td class="num amount">${escapeHtml(formatCashCloseMoneyQ(d.amount))}</td>
      <td></td>
    </tr>`).join("");

  const hasDisbursements = disbursements.length > 0;

  return `
  <div class="kiosk-cash-close-report">
  <div class="title">DETALLE DE CIERRE DE CAJA</div>
  <div class="meta"><strong>USUARIO:</strong> ${escapeHtml(report?.openedByName || report?.closedByName || "—")}</div>
  <div class="meta"><strong>FECHA:</strong> ${escapeHtml(formatCashCloseDateTime(report?.openedAt))}
    A: ${escapeHtml(formatCashCloseDateTime(report?.closedAt))}</div>
  <div class="meta"><strong>GENERADO POR:</strong> ${escapeHtml(
    formatGeneratedByLine(report?.generatedByName, report?.generatedAt)
  )}</div>
  ${report?.kioskName ? `<div class="meta"><strong>KIOSKO:</strong> ${escapeHtml(report.kioskName)}</div>` : ""}

  <table class="sales">
    <thead>
      <tr>
        <th>Venta</th>
        <th>Factura</th>
        <th>Forma de Pago</th>
        <th class="num">Monto</th>
        <th>Fecha</th>
      </tr>
    </thead>
    <tbody>
      ${saleRows || `<tr><td colspan="5">Sin ventas en el turno</td></tr>`}
      <tr class="subtotal">
        <td colspan="3" style="text-align:right">Sub Total de Ventas</td>
        <td class="num">${escapeHtml(formatCashCloseMoneyQ(report?.salesSubtotal))}</td>
        <td></td>
      </tr>
      ${disbursementRows}
      ${hasDisbursements ? `
      <tr class="subtotal">
        <td colspan="3" style="text-align:right">Sub Total</td>
        <td class="num">${escapeHtml(formatCashCloseMoneyQ(report?.salesMinusDisbursements))}</td>
        <td></td>
      </tr>` : ""}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span class="label">Monto de Apertura</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.openingAmount))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Tarjeta</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.cardSalesTotal))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Efectivo</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.cashSalesTotal))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Desembolso</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.disbursementsTotal))}</span>
    </div>
    <div class="summary-row highlight">
      <span class="label">Deposito${report?.depositDetail ? ` (${escapeHtml(report.depositDetail)})` : ""}</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.depositAmount))}</span>
    </div>
    <div class="summary-row highlight">
      <span class="label">Total de Efectivo</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.totalCash))}</span>
    </div>
    <div class="summary-row strong">
      <span class="label">Monto Cierre</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.closeAmount))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Apertura</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.openingAmount))}</span>
    </div>
    <div class="summary-row strong">
      <span class="label">Monto Total</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.salesDayTotal))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Diferencia</span>
      <span class="value">${escapeHtml(formatCashCloseMoneyQ(report?.variance))}</span>
    </div>
  </div>

  <div class="defs">
    <h4>Definiciones</h4>
    <p><strong>Desembolso:</strong> dinero que sale de la caja por un gasto operativo del turno (ej. taxi). No es venta.</p>
    <p><strong>Total de Efectivo:</strong> Desembolso + Depósito (debe igualar el efectivo de ventas del turno).</p>
    <p><strong>Monto Cierre:</strong> Apertura + Tarjeta + Total de Efectivo.</p>
    <p><strong>Monto Total:</strong> Monto Cierre − Apertura (ventas del día).</p>
    <p><strong>Diferencia:</strong> efectivo contado físicamente − efectivo esperado en caja.</p>
  </div>
  </div>`;
};

export const getKioskCashCloseReportStyles = () => reportStyles;

export const buildKioskCashCloseReportHtml = (report) => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DETALLE DE CIERRE DE CAJA</title>
  <style>${reportStyles}
  @page { size: letter; margin: 12mm; }
  body { margin: 0; padding: 8px 12px 24px; }
  @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${buildKioskCashCloseReportBodyHtml(report)}
</body>
</html>`;

const fileStamp = (report) => {
  const closed = String(report?.closedAt || "").slice(0, 10).replace(/-/g, "")
    || new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const kiosk = String(report?.kioskCode || report?.kioskName || "kiosko")
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 24);
  return `${closed}_${kiosk}`;
};

const fontBase = { name: "Calibri", sz: 11, color: { rgb: "000000" } };
const boldFont = { ...fontBase, bold: true };
const titleFont = { ...fontBase, bold: true, sz: 14 };
const moneyFmt = '"Q"#,##0.00';

const setCell = (ws, r, c, cell) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  ws[ref] = cell;
};

/** Excel estilo legacy del detalle de cierre. */
export const exportKioskCashCloseToExcel = (report) => {
  if (!report) return false;
  const sales = Array.isArray(report.sales) ? report.sales : [];
  const disbursements = Array.isArray(report.disbursements) ? report.disbursements : [];
  const aoa = [
    ["DETALLE DE CIERRE DE CAJA"],
    [`USUARIO: ${report.openedByName || report.closedByName || "—"}`],
    [`FECHA: ${formatCashCloseDateTime(report.openedAt)} A: ${formatCashCloseDateTime(report.closedAt)}`],
    [`GENERADO POR: ${formatGeneratedByLine(report.generatedByName, report.generatedAt)}`],
    report.kioskName ? [`KIOSKO: ${report.kioskName}`] : [""],
    [],
    ["Venta", "Factura", "Forma de Pago", "Monto", "Fecha"],
  ];

  sales.forEach((line) => {
    aoa.push([
      line.saleNumber || "—",
      line.invoiceNumber || "—",
      line.paymentLabel || line.paymentMethod || "—",
      Number(line.amount || 0),
      formatCashCloseDateTime(line.soldAt),
    ]);
  });

  aoa.push(["", "", "Sub Total de Ventas", Number(report.salesSubtotal || 0), ""]);

  disbursements.forEach((d) => {
    aoa.push(["DESEMBOLSO", "", d.description || "—", Number(d.amount || 0), ""]);
  });

  if (disbursements.length > 0) {
    aoa.push(["", "", "Sub Total", Number(report.salesMinusDisbursements || 0), ""]);
  }

  aoa.push([]);
  aoa.push(["Monto de Apertura", Number(report.openingAmount || 0)]);
  aoa.push(["Tarjeta", Number(report.cardSalesTotal || 0)]);
  aoa.push(["Efectivo", Number(report.cashSalesTotal || 0)]);
  aoa.push(["Desembolso", Number(report.disbursementsTotal || 0)]);
  aoa.push([
    `Deposito${report.depositDetail ? ` (${report.depositDetail})` : ""}`,
    Number(report.depositAmount || 0),
  ]);
  aoa.push(["Total de Efectivo", Number(report.totalCash || 0)]);
  aoa.push(["Monto Cierre", Number(report.closeAmount || 0)]);
  aoa.push(["Apertura", Number(report.openingAmount || 0)]);
  aoa.push(["Monto Total", Number(report.salesDayTotal || 0)]);
  aoa.push(["Diferencia", Number(report.variance || 0)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 18 },
    { wch: 16 },
    { wch: 42 },
    { wch: 14 },
    { wch: 20 },
  ];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: 4 } },
  ];

  for (let r = 0; r <= 4; r += 1) {
    setCell(ws, r, 0, {
      t: "s",
      v: aoa[r][0] || "",
      s: { font: r === 0 ? titleFont : boldFont, alignment: { horizontal: "left" } },
    });
  }

  ["Venta", "Factura", "Forma de Pago", "Monto", "Fecha"].forEach((label, c) => {
    setCell(ws, 6, c, {
      t: "s",
      v: label,
      s: {
        font: boldFont,
        alignment: { horizontal: c === 3 ? "right" : "left" },
        border: {
          top: { style: "thin", color: { rgb: "000000" } },
          bottom: { style: "thin", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "000000" } },
          right: { style: "thin", color: { rgb: "000000" } },
        },
      },
    });
  });

  let rowIdx = 7;
  sales.forEach((line) => {
    const fill = amountFill(line.paymentKind);
    const values = [
      line.saleNumber || "—",
      line.invoiceNumber || "—",
      line.paymentLabel || line.paymentMethod || "—",
      Number(line.amount || 0),
      formatCashCloseDateTime(line.soldAt),
    ];
    values.forEach((v, c) => {
      const isMoney = c === 3;
      setCell(ws, rowIdx, c, {
        t: isMoney ? "n" : "s",
        v,
        z: isMoney ? moneyFmt : undefined,
        s: {
          font: isMoney ? boldFont : fontBase,
          alignment: { horizontal: isMoney ? "right" : "left" },
          fill: isMoney ? { patternType: "solid", fgColor: { rgb: fill } } : undefined,
          border: {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } },
          },
        },
      });
    });
    rowIdx += 1;
  });

  const styleMoneyRow = (r, labelCol2, amount, fillRgb) => {
    setCell(ws, r, 2, {
      t: "s",
      v: labelCol2,
      s: { font: boldFont, alignment: { horizontal: "right" } },
    });
    setCell(ws, r, 3, {
      t: "n",
      v: amount,
      z: moneyFmt,
      s: {
        font: boldFont,
        alignment: { horizontal: "right" },
        fill: fillRgb
          ? { patternType: "solid", fgColor: { rgb: fillRgb } }
          : undefined,
      },
    });
  };

  styleMoneyRow(rowIdx, "Sub Total de Ventas", Number(report.salesSubtotal || 0));
  rowIdx += 1;

  disbursements.forEach((d) => {
    setCell(ws, rowIdx, 0, { t: "s", v: "DESEMBOLSO", s: { font: boldFont } });
    setCell(ws, rowIdx, 2, { t: "s", v: d.description || "—", s: { font: fontBase } });
    setCell(ws, rowIdx, 3, {
      t: "n",
      v: Number(d.amount || 0),
      z: moneyFmt,
      s: {
        font: boldFont,
        alignment: { horizontal: "right" },
        fill: { patternType: "solid", fgColor: { rgb: "8FD19E" } },
      },
    });
    rowIdx += 1;
  });

  if (disbursements.length > 0) {
    styleMoneyRow(rowIdx, "Sub Total", Number(report.salesMinusDisbursements || 0));
    rowIdx += 1;
  }

  rowIdx += 1;
  const summaryStart = rowIdx;
  const summary = [
    ["Monto de Apertura", Number(report.openingAmount || 0), null],
    ["Tarjeta", Number(report.cardSalesTotal || 0), null],
    ["Efectivo", Number(report.cashSalesTotal || 0), null],
    ["Desembolso", Number(report.disbursementsTotal || 0), null],
    [
      `Deposito${report.depositDetail ? ` (${report.depositDetail})` : ""}`,
      Number(report.depositAmount || 0),
      "FFE566",
    ],
    ["Total de Efectivo", Number(report.totalCash || 0), "FFE566"],
    ["Monto Cierre", Number(report.closeAmount || 0), null],
    ["Apertura", Number(report.openingAmount || 0), null],
    ["Monto Total", Number(report.salesDayTotal || 0), null],
    ["Diferencia", Number(report.variance || 0), null],
  ];
  summary.forEach((item, i) => {
    const r = summaryStart + i;
    setCell(ws, r, 0, { t: "s", v: item[0], s: { font: boldFont } });
    setCell(ws, r, 1, {
      t: "n",
      v: item[1],
      z: moneyFmt,
      s: {
        font: boldFont,
        alignment: { horizontal: "right" },
        fill: item[2]
          ? { patternType: "solid", fgColor: { rgb: item[2] } }
          : undefined,
      },
    });
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CIERRE DE CAJA");
  XLSX.writeFile(wb, `DETALLE_CIERRE_CAJA_${fileStamp(report)}.xlsx`);
  return true;
};

/** Descarga PDF del reporte (html2canvas + jsPDF). */
export const downloadKioskCashClosePdf = async (report) => {
  if (!report) return false;
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;background:#fff;z-index:-1;";
  host.innerHTML = `<style>${reportStyles}</style>${buildKioskCashCloseReportBodyHtml(report)}`;
  document.body.appendChild(host);
  try {
    const target = host.querySelector(".kiosk-cash-close-report") || host;
    const canvas = await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
    });
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 28;
    const usableWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * usableWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = margin;
    pdf.addImage(img, "PNG", margin, position, usableWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;
    while (heightLeft > 0) {
      position = margin - (imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(img, "PNG", margin, position, usableWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }
    pdf.save(`DETALLE_CIERRE_CAJA_${fileStamp(report)}.pdf`);
    return true;
  } finally {
    document.body.removeChild(host);
  }
};

/** @deprecated Prefer modal + download helpers. Kept for auto-print fallback. */
export const openKioskCashCloseReport = (report, { autoPrint = true } = {}) => {
  if (!report) return false;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildKioskCashCloseReportHtml(report));
  win.document.close();
  if (autoPrint) {
    win.onload = () => {
      try {
        win.focus();
        win.print();
      } catch (_) {
        /* ignore */
      }
    };
  }
  return true;
};
