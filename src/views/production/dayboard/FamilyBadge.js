import React from "react";

/** Colores por familia de OP (texto siempre legible sobre el fondo). */
export const FAMILY_STYLES = {
  OPL: { bg: "#1b5e20", fg: "#fff" },
  OPV: { bg: "#0d47a1", fg: "#fff" },
  OPK: { bg: "#37474f", fg: "#fff" },
  OPI: { bg: "#6a1b9a", fg: "#fff" },
  OPCK: { bg: "#00695c", fg: "#fff" },
  OPD: { bg: "#e65100", fg: "#fff" },
};

/** Etiqueta de familia (OPL, OPV, OPK…) con el color con que se ve en el resto del Centro. */
export default function FamilyBadge({ family, className = "" }) {
  const cfg = FAMILY_STYLES[(family || "").toUpperCase()] || { bg: "#757575", fg: "#fff" };
  return (
    <span
      className={className}
      style={{
        background: cfg.bg,
        color: cfg.fg,
        borderRadius: 6,
        padding: "2px 8px",
        fontWeight: 700,
        fontSize: 12,
        marginRight: 8,
      }}
    >
      {family || "?"}
    </span>
  );
}
