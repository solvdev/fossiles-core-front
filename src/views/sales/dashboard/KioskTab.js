import React, { useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { fmtMoney } from "utils/financeFormat";
import { getSalesKiosks } from "services/salesDashboardService";
import KioskYoYCard from "views/sales/KioskYoYCard";
import SalesAsyncBoundary from "./SalesAsyncBoundary";
import SourceKpiRow from "./SourceKpiRow";
import CompositionBar from "./CompositionBar";
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
  fmtCount,
  fmtSharePercent,
  isEmptyKpis,
  segmentsFromBreakdown,
  totalSalesLink,
} from "./salesDashboardHelpers";

const META = SOURCE_META.KIOSKO;
const RECENT_COLUMNS = [
  { key: "saleDate", label: "Fecha" },
  { key: "party", label: "Kiosko" },
  { key: "reference", label: "Ticket" },
  { key: "productLabel", label: "Producto" },
  { key: "totalAmount", label: "Total" },
];

function KioskRanking({ rows }) {
  const list = rows || [];
  const max = list.length ? Math.max(...list.map((r) => Number(r.amount) || 0)) : 0;
  return (
    <section className="kfin-card sdash-c2" aria-label="Ranking por kiosko">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Ranking por kiosko</h5>
          <div className="kfin-card-sub">Ordenado por venta del periodo</div>
        </div>
        <Link className="sdash-link" to="/admin/kiosk-sales">
          Abrir POS de kioskos →
        </Link>
      </header>
      <div className="kfin-scroll sdash-scroll">
        <table className="kfin-table kfin-table--simple">
          <caption className="sr-only">Tickets, venta y participación por kiosko</caption>
          <thead>
            <tr>
              <th scope="col">Kiosko</th>
              <th scope="col" className="is-num">Tickets</th>
              <th scope="col" className="is-num">Venta</th>
              <th scope="col" className="is-num">% del total</th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={`${r.key ?? r.label}-${i}`}>
                <th scope="row">
                  {r.label || "Sin dato"}
                  <span
                    className="sdash-mini"
                    aria-hidden="true"
                    style={{ width: `${barPct(Number(r.amount) || 0, max)}%`, background: META.color }}
                  />
                </th>
                <td className="is-num">{fmtCount(r.count)}</td>
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

function KioskBody({ data, startDate, endDate, filtered }) {
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
              <div className="kfin-card-sub">Dinero del periodo y forma de pago</div>
            </div>
          </header>
          <CompositionBar segments={composition} />
          <h6 className="sdash-subhead">Forma de pago</h6>
          <CompositionBar segments={payment} showAmount={false} />
        </section>
      </div>

      <div className="sdash-row">
        <KioskRanking rows={data.breakdowns?.byKiosk} />
        <ProductRankingCard className="sdash-c1" rows={data.topProducts} color="#3b4a5a" />
      </div>

      <div className="sdash-yoy">
        <KioskYoYCard startDate={startDate} endDate={endDate} />
      </div>

      <RecentSalesTable
        title="Últimas ventas"
        subtitle={`Las ${(data.recentSales || []).length} más recientes del periodo`}
        columns={RECENT_COLUMNS}
        keyPrefix="kiosko"
        rows={data.recentSales}
        link={{ to: totalSalesLink(META.totalSalesChannel, startDate, endDate), label: "Ver todas las ventas" }}
      />
    </>
  );
}

export default function KioskTab({ startDate, endDate, kioskLocationId, onKioskChange, refreshToken }) {
  const query = useSalesQuery(getSalesKiosks, { startDate, endDate, kioskLocationId, refreshToken });
  // Las opciones del selector no dependen del kiosko elegido (el backend las manda siempre completas); se conservan
  // mientras recarga o si el kiosko elegido no tiene ventas, para que siempre se pueda volver a 'Todos'.
  const optionsRef = useRef([]);
  if (query.data && Array.isArray(query.data.kioskOptions)) optionsRef.current = query.data.kioskOptions;
  const options = buildKioskOptions(optionsRef.current, kioskLocationId);

  return (
    <>
      <div className="kfin-filters kfin-noprint sdash-tabfilters">
        <div className="kfin-field">
          <label htmlFor="sdash-kiosk">Kiosko</label>
          <select
            id="sdash-kiosk"
            className="form-control"
            value={kioskLocationId || ""}
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
      <SalesAsyncBoundary
        query={query}
        isEmpty={(d) => isEmptyKpis(d.kpis)}
        emptyText={
          kioskLocationId
            ? "El kiosko seleccionado no tiene ventas en este periodo. Elige otro kiosko o cambia el rango de fechas."
            : "No hay ventas de kioskos en este periodo. Prueba con otro rango de fechas."
        }
      >
        {(data) => <KioskBody data={data} startDate={startDate} endDate={endDate} filtered={!!kioskLocationId} />}
      </SalesAsyncBoundary>
    </>
  );
}
