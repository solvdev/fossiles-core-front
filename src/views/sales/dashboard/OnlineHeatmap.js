import React, { useMemo } from "react";
import { HEAT_THRESHOLDS } from "views/kiosks/finance/reports/financeReportHelpers";
import { fmtAmount, fmtMoney, fmtNumber } from "utils/financeFormat";
import {
  HEAT_LABELS,
  WEEKDAYS,
  aggregateWeekdays,
  barPct,
  buildDetailRows,
  buildMonthCalendars,
  buildWeekdayInsight,
  fmtTimesMedian,
  topWeekdayIndexes,
} from "./salesDashboardHelpers";

const ONLINE_FOOT_NOTE = "Es el mismo criterio del módulo de Finanzas kioscos, aplicado a las ventas online.";
const KIOSK_FOOT_NOTE = "Es el mismo criterio de la matriz de ventas diarias del módulo de Finanzas kioscos.";

const cellDescription = (cell) => {
  const base = `${WEEKDAYS[cell.weekday].name} ${cell.day}: ${fmtMoney(cell.amount)}`;
  const ratio = cell.ratio !== null ? `, ${cell.ratio.toFixed(2)} veces la mediana` : "";
  return `${base}${ratio}${cell.isBest ? ", mejor día" : ""}`;
};

/**
 * Leyenda del sombreado (6 tonos + celda sin venta + ★ del mejor día). Se reutiliza en las matrices de kioscos con otro
 * título; `bestLabel` vacío oculta la clave de la estrella.
 */
export function HeatLegend({
  title = "Sombreado vs. mediana:",
  ariaLabel = "Escala de sombreado respecto a la mediana del mes",
  zeroLabel = "0.00 sin venta",
  bestLabel = "mejor día",
}) {
  return (
    <div className="kfin-heat-legend" role="group" aria-label={ariaLabel}>
      <span className="kfin-heat-legend-title">{title}</span>
      {HEAT_LABELS.map((label, i) => (
        <span className="kfin-heat-key" key={label}>
          <span className={`kfin-heat-swatch sdash-h${i}`} aria-hidden="true" />
          {label}
        </span>
      ))}
      <span className="kfin-heat-key">
        <span className="kfin-heat-swatch sdash-hzero" aria-hidden="true" />
        {zeroLabel}
      </span>
      {bestLabel ? (
        <span className="kfin-heat-key">
          <span aria-hidden="true">★</span> {bestLabel}
        </span>
      ) : null}
    </div>
  );
}

