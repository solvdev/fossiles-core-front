import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyDraftChange,
  applyDraftsToDays,
  computeTotals,
  dropDrafts,
  indexDays,
  prunePristine,
  summarizeDrafts,
} from "./adSpendHelpers";

/**
 * Borradores de captura por fecha (lo tecleado en la tabla y aún no guardado).
 * - Viven por fecha, no por fila: se conservan si cambia el rango, se recarga el reporte o falla un guardado.
 * - `change` es estable (lee el reporte por ref) para que las filas memoizadas no se vuelvan a pintar al teclear en otra.
 * - Tras recargar, los borradores que ya coinciden con lo guardado se descartan solos.
 */
export default function useAdSpendDrafts(days) {
  const [drafts, setDrafts] = useState({});
  const byDate = useMemo(() => indexDays(days), [days]);
  const byDateRef = useRef(byDate);
  byDateRef.current = byDate;

  const change = useCallback((date, field, value) => {
    setDrafts((prev) => applyDraftChange(prev, date, field, value, byDateRef.current.get(date)));
  }, []);
  const discard = useCallback(() => setDrafts({}), []);
  const drop = useCallback((dates) => setDrafts((prev) => dropDrafts(prev, dates)), []);

  useEffect(() => {
    setDrafts((prev) => prunePristine(prev, byDate));
  }, [byDate]);

  const summary = useMemo(() => summarizeDrafts(drafts, byDate), [drafts, byDate]);
  /** Totales con las capturas pendientes aplicadas (solo cuando hay algo que previsualizar). */
  const previewTotals = useMemo(
    () => (summary.entries.length ? computeTotals(applyDraftsToDays(days, drafts)) : null),
    [summary.entries.length, days, drafts]
  );

  return { drafts, byDate, summary, previewTotals, change, discard, drop };
}
