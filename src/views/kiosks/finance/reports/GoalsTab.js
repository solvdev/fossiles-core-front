import React, { useMemo, useState } from "react";
import { getKioskCompleteness, getKioskPnl } from "services/kioskFinancialsService";
import { MONTHS_ES, MONTHS_ES_SHORT, fmtAmount, fmtMoney, fmtPct } from "utils/financeFormat";
import useAsyncData from "./useAsyncData";
import { BlockSkeleton, EmptyState, ErrorState, KButton } from "./common";
import { buildCompletenessRows, buildGoalRows, goalAxisMax } from "./financeReportHelpers";
import { breakEvenModeLabel } from "utils/kioskFinancialsGlossary";

const STATUS_INFO = {
  met: { icon: "✓", text: "Meta cumplida", cls: "good" },
  between: { icon: "◆", text: "Sobre equilibrio, bajo meta", cls: "mid" },
  below: { icon: "▼", text: "Bajo equilibrio", cls: "bad" },
  nogoal: { icon: "–", text: "Sin meta", cls: "neutral" },
};

function GoalLegend() {
  return (
    <div className="kfin-goal-legend" aria-label="Leyenda del gráfico">
      <span className="kfin-goal-key"><span className="kfin-goal-swatch kfin-goal-swatch--met" aria-hidden="true" />Meta cumplida (✓)</span>
      <span className="kfin-goal-key"><span className="kfin-goal-swatch kfin-goal-swatch--between" aria-hidden="true" />Sobre equilibrio, bajo meta (◆)</span>
      <span className="kfin-goal-key"><span className="kfin-goal-swatch kfin-goal-swatch--below" aria-hidden="true" />Bajo equilibrio (▼)</span>
      <span className="kfin-goal-key"><span className="kfin-goal-mark kfin-goal-mark--goal" aria-hidden="true" />Meta = 100 %</span>
      <span className="kfin-goal-key"><span className="kfin-goal-mark kfin-goal-mark--pe" aria-hidden="true" />Punto de equilibrio</span>
    </div>
  );
}

function GoalBarRow({ row, axisMax }) {
  const info = STATUS_INFO[row.status];
  const clamp = (r) => Math.max(0, Math.min(r, axisMax)) / axisMax;
  const fillPct = clamp(row.salesRatio) * 100;
  const goalPos = (1 / axisMax) * 100;
  const pePos = row.peRatio === null ? null : clamp(row.peRatio) * 100;
  return (
    <li className="kfin-gbar-row">
      <div className="kfin-gbar-name">
        <span className="kfin-name">{row.name}</span>
        <span className={`kfin-pill kfin-pill--${info.cls}`}>
          <span aria-hidden="true">{info.icon}</span> {info.text}
        </span>
      </div>
      <div className="kfin-gbar-track" aria-hidden="true">
        <div className={`kfin-gbar-fill kfin-gbar-fill--${row.status}`} style={{ width: `${fillPct}%` }} />
        <span className="kfin-goal-mark kfin-goal-mark--goal kfin-gbar-mark" style={{ left: `${goalPos}%` }} />
        {pePos !== null ? (
          <span className="kfin-goal-mark kfin-goal-mark--pe kfin-gbar-mark" style={{ left: `${pePos}%` }} />
        ) : null}
      </div>
      <div className="kfin-gbar-nums">
        <strong>{fmtPct(row.goalPct)}</strong>
        <span>
          {fmtAmount(row.sales, 0)} / meta {fmtAmount(row.goal, 0)}
          {row.breakEven !== null ? ` · PE ${fmtAmount(row.breakEven, 0)}` : ""}
        </span>
      </div>
    </li>
  );
}

