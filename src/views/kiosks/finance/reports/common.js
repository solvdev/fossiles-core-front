import React, { useState } from "react";
import { Alert, Button } from "reactstrap";
import { EMPTY_VALUE, fmtDeltaPct, fmtMoney, fmtPct, fmtDelta } from "utils/financeFormat";
import { deltaMeta, fmtCompactMoney, fmtPp } from "./financeReportHelpers";

/* --------------------------------- Botones --------------------------------- */

export function KButton({ active, variant, large, className = "", children, ...rest }) {
  const cls = ["kfin-btn", active ? "is-active" : "", variant ? `kfin-btn--${variant}` : "", large ? "kfin-btn--lg" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function KSeg({ children, ...rest }) {
  return (
    <div className="kfin-btnseg" role="group" {...rest}>
      {children}
    </div>
  );
}

/* --------------------------- Variación con flecha --------------------------- */

/**
 * Chip de variación. Flecha + texto + etiqueta accesible; el color es refuerzo, no el canal único.
 * type: 'pct' (delta = decimal relativo) | 'pp' (delta = puntos porcentuales, decimal).
 */
export function DeltaChip({ delta, absDelta, type = "pct", goodWhen = "up", suffix, emptyLabel }) {
  let value = delta;
  let text;
  if (value === null || value === undefined) {
    if (absDelta !== null && absDelta !== undefined) {
      value = absDelta;
      text = fmtDelta(absDelta);
    } else {
      return (
        <span className="kfin-delta kfin-delta--neutral" title="No hay datos del año base para comparar">
          <span aria-hidden="true">–</span> {emptyLabel || "Sin datos comparables"}
        </span>
      );
    }
  } else {
    text = type === "pp" ? fmtPp(value) : fmtDeltaPct(value);
  }
  const meta = deltaMeta(value, { goodWhen });
  return (
    <span className={`kfin-delta kfin-delta--${meta.kind}`}>
      <span aria-hidden="true">{meta.arrow}</span>
      <span className="sr-only">{meta.srText}: </span>
      <span>{text}</span>
      {suffix ? <span className="kfin-delta-suffix"> {suffix}</span> : null}
    </span>
  );
}

/* ----------------------------------- KPI ----------------------------------- */

export function KpiCard({ kpi, year, baseYear }) {
  const isPct = kpi.kind === "pct";
  const valueText = isPct ? fmtPct(kpi.value) : fmtCompactMoney(kpi.value);
  const baseText = isPct ? fmtPct(kpi.base) : fmtCompactMoney(kpi.base);
  const fullValue = isPct ? fmtPct(kpi.value, 2) : fmtMoney(kpi.value);
  const help =
    kpi.key === "goal"
      ? "Ventas / meta, sólo de kioscos con meta definida en el periodo."
      : kpi.key === "cost"
        ? "Costos variables + costos fijos del periodo (fijos prorrateados por días)."
        : null;
  return (
    <div className="kfin-kpi" role="group" aria-label={`${kpi.label}: ${fullValue}`}>
      <div className="kfin-kpi-label" title={help || undefined}>
        {kpi.label}
      </div>
      <div className="kfin-kpi-value" title={fullValue}>
        {valueText}
      </div>
      <div className="kfin-kpi-delta">
        <DeltaChip
          delta={kpi.delta}
          absDelta={kpi.absDelta}
          type={kpi.deltaType}
          goodWhen={kpi.goodWhen}
          suffix={`vs ${baseYear}`}
        />
      </div>
      <div className="kfin-kpi-base">
        {baseYear}: {baseText === EMPTY_VALUE ? "sin dato" : baseText}
        <span className="sr-only"> (año {year} comparado contra {baseYear})</span>
      </div>
    </div>
  );
}

export function KpiSkeleton({ count = 5 }) {
  return (
    <div className="kfin-kpis" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div className="kfin-kpi" key={i}>
          <div className="kfin-skel" style={{ width: "55%", height: 12 }} />
          <div className="kfin-skel" style={{ width: "80%", height: 30, marginTop: 12 }} />
          <div className="kfin-skel" style={{ width: "45%", height: 18, marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ height = 240 }) {
  return <div className="kfin-skel kfin-skel--block" style={{ height }} aria-hidden="true" />;
}

/* ---------------------------- Estados vacíos / error ---------------------------- */

export function EmptyState({ title = "Sin datos para mostrar", children }) {
  return (
    <div className="kfin-empty" role="status">
      <div className="kfin-empty-icon" aria-hidden="true">
        <i className="nc-icon nc-chart-bar-32" />
      </div>
      <div className="kfin-empty-title">{title}</div>
      {children ? <div className="kfin-empty-text">{children}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <Alert color="danger" className="kfin-error" fade={false}>
      <strong>No se pudo cargar el reporte.</strong> {message}{" "}
      {onRetry ? (
        <Button color="link" className="p-0 align-baseline" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </Alert>
  );
}

/* ------------------------- Tarjeta de gráfico + tabla ------------------------- */

/**
 * Tarjeta con gráfico y alternativa 'Ver como tabla'.
 * columns: [{key, label, align}] · rows: objetos con esas claves.
 */
export function ChartCard({ title, subtitle, ariaLabel, children, columns, rows, actions, footer }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="kfin-card" aria-label={title}>
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">{title}</h5>
          {subtitle ? <div className="kfin-card-sub">{subtitle}</div> : null}
        </div>
        <div className="kfin-card-actions kfin-noprint">
          {actions}
          <KButton onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? "Ver gráfico" : "Ver como tabla"}
          </KButton>
        </div>
      </header>
      {asTable ? (
        <div className="kfin-scroll kfin-scroll--short">
          <table className="kfin-table kfin-table--simple">
            <caption className="sr-only">{ariaLabel || title}</caption>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={c.align === "right" ? "is-num" : ""}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.align === "right" ? "is-num" : ""}>
                      {r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="kfin-chart" role="img" aria-label={ariaLabel || title}>
          {children}
        </div>
      )}
      {footer ? <div className="kfin-card-foot">{footer}</div> : null}
    </section>
  );
}

/* ------------------------------ Cabecera ordenable ------------------------------ */

export function SortTh({ label, sortKey, sort, onSort, align, className = "" }) {
  const active = sort.key === sortKey;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={`${align === "right" ? "is-num" : ""} ${className}`.trim()}>
      <button type="button" className={`kfin-sort ${active ? "is-active" : ""}`} onClick={() => onSort(sortKey)}>
        {label}
        <span aria-hidden="true" className="kfin-sort-icon">
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

/* ---------------------------- Barra de progreso de meta ---------------------------- */

export function GoalProgress({ pct }) {
  if (pct === null || pct === undefined) {
    return (
      <span className="kfin-muted" title="Sin meta definida">
        Sin meta
      </span>
    );
  }
  const width = Math.max(0, Math.min(1, pct)) * 100;
  const level = pct >= 1 ? "met" : pct >= 0.7 ? "mid" : "low";
  const label = pct >= 1 ? "Meta cumplida" : pct >= 0.7 ? "Cerca de la meta" : "Lejos de la meta";
  return (
    <div className="kfin-goal">
      <div
        className="kfin-goal-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label={`Cumplimiento de meta ${fmtPct(pct)}. ${label}`}
      >
        <div className={`kfin-goal-fill kfin-goal-fill--${level}`} style={{ width: `${width}%` }} />
      </div>
      <span className="kfin-goal-text">
        {pct >= 1 ? <span aria-hidden="true">✓ </span> : null}
        {fmtPct(pct)}
      </span>
    </div>
  );
}
