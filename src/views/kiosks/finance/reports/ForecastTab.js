import React, { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { Input } from "reactstrap";
import { getKioskMonthEndForecast, getKioskNextYearForecast } from "services/kioskFinancialsService";
import { MONTHS_ES, MONTHS_ES_SHORT, fmtAmount, fmtDateEs, fmtPct } from "utils/financeFormat";
import useAsyncData from "./useAsyncData";
import { BlockSkeleton, ChartCard, EmptyState, ErrorState, KButton, KSeg } from "./common";
import { CHART_COLORS, baseChartOptions } from "./chartTheme";
import { GROWTH_SOURCE_TEXT, formatGrowth, goalOutlook } from "./financeReportHelpers";

const METHOD_TEXT = {
  WEEKDAY: "Promedio por día de la semana (8 semanas)",
  RUN_RATE: "Promedio diario del mes (kiosco nuevo)",
  INSUFFICIENT: "Sin historia suficiente",
};

const money = (v) => (v === null || v === undefined ? "—" : fmtAmount(v));
const pct = (v) => (v === null || v === undefined ? "—" : fmtPct(v));

function Pill({ outlook }) {
  return <span className={`kfin-pill kfin-pill--${outlook.cls}`}>{outlook.text}</span>;
}

/* ----------------------------- Cierre del mes en curso ----------------------------- */

function MonthEndSection({ filters }) {
  const { siteIds } = filters;
  const { data, loading, error, reload } = useAsyncData(() => getKioskMonthEndForecast({ siteIds }), [siteIds.join(",")]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data && loading) return <BlockSkeleton height={260} />;
  const sites = (data && data.sites) || [];
  if (!sites.length) {
    return (
      <EmptyState title="Sin kioscos para proyectar">
        No hay kioscos activos con ventas en las últimas 4 semanas{siteIds.length ? " entre los seleccionados" : ""}.
      </EmptyState>
    );
  }
  const t = data.totals;
  return (
    <div className={loading ? "kfin-refetching" : ""} aria-busy={loading}>
      <h5 className="kfin-section-title">
        Cierre proyectado de {MONTHS_ES[data.month - 1]} {data.year}
      </h5>
      <div className="kfin-context" role="note">
        Datos al <strong>{fmtDateEs(data.asOf)}</strong> · {data.daysElapsed} días completos, {data.daysRemaining} por proyectar
        (incluye hoy) · cada día esperado = promedio de ese día de la semana en las últimas 8 semanas · rango del 80 % ·
        P&amp;L con los costos y tasas vigentes de cada kiosco
      </div>
      <div className="kfin-scroll kfin-scroll--short" tabIndex={0} aria-label="Cierre proyectado del mes, desplazable">
        <table className="kfin-table kfin-table--simple">
          <caption className="sr-only">Cierre proyectado de {MONTHS_ES[data.month - 1]} por kiosco</caption>
          <thead>
            <tr>
              <th scope="col" className="kfin-sticky-col">Kiosco</th>
              <th scope="col" className="is-num">Ventas al día</th>
              <th scope="col" className="is-num">Cierre proyectado</th>
              <th scope="col" className="is-num">Rango (80 %)</th>
              <th scope="col" className="is-num">Meta</th>
              <th scope="col" className="is-num">% meta al cierre</th>
              <th scope="col">Frente a la meta</th>
              <th scope="col" className="is-num">Utilidad proyectada</th>
              <th scope="col" className="is-num">Margen</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const noProjection = s.projected === null || s.projected === undefined;
              const neg = s.difference !== null && s.difference !== undefined && s.difference < 0;
              return (
                <tr key={s.siteId}>
                  <th scope="row" className="kfin-sticky-col" title={METHOD_TEXT[s.method]}>
                    {s.name}
                    {s.method !== "WEEKDAY" ? <span className="kfin-sub">{METHOD_TEXT[s.method]}</span> : null}
                  </th>
                  <td className="is-num">{money(s.actualToDate)}</td>
                  <td className="is-num kfin-strongnum">{noProjection ? "—" : money(s.projected)}</td>
                  <td className="is-num kfin-muted">{noProjection ? "—" : `${money(s.low)} – ${money(s.high)}`}</td>
                  <td className="is-num">{money(s.goal)}</td>
                  <td className="is-num">{pct(s.goalPctProjected)}</td>
                  <td>{noProjection ? <span className="kfin-muted">—</span> : <Pill outlook={goalOutlook(s.goalPctProjected)} />}</td>
                  <td className={`is-num ${neg ? "kfin-neg" : ""}`}>
                    {s.difference === null || s.difference === undefined ? "—" : `${neg ? "▼ " : ""}${money(s.difference)}`}
                  </td>
                  <td className={`is-num ${neg ? "kfin-neg" : ""}`}>{pct(s.margin)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="kfin-sticky-col">Total ({t.sitesProjected} kioscos)</th>
              <td className="is-num">{money(t.actualToDate)}</td>
              <td className="is-num">{money(t.projected)}</td>
              <td className="is-num kfin-muted">—</td>
              <td className="is-num">{money(t.goal)}</td>
              <td className="is-num">{pct(t.goalPctProjected)}</td>
              <td />
              <td className="is-num">{money(t.difference)}</td>
              <td className="is-num">{pct(t.margin)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="kfin-foot kfin-muted">
        La comisión de venta se activa al llegar al 70 % de la meta. {t.sitesWithoutProjection ? `${t.sitesWithoutProjection} kiosco(s) sin historia suficiente no se proyectan. ` : ""}
        El cierre sólo es una estimación: no toma en cuenta feriados, promociones ni cierres extraordinarios.
      </p>
    </div>
  );
}

/* ----------------------------------- Año siguiente ----------------------------------- */

function NextYearSection({ filters }) {
  const { siteIds } = filters;
  const [mode, setMode] = useState("AUTO"); // AUTO | FIXED
  const [draft, setDraft] = useState("8");
  const [applied, setApplied] = useState(null);
  const growthPct = mode === "FIXED" ? (applied === null ? Number(draft) || 0 : applied) : null;
  const { data, loading, error, reload } = useAsyncData(
    () => getKioskNextYearForecast({ siteIds, growthPct }),
    [siteIds.join(","), growthPct]
  );

  const applyDraft = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && n >= -50 && n <= 100) setApplied(n);
    else setDraft(String(applied === null ? 8 : applied));
  };

  const totals = data && data.totals;
  const series = useMemo(() => {
    if (!totals) return null;
    const rows = totals.months || [];
    return {
      labels: rows.map((m) => MONTHS_ES_SHORT[m.month - 1]),
      base: rows.map((m) => (m.baseSales === null || m.baseSales === undefined ? null : Number(m.baseSales))),
      target: rows.map((m) => (m.sales === null || m.sales === undefined ? null : Number(m.sales))),
    };
  }, [totals]);
  const chartData = useMemo(
    () =>
      series && data
        ? {
            labels: series.labels,
            datasets: [
              {
                label: `${data.baseYear} (real + proyectado)`,
                data: series.base,
                borderColor: CHART_COLORS.base,
                backgroundColor: CHART_COLORS.base,
                borderWidth: 2,
                tension: 0.25,
                pointRadius: 4,
                pointStyle: "rect",
              },
              {
                label: `${data.targetYear} (proyección)`,
                data: series.target,
                borderColor: CHART_COLORS.current,
                backgroundColor: CHART_COLORS.current,
                borderWidth: 2.5,
                borderDash: [6, 4],
                tension: 0.25,
                pointRadius: 4.5,
                pointStyle: "circle",
              },
            ],
          }
        : null,
    [series, data]
  );
  const chartOptions = useMemo(() => baseChartOptions({ yFormat: "money" }), []);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data && loading) return <BlockSkeleton height={300} />;
  const sites = (data && data.sites) || [];
  if (!data || !sites.length) {
    return (
      <EmptyState title="Sin kioscos con historia suficiente">
        La proyección necesita al menos 2 meses de ventas por kiosco
        {data && data.skippedSites && data.skippedSites.length ? `: ${data.skippedSites.join(", ")}` : ""}.
      </EmptyState>
    );
  }

  return (
    <div className={loading ? "kfin-refetching" : ""} aria-busy={loading}>
      <h5 className="kfin-section-title">Proyección {data.targetYear} por kiosco</h5>
      <div className="kfin-context kfin-context--row" role="note">
        <span>
          Cada mes de {data.targetYear} = el mismo mes de {data.baseYear} (real; proyectado en el mes en curso y los que faltan)
          × el crecimiento. Crecimiento global (mismos kioscos):{" "}
          <strong>{data.companyGrowthFactor === null ? "—" : formatGrowth(Number(data.companyGrowthFactor))}</strong>
        </span>
      </div>

      <div className="kfin-filters kfin-noprint" style={{ marginBottom: 12 }}>
        <div className="kfin-field">
          <span className="kfin-label" id="kfin-growth-label">Crecimiento a aplicar</span>
          <KSeg aria-labelledby="kfin-growth-label">
            <KButton large active={mode === "AUTO"} aria-pressed={mode === "AUTO"} onClick={() => setMode("AUTO")}>
              Automático por kiosco
            </KButton>
            <KButton large active={mode === "FIXED"} aria-pressed={mode === "FIXED"} onClick={() => setMode("FIXED")}>
              Fijo para todos
            </KButton>
          </KSeg>
        </div>
        {mode === "FIXED" ? (
          <div className="kfin-field">
            <label htmlFor="kfin-growth-pct">Crecimiento anual (%)</label>
            <Input
              id="kfin-growth-pct"
              type="number"
              bsSize="sm"
              step="0.5"
              min={-50}
              max={100}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={applyDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyDraft();
              }}
              style={{ maxWidth: 120 }}
            />
          </div>
        ) : (
          <div className="kfin-hint">
            Cada kiosco usa su propio crecimiento (mismas fechas contra {data.baseYear}); si no tiene un año de historia comparable
            usa el global. Se limita entre −50 % y +100 %.
          </div>
        )}
      </div>

      {data.skippedSites && data.skippedSites.length ? (
        <div className="kfin-hint" style={{ maxWidth: "none", marginBottom: 8 }}>
          Sin historia suficiente (menos de 2 meses), no se proyectan: {data.skippedSites.join(", ")}.
        </div>
      ) : null}

      <ChartCard
        title={`Ventas mensuales: ${data.targetYear} (proyección) vs ${data.baseYear}`}
        subtitle="Quetzales, IVA incluido · total de los kioscos con historia suficiente"
        ariaLabel={`Gráfico de la proyección de ventas ${data.targetYear} contra ${data.baseYear}.`}
        columns={[
          { key: "label", label: "Mes" },
          { key: "base", label: `${data.baseYear}`, align: "right" },
          { key: "target", label: `${data.targetYear}`, align: "right" },
        ]}
        rows={(series ? series.labels : []).map((label, i) => ({
          label,
          base: money(series.base[i]),
          target: money(series.target[i]),
        }))}
      >
        {chartData ? <Line data={chartData} options={chartOptions} /> : null}
      </ChartCard>

      <div className="kfin-scroll" tabIndex={0} aria-label="Proyección mensual por kiosco, desplazable" style={{ marginTop: 16 }}>
        <table className="kfin-table kfin-table--simple">
          <caption className="sr-only">Proyección de ventas {data.targetYear} por kiosco y mes</caption>
          <thead>
            <tr>
              <th scope="col" className="kfin-sticky-col">Kiosco</th>
              <th scope="col" className="is-num">Crecimiento</th>
              {MONTHS_ES_SHORT.map((m) => (
                <th scope="col" key={m} className="is-num">{m}</th>
              ))}
              <th scope="col" className="is-num">Total {data.targetYear}</th>
              <th scope="col" className="is-num">Real + proy. {data.baseYear}</th>
              <th scope="col" className="is-num">Utilidad proy.</th>
              <th scope="col" className="is-num">Margen</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const neg = s.difference !== null && s.difference !== undefined && s.difference < 0;
              return (
                <tr key={s.siteId}>
                  <th scope="row" className="kfin-sticky-col">{s.name}</th>
                  <td className="is-num" title={`Origen: ${GROWTH_SOURCE_TEXT[s.growthSource] || s.growthSource}${s.growthCapped ? " (limitado)" : ""}`}>
                    {formatGrowth(Number(s.growthFactor))}
                    <span className="kfin-sub">
                      {GROWTH_SOURCE_TEXT[s.growthSource] || s.growthSource}
                      {s.growthCapped ? " · limitado" : ""}
                    </span>
                  </td>
                  {s.months.map((m) => (
                    <td
                      key={m.month}
                      className="is-num"
                      style={m.estimated ? { fontStyle: "italic" } : undefined}
                      title={m.estimated ? "Estimado con el nivel del kiosco × estacionalidad (no tiene ese mes el año anterior)" : undefined}
                    >
                      {money(m.sales)}
                      {m.estimated ? "*" : ""}
                    </td>
                  ))}
                  <td className="is-num kfin-strongnum">{money(s.sales)}</td>
                  <td className="is-num kfin-muted">{money(s.baseSales)}</td>
                  <td className={`is-num ${neg ? "kfin-neg" : ""}`}>
                    {s.difference === null || s.difference === undefined ? "—" : `${neg ? "▼ " : ""}${money(s.difference)}`}
                  </td>
                  <td className={`is-num ${neg ? "kfin-neg" : ""}`}>{pct(s.margin)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="kfin-sticky-col">Total</th>
              <td className="is-num">—</td>
              {totals.months.map((m) => (
                <td key={m.month} className="is-num">{money(m.sales)}</td>
              ))}
              <td className="is-num">{money(totals.sales)}</td>
              <td className="is-num kfin-muted">{money(totals.baseSales)}</td>
              <td className="is-num">{money(totals.difference)}</td>
              <td className="is-num">{pct(totals.margin)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="kfin-foot kfin-muted">
        * Mes estimado con el nivel del kiosco × el índice estacional de los kioscos con 12 meses de historia (el kiosco aún no
        tenía ese mes el año anterior). El P&amp;L proyectado supone los costos fijos y tasas vigentes de cada kiosco (último mes
        configurado) y el punto de equilibrio configurado en Costos por kiosco. Es una proyección sencilla para proponer metas;
        no considera aperturas, cierres, cambios de precio ni inflación.
      </p>
    </div>
  );
}

export default function ForecastTab({ filters }) {
  return (
    <div>
      <MonthEndSection filters={filters} />
      <NextYearSection filters={filters} />
    </div>
  );
}
