import React, { useMemo } from "react";
import { getKioskPnl } from "services/kioskFinancialsService";
import { MONTHS_ES, fmtAmount, fmtPct } from "utils/financeFormat";
import useAsyncData from "./useAsyncData";
import { BlockSkeleton, EmptyState, ErrorState } from "./common";
import {
  buildMonthlyRows,
  buildPnlRowDefs,
  isBelowBreakEven,
  isNegativeDifference,
  orderFixedCategories,
  siteStatus,
} from "./financeReportHelpers";

const STATUS_TEXT = {
  below: { icon: "▼", text: "Bajo equilibrio", cls: "bad" },
  negative: { icon: "▼", text: "Pérdida", cls: "bad" },
  ok: { icon: "✓", text: "Sobre equilibrio", cls: "good" },
  nodata: { icon: "–", text: "Sin ventas", cls: "neutral" },
};

const SOURCE_TEXT = { HIST: "Excel", POS: "POS", MIXED: "Excel + POS" };

function StatusPill({ site }) {
  const s = STATUS_TEXT[siteStatus(site)];
  return (
    <span className={`kfin-pill kfin-pill--${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span> {s.text}
    </span>
  );
}

function renderCell(def, entity) {
  const v = def.get ? def.get(entity) : null;
  if (v === null || v === undefined) return { text: "—", cls: "kfin-blank" };
  if (def.kind === "pct") {
    const neg = def.key === "margin" && v < 0;
    return { text: fmtPct(v), cls: neg ? "kfin-neg" : "", neg };
  }
  const neg = def.signed && v < -0.005;
  const text = fmtAmount(v);
  return { text: neg ? `▼ ${text}` : text, cls: neg ? "kfin-neg" : "", neg };
}

/** Tabla P&L: filas = conceptos del Excel, columnas = kioscos (+ total). */
export function PnlTable({ sites, totals, categories, showTotal = true, showStatus = true, caption }) {
  const defs = useMemo(
    () => buildPnlRowDefs(categories).filter((d) => showStatus || d.kind !== "status"),
    [categories, showStatus]
  );
  return (
    <div className="kfin-scroll" tabIndex={0} aria-label="Tabla de P&L, desplazable">
      <table className={`kfin-table kfin-table--pnl ${showTotal ? "" : "kfin-table--single"}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="kfin-sticky-col kfin-sticky-col--label">Concepto (Q)</th>
            {showTotal ? <th scope="col" className="kfin-sticky-col2 is-num">Total</th> : null}
            {sites.map((s) => (
              <th scope="col" key={s.siteId} className="is-num kfin-colhead">
                <div className="kfin-name">{s.name}</div>
                <div className="kfin-period">
                  {SOURCE_TEXT[s.source] || s.source || ""}
                  {s.complete === false ? (
                    <span className="kfin-flag" title="Faltan costos, tasas o meta de este mes"> · ⚠ incompleto</span>
                  ) : null}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {defs.map((def) => {
            if (def.kind === "section") {
              return (
                <tr key={def.key} className="kfin-row-section">
                  <th scope="rowgroup" className="kfin-sticky-col kfin-sticky-col--label">
                    {def.label}
                  </th>
                  <td colSpan={sites.length + (showTotal ? 1 : 0)} aria-hidden="true" />
                </tr>
              );
            }
            if (def.kind === "status") {
              return (
                <tr key={def.key} className="kfin-row-status">
                  <th scope="row" className="kfin-sticky-col kfin-sticky-col--label">{def.label}</th>
                  {showTotal ? (
                    <td className="kfin-sticky-col2 is-num">
                      {totals ? <StatusPill site={totals} /> : null}
                    </td>
                  ) : null}
                  {sites.map((s) => (
                    <td key={s.siteId} className="is-num">
                      <StatusPill site={s} />
                    </td>
                  ))}
                </tr>
              );
            }
            const cls = [
              def.subtotal ? "kfin-row-subtotal" : "",
              def.total ? "kfin-row-total" : "",
              def.strong ? "kfin-row-strong" : "",
            ]
              .join(" ")
              .trim();
            const tCell = totals ? renderCell(def, totals) : null;
            return (
              <tr key={def.key} className={cls}>
                <th scope="row" className="kfin-sticky-col kfin-sticky-col--label">
                  {def.label}
                  {def.help === "pe" ? (
                    <span
                      className="kfin-help"
                      tabIndex={0}
                      role="note"
                      aria-label="PE = costos fijos / (1 − (comisión + costo + tarjeta + IVA)). El PE diario usa los días reales del mes."
                      title="PE = costos fijos / (1 − (comisión de venta + costo del producto + tarjeta + IVA)). PE diario = PE / días reales del mes."
                    >
                      {" "}ⓘ
                    </span>
                  ) : null}
                </th>
                {showTotal ? (
                  <td className={`kfin-sticky-col2 is-num ${tCell ? tCell.cls : ""}`}>{tCell ? tCell.text : "—"}</td>
                ) : null}
                {sites.map((s) => {
                  const c = renderCell(def, s);
                  const belowPe = showStatus && def.key === "sales" && isBelowBreakEven(s);
                  return (
                    <td key={s.siteId} className={`is-num ${c.cls} ${belowPe ? "kfin-below" : ""}`}>
                      {c.text}
                      {belowPe ? <span className="sr-only"> (bajo el punto de equilibrio)</span> : null}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyTable({ site, year }) {
  const rows = useMemo(() => buildMonthlyRows(site), [site]);
  const withSales = rows.filter((r) => r.sales);
  return (
    <div className="kfin-scroll kfin-scroll--short" tabIndex={0} aria-label="Resultado mes a mes, desplazable">
      <table className="kfin-table kfin-table--simple">
        <caption className="sr-only">Resultado mensual de {site.name} en {year}</caption>
        <thead>
          <tr>
            <th scope="col" className="kfin-sticky-col">Mes</th>
            <th scope="col" className="is-num">Ventas</th>
            <th scope="col" className="is-num">Costo operativo</th>
            <th scope="col" className="is-num">Diferencia</th>
            <th scope="col" className="is-num">Margen</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.month}>
              <th scope="row" className="kfin-sticky-col">{MONTHS_ES[r.month - 1]}</th>
              <td className="is-num">{r.sales ? fmtAmount(r.sales) : "—"}</td>
              <td className="is-num">{r.sales ? fmtAmount(r.totalCost) : "—"}</td>
              <td className={`is-num ${r.negative ? "kfin-neg" : ""}`}>
                {r.sales ? `${r.negative ? "▼ " : ""}${fmtAmount(r.difference)}` : "—"}
              </td>
              <td className={`is-num ${r.margin !== null && r.margin < 0 ? "kfin-neg" : ""}`}>
                {r.sales && r.margin !== null ? fmtPct(r.margin) : "—"}
              </td>
              <td>
                {r.sales ? (
                  <span className={`kfin-pill kfin-pill--${r.negative ? "bad" : "good"}`}>
                    <span aria-hidden="true">{r.negative ? "▼" : "✓"}</span> {r.negative ? "Pérdida" : "Utilidad"}
                  </span>
                ) : (
                  <span className="kfin-muted">Sin ventas</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="kfin-sticky-col">Año {year}</th>
            <td className="is-num">{fmtAmount(site.sales)}</td>
            <td className="is-num">{fmtAmount(site.totalCost)}</td>
            <td className={`is-num ${isNegativeDifference(site) ? "kfin-neg" : ""}`}>
              {isNegativeDifference(site) ? "▼ " : ""}
              {fmtAmount(site.difference)}
            </td>
            <td className="is-num">{site.margin === null ? "—" : fmtPct(site.margin)}</td>
            <td className="kfin-muted">{withSales.length} meses con ventas</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function PnlTab({ filters, config }) {
  const { year, month, siteIds } = filters;
  const single = siteIds.length === 1;
  const { data, loading, error, reload } = useAsyncData(
    () => getKioskPnl({ year, month: single ? undefined : month, siteIds }),
    [year, single ? "year" : month, siteIds.join(",")]
  );
  const categories = useMemo(() => orderFixedCategories(data, config?.categories), [data, config]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data && loading) return <BlockSkeleton height={420} />;

  const sites = data?.sites || [];
  const monthLabel = single ? `Año ${year}` : `${MONTHS_ES[month - 1]} ${year}`;
  const withSales = sites.filter((s) => s.sales);
  if (!sites.length || (!single && !withSales.length)) {
    return (
      <EmptyState title="Sin datos para este mes">
        No hay ventas de {monthLabel}
        {siteIds.length ? " para los kioscos seleccionados" : ""}. Importa el mes o elige otro periodo.
      </EmptyState>
    );
  }

  return (
    <div className={loading ? "kfin-refetching" : ""} aria-busy={loading}>
      <div className="kfin-context" role="note">
        <strong>P&amp;L {single ? sites[0].name : "por kiosco"}</strong> · {monthLabel} · montos en Q, IVA incluido en ventas
      </div>

      {single ? (
        <>
          <h5 className="kfin-section-title">Mes a mes</h5>
          <MonthlyTable site={sites[0]} year={year} />
          <h5 className="kfin-section-title">Detalle del año</h5>
          <PnlTable
            sites={sites}
            totals={null}
            showTotal={false}
            showStatus={false}
            categories={categories}
            caption={`P&L anual de ${sites[0].name}`}
          />
        </>
      ) : (
        <PnlTable
          sites={sites}
          totals={data.totals}
          categories={categories}
          caption={`P&L por kiosco de ${monthLabel}`}
        />
      )}
      <p className="kfin-foot kfin-muted">
        Diferencia = ventas − costo operativo. Margen = diferencia / ventas. Punto de equilibrio = costos fijos / (1 −
        (comisión de venta + costo del producto + tarjeta + IVA)); el PE diario usa los días reales del mes (el Excel
        usaba 30/31). ▼ marca pérdidas y kioscos con ventas por debajo del punto de equilibrio.
      </p>
    </div>
  );
}
