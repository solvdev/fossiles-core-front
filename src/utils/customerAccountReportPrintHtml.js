import { escapeHtml } from "utils/shipmentPrintDocumentHtml";
import { formatDateGt, formatDateTimeGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { ENTRY_TYPE_LABELS, formatAccountMoney } from "services/customerAccountService";

const COMPANY_BY_KIND = {
  OPV: "CATALOGO FOSSILES",
  OPC: "GRUPO COMERCIAL FUTURA",
};

function fmtMoneyPlain(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateSlash(value) {
  if (!value) return "";
  const formatted = formatDateGt(value);
  if (!formatted || formatted === "-") return "";
  return formatted;
}

function resolveCompanyName(orderKind) {
  return COMPANY_BY_KIND[String(orderKind || "").toUpperCase()] || COMPANY_BY_KIND.OPV;
}

function resolveDocumentNumber(row) {
  return (
    row.documentNumber ||
    row.invoiceNumber ||
    row.vendorShipmentNumber ||
    row.shipmentNumber ||
    row.orderCode ||
    row.chargeEntryId ||
    "—"
  );
}

function resolveDueDate(row) {
  return row.dueDate || row.chargeDate || row.entryDate || "";
}

function resolveAbonos(row) {
  if (row.abonos != null) return Number(row.abonos) || 0;
  const charged = Number(row.chargedAmount ?? row.cargos ?? 0) || 0;
  const balance = Number(row.balanceDue ?? row.saldos ?? 0) || 0;
  return Math.max(0, charged - balance);
}

function resolvePoblacion(row) {
  return row.poblacion || row.routeLocationLabel || row.address || "";
}

function resolveClasif(row) {
  return row.clasif || row.routeLocationCode || "";
}

/**
 * Resumen RUTAS CxC — mismo layout del reporte legado (PDF).
 * @param {object} options
 * @param {Array} options.rows documentos con saldo de la cartera activa
 * @param {"OPV"|"OPC"} options.orderKind cartera activa
 */
export function buildRutasCxcPrintHtml({ rows = [], orderKind = "OPV" } = {}) {
  const companyName = resolveCompanyName(orderKind);
  const reportDate = fmtDateSlash(getTodayYmdGuatemala());
  const dataRows = (Array.isArray(rows) ? rows : []).filter(
    (row) => Number(row.balanceDue ?? row.saldos ?? 0) > 0.001
  );

  let totalSaldos = 0;
  const bodyRows = dataRows
    .map((row) => {
      const cargos = Number(row.chargedAmount ?? row.cargos ?? 0) || 0;
      const abonos = resolveAbonos(row);
      const saldos = Number(row.balanceDue ?? row.saldos ?? 0) || 0;
      totalSaldos += saldos;
      return `
      <tr>
        <td class="col-doc">${escapeHtml(String(resolveDocumentNumber(row)))}</td>
        <td class="col-clave">${escapeHtml(row.legacyCode || "—")}</td>
        <td class="col-nombre">${escapeHtml(row.customerName || "—")}</td>
        <td class="col-clasif">${escapeHtml(resolveClasif(row))}</td>
        <td class="col-pob">${escapeHtml(resolvePoblacion(row))}</td>
        <td class="col-fecha">${escapeHtml(fmtDateSlash(resolveDueDate(row)))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(cargos))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(abonos))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(saldos))}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>RUTAS CxC — ${escapeHtml(companyName)}</title>
  <style>
    @page { size: letter landscape; margin: 10mm 12mm; }
    body {
      font-family: "Courier New", Courier, monospace;
      font-size: 11px;
      color: #000;
      margin: 0;
      padding: 8px 12px;
    }
    .header {
      display: grid;
      grid-template-columns: 1fr 2fr 1fr;
      align-items: start;
      margin-bottom: 6px;
    }
    .header-left { text-align: left; }
    .header-center { text-align: center; }
    .header-right { text-align: right; }
    .company {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin-bottom: 2px;
    }
    .title {
      font-size: 18px;
      font-weight: 700;
      margin: 0;
      letter-spacing: 1px;
    }
    table.rutas {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    table.rutas thead th {
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      padding: 4px 3px;
      font-weight: 700;
      text-align: left;
      white-space: nowrap;
    }
    table.rutas thead th.num,
    table.rutas td.num {
      text-align: right;
    }
    table.rutas tbody td {
      padding: 2px 3px;
      vertical-align: top;
      border: none;
    }
    .col-doc { width: 9%; }
    .col-clave { width: 7%; }
    .col-nombre { width: 24%; }
    .col-clasif { width: 7%; }
    .col-pob { width: 16%; }
    .col-fecha { width: 9%; }
    .footer-line {
      border-top: 1px solid #000;
      margin-top: 4px;
      padding-top: 4px;
      text-align: right;
      font-weight: 700;
    }
    .footer-line-bottom {
      border-bottom: 1px solid #000;
      margin-top: 2px;
      height: 4px;
    }
    .empty { margin-top: 24px; text-align: center; }
    @media print {
      body { padding: 0; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">Fecha: ${escapeHtml(reportDate)}</div>
    <div class="header-center">
      <div class="company">${escapeHtml(companyName)}</div>
      <div class="title">RUTAS CxC</div>
    </div>
    <div class="header-right">Página: 1</div>
  </div>

  <table class="rutas">
    <thead>
      <tr>
        <th class="col-doc">Documento</th>
        <th class="col-clave">Clave</th>
        <th class="col-nombre">Nombre del Cliente</th>
        <th class="col-clasif">Clasif.</th>
        <th class="col-pob">Poblacion</th>
        <th class="col-fecha">Fecha Venc.</th>
        <th class="num">CARGOS</th>
        <th class="num">ABONOS</th>
        <th class="num">SALDOS</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="9" class="empty">Sin documentos con saldo pendiente en esta cartera.</td></tr>`}
    </tbody>
  </table>

  ${
    dataRows.length
      ? `<div class="footer-line">TOTAL: ${escapeHtml(fmtMoneyPlain(totalSaldos))}</div>
         <div class="footer-line-bottom"></div>`
      : ""
  }
</body>
</html>`;
}

function fmtMoney(value) {
  return escapeHtml(formatAccountMoney(value));
}

function fmtDate(value) {
  if (!value) return "—";
  return escapeHtml(String(value).slice(0, 10));
}

function buildMovementRow(line) {
  const voided = line.status === "VOID";
  const rowClass = voided ? ' class="voided"' : "";
  const typeLabel = ENTRY_TYPE_LABELS[line.entryType] || line.entryType || "—";
  const opRef = [line.productionOrderCode, line.vendorShipmentNumber]
    .filter(Boolean)
    .join(" · ");
  return `
    <tr${rowClass}>
      <td>${fmtDate(line.entryDate)}</td>
      <td>${escapeHtml(typeLabel)}${voided ? " (Anulado)" : ""}</td>
      <td>${escapeHtml(line.reference || "—")}</td>
      <td>${escapeHtml(line.description || "—")}</td>
      <td>${escapeHtml(opRef || "—")}</td>
      <td class="num">${Number(line.debit) > 0 ? fmtMoney(line.debit) : "—"}</td>
      <td class="num">${Number(line.credit) > 0 ? fmtMoney(line.credit) : "—"}</td>
      <td class="num">${line.runningBalance != null ? fmtMoney(line.runningBalance) : "—"}</td>
    </tr>
  `;
}

/** @deprecated Preferir buildRutasCxcPrintHtml para el resumen de cartera. */
export function buildCustomerAccountReportPrintHtml(report, filtersSummary = "", options = {}) {
  const orderKind = options.orderKind || "OPV";
  const customers = Array.isArray(report?.customers) ? report.customers : [];
  const documentRows = [];

  customers.forEach((customer) => {
    const lines = Array.isArray(customer.lines) ? customer.lines : [];
    const charges = lines.filter(
      (line) => line.entryType === "CHARGE" && line.status === "ACTIVE"
    );
    if (!charges.length) {
      const due = Number(customer.balanceDue) || 0;
      if (due > 0.001) {
        documentRows.push({
          customerName: customer.customerName,
          legacyCode: customer.legacyCode,
          routeLocationCode: customer.routeLocationCode,
          routeLocationLabel: customer.routeLocationLabel,
          chargedAmount: due,
          balanceDue: due,
          chargeDate: customer.lastChargeDate,
          invoiceNumber: null,
          documentNumber: null,
        });
      }
      return;
    }
    charges.forEach((charge) => {
      const applied = lines
        .filter(
          (line) =>
            line.appliedToEntryId === charge.id &&
            line.status === "ACTIVE" &&
            Number(line.credit) > 0
        )
        .reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
      const cargos = Number(charge.debit) || 0;
      const saldos = Math.max(0, cargos - applied);
      if (saldos <= 0.001) return;
      if (orderKind === "OPV" || orderKind === "OPC") {
        const kind = String(charge.orderKind || "").toUpperCase();
        if (kind && kind !== orderKind) return;
      }
      documentRows.push({
        customerName: customer.customerName,
        legacyCode: customer.legacyCode,
        routeLocationCode: customer.routeLocationCode,
        routeLocationLabel: customer.routeLocationLabel,
        chargedAmount: cargos,
        abonos: applied,
        balanceDue: saldos,
        chargeDate: charge.entryDate,
        invoiceNumber: charge.invoiceNumber || charge.vendorShipmentNumber,
        documentNumber: charge.documentNumber || charge.productionOrderCode,
        orderKind: charge.orderKind,
      });
    });
  });

  if (!documentRows.length && filtersSummary) {
    // fallback vacío sigue el mismo layout
  }
  return buildRutasCxcPrintHtml({ rows: documentRows, orderKind });
}

export function openBlankPrintWindow() {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return null;
  w.document.open();
  w.document.write(
    "<!DOCTYPE html><html><head><meta charset='utf-8'><title>RUTAS CxC</title></head>" +
      "<body style='font-family:Courier New,monospace;padding:24px'>Generando reporte...</body></html>"
  );
  w.document.close();
  return w;
}

export function writeHtmlToPrintWindow(printWindow, html) {
  if (!printWindow || printWindow.closed) return false;
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    try {
      printWindow.print();
    } catch (_e) {
      /* ignore */
    }
  }, 300);
  return true;
}

export function openCustomerAccountReportPrintWindow(html, printWindow = null) {
  const w = printWindow || openBlankPrintWindow();
  if (!w) return false;
  return writeHtmlToPrintWindow(w, html);
}

/** Estado de cuenta de un cliente — mantiene detalle de movimientos. */
export function buildSingleCustomerReportPrintHtml(statement, lines, lfOrderCount = 0) {
  if (!statement) return "";
  const due =
    Number(statement.closingBalanceDue) ||
    Math.max(0, Number(statement.closingBalance) || 0);
  const credit =
    Number(statement.closingCreditBalance) ||
    Math.max(0, -(Number(statement.closingBalance) || 0));
  const movementRows = (lines || statement.lines || []).map(buildMovementRow).join("");
  const generated = formatDateTimeGt(new Date());

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Estado de cuenta — ${escapeHtml(statement.customerName || "")}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; margin: 16px; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    .meta { color: #555; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; }
    th { background: #eee; }
    td.num, th.num { text-align: right; }
    tr.voided { color: #888; text-decoration: line-through; }
    .due { color: #c0392b; font-weight: 700; }
    .credit { color: #148f77; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Estado de cuenta — ${escapeHtml(statement.customerName || "Cliente")}</h1>
  <div class="meta">
    Generado: ${escapeHtml(generated)}
    ${statement.legacyCode ? ` · Clave: ${escapeHtml(statement.legacyCode)}` : ""}
    ${statement.nit ? ` · NIT: ${escapeHtml(statement.nit)}` : ""}
    <br />
    Por cobrar: <span class="due">${fmtMoney(due)}</span>
    · Crédito: <span class="credit">${fmtMoney(credit)}</span>
    ${lfOrderCount ? ` · Documentos: ${lfOrderCount}` : ""}
  </div>
  <table>
    <thead>
      <tr>
        <th>Fecha</th>
        <th>Tipo</th>
        <th>Referencia</th>
        <th>Concepto</th>
        <th>Documento</th>
        <th class="num">Débito</th>
        <th class="num">Crédito</th>
        <th class="num">Saldo</th>
      </tr>
    </thead>
    <tbody>${movementRows || '<tr><td colspan="8">Sin movimientos.</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}
