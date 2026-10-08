import { escapeHtml } from "utils/shipmentPrintDocumentHtml";
import { formatDateGt, formatDateTimeGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { ENTRY_TYPE_LABELS, formatAccountMoney } from "services/customerAccountService";
import { getRegionLabel, parseRouteLocationCode } from "utils/deliveryRouteCatalog";

const COMPANY_BY_KIND = {
  OPV: "CATALOGO FOSSILES",
  OPC: "GRUPO COMERCIAL FUTURA",
};

/** Por debajo de medio centavo un saldo es cero (mismo criterio del backend). */
const BALANCE_EPSILON = 0.005;

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
  // Cartera nueva: efectivo cobrado (sin notas de crédito ni descuentos).
  if (row.paymentsApplied != null) return Number(row.paymentsApplied) || 0;
  if (row.abonos != null) return Number(row.abonos) || 0;
  if (row.appliedCredits != null) return Number(row.appliedCredits) || 0;
  const charged = Number(row.chargedAmount ?? row.chargeAmount ?? row.cargos ?? 0) || 0;
  const balance = Number(row.balanceDue ?? row.saldos ?? 0) || 0;
  return Math.max(0, charged - balance);
}

/** Notas de crédito, devoluciones y descuentos aplicados (solo la cartera nueva los separa). */
function resolveCreditos(row) {
  return Number(row.creditsApplied ?? row.creditos ?? 0) || 0;
}

function resolvePoblacion(row) {
  return row.poblacion || row.routeLocationLabel || row.address || "";
}

function resolveClasif(row) {
  return row.clasif || row.routeLocationCode || "";
}

function isPortfolioRow(row) {
  return row.rowType != null;
}

export function normalizeRutasCxcRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      // Filas de /portfolio-report: ya vienen una por documento (con saldo, saldo inicial y ajustes).
      if (isPortfolioRow(row)) return true;
      // Filas legadas de receivable-search: solo documentos con cargo (el saldo en cero se descarta abajo).
      const hasCharge =
        row.hasCharge === true ||
        row.chargeEntryId != null ||
        Number(row.chargedAmount ?? row.chargeAmount ?? row.cargos ?? 0) > 0;
      return hasCharge;
    })
    .map((row) => {
      const cargos = Number(row.cargos ?? row.chargedAmount ?? row.chargeAmount ?? 0) || 0;
      const abonos = resolveAbonos(row);
      const creditos = resolveCreditos(row);
      // Saldo = cargos - abonos - créditos. La cartera nueva conserva el signo (ajustes de crédito);
      // el formato legado nunca mostró saldos negativos.
      const saldosRaw = row.saldos ?? row.balanceDue;
      const saldosValue =
        saldosRaw != null ? Number(saldosRaw) || 0 : cargos - abonos - creditos;
      const saldos = isPortfolioRow(row) ? saldosValue : Math.max(0, saldosValue);
      return {
        ...row,
        documentNumber:
          row.documentNumber ||
          row.invoiceNumber ||
          row.vendorShipmentNumber ||
          row.shipmentNumber ||
          row.orderCode,
        clasif: row.clasif || row.routeLocationCode,
        poblacion: row.poblacion || row.routeLocationLabel,
        cargos,
        abonos,
        creditos,
        saldos,
        chargedAmount: cargos,
        appliedCredits: abonos + creditos,
        balanceDue: saldos,
        dueDate: row.dueDate || row.chargeDate,
      };
    })
    // La cartera es de saldos: un documento en cero ya no se debe y no se lista ni se imprime (un saldo
    // negativo, crédito a favor, sí). El backend ya lo filtra; esto cubre datos legados o un backend anterior.
    .filter((row) => Math.abs(row.saldos) >= BALANCE_EPSILON)
    .sort((a, b) => {
      const clasifCmp = String(a.clasif || "").localeCompare(String(b.clasif || ""), "es");
      if (clasifCmp !== 0) return clasifCmp;
      const nameCmp = String(a.customerName || "").localeCompare(String(b.customerName || ""), "es");
      if (nameCmp !== 0) return nameCmp;
      return String(a.chargeDate || "").localeCompare(String(b.chargeDate || ""));
    });
}

/**
 * Totales de un conjunto de filas. El saldo se suma por cliente y se limita a >= 0, igual que el saldo
 * por cobrar del listado de cuentas (un crédito a favor no resta deuda de otros clientes).
 */
