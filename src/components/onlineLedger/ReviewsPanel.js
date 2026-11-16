import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "reactstrap";
import { getOnlineLedgerReviews, getOnlineLedgerReviewDetail, getOnlineLedgerReviewLog } from "../../services/onlineSaleService";
import { formatDay, formatMoney } from "./onlineLedgerHelper";

/**
 * Revisiones del libro: todas las que se han abierto (abiertas arriba), con su avance, y por cada una qué se hizo:
 * resumen, cambios por persona y por campo y la bitácora celda por celda (valor anterior → nuevo).
 */

const when = (at) => (at ? `${formatDay(at)}${String(at).length >= 16 ? ` ${String(at).slice(11, 16)}` : ""}` : "");

const EVENT_LABEL = {
  OPEN: "Abrió", CLOSE: "Cerró", REOPEN: "Reabrió", DELETE: "Borró", LOCK: "Bloqueó", UNLOCK: "Desbloqueó", EDIT: "Cambió",
};

const fmtVal = (v) => {
  if (v === null || v === undefined || v === "") return "(vacío)";
  const t = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return formatDay(t);
  if (/^-?\d+\.\d{2}$/.test(t)) return `Q${formatMoney(t)}`;
  return t;
};

const isClosed = (s) => s.period.status === "CLOSED";

function StatusBadge({ closed }) {
  return <span className={`ol-pst ${closed ? "closed" : "open"}`}>{closed ? "🔒 Cerrada" : "● Abierta"}</span>;
}

function Stats({ s }) {
  const pct = s.sales ? Math.round((s.reviewed / s.sales) * 100) : 0;
  return (
    <div className="stats">
      <span title="Ventas marcadas «Revisado»"><i className="bar"><i style={{ width: `${pct}%` }} /></i><b>{s.reviewed}</b> de <b>{s.sales}</b> revisadas</span>
      <span><b>{s.locked}</b> bloqueadas</span>
      <span><b>{s.edits}</b> cambios{s.editors > 0 ? ` · ${s.editors} ${s.editors === 1 ? "persona" : "personas"}` : ""}</span>
      {s.reopens > 0 && <span>reabierta {s.reopens} {s.reopens === 1 ? "vez" : "veces"}</span>}
    </div>
  );
}

