import * as XLSX from "xlsx";
import { formatNowGt } from "./dateTimeHelper";

const formatDateTime = (value) => {
  if (!value) return "";
  return String(value).replace("T", " ").slice(0, 19);
};

const formatMoney = (value) => Number(value || 0).toFixed(2);

const formatQty = (value) => Number(value || 0).toFixed(2);

const buildFileSuffix = ({ startDate, endDate, kioskCode }) => {
  const from = startDate || "inicio";
  const to = endDate || "fin";
  const kiosk = kioskCode ? `_${kioskCode}` : "";
  return `${from}_${to}${kiosk}`;
};

export const exportKioskSalesToExcel = ({ sales, myReport, startDate, endDate, kioskName, kioskCode }) => {
  const suffix = buildFileSuffix({ startDate, endDate, kioskCode });

  const summaryRows = [
    { Campo: "Kiosko", Valor: kioskName || "—" },
    { Campo: "Desde", Valor: startDate || "—" },
    { Campo: "Hasta", Valor: endDate || "—" },
    { Campo: "Ventas", Valor: myReport?.salesCount ?? 0 },
    { Campo: "Total unidades", Valor: formatQty(myReport?.totalItems) },
    { Campo: "Total monto (Q)", Valor: formatMoney(myReport?.totalAmount) },
    { Campo: "Ticket promedio (Q)", Valor: formatMoney(myReport?.averageTicket) },
    { Campo: "Generado", Valor: formatNowGt() },
  ];

  const saleRows = (sales || []).map((sale) => ({
    Fecha: formatDateTime(sale.soldAt || sale.saleDate),
    "No. Venta": sale.saleNumber || "",
    "No. interno": sale.internalNumber || sale.invoice?.internalNumber || "",
    Cliente: sale.customerName || sale.customerTaxId || "CF",
    NIT: sale.customerTaxId || "CF",
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

  const detailRows = [];
  (sales || []).forEach((sale) => {
    (sale.items || []).forEach((item) => {
      detailRows.push({
        "No. Venta": sale.saleNumber || "",
        Fecha: formatDateTime(sale.soldAt || sale.saleDate),
        Código: item.productCode || "",
        Producto: item.productName || "",
        Color: item.colorName || "",
        Cantidad: formatQty(item.quantity),
        "Precio unit.": formatMoney(item.unitPrice),
        "Total línea": formatMoney(item.lineTotal),
      });
    });
  });

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

export const exportKioskSalesToPdf = ({ sales, myReport, startDate, endDate, kioskName }) => {
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
        <td>${escape(sale.soldByName || sale.soldByUsername || "")}</td>
        <td>${escape(sale.paymentMethod)}${sale.cardAuthNumber || sale.cardLast4 ? ` (Aut. ${escape(sale.cardAuthNumber || "")} · **** ${escape(sale.cardLast4 || "")})` : ""}</td>
        <td>${escape(formatQty(sale.totalItems))}</td>
        <td>${escape(formatMoney(sale.totalAmount))}</td>
        <td>${escape(sale.felSerie || sale.invoice?.felSerie || "")} ${escape(sale.felNumero || sale.invoice?.felNumero || "")}</td>
      </tr>`
    )
    .join("");

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
          @media print { body { margin: 8mm; } }
        </style>
      </head>
      <body>
        <h1>Reporte de ventas — ${escape(kioskName || "Kiosko")}</h1>
        <div class="meta">
          Período: ${escape(startDate || "—")} a ${escape(endDate || "—")}<br/>
          Generado: ${escape(formatNowGt())}
        </div>
        <div class="summary">
          <div>Ventas: <strong>${escape(myReport?.salesCount ?? 0)}</strong></div>
          <div>Unidades: <strong>${escape(formatQty(myReport?.totalItems))}</strong></div>
          <div>Total: <strong>Q ${escape(formatMoney(myReport?.totalAmount))}</strong></div>
          <div>Ticket prom.: <strong>Q ${escape(formatMoney(myReport?.averageTicket))}</strong></div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>No. Venta</th>
              <th>No. interno</th>
              <th>Cliente</th>
              <th>Vendedor</th>
              <th>Pago</th>
              <th>Items</th>
              <th>Total</th>
              <th>Factura</th>
            </tr>
          </thead>
          <tbody>${saleRows || `<tr><td colspan="9">Sin ventas</td></tr>`}</tbody>
        </table>
        <script>window.onload = function () { window.print(); };</script>
      </body>
    </html>
  `);
  win.document.close();
  return true;
};
