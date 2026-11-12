import React, { useEffect, useMemo, useState } from "react";
import { Button } from "reactstrap";
import {
  TL_END, TL_LUNCH, TL_START, deskTitle, fmtDay, fmtMinutes, groupByDay, hhmm, itemsText, timelineForDay,
} from "./deskHistoryHelpers";
import { CARD, DiffPill, Pill, Stat, StatusPill, TaskTable, TimeBar } from "./DeskHistoryParts";

/** Encabezado plegable común a mesas y órdenes. */
function Collapsible({ open, onToggle, header, children }) {
  return (
    <div style={CARD}>
      <button
        type="button"
        onClick={onToggle}
        style={{ width: "100%", textAlign: "left", background: "transparent", border: 0, padding: "14px 16px", cursor: "pointer" }}
        aria-expanded={open}
      >
        <div className="d-flex align-items-center" style={{ gap: 14 }}>
          <i className={`nc-icon ${open ? "nc-minimal-down" : "nc-minimal-right"}`} style={{ fontSize: 14, color: "#6b7280" }} />
          <div style={{ flex: 1, minWidth: 0 }}>{header}</div>
        </div>
      </button>
      {open && <div style={{ borderTop: "1px solid #e5e7eb", padding: "6px 8px 10px" }}>{children}</div>}
    </div>
  );
}

function useOpenSet(keys, defaultOpen) {
  const [open, setOpen] = useState(() => new Set(defaultOpen ? keys : []));
  const sig = keys.join("|");
  useEffect(() => {
    setOpen(new Set(defaultOpen ? keys : []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, defaultOpen]);
  const toggle = (k) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });
  return { open, toggle, setAll: (all) => setOpen(new Set(all ? keys : [])) };
}

