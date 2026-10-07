import React, { useMemo } from "react";
import { getSalesOnline } from "services/salesDashboardService";
import SalesAsyncBoundary from "./SalesAsyncBoundary";
import SourceKpiRow from "./SourceKpiRow";
import CompositionBar from "./CompositionBar";
import BreakdownList from "./BreakdownList";
import ProductRankingCard from "./ProductRankingCard";
import RecentSalesTable from "./RecentSalesTable";
import OnlineHeatmap from "./OnlineHeatmap";
import { SourceDailyChart } from "./SalesCharts";
import useSalesQuery from "./useSalesQuery";
import {
  KPI_CONFIG,
  SOURCE_META,
  buildCompositionSegments,
  buildKpiItems,
  describePeriod,
  fmtCount,
  isEmptyKpis,
  statusColor,
  totalSalesLink,
} from "./salesDashboardHelpers";

const META = SOURCE_META.ONLINE;
const RECENT_COLUMNS = [
  { key: "saleDate", label: "Fecha" },
  { key: "reference", label: "Pedido" },
  { key: "productLabel", label: "Producto" },
  { key: "party", label: "Vendedora" },
  { key: "status", label: "Estado" },
  { key: "totalAmount", label: "Total" },
];

function BreakdownCard({ title, subtitle, children, className = "sdash-c3" }) {
  return (
    <section className={`kfin-card ${className}`} aria-label={title}>
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">{title}</h5>
          <div className="kfin-card-sub">{subtitle}</div>
        </div>
      </header>
      {children}
    </section>
  );
}

function OnlineBody({ data, startDate, endDate }) {
  const compareNote = `vs ${describePeriod(data.previousStartDate, data.previousEndDate) || "periodo anterior"}`;
  const items = useMemo(() => buildKpiItems(data.kpis, KPI_CONFIG.ONLINE, { compareNote }), [data.kpis, compareNote]);
  const composition = useMemo(() => buildCompositionSegments(data.kpis), [data.kpis]);
  const period = describePeriod(data.startDate, data.endDate);
  const b = data.breakdowns || {};

  return (
    <>
      <SourceKpiRow items={items} accent={META.color} />

      <div className="sdash-row">
        <div className="sdash-c2">
          <SourceDailyChart
            points={data.dailySeries}
            style={META}
            subtitle={`${period}, ventas online`}
            countLabel="pedidos"
          />
        </div>
        <section className="kfin-card sdash-c1" aria-label="Composición del dinero">
          <header className="kfin-card-head">
            <div>
              <h5 className="kfin-card-title">Composición del dinero</h5>
              <div className="kfin-card-sub">El envío pesa más aquí que en otras fuentes</div>
            </div>
          </header>
          <CompositionBar segments={composition} column />
          <div className="kfin-card-foot">
            Las devoluciones se cuentan como venta hasta que se anulan. Aquí se muestran sin cambios.
          </div>
        </section>
      </div>

      <OnlineHeatmap dailySeries={data.dailySeries} periodLabel={period} noun="venta online" />

      <div className="sdash-row">
        <BreakdownCard title="Por vendedora" subtitle="Venta y pedidos">
          <BreakdownList rows={b.bySeller} color={META.color} metric="amount" countLabel="pedidos" />
        </BreakdownCard>
        <BreakdownCard title="Por red social" subtitle="Origen del pedido">
          <BreakdownList rows={b.bySocialNetwork} metric="share" />
        </BreakdownCard>
        <BreakdownCard title="Método de pago" subtitle="Cómo pagan los clientes">
          <BreakdownList rows={b.byPaymentMethod} metric="share" />
        </BreakdownCard>
        <BreakdownCard title="Estado de los pedidos" subtitle={`${fmtCount(data.kpis?.salesCount)} pedidos del periodo`}>
          <BreakdownList rows={b.byStatus} metric="count" colorFor={(r) => statusColor(r.label)} />
        </BreakdownCard>
      </div>

      <div className="sdash-row">
        <ProductRankingCard className="sdash-c1" rows={data.topProducts} />
        <RecentSalesTable
          className="sdash-c2"
          title="Últimos pedidos"
          subtitle="Los más recientes del periodo"
          columns={RECENT_COLUMNS}
          keyPrefix="online"
          rows={data.recentSales}
          headerLink={{ to: "/admin/online-sales", label: "Abrir ventas online" }}
          link={{ to: totalSalesLink(META.totalSalesChannel, startDate, endDate), label: "Ver todas las ventas" }}
        />
      </div>
    </>
  );
}

export default function OnlineTab({ startDate, endDate, refreshToken }) {
  const query = useSalesQuery(getSalesOnline, { startDate, endDate, refreshToken });
  return (
    <SalesAsyncBoundary
      query={query}
      isEmpty={(d) => isEmptyKpis(d.kpis)}
      emptyText="No hay ventas online en este periodo. Prueba con otro rango de fechas."
    >
      {(data) => <OnlineBody data={data} startDate={startDate} endDate={endDate} />}
    </SalesAsyncBoundary>
  );
}