function Detail({ id, onBack, onGoTo }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    getOnlineLedgerReviewDetail(id).then((d) => { if (alive) setDetail(d); }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [id]);

  const loadLog = useCallback(async (nextPage, replace) => {
    setLoading(true);
    try {
      const res = await getOnlineLedgerReviewLog(id, { kind, q: applied, page: nextPage, size: 50 });
      setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
      setTotal(res.total);
      setPage(nextPage);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, kind, applied]);

  useEffect(() => { loadLog(0, true); }, [loadLog]);

  const s = detail?.summary;
  const closed = s ? isClosed(s) : false;

  const logLine = useMemo(() => (e) => {
    const isEdit = e.type === "EDIT";
    return (
      <li key={e.id}>
        <div className="meta">
          <span><b>{e.userName || "—"}</b></span>
          <span>{when(e.at)}</span>
          {e.saleNumber && <span>Venta <b>{e.saleNumber}</b></span>}
        </div>
        <div className="chg">
          <span className={`ev ${e.type}`}>{EVENT_LABEL[e.type] || e.type}</span>
          {isEdit ? (
            <>
              {e.fieldLabel}: <span className="old">{fmtVal(e.oldValue)}</span> → <span className="new">{fmtVal(e.newValue)}</span>
            </>
          ) : e.detail}
        </div>
      </li>
    );
  }, []);

  return (
    <>
      <button type="button" className="ol-btn quiet sm" onClick={onBack}>← Todas las revisiones</button>
      {error && <div className="ol-alert err mt-2">{error}</div>}
      {!s && !error && <div className="mt-3"><Spinner size="sm" color="info" /></div>}
      {s && (
        <>
          <div className="d-flex flex-wrap align-items-center mt-3" style={{ gap: 8 }}>
            <StatusBadge closed={closed} />
            <b style={{ fontSize: 17 }}>{s.period.label}</b>
            <span className="ol-note">{formatDay(s.period.from)} al {formatDay(s.period.to)}</span>
            <button type="button" className="ol-btn sm ms-auto" style={{ marginLeft: "auto" }} onClick={() => onGoTo(s.period)}>Ver en el libro</button>
          </div>
          <div className="ol-note mt-1">
            Abrió {s.period.openedByName || "—"} el {when(s.period.openedAt)}
            {closed && ` · Cerró ${s.period.closedByName || "—"} el ${when(s.period.closedAt)}`}
            {s.period.reopenedAt && ` · Reabierta por ${s.period.reopenedByName || "—"} el ${when(s.period.reopenedAt)}`}
          </div>
          {s.period.note && <div className="ol-note">Nota: {s.period.note}</div>}

          <div className="ol-rv-sum">
            <div><small>Ventas</small><b>{s.sales}</b></div>
            <div><small>Revisadas</small><b>{s.reviewed}</b></div>
            <div><small>Sin revisar</small><b>{Math.max(0, s.sales - s.reviewed)}</b></div>
            <div><small>Bloqueadas</small><b>{s.locked}</b></div>
            <div><small>Ventas con cambios</small><b>{detail.editedSales}</b></div>
            <div><small>Cambios de celdas</small><b>{s.edits}</b></div>
          </div>

          {detail.byUser.length > 0 && (
            <>
              <h6>Quién hizo cambios</h6>
              <table className="ol-rv-tbl">
                <thead><tr><th>Persona</th><th className="n">Cambios</th><th className="n">Ventas</th><th>Último</th></tr></thead>
                <tbody>
                  {detail.byUser.map((u) => (
                    <tr key={u.name}><td>{u.name}</td><td className="n">{u.count}</td><td className="n">{u.sales}</td><td>{when(u.lastAt)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {detail.byField.length > 0 && (
            <>
              <h6>Qué se cambió</h6>
              <table className="ol-rv-tbl">
                <thead><tr><th>Campo</th><th className="n">Cambios</th></tr></thead>
                <tbody>{detail.byField.map((f) => <tr key={f.name}><td>{f.name}</td><td className="n">{f.count}</td></tr>)}</tbody>
              </table>
            </>
          )}

          <h6>Bitácora</h6>
          <div className="ol-rv-tabs" role="tablist">
            {[["", "Todo"], ["edits", "Cambios"], ["locks", "Bloqueos"], ["period", "Apertura y cierre"]].map(([k, label]) => (
              <button key={k || "all"} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "is-on" : ""} onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>
          <form className="ol-rv-filter" onSubmit={(e) => { e.preventDefault(); setApplied(query.trim()); }}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar venta, persona, campo o valor" aria-label="Buscar en la bitácora" />
            <button type="submit" className="ol-btn quiet sm">Buscar</button>
            {applied && <button type="button" className="ol-btn quiet sm" onClick={() => { setQuery(""); setApplied(""); }}>Quitar</button>}
          </form>
          {items.length === 0 && !loading && (
            <p className="ol-note">
              Sin registros. La bitácora guarda lo que se haga desde que se activó; las revisiones anteriores solo muestran su resumen.
            </p>
          )}
          <ul className="ol-rv-log">{items.map(logLine)}</ul>
          {loading && <Spinner size="sm" color="info" />}
          {!loading && items.length < total && (
            <button type="button" className="ol-btn quiet sm" onClick={() => loadLog(page + 1, false)}>Ver más ({total - items.length} restantes)</button>
          )}
        </>
      )}
    </>
  );
}

export default function ReviewsPanel({ onClose, onGoTo }) {
  const ref = useRef(null);
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("open");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    getOnlineLedgerReviews().then(setItems).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector("button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const open = (items || []).filter((s) => !isClosed(s));
  const closed = (items || []).filter(isClosed);
  const shown = tab === "open" ? open : tab === "closed" ? closed : items || [];

  return (
    <>
      <div className="ol-rv-back" onMouseDown={onClose} />
      <aside className="ol-rv" ref={ref} role="dialog" aria-label="Revisiones del libro">
        <div className="ol-rv-head">
          <h5>Revisiones del libro</h5>
          <button type="button" className="ol-btn quiet sm" onClick={onClose}>Cerrar ✕</button>
        </div>
        <div className="ol-rv-body">
          {selected ? (
            <Detail id={selected} onBack={() => setSelected(null)} onGoTo={(p) => { onClose(); onGoTo(p); }} />
          ) : (
            <>
              {error && <div className="ol-alert err">{error}</div>}
              {!items && !error && <Spinner size="sm" color="info" />}
              {items && (
                <>
                  <div className="ol-rv-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === "open"} className={tab === "open" ? "is-on" : ""} onClick={() => setTab("open")}>Abiertas<span className="c">{open.length}</span></button>
                    <button type="button" role="tab" aria-selected={tab === "closed"} className={tab === "closed" ? "is-on" : ""} onClick={() => setTab("closed")}>Cerradas<span className="c">{closed.length}</span></button>
                    <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "is-on" : ""} onClick={() => setTab("all")}>Todas<span className="c">{items.length}</span></button>
                  </div>
                  {shown.length === 0 && (
                    <p className="ol-note">
                      {items.length === 0 ? "Todavía no se ha abierto ninguna revisión." : tab === "open" ? "No hay revisiones abiertas." : "No hay revisiones cerradas."}
                    </p>
                  )}
                  {shown.map((s) => (
                    <button type="button" key={s.period.id} className={`ol-rv-item ${isClosed(s) ? "closed" : "open"}`} onClick={() => setSelected(s.period.id)}>
                      <div className="top">
                        <StatusBadge closed={isClosed(s)} />
                        <b>{s.period.label}</b>
                        <span className="rng">{formatDay(s.period.from)} al {formatDay(s.period.to)}</span>
                      </div>
                      <div className="who">
                        Abrió {s.period.openedByName || "—"} el {when(s.period.openedAt)}
                        {isClosed(s) && ` · Cerró ${s.period.closedByName || "—"} el ${when(s.period.closedAt)}`}
                        {s.lastActivityAt && ` · Última actividad ${when(s.lastActivityAt)}`}
                      </div>
                      <Stats s={s} />
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </aside>
    </>
  );
}
