import * as XLSX from "xlsx-js-style";
import { escapeHtml } from "./productionOrderPrintHtml";
import { formatDateGt } from "./dateTimeHelper";

function lineLabel(line) {
  const parts = [
    line?.productCode,
    line?.productName,
    line?.colorName,
    line?.size ? `talla ${line.size}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function dispatchKindLabel(kind) {
  switch (String(kind || "").toUpperCase()) {
    case "OPL": return "Genera OPL";
    case "STOCK": return "Sin OPL (stock)";
    case "MIXTA": return "Mixta (OPL + stock)";
    case "ANULADA": return "Anulada / devolución";
    case "PENDIENTE": return "Pendiente de clasificar";
    default: return kind || "—";
  }
}

function consolidateLines(sales) {
  const map = new Map();
  (sales || []).forEach((sale) => {
    (sale.lines || []).forEach((line) => {
      const key = [
        String(line.productCode || "").toUpperCase(),
        String(line.productName || "").toLowerCase(),
        String(line.colorName || "").toLowerCase(),
        String(line.size || "").toLowerCase(),
      ].join("|");
      const prev = map.get(key);
      const qty = Number(line.quantity || 0);
      if (!prev) {
        map.set(key, { ...line, quantity: qty });
        return;
      }
      prev.quantity += qty;
    });
  });
  return Array.from(map.values()).sort((a, b) =>
    lineLabel(a).localeCompare(lineLabel(b), "es", { sensitivity: "base" })
  );
}

export function downloadOplDispatchSummaryExcel(summary) {
  const saleDate = formatDateGt(summary?.saleDate);
  const dispatchDate = formatDateGt(summary?.dispatchDate);
  const sales = summary?.sales || [];

  const detailHeaders = [
    "Fecha pedido",
    "Fecha despacho",
    "Venta",
    "Cliente",
    "Teléfono",
    "Tipo salida",
    "OPL",
    "Producto",
    "Nombre",
    "Color",
    "Talla",
    "Cantidad",
    "Ruta línea",
    "Estado",
    "Pago",
    "Transporte",
    "Dirección",
  ];
  const detailRows = [detailHeaders];
  sales.forEach((sale) => {
    const lines = sale.lines && sale.lines.length ? sale.lines : [{ quantity: 0 }];
    lines.forEach((line) => {
      detailRows.push([
        saleDate,
        dispatchDate,
        sale.saleNumber || sale.onlineSaleId || "",
        sale.customerName || "",
        sale.phone || "",
        dispatchKindLabel(sale.dispatchKind),
        sale.productionOrderCode || "",
        line.productCode || "",
        line.productName || "",
        line.colorName || "",
        line.size || "",
        Number(line.quantity || 0),
        line.fulfillmentRoute || "",
        sale.status || "",
        sale.paymentMethod || "",
        sale.shippingCarrier || "",
        sale.address || "",
      ]);
    });
  });

  const cons = consolidateLines(sales);
  const consRows = [["Producto", "Nombre", "Color", "Talla", "Cantidad"]];
  cons.forEach((line) => {
    consRows.push([
      line.productCode || "",
      line.productName || "",
      line.colorName || "",
      line.size || "",
      Number(line.quantity || 0),
    ]);
  });
  consRows.push([]);
  consRows.push(["Ventas (todas)", summary?.saleCount || 0]);
  consRows.push(["Con OPL", summary?.oplSaleCount || 0]);
  consRows.push(["Sin OPL (stock)", summary?.stockSaleCount || 0]);
  consRows.push(["Anuladas / devoluciones", summary?.excludedCount || 0]);
  consRows.push(["Líneas", summary?.lineCount || 0]);
  consRows.push(["Unidades", summary?.unitCount || 0]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), "Ventas");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(consRows), "Resumen");
  const stamp = String(summary?.dispatchDate || "hoy").replace(/-/g, "");
  XLSX.writeFile(wb, `ventas_despacho_${stamp}.xlsx`);
}

export function openOplDispatchSummaryPrintWindow(summary) {
  const saleDate = formatDateGt(summary?.saleDate);
  const dispatchDate = formatDateGt(summary?.dispatchDate);
  const sales = summary?.sales || [];
  const cons = consolidateLines(sales);
  const body = sales.length === 0
    ? `<p>No hay ventas en línea pedidas el ${escapeHtml(saleDate)} para despachar el ${escapeHtml(dispatchDate)}.</p>`
    : `
      <table>
        <thead>
          <tr>
            <th>Venta</th>
            <th>Cliente</th>
            <th>Tipo salida</th>
            <th>OPL</th>
            <th>Productos</th>
            <th>Cant.</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          ${sales.map((sale) => {
            const lines = sale.lines || [];
            const qty = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
            const products = lines.map((l) => escapeHtml(lineLabel(l))).join("<br/>") || "—";
            return `<tr>
              <td>${escapeHtml(sale.saleNumber || sale.onlineSaleId || "")}</td>
              <td>${escapeHtml(sale.customerName || "")}<br/><small>${escapeHtml(sale.phone || "")}</small></td>
              <td>${escapeHtml(dispatchKindLabel(sale.dispatchKind))}</td>
              <td>${escapeHtml(sale.productionOrderCode || "—")}</td>
              <td>${products}</td>
              <td class="qty">${qty}</td>
              <td>${escapeHtml(sale.status || "")}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <h3>Consolidado</h3>
      <table>
        <thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th>Cant.</th></tr></thead>
        <tbody>
          ${cons.map((l) => `<tr>
            <td>${escapeHtml([l.productCode, l.productName].filter(Boolean).join(" · "))}</td>
            <td>${escapeHtml(l.colorName || "")}</td>
            <td>${escapeHtml(l.size || "")}</td>
            <td class="qty">${Number(l.quantity || 0)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    `;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>OPL despacho ${escapeHtml(dispatchDate)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 16px; font-size: 11px; color: #111; }
          h2 { margin: 0 0 4px; font-size: 16px; }
          p { margin: 0 0 10px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
          th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
          th { background: #f3f3f3; text-align: left; }
          td.qty { text-align: center; font-weight: bold; }
          small { color: #555; }
        </style>
      </head>
      <body>
        <h2>Ventas del día anterior a despachar</h2>
        <p>Pedidas el <strong>${escapeHtml(saleDate)}</strong> — deben salir el <strong>${escapeHtml(dispatchDate)}</strong>.
        ${summary?.saleCount || 0} ventas (todas) · ${summary?.oplSaleCount || 0} con OPL · ${summary?.stockSaleCount || 0} sin OPL · ${summary?.unitCount || 0} unidades.</p>
        ${body}
      </body>
    </html>
  `);
  win.document.close();
  win.focus();
  win.print();
}
