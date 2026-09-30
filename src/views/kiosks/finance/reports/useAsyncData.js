import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Carga datos asíncronos conservando el resultado anterior mientras se recarga
 * (el marco no salta: sólo se atenúa) y descartando respuestas obsoletas.
 * `fetcher` se lee por ref; la recarga se dispara únicamente al cambiar `deps`.
 */
export default function useAsyncData(fetcher, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: "" });
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const seq = useRef(0);

  const run = useCallback(() => {
    const id = seq.current + 1;
    seq.current = id;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((data) => {
        if (seq.current === id) setState({ data, loading: false, error: "" });
      })
      .catch((err) => {
        if (seq.current === id) {
          setState({
            data: null,
            loading: false,
            error: (err && err.message) || "No se pudieron cargar los datos.",
          });
        }
      });
  }, []);

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    if (!enabled) return undefined;
    run();
    return () => {
      seq.current += 1; // invalida la petición en curso
    };
  }, [enabled, depsKey, run]);

  return { data: state.data, loading: state.loading, error: state.error, reload: run };
}
