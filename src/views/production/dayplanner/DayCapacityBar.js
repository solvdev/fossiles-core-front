import React from "react";
import { contar } from "utils/textHelper";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);

/** Mensajes de la barra del día por nivel. Se exportan para probarlos sin depender del marcado. */
export function dayCapacityTexts(capacity, planLoad) {
  if (!capacity || !capacity.hardHours) {
    return {
      level: "none",
      title: "No se pudo leer cuántas mesas hay activas ese día",
      detail: "El plan no se limita por capacidad; el servidor lo validará al confirmar.",
    };
  }
  const left = Math.max(0, capacity.idealHours - planLoad.usedHours);
  const base = `${contar(capacity.desks, "mesa activa", "mesas activas")} · ${fmt(capacity.idealHours)} h ideales (tope ${fmt(capacity.hardHours)} h)`;
  const planned = capacity.plannedHours > 0 ? ` · ya planificado ${fmt(capacity.plannedHours)} h` : "";
  if (planLoad.level === "over") {
    return {
      level: "over",
      title: `El plan pasa del tope del día: ${fmt(planLoad.usedHours)} h de ${fmt(capacity.hardHours)} h`,
      detail: `${base}${planned}. Quite productos o déjelos para otro día.`,
    };
  }
  if (planLoad.level === "near") {
    return {
      level: "near",
      title: `${fmt(planLoad.usedHours)} h de ${fmt(capacity.idealHours)} h ideales: pasa de lo ideal, cabe en el tope`,
      detail: `${base}${planned}.`,
    };
  }
  return {
    level: "ok",
    title: `${fmt(planLoad.usedHours)} h de ${fmt(capacity.idealHours)} h · quedan ${fmt(left)} h`,
    detail: `${base}${planned}.`,
  };
}

const CAP_CSS = `
.dp-daycap{border:1px solid #e3e3e3;border-radius:10px;padding:10px 14px;background:#fff}
.dp-daycap[data-level=over]{border-color:#f3b49f;background:#fdece6}
.dp-daycap[data-level=near]{border-color:#f3d37a;background:#fff7e0}
.dp-daycap[data-level=none]{background:#f4f2ee}
.dp-daycap .dp-track{position:relative;height:16px;background:#ebe8e1;border-radius:999px;margin:8px 0}
.dp-daycap .dp-fill{height:100%;border-radius:999px;transition:width .25s}
.dp-daycap .dp-fill.ok{background:#6bd098}.dp-daycap .dp-fill.near{background:#fbc658}.dp-daycap .dp-fill.over{background:#ef8157}
.dp-daycap .dp-tick{position:absolute;top:-4px;bottom:-4px;width:2px;background:#4d4a45}
.dp-daycap .dp-small{font-size:13px;color:#66615b}
@media (prefers-reduced-motion:reduce){.dp-daycap .dp-fill{transition:none}}
`;

/**
 * Barra del día: cuántas horas caben según las mesas activas de la fecha y cuánto lleva el
 * plan. Escala de 0 al tope (5 h por mesa) con la marca de las horas ideales (4 h por mesa).
 */
export default function DayCapacityBar({ capacity, planLoad }) {
  const { level, title, detail } = dayCapacityTexts(capacity, planLoad);
  const idealPct = capacity && capacity.hardHours ? (capacity.idealHours / capacity.hardHours) * 100 : 80;
  const plannedPct = capacity && capacity.hardHours ? Math.min(capacity.plannedHours / capacity.hardHours, 1) * 100 : 0;
  return (
    <div className="dp-daycap" data-level={level} role="status">
      <style>{CAP_CSS}</style>
      <div className="dp-cap-txt"><strong>{title}</strong></div>
      {level !== "none" && (
        <div className="dp-track" role="img" aria-label={`${fmt(planLoad.usedHours)} horas de ${fmt(capacity.hardHours)}`}>
          <div className="dp-fill" style={{ position: "absolute", top: 0, left: 0, width: `${plannedPct}%`, background: "#8a867e", borderRadius: "999px 0 0 999px" }} title="Ya planificado" />
          <div className={`dp-fill ${level}`} style={{ position: "absolute", top: 0, left: `${plannedPct}%`, width: `${Math.max(0, planLoad.pct - plannedPct)}%` }} title="Este plan" />
          <div className="dp-tick" style={{ left: `${idealPct}%` }} title="Horas ideales" />
        </div>
      )}
      <div className="dp-small">{detail}</div>
    </div>
  );
}
