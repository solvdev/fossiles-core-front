import React from "react";

/** Origen de la distribución (MANUAL o REPOSICION). Las viejas sin origen cuentan como manuales. */
export const distributionOriginOf = (distribution) =>
  String(distribution?.origin || "MANUAL").toUpperCase() === "REPOSICION" ? "REPOSICION" : "MANUAL";

/** Chip de origen; los estilos viven en views/distribution/distributionContrast.css (.dist-origin-*). */
function DistributionOriginBadge({ distribution }) {
  return distributionOriginOf(distribution) === "REPOSICION" ? (
    <span className="dist-origin dist-origin-reposicion">Reposición</span>
  ) : (
    <span className="dist-origin dist-origin-manual">Manual</span>
  );
}

export default DistributionOriginBadge;
