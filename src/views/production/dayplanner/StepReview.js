import React, { useState } from "react";
import { Button, Spinner } from "reactstrap";
import { formatDateGt, isWeekendYmd, shiftYmdGuatemala } from "utils/dateTimeHelper";
import { limitStatus } from "utils/dayPlanHelper";
import { concordar, contar } from "utils/textHelper";
import FamilyBadge from "../organizer/FamilyBadge";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «jue 15/10»: el día de la semana importa más que el año al elegir. */
export function dayShort(ymd) {
  if (!ymd) return "";
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${WEEKDAYS[dow]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Los próximos `n` días de lunes a viernes desde `ymd`, inclusive. */
export function workdaysFrom(ymd, n = 5) {
  const out = [];
  let d = ymd;
  while (out.length < n) {
    if (!isWeekendYmd(d)) out.push(d);
    d = shiftYmdGuatemala(d, 1);
  }
  return out;
}

const BAR_COLOR = { opl: "#aed581", ok: "#6bd098", near: "#fbc658", over: "#ef8157" };

/**
 * Paso 3: revisar. El sistema propone día y una mesa orientativa para cada tarea; el jefe
 * puede aceptar todo o cambiar el día. La mesa real se asigna sola al marcar el corte
 * (compuerta del troquelado), por eso aquí no se elige.
 */
export default function StepReview({ planner }) {
  const {
    tasks, preview, previewLoading, previewError, previewByClientId, date, dates,
    changeTaskDate, runPreview, confirmError, confirm,
  } = planner;
  const [showDesks, setShowDesks] = useState(false);

  if (previewLoading && !preview) {
    return (
      <div className="dp-state">
        <Spinner color="primary" />
        <p className="mt-2 mb-0">Calculando la propuesta…</p>
      </div>
    );
  }
  if (previewError && !preview) {
    return (
      <div className="dp-state">
        <div className="dp-big-icon" aria-hidden="true">⚠️</div>
        <h5>No se pudo calcular la propuesta</h5>
        <p>{previewError}</p>
        <Button color="primary" className="dp-big" onClick={() => runPreview()}>Reintentar</Button>
      </div>
    );
  }
  if (!preview) return null;

  const days = workdaysFrom(date, 5);
  const firstDay = days[0];
  const moved = tasks.filter((t) => {
    const p = previewByClientId[t.clientId];
    return p?.proposedDate && p.proposedDate !== firstDay;
  });
  const movedDays = Array.from(new Set(moved.map((t) => dayShort(previewByClientId[t.clientId].proposedDate))));
  const numDesks = preview.limits?.numDesks || 12;
  const loadDays = Array.from(new Set((preview.dayLoads || []).map((l) => l.date))).sort();

  return (
    <div>
      {confirmError && (
        <div className="dp-note bad" role="alert">
          <div className="dp-x"><strong>No se confirmó.</strong> {confirmError.message}</div>
          {confirmError.code !== "PLAN_CHANGED" && (
            <Button className="dp-sm" onClick={() => confirm()}>Reintentar</Button>
          )}
        </div>
      )}
      <div className="dp-note info">
        <div className="dp-x">
          <strong>{concordar(tasks.length, "La tarea espera", `Las ${tasks.length} tareas esperan`)} corte.</strong>{" "}
          La hoja del día es la que se entrega para cortar. Al marcar el corte, cada tarea baja a su mesa.
          La mesa de abajo es la que propone el sistema y es orientativa; el día sí puede cambiarlo.
        </div>
      </div>
      {moved.length > 0 && (
        <div className="dp-note warn">
          <div className="dp-x">
            <strong>{contar(moved.length, "tarea no cabe", "tareas no caben")} el {formatDateGt(firstDay)}</strong>{" "}
            y {concordar(moved.length, "pasa", "pasan")} a: {movedDays.join(", ")}.
          </div>
        </div>
      )}

      <div className="dp-prow is-head"><span>Tarea</span><span>Horas</span><span>Día</span><span>Mesa</span></div>
      {tasks.map((t, i) => {
        const p = previewByClientId[t.clientId] || {};
        const s = limitStatus(t);
        const shown = s.level === "opl" ? s.totalHours : s.baseHours;
        const day = dates[t.clientId] || p.proposedDate || firstDay;
        return (
          <div className="dp-prow" key={t.clientId}>
            <div className="dp-tt">
              <strong>Tarea {i + 1} · {t.orderCode}</strong>
              <span><FamilyBadge family={t.family} />{s.level === "opl" && <span className="dp-chip opl">PRIORIDAD</span>}</span>
              {(p.messages || []).map((m) => (
                <div key={m} className="dp-small" style={{ color: p.status === "BLOCKED" ? "#a3300f" : "#7a5a00" }}>{m}</div>
              ))}
            </div>
            <div>
              <div className="dp-mini"><i style={{ width: `${s.pct}%`, background: BAR_COLOR[s.level] }} /></div>
              <span className="dp-small">{fmt(shown)} h{s.level === "opl" ? " · OPL" : ""}</span>
            </div>
            <div>
              <select
                className="dp-select"
                aria-label={`Día de la tarea ${i + 1}`}
                value={day}
                onChange={(e) => changeTaskDate(t.clientId, e.target.value)}
              >
                {Array.from(new Set([...days, day])).sort().map((d) => <option key={d} value={d}>{dayShort(d)}</option>)}
              </select>
            </div>
            <div>
              {p.indicativeDesk ? <strong>Mesa {p.indicativeDesk}</strong> : <span className="dp-small">Sin mesa libre</span>}
              <div className="dp-small">orientativa</div>
              {p.overcapAnchor && <div className="dp-small" style={{ color: "#7a5a00" }}>Puede pasar del cupo hoy</div>}
            </div>
          </div>
        );
      })}

      <div style={{ marginTop: 10 }}>
        <button type="button" className="dp-link" aria-expanded={showDesks} onClick={() => setShowDesks((v) => !v)}>
          Ver carga por mesa {showDesks ? "▾" : "▸"}
        </button>
      </div>
      {showDesks && (
        <div>
          <div className="dp-legend">
            <span><b style={{ background: "#b9b4aa" }} />Ya tenía</span>
            <span><b style={{ background: "#1d7fa3" }} />Lo nuevo</span>
          </div>
          {loadDays.map((d) => (
            <div key={d} style={{ marginTop: 8 }}>
              <strong>{dayShort(d)}</strong>
              <div className="dp-deskgrid">
                {Array.from({ length: numDesks }, (_, k) => k + 1).map((desk) => {
                  const row = (preview.dayLoads || []).find((l) => l.date === d && l.desk === desk) || {};
                  const cur = row.currentHours || 0;
                  const add = row.addedHours || 0;
                  const total = cur + add;
                  const w1 = Math.min(cur / 4, 1) * 100;
                  const w2 = Math.max(0, Math.min(add / 4, 1 - w1 / 100) * 100);
                  return (
                    <div className="dp-desk" key={desk}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <b>Mesa {desk}</b>
                        <span style={total > 4.0001 ? { color: "#a3300f", fontWeight: 800 } : { color: "#66615b" }}>{fmt(total)} h</span>
                      </div>
                      <div className="dp-stack">
                        <i style={{ width: `${w1}%`, background: "#b9b4aa" }} />
                        <i style={{ width: `${w2}%`, background: "#1d7fa3" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
