/**
 * Cálculos puros del historial de mesas. La pantalla los usa sobre las filas que manda
 * `GET /api/tasks/desk-history`, ya filtradas, para que los totales siempre cuadren con lo que se ve.
 */
import { getTodayYmdGuatemala, shiftYmdGuatemala } from "utils/dateTimeHelper";

/** Una tarea cuenta como «terminada» cuando ya salió de la mesa con su trabajo hecho. */
export const DONE_STATUSES = ["COMPLETED", "AWAITING_WAREHOUSE"];

export const STATUS_META = {
  COMPLETED: { label: "Terminada", color: "#047857", bg: "#d1fae5" },
  AWAITING_WAREHOUSE: { label: "Esperando bodega", color: "#7c3aed", bg: "#ede9fe" },
  IN_PROGRESS: { label: "En proceso", color: "#1d4ed8", bg: "#dbeafe" },
  PENDING: { label: "Sin iniciar", color: "#4b5563", bg: "#f3f4f6" },
};

export const statusMeta = (status) =>
  STATUS_META[status] || { label: status || "—", color: "#4b5563", bg: "#f3f4f6" };

export const isDone = (entry) => DONE_STATUSES.includes(entry?.status);

/** 125 → «2 h 5 min»; 45 → «45 min»; 0 → «0 min»; null → «—». */
export function fmtMinutes(min) {
  if (min == null || !Number.isFinite(Number(min))) return "—";
  const total = Math.max(0, Math.round(Number(min)));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** Diferencia contra lo esperado, con signo: «+25 min» (de más) o «−10 min» (de menos). */
export function fmtDiff(worked, expected) {
  if (worked == null || expected == null) return "—";
  const d = Math.round(worked - expected);
  if (d === 0) return "En tiempo";
  return `${d > 0 ? "+" : "−"}${fmtMinutes(Math.abs(d))}`;
}

/** Hora «HH:mm» de un LocalDateTime del API (ya viene en hora de Guatemala). */
export function hhmm(value) {
  const s = value ? String(value) : "";
  return s.length >= 16 ? s.slice(11, 16) : "—";
}

/** «mié 11 nov» a partir de YYYY-MM-DD. */
export function fmtDay(ymd) {
  if (!ymd) return "—";
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const dows = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${dows[date.getUTCDay()]} ${d} ${months[m - 1]}`;
}

export function deskTitle(info, desk) {
  if (info?.special) return `Mesa ${desk} · ${info.name || "Maquila"}`;
  return `Mesa ${desk}`;
}

/** Texto compacto de los productos de una tarea: «B-7 Café ×12, TT-4 Negro ×6». */
export function itemsText(entry) {
  return (entry?.items || [])
    .map((i) => `${i.productName || i.productCode || "Producto"}${i.colorName ? ` ${i.colorName}` : ""} ×${i.quantity ?? 0}`)
    .join(", ");
}

// ---------------------------------------------------------------- rangos

export function presetRange(key) {
  const today = getTodayYmdGuatemala();
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const y = shiftYmdGuatemala(today, -1);
      return { from: y, to: y };
    }
    case "week": {
      // Lunes de esta semana.
      const [yy, mm, dd] = today.split("-").map(Number);
      const dow = new Date(Date.UTC(yy, mm - 1, dd, 12)).getUTCDay();
      const back = dow === 0 ? 6 : dow - 1;
      return { from: shiftYmdGuatemala(today, -back), to: today };
    }
    case "last7":
      return { from: shiftYmdGuatemala(today, -6), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
    default:
      return { from: today, to: today };
  }
}

export const PRESETS = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "week", label: "Esta semana" },
  { key: "last7", label: "Últimos 7 días" },
  { key: "month", label: "Este mes" },
];

// ---------------------------------------------------------------- filtros

/** @param {{desk:string, status:string, query:string}} f */
export function filterEntries(entries, f) {
  const q = (f.query || "").trim().toLowerCase();
  return (entries || []).filter((e) => {
    if (f.desk && String(e.desk) !== String(f.desk)) return false;
    if (f.status === "DONE" && !isDone(e)) return false;
    if (f.status === "IN_PROGRESS" && e.status !== "IN_PROGRESS") return false;
    if (f.status === "PENDING" && e.status !== "PENDING") return false;
    if (f.status === "DELAYED" && !e.delayed) return false;
    if (!q) return true;
    const hay = [e.code, e.productionOrderCode, e.supervisorName, itemsText(e)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

// ---------------------------------------------------------------- resúmenes

/**
 * Totales de un grupo de tareas. «Rendimiento» compara solo las terminadas que tienen ambos
 * tiempos, para no mezclar lo que aún corre con lo cerrado.
 */
export function summarize(entries) {
  const s = {
    tasks: 0, done: 0, inProgress: 0, pending: 0, pieces: 0,
    workedMinutes: 0, expectedMinutes: 0,
    doneWorked: 0, doneExpected: 0, delayed: 0, onTime: 0, waste: 0,
  };
  (entries || []).forEach((e) => {
    s.tasks += 1;
    s.pieces += Number(e.pieces) || 0;
    s.waste += Number(e.wasteQuantity) || 0;
    s.workedMinutes += Number(e.workedMinutes) || 0;
    s.expectedMinutes += Number(e.expectedMinutes) || 0;
    if (isDone(e)) {
      s.done += 1;
      if (e.delayed) s.delayed += 1;
      else s.onTime += 1;
      if (e.workedMinutes != null && e.expectedMinutes != null) {
        s.doneWorked += e.workedMinutes;
        s.doneExpected += e.expectedMinutes;
      }
    } else if (e.status === "IN_PROGRESS") s.inProgress += 1;
    else s.pending += 1;
  });
  s.avgMinutes = s.done > 0 ? Math.round(s.workedMinutes / Math.max(1, countWithTime(entries))) : null;
  s.onTimePct = s.done > 0 ? Math.round((s.onTime * 100) / s.done) : null;
  return s;
}

function countWithTime(entries) {
  return (entries || []).filter((e) => e.workedMinutes != null).length;
}

/** Mesas con sus tareas (solo las que tienen actividad), en orden de número. */
export function groupByDesk(entries, desks) {
  const infoByDesk = new Map((desks || []).map((d) => [d.desk, d]));
  const map = new Map();
  (entries || []).forEach((e) => {
    if (!map.has(e.desk)) map.set(e.desk, []);
    map.get(e.desk).push(e);
  });
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([desk, list]) => ({
      desk,
      info: infoByDesk.get(desk) || { desk },
      entries: list,
      summary: summarize(list),
      days: groupByDay(list),
    }));
}

/** Días (más reciente primero) con sus tareas, ordenadas por hora de inicio. */
export function groupByDay(entries) {
  const map = new Map();
  (entries || []).forEach((e) => {
    if (!map.has(e.day)) map.set(e.day, []);
    map.get(e.day).push(e);
  });
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, list]) => ({
      day,
      entries: [...list].sort((x, y) => String(x.startedAt || "9").localeCompare(String(y.startedAt || "9")) || x.taskId - y.taskId),
      summary: summarize(list),
    }));
}

/** Órdenes con las mesas por las que pasaron. */
export function groupByOrder(entries) {
  const map = new Map();
  (entries || []).forEach((e) => {
    const key = e.productionOrderCode || "Sin orden";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  });
  return [...map.entries()]
    .map(([code, list]) => {
      const sorted = [...list].sort((a, b) =>
        (a.day < b.day ? -1 : a.day > b.day ? 1 : 0) || a.desk - b.desk || a.taskId - b.taskId);
      const desks = [...new Set(sorted.map((e) => e.desk))].sort((a, b) => a - b);
      return {
        code,
        entries: sorted,
        desks,
        firstDay: sorted[0]?.day,
        lastDay: sorted[sorted.length - 1]?.day,
        summary: summarize(sorted),
      };
    })
    .sort((a, b) => (a.lastDay < b.lastDay ? 1 : a.lastDay > b.lastDay ? -1 : a.code.localeCompare(b.code)));
}

// ---------------------------------------------------------------- línea de tiempo

export const TL_START = 7 * 60;
export const TL_END = 17 * 60;
export const TL_LUNCH = [13 * 60, 14 * 60];

const minutesOfDay = (iso) => {
  const s = String(iso);
  return Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
};

/**
 * Tramos de una mesa en un día para dibujar. Una tarea que cruza varios días ocupa toda la
 * jornada en los días intermedios. `nowIso` cierra las tareas que siguen corriendo.
 * Los tramos que se pisan se reparten en carriles para que no se tapen.
 */
export function timelineForDay(entries, day, nowIso) {
  const segs = [];
  (entries || []).forEach((e) => {
    if (!e.startedAt) return;
    const startDay = String(e.startedAt).slice(0, 10);
    const endIso = e.completedAt || (e.status === "IN_PROGRESS" ? nowIso : null);
    if (!endIso) return;
    const endDay = String(endIso).slice(0, 10);
    if (day < startDay || day > endDay) return;
    const from = day === startDay ? Math.max(TL_START, minutesOfDay(e.startedAt)) : TL_START;
    const to = day === endDay ? Math.min(TL_END, minutesOfDay(endIso)) : TL_END;
    if (to <= from) return;
    segs.push({ entry: e, from, to });
  });
  segs.sort((a, b) => a.from - b.from || a.to - b.to);
  const laneEnds = [];
  segs.forEach((s) => {
    let lane = laneEnds.findIndex((end) => end <= s.from);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[lane] = s.to;
    s.lane = lane;
  });
  return { segments: segs, lanes: Math.max(1, laneEnds.length) };
}

// ---------------------------------------------------------------- exportar

export function toCsvRows(entries) {
  return (entries || []).map((e) => ({
    day: e.day,
    desk: e.desk,
    supervisor: e.supervisorName || "",
    task: e.code,
    order: e.productionOrderCode || "",
    items: itemsText(e),
    pieces: e.pieces,
    status: statusMeta(e.status).label,
    started: e.startedAt ? String(e.startedAt).replace("T", " ").slice(0, 16) : "",
    completed: e.completedAt ? String(e.completedAt).replace("T", " ").slice(0, 16) : "",
    worked: e.workedMinutes ?? "",
    expected: e.expectedMinutes ?? "",
    delayed: e.delayed ? "Sí" : "No",
  }));
}
