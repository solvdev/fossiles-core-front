import * as XLSX from "xlsx-js-style";
import { formatNowGt } from "./dateTimeHelper";

/** Cuero que piden las OP activas: filtros, totales por color y exportación (Excel / impresión). */

export const ORDER_TYPE_LABELS = {
  NORMAL: "Normal",
  CLIENTE_KIOSKO: "Kiosko",
  VENTA_EN_LINEA: "Venta en línea",
  INTERNA: "Interna",
  MARCAS: "Marcas",
  CINCHOS_FOSSILES: "Cinchos",
};

export const ORDER_STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En proceso",
  IN_QA: "En QA",
};

const SWATCHES = [
  ["NEGRO", "#1f2937"],
  ["WHISKY", "#a0522d"],
  ["TOSTADO", "#7b4a26"],
  ["CHOCOLATE", "#4e2a1e"],
  ["GENA", "#8e3b2e"],
  ["DUNA", "#c2b280"],
  ["CAFE OSCURO", "#3f2a1d"],
  ["CAFE", "#6b4226"],
  ["COÑAC", "#9a5b2c"],
  ["CONAC", "#9a5b2c"],
  ["MIEL", "#c98a3a"],
  ["TAN", "#c69c6d"],
  ["CAMEL", "#c19a6b"],
  ["BEIGE", "#d9c3a0"],
  ["HUESO", "#ece3d0"],
  ["BLANCO", "#f3f4f6"],
  ["GRIS", "#9ca3af"],
  ["VINO", "#6d1a2a"],
  ["ROJO", "#c0392b"],
  ["ROSA GOLD", "#d8a39d"],
  ["ROSADO", "#e8a0b4"],
  ["ROSA", "#e8a0b4"],
  ["FUCSIA", "#c2185b"],
  ["MORADO", "#6b3fa0"],
  ["LILA", "#b39ddb"],
  ["AZUL", "#1e4d8c"],
  ["CELESTE", "#7cb9e8"],
  ["TURQUESA", "#1aa5a5"],
  ["VERDE", "#2e7d32"],
  ["AMARILLO", "#f2c94c"],
  ["MOSTAZA", "#c9a227"],
  ["NARANJA", "#e67e22"],
  ["DORADO", "#c9a227"],
  ["PLATEADO", "#bfc5cc"],
];

/** Color aproximado para el punto de cada color (solo ayuda visual). */
export const swatchFor = (colorName) => {
  const n = String(colorName || "").toUpperCase();
  const hit = SWATCHES.find(([key]) => n.includes(key));
  return hit ? hit[1] : "#cbd5e1";
};

