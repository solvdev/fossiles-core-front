import { formatDateTimeGt } from "./dateTimeHelper";

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const formatMoneyQ = (value) => {
  const n = Number(value || 0);
  return `Q${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatReportDateTime = (value) => {
  const label = formatDateTimeGt(value);
  if (!label || label === "-") return "—";
  return label.replace(/\//g, "/");
};

const formatGeneratedByLine = (name, when) => {
  const who = String(name || "").trim().toUpperCase() || "USUARIO";
  const whenLabel = formatReportDateTime(when || new Date())
    .replace(/\//g, "-")
    .replace(/,\s*/g, " ")
    .replace(/\s*a\.?\s*m\.?/gi, "")
    .replace(/\s*p\.?\s*m\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${who} EL ${whenLabel}`;
};

const paymentRowClass = (kind) => {
  const k = String(kind || "").toUpperCase();
  if (k === "CASH") return "pay-cash";
  if (k === "CARD") return "pay-card";
  if (k === "MIXED") return "pay-mixed";
  return "pay-other";
};

const reportStyles = `
  @page { size: letter; margin: 12mm; }
  body {
    font-family: Calibri, Arial, sans-serif;
    font-size: 11pt;
    color: #000;
    margin: 0;
    padding: 8px 12px 24px;
  }
  .title {
    text-align: center;
    font-size: 16pt;
    font-weight: bold;
    margin: 0 0 10px;
    letter-spacing: 0.5px;
  }
  .meta { margin: 2px 0; }
  .meta strong { font-weight: bold; }
  table.sales {
    width: 100%;
    border-collapse: collapse;
    margin-top: 14px;
  }
  table.sales th, table.sales td {
    border: 1px solid #222;
    padding: 4px 6px;
    vertical-align: middle;
  }
  table.sales th {
    background: #f0f0f0;
    text-align: left;
    font-weight: bold;
  }
  td.num, th.num { text-align: right; white-space: nowrap; }
  tr.pay-card td.amount { background: #9ec5fe; font-weight: bold; }
  tr.pay-mixed td.amount { background: #7dd3c7; font-weight: bold; }
  tr.pay-cash td.amount { background: #f7a8c4; font-weight: bold; }
  tr.pay-other td.amount { background: #e9ecef; font-weight: bold; }
  tr.subtotal td { font-weight: bold; background: #fff; }
  tr.disbursement td.amount { background: #8fd19e; font-weight: bold; }
  tr.deposit td.amount, tr.total-cash td.amount { background: #ffe566; font-weight: bold; }
  .summary {
    margin-top: 18px;
    width: 420px;
    max-width: 100%;
  }
  .summary-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 0;
    border-bottom: 1px solid #ddd;
  }
  .summary-row .label { font-weight: bold; }
  .summary-row .value { text-align: right; min-width: 110px; }
  .summary-row.highlight .value {
    background: #ffe566;
    padding: 2px 6px;
    font-weight: bold;
  }
  .summary-row.strong .value { font-weight: bold; }
  .defs {
    margin-top: 22px;
    font-size: 9.5pt;
    color: #333;
    border-top: 1px solid #999;
    padding-top: 10px;
  }
  .defs h4 { margin: 0 0 6px; font-size: 10.5pt; }
  .defs p { margin: 0 0 6px; }
  @media print {
    body { padding: 0; }
  }
`;

const buildCloseReportHtml = (report) => {
  const sales = Array.isArray(report?.sales) ? report.sales : [];
  const disbursements = Array.isArray(report?.disbursements) ? report.disbursements : [];

  const saleRows = sales.map((line) => `
    <tr class="${paymentRowClass(line.paymentKind)}">
      <td>${escapeHtml(line.saleNumber || "—")}</td>
      <td>${escapeHtml(line.invoiceNumber || "—")}</td>
      <td>${escapeHtml(line.paymentLabel || line.paymentMethod || "—")}</td>
      <td class="num amount">${escapeHtml(formatMoneyQ(line.amount))}</td>
      <td>${escapeHtml(formatReportDateTime(line.soldAt))}</td>
    </tr>`).join("");

  const disbursementRows = disbursements.map((d) => `
    <tr class="disbursement">
      <td colspan="2"><strong>DESEMBOLSO</strong></td>
      <td>${escapeHtml(d.description || "—")}</td>
      <td class="num amount">${escapeHtml(formatMoneyQ(d.amount))}</td>
      <td></td>
    </tr>`).join("");

  const hasDisbursements = disbursements.length > 0;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DETALLE DE CIERRE DE CAJA</title>
  <style>${reportStyles}</style>
</head>
<body>
  <div class="title">DETALLE DE CIERRE DE CAJA</div>
  <div class="meta"><strong>USUARIO:</strong> ${escapeHtml(report?.openedByName || report?.closedByName || "—")}</div>
  <div class="meta"><strong>FECHA:</strong> ${escapeHtml(formatReportDateTime(report?.openedAt))}
    A: ${escapeHtml(formatReportDateTime(report?.closedAt))}</div>
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
        <td class="num">${escapeHtml(formatMoneyQ(report?.salesSubtotal))}</td>
        <td></td>
      </tr>
      ${disbursementRows}
      ${hasDisbursements ? `
      <tr class="subtotal">
        <td colspan="3" style="text-align:right">Sub Total</td>
        <td class="num">${escapeHtml(formatMoneyQ(report?.salesMinusDisbursements))}</td>
        <td></td>
      </tr>` : ""}
    </tbody>
  </table>

  <div class="summary">
    <div class="summary-row">
      <span class="label">Monto de Apertura</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.openingAmount))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Tarjeta</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.cardSalesTotal))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Efectivo</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.cashSalesTotal))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Desembolso</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.disbursementsTotal))}</span>
    </div>
    <div class="summary-row highlight">
      <span class="label">Deposito${report?.depositDetail ? ` (${escapeHtml(report.depositDetail)})` : ""}</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.depositAmount))}</span>
    </div>
    <div class="summary-row highlight total-cash">
      <span class="label">Total de Efectivo</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.totalCash))}</span>
    </div>
    <div class="summary-row strong">
      <span class="label">Monto Cierre</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.closeAmount))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Apertura</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.openingAmount))}</span>
    </div>
    <div class="summary-row strong">
      <span class="label">Monto Total</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.salesDayTotal))}</span>
    </div>
    <div class="summary-row">
      <span class="label">Diferencia</span>
      <span class="value">${escapeHtml(formatMoneyQ(report?.variance))}</span>
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
</body>
</html>`;
};

/** Abre el reporte en una ventana nueva e inicia impresión (PDF vía diálogo del navegador). */
export const openKioskCashCloseReport = (report, { autoPrint = true } = {}) => {
  if (!report) return false;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildCloseReportHtml(report));
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

export const buildKioskCashCloseReportHtml = buildCloseReportHtml;
