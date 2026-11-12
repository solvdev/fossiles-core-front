import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { getDeskCountForDate } from "services/deskCountService";
import { getDeskSupervisorsForDate } from "services/deskSupervisorService";
import { sendToMaquila } from "services/taskService";
import { assignedQuantity } from "utils/dayPlanHelper";
import { compareColorNames, colorRank } from "utils/colorOrder";
import { specialDeskName } from "utils/deskSupervisorDisplay";
import { formatDateGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { concordar, contar } from "utils/textHelper";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const hoursOf = (item, qty) => qty * (item.prdTimePerUnit || 0.1);
const NO_COLOR = "Sin color";

const MQ_CSS = `
.mq{--mq:#8e44ad;--mq-soft:#f4ecf8}
.mq-head{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:12px 14px;border:2px solid var(--mq);border-radius:10px;background:var(--mq-soft);margin-bottom:12px}
.mq-head b{font-size:18px}
.mq-layout{display:grid;grid-template-columns:300px minmax(0,1fr);gap:14px;align-items:start}
@media (max-width: 991px){.mq-layout{grid-template-columns:1fr}}
.mq-ops{border:1px solid var(--dp-line);border-radius:10px;background:#fff;position:sticky;top:8px;max-height:calc(100vh - 220px);display:flex;flex-direction:column}
@media (max-width: 991px){.mq-ops{position:static;max-height:320px}}
.mq-ops-search{padding:8px;border-bottom:1px solid var(--dp-line)}
.mq-ops-search input,.mq-tools input[type=search]{width:100%;min-height:44px;border:1px solid #c9c4bb;border-radius:8px;padding:0 12px;font-size:16px}
.mq-ops-list{overflow-y:auto}
.mq-op{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--dp-line);background:#fff;padding:10px 12px;cursor:pointer;min-height:56px}
.mq-op:hover{background:#faf9f6}
.mq-op.is-open{background:var(--mq-soft);box-shadow:inset 4px 0 0 var(--mq)}
.mq-op .mq-op-top{display:flex;align-items:center;gap:6px;justify-content:space-between}
.mq-op small{display:block;color:var(--dp-muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mq-badge{background:var(--mq);color:#fff;border-radius:999px;padding:2px 10px;font-size:13px;font-weight:800;white-space:nowrap}
.mq-detail{border:1px solid var(--dp-line);border-radius:10px;background:#fff;padding:12px;min-height:200px}
.mq-detail h5{margin:0 0 4px;font-weight:800}
.mq-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:10px 0}
.mq-tools .mq-grow{flex:1 1 200px}
.mq-pct{display:inline-flex;align-items:center;gap:4px;border:1px solid #c9c4bb;border-radius:8px;padding:0 4px 0 10px;min-height:48px;background:#fff}
.mq-pct input{width:56px;min-height:40px;border:0;text-align:right;font-weight:800;font-size:16px}
.mq-pct input:focus{outline:none}
.mq-grid-wrap{overflow:auto;max-height:calc(100vh - 330px);border:1px solid var(--dp-line);border-radius:8px}
.mq-grid{border-collapse:separate;border-spacing:0;width:100%;font-size:15px}
.mq-grid th,.mq-grid td{border-bottom:1px solid var(--dp-line);padding:6px 8px;vertical-align:middle;background:#fff}
.mq-grid thead th{position:sticky;top:0;z-index:2;background:#f5f4f1;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#555;white-space:nowrap;text-align:center}
.mq-grid thead th.prio{background:#ebe9e3}
.mq-grid tfoot td{position:sticky;bottom:0;z-index:2;background:#f5f4f1;font-weight:800;text-align:center}
.mq-grid .mq-prod{position:sticky;left:0;z-index:1;min-width:190px;max-width:240px;border-right:1px solid var(--dp-line)}
.mq-grid thead th.mq-prod,.mq-grid tfoot td.mq-prod{z-index:3;text-align:left}
.mq-grid .mq-prod b{font-weight:800}
.mq-grid .mq-prod small{display:block;color:var(--dp-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mq-grid td.mq-c{text-align:center;min-width:84px}
.mq-grid td.mq-c.zero{color:#c9cdd1}
.mq-grid td.mq-c.full{background:#efe3f5}
.mq-grid td.mq-c.part{background:#f8f2fb}
.mq-grid input.mq-q{width:60px;min-height:40px;text-align:center;font-weight:800;border:1px solid #d8d4cc;border-radius:8px;background:#fff;font-size:16px}
.mq-grid input.mq-q:focus{outline:2px solid var(--mq)}
.mq-grid .mq-of{display:block;border:0;background:none;padding:0;margin:2px auto 0;font-size:12px;color:var(--dp-muted);cursor:pointer;text-decoration:underline dotted}
.mq-grid .mq-colbtn,.mq-grid .mq-rowbtn{display:block;margin:4px auto 0;border:1px solid #c9b3d6;background:#fff;color:var(--mq);border-radius:999px;font-size:11px;font-weight:800;padding:2px 10px;cursor:pointer;text-transform:none;letter-spacing:0}
.mq-grid .mq-rowbtn{display:inline-block;margin:4px 6px 0 0}
.mq-grid td.mq-sum{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;min-width:90px}
.mq-bar{position:sticky;bottom:0;z-index:5;margin-top:14px;background:#fff;border:2px solid var(--mq);border-radius:10px;padding:10px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;box-shadow:0 -4px 14px rgba(0,0,0,.06)}
.mq-bar .mq-grow{flex:1 1 220px}
.mq-bar .mq-total{font-size:18px}
.mq .btn.mq-go{background:var(--mq);border-color:var(--mq);color:#fff}
.mq-load{list-style:none;padding:0;margin:8px 0 0;width:100%}
.mq-load li{display:flex;gap:10px;align-items:center;padding:6px 0;border-top:1px solid var(--dp-line)}
.mq-load li span{flex:1 1 auto}
.mq-empty{padding:30px 10px;text-align:center;color:var(--dp-muted)}
`;

/**
 * Celda de cantidad. Se confirma al salir o con Enter (que baja a la misma columna de la fila
 * siguiente, como en una hoja de cálculo), para que al escribir «12» no se aplique primero «1».
 */
function QtyInput({ value, max, label, cellId, onCommit }) {
  const [draft, setDraft] = useState(value ? String(value) : "");
  useEffect(() => { setDraft(value ? String(value) : ""); }, [value]);
  const commit = () => {
    const n = Math.max(0, Math.min(max, Math.floor(Number(draft) || 0)));
    if (n !== value) onCommit(n);
    else setDraft(value ? String(value) : "");
  };
  const move = (target, dir) => {
    const [r, c] = cellId.split(":").map(Number);
    const grid = target.closest("table");
    for (let i = r + dir; i >= 0 && i < 2000; i += dir) {
      const next = grid?.querySelector(`input[data-cell="${i}:${c}"]`);
      if (next) { next.focus(); next.select(); return; }
      if (!grid?.querySelector(`tr[data-row="${i}"]`)) return;
    }
  };
  return (
    <input
      type="number" min="0" max={max} inputMode="numeric" className="mq-q" aria-label={label}
      data-cell={cellId} placeholder="0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onDoubleClick={() => onCommit(max)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          commit();
          move(e.currentTarget, e.key === "ArrowUp" || (e.key === "Enter" && e.shiftKey) ? -1 : 1);
        }
      }}
    />
  );
}

