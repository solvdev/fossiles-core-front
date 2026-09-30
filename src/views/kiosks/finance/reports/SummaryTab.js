import React, { useMemo, useState } from "react";
import { Bar, Line } from "react-chartjs-2";
import { Input } from "reactstrap";
import { getKioskCompare } from "services/kioskFinancialsService";
import { MONTHS_ES, fmtAmount, fmtDateEs, fmtDeltaPct, fmtPct } from "utils/financeFormat";
import useAsyncData from "./useAsyncData";
import {
  BlockSkeleton,
  ChartCard,
  DeltaChip,
  EmptyState,
  ErrorState,
  GoalProgress,
  KpiCard,
  KButton,
  KSeg,
  KpiSkeleton,
  SortTh,
} from "./common";
import { CHART_COLORS, baseChartOptions, hatchPattern } from "./chartTheme";
import {
  aggregateGoalPct,
  buildKpis,
  buildRankingRows,
  buildYoYSeries,
  buildYoYTableRows,
  filterRowsByName,
  fmtPp,
  pctDelta,
  sortRows,
} from "./financeReportHelpers";

const periodText = (from, to) => (from && to ? `${fmtDateEs(from)} – ${fmtDateEs(to)}` : "");

function SalesYoYChart({ series, year, baseYear, kind }) {
  const basePattern = useMemo(() => hatchPattern(CHART_COLORS.base), []);
  const data = useMemo(() => {
    if (kind === "line") {
      return {
        labels: series.labels,
        datasets: [
          {
            label: `${year} (actual)`,
            data: series.current,
            borderColor: CHART_COLORS.current,
            backgroundColor: CHART_COLORS.current,
            borderWidth: 2.5,
            tension: 0.25,
            pointRadius: 4.5,
            pointStyle: "circle",
            pointBackgroundColor: CHART_COLORS.current,
            pointBorderColor: CHART_COLORS.surface,
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            spanGaps: false,
          },
          {
            label: `${baseYear} (base)`,
            data: series.base,
            borderColor: CHART_COLORS.base,
            backgroundColor: CHART_COLORS.base,
            borderWidth: 2,
            borderDash: [6, 4],
            tension: 0.25,
            pointRadius: 4.5,
            pointStyle: "rect",
            pointBackgroundColor: CHART_COLORS.base,
            pointBorderColor: CHART_COLORS.surface,
            pointBorderWidth: 2,
            pointHoverRadius: 7,
            spanGaps: false,
          },
        ],
      };
    }
    return {
      labels: series.labels,
      datasets: [
        {
          label: `${year} (actual)`,
          data: series.current,
          backgroundColor: CHART_COLORS.current,
          borderColor: CHART_COLORS.currentInk,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: "bottom",
          maxBarThickness: 24,
        },
        {
          label: `${baseYear} (base)`,
          data: series.base,
          backgroundColor: basePattern,
          borderColor: CHART_COLORS.baseInk,
          borderWidth: 1,
          borderRadius: 4,
          borderSkipped: "bottom",
          maxBarThickness: 24,
        },
      ],
    };
  }, [series, year, baseYear, kind, basePattern]);

  const options = useMemo(
    () =>
      baseChartOptions({
        yFormat: "money",
        tooltipExtra: (items) => {
          const i = items?.[0]?.dataIndex;
          if (i === undefined) return "";
          const d = pctDelta(series.current[i], series.base[i]);
          return d === null ? "Sin base comparable" : `Variación: ${fmtDeltaPct(d)}`;
        },
      }),
    [series]
  );
  return kind === "line" ? <Line data={data} options={options} /> : <Bar data={data} options={options} />;
}

function MarginChart({ series, year, baseYear }) {
  const data = useMemo(
    () => ({
      labels: series.labels,
      datasets: [
        {
          label: `${year}`,
          data: series.current,
          borderColor: CHART_COLORS.current,
          backgroundColor: CHART_COLORS.current,
          borderWidth: 2.5,
          tension: 0.25,
          pointRadius: 4,
          pointStyle: "circle",
          pointBorderColor: CHART_COLORS.surface,
          pointBorderWidth: 2,
        },
        {
          label: `${baseYear}`,
          data: series.base,
          borderColor: CHART_COLORS.base,
          backgroundColor: CHART_COLORS.base,
          borderWidth: 2,
          borderDash: [6, 4],
          tension: 0.25,
          pointRadius: 4,
          pointStyle: "rect",
          pointBorderColor: CHART_COLORS.surface,
          pointBorderWidth: 2,
        },
      ],
    }),
    [series, year, baseYear]
  );
  const options = useMemo(
    () =>
      baseChartOptions({
        yFormat: "pct",
        tooltipExtra: (items) => {
          const i = items?.[0]?.dataIndex;
          if (i === undefined) return "";
          const d = series.current[i] !== null && series.base[i] !== null ? series.current[i] - series.base[i] : null;
          return d === null ? "" : `Variación: ${fmtPp(d)}`;
        },
      }),
    [series]
  );
  return <Line data={data} options={options} />;
}

