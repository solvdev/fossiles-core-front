import React, { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "reactstrap";
import {
  getOnlineLedgerPeriods, openOnlineLedgerPeriod, closeOnlineLedgerPeriod, reopenOnlineLedgerPeriod, deleteOnlineLedgerPeriod,
} from "../../services/onlineSaleService";
import { formatDay, periodLabel, isPendingReview, isVoided, carrierOf } from "./onlineLedgerHelper";

/**
 * Revisión por periodo: se abre un rango o un mes (obligatorio para editar), Contabilidad lo revisa y al terminar lo cierra. Al cerrar se
 * bloquean todas las ventas del rango (también las que se registren después con fecha dentro). Reabrir: solo admin.
 */

const when = (at) => (at ? `${formatDay(at)}${String(at).length >= 16 ? ` ${String(at).slice(11, 16)}` : ""}` : "");

/** Fecha de la venta (la original, no la corregida en el libro): es la que decide el periodo. */
const saleDay = (r) => String((r.saleOriginal && r.saleOriginal.saleDate) || r.saleDate || "").slice(0, 10);

const inPeriod = (rows, p) => rows.filter((r) => { const d = saleDay(r); return d >= p.from && d <= p.to; });

/** Avance de la revisión con las ventas cargadas. */
const progressOf = (rows) => {
  const live = rows.filter((r) => !isVoided(r));
  return {
    total: rows.length,
    reviewed: rows.filter((r) => r.reviewed).length,
    noReal: rows.filter(isPendingReview).length,
    motoOpen: live.filter((r) => carrierOf(r.carrier).key === "moto" && !r.liquidationDate).length,
  };
};

function PeriodsList({ onPick, onClose }) {
  const ref = useRef(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getOnlineLedgerPeriods().then(setItems).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  useEffect(() => { if (items) ref.current?.querySelector("button")?.focus(); }, [items]);
  return (
    <div className="ol-menu ol-periods-menu" ref={ref} role="dialog" aria-label="Periodos de revisión">
      {error && <div className="ol-alert err">{error}</div>}
      {!items && !error && <Spinner size="sm" color="info" />}
      {items && items.length === 0 && <p className="ol-note mb-0">Todavía no se ha abierto ningún periodo de revisión.</p>}
      {items && items.map((p) => (
        <button type="button" key={p.id} className="ol-period-item" onClick={() => onPick(p)}>
          <span className={`ol-pst ${p.status === "CLOSED" ? "closed" : "open"}`}>{p.status === "CLOSED" ? "🔒 Cerrado" : "Abierto"}</span>
          <b>{p.label}</b>
          <small>{p.status === "CLOSED" ? `cerró ${p.closedByName || ""} ${when(p.closedAt)}` : `abrió ${p.openedByName || ""} ${when(p.openedAt)}`}</small>
        </button>
      ))}
    </div>
  );
}

export default function ReviewPeriodsBar({
  from, to, rows, periods, canManage, canReopen, historyMode, onChanged, onGoTo, onError, onNotice,
}) {
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const exact = periods.find((p) => p.from === from && p.to === to);
  const others = periods.filter((p) => p !== exact);
  const label = periodLabel(from, to);

  const stats = useMemo(() => {
    const out = {};
    periods.forEach((p) => {
      // Solo si la vista cubre todo el periodo; si no, el avance sería parcial.
      out[p.id] = from <= p.from && to >= p.to ? progressOf(inPeriod(rows, p)) : null;
    });
    return out;
  }, [periods, rows, from, to]);

  const run = async (fn, okText) => {
    setBusy(true);
    try {
      const result = await fn();
      if (okText) onNotice(typeof okText === "function" ? okText(result) : okText);
      await onChanged();
    } catch (e) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    if (!window.confirm(`¿Abrir la revisión de «${label}»?\nAl terminar se cierra y todas sus ventas quedan bloqueadas.`)) return;
    run(() => openOnlineLedgerPeriod(from, to), `Revisión de «${label}» abierta.`);
  };

  const close = (p) => {
    const st = stats[p.id];
    const pend = st
      ? [
        st.noReal ? `${st.noReal} sin envío real` : "",
        st.total - st.reviewed ? `${st.total - st.reviewed} sin marcar «Revisado»` : "",
        st.motoOpen ? `${st.motoOpen} de motorista sin liquidar` : "",
      ].filter(Boolean).join(" · ")
      : "";
    const text = `¿Cerrar la revisión de «${p.label}»?\n\n`
      + `Se bloquean ${st ? `las ${st.total} ventas` : "todas las ventas"} del ${formatDay(p.from)} al ${formatDay(p.to)} `
      + "y ya no se podrán modificar en el libro. Solo un administrador puede reabrirlo."
      + (pend ? `\n\nAún queda pendiente: ${pend}.` : "");
    if (!window.confirm(text)) return;
    run(() => closeOnlineLedgerPeriod(p.id), (r) => `«${p.label}» cerrado: ${r.lockedCount ?? 0} líneas bloqueadas.`);
  };

  const reopen = (p) => {
    if (!window.confirm(`¿Reabrir «${p.label}»? Se desbloquean las líneas que bloqueó el cierre (las bloqueadas a mano siguen bloqueadas).`)) return;
    run(() => reopenOnlineLedgerPeriod(p.id), `«${p.label}» reabierto.`);
  };

  const remove = (p) => {
    if (!window.confirm(`¿Borrar el periodo abierto «${p.label}»? No cambia ninguna venta.`)) return;
    run(() => deleteOnlineLedgerPeriod(p.id), `Periodo «${p.label}» borrado.`);
  };

  const Card = ({ p }) => {
    const closed = p.status === "CLOSED";
    const st = stats[p.id];
    const pct = st && st.total ? Math.round((st.reviewed / st.total) * 100) : 0;
    return (
      <div className={`ol-pcard ${closed ? "closed" : "open"}`}>
        <span className={`ol-pst ${closed ? "closed" : "open"}`}>{closed ? "🔒 Cerrado" : "● En revisión"}</span>
        <b>{p.label}</b>
        <span className="who">
          {closed
            ? `Cerró ${p.closedByName || "—"} el ${when(p.closedAt)}`
            : `Abrió ${p.openedByName || "—"} el ${when(p.openedAt)}${p.reopenedAt ? ` · reabierto por ${p.reopenedByName || "—"}` : ""}`}
        </span>
        {!closed && st && (
          <span className="prog" title="Ventas marcadas «Revisado» en el periodo">
            <span className="bar"><i style={{ width: `${pct}%` }} /></span>
            {st.reviewed} de {st.total} revisadas
            {st.noReal > 0 && <em> · {st.noReal} sin envío real</em>}
            {st.motoOpen > 0 && <em> · {st.motoOpen} moto sin liquidar</em>}
          </span>
        )}
        <span className="act">
          {(p.from !== from || p.to !== to) && <button type="button" className="ol-btn quiet sm" onClick={() => onGoTo(p)}>Ver periodo</button>}
          {!closed && canManage && (
            <button type="button" className="ol-btn primary sm" disabled={busy} onClick={() => close(p)}>
              {busy ? <Spinner size="sm" /> : "🔒"} Cerrar y bloquear
            </button>
          )}
          {!closed && canManage && <button type="button" className="ol-btn quiet sm" disabled={busy} onClick={() => remove(p)}>Borrar</button>}
          {closed && canReopen && <button type="button" className="ol-btn quiet sm" disabled={busy} onClick={() => reopen(p)}>Reabrir</button>}
        </span>
      </div>
    );
  };

  return (
    <div className="ol-review">
      <span className="ttl">Revisión</span>
      {historyMode ? (
        <span className="ol-note">Búsqueda en todo el historial: elija un periodo para abrir o cerrar su revisión.</span>
      ) : (
        <>
          {exact && <Card p={exact} />}
          {others.map((p) => <Card key={p.id} p={p} />)}
          {!exact && others.length === 0 && (
            <span className="ol-note warn">«{label}» no tiene revisión abierta: el libro está en solo lectura hasta abrirla.</span>
          )}
          {!exact && canManage && from && to && (
            <button type="button" className="ol-btn sm" disabled={busy || others.length > 0} onClick={open}
              title={others.length > 0 ? "Este rango se cruza con otro periodo: ábralo con fechas que no se crucen" : "Registrar que empieza la revisión de este rango"}>
              Abrir revisión de «{label}»
            </button>
          )}
        </>
      )}
      <span className="end ol-menu-anchor">
        <button type="button" className="ol-btn quiet sm" onClick={() => setShowList((v) => !v)} aria-expanded={showList}>Periodos ▾</button>
        {showList && <PeriodsList onClose={() => setShowList(false)} onPick={(p) => { setShowList(false); onGoTo(p); }} />}
      </span>
    </div>
  );
}
