import React from "react";
import { Table } from "reactstrap";
import { fmtDay, fmtDiff, fmtMinutes, hhmm, isDone, statusMeta } from "./deskHistoryHelpers";

export const CARD = { border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff", marginBottom: 14 };

export function Pill({ children, color = "#374151", bg = "#f3f4f6", title }) {
  return (
    <span
      title={title}
      style={{
        display: "inline-block", background: bg, color, borderRadius: 999, padding: "2px 10px",
        fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function StatusPill({ entry }) {
  const m = statusMeta(entry.status);
  return (
    <>
      <Pill color={m.color} bg={m.bg}>{m.label}</Pill>
      {entry.paused && <Pill color="#92400e" bg="#fef3c7" title="El reloj está detenido">En pausa</Pill>}
    </>
  );
}

/** Trabajado contra esperado de una tarea, en un solo vistazo. */
export function DiffPill({ entry }) {
  if (entry.workedMinutes == null || entry.expectedMinutes == null) return <span style={{ color: "#9ca3af" }}>—</span>;
  const diff = entry.workedMinutes - entry.expectedMinutes;
  const label = fmtDiff(entry.workedMinutes, entry.expectedMinutes);
  if (entry.delayed) {
    return (
      <span>
        <Pill color="#991b1b" bg="#fee2e2" title="Pasó de lo esperado más la tolerancia de 30 min">{label}</Pill>
        {entry.delayForgiven && <Pill color="#065f46" bg="#d1fae5" title="El atraso fue perdonado">Perdonada</Pill>}
      </span>
    );
  }
  if (diff > 0) return <Pill color="#92400e" bg="#fef3c7" title="Dentro de la tolerancia">{label}</Pill>;
  return <Pill color="#065f46" bg="#d1fae5">{label}</Pill>;
}

/** Barra de tiempo trabajado contra esperado (solo tareas terminadas). */
export function TimeBar({ worked, expected, height = 8 }) {
  if (!expected) return null;
  const ratio = worked / expected;
  const color = ratio <= 1 ? "#10b981" : ratio <= 1.3 ? "#f59e0b" : "#ef4444";
  return (
    <div
      style={{ position: "relative", height, borderRadius: height / 2, background: "#e5e7eb", overflow: "hidden" }}
      title={`${fmtMinutes(worked)} trabajados de ${fmtMinutes(expected)} esperados`}
    >
      <div style={{ width: `${Math.min(100, ratio * 100)}%`, height: "100%", background: color }} />
    </div>
  );
}

export function Stat({ label, value, sub, tone = "#111827" }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, color: tone, lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#6b7280" }}>{sub}</div>}
    </div>
  );
}

function Products({ entry }) {
  const items = entry.items || [];
  if (!items.length) return <span style={{ color: "#9ca3af" }}>—</span>;
  const shown = items.slice(0, 3);
  return (
    <div style={{ lineHeight: 1.35 }}>
      {shown.map((i, idx) => (
        <div key={idx} style={{ fontSize: 12 }}>
          <strong>{i.productName || i.productCode || "Producto"}</strong>
          {i.colorName ? <span style={{ color: "#6b7280" }}> · {i.colorName}</span> : null}
          <span style={{ color: "#374151", fontWeight: 700 }}> ×{i.quantity ?? 0}</span>
        </div>
      ))}
      {items.length > shown.length && (
        <div
          style={{ fontSize: 11, color: "#6b7280" }}
          title={items.slice(3).map((i) => `${i.productName} ${i.colorName || ""} ×${i.quantity}`).join("\n")}
        >
          +{items.length - shown.length} más
        </div>
      )}
    </div>
  );
}

function Schedule({ entry }) {
  if (!entry.startedAt) return <span style={{ color: "#9ca3af" }}>No se inició</span>;
  const startDay = String(entry.startedAt).slice(0, 10);
  const endDay = entry.completedAt ? String(entry.completedAt).slice(0, 10) : null;
  const multi = endDay && endDay !== startDay;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      {multi && <span style={{ color: "#6b7280" }}>{fmtDay(startDay)} </span>}
      <strong>{hhmm(entry.startedAt)}</strong>
      {" → "}
      {entry.completedAt ? (
        <>
          {multi && <span style={{ color: "#6b7280" }}>{fmtDay(endDay)} </span>}
          <strong>{hhmm(entry.completedAt)}</strong>
        </>
      ) : (
        <span style={{ color: "#1d4ed8", fontWeight: 700 }}>sigue</span>
      )}
    </span>
  );
}

/**
 * Tabla de tareas. `mode="desk"` omite la mesa (ya está en el encabezado); `mode="order"` omite
 * la orden y agrega día y mesa.
 */
export function TaskTable({ entries, mode, onPick, selectedId }) {
  const byOrder = mode === "order";
  return (
    <Table responsive size="sm" className="mb-0" style={{ fontSize: 13 }}>
      <thead>
        <tr style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>
          <th>Tarea</th>
          {byOrder ? <th>Día</th> : <th>Orden</th>}
          {byOrder && <th>Mesa</th>}
          <th>Productos</th>
          <th>Horario</th>
          <th className="text-right">Trabajado</th>
          <th className="text-right">Esperado</th>
          <th>Diferencia</th>
          <th>Estado</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((e) => (
          <tr
            key={e.taskId}
            onClick={onPick ? () => onPick(e) : undefined}
            style={{ cursor: onPick ? "pointer" : "default", background: selectedId === e.taskId ? "#eff6ff" : undefined }}
          >
            <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{e.code}</td>
            {byOrder ? (
              <td style={{ whiteSpace: "nowrap" }}>{fmtDay(e.day)}</td>
            ) : (
              <td style={{ whiteSpace: "nowrap" }}>{e.productionOrderCode || <span style={{ color: "#9ca3af" }}>Sin orden</span>}</td>
            )}
            {byOrder && (
              <td style={{ whiteSpace: "nowrap", fontWeight: 700 }}>
                Mesa {e.desk}
                {e.supervisorName && <div style={{ fontWeight: 400, fontSize: 11, color: "#6b7280" }}>{e.supervisorName}</div>}
              </td>
            )}
            <td style={{ minWidth: 180 }}><Products entry={e} /></td>
            <td><Schedule entry={e} /></td>
            <td className="text-right" style={{ fontWeight: 800 }}>{e.workedMinutes != null ? fmtMinutes(e.workedMinutes) : "—"}</td>
            <td className="text-right" style={{ color: "#6b7280" }}>{fmtMinutes(e.expectedMinutes)}</td>
            <td><DiffPill entry={e} /></td>
            <td style={{ whiteSpace: "nowrap" }}>
              <StatusPill entry={e} />
              {isDone(e) && e.wasteQuantity > 0 && <Pill color="#92400e" bg="#fef3c7" title="Piezas de desperdicio">Desperdicio {e.wasteQuantity}</Pill>}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
