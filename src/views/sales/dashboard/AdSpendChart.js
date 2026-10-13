import React, { memo, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { ChartCard, KButton, KSeg } from "views/kiosks/finance/reports/common";
import { baseChartOptions } from "views/kiosks/finance/reports/chartTheme";
import {
  buildAdSpendChartData,
  buildChartAriaLabel,
  buildChartTableRows,
  displayStatus,
  fmtCostPct,
  fmtResultPct,
  fmtRoas,
  statusMeta,
} from "./adSpendHelpers";
import { fmtCount, fmtDmy } from "./salesDashboardHelpers";

const MODES = [
  { id: "daily", label: "Resultado del día" },
  { id: "cumulative", label: "Acumulado" },
];

/** Línea del cero más marcada: separa ganancia (arriba) de pérdida (abajo). */
const emphasizeZero = (options) => {
  options.scales.y.grid.color = (ctx) => (ctx.tick && ctx.tick.value === 0 ? "#8a8780" : "#e9e8e4");
  options.scales.x.ticks = { ...options.scales.x.ticks, maxTicksLimit: 12, autoSkip: true, maxRotation: 0 };
  return options;
};

/**
 * Barras de venta del día vs inversión y línea de resultado (del día o acumulado). 'Ver como tabla' da los
 * valores exactos; el gráfico lleva texto alternativo con el resumen.
 */
function AdSpendChart({ days, totals, today, periodLabel }) {
  const [mode, setMode] = useState("daily");
  const data = useMemo(() => buildAdSpendChartData(days, mode), [days, mode]);
  const options = useMemo(() => {
    const o = emphasizeZero(baseChartOptions({ yFormat: "money" }));
    o.plugins.tooltip.callbacks.title = (items) => {
      const d = days[items && items[0] ? items[0].dataIndex : -1];
      return d ? fmtDmy(d.date) : "";
    };
    o.plugins.tooltip.callbacks.afterBody = (items) => {
      const d = days[items && items[0] ? items[0].dataIndex : -1];
      if (!d) return "";
      const meta = statusMeta(displayStatus(d, today));
      const lines = [`${fmtCount(d.ordersCount)} pedidos`];
      if (d.adSpend !== null) {
        const pct = d.resultPct === null || d.resultPct === undefined ? "" : ` ${fmtResultPct(d.resultPct)}`;
        lines.push(`${meta.arrow} ${meta.label}${pct} sobre la venta`);
        if (d.adCostPct !== null && d.adCostPct !== undefined) lines.push(`Publicidad: ${fmtCostPct(d.adCostPct)} de la venta`);
        lines.push(`ROAS: ${fmtRoas(d.roas)}`);
      } else lines.push(meta.label);
      return lines;
    };
    return o;
  }, [days, today]);

  const rows = useMemo(() => buildChartTableRows(days, today), [days, today]);
  const ariaLabel = useMemo(() => buildChartAriaLabel(totals, days), [totals, days]);

  return (
    <ChartCard
      title="Venta vs inversión por día"
      subtitle={`${periodLabel} · barras: venta e inversión (Q) · línea: ${
        mode === "daily" ? "resultado de cada día" : "resultado acumulado de los días con inversión"
      }`}
      ariaLabel={ariaLabel}
      columns={[
        { key: "label", label: "Fecha" },
        { key: "sales", label: "Venta", align: "right" },
        { key: "spend", label: "Inversión", align: "right" },
        { key: "result", label: "Resultado", align: "right" },
        { key: "resultPct", label: "% resultado", align: "right" },
        { key: "adCostPct", label: "% publicidad", align: "right" },
        { key: "status", label: "Estado" },
      ]}
      rows={rows}
      actions={
        <KSeg aria-label="Línea del gráfico">
          {MODES.map((m) => (
            <KButton key={m.id} active={mode === m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </KButton>
          ))}
        </KSeg>
      }
      footer={
        totals.daysWithSpend > 0
          ? "Marcadores: ▲ ganancia · ▼ pérdida · ■ equilibrio. Los días sin inversión capturada no tienen barra de inversión ni marcador de resultado."
          : "Aún no hay inversión capturada en este periodo: captura el gasto de cada día para ver el resultado."
      }
    >
      <Bar data={data} options={options} />
    </ChartCard>
  );
}

export default memo(AdSpendChart);
