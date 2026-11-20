import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getExecutiveDashboard, getExecutiveFinance } from "services/executiveDashboardService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { buildModel, fDate } from "views/executive/executiveModel";
import { Chips } from "views/executive/ExecutiveParts";
import { OrdersPage, ProductionPage, SummaryPage } from "views/executive/OperationsPages";
import { FinancePage, ProfitabilityPage, SalesPage } from "views/executive/BusinessPages";
import "views/executive/ExecutiveDashboard.css";

const PAGES = [
  ["resumen", "Resumen", "Lo importante de hoy", "Resumen gerencial", "Producción, ventas y finanzas en una vista: qué va bien, qué no y qué decidir."],
  ["produccion", "Producción", "Horas, ritmo y cuero", "Producción y tiempos", "Cuánto se produce, cuántas horas faltan, quién lo hace y cuándo se termina lo pendiente."],
  ["ordenes", "Órdenes", "Avance en % y horas", "Avance de órdenes", "Cómo va cada orden en porcentaje, cuánto falta y cuántas horas."],
  ["rentabilidad", "Rentabilidad", "Qué deja y qué sobra", "Rentabilidad", "Si se produce lo que se vende, qué producto deja más por hora y cuánto dinero está parado."],
  ["ventas", "Ventas kioscos", "Qué se vende", "Ventas de kioscos", "Qué se vende más, en qué kiosco y qué se está acabando."],
  ["finanzas", "Finanzas", "Por fechas, hasta ayer", "Finanzas", "Qué kiosco deja dinero, cómo va contra la meta, cuánto nos deben y cuánto rinde la publicidad."],
];
const PERIODS = [
  [7, "7 días"],
  [30, "30 días"],
  [90, "90 días"],
];
const isYmd = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

/**
 * Tablero gerencial (Dashboards > Gerencial), solo administradores. Una lectura al backend y seis páginas tipo
 * Power BI. Página, periodo y rango de Finanzas viven en la URL (?page=&days=&finFrom=&finTo=) para compartir el enlace.
 * Cambiar el rango de Finanzas solo vuelve a pedir Finanzas.
 */
function ExecutiveDashboard() {
  const [params, setParams] = useSearchParams();
  const page = PAGES.some((p) => p[0] === params.get("page")) ? params.get("page") : "resumen";
  const days = PERIODS.some((p) => String(p[0]) === params.get("days")) ? Number(params.get("days")) : 30;
  const finFrom = isYmd(params.get("finFrom")) ? params.get("finFrom") : null;
  const finTo = isYmd(params.get("finTo")) ? params.get("finTo") : null;
  const [today] = useState(getTodayYmdGuatemala);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [marginMode, setMarginMode] = useState("real");
  const [kiosk, setKiosk] = useState(null);
  const abortRef = useRef(null);
  const finAbortRef = useRef(null);
  const finRangeRef = useRef({ finFrom, finTo });
  finRangeRef.current = { finFrom, finTo };
  const loadedRangeRef = useRef(null);

  const load = useCallback(
    async (refresh = false) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError("");
      const range = finRangeRef.current;
      try {
        const res = await getExecutiveDashboard({ days, finFrom: range.finFrom, finTo: range.finTo, refresh, signal: controller.signal });
        loadedRangeRef.current = `${range.finFrom || ""}|${range.finTo || ""}`;
        setData(res);
      } catch (e) {
        if (e.name !== "AbortError") setError(e.message || "No se pudo cargar el tablero.");
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    },
    [days]
  );

  useEffect(() => {
    load(false);
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  // Rango de Finanzas cambiado después de cargar: solo se vuelve a pedir esa parte.
  useEffect(() => {
    const key = `${finFrom || ""}|${finTo || ""}`;
    if (!data || loadedRangeRef.current === key) return undefined;
    if (finAbortRef.current) finAbortRef.current.abort();
    const controller = new AbortController();
    finAbortRef.current = controller;
    setLoadingFinance(true);
    getExecutiveFinance({ from: finFrom, to: finTo, signal: controller.signal })
      .then((finance) => {
        loadedRangeRef.current = key;
        setData((prev) => (prev ? { ...prev, finance } : prev));
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message || "No se pudo cargar Finanzas.");
      })
      .finally(() => {
        if (finAbortRef.current === controller) setLoadingFinance(false);
      });
    return () => controller.abort();
  }, [finFrom, finTo, data]);

  const model = useMemo(() => (data ? buildModel(data, { marginMode }) : null), [data, marginMode]);

  const setParam = (patch) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(patch).forEach(([k, v]) => (v == null ? next.delete(k) : next.set(k, String(v))));
        return next;
      },
      { replace: false }
    );
  };

  const go = (target, state) => {
    if (state && state.kiosk) setKiosk(state.kiosk);
    setParam({ page: target });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const current = PAGES.find((p) => p[0] === page);
  const sales = data ? data.kioskSales : null;

  return (
    <div className="content">
      <div className="xdash">
        <header className="x-head">
          <div style={{ minWidth: 0 }}>
            <h1 className="x-title">{current[3]}</h1>
            <p className="x-sub">{current[4]}</p>
          </div>
          <div className="x-filters">
            {page !== "finanzas" ? (
              <>
                <span className="muted" style={{ fontSize: 12.5 }}>Periodo</span>
                <Chips options={PERIODS} value={days} onChange={(d) => setParam({ days: d })} />
              </>
            ) : null}
            <button type="button" className="x-chip" onClick={() => load(true)} disabled={loading}>
              {loading ? "Actualizando…" : "Actualizar"}
            </button>
            {data && page !== "finanzas" ? (
              <span className="x-badge" title="Las ventas se cuentan con el día cerrado (hasta ayer); la producción, hasta ahora.">
                Producción {fDate(data.from)} – {fDate(data.to)} · ventas hasta {fDate(sales && sales.to)} · datos de las{" "}
                {String(data.generatedAt || "").slice(11, 16)}
              </span>
            ) : null}
          </div>
        </header>

        <nav className="x-pages" aria-label="Páginas del tablero">
          {PAGES.map(([id, label, sub]) => (
            <button key={id} type="button" className={`x-page ${page === id ? "on" : ""}`} aria-current={page === id ? "page" : undefined} onClick={() => setParam({ page: id })}>
              <span className="t">{label}</span>
              <span className="s">{sub}</span>
            </button>
          ))}
        </nav>

        {error ? <div className="x-note">{error}</div> : null}
        {!model && loading ? <div className="x-loading">Cargando el tablero…</div> : null}
        {model ? (
          <div style={{ opacity: loading ? 0.6 : 1, transition: "opacity .2s" }}>
            {page === "resumen" ? <SummaryPage m={model} go={go} /> : null}
            {page === "produccion" ? <ProductionPage m={model} /> : null}
            {page === "ordenes" ? <OrdersPage m={model} /> : null}
            {page === "rentabilidad" ? <ProfitabilityPage m={model} marginMode={marginMode} setMarginMode={setMarginMode} /> : null}
            {page === "ventas" ? <SalesPage m={model} kiosk={kiosk} setKiosk={setKiosk} /> : null}
            {page === "finanzas" ? (
              <FinancePage
                m={model}
                todayYmd={today}
                loadingFinance={loadingFinance}
                onRange={(from, to) => setParam({ finFrom: from, finTo: to })}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default ExecutiveDashboard;