function MonthCalendar({ calendar, showTitle }) {
  return (
    <div className="sdash-cal-month">
      {showTitle ? (
        <h6 className="sdash-cal-title">
          {calendar.label}
          {calendar.median ? <span className="kfin-muted"> · mediana {fmtMoney(calendar.median, { decimals: 0 })}</span> : null}
        </h6>
      ) : null}
      <div className="sdash-cal" role="group" aria-label={`Calendario de ${calendar.label} con la venta de cada día`}>
        {WEEKDAYS.map((w) => (
          <div className="sdash-cwd" key={w.letter} aria-hidden="true">
            {w.letter}
          </div>
        ))}
        {calendar.cells.map((cell, i) => {
          if (!cell) return <div className="sdash-cd sdash-cd--empty" key={`e${i}`} />;
          const zero = cell.amount <= 0;
          const cls = [
            "sdash-cd",
            zero ? "sdash-hzero" : cell.bucket !== null ? `sdash-h${cell.bucket}` : "",
            cell.isBest ? "sdash-cd--best" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const description = cellDescription(cell);
          return (
            <div className={cls} key={cell.date} title={description}>
              <span className="sr-only">{description}</span>
              <span className="sdash-dnum" aria-hidden="true">
                {cell.day}
                {cell.isBest ? " ★" : ""}
              </span>
              <span className="sdash-dv" aria-hidden="true">
                {zero ? "0.00" : fmtNumber(cell.amount, 0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Mapa de calor diario (calendario Lun–Dom), promedio por día de la semana con su frase de interpretación y
 * tabla 'Detalle diario'. Todo se calcula en el front desde la serie diaria (días sin venta = 0.00).
 *
 * Rango de varios meses: se muestra un calendario por cada mes que toca el rango (apilados) y cada mes se
 * sombrea contra su propia mediana (la de los días con venta del mes dentro del rango). El promedio por día
 * de la semana y la tabla de detalle cubren todo el rango; el acumulado corre a lo largo del rango completo.
 *
 * `variant`: 'online' (rampa ámbar, la de siempre) o 'kiosk' (rampa verde azulada de Kioskos). Los colores salen del
 * contenedor `.sdash-heat` y su modificador `.sdash-heat--kiosk` (variables CSS), así que Online no cambia.
 * `footNote` reemplaza la última frase del pie (por defecto la de Online).
 */
export default function OnlineHeatmap({ dailySeries, periodLabel, noun = "venta online", variant = "online", footNote }) {
  const calendars = useMemo(() => buildMonthCalendars(dailySeries), [dailySeries]);
  const detail = useMemo(() => buildDetailRows(calendars), [calendars]);
  const weekdays = useMemo(() => aggregateWeekdays(dailySeries), [dailySeries]);
  const insight = useMemo(() => buildWeekdayInsight(weekdays, noun), [weekdays, noun]);
  const strong = useMemo(() => topWeekdayIndexes(weekdays), [weekdays]);

  if (!calendars.length) return null;
  const multi = calendars.length > 1;
  const maxAvg = Math.max(...weekdays.map((w) => w.avg));
  const grandTotal = detail.length ? detail[detail.length - 1].cumulative : 0;
  const closing = footNote || (variant === "kiosk" ? KIOSK_FOOT_NOTE : ONLINE_FOOT_NOTE);

  return (
    <div className={`sdash-heat${variant === "kiosk" ? " sdash-heat--kiosk" : ""}`}>
      <div className="sdash-row">
        <section className="kfin-card sdash-c2" aria-label="Mapa de calor por día">
          <header className="kfin-card-head">
            <div>
              <h5 className="kfin-card-title">Mapa de calor por día</h5>
              <div className="kfin-card-sub">
                {periodLabel} · {noun} por día (Q) · sombreado contra la mediana del mes
              </div>
            </div>
            {!multi && calendars[0].median ? (
              <span className="sdash-badge sdash-badge--heat">
                Mediana del mes: {fmtMoney(calendars[0].median, { decimals: 0 })}
              </span>
            ) : null}
          </header>
          {calendars.map((cal) => (
            <MonthCalendar key={cal.key} calendar={cal} showTitle={multi} />
          ))}
          <HeatLegend />
        </section>

        <section className="kfin-card sdash-c1" aria-label="Promedio por día de la semana">
          <header className="kfin-card-head">
            <div>
              <h5 className="kfin-card-title">Promedio por día de la semana</h5>
              <div className="kfin-card-sub">{noun[0].toUpperCase() + noun.slice(1)} promedio de cada día (Q)</div>
            </div>
          </header>
          <ul className="sdash-pr-list">
            {weekdays.map((w) => (
              <li className="sdash-pr" key={w.index}>
                <div className="sdash-pr-name">
                  <span>{w.name}</span>
                  <span
                    className={`sdash-pr-bar sdash-wbar sdash-wbar--${strong.includes(w.index) ? "strong" : "soft"}`}
                    aria-hidden="true"
                    style={{ width: `${barPct(w.avg, maxAvg)}%` }}
                  />
                </div>
                <span className="sdash-pr-val" title={`${w.days} ${w.days === 1 ? "día" : "días"} en el periodo`}>
                  {fmtNumber(w.avg, 0)}
                </span>
              </li>
            ))}
          </ul>
          {insight ? (
            <div className="sdash-insight" role="note">
              {insight.lead ? <b>{insight.lead}</b> : null}
              {insight.rest}
            </div>
          ) : null}
        </section>
      </div>

      <section className="kfin-card" aria-label="Detalle diario">
        <header className="kfin-card-head">
          <div>
            <h5 className="kfin-card-title">Detalle diario</h5>
            <div className="kfin-card-sub">{periodLabel} · total del día, veces la mediana y acumulado</div>
          </div>
          <span className="kfin-muted kfin-noprint">Desplázate dentro de la tabla</span>
        </header>
        <div className="kfin-scroll sdash-scroll sdash-detail-scroll" tabIndex={0} aria-label="Detalle diario, desplazable">
          <table className="kfin-table kfin-table--simple">
            <caption className="sr-only">{`Detalle diario de ${noun} en ${periodLabel}. Los días sin venta aparecen como 0.00.`}</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col" className="is-num">
                  Total del día
                </th>
                <th scope="col" className="is-num">
                  vs mediana
                </th>
                <th scope="col" className="is-num">
                  Acumulado
                </th>
              </tr>
            </thead>
            <tbody>
              {detail.map((row) => {
                const zero = row.amount <= 0;
                const cls = zero ? "sdash-hzero" : row.bucket !== null ? `sdash-h${row.bucket}` : "";
                return (
                  <tr key={row.date}>
                    <th scope="row">
                      {row.label}
                      {row.isBest ? (
                        <>
                          {" "}
                          <span aria-hidden="true">★</span>
                          <span className="sr-only"> mejor día</span>
                        </>
                      ) : null}
                    </th>
                    <td className={`is-num sdash-hc ${cls}`}>{fmtAmount(row.amount)}</td>
                    <td className="is-num">{fmtTimesMedian(row.ratio)}</td>
                    <td className="is-num kfin-muted">{fmtAmount(row.cumulative)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="is-num">{fmtAmount(grandTotal)}</td>
                <td className="is-num kfin-muted">—</td>
                <td className="is-num kfin-muted">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="kfin-card-foot">
          Umbrales del sombreado (× mediana de los días con venta del mes): {HEAT_THRESHOLDS.join(", ")}. {closing}
        </div>
      </section>
    </div>
  );
}
