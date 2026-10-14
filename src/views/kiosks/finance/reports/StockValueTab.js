import React from "react";
import { getKioskStockValue } from "services/kioskFinancialsService";
import { fmtMoney } from "utils/financeFormat";
import { fmtGeneratedAt } from "utils/kioskStockValueExport";
import useAsyncData from "./useAsyncData";
import { BlockSkeleton, EmptyState, ErrorState } from "./common";

/** Pestaña "Valor del inventario": cuánto dinero en producto tiene hoy cada kiosco. */
export default function StockValueTab({ filters }) {
  const { siteIds } = filters;
  const { data, loading, error, reload } = useAsyncData(() => getKioskStockValue({ siteIds }), [siteIds.join(",")]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data && loading) return <BlockSkeleton height={360} />;
  const sites = data?.sites || [];
  if (!sites.length) {
    return (
      <EmptyState title="Sin inventario en kioscos">
        No hay existencias registradas{siteIds.length ? " en los kioscos seleccionados" : ""}.
      </EmptyState>
    );
  }

  return (
    <div className={loading ? "kfin-refetching" : ""} aria-busy={loading}>
      <div className="kfin-context" role="note">
        <strong>Valor del inventario</strong> · existencias al {fmtGeneratedAt(data.generatedAt)} · a precio de venta
      </div>
      <div className="kfin-scroll" tabIndex={0} aria-label="Valor del inventario por kiosco, desplazable" style={{ maxWidth: 520 }}>
        <table className="kfin-table kfin-table--simple">
          <caption className="sr-only">Valor del inventario actual por kiosco</caption>
          <thead>
            <tr>
              <th scope="col">Kiosco</th>
              <th scope="col" className="is-num">Valor en producto</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.siteId}>
                <th scope="row">{s.siteName}</th>
                <td className="is-num">{fmtMoney(s.saleValue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="is-num">{fmtMoney(data.totals?.saleValue)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
