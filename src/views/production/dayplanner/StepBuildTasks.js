import React, { useState } from "react";
import { Button } from "reactstrap";
import { leftoverQuantity, limitStatus, lineHours, planBlockers, summarizePlan } from "utils/dayPlanHelper";
import { contar } from "utils/textHelper";
import FamilyBadge from "../dayboard/FamilyBadge";
import TaskCapacityBar from "./TaskCapacityBar";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);

const TASKS_PAGE = 25;
const CHIP_TEXT = { opl: "OPL · prioridad", ok: "Cabe", near: "Cerca del límite", over: "Se pasó" };

function TaskCard({ task, index, tasks, planner, open, onToggle, addOpen, onToggleAdd }) {
  const { orders, changeQty, removeLine, moveLine, addItem, fixTask, itemById } = planner;
  const status = limitStatus(task);
  const order = orders.find((o) => o.id === task.orderId);
  const siblings = tasks.filter((t) => t.orderId === task.orderId && t.clientId !== task.clientId);
  const addable = (order?.items || []).filter((it) => leftoverQuantity(it, tasks) > 0);

  return (
    <div className={`dp-tcard lv-${status.level}`}>
      <div className="dp-thead">
        <span className="dp-tn">Tarea {index + 1}</span>
        <span><FamilyBadge family={task.family} /></span>
        <strong>{task.orderCode}</strong>
        <span className={`dp-chip ${status.level}`}>{CHIP_TEXT[status.level]}</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="dp-link" aria-expanded={open} onClick={onToggle}>
          Ver {contar(task.lines.length, "producto")} {open ? "▾" : "▸"}
        </button>
      </div>
      <TaskCapacityBar task={task} />
      {open && (
        <div className="dp-tbody">
          {task.lines.length === 0 && (
            <p className="dp-small">La tarea está vacía. Agregue un producto.</p>
          )}
          {task.lines.map((l) => {
            const item = itemById(l.productionOrderItemId);
            const noMore = !item || leftoverQuantity(item, tasks) <= 0;
            return (
              <div className="dp-line" key={l.productionOrderItemId}>
                <div className="dp-nm">
                  <strong>{l.productCode} {l.productName}{l.colorName ? ` · ${l.colorName}` : ""}</strong>
                  <small>{fmt(l.prdTimePerUnit)} h por unidad · {fmt(lineHours(l.quantity, l.prdTimePerUnit))} h</small>
                </div>
                <div className="dp-qty">
                  <button
                    type="button" className="dp-icon"
                    aria-label={`Quitar una unidad de ${l.productName}`}
                    onClick={() => changeQty(task.clientId, l.productionOrderItemId, -1)}
                  >−</button>
                  <output>{l.quantity}</output>
                  <button
                    type="button" className="dp-icon" disabled={noMore}
                    title={noMore ? "No quedan más unidades" : undefined}
                    aria-label={`Agregar una unidad de ${l.productName}`}
                    onClick={() => changeQty(task.clientId, l.productionOrderItemId, 1)}
                  >+</button>
                </div>
                <select
                  className="dp-select"
                  value=""
                  aria-label={`Mover ${l.productName} a otra tarea`}
                  onChange={(e) => e.target.value && moveLine(task.clientId, l.productionOrderItemId, e.target.value)}
                >
                  <option value="">Mover a…</option>
                  {siblings.map((s) => (
                    <option key={s.clientId} value={s.clientId}>Tarea {tasks.indexOf(s) + 1}</option>
                  ))}
                  <option value="new">Tarea nueva</option>
                </select>
                <button
                  type="button" className="dp-icon" title="Quitar de la tarea"
                  aria-label={`Quitar ${l.productName} de la tarea`}
                  onClick={() => removeLine(task.clientId, l.productionOrderItemId)}
                >✕</button>
              </div>
            );
          })}
          <div className="dp-tfoot">
            <Button className="dp-sm" onClick={onToggleAdd}>＋ Producto</Button>
            {status.level === "over" && (
              <Button color="success" className="dp-sm" onClick={() => fixTask(task.clientId)}>Arreglar sola</Button>
            )}
          </div>
          {addOpen && (
            <div className="dp-addlist">
              {addable.length === 0 ? (
                <span className="dp-small">No quedan productos de esta OP por agregar.</span>
              ) : addable.map((it) => (
                <Button key={it.productionOrderItemId} className="dp-sm" onClick={() => { addItem(task.clientId, it.productionOrderItemId); onToggleAdd(); }}>
                  {it.productName} · quedan {leftoverQuantity(it, tasks)}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Paso 2: armar tareas. Llega ya sugerido (por OP, OPL primero, hasta 4 h por tarea) y el
 * jefe solo ajusta. Cada tarjeta muestra su carga frente al límite; sobre 5 h se bloquea.
 */
export default function StepBuildTasks({ planner }) {
  const { tasks, notice, setNotice, selectedOrders, newTask, leftovers, buildFromLeftovers, rebuildTasks, capacity } = planner;
  const [openIds, setOpenIds] = useState({});
  const [addFor, setAddFor] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [shownTasks, setShownTasks] = useState(TASKS_PAGE);
  const summary = summarizePlan(tasks);
  const blockers = planBlockers(tasks);

  const createTask = (orderId) => {
    const id = newTask(orderId);
    if (id) { setOpenIds((o) => ({ ...o, [id]: true })); setAddFor(id); }
    setNewOpen(false);
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
          {blockers.length ? <strong>{blockers.length} con problemas</strong> : "0 con problemas"}
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="dp-state">
          <h5>Aún no hay tareas</h5>
          <Button color="primary" onClick={rebuildTasks}>Armar tareas otra vez</Button>
        </div>
      ) : tasks.slice(0, shownTasks).map((t, i) => (
        <TaskCard
          key={t.clientId}
          task={t}
          index={i}
          tasks={tasks}
          planner={planner}
          open={!!openIds[t.clientId]}
          onToggle={() => setOpenIds((o) => ({ ...o, [t.clientId]: !o[t.clientId] }))}
          addOpen={addFor === t.clientId}
          onToggleAdd={() => setAddFor((cur) => (cur === t.clientId ? null : t.clientId))}
        />
      ))}

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
                <span>{l.order.code}</span><span>{l.item.productName}</span><strong>{l.quantity} u</strong>
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