function GoalBars({ pnl }) {
  const [asTable, setAsTable] = useState(false);
  const { withGoal, noGoal } = useMemo(() => buildGoalRows(pnl?.sites), [pnl]);
  const axisMax = useMemo(() => goalAxisMax(withGoal), [withGoal]);
  const ticks = useMemo(() => {
    const out = [];
    for (let r = 0; r <= axisMax + 1e-9; r += 0.25) out.push(r);
    return out;
  }, [axisMax]);
  const totals = pnl?.totals;

  return (
    <section className="kfin-card" aria-label="Ventas contra meta y punto de equilibrio">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Ventas vs. meta y punto de equilibrio</h5>
          <div className="kfin-card-sub">
            Cada barra se mide contra la meta de su kiosco (100 %). Ordenado por % de meta.
          </div>
        </div>
        <div className="kfin-card-actions kfin-noprint">
          <KButton aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
            {asTable ? "Ver gráfico" : "Ver como tabla"}
          </KButton>
        </div>
      </header>

      {totals ? (
        <div className="kfin-totalstrip" role="group" aria-label="Totales del periodo">
          <div><span>Ventas</span><strong>{fmtMoney(totals.sales)}</strong></div>
          <div><span>Meta</span><strong>{fmtMoney(totals.goal)}</strong></div>
          <div><span>% de meta</span><strong>{fmtPct(totals.goalPct)}</strong></div>
          <div><span>Punto de equilibrio</span><strong>{fmtMoney(totals.breakEven)}</strong></div>
        </div>
      ) : null}

      {asTable ? (
        <div className="kfin-scroll kfin-scroll--short" tabIndex={0}>
          <table className="kfin-table kfin-table--simple">
            <caption className="sr-only">Ventas, meta y punto de equilibrio por kiosco</caption>
            <thead>
              <tr>
                <th scope="col" className="kfin-sticky-col">Kiosco</th>
                <th scope="col" className="is-num">Ventas</th>
                <th scope="col" className="is-num">Meta</th>
                <th scope="col" className="is-num">% de meta</th>
                <th scope="col" className="is-num">Punto de equilibrio</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              {[...withGoal, ...noGoal].map((r) => (
                <tr key={r.siteId}>
                  <th scope="row" className="kfin-sticky-col">{r.name}</th>
                  <td className="is-num">{fmtAmount(r.sales)}</td>
                  <td className="is-num">{r.goal === null ? "—" : fmtAmount(r.goal)}</td>
                  <td className="is-num">{r.goalPct === null ? "—" : fmtPct(r.goalPct)}</td>
                  <td className="is-num">{r.breakEven === null ? "—" : fmtAmount(r.breakEven)}</td>
                  <td>{STATUS_INFO[r.status].icon} {STATUS_INFO[r.status].text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <GoalLegend />
          {withGoal.length ? (
            <div className="kfin-gbars" role="img" aria-label="Barras horizontales de ventas contra meta por kiosco; el detalle está disponible con Ver como tabla">
              <div className="kfin-gbar-axis" aria-hidden="true">
                {ticks.map((t) => (
                  <span key={t} style={{ left: `${(t / axisMax) * 100}%` }}>{Math.round(t * 100)}%</span>
                ))}
              </div>
              <ul className="kfin-gbar-list">
                {withGoal.map((r) => (
                  <GoalBarRow key={r.siteId} row={r} axisMax={axisMax} />
                ))}
              </ul>
            </div>
          ) : (
            <EmptyState title="Ningún kiosco tiene meta definida este mes">
              Define las metas en Costos por kiosco para ver el cumplimiento.
            </EmptyState>
          )}
          {noGoal.length ? (
            <div className="kfin-nogoal">
              <strong>Sin meta definida:</strong>{" "}
              {noGoal.map((r) => `${r.name} (${fmtMoney(r.sales)})`).join(" · ")}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

const CELL_TEXT = {
  complete: { icon: "✓", label: "Completo" },
  partial: { icon: "!", label: "Incompleto" },
  empty: { icon: "·", label: "Sin datos" },
};

function CompletenessMap({ year, siteIds }) {
  const { data, loading, error, reload } = useAsyncData(() => getKioskCompleteness({ year }), [year]);
  const rows = useMemo(() => buildCompletenessRows(data, siteIds), [data, siteIds]);

  return (
    <section className="kfin-card" aria-label="Completitud de datos">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Completitud de datos {year}</h5>
          <div className="kfin-card-sub">Qué meses tienen ventas (V), costos (C) y meta (M) cargados por kiosco.</div>
        </div>
      </header>
      <div className="kfin-heat-legend">
        <span className="kfin-heat-key"><span className="kfin-cmp-swatch kfin-cmp--complete" aria-hidden="true">✓</span>Completo (V C M)</span>
        <span className="kfin-heat-key"><span className="kfin-cmp-swatch kfin-cmp--partial" aria-hidden="true">!</span>Falta algo (ver letras tachadas)</span>
        <span className="kfin-heat-key"><span className="kfin-cmp-swatch kfin-cmp--empty" aria-hidden="true">·</span>Sin ningún dato</span>
      </div>
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data && loading ? (
        <BlockSkeleton height={200} />
      ) : !rows.length ? (
        <EmptyState title="Sin información de completitud" />
      ) : (
        <div className={`kfin-scroll kfin-scroll--short ${loading ? "kfin-refetching" : ""}`} tabIndex={0} aria-label="Mapa de completitud, desplazable">
          <table className="kfin-table kfin-table--cmp">
            <caption className="sr-only">Completitud de ventas, costos y metas por kiosco y mes en {year}</caption>
            <thead>
              <tr>
                <th scope="col" className="kfin-sticky-col">Kiosco</th>
                {MONTHS_ES_SHORT.map((m) => (
                  <th scope="col" key={m} className="text-center">{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.siteId}>
                  <th scope="row" className="kfin-sticky-col">
                    <span className="kfin-name">{r.name}</span>
                    {r.gaps ? <span className="kfin-flag"> · {r.gaps} incompleto{r.gaps > 1 ? "s" : ""}</span> : null}
                  </th>
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      className={`kfin-cmp kfin-cmp--${c.status}`}
                      title={
                        c.status === "complete"
                          ? `${MONTHS_ES[i]}: completo`
                          : c.status === "empty"
                            ? `${MONTHS_ES[i]}: sin datos`
                            : `${MONTHS_ES[i]}: falta ${c.missing.join(", ")}`
                      }
                    >
                      <span className="sr-only">
                        {MONTHS_ES[i]}: {CELL_TEXT[c.status].label}
                        {c.missing.length && c.status === "partial" ? `, falta ${c.missing.join(", ")}` : ""}
                      </span>
                      <span aria-hidden="true">
                        {c.status === "partial" ? (
                          <span className="kfin-vcm">
                            <b className={c.hasSales ? "" : "is-miss"}>V</b>
                            <b className={c.hasCosts ? "" : "is-miss"}>C</b>
                            <b className={c.hasGoal ? "" : "is-miss"}>M</b>
                          </span>
                        ) : (
                          CELL_TEXT[c.status].icon
                        )}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function GoalsTab({ filters }) {
  const { year, month, siteIds } = filters;
  const { data, loading, error, reload } = useAsyncData(
    () => getKioskPnl({ year, month, siteIds }),
    [year, month, siteIds.join(",")]
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data && loading) return <BlockSkeleton height={380} />;

  const hasSales = (data?.sites || []).some((s) => s.sales);
  return (
    <div className={loading ? "kfin-refetching" : ""} aria-busy={loading}>
      <div className="kfin-context" role="note">
        <strong>Metas y equilibrio</strong> · {MONTHS_ES[month - 1]} {year} · punto de equilibrio con{" "}
        <strong>{breakEvenModeLabel(data && data.breakEvenMode)}</strong>{" "}
        <span className="kfin-muted">(se cambia en Costos por kiosco)</span>
      </div>
      {hasSales ? (
        <GoalBars pnl={data} />
      ) : (
        <EmptyState title="Sin ventas este mes">
          No hay ventas de {MONTHS_ES[month - 1]} {year} para comparar contra la meta.
        </EmptyState>
      )}
      <CompletenessMap year={year} siteIds={siteIds} />
    </div>
  );
}
