import React, { useMemo } from "react";
import { fmtMoney, fmtPct } from "utils/financeFormat";
import { HEAT_THRESHOLDS } from "views/kiosks/finance/reports/financeReportHelpers";
import { KButton, KSeg } from "views/kiosks/finance/reports/common";
import CategoryBadge from "./CategoryBadge";
import { HeatLegend } from "./OnlineHeatmap";
import { GrowthChip } from "./SourceKpiRow";
import {
  CATEGORY_FILTERS,
  FILTER_ALL,
  FILTER_NONE,
  MAX_DAY_MATRIX_DAYS,
  buildCategorySummary,
  buildDayMatrix,
  buildWeekdayMatrix,
  canShowDayMatrix,
  fmtCellAmount,
  heatClass,
  totalRowLabel,
} from "./kioskHeatmapHelpers";
import { SOURCE_META, WEEKDAYS, barPct, fmtCount } from "./salesDashboardHelpers";

const THRESHOLDS_TEXT = HEAT_THRESHOLDS.join(", ");
const TONE_TAGS = { good: "A favor", warn: "Atención", neutral: "" };

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const cellClass = (...names) => names.filter(Boolean).join(" ");

/* ------------------------------------------------------------------ */
/* Insights                                                             */
/* ------------------------------------------------------------------ */

