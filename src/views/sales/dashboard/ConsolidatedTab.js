import React, { useMemo } from "react";
import { fmtMoney } from "utils/financeFormat";
import { getSalesConsolidated } from "services/salesDashboardService";
import SalesAsyncBoundary from "./SalesAsyncBoundary";
import SourceKpiRow, { GrowthChip } from "./SourceKpiRow";
import CompositionBar from "./CompositionBar";
import { SourceDailyChart, TrendChart } from "./SalesCharts";
import useSalesQuery from "./useSalesQuery";
import {
  KPI_CONFIG,
  NEUTRAL_INK,
  SOURCE_META,
  buildCompositionSegments,
  buildKpiItems,
  buildSourceTable,
  consolidatedDailyAsPoints,
  describePeriod,
  fmtCount,
  fmtQty,
  fmtSharePercent,
  growthDelta,
  hasHistoricalAmount,
  isEmptyKpis,
  moneyOrDash,
} from "./salesDashboardHelpers";

const TOTAL_STYLE = { ink: NEUTRAL_INK, fill: "rgba(59, 74, 90, 0.14)" };

const DETAIL_LINK_TEXT = {
  KIOSKO: "Ver detalle de kioskos",
  ONLINE: "Ver detalle de online",
  VENDOR: "Ver detalle de Vendedor LF",
};

const OPERATIONS_LABEL = { KIOSKO: "Operaciones", ONLINE: "Operaciones", VENDOR: "Órdenes" };

function SourceCard({ source, onOpen }) {
  const meta = SOURCE_META[source.channel] || SOURCE_META.KIOSKO;
  const k = source.kpis || {};
  const share = Math.max(0, Math.min(100, Number(source.sharePercent) || 0));
  return (
    <article className="sdash-src" style={{ borderTopColor: meta.color }} aria-label={meta.label}>
      <div className="sdash-src-head">
        <h5>{source.label || meta.label}</h5>
        <GrowthChip delta={growthDelta(k)} emptyLabel="Sin comparar" />
      </div>
      <div className="sdash-src-value">{fmtMoney(k.totalAmount)}</div>
      <div
        className="sdash-bar"
        role="img"
        aria-label={`${source.label || meta.label}: ${fmtSharePercent(source.sharePercent)} del total`}
      >
        <span style={{ width: `${share}%`, background: meta.color }} />
      </div>
      <div className="sdash-note">{fmtSharePercent(source.sharePercent)} del total</div>
      <dl className="sdash-kv">
        <div>
          <dt>{OPERATIONS_LABEL[meta.channel]}</dt>
          <dd>{fmtCount(k.salesCount)}</dd>
        </div>
        <div>
          <dt>Hoy</dt>
          <dd>{fmtMoney(k.dailyAmount)}</dd>
        </div>
        <div>
          <dt>Unidades de producto terminado</dt>
          <dd>{fmtQty(k.unitsFinished)}</dd>
        </div>
      </dl>
      <button type="button" className="sdash-link" onClick={() => onOpen(meta.tab)}>
        {DETAIL_LINK_TEXT[meta.channel]} →
      </button>
    </article>
  );
}

