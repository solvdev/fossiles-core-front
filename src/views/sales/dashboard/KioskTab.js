import React, { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { fmtMoney } from "utils/financeFormat";
import { getSalesKiosks } from "services/salesDashboardService";
import KioskYoYCard from "views/sales/KioskYoYCard";
import SalesAsyncBoundary from "./SalesAsyncBoundary";
import SourceKpiRow from "./SourceKpiRow";
import CompositionBar from "./CompositionBar";
import CategoryBadge from "./CategoryBadge";
import KioskHeatmapSection from "./KioskHeatmapSection";
import ProductRankingCard from "./ProductRankingCard";
import RecentSalesTable from "./RecentSalesTable";
import { SourceDailyChart } from "./SalesCharts";
import useSalesQuery from "./useSalesQuery";
import {
  KPI_CONFIG,
  SOURCE_META,
  barPct,
  buildCompositionSegments,
  buildKioskOptions,
  buildKpiItems,
  describePeriod,
  fmtCountOrDash,
  fmtSharePercent,
  hasHistoricalAmount,
  isEmptyKpis,
  segmentsFromBreakdown,
  totalSalesLink,
} from "./salesDashboardHelpers";

const META = SOURCE_META.KIOSKO;
const POS_ONLY = "Solo POS";
const SOURCE_CAPTION =
  "Ventas de kioscos = misma fuente que Finanzas kioscos (histórico + POS), con empaque incluido. Tickets, unidades, pagos y productos son solo del POS.";
const RECENT_COLUMNS = [
  { key: "saleDate", label: "Fecha" },
  { key: "party", label: "Kiosko" },
  { key: "reference", label: "Ticket" },
  { key: "productLabel", label: "Producto" },
  { key: "totalAmount", label: "Total" },
];

/**
 * Ranking por kiosko (breakdowns.byKiosk, una fila por SITIO de Finanzas kioscos: key = siteId). La venta incluye el
 * histórico; los tickets son solo del POS, así que un kiosko solo con histórico muestra '—' en vez de 0. Cada kiosko
 * lleva su clasificación (Cat. A, B, C o Sin clasificar) junto al nombre.
 */
function KioskRanking({ rows }) {
  const list = rows || [];
  const max = list.length ? Math.max(...list.map((r) => Number(r.amount) || 0)) : 0;
  return (
    <section className="kfin-card sdash-c2" aria-label="Ranking por kiosko">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Ranking por kiosko</h5>
          <div className="kfin-card-sub">Ordenado por venta del periodo · los tickets son solo del POS</div>
        </div>
        <Link className="sdash-link" to="/admin/kiosk-sales">
          Abrir POS de kioskos →
        </Link>
      </header>
      <div className="kfin-scroll sdash-scroll">
        <table className="kfin-table kfin-table--simple">
          <caption className="sr-only">Clasificación, tickets del POS, venta y participación por kiosko</caption>
          <thead>
            <tr>
              <th scope="col">Kiosko</th>
              <th scope="col" className="is-num">Tickets (POS)</th>
              <th scope="col" className="is-num">Venta</th>
              <th scope="col" className="is-num">% del total</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={`${r.key ?? r.label}-${i}`}>
                <th scope="row">
                  <span className="sdash-rank-name">{r.label || "Sin dato"}</span>{" "}
                  <CategoryBadge category={r.category} />
                  <span
                    className="sdash-mini"
                    aria-hidden="true"
                    style={{ width: `${barPct(Number(r.amount) || 0, max)}%`, background: META.color }}
                  />
                </th>
                <td className="is-num">{fmtCountOrDash(r.count)}</td>
                <td className="is-num kfin-strongnum">{fmtMoney(r.amount)}</td>
                <td className="is-num">{fmtSharePercent(r.sharePercent)}</td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td colSpan={4} className="kfin-muted text-center py-4">
                  Sin kioskos con ventas en el periodo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Bajo los KPIs: cuánto del total viene del histórico (solo si hay) y, siempre, de dónde sale cada número. Sin
 * esto el total de Finanzas kioscos (histórico + POS) no cuadraría con los tickets y el desglose, que son del POS.
 */
function KioskSourceNotes({ kpis }) {
  return (
    <div className="sdash-kpinotes">
      {hasHistoricalAmount(kpis) ? (
        <div className="sdash-def" role="note">
          <b>{fmtMoney(kpis.historicalAmount)}</b> vienen del histórico de Finanzas kioscos (sin tickets ni productos).
        </div>
      ) : null}
      <p className="sdash-caption">{SOURCE_CAPTION}</p>
    </div>
  );
}

/** KPIs, ventas por día, composición y pago, ranking por kiosko, productos y comparación con el año anterior. */
function KioskTop({ data, startDate, endDate, filtered }) {
  const compareNote = `vs ${describePeriod(data.previousStartDate, data.previousEndDate) || "periodo anterior"}`;
  const items = useMemo(
    () => buildKpiItems(data.kpis, KPI_CONFIG.KIOSKO, { compareNote, filtered }),
    [data.kpis, compareNote, filtered]
  );
  const composition = useMemo(() => buildCompositionSegments(data.kpis), [data.kpis]);
  const payment = useMemo(
    () => segmentsFromBreakdown(data.breakdowns?.byPaymentMethod),
    [data.breakdowns]
  );
  const period = describePeriod(data.startDate, data.endDate);

  return (
    <>
      <SourceKpiRow items={items} accent={META.color} />
      <KioskSourceNotes kpis={data.kpis} />

      <div className="sdash-row">
        <div className="sdash-c2">
          <SourceDailyChart
            points={data.dailySeries}
            style={META}
            subtitle={`${period}, ${filtered ? "kiosko seleccionado" : "todos los kioskos"}`}
            countLabel="tickets"
          />
        </div>
        <section className="kfin-card sdash-c1" aria-label="Composición y pago">
          <header className="kfin-card-head">
            <div>
              <h5 className="kfin-card-title">Composición y pago</h5>
              <div className="kfin-card-sub">Dinero del periodo (histórico + POS) y forma de pago (POS)</div>
            </div>
          </header>
          <CompositionBar segments={composition} />
          <h6 className="sdash-subhead">
            Forma de pago <span className="sdash-badge sdash-badge--amber">{POS_ONLY}</span>
          </h6>
          <CompositionBar segments={payment} showAmount={false} />
          <div className="kfin-card-foot">
            Porcentajes sobre la venta del POS{hasHistoricalAmount(data.kpis) ? "; el histórico no tiene forma de pago" : ""}.
          </div>
        </section>
      </div>

      <div className="sdash-row">
        <KioskRanking rows={data.breakdowns?.byKiosk} />
        <ProductRankingCard className="sdash-c1" rows={data.topProducts} color="#3b4a5a" scopeNote={POS_ONLY} />
      </div>

      <div className="sdash-yoy">
        <KioskYoYCard startDate={startDate} endDate={endDate} />
      </div>
    </>
  );
}

/** Últimas ventas del POS (va debajo del mapa de calor de kioscos). */
function KioskRecent({ data, startDate, endDate }) {
  return (
    <RecentSalesTable
      title="Últimas ventas"
      subtitle={`Las ${(data.recentSales || []).length} más recientes del periodo · solo POS`}
      columns={RECENT_COLUMNS}
      keyPrefix="kiosko"
      rows={data.recentSales}
      link={{ to: totalSalesLink(META.totalSalesChannel, startDate, endDate), label: "Ver todas las ventas" }}
    />
  );
}

/**
 * Pestaña Kioskos. `siteId` = sitio de Finanzas kioscos elegido ('' = todos); el selector y la URL usan el id del
 * sitio (un kiosko histórico no tiene ubicación del POS).
 *
 * 'Mapa de calor de kioscos' consulta su propio endpoint y va siempre en la misma posición del árbol (entre las
 * tarjetas de arriba y 'Últimas ventas'), igual que 'Publicidad vs ventas' en Online: así no desaparece si
 * /dashboard/kiosks falla, viene vacío (p. ej. el kiosko elegido no vendió) o se recarga.
 */
export default function KioskTab({ startDate, endDate, siteId, onKioskChange, refreshToken }) {
  const query = useSalesQuery(getSalesKiosks, { startDate, endDate, siteId, refreshToken });
  const { data, loading } = query;
  // Las opciones del selector no dependen del kiosko elegido (el backend las manda siempre completas); se conservan
  // mientras recarga o si el kiosko elegido no tiene ventas, para que siempre se pueda volver a 'Todos'.
  const optionsRef = useRef([]);
  if (data && Array.isArray(data.kioskOptions)) optionsRef.current = data.kioskOptions;
  const options = buildKioskOptions(optionsRef.current, siteId);
  const selected = siteId ? options.find((o) => o.value === String(siteId)) : null;
  const ready = Boolean(data) && !isEmptyKpis(data.kpis);
  const wrapperProps = { className: loading ? "kfin-refetching" : "", "aria-busy": loading };

  return (
    <>
      <div className="kfin-filters kfin-noprint sdash-tabfilters">
        <div className="kfin-field">
          <label htmlFor="sdash-kiosk">Kiosko</label>
          <select
            id="sdash-kiosk"
            className="form-control"
            value={siteId || ""}
            onChange={(e) => onKioskChange(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {ready ? (
        <div {...wrapperProps}>
          <KioskTop data={data} startDate={startDate} endDate={endDate} filtered={!!siteId} />
        </div>
      ) : (
        <SalesAsyncBoundary
          query={query}
          isEmpty={(d) => isEmptyKpis(d.kpis)}
          emptyText={
            siteId
              ? "El kiosko seleccionado no tiene ventas en este periodo. Elige otro kiosko o cambia el rango de fechas."
              : "No hay ventas de kioskos en este periodo. Prueba con otro rango de fechas."
          }
        >
          {() => null}
        </SalesAsyncBoundary>
      )}
      <KioskHeatmapSection
        startDate={startDate}
        endDate={endDate}
        refreshToken={refreshToken}
        dailySeries={ready ? data.dailySeries : null}
        calendarPeriod={ready ? describePeriod(data.startDate, data.endDate) : ""}
        calendarScope={selected ? selected.name : "todos los kioscos"}
        calendarBusy={ready && loading}
      />
      {ready ? (
        <div {...wrapperProps}>
          <KioskRecent data={data} startDate={startDate} endDate={endDate} />
        </div>
      ) : null}
    </>
  );
}
