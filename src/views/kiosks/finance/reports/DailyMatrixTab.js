import React, { useMemo, useState } from "react";
import { getKioskDailyMatrix } from "services/kioskFinancialsService";
import { MONTHS_ES, fmtAmount } from "utils/financeFormat";
import useAsyncData from "./useAsyncData";
import { BlockSkeleton, EmptyState, ErrorState } from "./common";
import {
  HEAT_STEPS,
  HEAT_THRESHOLDS,
  buildSiteMedians,
  cellValue,
  dayLabel,
  heatBucket,
} from "./financeReportHelpers";

const HEAT_LABELS = ["< 0.5×", "0.5–0.85×", "0.85–1.15×", "1.15–1.5×", "1.5–2×", "≥ 2×"];

function HeatLegend() {
  return (
    <div className="kfin-heat-legend" aria-label="Escala de sombreado respecto a la mediana del propio kiosco">
      <span className="kfin-heat-legend-title">Sombreado vs. mediana del kiosco:</span>
      {HEAT_STEPS.map((s, i) => (
        <span className="kfin-heat-key" key={i}>
          <span className="kfin-heat-swatch" style={{ background: s.bg }} aria-hidden="true" />
          {HEAT_LABELS[i]}
        </span>
      ))}
      <span className="kfin-heat-key">
        <span className="kfin-heat-swatch kfin-heat-swatch--blank" aria-hidden="true" />— sin dato
      </span>
      <span className="kfin-heat-key">
        <span className="kfin-heat-swatch kfin-heat-swatch--zero" aria-hidden="true" />0.00 venta cero
      </span>
    </div>
  );
}

export default function DailyMatrixTab({ filters }) {
  const { year, month, siteIds } = filters;
  const [heat, setHeat] = useState(true);
  const { data, loading, error, reload } = useAsyncData(
    () => getKioskDailyMatrix({ year, month, siteIds }),
    [year, month, siteIds.join(",")]
  );
  const medians = useMemo(() => buildSiteMedians(data), [data]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data && loading) return <BlockSkeleton height={420} />;

  const sites = data?.sites || [];
  const days = data?.days || [];
  const hasAny = days.some((d) => sites.some((s) => cellValue(d, s.siteId) !== null));
  if (!sites.length || !hasAny) {
    return (
      <EmptyState title="Sin ventas diarias">
        No hay ventas registradas en {MONTHS_ES[month - 1]} {year}
        {siteIds.length ? " para los kioscos seleccionados" : ""}.
      </EmptyState>
    );
  }

  return (
    <div className={loading ? "kfin-refetching" : ""} aria-busy={loading}>
      <div className="kfin-context kfin-context--row" role="note">
        <span>
          <strong>Ventas diarias</strong> · {MONTHS_ES[month - 1]} {year} · {sites.length} kioscos · Q con IVA
        </span>
        <label className="kfin-check kfin-noprint">
          <input type="checkbox" checked={heat} onChange={(e) => setHeat(e.target.checked)} /> Sombrear por intensidad
        </label>
      </div>
      {heat ? <HeatLegend /> : null}

      <div className="kfin-scroll kfin-scroll--matrix" tabIndex={0} aria-label="Matriz de ventas diarias, desplazable">
        <table className="kfin-table kfin-table--matrix">
          <caption className="sr-only">
            Ventas diarias por kiosco en {MONTHS_ES[month - 1]} {year}. Una celda con guion significa sin dato; 0.00
            significa venta cero.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="kfin-sticky-col kfin-sticky-col--label">Fecha</th>
              <th scope="col" className="kfin-sticky-col2 is-num">Total día</th>
              <th scope="col" className="is-num">Acumulado</th>
              {sites.map((s) => (
                <th scope="col" key={s.siteId} className="is-num kfin-colhead">
                  <div className="kfin-name">{s.name}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const lab = dayLabel(d.date);
              return (
                <tr key={d.date}>
                  <th scope="row" className="kfin-sticky-col kfin-sticky-col--label" title={lab.full}>
                    {lab.day} <span className="kfin-wd">{lab.wd}</span>
                  </th>
                  <td className="kfin-sticky-col2 is-num kfin-strongnum">{d.total === null || d.total === undefined ? "—" : fmtAmount(d.total)}</td>
                  <td className="is-num kfin-cum">{d.cumulative === null || d.cumulative === undefined ? "—" : fmtAmount(d.cumulative)}</td>
                  {sites.map((s) => {
                    const v = cellValue(d, s.siteId);
                    if (v === null) {
                      return (
                        <td key={s.siteId} className="is-num kfin-blank" title="Sin dato">
                          <span aria-hidden="true">—</span>
                          <span className="sr-only">sin dato</span>
                        </td>
                      );
                    }
                    const b = heat ? heatBucket(v, medians[s.siteId]) : null;
                    const step = b === null ? null : HEAT_STEPS[b];
                    return (
                      <td
                        key={s.siteId}
                        className={`is-num ${v === 0 ? "kfin-zero" : ""} ${step && step.dark ? "kfin-heat-dark" : ""}`}
                        style={step ? { background: step.bg } : undefined}
                        title={
                          b === null
                            ? undefined
                            : `${fmtAmount(v)} = ${(v / medians[s.siteId]).toFixed(2)}× la mediana del kiosco`
                        }
                      >
                        {fmtAmount(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="kfin-sticky-col kfin-sticky-col--label">Total</th>
              <td className="kfin-sticky-col2 is-num">{fmtAmount(data.grandTotal)}</td>
              <td className="is-num kfin-muted">—</td>
              {sites.map((s) => {
                const t = data.siteTotals?.[s.siteId] ?? data.siteTotals?.[String(s.siteId)];
                return (
                  <td key={s.siteId} className="is-num">
                    {t === null || t === undefined ? "—" : fmtAmount(t)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="kfin-foot kfin-muted">
        Umbrales del sombreado (× mediana de días con venta del kiosco): {HEAT_THRESHOLDS.join(", ")}. El sombreado
        compara cada kiosco contra sí mismo, no contra otros kioscos.
      </p>
    </div>
  );
}