export const fmtFt2 = (v) =>
  Number(v || 0).toLocaleString("es-GT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmtInt = (v) => Number(v || 0).toLocaleString("es-GT");
const round2 = (v) => Math.round(Number(v || 0) * 100) / 100;

export const colorKeyOf = (name) => String(name || "SIN COLOR").trim().toUpperCase();

/**
 * Aplica filtros y recalcula totales.
 * - orderType / search filtran órdenes (la búsqueda también mira productos de las líneas).
 * - colorKey deja solo las líneas de ese color (las tarjetas de color siguen mostrando todos).
 * - onlyPending esconde líneas y órdenes que ya tienen todo su cuero entregado.
 */
export function buildLeatherView(data, { orderType = "ALL", search = "", colorKey = "", onlyPending = true } = {}) {
  const stockByMaterial = new Map((data?.byMaterial || []).map((m) => [m.materialId, Number(m.availableFt2 || 0)]));
  const term = search.trim().toLowerCase();

  const baseOrders = (data?.orders || []).filter((o) => {
    if (orderType !== "ALL" && o.orderType !== orderType) return false;
    if (!term) return true;
    const head = `${o.code || ""} ${o.customerName || ""}`.toLowerCase();
    if (head.includes(term)) return true;
    return (o.lines || []).some((l) => `${l.productCode || ""} ${l.productName || ""}`.toLowerCase().includes(term));
  });

  const lineVisible = (l) => !onlyPending || Number(l.pendingUnits || 0) > 0;

  // Colores y cueros: todas las líneas de las órdenes filtradas (lo pedido y lo entregado),
  // sin el filtro de color para poder elegir otro.
  const colorMap = new Map();
  const materialMap = new Map();
  baseOrders.forEach((o) => {
    (o.lines || []).forEach((l) => {
      const key = colorKeyOf(l.colorName);
      if (!colorMap.has(key)) {
        colorMap.set(key, {
          key, colorName: l.colorName || "SIN COLOR", orders: new Set(), units: 0, pendingUnits: 0,
          totalFt2: 0, pendingFt2: 0, missingRecipeUnits: 0, materials: new Map(),
        });
      }
      const c = colorMap.get(key);
      c.orders.add(o.orderId);
      c.units += Number(l.units || 0);
      c.pendingUnits += Number(l.pendingUnits || 0);
      c.totalFt2 += Number(l.totalFt2 || 0);
      c.pendingFt2 += Number(l.pendingFt2 || 0);
      if (l.missingRecipe) c.missingRecipeUnits += Number(l.pendingUnits || 0);
      if (l.materialId) {
        c.materials.set(l.materialId, l.materialName);
        if (!materialMap.has(l.materialId)) {
          materialMap.set(l.materialId, {
            materialId: l.materialId, name: l.materialName, orders: new Set(), totalFt2: 0, pendingFt2: 0,
            availableFt2: stockByMaterial.get(l.materialId) || 0,
          });
        }
        const m = materialMap.get(l.materialId);
        m.orders.add(o.orderId);
        m.totalFt2 += Number(l.totalFt2 || 0);
        m.pendingFt2 += Number(l.pendingFt2 || 0);
      }
    });
  });

  const skuById = new Map((data?.byMaterial || []).map((m) => [m.materialId, m.sku]));
  const materials = [...materialMap.values()]
    .map((m) => ({
      ...m,
      sku: skuById.get(m.materialId) || "",
      orders: m.orders.size,
      totalFt2: round2(m.totalFt2),
      pendingFt2: round2(m.pendingFt2),
      shortageFt2: round2(Math.max(m.pendingFt2 - m.availableFt2, 0)),
    }))
    .filter((m) => !onlyPending || m.pendingFt2 > 0)
    .sort((a, b) => b.pendingFt2 - a.pendingFt2);

  const colors = [...colorMap.values()]
    .map((c) => {
      const availableFt2 = [...c.materials.keys()].reduce((s, id) => s + (stockByMaterial.get(id) || 0), 0);
      return {
        key: c.key,
        colorName: c.colorName,
        orders: c.orders.size,
        units: c.units,
        pendingUnits: c.pendingUnits,
        totalFt2: round2(c.totalFt2),
        pendingFt2: round2(c.pendingFt2),
        deliveredFt2: round2(c.totalFt2 - c.pendingFt2),
        availableFt2: round2(availableFt2),
        shortageFt2: round2(Math.max(c.pendingFt2 - availableFt2, 0)),
        missingRecipeUnits: c.missingRecipeUnits,
        materials: [...new Set([...c.materials.values()].filter(Boolean))],
      };
    })
    .filter((c) => !onlyPending || c.pendingFt2 > 0 || c.missingRecipeUnits > 0)
    .sort((a, b) => b.pendingFt2 - a.pendingFt2 || b.totalFt2 - a.totalFt2);

  const orders = baseOrders
    .map((o) => {
      const lines = (o.lines || []).filter(lineVisible).filter((l) => !colorKey || colorKeyOf(l.colorName) === colorKey);
      const byColor = new Map();
      lines.forEach((l) => {
        const key = colorKeyOf(l.colorName);
        const prev = byColor.get(key) || { key, colorName: l.colorName, pendingFt2: 0, totalFt2: 0, missing: false };
        prev.pendingFt2 += Number(l.pendingFt2 || 0);
        prev.totalFt2 += Number(l.totalFt2 || 0);
        prev.missing = prev.missing || Boolean(l.missingRecipe);
        byColor.set(key, prev);
      });
      const sum = (f) => lines.reduce((s, l) => s + Number(l[f] || 0), 0);
      return {
        ...o,
        lines,
        colorChips: [...byColor.values()]
          .map((c) => ({ ...c, pendingFt2: round2(c.pendingFt2), totalFt2: round2(c.totalFt2) }))
          .sort((a, b) => b.pendingFt2 - a.pendingFt2),
        units: sum("units"),
        pendingUnits: sum("pendingUnits"),
        totalFt2: round2(sum("totalFt2")),
        pendingFt2: round2(sum("pendingFt2")),
        missingRecipeLines: lines.filter((l) => l.missingRecipe).length,
      };
    })
    .filter((o) => o.lines.length > 0);

  // Totales: todo lo pedido (también lo ya entregado) de las órdenes y el color elegidos.
  const scopedLines = baseOrders.flatMap((o) =>
    (o.lines || []).filter((l) => !colorKey || colorKeyOf(l.colorName) === colorKey));
  const sumLines = (f) => scopedLines.reduce((s, l) => s + Number(l[f] || 0), 0);
  // Sin color elegido, el faltante se suma por cuero (dos colores pueden usar el mismo cuero).
  const selected = colorKey ? colors.find((c) => c.key === colorKey) : null;
  const totals = {
    orders: baseOrders.filter((o) => (o.lines || []).some((l) => !colorKey || colorKeyOf(l.colorName) === colorKey)).length,
    ordersWithPending: orders.length,
    units: sumLines("units"),
    pendingUnits: sumLines("pendingUnits"),
    totalFt2: round2(sumLines("totalFt2")),
    pendingFt2: round2(sumLines("pendingFt2")),
    shortageFt2: round2(colorKey ? selected?.shortageFt2 || 0 : materials.reduce((s, m) => s + m.shortageFt2, 0)),
    missingRecipeUnits: scopedLines.filter((l) => l.missingRecipe).reduce((a, l) => a + Number(l.pendingUnits || 0), 0),
  };
  totals.deliveredFt2 = round2(totals.totalFt2 - totals.pendingFt2);

  const missingRecipes = [];
  const seen = new Set();
  orders.forEach((o) => o.lines.filter((l) => l.missingRecipe).forEach((l) => {
    const k = `${l.productCode}|${colorKeyOf(l.colorName)}`;
    if (seen.has(k)) {
      missingRecipes.find((r) => r.key === k).units += Number(l.pendingUnits || 0);
      return;
    }
    seen.add(k);
    missingRecipes.push({ key: k, productCode: l.productCode, productName: l.productName, colorName: l.colorName, units: Number(l.pendingUnits || 0) });
  }));

  return { colors, materials, orders, totals, missingRecipes };
}

export const orderTypesIn = (data) =>
  [...new Set((data?.orders || []).map((o) => o.orderType).filter(Boolean))].sort();

// ==================== Excel ====================

const border = { style: "thin", color: { rgb: "D1D5DB" } };
const cellBorder = { top: border, right: border, bottom: border, left: border };
const headStyle = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "1F2937" } },
  alignment: { vertical: "center", wrapText: true },
  border: cellBorder,
};
const titleStyle = { font: { bold: true, sz: 14 } };
const metaStyle = { font: { color: { rgb: "6B7280" }, sz: 10 } };
const numStyle = { numFmt: "#,##0.0", border: cellBorder };
const intStyle = { numFmt: "#,##0", border: cellBorder };
const textStyle = { border: cellBorder };
const alertNumStyle = { ...numStyle, font: { bold: true, color: { rgb: "B91C1C" } }, fill: { fgColor: { rgb: "FEF2F2" } } };
const boldNumStyle = { ...numStyle, font: { bold: true } };
const totalStyle = { font: { bold: true }, fill: { fgColor: { rgb: "F3F4F6" } }, border: cellBorder };
const totalNumStyle = { ...totalStyle, numFmt: "#,##0.0" };
const totalIntStyle = { ...totalStyle, numFmt: "#,##0" };

