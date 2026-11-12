import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Spinner, Table } from "reactstrap";
import { getDeskCountForDate } from "services/deskCountService";
import { getDeskSupervisorsForDate } from "services/deskSupervisorService";
import { sendToMaquila } from "services/taskService";
import { assignedQuantity } from "utils/dayPlanHelper";
import { specialDeskName } from "utils/deskSupervisorDisplay";
import { formatDateGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { concordar, contar } from "utils/textHelper";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const hoursOf = (item, qty) => qty * (item.prdTimePerUnit || 0.1);

/**
 * «Enviar a maquila»: se elige solo lo que se quiere cargar a la mesa de maquila del día.
 *
 * No tiene tope de horas ni de productos y no pasa por la propuesta de Armar el día: se crea
 * una tarea por OP directo en la mesa de maquila. Lo que se manda deja de estar por repartir
 * en la OP, igual que cualquier tarea.
 */
export default function MaquilaPanel({ planner }) {
  const { date, weekend, orders, ensureItems, loadOrders, loading, tasks } = planner;
  const [maquila, setMaquila] = useState(null);
  const [maquilaLoading, setMaquilaLoading] = useState(true);
  const [encargado, setEncargado] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  /** Lo elegido: { [productionOrderItemId]: { orderId, qty } }. */
  const [picks, setPicks] = useState({});
  const [sending, setSending] = useState(false);

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

  const visibleOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders || [])
      .filter((o) => !q || [o.code, o.customerName, o.groupCode].some((v) => (v || "").toLowerCase().includes(q)))
      .slice(0, 60);
  }, [orders, search]);

  const ordersById = useMemo(() => new Map((orders || []).map((o) => [o.id, o])), [orders]);

  const openOrder = async (id) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }
    setOpenId(id);
    await ensureItems([id]);
  };

  const setQty = (orderId, item, raw) => {
    const max = item.remainingQuantity || 0;
    const qty = Math.max(0, Math.min(max, Math.floor(Number(raw) || 0)));
    setPicks((prev) => {
      const next = { ...prev };
      if (qty > 0) next[item.productionOrderItemId] = { orderId, qty };
      else delete next[item.productionOrderItemId];
      return next;
    });
  };

  const pickAll = (order) => {
    setPicks((prev) => {
      const next = { ...prev };
      (order.items || []).forEach((it) => {
        if ((it.remainingQuantity || 0) > 0) next[it.productionOrderItemId] = { orderId: order.id, qty: it.remainingQuantity };
      });
      return next;
    });
  };

  const clearOrder = (order) => {
    setPicks((prev) => {
      const next = { ...prev };
      (order.items || []).forEach((it) => { delete next[it.productionOrderItemId]; });
      return next;
    });
  };

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
      units: rows.reduce((s, r) => s + r.units, 0),
      hours: rows.reduce((s, r) => s + r.hours, 0),
    };
  }, [picks, ordersById]);

  const send = async () => {
    if (!maquila || load.rows.length === 0) return;
    setSending(true);
    try {
      const res = await sendToMaquila({
        date,
        desk: maquila.desk,
        orders: load.rows.map((r) => ({ productionOrderId: r.order.id, items: r.lines })),
      });
      const codes = (res?.created || []).map((c) => c.code).join(", ");
      showSuccess(`Se ${concordar(res?.created?.length || 0, "mandó", "mandaron")} ${res?.totalQuantity || load.units} u a la mesa ${maquila.desk}${codes ? ` (${codes})` : ""}.`);
      setPicks({});
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
          <strong>No hay mesa de maquila activa.</strong> Actívela en el Tablero → Más → Encargados por mesa
          (sección «Mesa de maquila»).
        </div>
      </div>
    );
  }

  const deskTitle = `Mesa ${maquila.desk} · ${specialDeskName(maquila)}${encargado ? ` (${encargado})` : ""}`;

  return (
    <div>
      <div className="dp-note" style={{ borderColor: "#9b59b6" }}>
        <div className="dp-x">
          <strong>{deskTitle}</strong> · {formatDateGt(date)}.{" "}
          Elija solo lo que va a maquila. No tiene límite de horas ni de productos y no ocupa el cupo de la planta.
          Se crea una tarea por OP, directo en esta mesa.
        </div>
      </div>

      {weekend && (
        <div className="dp-note bad" role="alert">
          <div className="dp-x"><strong>Sábado y domingo no se produce.</strong> Elija un día de lunes a viernes.</div>
        </div>
      )}

      <Input
        type="search"
        placeholder="Buscar OP o cliente"
        aria-label="Buscar OP o cliente"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-2"
      />

      {loading && (orders || []).length === 0 ? (
        <div className="dp-state"><Spinner size="sm" /> Cargando OPs…</div>
      ) : visibleOrders.length === 0 ? (
        <div className="dp-state">No hay OPs con productos por repartir.</div>
      ) : (
        <div>
          {visibleOrders.map((o) => {
            const open = openId === o.id;
            const chosen = load.rows.find((r) => r.order.id === o.id);
            return (
              <div key={o.id} className="dp-orow" style={{ display: "block" }}>
                <div className="d-flex flex-wrap align-items-center" style={{ gap: 8 }}>
                  <button type="button" className="dp-link" onClick={() => openOrder(o.id)} aria-expanded={open}>
                    {open ? "▾" : "▸"} <b>{o.code}</b>
                  </button>
                  {o.customerName && <span className="dp-muted">{o.customerName}</span>}
                  {o.deliveryDate && <span className="dp-small">entrega {formatDateGt(o.deliveryDate)}</span>}
                  {chosen && (
                    <span className="dp-chip ok" style={{ fontSize: 12 }}>
                      {chosen.units} u · {fmt(chosen.hours)} h a maquila
                    </span>
                  )}
                </div>
                {open && (
                  o.items == null ? (
                    <div className="dp-small mt-2"><Spinner size="sm" /> Cargando productos…</div>
                  ) : o.items.length === 0 ? (
                    <div className="dp-small mt-2">Esta OP ya no tiene productos por repartir.</div>
                  ) : (
                    <div className="mt-2">
                      <div className="mb-1" style={{ display: "flex", gap: 6 }}>
                        <Button className="dp-sm" onClick={() => pickAll(o)}>Todo lo que queda</Button>
                        <Button className="dp-sm" outline onClick={() => clearOrder(o)}>Quitar todo</Button>
                      </div>
                      <Table size="sm" responsive className="mb-0">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Color</th>
                            <th className="text-right">Quedan</th>
                            <th style={{ width: 110 }}>A maquila</th>
                            <th className="text-right">Tiempo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.items.map((it) => {
                            const qty = picks[it.productionOrderItemId]?.qty || 0;
                            const inDraft = assignedQuantity(tasks || [], it.productionOrderItemId);
                            return (
                              <tr key={it.productionOrderItemId}>
                                <td><b>{it.productCode}</b> <small className="text-muted">{it.productName}</small></td>
                                <td>{it.colorName || "sin color"}</td>
                                <td className="text-right">
                                  {it.remainingQuantity}
                                  {inDraft > 0 && <><br /><small className="text-muted">{inDraft} en las tareas armadas</small></>}
                                </td>
                                <td>
                                  <Input
                                    bsSize="sm"
                                    type="number"
                                    min="0"
                                    max={it.remainingQuantity}
                                    inputMode="numeric"
                                    aria-label={`${it.productCode} ${it.colorName || ""} a maquila`}
                                    value={qty || ""}
                                    placeholder="0"
                                    onChange={(e) => setQty(o.id, it, e.target.value)}
                                  />
                                </td>
                                <td className="text-right">{qty ? `${fmt(hoursOf(it, qty))} h` : ""}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="dp-tray mt-3" style={{ borderColor: "#9b59b6" }}>
        <strong>Carga para maquila</strong>
        {load.rows.length === 0 ? (
          <p className="dp-small mb-0">Todavía no eligió nada. Abra una OP y ponga cuántas van a maquila.</p>
        ) : (
          <>
            <ul>
              {load.rows.map((r) => (
                <li key={r.order.id}>
                  <span>{r.order.code}</span>
                  <span>{contar(r.lines.length, "producto")}</span>
                  <strong>{r.units} u · {fmt(r.hours)} h</strong>
                </li>
              ))}
            </ul>
            <div className="d-flex flex-wrap align-items-center" style={{ gap: 8 }}>
              <span className="dp-small">
                Total: <b>{load.units} u</b> · {fmt(load.hours)} h · {contar(load.rows.length, "tarea")}
              </span>
              <Button outline className="dp-sm" disabled={sending} onClick={() => setPicks({})}>Vaciar</Button>
              <Button
                className="dp-big"
                style={{ background: "#9b59b6", borderColor: "#9b59b6", color: "#fff" }}
                disabled={sending || weekend}
                onClick={send}
              >
                {sending ? "Mandando…" : `Enviar a maquila (${load.units} u)`}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
