import { escapeHtml } from "utils/shipmentPrintDocumentHtml";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { ENTRY_TYPE_LABELS, formatAccountMoney } from "services/customerAccountService";
import { getRegionLabel, groupAccountRowsByRoute, summarizeByRegion } from "utils/deliveryRouteCatalog";

function fmtMoney(value) {
  return escapeHtml(formatAccountMoney(value));
}

function fmtDate(value) {
  if (!value) return "—";
  return escapeHtml(String(value).slice(0, 10));
}

function buildSummaryRow(c) {
  return `
    <tr>
      <td>${escapeHtml(c.legacyCode || "—")}</td>
      <td><code>${escapeHtml(c.routeLocationCode || "—")}</code></td>
      <td>${escapeHtml(c.routeLocationLabel || "—")}</td>
      <td>${escapeHtml(c.customerName || "—")}</td>
      <td>${escapeHtml(c.nit || "—")}</td>
      <td>${escapeHtml(c.phone || "—")}</td>
      <td class="num due">${fmtMoney(c.balanceDue)}</td>
      <td class="num credit">${fmtMoney(c.creditBalance)}</td>
      <td>${fmtDate(c.lastChargeDate)}</td>
      <td>${fmtDate(c.lastPaymentDate)}</td>
      <td class="num">${escapeHtml(String(c.lfOrderCount ?? 0))}</td>
    </tr>
  `;
}

