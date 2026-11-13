import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, ButtonGroup, Input, Spinner } from "reactstrap";
import { getDeskHistory } from "services/taskService";
import { getNowDatetimeLocalGuatemala, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { exportRowsToCsv } from "utils/reportExportHelper";
import {
  PRESETS, deskTitle, filterEntries, fmtDay, fmtMinutes, groupByDesk, groupByOrder, presetRange, summarize, toCsvRows,
} from "./deskHistoryHelpers";
import { CARD } from "./DeskHistoryParts";
import { ByDeskView, ByOrderView, TaskDetail, TimelineView } from "./DeskHistoryViews";

const MAX_DAYS = 93;
const TABS = [
  { key: "desk", label: "Por mesa", hint: "Qué pasó en cada mesa, día por día" },
  { key: "order", label: "Por orden", hint: "Por qué mesas pasó cada orden" },
  { key: "timeline", label: "Línea de tiempo", hint: "Cómo se ocupó cada mesa en un día" },
];

const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000) + 1;

function Kpi({ label, value, hint, tone = "#111827" }) {
  return (
    <div style={{ ...CARD, marginBottom: 0, padding: "12px 14px", height: "100%" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.15, color: tone }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: "#6b7280" }}>{hint}</div>}
    </div>
  );
}

function DeskHistory() {
  const initial = presetRange("week");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState("week");
  const [data, setData] = useState({ desks: [], tasks: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("desk");
  const [deskFilter, setDeskFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const rangeError = useMemo(() => {
    if (!from || !to) return "Elija las dos fechas.";
    if (to < from) return "«Hasta» no puede ser anterior a «Desde».";
    if (daysBetween(from, to) > MAX_DAYS) return `El rango máximo es de ${MAX_DAYS} días.`;
    return "";
  }, [from, to]);

  const load = useCallback(async () => {
    if (rangeError) return;
    setLoading(true);
    setError("");
    try {
      const res = await getDeskHistory(from, to);
      setData({ desks: res.desks || [], tasks: res.tasks || [] });
      setSelected(null);
    } catch (e) {
      setError(e.message || "No se pudo cargar el historial.");
    } finally {
      setLoading(false);
    }
  }, [from, to, rangeError]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (key) => {
    const r = presetRange(key);
    setPreset(key);
    setFrom(r.from);
    setTo(r.to);
  };

  const filtered = useMemo(
    () => filterEntries(data.tasks, { desk: deskFilter, status: statusFilter, query }),
    [data.tasks, deskFilter, statusFilter, query],
  );
  const total = useMemo(() => summarize(filtered), [filtered]);
  const deskGroups = useMemo(() => groupByDesk(filtered, data.desks), [filtered, data.desks]);
  const orderGroups = useMemo(() => groupByOrder(filtered), [filtered]);
  const idleDesks = useMemo(() => {
    if (deskFilter) return [];
    const active = new Set(filtered.map((e) => e.desk));
    return data.desks.filter((d) => !active.has(d.desk));
  }, [data.desks, filtered, deskFilter]);
  const nowIso = useMemo(() => getNowDatetimeLocalGuatemala(), [data]);

  const hasFilters = Boolean(deskFilter || statusFilter || query);
  const clearFilters = () => { setDeskFilter(""); setStatusFilter(""); setQuery(""); };

  const exportCsv = () => {
    exportRowsToCsv(`historial_mesas_${from}_${to}`, [
      { label: "Día", value: "day" },
      { label: "Mesa", value: "desk" },
      { label: "Encargado", value: "supervisor" },
      { label: "Tarea", value: "task" },
      { label: "Orden", value: "order" },
      { label: "Productos", value: "items" },
      { label: "Piezas", value: "pieces" },
      { label: "Estado", value: "status" },
      { label: "Inicio", value: "started" },
      { label: "Cierre", value: "completed" },
      { label: "Minutos trabajados", value: "worked" },
      { label: "Minutos esperados", value: "expected" },
      { label: "Atrasada", value: "delayed" },
    ], toCsvRows(filtered));
  };

  const rangeLabel = from === to ? fmtDay(from) : `${fmtDay(from)} → ${fmtDay(to)}`;
  const isEmpty = !loading && !error && !rangeError && filtered.length === 0;

  return (
    <div className="content">
      <div className="mb-3">
        <h3 style={{ margin: 0, fontWeight: 800 }}>Historial de mesas</h3>
        <div style={{ color: "#6b7280" }}>
          Qué tareas de qué órdenes pasaron por cada mesa y cuánto tardaron.
        </div>
      </div>

      {/* ---- filtros ---- */}
      <div style={{ ...CARD, padding: "12px 14px" }}>
        <div className="d-flex flex-wrap align-items-end" style={{ gap: 14 }}>
          <div>
            <div style={LABEL}>Período</div>
            <ButtonGroup size="sm">
              {PRESETS.map((p) => (
                <Button key={p.key} color="info" outline={preset !== p.key} onClick={() => applyPreset(p.key)}>{p.label}</Button>
              ))}
            </ButtonGroup>
          </div>
          <div>
            <div style={LABEL}>Desde</div>
            <Input type="date" bsSize="sm" value={from} max={getTodayYmdGuatemala()} onChange={(e) => { setPreset(""); setFrom(e.target.value); }} />
          </div>
          <div>
            <div style={LABEL}>Hasta</div>
            <Input type="date" bsSize="sm" value={to} onChange={(e) => { setPreset(""); setTo(e.target.value); }} />
          </div>
          <div>
            <div style={LABEL}>Mesa</div>
            <Input type="select" bsSize="sm" value={deskFilter} onChange={(e) => setDeskFilter(e.target.value)}>
              <option value="">Todas</option>
              {data.desks.map((d) => <option key={d.desk} value={d.desk}>{deskTitle(d, d.desk)}</option>)}
            </Input>
          </div>
          <div>
            <div style={LABEL}>Estado</div>
            <Input type="select" bsSize="sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todas</option>
              <option value="DONE">Terminadas</option>
              <option value="IN_PROGRESS">En proceso</option>
              <option value="PENDING">Sin iniciar</option>
              <option value="DELAYED">Atrasadas</option>
            </Input>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={LABEL}>Buscar</div>
            <Input bsSize="sm" placeholder="Orden, tarea, producto, color o encargado" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="d-flex" style={{ gap: 6 }}>
            {hasFilters && <Button size="sm" color="secondary" outline onClick={clearFilters}>Limpiar</Button>}
            <Button size="sm" color="secondary" outline onClick={load} disabled={loading || Boolean(rangeError)}>Actualizar</Button>
            <Button size="sm" color="success" outline onClick={exportCsv} disabled={!filtered.length}>Exportar CSV</Button>
          </div>
        </div>
        {rangeError && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{rangeError}</div>}
      </div>

      {error && <Alert color="danger">{error}</Alert>}

      {/* ---- totales ---- */}
      {!error && !rangeError && (
        <div className="mb-3">
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            {rangeLabel}{deskFilter ? ` · Mesa ${deskFilter}` : ""}{loading ? " · cargando…" : ""}
          </div>
          <div className="d-flex flex-wrap" style={{ gap: 12 }}>
            <div style={KPI_BOX}><Kpi label="Tareas" value={total.tasks} hint={`${total.done} terminadas · ${total.inProgress} en proceso · ${total.pending} sin iniciar`} /></div>
            <div style={KPI_BOX}><Kpi label="Piezas" value={total.pieces} hint={total.waste ? `${total.waste} de desperdicio` : "Suma de las tareas"} /></div>
            <div style={KPI_BOX}><Kpi label="Tiempo trabajado" value={fmtMinutes(total.workedMinutes)} hint={total.avgMinutes != null ? `${fmtMinutes(total.avgMinutes)} por tarea` : "Sin tareas terminadas"} /></div>
            <div style={KPI_BOX}>
              <Kpi
                label="Terminadas a tiempo"
                value={total.onTimePct != null ? `${total.onTimePct}%` : "—"}
                tone={total.onTimePct == null ? "#111827" : total.onTimePct >= 80 ? "#047857" : total.onTimePct >= 60 ? "#b45309" : "#b91c1c"}
                hint={total.done ? `${total.onTime} de ${total.done} · ${total.delayed} atrasada${total.delayed === 1 ? "" : "s"}` : "Aún no hay terminadas"}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---- pestañas ---- */}
      <div className="d-flex flex-wrap align-items-center mb-3" style={{ gap: 8, borderBottom: "1px solid #e5e7eb" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            title={t.hint}
            style={{
              background: "transparent", border: 0, padding: "8px 14px", fontWeight: 700, cursor: "pointer",
              color: tab === t.key ? "#0e7490" : "#6b7280",
              borderBottom: tab === t.key ? "3px solid #06b6d4" : "3px solid transparent",
            }}
          >
            {t.label}
          </button>
        ))}
        <span style={{ fontSize: 12, color: "#9ca3af" }}>{TABS.find((t) => t.key === tab)?.hint}</span>
      </div>

      {loading && !data.tasks.length && (
        <div className="text-center" style={{ padding: 40 }}><Spinner color="info" /></div>
      )}

      {isEmpty && (
        <div style={{ ...CARD, padding: 28, textAlign: "center", color: "#6b7280" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#374151" }}>No hay tareas en mesa en este rango</div>
          <div>
            {hasFilters ? "Quite algún filtro o amplíe las fechas." : "Pruebe con otro período. Solo aparecen tareas que llegaron a una mesa."}
          </div>
        </div>
      )}

      <TaskDetail entry={selected} onClose={() => setSelected(null)} />

      {!error && !rangeError && filtered.length > 0 && (
        <>
          {tab === "desk" && (
            <ByDeskView groups={deskGroups} idleDesks={idleDesks} onPick={setSelected} selectedId={selected?.taskId} />
          )}
          {tab === "order" && (
            <ByOrderView groups={orderGroups} onPick={setSelected} selectedId={selected?.taskId} />
          )}
          {tab === "timeline" && (
            <TimelineView entries={filtered} desks={data.desks} nowIso={nowIso} onPick={setSelected} selectedId={selected?.taskId} />
          )}
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 10 }}>
            La mesa mostrada es la última en la que estuvo la tarea; si se cambió de mesa antes de terminar, el cambio no queda registrado.
            El tiempo trabajado cuenta solo la jornada (lunes a viernes, 07:00–17:00, sin almuerzo) y descuenta las pausas.
          </div>
        </>
      )}
    </div>
  );
}

const LABEL = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "#6b7280", marginBottom: 2 };
const KPI_BOX = { flex: "1 1 200px", minWidth: 190 };

export default DeskHistory;
