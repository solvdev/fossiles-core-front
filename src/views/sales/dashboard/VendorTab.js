import React, { useMemo } from "react";
import { getSalesVendor } from "services/salesDashboardService";
import SalesAsyncBoundary from "./SalesAsyncBoundary";
import SourceKpiRow from "./SourceKpiRow";
import CompositionBar from "./CompositionBar";
import BreakdownList from "./BreakdownList";
import ProductRankingCard from "./ProductRankingCard";
import RecentSalesTable from "./RecentSalesTable";
import { WeeklyBarsChart } from "./SalesCharts";
import useSalesQuery from "./useSalesQuery";
import {
  KPI_CONFIG,
  SOURCE_META,
  buildCompositionSegments,
  buildKpiItems,
  buildWeeklyBars,
  describePeriod,
  fmtCount,
  isEmptyKpis,
  orderTypeStyle,
  segmentsFromBreakdown,
  statusColor,
  totalSalesLink,
} from "./salesDashboardHelpers";

const META = SOURCE_META.VENDOR;
const RECENT_COLUMNS = [
  { key: "saleDate", label: "Fecha de inicio" },
  { key: "reference", label: "Orden" },
  { key: "party", label: "Cliente" },
  { key: "status", label: "Estado" },
  { key: "quantity", label: "Unidades" },
  { key: "totalAmount", label: "Total estimado" },
];

function VendorBody({ data, startDate, endDate }) {
  const compareNote = `vs ${describePeriod(data.previousStartDate, data.previousEndDate) || "periodo anterior"}`;
  const items = useMemo(() => buildKpiItems(data.kpis, KPI_CONFIG.VENDOR, { compareNote }), [data.kpis, compareNote]);
  const composition = useMemo(() => buildCompositionSegments(data.kpis), [data.kpis]);
  const orderTypes = useMemo(
    () => segmentsFromBreakdown(data.breakdowns?.byOrderType, orderTypeStyle),
    [data.breakdowns]
  );
  // Semanas de 7 días desde el inicio del periodo, derivadas de la serie diaria.
  const weeks = useMemo(() => buildWeeklyBars(data.dailySeries), [data.dailySeries]);
  const period = describePeriod(data.startDate, data.endDate);
  const b = data.breakdowns || {};

  return (
    <>
      <div className="sdash-def" role="note">
        Órdenes de venta de Luis Felipe, contadas por fecha de inicio. El total es un estimado: precio de vendedor por
        unidad, más empaque y envío de la orden.
      </div>

      <SourceKpiRow items={items} accent={META.color} />

      <div className="sdash-row">
        <div className="sdash-c2">
          <WeeklyBarsChart weeks={weeks} color={META.color} subtitle={`${period}, órdenes por fecha de inicio`} />
        </div>
        <section className="kfin-card sdash-c1" aria-label="Composición del dinero">
          <header className="kfin-card-head">
            <div>
              <h5 className="kfin-card-title">Composición del dinero</h5>
              <div className="kfin-card-sub">Empaque y envío vienen dentro de la orden</div>
            </div>
          </header>
          <CompositionBar segments={composition} column />
          <h6 className="sdash-subhead">Tipo de orden</h6>
          <CompositionBar segments={orderTypes} column />
        </section>
      </div>

      <div className="sdash-row">
        <section className="kfin-card sdash-c3" aria-label="Por cliente">
          <header className="kfin-card-head">
            <div>
              <h5 className="kfin-card-title">Por cliente</h5>
              <div className="kfin-card-sub">Venta y órdenes</div>
            </div>
          </header>
          <BreakdownList rows={b.byCustomer} color={META.color} metric="amount" countLabel="órdenes" />
        </section>
        <section className="kfin-card sdash-c3" aria-label="Estado de las órdenes">
          <header className="kfin-card-head">
            <div>
              <h5 className="kfin-card-title">Estado de las órdenes</h5>
              <div className="kfin-card-sub">{fmtCount(data.kpis?.salesCount)} órdenes del periodo</div>
            </div>
          </header>
          <BreakdownList rows={b.byStatus} metric="count" colorFor={(r) => statusColor(r.label)} />
        </section>
        <ProductRankingCard className="sdash-c3" rows={data.topProducts} />
      </div>

      <RecentSalesTable
        title="Últimas órdenes"
        subtitle="Las más recientes del periodo"
        columns={RECENT_COLUMNS}
        keyPrefix="vendedor"
        rows={data.recentSales}
        headerLink={{ to: "/admin/opv-shipments", label: "Abrir envíos OPV" }}
        link={{ to: totalSalesLink(META.totalSalesChannel, startDate, endDate), label: "Ver todas las ventas" }}
      />
    </>
  );
}

export default function VendorTab({ startDate, endDate, refreshToken }) {
  const query = useSalesQuery(getSalesVendor, { startDate, endDate, refreshToken });
  return (
    <SalesAsyncBoundary
      query={query}
      isEmpty={(d) => isEmptyKpis(d.kpis)}
      emptyText="No hay órdenes de Vendedor LF en este periodo. Prueba con otro rango de fechas."
    >
      {(data) => <VendorBody data={data} startDate={startDate} endDate={endDate} />}
    </SalesAsyncBoundary>
  );
}