export function sumRutasCxcTotals(rows = []) {
  const totals = { cargos: 0, abonos: 0, creditos: 0, saldos: 0 };
  const netByCustomer = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row, idx) => {
    totals.cargos += Number(row.cargos ?? row.chargedAmount) || 0;
    totals.abonos += Number(row.abonos) || 0;
    totals.creditos += Number(row.creditos) || 0;
    const key = row.customerId != null ? `c${row.customerId}` : `r${idx}`;
    netByCustomer.set(key, (netByCustomer.get(key) || 0) + (Number(row.saldos ?? row.balanceDue) || 0));
  });
  netByCustomer.forEach((net) => {
    totals.saldos += Math.max(0, net);
  });
  return totals;
}

/** Agrupa filas por ruta (Ruta 1, Ruta 2…) para preview e impresión global. */
export function groupRutasCxcRowsByRoute(rows = []) {
  const groups = new Map();
  normalizeRutasCxcRows(rows).forEach((row) => {
    const parsed = parseRouteLocationCode(row.clasif || row.routeLocationCode);
    const regionCode = parsed?.regionCode || "NONE";
    const routeNumber = parsed?.routeNumber ?? null;
    const key = routeNumber != null ? `R${routeNumber}` : "NONE";
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        regionCode,
        routeNumber,
        label:
          routeNumber != null
            ? `${getRegionLabel(regionCode)} · Ruta ${routeNumber}`
            : "Sin ruta asignada",
        rows: [],
        totalSaldos: 0,
        totalCargos: 0,
        totalAbonos: 0,
        totalCreditos: 0,
        documentCount: 0,
      });
    }
    groups.get(key).rows.push(row);
  });

  const order = { CA: 1, CB: 2, CC: 3, NONE: 99 };
  return Array.from(groups.values())
    .map((group) => {
      const totals = sumRutasCxcTotals(group.rows);
      return {
        ...group,
        totalCargos: totals.cargos,
        totalAbonos: totals.abonos,
        totalCreditos: totals.creditos,
        totalSaldos: totals.saldos,
        documentCount: group.rows.filter((r) => r.rowType !== "ORPHAN_CREDIT").length,
      };
    })
    .sort((a, b) => {
      const ra = order[a.regionCode] ?? 50;
      const rb = order[b.regionCode] ?? 50;
      if (ra !== rb) return ra - rb;
      return (a.routeNumber ?? 999) - (b.routeNumber ?? 999);
    });
}

const TABLE_HEAD_HTML = `
  <tr>
    <th class="col-doc">Documento</th>
    <th class="col-clave">Clave</th>
    <th class="col-nombre">Nombre del Cliente</th>
    <th class="col-clasif">Clasif.</th>
    <th class="col-pob">Poblacion</th>
    <th class="col-fecha">Fecha Cargo</th>
    <th class="num">CARGOS</th>
    <th class="num">ABONOS</th>
    <th class="num">CREDITOS</th>
    <th class="num">SALDOS</th>
  </tr>`;

function buildDocumentLabel(row) {
  const base = String(resolveDocumentNumber(row));
  // Más de un cargo activo para el mismo documento: se consolidó en una fila y se avisa.
  return row.duplicateCharges ? `${base} *(${Number(row.chargeCount) || 2} cargos)` : base;
}

function buildTableRowsHtml(dataRows) {
  return dataRows
    .map((row) => {
      const cargos = Number(row.cargos ?? row.chargedAmount ?? row.chargeAmount ?? 0) || 0;
      const abonos = resolveAbonos(row);
      const creditos = resolveCreditos(row);
      const saldos = Number(row.saldos ?? row.balanceDue ?? cargos - abonos - creditos) || 0;
      return `
      <tr>
        <td class="col-doc">${escapeHtml(buildDocumentLabel(row))}</td>
        <td class="col-clave">${escapeHtml(row.legacyCode || "—")}</td>
        <td class="col-nombre">${escapeHtml(row.customerName || "—")}</td>
        <td class="col-clasif">${escapeHtml(resolveClasif(row))}</td>
        <td class="col-pob">${escapeHtml(resolvePoblacion(row))}</td>
        <td class="col-fecha">${escapeHtml(fmtDateSlash(resolveDueDate(row)))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(cargos))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(abonos))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(creditos))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(saldos))}</td>
      </tr>`;
    })
    .join("");
}