/** Frases calculadas con la venta diaria de todos los kioscos (buildKioskInsights). El tono no depende solo del color. */
export function InsightsCard({ insights, periodLabel }) {
  return (
    <section className="kfin-card" aria-label="Insights del mapa de calor">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Insights del periodo</h5>
          <div className="kfin-card-sub">{periodLabel} · conclusiones con la venta diaria de todos los kioscos</div>
        </div>
      </header>
      {insights.length ? (
        <ul className="sdash-ins-list">
          {insights.map((insight) => (
            <li key={insight.id} className={`sdash-ins sdash-ins--${insight.tone}`}>
              {TONE_TAGS[insight.tone] ? <span className="sdash-ins-tag">{TONE_TAGS[insight.tone]}</span> : null}
              <span className="sdash-ins-text">{insight.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="kfin-muted">
          Todavía no hay datos suficientes para sacar conclusiones en este periodo. Prueba con un rango más largo.
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Por clasificación                                                    */
/* ------------------------------------------------------------------ */

function StrongestDay({ strongest }) {
  if (!strongest) return <span className="sdash-sub">—</span>;
  return (
    <>
      {strongest.name}
      <span className="sdash-sub"> · {fmtMoney(strongest.avg, { decimals: 0 })} por día</span>
    </>
  );
}

/** Tabla 'Por clasificación' (A, B, C y sin clasificar) con una fila de total. */
export function CategorySummaryCard({ model, periodLabel }) {
  const summary = useMemo(() => buildCategorySummary(model), [model]);
  const maxTotal = Math.max(0, ...summary.rows.map((r) => r.total));
  return (
    <section className="kfin-card" aria-label="Por clasificación">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Por clasificación</h5>
          <div className="kfin-card-sub">
            {periodLabel} · la clasificación A, B o C la asigna Finanzas kioscos (Costos por kiosco)
          </div>
        </div>
      </header>
      <div className="kfin-scroll sdash-scroll" tabIndex={0} aria-label="Resumen por clasificación, desplazable">
        <table className="kfin-table kfin-table--simple sdash-cat-table">
          <caption className="sr-only">
            Kioscos, venta, participación, promedio por kiosco, variación contra el periodo anterior y día de la semana
            más fuerte de cada clasificación
          </caption>
          <thead>
            <tr>
              <th scope="col">Clasificación</th>
              <th scope="col" className="is-num">
                Kioscos
              </th>
              <th scope="col" className="is-num">
                Venta
              </th>
              <th scope="col" className="is-num">
                % del total
              </th>
              <th scope="col" className="is-num">
                Promedio por kiosco
              </th>
              <th scope="col" className="is-num">
                vs periodo anterior
              </th>
              <th scope="col">Día fuerte</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  <CategoryBadge category={row.category} />
                  <span
                    className="sdash-mini"
                    aria-hidden="true"
                    style={{ width: `${barPct(row.total, maxTotal)}%`, background: SOURCE_META.KIOSKO.color }}
                  />
                </th>
                <td className="is-num">{fmtCount(row.kioskCount)}</td>
                <td className="is-num kfin-strongnum">{fmtMoney(row.total)}</td>
                <td className="is-num">{fmtPct(row.share, 1)}</td>
                <td className="is-num">{fmtMoney(row.avgPerKiosk)}</td>
                <td className="is-num">
                  <GrowthChip delta={row.growth} emptyLabel="Sin comparar" />
                </td>
                <td>
                  <StrongestDay strongest={row.strongest} />
                </td>
              </tr>
            ))}
          </tbody>
          {summary.total ? (
            <tfoot>
              <tr>
                <th scope="row">Todos los kioscos</th>
                <td className="is-num">{fmtCount(summary.total.kioskCount)}</td>
                <td className="is-num">{fmtMoney(summary.total.total)}</td>
                <td className="is-num">{fmtPct(summary.total.share, 1)}</td>
                <td className="is-num">{fmtMoney(summary.total.avgPerKiosk)}</td>
                <td className="is-num">
                  <GrowthChip delta={summary.total.growth} emptyLabel="Sin comparar" />
                </td>
                <td>
                  <StrongestDay strongest={summary.total.strongest} />
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      <div className="kfin-card-foot">
        Promedio por kiosco = venta ÷ kioscos de la clasificación. Día fuerte = día de la semana con mayor venta promedio
        de la clasificación. Un kiosco sin clasificar todavía no tiene A, B ni C en Finanzas kioscos.
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Filtro por clasificación                                             */
/* ------------------------------------------------------------------ */

const filterDescription = (id, count) => {
  if (id === FILTER_ALL) return `Todas: ${plural(count, "kiosco", "kioscos")}`;
  if (id === FILTER_NONE) return `Sin clasificar: ${plural(count, "kiosco", "kioscos")}`;
  return `Cat. ${id}: ${plural(count, "kiosco", "kioscos")}`;
};

/** Todas / A / B / C / Sin clasificar. Un filtro sin kioscos queda deshabilitado (la matriz no se quedaría vacía). */
export function CategoryFilter({ value, counts, onChange }) {
  return (
    <div className="sdash-kheat-filter kfin-noprint">
      <span className="kfin-label" id="sdash-kheat-filter-label">
        Clasificación
      </span>
      <KSeg aria-labelledby="sdash-kheat-filter-label">
        {CATEGORY_FILTERS.map((filter) => {
          const count = counts[filter.id] || 0;
          const description = filterDescription(filter.id, count);
          return (
            <KButton
              key={filter.id}
              active={value === filter.id}
              aria-pressed={value === filter.id}
              aria-label={description}
              title={description}
              disabled={filter.id !== FILTER_ALL && count === 0}
              onClick={() => onChange(filter.id)}
            >
              {filter.label}
            </KButton>
          );
        })}
      </KSeg>
      <span className="kfin-hint">
        Filtra las dos matrices de abajo. Los insights y el resumen siempre incluyen todos los kioscos.
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matrices                                                             */
/* ------------------------------------------------------------------ */

function MatrixHead({ children }) {
  return (
    <>
      <th scope="col" className="sdash-mx-c1">
        Kiosko
      </th>
      <th scope="col" className="sdash-mx-c2" title="Clasificación de ventas del kiosco (A, B o C)">
        Cat.
      </th>
      <th scope="col" className="sdash-mx-c3 is-num" title="Venta del periodo">
        Total
      </th>
      {children}
    </>
  );
}

function MatrixRowHead({ site }) {
  return (
    <>
      <th scope="row" className="sdash-mx-c1">
        {site.name}
      </th>
      <td className="sdash-mx-c2">
        <CategoryBadge category={site.category} />
      </td>
    </>
  );
}

function WeekdayCell({ cell, siteName, weekday }) {
  if (cell.avg === null) {
    return (
      <td className="sdash-mx-cell sdash-mx-na" title={`${weekday.name} no cae en el rango`}>
        —
      </td>
    );
  }
  const ratio = cell.ratio !== null ? ` = ${cell.ratio.toFixed(2)}× el promedio del kiosco` : "";
  const title = `${siteName} · ${weekday.plural}: promedio de ${fmtMoney(cell.avg)} en ${plural(
    cell.occurrences,
    "día",
    "días"
  )}${ratio}${cell.isBest ? ", mejor día de la semana" : ""}`;
  return (
    <td className={cellClass("sdash-mx-cell", heatClass(cell.avg, cell.bucket), cell.isBest && "sdash-mx-best")} title={title}>
      {fmtCellAmount(cell.avg)}
      {cell.isBest ? (
        <>
          <span aria-hidden="true"> ★</span>
          <span className="sr-only"> mejor día</span>
        </>
      ) : null}
    </td>
  );
}

/**
 * Matriz 'Kioscos por día de la semana': una fila por kiosco, Lun…Dom = venta promedio por ocurrencia de ese día en el
 * rango (los días sin venta cuentan como 0), sombreada contra el promedio del propio kiosco; ★ = su mejor día.
 * La fila de abajo suma los kioscos mostrados (los del filtro activo).
 */
export function WeekdayMatrixCard({ model, sites, filterId, periodLabel }) {
  const matrix = useMemo(() => buildWeekdayMatrix(model, sites), [model, sites]);
  const footerLabel = totalRowLabel(filterId);
  return (
    <section className="kfin-card" aria-label="Kioscos por día de la semana">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Kioscos por día de la semana</h5>
          <div className="kfin-card-sub">
            {periodLabel} · venta promedio (Q) de cada día de la semana · sombreado contra el promedio de cada kiosco
          </div>
        </div>
        <span className="kfin-muted kfin-noprint">Desplázate dentro de la tabla</span>
      </header>
      <HeatLegend
        title="Sombreado vs. promedio del kiosco:"
        ariaLabel="Escala de sombreado respecto al promedio del propio kiosco"
        bestLabel="mejor día de la semana del kiosco"
      />
      <div
        className="kfin-scroll sdash-mx-scroll"
        tabIndex={0}
        aria-label="Kioscos por día de la semana, desplazable"
      >
        <table className="kfin-table kfin-table--matrix sdash-mx">
          <caption className="sr-only">
            Venta promedio por día de la semana de cada kiosco en {periodLabel}, en quetzales. Cada celda promedia todas
            las veces que ese día cae en el rango, contando los días sin venta como 0.00. La estrella marca el mejor día
            de cada kiosco.
          </caption>
          <thead>
            <tr>
              <MatrixHead>
                {WEEKDAYS.map((weekday, i) => (
                  <th
                    scope="col"
                    key={weekday.letter}
                    className="is-num sdash-mx-day"
                    title={`${weekday.name}: ${plural(matrix.occurrences[i], "día", "días")} en el rango`}
                  >
                    {weekday.letter}
                    <span className="sdash-mx-wd">{plural(matrix.occurrences[i], "día", "días")}</span>
                  </th>
                ))}
              </MatrixHead>
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.site.key}>
                <MatrixRowHead site={row.site} />
                <td className="sdash-mx-c3 is-num">{fmtCellAmount(row.total)}</td>
                {row.cells.map((cell) => (
                  <WeekdayCell key={cell.index} cell={cell} siteName={row.site.name} weekday={WEEKDAYS[cell.index]} />
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sdash-mx-c1">
                {footerLabel}
              </th>
              <td className="sdash-mx-c2" />
              <td className="sdash-mx-c3 is-num">{fmtCellAmount(matrix.footer.total)}</td>
              {matrix.footer.cells.map((cell) => (
                <WeekdayCell key={cell.index} cell={cell} siteName={footerLabel} weekday={WEEKDAYS[cell.index]} />
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="kfin-card-foot">
        Umbrales del sombreado (× promedio de los siete días del kiosco): {THRESHOLDS_TEXT}. Cada kiosco se compara contra
        sí mismo, no contra otros kioscos. Las columnas indican cuántas veces cae cada día en el rango.
      </div>
    </section>
  );
}

const dmy = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/**
 * Matriz 'Kioscos por día': una fila por kiosco y una columna por cada día del rango (hasta MAX_DAY_MATRIX_DAYS),
 * sombreada contra la mediana de los días con venta del propio kiosco. Con un rango más largo solo muestra la nota.
 */
export function DayMatrixCard({ model, sites, filterId, periodLabel }) {
  const show = canShowDayMatrix(model);
  const matrix = useMemo(() => (show ? buildDayMatrix(model, sites) : null), [show, model, sites]);
  const footerLabel = totalRowLabel(filterId);
  return (
    <section className="kfin-card" aria-label="Kioscos por día">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Kioscos por día</h5>
          <div className="kfin-card-sub">
            {periodLabel} · venta de cada kiosco, día por día (Q) · sombreado contra la mediana de cada kiosco
          </div>
        </div>
        {matrix ? <span className="kfin-muted kfin-noprint">Desplázate dentro de la tabla</span> : null}
      </header>
      {!matrix ? (
        <div className="sdash-def" role="note">
          Elige un rango de hasta {MAX_DAY_MATRIX_DAYS} días para ver kiosco por día. El rango actual tiene{" "}
          {model.days.length} días; la matriz por día de la semana y el resumen de arriba sí cubren todo el rango.
        </div>
      ) : (
        <>
          <HeatLegend
            title="Sombreado vs. mediana del kiosco:"
            ariaLabel="Escala de sombreado respecto a la mediana del propio kiosco"
            bestLabel=""
          />
          <div className="kfin-scroll sdash-mx-scroll" tabIndex={0} aria-label="Kioscos por día, desplazable">
            <table className="kfin-table kfin-table--matrix sdash-mx">
              <caption className="sr-only">
                Venta diaria de cada kiosco en {periodLabel}, en quetzales. Los días sin venta aparecen como 0.00 y no se
                sombrean.
              </caption>
              <thead>
                <tr>
                  <MatrixHead>
                    {matrix.columns.map((col) => (
                      <th
                        scope="col"
                        key={col.date}
                        className="is-num sdash-mx-day"
                        title={`${col.weekdayName} ${dmy(col.date)}`}
                      >
                        {col.label}
                        <span className="sdash-mx-wd">{col.wd}</span>
                      </th>
                    ))}
                  </MatrixHead>
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map((row) => (
                  <tr key={row.site.key}>
                    <MatrixRowHead site={row.site} />
                    <td className="sdash-mx-c3 is-num">{fmtCellAmount(row.total)}</td>
                    {row.cells.map((cell, i) => {
                      const ratio = cell.ratio !== null ? ` = ${cell.ratio.toFixed(2)}× la mediana del kiosco` : "";
                      return (
                        <td
                          key={cell.date}
                          className={cellClass("sdash-mx-cell", heatClass(cell.amount, cell.bucket))}
                          title={`${row.site.name} · ${matrix.columns[i].weekdayName} ${dmy(cell.date)}: ${fmtMoney(
                            cell.amount
                          )}${ratio}`}
                        >
                          {fmtCellAmount(cell.amount)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="sdash-mx-c1">
                    {footerLabel}
                  </th>
                  <td className="sdash-mx-c2" />
                  <td className="sdash-mx-c3 is-num">{fmtCellAmount(matrix.footer.total)}</td>
                  {matrix.footer.cells.map((cell, i) => {
                    const ratio = cell.ratio !== null ? ` = ${cell.ratio.toFixed(2)}× su mediana` : "";
                    return (
                      <td
                        key={cell.date}
                        className={cellClass("sdash-mx-cell", heatClass(cell.amount, cell.bucket))}
                        title={`${footerLabel} · ${matrix.columns[i].weekdayName} ${dmy(cell.date)}: ${fmtMoney(
                          cell.amount
                        )}${ratio}`}
                      >
                        {fmtCellAmount(cell.amount)}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="kfin-card-foot">
            Umbrales del sombreado (× mediana de los días con venta de cada kiosco): {THRESHOLDS_TEXT}. Cada kiosco se
            compara contra sí mismo, no contra otros kioscos; la fila de abajo, contra su propia mediana. Los días sin
            venta aparecen como 0.00 y no se sombrean.
          </div>
        </>
      )}
    </section>
  );
}
