import React, { useEffect, useState } from "react";
import { Button } from "reactstrap";
import { leftoverQuantity, planBlockers, summarizePlan } from "utils/dayPlanHelper";
import { buildTaskTable } from "utils/dayPlanTable";
import { colorRank } from "utils/colorOrder";
import { contar } from "utils/textHelper";
import FamilyBadge from "../dayboard/FamilyBadge";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);

const TASKS_PAGE = 25;
const CHIP_TEXT = { opl: "OPL · prioridad", ok: "Cabe", near: "Cerca del límite", over: "Se pasó" };
const BAR_COLOR = { opl: "#7cb342", ok: "#6bd098", near: "#fbc658", over: "#ef8157" };

/**
 * Cantidad de una celda. Se confirma al salir del campo o con Enter, para que al escribir
 * «12» no se aplique primero «1».
 */
function QtyCell({ value, label, onCommit }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);
  const commit = () => {
    const n = Math.max(0, Math.floor(Number(draft) || 0));
    if (n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <input
      type="number" min="0" inputMode="numeric" className="dp-tt-q" aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

/** Celda de la tarea: nombre, OP, carga contra el límite y sus acciones. */
function TaskCell({ group, rowSpan, planner, onAdd }) {
  const { task, index, status, codes, consolidated } = group;
  const shown = status.level === "opl" ? status.totalHours : status.baseHours;
  return (
    <td className={`dp-tt-task lv-${status.level}`} rowSpan={rowSpan}>
      <div className="dp-tt-tn">
        Tarea {index + 1} <FamilyBadge family={task.family} />
      </div>
      <div className="dp-tt-meta">
        {task.groupCode && <span className="dp-chip lf" style={{ fontSize: 12, padding: "1px 8px" }}>{task.groupCode}</span>}{" "}
        {consolidated ? codes.join(" + ") : task.orderCode}
      </div>
      <div className="dp-tt-meta">{fmt(shown)} h {status.level === "opl" ? "(no cuentan)" : "de 4 h"}</div>
      <div className="dp-tt-bar" aria-hidden="true">
        <i style={{ width: `${status.pct}%`, background: BAR_COLOR[status.level] }} />
        {status.level !== "opl" && <span />}
      </div>
      <span className={`dp-chip ${status.level}`} style={{ fontSize: 12 }}>{CHIP_TEXT[status.level]}</span>
      <div className="dp-tfoot" style={{ paddingBottom: 0 }}>
        <Button className="dp-sm" onClick={onAdd}>＋ Producto</Button>
        {status.level === "over" && (
          <Button color="success" className="dp-sm" onClick={() => planner.fixTask(task.clientId)}>Arreglar sola</Button>
        )}
      </div>
    </td>
  );
}

/**
 * Paso 2: armar tareas, en tabla. Una fila por tarea × producto y una columna por color
 * (Negro, Café, Tostado y Whisky primero; luego los demás que traigan las órdenes). Así se ve
 * en cuántas tareas se reparte cada orden y con qué desglose. El pie compara lo repartido
 * con lo que piden las órdenes; lo que falta queda «Para otro día».
 */
export default function StepBuildTasks({ planner }) {
  const {
    tasks, notice, setNotice, selectedOrders, newTask, leftovers, buildFromLeftovers, rebuildTasks, capacity,
    orders, addItem, setCellQty, moveLine, removeLine,
  } = planner;
  const [addFor, setAddFor] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [shownTasks, setShownTasks] = useState(TASKS_PAGE);
  const summary = summarizePlan(tasks);
  const blockers = planBlockers(tasks);
  const table = buildTaskTable(tasks, selectedOrders);
  const { colors } = table;
  const colSpanAll = 2 + colors.length + 3;

  const createTask = (orderId) => {
    const id = newTask(orderId);
    if (id) setAddFor(id);
    setNewOpen(false);
  };

  const renderAddRow = (task) => {
    const taskOrders = task.groupId
      ? orders.filter((o) => o.groupId === task.groupId)
      : orders.filter((o) => o.id === task.orderId);
    const addable = taskOrders.flatMap((o) => o.items || []).filter((it) => leftoverQuantity(it, tasks) > 0);
    return (
      <tr key={`${task.clientId}-add`}>
        <td colSpan={colSpanAll - 1} style={{ background: "#faf9f6" }}>
          <div className="dp-addlist" style={{ margin: 0 }}>
            {addable.length === 0 ? (
              <span className="dp-small">No quedan productos de {task.groupId ? "esta OP consolidada" : "esta OP"} por agregar.</span>
            ) : addable.map((it) => (
              <Button key={it.productionOrderItemId} className="dp-sm"
                onClick={() => { addItem(task.clientId, it.productionOrderItemId); setAddFor(null); }}>
                {it.productCode} · {it.colorName || "sin color"} · quedan {leftoverQuantity(it, tasks)}
              </Button>
            ))}
            <Button className="dp-sm" outline onClick={() => setAddFor(null)}>Cerrar</Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div>
      {notice && (
        <div className="dp-note warn" role="alert">
          <div className="dp-x">{notice}</div>
          <button type="button" className="dp-link" onClick={() => setNotice(null)}>Entendido</button>
        </div>
      )}
      <div className={`dp-note ${blockers.length ? "bad" : "good"}`}>
        <div className="dp-x">
          <strong>{contar(summary.count, "tarea")}</strong> · {fmt(summary.baseHours)} h base · {fmt(summary.oplHours)} h OPL (no cuentan) ·{" "}
          {table.placedTotal} de {table.askedTotal} unidades repartidas ·{" "}
          {blockers.length ? <strong>{blockers.length} con problemas</strong> : "0 con problemas"}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="dp-state">
          <h5>Aún no hay tareas</h5>
          <Button color="primary" onClick={rebuildTasks}>Armar tareas otra vez</Button>
        </div>
      ) : (
        <div className="dp-tt-wrap">
          <table className="dp-tt">
            <thead>
              <tr>
                <th>Tarea</th>
                <th>Producto</th>
                {colors.map((c) => <th key={c} className={`dp-tt-c${colorRank(c) < 4 ? " prio" : ""}`}>{c}</th>)}
                <th className="dp-tt-n">Uds</th>
                <th className="dp-tt-n">Tiempo</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {table.groups.slice(0, shownTasks).map((g) => {
                const { task } = g;
                const siblings = tasks.filter((t) => t.clientId !== task.clientId
                  && (task.groupId ? t.groupId === task.groupId : t.orderId === task.orderId));
                const rowSpan = Math.max(1, g.rows.length) + (addFor === task.clientId ? 1 : 0);
                const out = [];
                if (g.rows.length === 0) {
                  out.push(
                    <tr key={task.clientId} className="dp-tt-first">
                      <TaskCell group={g} rowSpan={rowSpan} planner={planner}
                        onAdd={() => setAddFor((cur) => (cur === task.clientId ? null : task.clientId))} />
                      <td colSpan={colSpanAll - 1} className="dp-small">La tarea está vacía. Agregue un producto.</td>
                    </tr>
                  );
                }
                g.rows.forEach((r, ri) => {
                  const rowItemIds = Object.values(r.cells).flatMap((c) => c.itemIds);
                  out.push(
                    <tr key={`${task.clientId}-${r.key}`} className={ri === 0 ? "dp-tt-first" : ""}>
                      {ri === 0 && (
                        <TaskCell group={g} rowSpan={rowSpan} planner={planner}
                          onAdd={() => setAddFor((cur) => (cur === task.clientId ? null : task.clientId))} />
                      )}
                      <td className="dp-tt-prod">
                        <b>{r.productCode}</b>
                        {g.consolidated && <span className="dp-tt-oc">{r.orderCode}</span>}
                        <small>{r.productName}</small>
                      </td>
                      {colors.map((c) => {
                        const cell = r.cells[c];
                        return cell ? (
                          <td key={c} className="dp-tt-c">
                            <QtyCell
                              value={cell.qty}
                              label={`${r.productCode} ${c} en la tarea ${g.index + 1}`}
                              onCommit={(n) => setCellQty(task.clientId, cell.itemIds, n)}
                            />
                          </td>
                        ) : <td key={c} className="dp-tt-c zero">·</td>;
                      })}
                      <td className="dp-tt-n"><b>{r.units}</b></td>
                      <td className="dp-tt-n">{fmt(r.hours)} h</td>
                      <td>
                        <div className="dp-tt-act">
                          <select
                            className="dp-select" value=""
                            aria-label={`Mover ${r.productCode} a otra tarea`}
                            onChange={(e) => e.target.value && moveLine(task.clientId, rowItemIds, e.target.value)}
                          >
                            <option value="">Mover a…</option>
                            {siblings.map((s) => (
                              <option key={s.clientId} value={s.clientId}>Tarea {tasks.indexOf(s) + 1}</option>
                            ))}
                            <option value="new">Tarea nueva</option>
                          </select>
                          <button
                            type="button" className="dp-icon" title="Quitar de la tarea"
                            aria-label={`Quitar ${r.productCode} de la tarea ${g.index + 1}`}
                            onClick={() => removeLine(task.clientId, rowItemIds)}
                          >✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                });
                if (addFor === task.clientId) out.push(renderAddRow(task));
                return out;
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>Total repartido</td>
                {colors.map((c) => <td key={c} className="dp-tt-c">{table.placed[c] || 0}</td>)}
                <td className="dp-tt-n">{table.placedTotal}</td>
                <td colSpan={2} />
              </tr>
              <tr className="dp-tt-ask">
                <td colSpan={2}>Pide la orden</td>
                {colors.map((c) => {
                  const left = (table.asked[c] || 0) - (table.placed[c] || 0);
                  return (
                    <td key={c} className={`dp-tt-c ${left > 0 ? "left" : "ok"}`}>
                      {table.asked[c] || 0}{left > 0 ? <><br /><small>faltan {left}</small></> : " ✓"}
                    </td>
                  );
                })}
                <td className="dp-tt-n">{table.askedTotal}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {shownTasks < tasks.length && (
        <div className="dp-more">
          <Button onClick={() => setShownTasks((v) => v + TASKS_PAGE)}>
            Mostrar más tareas ({tasks.length - shownTasks})
          </Button>
        </div>
      )}

      <div className="dp-tfoot">
        <Button onClick={() => setNewOpen((v) => !v)}>＋ Nueva tarea</Button>
        {capacity && capacity.hardHours > 0 && (
          <Button onClick={rebuildTasks} title="Vuelve a repartir según lo que cabe en el día">Llenar el día</Button>
        )}
      </div>
      {newOpen && (
        <div className="dp-addlist">
          {selectedOrders.map((o) => (
            <Button key={o.id} className="dp-sm" onClick={() => createTask(o.id)}>{o.code}</Button>
          ))}
        </div>
      )}

      {leftovers.length > 0 && (
        <div className="dp-tray">
          <strong>Para otro día ({leftovers.length})</strong>
          <p className="dp-small">No caben hoy en las mesas. Siguen pendientes en su OP y no se pierden.</p>
          <ul>
            {leftovers.slice(0, 20).map((l) => (
              <li key={l.item.productionOrderItemId}>
                <span>{l.order.code}</span><span>{l.item.productCode} · {l.item.colorName || "sin color"}</span><strong>{l.quantity} u</strong>
              </li>
            ))}
          </ul>
          {leftovers.length > 20 && <p className="dp-small">… y {leftovers.length - 20} productos más.</p>}
          <Button className="dp-sm" onClick={buildFromLeftovers}>Llenar con esto</Button>
        </div>
      )}
    </div>
  );
}