function buildTotalsRowHtml(label, totals) {
  return `
      <tr class="totals">
        <td colspan="6">${escapeHtml(label)}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(totals.cargos))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(totals.abonos))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(totals.creditos))}</td>
        <td class="num">${escapeHtml(fmtMoneyPlain(totals.saldos))}</td>
      </tr>`;
}

function buildRutasStyles() {
  return `
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
    .route-subtitle {
      font-size: 12px;
      font-weight: 700;
      margin: 2px 0 0;
    }
    .route-block { margin-top: 10px; page-break-inside: avoid; }
    .route-heading {
      font-size: 12px;
      font-weight: 700;
      margin: 10px 0 4px;
      border-bottom: 1px solid #000;
      padding-bottom: 2px;
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
    .col-doc { width: 11%; }
    .col-clave { width: 6%; }
    .col-nombre { width: 22%; }
    .col-clasif { width: 6%; }
    .col-pob { width: 13%; }
    .col-fecha { width: 8%; }
    table.rutas tr.totals td {
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      font-weight: 700;
      padding-top: 3px;
    }
    .legend { margin-top: 8px; font-size: 10px; }
    .annex { page-break-before: always; }
    .annex-title { font-size: 14px; font-weight: 700; margin: 0 0 2px; }
    .annex-note { font-size: 10px; margin: 0 0 6px; }
    table.annex-table { width: 100%; border-collapse: collapse; font-size: 10px; }
    table.annex-table th, table.annex-table td { border: 1px solid #888; padding: 2px 4px; text-align: left; }
    table.annex-table th.num, table.annex-table td.num { text-align: right; }
    table.annex-table tr.voided td { color: #777; text-decoration: line-through; }
    table.annex-table tr.totals td { font-weight: 700; }
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
      .route-block { page-break-inside: avoid; }
    }
  `;
}

/**
 * Anexo "Detalle de movimientos": página aparte, rotulada, que nunca se mezcla con la cartera.
 * Los movimientos anulados se listan tachados y no suman.
 */
export function buildMovementsAnnexHtml(movements = [], { from = "", to = "" } = {}) {
  const list = Array.isArray(movements) ? movements : [];
  const period =
    from || to
      ? `Período: ${fmtDateSlash(from) || "inicio"} al ${fmtDateSlash(to) || "hoy"}`
      : "Todo el historial";
  let debit = 0;
  let credit = 0;
  const body = list
    .map((m) => {
      const voided = m.status === "VOID";
      if (!voided) {
        debit += Number(m.debit) || 0;
        credit += Number(m.credit) || 0;
      }
      const typeLabel = ENTRY_TYPE_LABELS[m.entryType] || m.entryType || "—";
      return `
      <tr${voided ? ' class="voided"' : ""}>
        <td>${escapeHtml(fmtDateSlash(m.entryDate))}</td>
        <td>${escapeHtml(m.customerName || "—")}</td>
        <td>${escapeHtml(typeLabel)}</td>
        <td>${escapeHtml(m.documentNumber || "—")}</td>
        <td>${escapeHtml(m.reference || "—")}</td>
        <td>${escapeHtml(m.description || "")}</td>
        <td class="num">${Number(m.debit) > 0 ? escapeHtml(fmtMoneyPlain(m.debit)) : ""}</td>
        <td class="num">${Number(m.credit) > 0 ? escapeHtml(fmtMoneyPlain(m.credit)) : ""}</td>
        <td>${voided ? `ANULADO${m.voidReason ? ` — ${escapeHtml(m.voidReason)}` : ""}` : "Activo"}</td>
      </tr>`;
    })
    .join("");
  return `
  <div class="annex">
    <p class="annex-title">ANEXO — DETALLE DE MOVIMIENTOS</p>
    <p class="annex-note">${escapeHtml(period)}. Este anexo es informativo y no forma parte de la cartera: los montos de CARGOS, ABONOS, CREDITOS y SALDOS están en el reporte anterior. Los anulados no suman.</p>
    <table class="annex-table">
      <thead>
        <tr>
          <th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Documento</th><th>Referencia</th><th>Concepto</th>
          <th class="num">Débito</th><th class="num">Crédito</th><th>Estado</th>
        </tr>
      </thead>
      <tbody>${body || '<tr><td colspan="9">Sin movimientos en el período.</td></tr>'}</tbody>
      ${
        list.length
          ? `<tfoot><tr class="totals"><td colspan="6">TOTAL (sin anulados)</td><td class="num">${escapeHtml(
              fmtMoneyPlain(debit)
            )}</td><td class="num">${escapeHtml(fmtMoneyPlain(credit))}</td><td></td></tr></tfoot>`
          : ""
      }
    </table>
  </div>`;
}

