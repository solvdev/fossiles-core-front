import React from "react";
import { toIso } from "./onlineLedgerHelper";

const parse = (iso) => new Date(`${String(iso).slice(0, 10)}T12:00:00`);

export const addDays = (iso, days) => {
  const d = parse(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
};

const short = (iso, withWeekday) =>
  parse(iso).toLocaleDateString("es-GT", {
    weekday: withWeekday ? "short" : undefined, day: "numeric", month: "short",
  }).replace(/\./g, "");

/**
 * Flechas por día: con un solo día mueve un día; con un rango mueve el rango completo (7 días → la semana anterior).
 * La flecha de adelante se detiene en hoy.
 */
function DayNav({ from, to, onChange, label = "Día" }) {
  if (!from) return null;
  const end = to && to >= from ? to : from;
  const span = Math.round((parse(end) - parse(from)) / 86400000) + 1;
  const today = toIso(new Date());
  const canNext = end < today;
  const move = (dir) => {
    const nextFrom = addDays(from, dir * span);
    const nextTo = addDays(end, dir * span);
    onChange(nextFrom, nextTo > today && dir > 0 ? today : nextTo);
  };
  const text = span === 1 ? short(from, true) : `${short(from)} – ${short(end)}`;
  return (
    <div>
      <label>{label}</label>
      <div className="ol-period os-daynav" role="group" aria-label={span === 1 ? "Cambiar de día" : "Mover el rango"}>
        <button type="button" onClick={() => move(-1)} aria-label={span === 1 ? "Día anterior" : "Rango anterior"}
          title={span === 1 ? "Día anterior" : `${span} días antes`}>‹</button>
        <span className="name">{text}</span>
        <button type="button" onClick={() => move(1)} disabled={!canNext}
          aria-label={span === 1 ? "Día siguiente" : "Rango siguiente"}
          title={span === 1 ? "Día siguiente" : `${span} días después`}>›</button>
      </div>
    </div>
  );
}

export default DayNav;
