import React, { useMemo } from "react";
import { Bar, Line } from "react-chartjs-2";
import { fmtMoney } from "utils/financeFormat";
import { ChartCard } from "views/kiosks/finance/reports/common";
import { baseChartOptions } from "views/kiosks/finance/reports/chartTheme";
import {
  buildDailyChartData,
  buildDailyTableRows,
  buildStackedTrendData,
  buildTrendTableRows,
  buildWeeklyChartData,
  buildWeeklyTableRows,
  fmtCount,
  fmtDmy,
  normalizeDaily,
  peakPoint,
} from "./salesDashboardHelpers";

const hideLegend = (options) => {
  options.plugins.legend.display = false;
  return options;
};

/** Eje X con pocas etiquetas aunque el rango sea largo. */
const limitXTicks = (options, max = 12) => {
  options.scales.x.ticks = { ...options.scales.x.ticks, maxTicksLimit: max, autoSkip: true, maxRotation: 0 };
  return options;
};

/**
 * Línea de ventas por día (una fuente o el total). points = DailyPoint[]; style = { ink, fill }.
 * El pico se resalta en la línea y se repite en el pie (texto), y 'Ver como tabla' da los valores exactos.
 */
export function SourceDailyChart({ points, style, title = "Ventas por día", subtitle, ariaLabel, countLabel = "operaciones" }) {
  const chart = useMemo(
    () => buildDailyChartData(points, { color: style.ink, fill: style.fill, label: "Ventas" }),
    [points, style]
  );
  const lineData = useMemo(() => ({ labels: chart.labels, datasets: chart.datasets }), [chart]);
  const options = useMemo(() => {
    const o = limitXTicks(hideLegend(baseChartOptions({ yFormat: "money" })));
    o.plugins.tooltip.callbacks.title = (items) => fmtDmy(chart.points[items?.[0]?.dataIndex]?.date);
    o.plugins.tooltip.callbacks.afterBody = (items) => {
      const p = chart.points[items?.[0]?.dataIndex];
      return p && p.count ? `${fmtCount(p.count)} ${countLabel}` : "";
    };
    return o;
  }, [chart, countLabel]);
  const peak = useMemo(() => peakPoint(normalizeDaily(points)), [points]);
  const hasCounts = useMemo(() => normalizeDaily(points).some((p) => p.count > 0), [points]);

  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      ariaLabel={
        ariaLabel ||
        `Línea de ventas diarias${peak ? `; el pico es el ${fmtDmy(peak.date)} con ${fmtMoney(peak.amount)}` : ""}. Use "Ver como tabla" para leer los valores.`
      }
      columns={[
        { key: "label", label: "Fecha" },
        { key: "amount", label: "Venta", align: "right" },
        ...(hasCounts ? [{ key: "count", label: "Operaciones", align: "right" }] : []),
      ]}
      rows={buildDailyTableRows(points)}
      footer={peak ? `Día pico: ${fmtDmy(peak.date)} · ${fmtMoney(peak.amount)}` : "Sin ventas en el periodo."}
    >
      <Line data={lineData} options={options} />
    </ChartCard>
  );
}

/** Barras apiladas por mes y fuente (Consolidado). */
export function TrendChart({ trend, title = "Tendencia mensual por fuente", subtitle = "Últimos 6 meses" }) {
  const data = useMemo(() => buildStackedTrendData(trend), [trend]);
  const options = useMemo(() => {
    const o = baseChartOptions({
      yFormat: "money",
      tooltipExtra: (items) => {
        const t = (trend || [])[items?.[0]?.dataIndex];
        return t ? `Total: ${fmtMoney(t.total)}` : "";
      },
    });
    o.scales.x.stacked = true;
    o.scales.y.stacked = true;
    return o;
  }, [trend]);
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      ariaLabel="Barras apiladas por mes con la venta de Kioskos, Online y Vendedor LF. Use &quot;Ver como tabla&quot; para leer los valores."
      columns={[
        { key: "label", label: "Mes" },
        { key: "kiosko", label: "Kioskos", align: "right" },
        { key: "online", label: "Online", align: "right" },
        { key: "vendor", label: "Vendedor LF", align: "right" },
        { key: "total", label: "Total", align: "right" },
      ]}
      rows={buildTrendTableRows(trend)}
    >
      <Bar data={data} options={options} />
    </ChartCard>
  );
}

/** Barras por semana de 7 días contadas desde el inicio del rango (Vendedor LF). */
export function WeeklyBarsChart({ weeks, color, title = "Ventas por semana", subtitle }) {
  const data = useMemo(() => buildWeeklyChartData(weeks, color), [weeks, color]);
  const options = useMemo(() => {
    const o = hideLegend(
      baseChartOptions({
        yFormat: "money",
        tooltipExtra: (items) => {
          const w = weeks[items?.[0]?.dataIndex];
          return w ? `${fmtDmy(w.from)} – ${fmtDmy(w.to)} · ${fmtCount(w.count)} órdenes` : "";
        },
      })
    );
    return o;
  }, [weeks]);
  return (
    <ChartCard
      title={title}
      subtitle={subtitle}
      ariaLabel="Barras de venta por semana. Use &quot;Ver como tabla&quot; para leer los valores."
      columns={[
        { key: "label", label: "Semana" },
        { key: "range", label: "Días" },
        { key: "amount", label: "Venta", align: "right" },
        { key: "count", label: "Órdenes", align: "right" },
      ]}
      rows={buildWeeklyTableRows(weeks)}
      footer="Semanas de 7 días contadas desde el primer día del periodo; la última puede tener menos días."
    >
      <Bar data={data} options={options} />
    </ChartCard>
  );
}