const DEFAULT_SORT = { key: "sales", dir: "desc" };

function RankingTable({ rows, totals, year, baseYear }) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const [search, setSearch] = useState("");
  const onSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const shown = useMemo(() => sortRows(filterRowsByName(rows, search), sort.key, sort.dir), [rows, search, sort]);

  return (
    <section className="kfin-card" aria-label="Ranking de kioscos">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Ranking de kioscos</h5>
          <div className="kfin-card-sub">
            {rows.length} kioscos · ordenado por {sortLabel(sort.key)} ({sort.dir === "asc" ? "ascendente" : "descendente"})
          </div>
        </div>
        <div className="kfin-card-actions kfin-noprint">
          <Input
            type="search"
            bsSize="sm"
            className="kfin-search"
            placeholder="Buscar kiosco…"
            aria-label="Buscar kiosco"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </header>
      <div className="kfin-scroll">
        <table className="kfin-table kfin-table--rank">
          <caption className="sr-only">
            Ventas {year} contra {baseYear} por kiosco, con variación, cumplimiento de meta y margen
          </caption>
          <thead>
            <tr>
              <SortTh label="Kiosco" sortKey="name" sort={sort} onSort={onSort} className="kfin-sticky-col" />
              <SortTh label={`Ventas ${year}`} sortKey="sales" sort={sort} onSort={onSort} align="right" />
              <SortTh label={`Ventas ${baseYear}`} sortKey="baseSales" sort={sort} onSort={onSort} align="right" />
              <SortTh label="Δ Q" sortKey="delta" sort={sort} onSort={onSort} align="right" />
              <SortTh label="Δ %" sortKey="deltaPct" sort={sort} onSort={onSort} align="right" />
              <SortTh label="% de meta" sortKey="goalPct" sort={sort} onSort={onSort} />
              <SortTh label="Margen de utilidad" sortKey="margin" sort={sort} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.siteId}>
                <th scope="row" className="kfin-sticky-col kfin-rowhead">
                  <div className="kfin-name">{r.name}</div>
                  {r.periodFrom ? (
                    <div className="kfin-period" title="Periodo comparado (kiosco) contra las mismas fechas del año base">
                      {periodText(r.periodFrom, r.periodTo)}
                    </div>
                  ) : null}
                </th>
                <td className="is-num">{fmtAmount(r.sales)}</td>
                <td className="is-num">{r.baseSales === null ? "—" : fmtAmount(r.baseSales)}</td>
                <td className="is-num">
                  {r.delta === null ? "—" : `${r.delta > 0 ? "+" : ""}${fmtAmount(r.delta)}`}
                </td>
                <td className="is-num">
                  {r.hasBase ? (
                    <DeltaChip delta={r.deltaPct} />
                  ) : (
                    <span className="kfin-muted" title="El kiosco no tiene ventas en el periodo del año base">
                      Sin datos comparables
                    </span>
                  )}
                </td>
                <td>
                  <GoalProgress pct={r.goalPct} />
                </td>
                <td className="is-num">{r.margin === null ? "—" : fmtPct(r.margin)}</td>
              </tr>
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={7} className="kfin-muted text-center py-4">
                  {rows.length ? "Ningún kiosco coincide con la búsqueda." : "Sin kioscos con ventas en el periodo."}
                </td>
              </tr>
            ) : null}
          </tbody>
          {totals ? (
            <tfoot>
              <tr>
                <th scope="row" className="kfin-sticky-col">Total</th>
                <td className="is-num">{fmtAmount(totals.sales)}</td>
                <td className="is-num">{fmtAmount(totals.baseSales)}</td>
                <td className="is-num">
                  {totals.delta === null || totals.delta === undefined
                    ? "—"
                    : `${totals.delta > 0 ? "+" : ""}${fmtAmount(totals.delta)}`}
                </td>
                <td className="is-num">
                  <DeltaChip delta={totals.deltaPct ?? pctDelta(totals.sales, totals.baseSales)} />
                </td>
                <td>
                  <GoalProgress pct={totals.goalPct} />
                </td>
                <td className="is-num">{totals.margin === null || totals.margin === undefined ? "—" : fmtPct(totals.margin)}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}

const SORT_LABELS = {
  name: "kiosco",
  sales: "ventas",
  baseSales: "ventas del año base",
  delta: "variación en Q",
  deltaPct: "variación %",
  goalPct: "% de meta",
  margin: "margen",
};
const sortLabel = (k) => SORT_LABELS[k] || k;

export default function SummaryTab({ filters, activeSiteNames }) {
  const { year, baseYear, fromMonth, toMonth, mode, siteIds } = filters;
  const [chartKind, setChartKind] = useState("bar");
  const { data, loading, error, reload } = useAsyncData(
    () => getKioskCompare({ year, baseYear, fromMonth, toMonth, mode, siteIds }),
    [year, baseYear, fromMonth, toMonth, mode, siteIds.join(",")]
  );

  const kpis = useMemo(() => buildKpis(data), [data]);
  const salesSeries = useMemo(() => buildYoYSeries(data?.monthly, "sales"), [data]);
  const marginSeries = useMemo(() => buildYoYSeries(data?.monthly, "margin"), [data]);
  const rows = useMemo(() => buildRankingRows(data?.sites), [data]);
  const totals = useMemo(() => {
    if (!data?.totals) return null;
    return {
      ...data.totals,
      goalPct: aggregateGoalPct(data.sites),
    };
  }, [data]);

  const hasData = !!data && ((data.sites || []).length > 0 || (data.monthly || []).length > 0);
  const range = `${MONTHS_ES[fromMonth - 1]}${fromMonth === toMonth ? "" : ` – ${MONTHS_ES[toMonth - 1]}`}`;
  const modeText = mode === "SAME_PERIOD" ? "Mismo periodo" : "Mes completo";

  if (error) return <ErrorState message={error} onRetry={reload} />;

  if (!data && loading) {
    return (
      <div>
        <KpiSkeleton />
        <div className="kfin-grid-2">
          <BlockSkeleton height={340} />
          <BlockSkeleton height={340} />
        </div>
        <BlockSkeleton height={280} />
      </div>
    );
  }

  if (!hasData) {
    return (
      <EmptyState title="Sin datos comparables">
        No hay ventas del {range} de {year} ni de {baseYear}
        {siteIds.length ? " para los kioscos seleccionados" : ""}. Verifica que los meses estén importados
        (Importar ventas) o cambia el rango.
      </EmptyState>
    );
  }

  return (
    <div className={loading ? "kfin-refetching" : ""} aria-busy={loading}>
      <div className="kfin-context" role="note">
        <strong>{year}</strong> contra <strong>{baseYear}</strong> · {range} · modo <strong>{modeText}</strong>
        {activeSiteNames ? ` · ${activeSiteNames}` : " · todos los kioscos"}
        {data.asOf ? <span className="kfin-muted"> · datos al {fmtDateEs(data.asOf)}</span> : null}
      </div>

      <div className="kfin-kpis">
        {kpis.map((k) => (
          <KpiCard key={k.key} kpi={k} year={year} baseYear={baseYear} />
        ))}
      </div>

      <div className="kfin-grid-2">
        <ChartCard
          title={`Ventas por mes: ${year} vs ${baseYear}`}
          subtitle={`Quetzales, IVA incluido · ${modeText.toLowerCase()}`}
          ariaLabel={`Gráfico de ventas mensuales de ${year} comparadas con ${baseYear}. Use "Ver como tabla" para leer los valores.`}
          columns={[
            { key: "label", label: "Mes" },
            { key: "current", label: `${year}`, align: "right" },
            { key: "base", label: `${baseYear}`, align: "right" },
            { key: "delta", label: "Variación", align: "right" },
          ]}
          rows={buildYoYTableRows(salesSeries, "money")}
          actions={
            <KSeg aria-label="Tipo de gráfico">
              <KButton active={chartKind === "bar"} onClick={() => setChartKind("bar")} aria-pressed={chartKind === "bar"}>
                Barras
              </KButton>
              <KButton active={chartKind === "line"} onClick={() => setChartKind("line")} aria-pressed={chartKind === "line"}>
                Líneas
              </KButton>
            </KSeg>
          }
        >
          <SalesYoYChart series={salesSeries} year={year} baseYear={baseYear} kind={chartKind} />
        </ChartCard>

        <ChartCard
          title="Margen mensual"
          subtitle="Utilidad / ventas (utilidad = ventas − costo operativo)"
          ariaLabel={`Gráfico de margen mensual de ${year} comparado con ${baseYear}.`}
          columns={[
            { key: "label", label: "Mes" },
            { key: "current", label: `${year}`, align: "right" },
            { key: "base", label: `${baseYear}`, align: "right" },
            { key: "delta", label: "Variación", align: "right" },
          ]}
          rows={buildYoYTableRows(marginSeries, "pct")}
        >
          <MarginChart series={marginSeries} year={year} baseYear={baseYear} />
        </ChartCard>
      </div>

      <RankingTable rows={rows} totals={totals} year={year} baseYear={baseYear} />
      <p className="kfin-foot kfin-muted">
        Costos del periodo parcial prorrateados por días. Kioscos que entraron al POS a mitad de año se comparan
        contra los mismos días calendario del año base (modo &quot;Mismo periodo&quot;).
      </p>
    </div>
  );
}
