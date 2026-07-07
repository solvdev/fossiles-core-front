import * as XLSX from "xlsx";
import { formatDateGt, formatNowGt, getSaleYmdGuatemala } from "./dateTimeHelper";

const formatDateTime = (value) => {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 19);
};

const formatMoney = (value) => Number(value || 0).toFixed(2);

const formatQty = (value) => Number(value || 0).toFixed(2);

export const formatSaleItemLine = (item) => {
  const qty = Number(item?.quantity || 0);
  const qtyLabel = Number.isInteger(qty) ? String(qty) : qty.toFixed(2).replace(/\.?0+$/, "");
  const code = item?.productCode ? `${item.productCode} ` : "";
  const name = item?.productName || "Producto";
  const color = item?.colorName ? ` (${item.colorName})` : "";
  return `${qtyLabel}x ${code}${name}${color}`.trim();
};

export const formatSaleItemsSummary = (sale, maxLines = 4) => {
  const items = sale?.items || [];
  if (!items.length) return "";
  const lines = items.map(formatSaleItemLine);
  if (lines.length <= maxLines) return lines.join("; ");
  return `${lines.slice(0, maxLines).join("; ")} (+${lines.length - maxLines} más)`;
};

const buildSaleDetailRows = (sales) => {
  const detailRows = [];
  (sales || []).forEach((sale) => {
    (sale.items || []).forEach((item) => {
      detailRows.push({
        "No. Venta": sale.saleNumber || "",
        Fecha: formatDateTime(sale.soldAt || sale.saleDate),
        Cliente: sale.customerName || sale.customerTaxId || "CF",
        Código: item.productCode || "",
        Producto: item.productName || "",
        Color: item.colorName || "",
        Cantidad: formatQty(item.quantity),
        "Precio unit.": formatMoney(item.unitPrice),
        "Total línea": formatMoney(item.lineTotal),
      });
    });
  });
  return detailRows;
};

const buildPdfDetailSection = (sales, escape) => {
  const blocks = (sales || [])
    .map((sale) => {
      const items = sale.items || [];
      if (!items.length) return "";
      const itemRows = items
        .map(
          (item) => `<tr>
            <td>${escape(item.productCode || "")}</td>
            <td>${escape(item.productName || "")}</td>
            <td>${escape(item.colorName || "")}</td>
            <td>${escape(formatQty(item.quantity))}</td>
            <td>${escape(formatMoney(item.unitPrice))}</td>
            <td>${escape(formatMoney(item.lineTotal))}</td>
          </tr>`
        )
        .join("");
      return `
        <div class="sale-detail-block">
          <div class="sale-detail-title">
            Venta ${escape(sale.saleNumber || "")} · ${escape(formatDateTime(sale.soldAt || sale.saleDate))}
            · ${escape(sale.customerName || sale.customerTaxId || "CF")}
          </div>
          <table class="detail-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Color</th>
                <th>Cant.</th>
                <th>P. unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
        </div>`;
    })
    .filter(Boolean)
    .join("");

  if (!blocks) return "";
  return `
    <h2 class="section-title">Detalle de productos por venta</h2>
    ${blocks}
  `;
};

const normalizeRange = (startDate, endDate) => {
  let from = startDate || "";
  let to = endDate || "";
  if (from && !to) to = from;
  if (!from && to) from = to;
  if (from && to && from > to) {
    return { startDate: to, endDate: from };
  }
  return { startDate: from, endDate: to };
};

export const filterSalesByDateRange = (sales, startDate, endDate) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  if (!from || !to) return sales || [];
  return (sales || []).filter((sale) => {
    const ymd = getSaleYmdGuatemala(sale);
    return ymd && ymd >= from && ymd <= to;
  });
};

export const buildKioskReportSummary = (sales) => {
  const rows = (sales || []).filter((sale) => String(sale.status || "").toUpperCase() !== "VOID");
  const salesCount = rows.length;
  const totalItems = rows.reduce((sum, sale) => sum + Number(sale.totalItems || 0), 0);
  const totalAmount = rows.reduce((sum, sale) => sum + Number(sale.totalAmount || 0), 0);
  const averageTicket = salesCount > 0 ? totalAmount / salesCount : 0;
  return { salesCount, totalItems, totalAmount, averageTicket };
};

const formatPeriodLabel = ({ startDate, endDate }) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  if (!from && !to) return "Sin período";
  if (from === to) return `Día ${formatDateGt(from)}`;
  return `${formatDateGt(from)} — ${formatDateGt(to)}`;
};

const buildFileSuffix = ({ startDate, endDate, kioskCode }) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  const rangeLabel = from === to ? from : `${from || "inicio"}_${to || "fin"}`;
  const kiosk = kioskCode ? `_${kioskCode}` : "";
  return `${rangeLabel}${kiosk}`;
};