/**
 * columns: [{ label, width, value(row), type: "text"|"int"|"ft2", style?(row) }]
 */
function buildSheet(title, subtitle, columns, rows, totalRow) {
  const aoa = [
    [{ v: title, s: titleStyle }],
    [{ v: subtitle, s: metaStyle }],
    [],
    columns.map((c) => ({ v: c.label, s: headStyle })),
  ];
  rows.forEach((r) => {
    aoa.push(columns.map((c) => {
      const v = c.value(r);
      const custom = c.style ? c.style(r) : null;
      if (c.type === "ft2") return { v: round2(v), t: "n", s: custom || numStyle };
      if (c.type === "int") return { v: Number(v || 0), t: "n", s: custom || intStyle };
      return { v: v ?? "", t: "s", s: custom || textStyle };
    }));
  });
  if (totalRow) {
    aoa.push(columns.map((c, i) => {
      const v = totalRow[i];
      if (v == null || v === "") return { v: "", s: totalStyle };
      if (c.type === "ft2") return { v: round2(v), t: "n", s: totalNumStyle };
      if (c.type === "int") return { v: Number(v), t: "n", s: totalIntStyle };
      return { v, t: "s", s: totalStyle };
    }));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c) => ({ wch: c.width || 14 }));
  ws["!rows"] = [{ hpt: 22 }, {}, {}, { hpt: 30 }];
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 3, c: 0 }, e: { r: 3 + rows.length, c: columns.length - 1 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 4 };
  return ws;
}

