/** Leyenda de colores del conteo (referencia visual al lado del encabezado). */
export const CONTEO_COLOR_LEGEND_LEFT = [
  { label: "Inv. Inicial", color: "1F4E79", textColor: "FFFFFF" },
  { label: "Cambios", color: "C00000", textColor: "FFFFFF" },
  { label: "Traslados", color: "548235", textColor: "FFFFFF" },
  { label: "Devo.", color: "7030A0", textColor: "FFFFFF" },
  { label: "Anulacion de Venta", color: "00B0F0", textColor: "000000" },
];

export const CONTEO_COLOR_LEGEND_RIGHT = [
  { label: "Correccion de Liq. Anterior", color: "1F4E79", textColor: "FFFFFF" },
  { label: "Mandar a Corregir", color: "FFC000", textColor: "000000" },
  { label: "Envio", color: "5B9BD5", textColor: "000000" },
  { label: "Inv. Final", color: "F4A6C9", textColor: "000000" },
  { label: "Total", color: "92D050", textColor: "000000" },
];

/** Colores de cabecera de columnas Kardex / totales alineados a la leyenda. */
export const CONTEO_COLUMN_HEADER_COLORS = {
  inventarioInicial: "1F4E79",
  comprasAjustes: "C00000",
  anulacionCompras: "FFC000",
  entradas: "5B9BD5",
  ventas: "C00000",
  anulacionVenta: "00B0F0",
  salida: "548235",
  inventarioFinal: "F4A6C9",
  total: "92D050",
};

export const hexCss = (rgb) => `#${String(rgb || "").replace(/^#/, "")}`;

export const headerTextColorForBg = (rgb) => {
  const key = String(rgb || "").toUpperCase();
  if (key === "FFC000" || key === "00B0F0" || key === "5B9BD5" || key === "F4A6C9" || key === "92D050") {
    return "#000000";
  }
  return "#FFFFFF";
};
