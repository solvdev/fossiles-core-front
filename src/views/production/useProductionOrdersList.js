import { useCallback, useEffect, useRef, useState } from "react";
import { getProductionOrdersPage } from "services/productionOrderService";

export const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Estado del listado de Órdenes de Producción.
 *
 * Todo el filtrado, el orden y el recorte los hace el servidor: aquí no se filtra nada en
 * memoria. Es lo que permite que el contador diga la verdad — antes mostraba el total ya
 * filtrado por proceso, así que nunca se veía cuántas órdenes había realmente.
 *
 * Cuatro cosas que no son adorno:
 *
 * - **Debounce de 300 ms en la búsqueda.** Sin él cada tecla dispara una petición.
 * - **Cancelación de la petición en vuelo.** El listado anterior no cancelaba nada, así que
 *   cambiar de filtro rápido podía pintar la respuesta vieja encima de la nueva. Con
 *   paginación de servidor eso pasa de raro a frecuente.
 * - **`outsideCount`.** El filtro de proceso arranca en «Activas», que esconde lo despachado
 *   y lo cancelado. Buscar una orden ya despachada devolvía «no se encontraron órdenes» sin
 *   explicar por qué; ahora se cuenta cuántas quedan fuera para poder avisarlo. Solo se
 *   calcula cuando el usuario busca algo o no ve nada, para no pedir una segunda consulta
 *   en cada carga.
 * - **Vuelta atrás si la página se queda fuera de rango.** Al borrar el último elemento de
 *   la última página, el índice apuntaba a una página que ya no existe y la pantalla salía
 *   vacía sin motivo aparente.
 *
 * Al cambiar cualquier filtro se vuelve siempre a la primera página: quedarse en la 7 de un
 * filtro que ahora tiene 2 páginas deja la pantalla en blanco.
 */
export default function useProductionOrdersList() {
  const [family, setFamilyState] = useState("ALL");
  const [status, setStatusState] = useState("ALL");
  const [process, setProcessState] = useState("ACTIVE");
  const [search, setSearchState] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [from, setFromState] = useState("");
  const [to, setToState] = useState("");
  const [page, setPage] = useState(0);

  const [rows, setRows] = useState([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Cuántas órdenes coinciden con la búsqueda pero las esconde el filtro de proceso.
  const [outsideCount, setOutsideCount] = useState(0);

  const abortRef = useRef(null);
  const reloadRef = useRef(0);
  const [reloadToken, setReloadToken] = useState(0);
  // Cada carga lleva un número. Solo la más reciente puede escribir en el estado: si una
  // respuesta llega tarde -tras varios cambios de filtro seguidos- se descarta en vez de
  // pisar lo que ya se está mostrando.
  const peticionRef = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const miPeticion = peticionRef.current + 1;
    peticionRef.current = miPeticion;

    // La anterior ya no interesa: si contesta después, pintaría datos de otro filtro.
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const vigente = () => peticionRef.current === miPeticion && !controller.signal.aborted;

    const load = async () => {

      try {
        setLoading(true);
        setError("");
        const data = await getProductionOrdersPage({
          family,
          status,
          process,
          search: debouncedSearch,
          from,
          to,
          page,
          size: PAGE_SIZE,
          signal: controller.signal,
        });
        if (!vigente()) return;
        const total = Number(data?.totalElements || 0);
        const paginas = Number(data?.totalPages || 0);
        const filas = Array.isArray(data?.content) ? data.content : [];

        // Si la pagina actual se quedo fuera de rango -por ejemplo al borrar el ultimo
        // elemento de la ultima pagina- la pantalla saldria vacia sin explicar por que.
        // Se retrocede a la ultima pagina que si existe.
        if (filas.length === 0 && total > 0 && page > 0 && page > paginas - 1) {
          setPage(Math.max(paginas - 1, 0));
          return;
        }

        setRows(filas);
        setTotalElements(total);
        setTotalPages(paginas);

        // El filtro de proceso arranca en ACTIVE, que deja fuera lo despachado y lo
        // cancelado. Buscar una orden ya despachada devolvia "No se encontraron
        // ordenes" sin decir por que. Se mira cuantas hay sin ese filtro, pero solo
        // cuando el usuario busca algo o no ve nada: si no, el aviso seria ruido
        // permanente ("hay 1.164 fuera de este filtro").
        const merecePregunta = process !== "ALL" && (debouncedSearch !== "" || total === 0);
        if (!merecePregunta) {
          setOutsideCount(0);
        } else {
          try {
            const todas = await getProductionOrdersPage({
              family, status, process: "ALL", search: debouncedSearch, from, to,
              page: 0, size: 1, signal: controller.signal,
            });
            if (!vigente()) return;
            setOutsideCount(Math.max(Number(todas?.totalElements || 0) - total, 0));
          } catch (err2) {
            // Es solo un aviso: si falla, se calla y no estorba al listado.
            if (err2?.name !== "AbortError") setOutsideCount(0);
          }
        }
      } catch (err) {
        // Abortar es lo normal aquí, no un fallo que mostrar al usuario.
        if (err?.name === "AbortError" || !vigente()) return;
        setRows([]);
        setTotalElements(0);
        setTotalPages(0);
        setOutsideCount(0);
        setError(err?.message || "Error al cargar las órdenes de producción");
      } finally {
        if (vigente()) setLoading(false);
      }
    };

    load();
    // Cancelar aquí y no solo al empezar la siguiente carga: así la petición muere en el
    // momento exacto en que sus datos dejan de ser válidos.
    return () => controller.abort();
  }, [family, status, process, debouncedSearch, from, to, page, reloadToken]);

  useEffect(() => () => {
    if (abortRef.current) abortRef.current.abort();
  }, []);

  // Cambiar un filtro vuelve siempre a la primera página: quedarse en la 7 de un filtro que
  // ahora tiene 2 páginas deja la pantalla en blanco sin explicar por qué.
  const resetTo = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const setFamily = resetTo(setFamilyState);
  const setStatus = resetTo(setStatusState);
  const setProcess = resetTo(setProcessState);
  const setSearch = resetTo(setSearchState);
  const setFrom = resetTo(setFromState);
  const setTo = resetTo(setToState);

  const applyFilters = useCallback((next = {}) => {
    if (next.family !== undefined) setFamilyState(next.family);
    if (next.status !== undefined) setStatusState(next.status);
    if (next.process !== undefined) setProcessState(next.process);
    if (next.search !== undefined) setSearchState(next.search);
    if (next.from !== undefined) setFromState(next.from);
    if (next.to !== undefined) setToState(next.to);
    setPage(0);
  }, []);

  /** Quita el filtro de proceso para que se vean las que quedaban fuera. */
  const showAllProcesses = useCallback(() => {
    setProcessState("ALL");
    setPage(0);
  }, []);

  const refresh = useCallback(() => {
    reloadRef.current += 1;
    setReloadToken(reloadRef.current);
  }, []);

  const goToPage = useCallback(
    (next) => setPage((current) => {
      const limit = Math.max(totalPages - 1, 0);
      return Math.min(Math.max(next, 0), limit);
    }),
    [totalPages]
  );

  const hasActiveFilters =
    family !== "ALL" || status !== "ALL" || process !== "ACTIVE" || !!search || !!from || !!to;

  return {
    family, setFamily,
    status, setStatus,
    process, setProcess,
    search, setSearch,
    from, setFrom,
    to, setTo,
    page, goToPage,
    rows, totalElements, totalPages,
    loading, error,
    outsideCount, showAllProcesses,
    hasActiveFilters,
    applyFilters,
    refresh,
  };
}