const fmtDate = (v) => (v ? String(v).slice(0, 10) : "");

export function exportLeatherDemandExcel(view, filtersLabel) {
  const meta = `Generado ${formatNowGt()} · OP activas (pendiente, en proceso, en QA)${filtersLabel ? ` · ${filtersLabel}` : ""}`;
  const wb = XLSX.utils.book_new();

  const colorCols = [
    { label: "Color", width: 18, value: (c) => c.colorName },
    { label: "Cuero(s) que usa", width: 34, value: (c) => c.materials.join(", ") || "Sin receta" },
    { label: "OP", width: 7, type: "int", value: (c) => c.orders },
    { label: "Piezas que faltan", width: 11, type: "int", value: (c) => c.pendingUnits },
    { label: "Falta entregar (pies²)", width: 13, type: "ft2", value: (c) => c.pendingFt2, style: () => boldNumStyle },
    { label: "Ya entregado (pies²)", width: 13, type: "ft2", value: (c) => c.deliveredFt2 },
    { label: "Total pedido (pies²)", width: 13, type: "ft2", value: (c) => c.totalFt2 },
    { label: "En bodega (pies²)", width: 12, type: "ft2", value: (c) => c.availableFt2 },
    { label: "Faltaría comprar (pies²)", width: 13, type: "ft2", value: (c) => c.shortageFt2, style: (c) => (c.shortageFt2 > 0 ? alertNumStyle : numStyle) },
    { label: "Piezas sin receta", width: 10, type: "int", value: (c) => c.missingRecipeUnits },
  ];
  const t = view.totals;
  XLSX.utils.book_append_sheet(wb, buildSheet("Cuero por color", meta, colorCols, view.colors, [
    "TOTAL", "", t.orders, t.pendingUnits, t.pendingFt2, t.deliveredFt2, t.totalFt2, "",
    view.colors.reduce((s, c) => s + c.shortageFt2, 0), t.missingRecipeUnits,
  ]), "Por color");

  // Orden × color: cuánto falta de cada color en cada OP.
  const colorKeys = view.colors.map((c) => c.key);
  const pivotCols = [
    { label: "OP", width: 14, value: (o) => o.code },
    { label: "Cliente", width: 24, value: (o) => o.customerName || "" },
    { label: "Tipo", width: 13, value: (o) => ORDER_TYPE_LABELS[o.orderType] || o.orderType || "" },
    { label: "Entrega", width: 11, value: (o) => fmtDate(o.deliveryDate) },
    ...view.colors.map((c) => ({
      label: c.colorName, width: 11, type: "ft2",
      value: (o) => o.colorChips.find((x) => x.key === c.key)?.pendingFt2 || 0,
    })),
    { label: "Total falta (pies²)", width: 13, type: "ft2", value: (o) => o.pendingFt2, style: () => boldNumStyle },
  ];
  XLSX.utils.book_append_sheet(wb, buildSheet("Cuero que falta por orden y color (pies²)", meta, pivotCols, view.orders, [
    "TOTAL", "", "", "",
    ...colorKeys.map((k) => view.colors.find((c) => c.key === k).pendingFt2),
    t.pendingFt2,
  ]), "Orden x color");

  const detail = view.orders.flatMap((o) => o.lines.map((l) => ({ o, l })));
  const detailCols = [
    { label: "OP", width: 14, value: (r) => r.o.code },
    { label: "Cliente", width: 22, value: (r) => r.o.customerName || "" },
    { label: "Tipo", width: 13, value: (r) => ORDER_TYPE_LABELS[r.o.orderType] || r.o.orderType || "" },
    { label: "Estado", width: 11, value: (r) => ORDER_STATUS_LABELS[r.o.status] || r.o.status || "" },
    { label: "Entrega", width: 11, value: (r) => fmtDate(r.o.deliveryDate) },
    { label: "Código", width: 11, value: (r) => r.l.productCode || "" },
    { label: "Producto", width: 28, value: (r) => r.l.productName || "" },
    { label: "Color", width: 14, value: (r) => r.l.colorName || "" },
    { label: "Cuero", width: 26, value: (r) => r.l.materialName || (r.l.missingRecipe ? "SIN RECETA" : "") },
    { label: "Piezas", width: 8, type: "int", value: (r) => r.l.units },
    { label: "Entregadas", width: 10, type: "int", value: (r) => r.l.deliveredUnits },
    { label: "Faltan", width: 8, type: "int", value: (r) => r.l.pendingUnits },
    { label: "pies² por pieza", width: 10, type: "ft2", value: (r) => r.l.ft2PerUnit || 0 },
    { label: "pies² total", width: 10, type: "ft2", value: (r) => r.l.totalFt2 },
    { label: "pies² falta", width: 10, type: "ft2", value: (r) => r.l.pendingFt2, style: () => boldNumStyle },
  ];
  XLSX.utils.book_append_sheet(wb, buildSheet("Detalle por orden", meta, detailCols, detail, [
    "TOTAL", "", "", "", "", "", "", "", "",
    t.units, t.units - t.pendingUnits, t.pendingUnits, "", t.totalFt2, t.pendingFt2,
  ]), "Detalle");

  const matCols = [
    { label: "SKU", width: 12, value: (m) => m.sku || "" },
    { label: "Cuero", width: 32, value: (m) => m.name || "" },
    { label: "OP", width: 7, type: "int", value: (m) => m.orders },
    { label: "Falta entregar (pies²)", width: 13, type: "ft2", value: (m) => m.pendingFt2, style: () => boldNumStyle },
    { label: "Total pedido (pies²)", width: 13, type: "ft2", value: (m) => m.totalFt2 },
    { label: "En bodega (pies²)", width: 12, type: "ft2", value: (m) => m.availableFt2 },
    { label: "Faltaría comprar (pies²)", width: 13, type: "ft2", value: (m) => m.shortageFt2, style: (m) => (m.shortageFt2 > 0 ? alertNumStyle : numStyle) },
  ];
  XLSX.utils.book_append_sheet(wb, buildSheet("Cuero por material (para compras)", meta, matCols, view.materials, null), "Por cuero");

  if (view.missingRecipes.length > 0) {
    const missCols = [
      { label: "Código", width: 12, value: (r) => r.productCode || "" },
      { label: "Producto", width: 32, value: (r) => r.productName || "" },
      { label: "Color", width: 18, value: (r) => r.colorName || "" },
      { label: "Piezas que faltan", width: 12, type: "int", value: (r) => r.units },
    ];
    XLSX.utils.book_append_sheet(wb, buildSheet("Productos sin receta de cuero (no suman pies²)", meta, missCols, view.missingRecipes, null), "Sin receta");
  }

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `cuero_por_color_${stamp}.xlsx`);
}

