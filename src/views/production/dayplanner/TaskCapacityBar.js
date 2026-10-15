import React from "react";
import { MAX_HOURS_PER_DESK, MAX_HOURS_PER_TASK_HARD_CAP } from "utils/taskHoursHelper";
import { limitStatus } from "utils/dayPlanHelper";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);

/** Mensajes de la barra por nivel. Se exportan para que las pruebas no dependan del marcado. */
export function capacityTexts(task) {
  const s = limitStatus(task);
  switch (s.level) {
    case "opl":
      return { left: `${fmt(s.totalHours)} h · OPL`, right: "No cuenta contra el límite", status: s };
    case "ok":
      return { left: `${fmt(s.baseHours)} h de ${MAX_HOURS_PER_DESK} h`, right: "Cabe bien", status: s };
    case "near":
      return s.overIdeal
        ? { left: `${fmt(s.baseHours)} h · pasa de ${MAX_HOURS_PER_DESK} h`, right: `Permitido hasta ${MAX_HOURS_PER_TASK_HARD_CAP} h`, status: s }
        : { left: `${fmt(s.baseHours)} h de ${MAX_HOURS_PER_DESK} h`, right: "Cerca del límite", status: s };
    default:
      return { left: `${fmt(s.baseHours)} h · se pasó de ${MAX_HOURS_PER_TASK_HARD_CAP} h`, right: "No se puede confirmar", status: s };
  }
}

/**
 * Barra de una tarea frente al límite de la mesa: escala de 0 a 5 h con la marca de las 4 h
 * ideales. Verde / ámbar / rojo según `limitStatus`; las OPL van aparte, sin color de alerta.
 */
export default function TaskCapacityBar({ task }) {
  const { left, right, status } = capacityTexts(task);
  const idealPct = (MAX_HOURS_PER_DESK / MAX_HOURS_PER_TASK_HARD_CAP) * 100;
  return (
    <div className="dp-cap" data-level={status.level}>
      <div className="dp-cap-txt"><span>{left}</span><span className="dp-small">{right}</span></div>
      <div className="dp-track" role="img" aria-label={`${fmt(status.level === "opl" ? status.totalHours : status.baseHours)} horas`}>
        <div className={`dp-fill ${status.level}`} style={{ width: `${status.pct}%` }} />
        <div className="dp-tick" style={{ left: `${idealPct}%` }} title={`Ideal ${MAX_HOURS_PER_DESK} h`} />
      </div>
      <div className="dp-scale">
        <span style={{ left: 0 }}>0</span>
        <span style={{ left: `${idealPct}%` }}>ideal {MAX_HOURS_PER_DESK} h</span>
        <span style={{ left: "100%" }}>máx. {MAX_HOURS_PER_TASK_HARD_CAP} h</span>
      </div>
    </div>
  );
}