/**
 * Resumen RUTAS CxC — mismo layout del reporte legado (PDF), con ABONOS (efectivo) y CREDITOS
 * (notas de crédito, devoluciones, descuentos) separados. SALDOS = CARGOS − ABONOS − CREDITOS.
 * @param {object} options
 * @param {Array} options.rows filas de cartera (una por documento) de la cartera activa
 * @param {"OPV"|"OPC"} options.orderKind cartera activa
 * @param {boolean} [options.groupByRoute=false] separar secciones por ruta (global)
 * @param {string} [options.routeLabel] subtítulo cuando es una sola ruta
 * @param {Array|null} [options.movements] anexo de movimientos (hoja aparte); null = sin anexo
 * @param {{from?: string, to?: string}} [options.movementsPeriod] período del anexo
 */
export function buildRutasCxcPrintHtml({
  rows = [],
  orderKind = "OPV",
  groupByRoute = false,
  routeLabel = "",
  movements = null,
  movementsPeriod = {},
} = {}) {
  const companyName = resolveCompanyName(orderKind);
  const reportDate = fmtDateSlash(getTodayYmdGuatemala());
  const dataRows = normalizeRutasCxcRows(rows);
  const groups = groupByRoute ? groupRutasCxcRowsByRoute(dataRows) : null;
  const grand = sumRutasCxcTotals(dataRows);
  const hasDuplicates = dataRows.some((row) => row.duplicateCharges);

  let bodyHtml = "";

  if (groups) {
    bodyHtml = groups
      .map(
        (group) => `
        <div class="route-block">
          <div class="route-heading">${escapeHtml(group.label)} — ${group.documentCount} doc. — TOTAL ${escapeHtml(
          fmtMoneyPlain(group.totalSaldos)
        )}</div>
          <table class="rutas">
            <thead>${TABLE_HEAD_HTML}</thead>
            <tbody>${buildTableRowsHtml(group.rows)}</tbody>
            <tfoot>${buildTotalsRowHtml("TOTAL RUTA", {
              cargos: group.totalCargos,
              abonos: group.totalAbonos,
              creditos: group.totalCreditos,
              saldos: group.totalSaldos,
            })}</tfoot>
          </table>
        </div>`
      )
      .join("");
  } else {
    bodyHtml = `
      <table class="rutas">
        <thead>${TABLE_HEAD_HTML}</thead>
        <tbody>
          ${buildTableRowsHtml(dataRows) || `<tr><td colspan="10" class="empty">Sin documentos cargados en esta cartera.</td></tr>`}
        </tbody>
        ${dataRows.length ? `<tfoot>${buildTotalsRowHtml("TOTAL", grand)}</tfoot>` : ""}
      </table>`;
  }

  const annexHtml = Array.isArray(movements) ? buildMovementsAnnexHtml(movements, movementsPeriod) : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>RUTAS CxC — ${escapeHtml(companyName)}</title>
  <style>${buildRutasStyles()}</style>
</head>
<body>
  <div class="header">
    <div class="header-left">Fecha: ${escapeHtml(reportDate)}</div>
    <div class="header-center">
      <div class="company">${escapeHtml(companyName)}</div>
      <div class="title">RUTAS CxC</div>
      ${routeLabel ? `<div class="route-subtitle">${escapeHtml(routeLabel)}</div>` : ""}
      ${groupByRoute ? `<div class="route-subtitle">REPORTE GLOBAL</div>` : ""}
    </div>
    <div class="header-right">Página: 1</div>
  </div>

  ${
    bodyHtml ||
    `<p class="empty">Sin documentos cargados en esta cartera.</p>`
  }

  ${
    groupByRoute && dataRows.length
      ? `<table class="rutas"><tfoot>${buildTotalsRowHtml("TOTAL GENERAL", grand)}</tfoot></table>`
      : ""
  }
  ${
    hasDuplicates
      ? `<div class="legend">* Documento con más de un cargo activo en el libro: se muestra en una sola fila (suma de cargos). Revisar y anular el cargo sobrante.</div>`
      : ""
  }
  ${annexHtml}
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