function buildMovementRow(line) {
  const voided = line.status === "VOID";
  const rowClass = voided ? ' class="voided"' : "";
  const typeLabel = ENTRY_TYPE_LABELS[line.entryType] || line.entryType || "—";
  const opRef = [line.productionOrderCode, line.vendorShipmentNumber, line.orderKind ? `(${line.orderKind})` : ""]
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

function buildCustomerSection(c, index) {
  const lines = Array.isArray(c.lines) ? c.lines : [];
  const movementRows = lines.length > 0
    ? lines.map(buildMovementRow).join("")
    : '<tr><td colspan="8">Sin movimientos en el período.</td></tr>';

  const contact = [c.phone, c.email, c.address].filter(Boolean).join(" · ");
  const routeLabel = c.routeLocationCode
    ? `${c.routeLocationCode}${c.routeLocationLabel ? ` — ${c.routeLocationLabel}` : ""}`
    : "Sin ruta";

  return `
    <section class="customer-section">
      <h3>${index + 1}. ${escapeHtml(c.customerName || "Cliente")}</h3>
      <p class="customer-meta">
        Ruta: <strong>${escapeHtml(routeLabel)}</strong> ·
        ${c.nit ? `NIT: ${escapeHtml(c.nit)} · ` : ""}
        ${contact ? escapeHtml(contact) + " · " : ""}
        Saldo por cobrar: <strong class="due">${fmtMoney(c.balanceDue)}</strong> ·
        Crédito a favor: <strong class="credit">${fmtMoney(c.creditBalance)}</strong>
      </p>
      <table class="detail-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Tipo</th>
            <th>Referencia</th>
            <th>Concepto</th>
            <th>OP / ENVP</th>
            <th class="num">Débito</th>
            <th class="num">Crédito</th>
            <th class="num">Saldo</th>
          </tr>
        </thead>
        <tbody>${movementRows}</tbody>
      </table>
    </section>
  `;
}

function buildRegionSummaryTable(customers) {
  const totals = summarizeByRegion(customers);
  const rows = ["CA", "CB", "CC", "NONE"].map((code) => {
    const t = totals[code] || { due: 0, credit: 0, count: 0 };
    if (t.count === 0 && code === "NONE") return "";
    const label = code === "NONE" ? "Sin ruta" : getRegionLabel(code);
    return `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="num">${t.count}</td>
        <td class="num due">${fmtMoney(t.due)}</td>
        <td class="num credit">${fmtMoney(t.credit)}</td>
      </tr>
    `;
  }).join("");
  return `
    <h2>Resumen por región</h2>
    <table class="region-table">
      <thead>
        <tr>
          <th>Región</th>
          <th class="num">Clientes</th>
          <th class="num">Por cobrar</th>
          <th class="num">Crédito</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function buildGroupedSections(customers) {
  const groups = groupAccountRowsByRoute(customers);
  return groups.map((group) => {
    const title =
      group.regionCode === "NONE"
        ? "Sin ruta asignada"
        : `${getRegionLabel(group.regionCode)} · Ruta ${group.routeNumber ?? "—"}`;
    const summaryRows = group.rows.map(buildSummaryRow).join("");
    let detailIndex = 0;
    const detailSections = group.rows
      .map((c) => buildCustomerSection(c, detailIndex++))
      .join("");
    return `
      <section class="route-group">
        <h2>${escapeHtml(title)}</h2>
        <p class="route-meta">
          ${group.rows.length} cliente(s) · Por cobrar: <strong class="due">${fmtMoney(group.totalDue)}</strong> ·
          Crédito: <strong class="credit">${fmtMoney(group.totalCredit)}</strong> ·
          Con deuda: ${group.withDebt}
        </p>
        <table class="summary-table">
          <thead>
            <tr>
              <th>Clave</th>
              <th>Ruta</th>
              <th>Ubicación</th>
              <th>Cliente</th>
              <th>NIT</th>
              <th>Teléfono</th>
              <th>Saldo por cobrar</th>
              <th>Crédito a favor</th>
              <th>Último cargo</th>
              <th>Último pago</th>
              <th class="num">OPV/OPC</th>
            </tr>
          </thead>
          <tbody>${summaryRows}</tbody>
        </table>
        ${detailSections}
      </section>
    `;
  }).join("");
}

export function buildCustomerAccountReportPrintHtml(report, filtersSummary = "") {
  const customers = Array.isArray(report?.customers) ? report.customers : [];
  const generated = report?.generatedAt ? formatDateTimeGt(report.generatedAt) : formatDateTimeGt(new Date());
  const period =
    report?.fromDate || report?.toDate
      ? `Período movimientos: ${report.fromDate || "inicio"} — ${report.toDate || "hoy"}`
      : "Movimientos: historial completo";

  const regionSummary = buildRegionSummaryTable(customers);
  const groupedHtml = buildGroupedSections(customers);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cuentas por cobrar — Luis Felipe</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; margin: 16px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 13px; margin: 16px 0 6px; color: #333; }
    h3 { font-size: 12px; margin: 0 0 6px; color: #333; }
    .meta { color: #555; margin-bottom: 10px; font-size: 11px; }
    .totals { margin: 10px 0 16px; display: flex; gap: 24px; flex-wrap: wrap; }
    .totals span { font-size: 12px; }
    .due { color: #c0392b; }
    .credit { color: #148f77; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
    th { background: #eee; font-weight: 600; }
    td.num, th.num { text-align: right; }
    tr.voided { color: #888; text-decoration: line-through; }
    .summary-table, .region-table { margin-bottom: 12px; }
    .route-group { page-break-inside: avoid; margin-bottom: 20px; padding-top: 8px; border-top: 2px solid #ccc; }
    .route-meta { margin: 0 0 8px; color: #444; }
    .customer-section { page-break-inside: avoid; margin: 12px 0; padding-top: 6px; border-top: 1px dashed #ddd; }
    .customer-meta { margin: 0 0 8px; color: #444; font-size: 10px; }
    @media print {
      body { margin: 8mm; }
      .route-group, .customer-section { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <h1>Cuentas por cobrar — Vendedor Luis Felipe (OPV / OPC)</h1>
  <div class="meta">
    Generado: ${escapeHtml(generated)} · ${escapeHtml(period)}
    ${filtersSummary ? `<br />${escapeHtml(filtersSummary)}` : ""}
  </div>
  <div class="totals">
    <span>Clientes: <strong>${customers.length}</strong></span>
    <span>Total por cobrar: <strong class="due">${fmtMoney(report?.totalBalanceDue)}</strong></span>
    <span>Total crédito a favor: <strong class="credit">${fmtMoney(report?.totalCreditBalance)}</strong></span>
  </div>

  ${regionSummary}

  <h2>Detalle por región y ruta</h2>
  ${groupedHtml || '<p>Sin datos.</p>'}
</body>
</html>`;
}

export function openBlankPrintWindow() {
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return null;
  w.document.open();
  w.document.write(
    "<!DOCTYPE html><html><head><meta charset='utf-8'><title>Reporte CxC</title></head>" +
      "<body style='font-family:Arial,sans-serif;padding:24px'>Generando reporte...</body></html>"
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

/** Reporte de un solo cliente (desde estado de cuenta ya cargado). */
export function buildSingleCustomerReportPrintHtml(statement, lines, lfOrderCount = 0) {
  if (!statement) return "";
  const split = (v, fallback) => {
    const n = Number(v);
    if (Number.isFinite(n) && v != null && v !== "") {
      return { due: n > 0 ? n : 0, credit: n < 0 ? Math.abs(n) : 0 };
    }
    return fallback;
  };
  const fromClosing = split(statement.closingBalance, { due: 0, credit: 0 });
  const due = statement.closingBalanceDue ?? fromClosing.due;
  const credit = statement.closingCreditBalance ?? fromClosing.credit;

  const customer = {
    customerId: statement.customerId,
    customerName: statement.customerName,
    nit: statement.nit,
    phone: statement.phone,
    email: statement.email,
    address: statement.address,
    routeLocationCode: statement.routeLocationCode,
    routeLocationLabel: statement.routeLocationLabel,
    routeRegionCode: statement.routeRegionCode,
    routeNumber: statement.routeNumber,
    balanceDue: due,
    creditBalance: credit,
    balance: statement.closingBalance,
    lastChargeDate: null,
    lastPaymentDate: null,
    lfOrderCount,
    lines: lines || statement.lines || [],
  };
  const report = {
    generatedAt: new Date().toISOString(),
    fromDate: statement.fromDate,
    toDate: statement.toDate,
    totalBalanceDue: customer.balanceDue,
    totalCreditBalance: customer.creditBalance,
    customers: [customer],
  };
  const period =
    statement.fromDate || statement.toDate
      ? `Período: ${statement.fromDate || "inicio"} — ${statement.toDate || "hoy"}`
      : "";
  return buildCustomerAccountReportPrintHtml(report, period);
}
