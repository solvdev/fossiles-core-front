import { useEffect, useRef } from "react";
import useAsyncData from "views/kiosks/finance/reports/useAsyncData";

/**
 * Carga una fuente del dashboard (useAsyncData + AbortController).
 * - Se recarga al cambiar las fechas, el kiosko (`siteId`, sitio de Finanzas kioscos) o `refreshToken`.
 * - `refreshToken` lo incrementa el botón 'Actualizar': mientras ese token no haya terminado de cargar con éxito,
 *   la petición viaja con refresh=true para saltarse la caché de 60 s del backend (también en un reintento).
 * - Cancela la petición anterior al lanzar una nueva y al desmontar la pestaña.
 * - `enabled: false` no consulta (p. ej. rango que el endpoint no admite).
 */
export default function useSalesQuery(
  fetcher,
  { startDate, endDate, siteId, refreshToken = 0, enabled = true }
) {
  const controllerRef = useRef(null);
  const settledTokenRef = useRef(refreshToken);

  useEffect(
    () => () => {
      if (controllerRef.current) controllerRef.current.abort();
    },
    []
  );

  return useAsyncData(
    () => {
      if (controllerRef.current) controllerRef.current.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      return fetcher({
        startDate,
        endDate,
        siteId: siteId || undefined,
        refresh: refreshToken !== settledTokenRef.current,
        signal: controller.signal,
      }).then((result) => {
        settledTokenRef.current = refreshToken;
        return result;
      });
    },
    [startDate, endDate, siteId || "", refreshToken],
    { enabled }
  );
}
