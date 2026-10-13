import React from "react";
import { DeltaChip } from "views/kiosks/finance/reports/common";

/** Variación contra el periodo anterior. delta = decimal (0.124); null = no hay base comparable. */
export function GrowthChip({ delta, emptyLabel = "Sin periodo anterior" }) {
  if (delta === null || delta === undefined) {
    return (
      <span className="kfin-delta kfin-delta--neutral" title="No hubo ventas en el periodo anterior para comparar">
        <span aria-hidden="true">–</span> {emptyLabel}
      </span>
    );
  }
  return <DeltaChip delta={delta} />;
}

/**
 * Fila de KPIs de una fuente. items = buildKpiItems(...): {key, label, value, note, growth?}.
 * `accent` pinta el borde superior con el color de la fuente.
 */
export default function SourceKpiRow({ items, accent }) {
  return (
    <div className="kfin-kpis sdash-kpis" style={accent ? { "--sdash-accent": accent } : undefined}>
      {items.map((item) => (
        <div className="kfin-kpi" key={item.key} role="group" aria-label={`${item.label}: ${item.value}`}>
          <div className="kfin-kpi-label">{item.label}</div>
          <div className="kfin-kpi-value" title={item.value}>
            {item.value}
          </div>
          <div className="kfin-kpi-delta">
            {item.growth !== undefined ? <GrowthChip delta={item.growth} /> : null}
            {item.note ? <span className="sdash-note">{item.note}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