export const exportKioskSalesToExcel = ({
  sales,
  myReport,
  startDate,
  endDate,
  kioskName,
  kioskCode,
  depositFilter = "ALL",
}) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  const suffix = buildFileSuffix({ startDate: from, endDate: to, kioskCode });
  const periodLabel = formatPeriodLabel({ startDate: from, endDate: to });
  const summary = buildKioskReportSummary(sales);

  const summaryRows = [
    { Campo: "Kiosko", Valor: kioskName || "—" },
    { Campo: "Período", Valor: periodLabel },
    { Campo: "Desde", Valor: from || "—" },
    { Campo: "Hasta", Valor: to || "—" },
    { Campo: "Filtro boleta depósito", Valor: depositFilter === "PENDING" ? "Solo pendientes" : "Todas" },
    { Campo: "Ventas", Valor: summary.salesCount },
    { Campo: "Total unidades", Valor: formatQty(summary.totalItems) },
    { Campo: "Total monto (Q)", Valor: formatMoney(summary.totalAmount) },
    { Campo: "Ticket promedio (Q)", Valor: formatMoney(summary.averageTicket) },
    { Campo: "Generado", Valor: formatNowGt() },
  ];

  const saleRows = (sales || []).map((sale) => ({
    Fecha: formatDateTime(sale.soldAt || sale.saleDate),
    "No. Venta": sale.saleNumber || "",
    "No. interno": sale.internalNumber || sale.invoice?.internalNumber || "",
    Cliente: sale.customerName || sale.customerTaxId || "CF",
    NIT: sale.customerTaxId || "CF",
    "Detalle productos": formatSaleItemsSummary(sale, 20) || "—",
    Pago: sale.paymentMethod || "",
    "Autorización tarjeta": sale.cardAuthNumber || "",
    "Tarjeta últimos 4": sale.cardLast4 || "",
    Items: formatQty(sale.totalItems),
    Descuento: formatMoney(sale.discountAmount),
    Subtotal: formatMoney(sale.subtotal),
    Total: formatMoney(sale.totalAmount),
    "Factura serie": sale.felSerie || sale.invoice?.felSerie || "",
    "Factura número": sale.felNumero || sale.invoice?.felNumero || "",
    "FEL UUID": sale.felUuid || sale.invoice?.felUuid || "",
    "Estado FEL": sale.felStatus || sale.invoice?.status || "",
    Vendedor: sale.soldByName || sale.soldByUsername || "",
    Promoción: sale.promotionName || "",
  }));

  const detailRows = buildSaleDetailRows(sales);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Resumen");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(saleRows), "Ventas");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(detailRows.length ? detailRows : [{ Mensaje: "Sin líneas de detalle" }]),
    "Detalle"
  );
  XLSX.writeFile(wb, `Reporte_Kiosko_${suffix}.xlsx`);
};

export const exportKioskSalesToPdf = ({
  sales,
  myReport,
  startDate,
  endDate,
  kioskName,
  depositFilter = "ALL",
}) => {
  const { startDate: from, endDate: to } = normalizeRange(startDate, endDate);
  const periodLabel = formatPeriodLabel({ startDate: from, endDate: to });
  const summary = buildKioskReportSummary(sales);
  const escape = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const saleRows = (sales || [])
    .map(
      (sale) => `<tr>
        <td>${escape(formatDateTime(sale.soldAt || sale.saleDate))}</td>
        <td>${escape(sale.saleNumber)}</td>
        <td>${escape(sale.internalNumber || sale.invoice?.internalNumber || "")}</td>
        <td>${escape(sale.customerName || sale.customerTaxId || "CF")}</td>
        <td class="products-cell">${escape(formatSaleItemsSummary(sale, 6) || "—")}</td>
        <td>${escape(sale.soldByName || sale.soldByUsername || "")}</td>
        <td>${escape(sale.paymentMethod)}${sale.cardAuthNumber || sale.cardLast4 ? ` (Aut. ${escape(sale.cardAuthNumber || "")} · **** ${escape(sale.cardLast4 || "")})` : ""}</td>
        <td>${escape(formatQty(sale.totalItems))}</td>
        <td>${escape(formatMoney(sale.totalAmount))}</td>
        <td>${escape(sale.felSerie || sale.invoice?.felSerie || "")} ${escape(sale.felNumero || sale.invoice?.felNumero || "")}</td>
      </tr>`
    )
    .join("");

  const detailSection = buildPdfDetailSection(sales, escape);

  const win = window.open("", "_blank");
  if (!win) return false;

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>Reporte de ventas kiosko</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 16px; color: #111; }
          h1 { font-size: 18px; margin: 0 0 4px; }
          .meta { font-size: 12px; color: #555; margin-bottom: 12px; line-height: 1.5; }
          .summary { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
          .summary div { background: #f3f4f6; border-radius: 6px; padding: 8px 12px; font-size: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { border: 1px solid #d1d5db; padding: 5px 6px; text-align: left; }
          th { background: #f3f4f6; font-weight: 700; }
          .products-cell { max-width: 220px; white-space: normal; font-size: 10px; }
          .section-title { font-size: 14px; margin: 20px 0 8px; }
          .sale-detail-block { margin-bottom: 14px; page-break-inside: avoid; }
          .sale-detail-title { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
          .detail-table { font-size: 10px; margin-bottom: 4px; }
          @media print { body { margin: 8mm; } }
        </style>
      </head>
      <body>
        <h1>Reporte de ventas — ${escape(kioskName || "Kiosko")}</h1>
        <div class="meta">
          Período: ${escape(periodLabel)}<br/>
          ${depositFilter === "PENDING" ? "Filtro: solo ventas con boleta de depósito pendiente<br/>" : ""}
          Generado: ${escape(formatNowGt())}
        </div>
        <div class="summary">
          <div>Ventas: <strong>${escape(summary.salesCount)}</strong></div>
          <div>Unidades: <strong>${escape(formatQty(summary.totalItems))}</strong></div>
          <div>Total: <strong>Q ${escape(formatMoney(summary.totalAmount))}</strong></div>
          <div>Ticket prom.: <strong>Q ${escape(formatMoney(summary.averageTicket))}</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>No. Venta</th>
              <th>No. interno</th>
              <th>Cliente</th>
              <th>Productos</th>
              <th>Vendedor</th>
              <th>Pago</th>
              <th>Items</th>
              <th>Total</th>
              <th>Factura</th>
            </tr>
          </thead>
          <tbody>${saleRows || `<tr><td colspan="10">Sin ventas</td></tr>`}</tbody>
        </table>
        ${detailSection}
        <script>window.onload = function () { window.print(); };</script>
      </body>
    </html>
  `);
  win.document.close();
  return true;
};