/** Productos de una OP en filas y colores en columnas, como el paso 2 de Armar el día. */
function buildMatrix(items, filter) {
  const q = filter.trim().toLowerCase();
  const visible = (items || []).filter((it) => (it.remainingQuantity || 0) > 0)
    .filter((it) => !q || [it.productCode, it.productName, it.colorName].some((v) => (v || "").toLowerCase().includes(q)));
  const colors = Array.from(new Set(visible.map((it) => it.colorName || NO_COLOR))).sort(compareColorNames);
  const rowsByKey = new Map();
  visible.forEach((it) => {
    const color = it.colorName || NO_COLOR;
    // El mismo producto y color puede venir en dos líneas (otra talla u observación): fila aparte.
    let n = 0;
    let key = it.productCode || String(it.productionOrderItemId);
    while (rowsByKey.get(key)?.cells[color]) { n += 1; key = `${it.productCode}#${n}`; }
    const row = rowsByKey.get(key) || {
      key, productCode: it.productCode, productName: it.productName, note: n ? it.observations : null, cells: {},
    };
    row.cells[color] = it;
    rowsByKey.set(key, row);
  });
  const rows = Array.from(rowsByKey.values())
    .sort((a, b) => (a.productCode || "").localeCompare(b.productCode || "", "es", { numeric: true }));
  return { colors, rows, items: visible };
}