function ExpandAll({ allOpen, onAll }) {
  return (
    <div className="text-right mb-2">
      <Button size="sm" color="link" onClick={() => onAll(!allOpen)} style={{ padding: 0 }}>
        {allOpen ? "Contraer todo" : "Expandir todo"}
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ por mesa

export function ByDeskView({ groups, idleDesks, onPick, selectedId }) {
  const keys = useMemo(() => groups.map((g) => g.desk), [groups]);
  const { open, toggle, setAll } = useOpenSet(keys, groups.length <= 2);

  if (!groups.length) return null;
  return (
    <>
      <ExpandAll allOpen={open.size === keys.length} onAll={setAll} />
      {groups.map((g) => {
        const s = g.summary;
        return (
          <Collapsible
            key={g.desk}
            open={open.has(g.desk)}
            onToggle={() => toggle(g.desk)}
            header={(
              <div className="d-flex flex-wrap align-items-center" style={{ gap: 18 }}>
                <div style={{ minWidth: 190 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{deskTitle(g.info, g.desk)}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {g.info.supervisorName ? `Encargado: ${g.info.supervisorName}` : "Sin encargado asignado"}
                  </div>
                </div>
                <Stat label="Tareas" value={s.tasks} sub={`${s.done} terminada${s.done === 1 ? "" : "s"}${s.inProgress ? ` · ${s.inProgress} en proceso` : ""}`} />
                <Stat label="Piezas" value={s.pieces} />
                <Stat label="Tiempo trabajado" value={fmtMinutes(s.workedMinutes)} sub={s.avgMinutes != null ? `${fmtMinutes(s.avgMinutes)} por tarea` : null} />
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280" }}>
                    Terminadas: trabajado vs esperado
                  </div>
                  <TimeBar worked={s.doneWorked} expected={s.doneExpected} />
                  <div style={{ fontSize: 11, color: "#6b7280" }}>
                    {s.doneExpected ? `${fmtMinutes(s.doneWorked)} de ${fmtMinutes(s.doneExpected)}` : "Sin tareas terminadas con tiempo"}
                  </div>
                </div>
                {s.delayed > 0 && <Pill color="#991b1b" bg="#fee2e2">{s.delayed} atrasada{s.delayed === 1 ? "" : "s"}</Pill>}
              </div>
            )}
          >
            {g.days.map((d) => (
              <div key={d.day} style={{ marginTop: 10 }}>
                <div className="d-flex align-items-center" style={{ gap: 10, padding: "4px 8px" }}>
                  <strong style={{ textTransform: "capitalize" }}>{fmtDay(d.day)}</strong>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    {d.summary.tasks} tarea{d.summary.tasks === 1 ? "" : "s"} · {d.summary.pieces} piezas · {fmtMinutes(d.summary.workedMinutes)}
                  </span>
                </div>
                <TaskTable entries={d.entries} mode="desk" onPick={onPick} selectedId={selectedId} />
              </div>
            ))}
          </Collapsible>
        );
      })}
      {idleDesks.length > 0 && (
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
          Sin tareas en este rango: {idleDesks.map((d) => deskTitle(d, d.desk)).join(" · ")}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------ por orden

export function ByOrderView({ groups, onPick, selectedId }) {
  const keys = useMemo(() => groups.map((g) => g.code), [groups]);
  const { open, toggle, setAll } = useOpenSet(keys, groups.length <= 2);
  if (!groups.length) return null;
  return (
    <>
      <ExpandAll allOpen={open.size === keys.length} onAll={setAll} />
      {groups.map((g) => {
        const s = g.summary;
        return (
          <Collapsible
            key={g.code}
            open={open.has(g.code)}
            onToggle={() => toggle(g.code)}
            header={(
              <div className="d-flex flex-wrap align-items-center" style={{ gap: 18 }}>
                <div style={{ minWidth: 190 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{g.code}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {g.firstDay === g.lastDay ? fmtDay(g.firstDay) : `${fmtDay(g.firstDay)} → ${fmtDay(g.lastDay)}`}
                  </div>
                </div>
                <Stat label="Tareas" value={s.tasks} sub={`${s.done} terminada${s.done === 1 ? "" : "s"}`} />
                <Stat label="Piezas" value={s.pieces} />
                <Stat label="Tiempo trabajado" value={fmtMinutes(s.workedMinutes)} sub={s.expectedMinutes ? `${fmtMinutes(s.expectedMinutes)} esperados` : null} />
                <div style={{ flex: 1, minWidth: 170 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280" }}>
                    Pasó por
                  </div>
                  <div className="d-flex flex-wrap" style={{ gap: 4, marginTop: 2 }}>
                    {g.desks.map((d) => <Pill key={d} color="#1d4ed8" bg="#dbeafe">Mesa {d}</Pill>)}
                  </div>
                </div>
                {s.delayed > 0 && <Pill color="#991b1b" bg="#fee2e2">{s.delayed} atrasada{s.delayed === 1 ? "" : "s"}</Pill>}
              </div>
            )}
          >
            <TaskTable entries={g.entries} mode="order" onPick={onPick} selectedId={selectedId} />
          </Collapsible>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ línea de tiempo

const LABEL_W = 150;
const LANE_H = 30;
const pct = (min) => ((min - TL_START) / (TL_END - TL_START)) * 100;

function barColors(e) {
  if (e.delayed) return { bg: "#fecaca", border: "#ef4444", fg: "#7f1d1d" };
  if (e.status === "IN_PROGRESS") return { bg: "#bfdbfe", border: "#3b82f6", fg: "#1e3a8a" };
  return { bg: "#a7f3d0", border: "#10b981", fg: "#064e3b" };
}

export function TimelineView({ entries, desks, nowIso, onPick, selectedId }) {
  const days = useMemo(() => groupByDay(entries.filter((e) => e.startedAt)).map((d) => d.day), [entries]);
  const [day, setDay] = useState(null);
  const current = day && days.includes(day) ? day : days[0] || null;

  const rows = useMemo(() => {
    if (!current) return [];
    const infoByDesk = new Map(desks.map((d) => [d.desk, d]));
    const deskNums = [...new Set(entries.map((e) => e.desk))].sort((a, b) => a - b);
    return deskNums
      .map((n) => ({ desk: n, info: infoByDesk.get(n) || { desk: n }, ...timelineForDay(entries.filter((e) => e.desk === n), current, nowIso) }))
      .filter((r) => r.segments.length > 0);
  }, [entries, desks, current, nowIso]);

  if (!days.length) {
    return <div style={{ ...CARD, padding: 24, textAlign: "center", color: "#6b7280" }}>
      Ninguna tarea de este rango tiene hora de inicio, así que no hay nada que dibujar.
    </div>;
  }

  const hours = [];
  for (let h = TL_START / 60; h <= TL_END / 60; h += 1) hours.push(h);

  return (
    <>
      <div className="d-flex flex-wrap mb-3" style={{ gap: 6 }}>
        {days.map((d) => (
          <Button key={d} size="sm" color={d === current ? "info" : "secondary"} outline={d !== current} onClick={() => setDay(d)} style={{ textTransform: "capitalize" }}>
            {fmtDay(d)}
          </Button>
        ))}
      </div>

      <div style={{ ...CARD, padding: "12px 14px", overflowX: "auto" }}>
        <div style={{ minWidth: 720 }}>
          {/* eje de horas */}
          <div style={{ display: "flex", marginBottom: 4 }}>
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            <div style={{ position: "relative", flex: 1, height: 18 }}>
              {hours.map((h) => (
                <span key={h} style={{ position: "absolute", left: `${pct(h * 60)}%`, transform: "translateX(-50%)", fontSize: 11, color: "#6b7280" }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
          </div>

          {rows.map((r) => (
            <div key={r.desk} style={{ display: "flex", borderTop: "1px solid #f3f4f6" }}>
              <div style={{ width: LABEL_W, flexShrink: 0, padding: "6px 8px 6px 0" }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>{deskTitle(r.info, r.desk)}</div>
                <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.info.supervisorName || "Sin encargado"}
                </div>
              </div>
              <div style={{ position: "relative", flex: 1, height: r.lanes * LANE_H + 8 }}>
                {hours.map((h) => (
                  <div key={h} style={{ position: "absolute", left: `${pct(h * 60)}%`, top: 0, bottom: 0, borderLeft: "1px solid #f3f4f6" }} />
                ))}
                <div
                  title="Almuerzo"
                  style={{
                    position: "absolute", top: 0, bottom: 0, left: `${pct(TL_LUNCH[0])}%`, width: `${pct(TL_LUNCH[1]) - pct(TL_LUNCH[0])}%`,
                    background: "repeating-linear-gradient(45deg,#f9fafb,#f9fafb 6px,#f3f4f6 6px,#f3f4f6 12px)",
                  }}
                />
                {r.segments.map((s) => {
                  const c = barColors(s.entry);
                  const e = s.entry;
                  return (
                    <button
                      type="button"
                      key={`${e.taskId}`}
                      onClick={() => onPick && onPick(e)}
                      title={`${e.code} · ${e.productionOrderCode || "Sin orden"}\n${itemsText(e)}\n${hhmm(e.startedAt)} → ${e.completedAt ? hhmm(e.completedAt) : "sigue"} · ${fmtMinutes(e.workedMinutes)}`}
                      style={{
                        position: "absolute", top: 4 + s.lane * LANE_H, height: LANE_H - 4,
                        left: `${pct(s.from)}%`, width: `${Math.max(0.8, pct(s.to) - pct(s.from))}%`,
                        background: c.bg, border: `1.5px solid ${selectedId === e.taskId ? "#111827" : c.border}`, color: c.fg,
                        borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "0 5px", overflow: "hidden",
                        whiteSpace: "nowrap", textOverflow: "ellipsis", cursor: "pointer", textAlign: "left",
                      }}
                    >
                      {e.productionOrderCode || e.code}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {!rows.length && <div style={{ padding: 16, color: "#6b7280" }}>Ese día no hay tareas con horario.</div>}
        </div>
      </div>

      <div className="d-flex flex-wrap" style={{ gap: 14, fontSize: 12, color: "#4b5563" }}>
        <span><Swatch c="#a7f3d0" b="#10b981" /> Terminada a tiempo</span>
        <span><Swatch c="#fecaca" b="#ef4444" /> Atrasada</span>
        <span><Swatch c="#bfdbfe" b="#3b82f6" /> En proceso</span>
        <span><Swatch c="#f3f4f6" b="#d1d5db" /> Almuerzo</span>
        <span style={{ color: "#6b7280" }}>Cada barra va del inicio al cierre de la tarea dentro de la jornada (07:00–17:00).</span>
      </div>
    </>
  );
}

function Swatch({ c, b }) {
  return <span style={{ display: "inline-block", width: 14, height: 10, background: c, border: `1.5px solid ${b}`, borderRadius: 3, marginRight: 4 }} />;
}

// ------------------------------------------------------------------ detalle de una tarea

export function TaskDetail({ entry, onClose }) {
  if (!entry) return null;
  return (
    <div style={{ ...CARD, padding: "14px 16px", borderColor: "#93c5fd", background: "#f8fbff" }}>
      <div className="d-flex align-items-start justify-content-between">
        <div>
          <div style={{ fontSize: 17, fontWeight: 800 }}>
            {entry.code} <span style={{ color: "#6b7280", fontWeight: 600 }}>· {entry.productionOrderCode || "Sin orden"}</span>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            Mesa {entry.desk}{entry.supervisorName ? ` (${entry.supervisorName})` : ""} · {fmtDay(entry.day)}
            {entry.scheduledDate && entry.scheduledDate !== entry.day ? ` · programada ${fmtDay(entry.scheduledDate)}` : ""}
          </div>
        </div>
        <Button size="sm" color="link" onClick={onClose}>Cerrar</Button>
      </div>
      <div className="d-flex flex-wrap mt-2" style={{ gap: 22 }}>
        <Stat label="Inicio" value={entry.startedAt ? `${hhmm(entry.startedAt)}` : "—"} sub={entry.startedAt ? fmtDay(String(entry.startedAt).slice(0, 10)) : "No se inició"} />
        <Stat label="Cierre" value={entry.completedAt ? hhmm(entry.completedAt) : "—"} sub={entry.completedAt ? fmtDay(String(entry.completedAt).slice(0, 10)) : null} />
        <Stat label="Trabajado" value={fmtMinutes(entry.workedMinutes)} sub="sin noches, almuerzo ni pausas" />
        <Stat label="Esperado" value={fmtMinutes(entry.expectedMinutes)} />
        <div><div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>Resultado</div><DiffPill entry={entry} /> <StatusPill entry={entry} /></div>
      </div>
      <div className="mt-2">
        {(entry.items || []).map((i, idx) => (
          <div key={idx} style={{ fontSize: 13 }}>
            • <strong>{i.productName || i.productCode}</strong>{i.colorName ? ` · ${i.colorName}` : ""} — {i.quantity} pz
          </div>
        ))}
      </div>
    </div>
  );
}
