/**
 * Glosario de Finanzas por kiosco. Una sola fuente para la pantalla (pestaña P&L) y los reportes descargados
 * (Excel), para que los rótulos y sus fórmulas no se desalineen. Fórmulas: docs/KIOSK-FINANCIALS-CONTRACT.md.
 */

/** Nombres de las filas de resultado (los mismos en pantalla y Excel). */
export const RESULT_LABELS = {
  totalCost: "Total costo operativo",
  profit: "Utilidad o pérdida",
  profitFormula: "Ventas − Total costo operativo",
  margin: "Margen de utilidad",
  marginFormula: "Utilidad ÷ Ventas",
  breakEven: "Punto de equilibrio",
  breakEvenDaily: "Punto de equilibrio diario",
};

/** Cómo se mide el punto de equilibrio (selector de los reportes). */
export const BREAK_EVEN_MODES = {
  RATES: { label: "Tasas de cada kiosco", short: "tasas de cada kiosco" },
  FLAT: { label: "27 % fijo", short: "27 % fijo" },
};

export const breakEvenModeLabel = (mode) => (BREAK_EVEN_MODES[mode] || BREAK_EVEN_MODES.RATES).short;

export const FINANCE_GLOSSARY = [
  { term: "Ventas", definition: "Total vendido en el mes por el kiosco, con IVA incluido." },
  {
    term: "Costos variables",
    definition: "Cambian con las ventas: costo del producto, comisión de venta, comisión de tarjeta e IVA.",
  },
  { term: "Costo del producto", definition: "Ventas × % de costo del producto." },
  {
    term: "Comisión de venta",
    definition:
      "Desde 2026: Ventas × % de comisión de venta, y solo si el kiosco llega al 70 % de su meta (si no llega, es 0). Hasta 2025: (Ventas ÷ 1.12) × % de comisión de venta, sin condición.",
  },
  { term: "Comisión de tarjeta", definition: "Ventas × % de comisión de tarjeta." },
  { term: "IVA", definition: "Ventas × % de IVA (carga de IVA sobre las ventas)." },
  {
    term: "Costos fijos",
    definition: "No dependen de las ventas: alquiler, luz, teléfono, mantenimiento, salarios, bonos, supervisión, etc.",
  },
  {
    term: "Supervisión",
    definition: "((Salarios MO indirecta + Bonificación) × 2 × 14 ÷ 12) ÷ número de kioscos activos.",
  },
  { term: RESULT_LABELS.totalCost, definition: "Total costos variables + Total costos fijos." },
  {
    term: RESULT_LABELS.profit,
    definition:
      `${RESULT_LABELS.profitFormula}. Positivo = ganancia; negativo (▼ en rojo) = pérdida. ` +
      "No compara contra otro mes ni contra el año anterior.",
  },
  { term: RESULT_LABELS.margin, definition: `${RESULT_LABELS.marginFormula}. Qué parte de cada quetzal vendido queda como utilidad.` },
  {
    term: RESULT_LABELS.breakEven,
    definition:
      "Ventas mínimas del mes para no perder: costos fijos ÷ (1 − % variables). Se mide de una de dos formas, según la configuración (Costos por kiosco): " +
      "con las tasas reales de cada kiosco (comisión de venta + costo del producto + tarjeta + IVA), que es el punto donde " +
      "la utilidad es cero; o con un 27 % fijo para todos, como los reportes de Excel recientes (costos fijos ÷ (1 − 0.27)), " +
      "que es más exigente para los kioscos sin comisión de venta.",
  },
  {
    term: RESULT_LABELS.breakEvenDaily,
    definition: `${RESULT_LABELS.breakEven} ÷ días reales del mes (el Excel anterior usaba 30/31).`,
  },
  { term: "% participación", definition: "Ventas del kiosco ÷ ventas de todos los kioscos." },
  { term: "Meta", definition: "Meta de ventas del mes (Metas de Kioskos; en sitios históricos, la de Finanzas)." },
  { term: "% de meta", definition: "Ventas ÷ Meta." },
];
