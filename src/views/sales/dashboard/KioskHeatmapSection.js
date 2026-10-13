import React, { useMemo, useRef, useState } from "react";
import { getKioskHeatmap } from "services/salesDashboardService";
import { BlockSkeleton } from "views/kiosks/finance/reports/common";
import { useScrollAreas } from "views/kiosks/finance/reports/scrollAreas";
import { rangeDayCount } from "./adSpendHelpers";
import {
  CategoryFilter,
  CategorySummaryCard,
  DayMatrixCard,
  InsightsCard,
  WeekdayMatrixCard,
} from "./KioskHeatmapCards";
import OnlineHeatmap from "./OnlineHeatmap";
import SalesAsyncBoundary from "./SalesAsyncBoundary";
import useSalesQuery from "./useSalesQuery";
import {
  FILTER_ALL,
  MAX_HEATMAP_DAYS,
  buildHeatmapModel,
  buildKioskInsights,
  categoryCounts,
  filterSites,
  isHeatmapEmpty,
} from "./kioskHeatmapHelpers";
import { describePeriod } from "./salesDashboardHelpers";

function SectionSkeleton() {
  return (
    <div role="status" aria-label="Cargando mapa de calor de kioscos">
      <BlockSkeleton height={150} />
      <BlockSkeleton height={240} />
    </div>
  );
}

/**
 * 'Mapa de calor de kioscos' (pestaña Kioskos). Va siempre en la misma posición del árbol (entre las tarjetas de arriba
 * y 'Últimas ventas') para no depender de que /dashboard/kiosks cargue, venga vacío o falle.
 *
 * Dos fuentes, cada una con su propio estado:
 *  - Calendario de calor (OnlineHeatmap con la paleta de Kioskos): sale de `dailySeries` de /dashboard/kiosks, así que sigue
 *    el selector de kiosko (todos o el elegido). Si esa consulta no tiene datos simplemente no se dibuja.
 *  - Todo lo demás (insights, resumen por clasificación y las dos matrices) sale de su propio endpoint,
 *    GET /dashboard/kiosks/heatmap, que siempre compara TODOS los kioscos: no depende del selector, se carga con esqueleto,
 *    error con reintento y vacío propios, y se vuelve a pedir al cambiar el rango y con 'Actualizar'.
 * El filtro por clasificación solo afecta a las dos matrices.
 */
export default function KioskHeatmapSection({
  startDate,
  endDate,
  refreshToken,
  dailySeries,
  calendarPeriod,
  calendarScope = "todos los kioscos",
  calendarBusy = false,
}) {
  const rootRef = useRef(null);
  useScrollAreas(rootRef);

  const dayCount = rangeDayCount(startDate, endDate);
  const tooLong = dayCount > MAX_HEATMAP_DAYS;
  const query = useSalesQuery(getKioskHeatmap, { startDate, endDate, refreshToken, enabled: !tooLong });
  const model = useMemo(() => (tooLong ? null : buildHeatmapModel(query.data)), [tooLong, query.data]);
  const ready = Boolean(model) && !isHeatmapEmpty(model);

  const [filter, setFilter] = useState(FILTER_ALL);
  const counts = useMemo(() => categoryCounts(model ? model.sites : []), [model]);
  // Si la clasificación elegida ya no tiene kioscos (otro rango) se muestran todos, sin perder la elección
  const activeFilter = filter !== FILTER_ALL && counts[filter] > 0 ? filter : FILTER_ALL;
  const shown = useMemo(() => (model ? filterSites(model.sites, activeFilter) : []), [model, activeFilter]);
  const insights = useMemo(() => (ready ? buildKioskInsights(model) : []), [ready, model]);

  const period = describePeriod(startDate, endDate);
  const dataPeriod = ready ? describePeriod(model.startDate, model.endDate) || period : period;
  const hasCalendar = Array.isArray(dailySeries) && dailySeries.length > 0;
  const wrapperProps = { className: query.loading ? "kfin-refetching" : "", "aria-busy": query.loading };

  return (
    <section ref={rootRef} className="sdash-kheat sdash-heat--kiosk" aria-labelledby="sdash-kheat-title">
      <header className="sdash-kheat-head">
        <div>
          <h5 id="sdash-kheat-title" className="sdash-kheat-title">
            Mapa de calor de kioscos
          </h5>
          <p className="sdash-kheat-sub">{period} · cuándo se vende más y cómo se comparan los kioscos entre sí</p>
        </div>
      </header>

      <div className="sdash-def" role="note">
        {hasCalendar
          ? `El calendario y el promedio por día siguen el selector de Kiosko (ahora: ${calendarScope}). `
          : ""}
        Las matrices, el resumen por clasificación y los insights comparan siempre todos los kioscos, sin importar ese
        selector.
      </div>

      {ready ? (
        <div {...wrapperProps}>
          <InsightsCard insights={insights} periodLabel={dataPeriod} />
          <CategorySummaryCard model={model} periodLabel={dataPeriod} />
        </div>
      ) : tooLong ? (
        <div className="sdash-def" role="note">
          El mapa de calor por kiosco admite un máximo de {MAX_HEATMAP_DAYS} días y el rango elegido tiene {dayCount}.
          Acorta el rango para ver las matrices, el resumen por clasificación y los insights.
        </div>
      ) : (
        <SalesAsyncBoundary
          query={query}
          isEmpty={(data) => isHeatmapEmpty(buildHeatmapModel(data))}
          emptyTitle="Sin ventas de kioscos en el periodo"
          emptyText="Ningún kiosco tiene ventas en este periodo, así que no hay nada que comparar. Prueba con otro rango de fechas."
          skeleton={<SectionSkeleton />}
        >
          {() => null}
        </SalesAsyncBoundary>
      )}

      {hasCalendar ? (
        <div className={calendarBusy ? "kfin-refetching" : ""} aria-busy={calendarBusy}>
          <OnlineHeatmap
            dailySeries={dailySeries}
            periodLabel={calendarPeriod || period}
            noun="venta de kioscos"
            variant="kiosk"
          />
        </div>
      ) : null}

      {ready ? (
        <div {...wrapperProps}>
          <CategoryFilter value={activeFilter} counts={counts} onChange={setFilter} />
          <WeekdayMatrixCard model={model} sites={shown} filterId={activeFilter} periodLabel={dataPeriod} />
          <DayMatrixCard model={model} sites={shown} filterId={activeFilter} periodLabel={dataPeriod} />
        </div>
      ) : null}
    </section>
  );
}
