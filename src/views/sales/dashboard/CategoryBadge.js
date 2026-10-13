import React from "react";
import { categoryLabel, normalizeCategory } from "./salesDashboardHelpers";

/**
 * Clasificación de ventas del kiosco ('Cat. A', 'Cat. B', 'Cat. C' o 'Sin clasificar'). Siempre lleva texto: el color
 * (de oscuro a claro, A → C; la insignia 'Sin clasificar' es neutra y punteada) solo refuerza.
 * La fija a mano Finanzas kioscos (Costos por kiosco > Sitios); sin dato = sin clasificar.
 */
export default function CategoryBadge({ category }) {
  const code = normalizeCategory(category);
  return (
    <span
      className={`sdash-cat sdash-cat--${code ? code.toLowerCase() : "none"}`}
      title={
        code
          ? `Clasificación de ventas: categoría ${code}`
          : "Sin clasificación de ventas (se asigna en Costos por kiosco)"
      }
    >
      {categoryLabel(code)}
    </span>
  );
}