// ==================== Impresión / PDF ====================

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function printLeatherDemand(view, filtersLabel) {
  const t = view.totals;
  const colorRows = view.colors.map((c) => `
    <tr>
      <td><span class="dot" style="background:${swatchFor(c.colorName)}"></span>${esc(c.colorName)}</td>
      <td class="n b">${fmtFt2(c.pendingFt2)}</td>
      <td class="n">${fmtFt2(c.deliveredFt2)}</td>
      <td class="n">${fmtFt2(c.totalFt2)}</td>
      <td class="n">${fmtFt2(c.availableFt2)}</td>
      <td class="n ${c.shortageFt2 > 0 ? "bad" : ""}">${c.shortageFt2 > 0 ? fmtFt2(c.shortageFt2) : "—"}</td>
      <td class="n">${fmtInt(c.orders)}</td>
      <td class="n">${fmtInt(c.pendingUnits)}</td>
    </tr>`).join("");
  const orderBlocks = view.orders.map((o) => `
    <div class="op">
      <div class="op-h">
        <strong>${esc(o.code)}</strong> · ${esc(o.customerName || "Sin cliente")} · ${esc(ORDER_TYPE_LABELS[o.orderType] || o.orderType || "")}
        · Entrega ${esc(fmtDate(o.deliveryDate) || "—")}
        <span class="right">Falta <b>${fmtFt2(o.pendingFt2)}</b> de ${fmtFt2(o.totalFt2)} pies²</span>
      </div>
      <table>
        <thead><tr><th>Producto</th><th>Color</th><th>Cuero</th><th class="n">Piezas</th><th class="n">Faltan</th><th class="n">pies²/pza</th><th class="n">pies² falta</th></tr></thead>
        <tbody>${o.lines.map((l) => `
          <tr>
            <td>${esc(l.productCode)} ${esc(l.productName)}</td>
            <td><span class="dot" style="background:${swatchFor(l.colorName)}"></span>${esc(l.colorName)}</td>
            <td>${l.missingRecipe ? '<span class="bad">Sin receta</span>' : esc(l.materialName)}</td>
            <td class="n">${fmtInt(l.units)}</td>
            <td class="n">${fmtInt(l.pendingUnits)}</td>
            <td class="n">${l.ft2PerUnit != null ? fmtFt2(l.ft2PerUnit) : "—"}</td>
            <td class="n b">${fmtFt2(l.pendingFt2)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>`).join("");

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cuero por color</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 18px; color: #111; font-size: 12px; }
    h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 15px; margin: 18px 0 6px; }
    .meta { color: #555; margin-bottom: 12px; }
    .kpis { display: flex; gap: 10px; margin-bottom: 8px; }
    .kpi { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 12px; min-width: 120px; }
    .kpi b { font-size: 18px; display: block; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    th, td { border: 1px solid #d1d5db; padding: 4px 6px; text-align: left; }
    th { background: #f3f4f6; }
    .n { text-align: right; white-space: nowrap; } .b { font-weight: bold; }
    .bad { color: #b91c1c; font-weight: bold; }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; border: 1px solid #9ca3af; vertical-align: middle; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .op { break-inside: avoid; margin-bottom: 10px; }
    .op-h { background: #f9fafb; border: 1px solid #d1d5db; border-bottom: 0; padding: 5px 6px; }
    .right { float: right; }
    @media print { body { margin: 8mm; } }
  </style></head><body>
  <h1>Cuero por color — órdenes activas</h1>
  <div class="meta">Generado ${esc(formatNowGt())}${filtersLabel ? ` · ${esc(filtersLabel)}` : ""}</div>
  <div class="kpis">
    <div class="kpi">Falta entregar<b>${fmtFt2(t.pendingFt2)} pies²</b></div>
    <div class="kpi">Ya entregado<b>${fmtFt2(t.deliveredFt2)} pies²</b></div>
    <div class="kpi">Total pedido<b>${fmtFt2(t.totalFt2)} pies²</b></div>
    <div class="kpi">Faltaría comprar<b>${fmtFt2(t.shortageFt2)} pies²</b></div>
    <div class="kpi">Órdenes<b>${fmtInt(t.orders)}</b></div>
  </div>
  <h2>Resumen por color</h2>
  <table><thead><tr><th>Color</th><th class="n">Falta entregar</th><th class="n">Ya entregado</th><th class="n">Total pedido</th><th class="n">En bodega</th><th class="n">Faltaría comprar</th><th class="n">OP</th><th class="n">Piezas que faltan</th></tr></thead>
  <tbody>${colorRows}</tbody></table>
  <h2>Por orden</h2>
  ${orderBlocks}
  <script>window.onload = () => setTimeout(() => window.print(), 250);</script>
  </body></html>`);
  win.document.close();
}