function FinishedBySourceTable({ sources }) {
  const table = useMemo(() => buildSourceTable(sources), [sources]);
  // 'Histórico' (Finanzas kioscos, sin tickets ni desglose) es una columna más del total: solo aparece si alguna
  // fuente lo trae, y entonces producto + empaque + envío + histórico = total en cada fila.
  const withHistorical = table.hasHistorical;
  return (
    <section className="kfin-card" aria-label="Producto terminado por fuente">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Producto terminado por fuente</h5>
          <div className="kfin-card-sub">
            Cada fuente por su lado, sin mezclar rankings ni precios. Las unidades no incluyen empaques.
            {withHistorical ? " El histórico de Finanzas kioscos no tiene unidades ni desglose." : ""}
          </div>
        </div>
      </header>
      <div className="kfin-scroll sdash-scroll">
        <table className={`kfin-table kfin-table--simple sdash-wide${withHistorical ? " sdash-wide--hist" : ""}`}>
          <caption className="sr-only">
            Unidades y dinero de producto terminado, empaque, envío{withHistorical ? ", histórico" : ""} por fuente
          </caption>
          <thead>
            <tr>
              <th scope="col">Fuente</th>
              <th scope="col" className="is-num">Unidades terminadas</th>
              <th scope="col" className="is-num">Venta de producto</th>
              <th scope="col" className="is-num">Precio promedio por unidad</th>
              <th scope="col" className="is-num">Empaque</th>
              <th scope="col" className="is-num">Envío</th>
              {withHistorical ? <th scope="col" className="is-num">Histórico</th> : null}
              <th scope="col" className="is-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r) => (
              <tr key={r.channel}>
                <th scope="row">
                  <span className="sdash-dot" style={{ background: r.color }} aria-hidden="true" /> {r.label}
                </th>
                <td className="is-num">{fmtQty(r.units)}</td>
                <td className="is-num">{fmtMoney(r.productAmount)}</td>
                <td className="is-num">{r.avgPrice === null ? "—" : fmtMoney(r.avgPrice)}</td>
                <td className="is-num">{moneyOrDash(r.packagingAmount)}</td>
                <td className="is-num">{moneyOrDash(r.shippingAmount)}</td>
                {withHistorical ? <td className="is-num">{moneyOrDash(r.historicalAmount)}</td> : null}
                <td className="is-num kfin-strongnum">{fmtMoney(r.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="is-num">{fmtQty(table.totals.units)}</td>
              <td className="is-num">{fmtMoney(table.totals.productAmount)}</td>
              <td className="is-num" />
              <td className="is-num">{moneyOrDash(table.totals.packagingAmount)}</td>
              <td className="is-num">{moneyOrDash(table.totals.shippingAmount)}</td>
              {withHistorical ? <td className="is-num">{moneyOrDash(table.totals.historicalAmount)}</td> : null}
              <td className="is-num">{fmtMoney(table.totals.totalAmount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function ConsolidatedBody({ data, onSelectTab }) {
  const compareNote = `vs ${describePeriod(data.previousStartDate, data.previousEndDate) || "periodo anterior"}`;
  const kpiItems = useMemo(() => buildKpiItems(data.totals, KPI_CONFIG.consolidado, { compareNote }), [data.totals, compareNote]);
  const composition = useMemo(() => buildCompositionSegments(data.totals), [data.totals]);
  const dailyPoints = useMemo(() => consolidatedDailyAsPoints(data.dailySeries), [data.dailySeries]);
  const period = describePeriod(data.startDate, data.endDate);

  return (
    <>
      <SourceKpiRow items={kpiItems} accent="#252422" />

      <section className="kfin-card" aria-label="Composición del dinero">
        <header className="kfin-card-head">
          <div>
            <h5 className="kfin-card-title">¿De qué está hecho el dinero?</h5>
            <div className="kfin-card-sub">
              El dinero incluye empaque y envío porque tienen costo. Las métricas de producto de cada fuente los excluyen.
              {hasHistoricalAmount(data.totals) ? " El histórico de Finanzas kioscos no tiene desglose." : ""}
            </div>
          </div>
        </header>
        <CompositionBar segments={composition} />
      </section>

      <div className="sdash-row">
        {(data.sources || []).map((s) => (
          <SourceCard key={s.channel} source={s} onOpen={onSelectTab} />
        ))}
      </div>

      <div className="sdash-row">
        <div className="sdash-c2">
          <TrendChart trend={data.monthlyTrend} subtitle="Últimos 6 meses, en quetzales" />
        </div>
        <div className="sdash-c1">
          <SourceDailyChart
            points={dailyPoints}
            style={TOTAL_STYLE}
            title="Ventas por día"
            subtitle={`${period}, total de las tres fuentes`}
          />
        </div>
      </div>

      <FinishedBySourceTable sources={data.sources} />
    </>
  );
}

export default function ConsolidatedTab({ startDate, endDate, refreshToken, onSelectTab }) {
  const query = useSalesQuery(getSalesConsolidated, { startDate, endDate, refreshToken });
  return (
    <SalesAsyncBoundary
      query={query}
      skeletonKpis={4}
      isEmpty={(d) => isEmptyKpis(d.totals)}
      emptyText="No hay ventas de Kioskos, Online ni Vendedor LF en este periodo. Prueba con otro rango de fechas."
    >
      {(data) => <ConsolidatedBody data={data} onSelectTab={onSelectTab} />}
    </SalesAsyncBoundary>
  );
}
