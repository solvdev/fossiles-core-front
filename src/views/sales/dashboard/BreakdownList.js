import React from "react";
import { fmtMoney } from "utils/financeFormat";
import { barPct, fmtCount, fmtSharePercent } from "./salesDashboardHelpers";

const METRICS = {
  amount: { pick: (r) => Number(r.amount) || 0, text: (r) => fmtMoney(r.amount, { decimals: 0 }) },
  share: { pick: (r) => Number(r.sharePercent) || 0, text: (r) => fmtSharePercent(r.sharePercent, 1) },
  count: { pick: (r) => Number(r.count) || 0, text: (r) => fmtCount(r.count) },
};

/**
 * Lista con barras de un BreakdownRow[] (por vendedora, red social, método de pago, estado, cliente...).
 * metric: 'amount' | 'share' | 'count' define el valor mostrado y la longitud de la barra.
 * countLabel: 'pedidos' -> 'Vendedora 1 · 92 pedidos'. colorFor(row) permite colorear por fila (estados).
 */
export default function BreakdownList({ rows, color = "#3b4a5a", metric = "amount", countLabel, colorFor, limit = 8 }) {
  const m = METRICS[metric] || METRICS.amount;
  const list = (rows || []).slice(0, limit);
  if (!list.length) return <div className="kfin-muted">Sin datos en el periodo.</div>;
  const max = Math.max(...list.map(m.pick));
  return (
    <ul className="sdash-pr-list">
      {list.map((r, i) => (
        <li className="sdash-pr" key={`${r.key ?? r.label}-${i}`}>
          <div className="sdash-pr-name">
            <span>
              {r.label || "Sin dato"}
              {countLabel && r.count ? (
                <span className="sdash-pr-sub">
                  {" "}
                  · {fmtCount(r.count)} {countLabel}
                </span>
              ) : null}
            </span>
            <span
              className="sdash-pr-bar"
              aria-hidden="true"
              style={{ width: `${barPct(m.pick(r), max)}%`, background: colorFor ? colorFor(r) : color }}
            />
          </div>
          <span
            className="sdash-pr-val"
            title={`${fmtMoney(r.amount)} · ${fmtSharePercent(r.sharePercent, 1)} · ${fmtCount(r.count)}`}
          >
            {m.text(r)}
          </span>
        </li>
      ))}
    </ul>
  );
}
