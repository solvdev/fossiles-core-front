import React, { useState } from "react";
import { Button } from "reactstrap";
import { useNavigate } from "react-router-dom";
import DownloadOpsModal from "components/production/DownloadOpsModal";
import { showError } from "utils/notificationHelper";
import { concordar, contar } from "utils/textHelper";
import { isConsolidatedTask, taskOrderCodes } from "utils/dayPlanHelper";
import { dayShort } from "./StepReview";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);

/**
 * Paso 4: listo. Resume lo creado y deja a un clic «Descargar OPs» (las OPs del día, para
 * entregarlas a quien corta) y la hoja de mesas (Excel o impresión).
 */
export default function StepDone({ planner }) {
  const { result, tasks, date, downloadSheet, printSheet, loadOpsDownload, startOver } = planner;
  const navigate = useNavigate();
  const [opsData, setOpsData] = useState(null);
  const [opsBusy, setOpsBusy] = useState(false);
  const openOps = async (ymd) => {
    setOpsBusy(true);
    try {
      setOpsData(await loadOpsDownload(ymd));
    } catch (err) {
      showError(err.message || "No se pudieron cargar las OPs del día.");
    } finally {
      setOpsBusy(false);
    }
  };
  if (!result) return null;

  const created = result.created || [];
  // Una OPL combinada comparte tarea con su anfitriona: se cuenta una sola tarea creada.
  const createdTasks = created.filter((c) => !c.mergedInto);
  const leftovers = result.leftovers || [];
  const byClient = Object.fromEntries(tasks.map((t) => [t.clientId, t]));
  const otherDays = Array.from(new Set(created.map((c) => c.scheduledDate).filter((d) => d && d !== date))).sort();
  const hoursOf = (clientId) => {
    const t = byClient[clientId];
    return t ? t.lines.reduce((s, l) => s + l.quantity * (l.prdTimePerUnit || 0.1), 0) : 0;
  };

  return (
    <div>
      <div className="dp-okbox">
        <div className="dp-ck" aria-hidden="true">✓</div>
        <h4 style={{ margin: 0 }}>{contar(createdTasks.length, "tarea creada", "tareas creadas")}</h4>
        <p className="dp-small" style={{ fontSize: 15 }}>
          Día asignado · {concordar(createdTasks.length, "baja", "bajan")} a mesa al marcar el corte.
        </p>
      </div>
      {(result.notPlaced || []).length > 0 && (
        <div className="dp-note warn">
          <div className="dp-x">
            {contar(result.notPlaced.length, "tarea no cupo", "tareas no cupieron")} en los días disponibles y {concordar(result.notPlaced.length, "no se creó", "no se crearon")}:
            {" "}{concordar(leftovers.length, "queda", "quedan")} {contar(leftovers.length, "producto", "productos")} para otro día.
          </div>
        </div>
      )}
      <div className="dp-actions">
        <Button color="primary" className="dp-big" disabled={opsBusy} onClick={() => openOps(date)}>
          {opsBusy ? "Cargando…" : "⬇ Descargar OPs"}
        </Button>
        <Button className="dp-big" onClick={() => downloadSheet(date)}>Hoja de mesas (Excel)</Button>
        <Button className="dp-big" onClick={() => printSheet(date)}>🖨 Hoja de mesas (PDF)</Button>
      </div>
      {otherDays.length > 0 && (
        <div className="dp-actions" style={{ marginTop: 0 }}>
          {otherDays.map((d) => (
            <React.Fragment key={d}>
              <Button className="dp-sm" disabled={opsBusy} onClick={() => openOps(d)}>⬇ OPs del {dayShort(d)}</Button>
              <Button className="dp-sm" onClick={() => downloadSheet(d)}>⬇ Hoja del {dayShort(d)}</Button>
            </React.Fragment>
          ))}
        </div>
      )}
      <div className="dp-actions" style={{ marginTop: 0 }}>
        <Button onClick={() => navigate("/admin/tasks-by-station")}>Ver tablero de mesas</Button>
        <Button onClick={startOver}>Armar otro grupo</Button>
      </div>
      <DownloadOpsModal
        isOpen={!!opsData}
        toggle={() => setOpsData(null)}
        orders={opsData?.orders || []}
        tasks={opsData?.dayDeskTasks || []}
        dayDeskTasks={opsData?.dayDeskTasks || []}
        workDateYmd={opsData?.date || date}
      />
      <ul className="dp-list">
        {created.map((c) => {
          const t = byClient[c.clientId];
          if (c.mergedInto) {
            return (
              <li key={c.clientId || c.taskId}>
                <strong>{c.code}</strong>
                <span>{t ? t.orderCode : ""}</span>
                <span>{fmt(hoursOf(c.clientId))} h</span>
                <span>OPL combinada: va primero en esta tarea</span>
              </li>
            );
          }
          return (
            <li key={c.clientId || c.taskId}>
              <strong>{c.code}</strong>
              <span>{t ? (isConsolidatedTask(t) ? `${t.groupCode}: ${taskOrderCodes(t).join(", ")}` : t.orderCode) : ""}</span>
              <span>{fmt(hoursOf(c.clientId))} h</span>
              <span>{dayShort(c.scheduledDate)}{c.indicativeDesk ? ` · Mesa ${c.indicativeDesk}` : ""} <span className="dp-small">(se activa al cortar)</span></span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