/**
 * «Enviar a maquila»: se elige solo lo que se quiere cargar a la mesa de maquila del día.
 *
 * Pensado para OPs grandes: la OP se ve como tabla de producto × color, se llena con un toque
 * (toda la OP, una fila, un color o un porcentaje de todo) y se ajusta celda por celda con el
 * teclado (Enter baja). No tiene tope de horas ni de productos y no pasa por la propuesta de
 * Armar el día: se crea una tarea por OP directo en la mesa de maquila.
 */
export default function MaquilaPanel({ planner }) {
  const { date, weekend, orders, ensureItems, loadOrders, loading, tasks } = planner;
  const [maquila, setMaquila] = useState(null);
  const [maquilaLoading, setMaquilaLoading] = useState(true);
  const [encargado, setEncargado] = useState("");
  const [search, setSearch] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState("");
  const [pct, setPct] = useState("50");
  /** Lo elegido: { [productionOrderItemId]: { orderId, qty } }. */
  const [picks, setPicks] = useState({});
  const [showLoad, setShowLoad] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const detailRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setMaquilaLoading(true);
    Promise.all([getDeskCountForDate(date), getDeskSupervisorsForDate(date).catch(() => null)])
      .then(([count, sup]) => {
        if (cancelled) return;
        const special = Array.isArray(count?.specialDesks) ? count.specialDesks : [];
        const desk = special[0] || null;
        setMaquila(desk);
        const row = desk ? (sup?.assignments || []).find((a) => Number(a.desk) === Number(desk.desk)) : null;
        setEncargado(row?.supervisorName || "");
      })
      .catch(() => { if (!cancelled) setMaquila(null); })
      .finally(() => { if (!cancelled) setMaquilaLoading(false); });
    return () => { cancelled = true; };
  }, [date]);

  const ordersById = useMemo(() => new Map((orders || []).map((o) => [o.id, o])), [orders]);

  /** Resumen por OP de lo elegido. */
  const load = useMemo(() => {
    const byOrder = new Map();
    Object.entries(picks).forEach(([itemId, p]) => {
      const order = ordersById.get(p.orderId);
      const item = order?.items?.find((it) => String(it.productionOrderItemId) === String(itemId));
      if (!order || !item) return;
      const row = byOrder.get(order.id) || { order, units: 0, hours: 0, lines: [] };
      row.units += p.qty;
      row.hours += hoursOf(item, p.qty);
      row.lines.push({ productionOrderItemId: item.productionOrderItemId, quantity: p.qty });
      byOrder.set(order.id, row);
    });
    const rows = Array.from(byOrder.values());
    return {
      rows,
      byOrderId: byOrder,
      units: rows.reduce((s, r) => s + r.units, 0),
      hours: rows.reduce((s, r) => s + r.hours, 0),
    };
  }, [picks, ordersById]);

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders || [])
      .filter((o) => !onlyPicked || load.byOrderId.has(o.id))
      .filter((o) => !q || [o.code, o.customerName, o.groupCode].some((v) => (v || "").toLowerCase().includes(q)));
  }, [orders, search, onlyPicked, load]);

  const openOrder = useCallback(async (id) => {
    setOpenId(id);
    setFilter("");
    detailRef.current?.scrollIntoView?.({ block: "nearest" });
    await ensureItems([id]);
  }, [ensureItems]);

  const openOrderObj = openId != null ? ordersById.get(openId) : null;
  const matrix = useMemo(() => buildMatrix(openOrderObj?.items, filter), [openOrderObj, filter]);

  /** Pone varias celdas de una vez: [[item, qty], …] de la OP abierta. */
  const setMany = useCallback((pairs) => {
    if (!openOrderObj) return;
    setPicks((prev) => {
      const next = { ...prev };
      pairs.forEach(([it, qty]) => {
        const n = Math.max(0, Math.min(it.remainingQuantity || 0, Math.floor(qty || 0)));
        if (n > 0) next[it.productionOrderItemId] = { orderId: openOrderObj.id, qty: n };
        else delete next[it.productionOrderItemId];
      });
      return next;
    });
  }, [openOrderObj]);

  const qtyOf = (it) => picks[it.productionOrderItemId]?.qty || 0;
  const filtered = filter.trim() !== "";
  const scope = filtered ? "lo filtrado" : "toda la OP";

  const fillAll = () => setMany(matrix.items.map((it) => [it, it.remainingQuantity]));
  const clearAll = () => setMany(matrix.items.map((it) => [it, 0]));
  const fillPct = () => {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    setMany(matrix.items.map((it) => [it, Math.floor(((it.remainingQuantity || 0) * p) / 100)]));
  };
  const toggleRow = (row) => {
    const cells = Object.values(row.cells);
    const full = cells.every((it) => qtyOf(it) === it.remainingQuantity);
    setMany(cells.map((it) => [it, full ? 0 : it.remainingQuantity]));
  };
  const toggleColor = (color) => {
    const cells = matrix.rows.map((r) => r.cells[color]).filter(Boolean);
    const full = cells.every((it) => qtyOf(it) === it.remainingQuantity);
    setMany(cells.map((it) => [it, full ? 0 : it.remainingQuantity]));
  };

  const send = async () => {
    if (!maquila || load.rows.length === 0) return;
    setSending(true);
    try {
      const res = await sendToMaquila({
        date,
        desk: maquila.desk,
        orders: load.rows.map((r) => ({ productionOrderId: r.order.id, items: r.lines })),
      });
      const created = res?.created || [];
      const codes = created.map((c) => c.code).join(", ");
      showSuccess(`Se ${concordar(created.length, "creó", "crearon")} ${contar(created.length, "tarea")} con `
        + `${res?.totalQuantity || load.units} u en la mesa ${maquila.desk}${codes ? ` (${codes})` : ""}.`);
      setPicks({});
      setConfirmOpen(false);
      setShowLoad(false);
      setOpenId(null);
      await loadOrders();
    } catch (err) {
      showError(err.message || "No se pudo mandar a maquila");
    } finally {
      setSending(false);
    }
  };

  if (maquilaLoading) {
    return <div className="dp-state"><Spinner size="sm" /> Buscando la mesa de maquila…</div>;
  }
  if (!maquila) {
    return (
      <div className="dp-note warn" role="alert">
        <div className="dp-x">
          <strong>No hay mesa de maquila activa.</strong> Actívela en el Tablero → Encargados por mesa
          (sección «Mesa de maquila»).
        </div>
      </div>
    );
  }

  const deskTitle = `Mesa ${maquila.desk} · ${specialDeskName(maquila)}`;
  const openPicked = openOrderObj ? load.byOrderId.get(openOrderObj.id) : null;
  const colTotals = matrix.colors.map((c) => matrix.rows.reduce((s, r) => s + (r.cells[c] ? qtyOf(r.cells[c]) : 0), 0));
  const colRemaining = matrix.colors.map((c) => matrix.rows.reduce((s, r) => s + (r.cells[c]?.remainingQuantity || 0), 0));

  return (
    <div className="mq">
      <style>{MQ_CSS}</style>

      <div className="mq-head">
        <b>{deskTitle}</b>
        {encargado && <span>Encargado: <b style={{ fontSize: 16 }}>{encargado}</b></span>}
        <span>· {formatDateGt(date)}</span>
        <span className="dp-small" style={{ flexBasis: "100%" }}>
          Sin límite de horas ni de productos y sin ocupar el cupo de la planta. Se crea una tarea por OP, directo en esta mesa.
        </span>
      </div>

      {weekend && (
        <div className="dp-note bad" role="alert">
          <div className="dp-x"><strong>Sábado y domingo no se produce.</strong> Elija un día de lunes a viernes.</div>
        </div>
      )}

      <div className="mq-layout">
        {/* ---------- OPs ---------- */}
        <div className="mq-ops">
          <div className="mq-ops-search">
            <input
              type="search" placeholder="Buscar OP o cliente" aria-label="Buscar OP o cliente"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
            {load.rows.length > 0 && (
              <label className="dp-small d-flex align-items-center mt-2 mb-0" style={{ gap: 6 }}>
                <input type="checkbox" checked={onlyPicked} onChange={(e) => setOnlyPicked(e.target.checked)} />
                Solo las que ya tienen algo elegido
              </label>
            )}
          </div>
          <div className="mq-ops-list" role="listbox" aria-label="Órdenes de producción">
            {loading && (orders || []).length === 0 ? (
              <div className="mq-empty"><Spinner size="sm" /> Cargando OPs…</div>
            ) : visibleOrders.length === 0 ? (
              <div className="mq-empty">No hay OPs con productos por repartir.</div>
            ) : visibleOrders.map((o) => {
              const chosen = load.byOrderId.get(o.id);
              return (
                <button
                  key={o.id} type="button" role="option" aria-selected={openId === o.id}
                  className={`mq-op ${openId === o.id ? "is-open" : ""}`}
                  onClick={() => openOrder(o.id)}
                >
                  <div className="mq-op-top">
                    <b>{o.code}</b>
                    {chosen && <span className="mq-badge">{chosen.units} u</span>}
                  </div>
                  <small>
                    {o.customerName || o.groupCode || "—"}
                  </small>
                  <small>
                    {fmt(o.remainingHours)} h por repartir
                    {o.remainingItemCount ? ` · ${contar(o.remainingItemCount, "producto")}` : ""}
                    {o.deliveryDate ? ` · entrega ${formatDateGt(o.deliveryDate)}` : ""}
                  </small>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- Detalle de la OP ---------- */}
        <div className="mq-detail" ref={detailRef}>
          {!openOrderObj ? (
            <div className="mq-empty">
              <b>Elija una OP</b> de la lista para ver sus productos por color.
              <br />Puede pasar de una OP a otra: lo elegido se conserva hasta enviar.
            </div>
          ) : (
            <>
              <h5>{openOrderObj.code}</h5>
              <div className="dp-small">
                {openOrderObj.customerName || ""}
                {openPicked ? <> · <b>{openPicked.units} u · {fmt(openPicked.hours)} h</b> elegidas de esta OP</> : " · nada elegido todavía"}
              </div>

              {openOrderObj.items == null ? (
                <div className="mq-empty"><Spinner size="sm" /> Cargando productos…</div>
              ) : matrix.items.length === 0 && !filtered ? (
                <div className="mq-empty">Esta OP ya no tiene productos por repartir.</div>
              ) : (
                <>
                  <div className="mq-tools">
                    <div className="mq-grow">
                      <input
                        type="search" placeholder="Filtrar producto o color (ej. B-7, café)"
                        aria-label="Filtrar producto o color" value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      />
                    </div>
                    <Button className="dp-sm mq-go" onClick={fillAll}>Todo ({scope})</Button>
                    <span className="mq-pct">
                      <input
                        type="number" min="1" max="100" inputMode="numeric" aria-label="Porcentaje"
                        value={pct} onChange={(e) => setPct(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") fillPct(); }}
                      />
                      <span>%</span>
                      <Button className="dp-sm" outline onClick={fillPct} style={{ minHeight: 40, margin: 0 }}>
                        Aplicar
                      </Button>
                    </span>
                    <Button className="dp-sm" outline onClick={clearAll}>Quitar ({scope})</Button>
                  </div>
                  <div className="dp-small mb-2">
                    Toque <b>«de N»</b> o haga doble clic en una celda para mandar todo lo que queda.
                    Enter baja a la siguiente fila.
                  </div>

                  {matrix.items.length === 0 ? (
                    <div className="mq-empty">Ningún producto coincide con «{filter}».</div>
                  ) : (
                    <div className="mq-grid-wrap">
                      <table className="mq-grid">
                        <thead>
                          <tr>
                            <th className="mq-prod">Producto</th>
                            {matrix.colors.map((c) => (
                              <th key={c} className={colorRank(c) < 4 ? "prio" : ""}>
                                {c}
                                <button type="button" className="mq-colbtn" onClick={() => toggleColor(c)}
                                  title={`Todo el ${c} de ${scope}`}>todo</button>
                              </th>
                            ))}
                            <th>A maquila</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrix.rows.map((r, ri) => {
                            const cells = Object.values(r.cells);
                            const units = cells.reduce((s, it) => s + qtyOf(it), 0);
                            const hours = cells.reduce((s, it) => s + hoursOf(it, qtyOf(it)), 0);
                            return (
                              <tr key={r.key} data-row={ri}>
                                <td className="mq-prod">
                                  <b>{r.productCode}</b>
                                  <small title={r.productName}>{r.productName}{r.note ? ` · ${r.note}` : ""}</small>
                                  <button type="button" className="mq-rowbtn" onClick={() => toggleRow(r)}>
                                    toda la fila
                                  </button>
                                </td>
                                {matrix.colors.map((c, ci) => {
                                  const it = r.cells[c];
                                  if (!it) return <td key={c} className="mq-c zero">·</td>;
                                  const qty = qtyOf(it);
                                  const inDraft = assignedQuantity(tasks || [], it.productionOrderItemId);
                                  const cls = qty === 0 ? "" : qty >= it.remainingQuantity ? "full" : "part";
                                  return (
                                    <td key={c} className={`mq-c ${cls}`}>
                                      <QtyInput
                                        value={qty} max={it.remainingQuantity} cellId={`${ri}:${ci}`}
                                        label={`${r.productCode} ${c} a maquila`}
                                        onCommit={(n) => setMany([[it, n]])}
                                      />
                                      <button type="button" className="mq-of" onClick={() => setMany([[it, it.remainingQuantity]])}
                                        title={inDraft > 0 ? `${inDraft} ya están en las tareas armadas del paso 2` : "Mandar todo lo que queda"}>
                                        de {it.remainingQuantity}{inDraft > 0 ? ` (${inDraft} armadas)` : ""}
                                      </button>
                                    </td>
                                  );
                                })}
                                <td className="mq-sum">{units ? <><b>{units} u</b><br /><small>{fmt(hours)} h</small></> : ""}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td className="mq-prod">A maquila / quedan</td>
                            {matrix.colors.map((c, ci) => (
                              <td key={c}>{colTotals[ci]} / {colRemaining[ci]}</td>
                            ))}
                            <td className="mq-sum">{colTotals.reduce((a, b) => a + b, 0)} u</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---------- Barra fija: lo que va a maquila ---------- */}
      <div className="mq-bar" role="region" aria-label="Carga para maquila">
        <div className="mq-grow">
          {load.rows.length === 0 ? (
            <span className="dp-small">Todavía no eligió nada para maquila.</span>
          ) : (
            <>
              <span className="mq-total"><b>{load.units} u</b> · {fmt(load.hours)} h</span>{" "}
              <span className="dp-small">en {contar(load.rows.length, "OP")} → {contar(load.rows.length, "tarea")}</span>{" "}
              <button type="button" className="dp-link" onClick={() => setShowLoad((v) => !v)}>
                {showLoad ? "Ocultar detalle" : "Ver detalle"}
              </button>
            </>
          )}
        </div>
        {load.rows.length > 0 && (
          <Button outline className="dp-sm" disabled={sending} onClick={() => setPicks({})}>Vaciar todo</Button>
        )}
        <Button
          className="dp-big mq-go"
          disabled={sending || weekend || load.rows.length === 0}
          onClick={() => setConfirmOpen(true)}
        >
          Enviar a maquila{load.units ? ` (${load.units} u)` : ""}
        </Button>
        {showLoad && load.rows.length > 0 && (
          <ul className="mq-load">
            {load.rows.map((r) => (
              <li key={r.order.id}>
                <span><b>{r.order.code}</b> · {contar(r.lines.length, "producto")}</span>
                <strong>{r.units} u · {fmt(r.hours)} h</strong>
                <button type="button" className="dp-link" onClick={() => openOrder(r.order.id)}>Abrir</button>
                <button type="button" className="dp-link" onClick={() => setPicks((prev) => {
                  const next = { ...prev };
                  Object.keys(next).forEach((k) => { if (next[k].orderId === r.order.id) delete next[k]; });
                  return next;
                })}>Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal isOpen={confirmOpen} toggle={() => !sending && setConfirmOpen(false)}>
        <ModalHeader toggle={() => !sending && setConfirmOpen(false)}>Enviar a {deskTitle}</ModalHeader>
        <ModalBody>
          <p className="mb-2">
            Día <b>{formatDateGt(date)}</b>{encargado ? <> · encargado <b>{encargado}</b></> : null}.
            Se {concordar(load.rows.length, "crea", "crean")} <b>{contar(load.rows.length, "tarea")}</b>:
          </p>
          <ul className="mb-2">
            {load.rows.map((r) => (
              <li key={r.order.id}><b>{r.order.code}</b>: {r.units} u · {fmt(r.hours)} h ({contar(r.lines.length, "producto")})</li>
            ))}
          </ul>
          <p className="dp-small mb-0">
            Total {load.units} u · {fmt(load.hours)} h. Estas unidades dejan de estar por repartir en sus OPs.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button outline disabled={sending} onClick={() => setConfirmOpen(false)}>Volver</Button>
          {/* El modal se pinta fuera de .mq (portal): el color va en línea. */}
          <Button disabled={sending} onClick={send} style={{ background: "#8e44ad", borderColor: "#8e44ad", color: "#fff" }}>
            {sending ? "Mandando…" : "Sí, enviar a maquila"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
