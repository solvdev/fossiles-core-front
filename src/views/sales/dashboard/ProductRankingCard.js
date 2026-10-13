import React from "react";
import { fmtMoney } from "utils/financeFormat";
import { barPct, fmtQty } from "./salesDashboardHelpers";

/**
 * Top de productos TERMINADOS por unidades (el backend ya excluye empaques). Siempre lleva el rótulo
 * 'Solo producto terminado · sin empaques'; `scopeNote` agrega otro rótulo (p. ej. 'Solo POS' en Kioskos, donde el
 * histórico de Finanzas kioscos no tiene productos).
 */
export default function ProductRankingCard({
  title = "Productos más vendidos",
  rows,
  color = "#3b4a5a",
  footnote,
  scopeNote,
  className = "",
}) {
  const list = rows || [];
  const max = list.length ? Math.max(...list.map((p) => Number(p.units) || 0)) : 0;
  return (
    <section className={`kfin-card ${className}`.trim()} aria-label={title}>
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">{title}</h5>
          <div className="kfin-card-sub sdash-badges">
            <span className="sdash-badge">Solo producto terminado · sin empaques</span>
            {scopeNote ? <span className="sdash-badge sdash-badge--amber">{scopeNote}</span> : null}
          </div>
        </div>
      </header>
      {list.length ? (
        <ol className="sdash-pr-list">
          {list.map((p, i) => (
            <li className="sdash-pr" key={`${p.productId ?? p.productCode ?? p.productName}-${i}`}>
              <div className="sdash-pr-name">
                <span>{p.productName || p.productCode || "Sin nombre"}</span>
                <span className="sdash-pr-sub sdash-pr-sub--block">{fmtMoney(p.amount)}</span>
                <span
                  className="sdash-pr-bar"
                  aria-hidden="true"
                  style={{ width: `${barPct(Number(p.units) || 0, max)}%`, background: color }}
                />
              </div>
              <span className="sdash-pr-val">
                {fmtQty(p.units)}
                <span className="sr-only"> unidades</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="kfin-muted">Sin ventas de producto terminado en el periodo.</div>
      )}
      <div className="kfin-card-foot">
        {footnote || "Unidades vendidas. Cada producto se agrupa sin importar la talla."}
      </div>
    </section>
  );
}
