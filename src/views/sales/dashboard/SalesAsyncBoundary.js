import React from "react";
import { BlockSkeleton, EmptyState, ErrorState, KpiSkeleton } from "views/kiosks/finance/reports/common";

export function TabSkeleton({ kpis = 5 }) {
  return (
    <div role="status" aria-label="Cargando datos">
      <KpiSkeleton count={kpis} />
      <div className="sdash-row">
        <div className="sdash-c2">
          <BlockSkeleton height={320} />
        </div>
        <div className="sdash-c1">
          <BlockSkeleton height={320} />
        </div>
      </div>
      <BlockSkeleton height={240} />
    </div>
  );
}

/**
 * Estados de carga de una pestaña: error con reintento, esqueleto en la primera carga, vacío y,
 * mientras recarga con datos previos, el contenido atenuado (kfin-refetching).
 * `children` recibe los datos y devuelve el contenido. `skeleton` reemplaza el esqueleto de pestaña completa
 * (para secciones más pequeñas).
 */
export default function SalesAsyncBoundary({
  query,
  isEmpty,
  emptyTitle,
  emptyText,
  skeletonKpis = 5,
  skeleton,
  children,
}) {
  const { data, loading, error, reload } = query;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data && loading) return skeleton || <TabSkeleton kpis={skeletonKpis} />;
  if (!data) return null;
  if (isEmpty && isEmpty(data)) {
    return <EmptyState title={emptyTitle || "Sin ventas en el periodo"}>{emptyText}</EmptyState>;
  }
  return (
    <div className={loading ? "kfin-refetching" : ""} aria-busy={loading}>
      {children(data)}
    </div>
  );
}
