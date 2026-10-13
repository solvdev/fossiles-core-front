import React from "react";
import { Link } from "react-router-dom";
import { fmtMoney } from "utils/financeFormat";
import { fmtDmy, fmtQty, statusTone } from "./salesDashboardHelpers";

export function StatusPill({ status }) {
  if (!status) return <span className="kfin-muted">—</span>;
  return <span className={`sdash-status sdash-status--${statusTone(status)}`}>{status}</span>;
}

const RENDERERS = {
  saleDate: (r) => fmtDmy(String(r.saleDate || "").slice(0, 10)),
  reference: (r) => r.reference || "—",
  productLabel: (r) => r.productLabel || "—",
  party: (r) => r.party || "—",
  status: (r) => <StatusPill status={r.status} />,
  quantity: (r) => fmtQty(r.quantity),
  totalAmount: (r) => fmtMoney(r.totalAmount),
};

const NUMERIC = new Set(["quantity", "totalAmount"]);

/**
 * Últimas ventas / pedidos / órdenes (SaleRow[]). columns: [{key, label}] con key de SaleRow.
 * `keyPrefix` = canal para las claves de React (`${channel}-${id}`; el id es numérico, sin prefijo K-/O-/V-).
 * `headerLink` / `link` = { to, label } (el segundo es el 'Ver todas las ventas →' del pie).
 */
export default function RecentSalesTable({
  title,
  subtitle,
  columns,
  rows,
  link,
  headerLink,
  caption,
  keyPrefix = "sale",
  className = "",
}) {
  const list = rows || [];
  return (
    <section className={`kfin-card ${className}`.trim()} aria-label={title}>
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">{title}</h5>
          {subtitle ? <div className="kfin-card-sub">{subtitle}</div> : null}
        </div>
        {headerLink ? (
          <Link className="sdash-link" to={headerLink.to}>
            {headerLink.label} →
          </Link>
        ) : null}
      </header>
      <div className="kfin-scroll sdash-scroll">
        <table className="kfin-table kfin-table--simple sdash-recent">
          <caption className="sr-only">{caption || title}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={NUMERIC.has(c.key) ? "is-num" : ""}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => (
              <tr key={`${keyPrefix}-${r.id ?? r.reference ?? i}`}>
                {columns.map((c) => (
                  <td key={c.key} className={NUMERIC.has(c.key) ? "is-num" : ""}>
                    {RENDERERS[c.key] ? RENDERERS[c.key](r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td colSpan={columns.length} className="kfin-muted text-center py-4">
                  No hay registros en el periodo seleccionado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {link ? (
        <Link className="sdash-link" to={link.to}>
          {link.label} →
        </Link>
      ) : null}
    </section>
  );
}
