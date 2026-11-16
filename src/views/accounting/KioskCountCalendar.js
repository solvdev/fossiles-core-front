import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DropdownItem,
  DropdownMenu,
  DropdownToggle,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  UncontrolledDropdown,
} from "reactstrap";
import {
  addCountBlockedDay,
  addCountVisit,
  generateCountWeek,
  getCountCalendar,
  removeCountBlockedDay,
  updateCountVisit,
} from "services/kioskCountCalendarService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { downloadKioskCountCalendarExcel } from "utils/kioskCountCalendarExport";
import {
  MONTH_NAMES,
  addDays,
  formatDmy,
  formatLong,
  formatShort,
  key,
  mondayOf,
  monthOfWeek,
  monthTitle,
  ymd,
  weekdayShort,
  weekRange,
  weekRangeShort,
} from "utils/kioskCountDateHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import KioskCountImportModal from "components/accounting/KioskCountImportModal";
import KioskLiquidationTab from "components/accounting/KioskLiquidationTab";
import "./KioskCountCalendar.css";

const REGION_ORDER = ["METROPOLITANA", "CENTRAL", "OCCIDENTE", "SUR", "ORIENTE", "NORTE"];
const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];
const STATUS_LABEL = { PLANNED: "Pendiente", DONE: "Hecha", CANCELLED: "Cancelada" };

const initials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");

function gapText(visit) {
  if (visit.gapDays == null) return "Sin conteo anterior registrado";
  return `${visit.gapDays} días desde su último conteo (${formatShort(visit.lastCountDate)})`;
}

export default function KioskCountCalendar() {
  const today = getTodayYmdGuatemala();
  const [weekStart, setWeekStart] = useState(() => mondayOf(today));
  const [month, setMonth] = useState(() => monthOfWeek(mondayOf(today)));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [supervisorId, setSupervisorId] = useState(null);
  const [regionFilter, setRegionFilter] = useState(null);
  const [view, setView] = useState("list");
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(null);
  const [generateRedo, setGenerateRedo] = useState(null);
  const [addDraft, setAddDraft] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [showRules, setShowRules] = useState(false);
  const [showDays, setShowDays] = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const [section, setSection] = useState("visits");
  const [showImport, setShowImport] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getCountCalendar(month));
    } catch (error) {
      showError(error.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const goToWeek = (ws) => {
    setWeekStart(ws);
    setMonth(monthOfWeek(ws));
  };

  const supervisors = useMemo(() => data?.supervisors || [], [data]);
  const supervisorColor = useMemo(() => {
    const map = {};
    supervisors.forEach((s, i) => {
      map[s.userId] = i;
    });
    return map;
  }, [supervisors]);
  const canGenerate = Boolean(data?.canGenerate);
  const relevantSupervisors = useMemo(
    () => supervisors.filter((s) => !supervisorId || s.userId === supervisorId),
    [supervisors, supervisorId]
  );

  const allVisits = useMemo(() => data?.visits || [], [data]);
  const visits = useMemo(() => {
    let list = allVisits;
    if (supervisorId) list = list.filter((v) => v.supervisorUserId === supervisorId);
    if (regionFilter) list = list.filter((v) => v.region === regionFilter);
    return list;
  }, [allVisits, supervisorId, regionFilter]);

  const weekEnd = addDays(weekStart, 4);
  const weekLast = addDays(weekStart, 6);
  const weekVisits = useMemo(
    () => visits.filter((v) => key(v.visitDate) >= weekStart && key(v.visitDate) <= weekLast),
    [visits, weekStart, weekLast]
  );
  // Fines de semana: el calendario generado es de lunes a viernes, pero a mano se puede mandar a sábado o domingo.
  const hasWeekendVisits = useMemo(
    () => allVisits.some((v) => [0, 6].includes(new Date(`${key(v.visitDate)}T12:00:00`).getDay())),
    [allVisits]
  );
  const showWeekend = editMode || hasWeekendVisits;
  const dayNames = showWeekend ? [...WEEKDAYS, "Sábado", "Domingo"] : WEEKDAYS;
  const visitsByDate = useMemo(() => {
    const map = {};
    visits.forEach((v) => {
      (map[key(v.visitDate)] = map[key(v.visitDate)] || []).push(v);
    });
    return map;
  }, [visits]);
  const nonWorking = useMemo(() => {
    const map = {};
    (data?.nonWorkingDays || []).forEach((d) => {
      map[key(d.date)] = d;
    });
    return map;
  }, [data]);

  const weeks = useMemo(
    () => (data?.weeks || []).filter((w) => monthOfWeek(key(w.weekStart)) === month),
    [data, month]
  );
  const weekInfo = useMemo(
    () => (data?.weeks || []).find((w) => key(w.weekStart) === weekStart) || null,
    [data, weekStart]
  );
  const generatedIds = useMemo(() => weekInfo?.generatedSupervisorIds || [], [weekInfo]);
  const weekGeneratedFor = (supId) => generatedIds.includes(supId);
  const relevantGenerated = relevantSupervisors.filter((s) => weekGeneratedFor(s.userId));
  const weekStatus =
    relevantSupervisors.length > 0 && relevantGenerated.length === relevantSupervisors.length
      ? "all"
      : relevantGenerated.length > 0
        ? "some"
        : "none";

  // Qué se puede hacer con la semana elegida
  const nextWeeks = useMemo(() => data?.nextWeeks || [], [data]);
  const pendingHere = nextWeeks
    .filter((n) => key(n.weekStart) === weekStart && relevantSupervisors.some((s) => s.userId === n.supervisorUserId))
    .map((n) => n.supervisorUserId);
  const earliestPending = nextWeeks
    .filter((n) => relevantSupervisors.some((s) => s.userId === n.supervisorUserId))
    .map((n) => key(n.weekStart))
    .sort()[0];
  const blockedBy =
    pendingHere.length === 0 && weekStatus !== "all" && earliestPending && earliestPending < weekStart
      ? earliestPending
      : null;
  const weekEndPast = weekEnd < today;
  const canRedo =
    canGenerate && weekInfo && !weekInfo.started && relevantGenerated.length > 0 && weekStart > today;

  const regionsPresent = useMemo(() => {
    const set = new Set(weekVisits.map((v) => v.region));
    return REGION_ORDER.filter((r) => set.has(r));
  }, [weekVisits]);
  const regionLabels = useMemo(() => {
    const map = {};
    allVisits.forEach((v) => {
      map[v.region] = v.regionLabel;
    });
    (data?.kiosks || []).forEach((k) => {
      map[k.region] = k.regionLabel;
    });
    return map;
  }, [allVisits, data]);

  const stats = useMemo(() => {
    const done = weekVisits.filter((v) => v.status === "DONE" || v.countedOn).length;
    const kioskIds = new Set(weekVisits.map((v) => v.locationId));
    const regularInMonth = new Set(
      allVisits
        .filter((v) => v.kind !== "REVISIT" && key(v.visitDate).slice(0, 7) === month)
        .filter((v) => !supervisorId || v.supervisorUserId === supervisorId)
        .map((v) => v.locationId)
    );
    const expected = (data?.kiosks || []).filter((k) => !supervisorId || k.supervisorUserId === supervisorId).length;
    return {
      total: weekVisits.length,
      kiosks: kioskIds.size,
      done,
      monthWith: regularInMonth.size,
      monthExpected: expected,
    };
  }, [weekVisits, allVisits, data, supervisorId, month]);

  const specialRules = useMemo(
    () => (data?.kiosks || []).filter((k) => k.visitsPerMonth > 1 || k.visitDays > 1 || k.allowedWeekdays),
    [data]
  );

  const runGenerate = async (supIds, redo) => {
    setBusy(true);
    try {
      const result = await generateCountWeek({ weekStart, supervisorUserIds: supIds, redo, month });
      setData(result.calendar);
      setWarnings(result.warnings || []);
      setGenerateRedo(null);
      showSuccess(`Semana del ${weekRange(weekStart)} ${redo ? "repartida de nuevo" : "generada"}.`);
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const moveVisit = async (visitId, date) => {
    setBusy(true);
    try {
      setData(await updateCountVisit(visitId, { visitDate: date, month }));
      showSuccess("Visita movida.");
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = (scope) => {
    const supervisor = supervisors.find((s) => s.userId === supervisorId);
    const list =
      scope === "week"
        ? weekVisits
        : visits.filter((v) => key(v.visitDate).slice(0, 7) === month);
    if (!list.length) {
      showError("No hay visitas para descargar.");
      return;
    }
    try {
      downloadKioskCountCalendarExcel({
        periodLabel: scope === "week" ? `Semana del ${weekRange(weekStart)} ${weekStart.slice(0, 4)}` : monthTitle(month),
        fileSuffix: scope === "week" ? weekStart : month,
        visits: list,
        supervisorLabel: supervisor?.name,
      });
    } catch (error) {
      showError(error.message || "No se pudo generar el Excel.");
    }
  };

  const chip = (visit) => {
    const done = visit.status === "DONE" || Boolean(visit.countedOn);
    const draggable = editMode && canGenerate;
    return (
      <button
        type="button"
        key={visit.id}
        className={`kcc-chip kcc-r-${visit.region} ${done ? "is-done" : ""} ${visit.kind === "REVISIT" ? "is-revisit" : ""} ${draggable ? "is-draggable" : ""}`}
        onClick={() => setSelected(visit)}
        draggable={draggable}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", String(visit.id));
          e.dataTransfer.effectAllowed = "move";
        }}
        title={`${visit.locationName} · ${visit.regionLabel}`}
      >
        <span className="kcc-chip-name">{visit.locationName}</span>
        <span className="kcc-chip-meta">
          {visit.kind === "REVISIT" && <span className="kcc-revisit-tag">Revisita</span>}
          {visit.dayTotal > 1 && (
            <span>
              Día {visit.daySeq}/{visit.dayTotal}
            </span>
          )}
          {visit.manual && visit.kind !== "REVISIT" && <span title="Movida a mano">📌</span>}
          {done && <span title="Conteo hecho">✓</span>}
          {!supervisorId && supervisors.length > 1 && (
            <span className={`kcc-sup kcc-sup-${supervisorColor[visit.supervisorUserId] % 4}`} title={visit.supervisorName}>
              {initials(visit.supervisorName)}
            </span>
          )}
        </span>
      </button>
    );
  };

  /** Celdas de una semana (lunes a viernes). */
  const weekCells = (ws, generated) =>
    dayNames.map((_, i) => {
      const date = addDays(ws, i);
      const items = visitsByDate[date] || [];
      const off = nonWorking[date];
      const isToday = date === today;
      const outOfMonth = date.slice(0, 7) !== month;
      const dropOk = editMode && canGenerate && !off;
      return (
        <div
          key={date}
          className={`kcc-cell ${off ? "is-off" : ""} ${isToday ? "is-today" : ""} ${items.length || off ? "" : "is-empty"} ${!generated && !items.length ? "is-pending" : ""} ${dragOver === date ? "is-drop" : ""}`}
          role="gridcell"
          onDragOver={(e) => {
            if (dropOk) {
              e.preventDefault();
              setDragOver(date);
            }
          }}
          onDragLeave={() => setDragOver((current) => (current === date ? null : current))}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(null);
            const id = Number(e.dataTransfer.getData("text/plain"));
            const moved = allVisits.find((v) => v.id === id);
            if (dropOk && moved && key(moved.visitDate) !== date) moveVisit(id, date);
          }}
        >
          <div className="kcc-day">
            <span className="kcc-dn">{Number(date.slice(8))}</span>
            {outOfMonth && <small className="kcc-day-out">{formatShort(date).split(" ")[1]}</small>}
            <small className="kcc-day-name">{formatLong(date).split(",")[0]}</small>
            {editMode && canGenerate && !off && date >= today && (
              <button
                type="button"
                className="kcc-add"
                aria-label={`Agregar visita el ${formatShort(date)}`}
                onClick={() => setAddDraft({ date })}
              >
                +
              </button>
            )}
          </div>
          {off && <div className="kcc-off">{off.reason}</div>}
          {items.map(chip)}
        </div>
      );
    });

  const weekBanner = (w) => {
    const ws = key(w.weekStart);
    const relevant = relevantSupervisors;
    const gen = relevant.filter((s) => w.generatedSupervisorIds.includes(s.userId)).length;
    const state = gen === relevant.length && relevant.length ? "all" : gen > 0 ? "some" : "none";
    return (
      <button
        key={`b${ws}`}
        type="button"
        className={`kcc-weekbar ${ws === weekStart ? "is-selected" : ""} is-${state}`}
        onClick={() => setWeekStart(ws)}
      >
        <strong>Semana del {weekRange(ws)}</strong>
        <span className={`kcc-wstate is-${state}`}>
          {state === "all" ? "Generada" : state === "some" ? `Generada para ${gen} de ${relevant.length}` : "Sin generar"}
        </span>
      </button>
    );
  };

  return (
    <div className="content">
      <div className="kcc">
        <header className="kcc-head">
          <div className="kcc-title">
            <div className="kcc-title-icon" aria-hidden="true">
              <i className="nc-icon nc-calendar-60" />
            </div>
            <div>
              <h4>Calendario de conteos físicos</h4>
              <p>Se genera semana por semana: una visita por día por supervisora, por región y con fechas al azar.</p>
            </div>
          </div>
          <span className="kcc-secret" title="No compartir con las encargadas de kiosco">
            🔒 Confidencial · solo supervisoras y administración
          </span>
        </header>

        <div className="kcc-tabs" role="tablist" aria-label="Sección">
          <button type="button" role="tab" aria-selected={section === "visits"} className={section === "visits" ? "on" : ""} onClick={() => setSection("visits")}>
            Visitas de conteo
          </button>
          <button type="button" role="tab" aria-selected={section === "liquidation"} className={section === "liquidation" ? "on" : ""} onClick={() => setSection("liquidation")}>
            Liquidación semanal
          </button>
        </div>

        <div className="kcc-toolbar">
          <div className="kcc-month">
            <button type="button" className="kcc-icon-btn" onClick={() => goToWeek(addDays(weekStart, -7))} aria-label="Semana anterior">
              ‹
            </button>
            <div className="kcc-week-title">
              <strong>Semana {weekRangeShort(weekStart)}</strong>
              <small>
                {monthTitle(month)} ·{" "}
                {loading ? "…" : weekStatus === "all" ? "Generada" : weekStatus === "some" ? "Generada en parte" : "Sin generar"}
              </small>
            </div>
            <button type="button" className="kcc-icon-btn" onClick={() => goToWeek(addDays(weekStart, 7))} aria-label="Semana siguiente">
              ›
            </button>
            <button type="button" className="kcc-link" onClick={() => goToWeek(mondayOf(today))}>
              Esta semana
            </button>
          </div>

          <div className="kcc-seg" role="group" aria-label="Supervisora">
            <button type="button" className={!supervisorId ? "on" : ""} onClick={() => setSupervisorId(null)}>
              Todas
            </button>
            {supervisors.map((s) => (
              <button
                type="button"
                key={s.userId}
                className={supervisorId === s.userId ? "on" : ""}
                onClick={() => setSupervisorId(s.userId)}
              >
                <span className={`kcc-dot kcc-sup-${supervisorColor[s.userId] % 4}`} />
                {s.name}
                <small>{s.kioskCount}</small>
              </button>
            ))}
          </div>

          <div className="kcc-toolbar-right">
            {canGenerate && (
              <Button color="secondary" outline size="sm" onClick={() => setShowImport(true)}>
                Cargar Excel
              </Button>
            )}
            {section === "visits" && (
              <>
            <div className="kcc-seg" role="group" aria-label="Vista">
              <button type="button" className={view === "list" ? "on" : ""} onClick={() => setView("list")}>
                Ruta
              </button>
              <button type="button" className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}>
                Calendario
              </button>
            </div>
            <UncontrolledDropdown>
              <DropdownToggle caret color="secondary" outline size="sm">
                Descargar Excel
              </DropdownToggle>
              <DropdownMenu end>
                <DropdownItem onClick={() => exportExcel("week")}>Esta semana</DropdownItem>
                <DropdownItem onClick={() => exportExcel("month")}>Todo {monthTitle(month)}</DropdownItem>
              </DropdownMenu>
            </UncontrolledDropdown>
            {canGenerate && (
              <>
                <Button color={editMode ? "primary" : "secondary"} outline={!editMode} size="sm" onClick={() => setEditMode((v) => !v)}>
                  {editMode ? "Terminar edición" : "Editar calendario"}
                </Button>
                <Button color="secondary" outline size="sm" onClick={() => setShowDays(true)}>
                  Días no hábiles
                </Button>
              </>
            )}
              </>
            )}
          </div>
        </div>

        {section === "visits" && editMode && (
          <div className="kcc-alert kcc-alert-edit" role="status">
            <strong>Modo edición.</strong> Arrastra una visita a otro día de su mismo mes (también sábado o domingo si hace falta), usa
            <strong> +</strong> en un día para agregar una visita, o toca una visita para quitarla o programar una
            revisita. Lo que muevas a mano queda fijo.
            <Button color="primary" size="sm" className="kcc-add-btn" onClick={() => setAddDraft({ date: null })}>
              Agregar visita
            </Button>
          </div>
        )}

        {section === "visits" && warnings.length > 0 && (
          <div className="kcc-alert kcc-alert-warn" role="alert">
            <strong>Revisa esto:</strong>
            <ul>
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        {section === "visits" && data?.unassignedKiosks?.length > 0 && (
          <div className="kcc-alert kcc-alert-info">
            Kioscos activos <strong>sin supervisora asignada</strong> (no entran al calendario):{" "}
            {data.unassignedKiosks.join(", ")}.
          </div>
        )}

        {section === "liquidation" ? (
          <KioskLiquidationTab
            weekStart={weekStart}
            supervisorId={supervisorId}
            today={today}
            refreshKey={refreshKey}
            kiosks={data?.kiosks || []}
          />
        ) : loading ? (
          <div className="kcc-center">
            <Spinner color="primary" />
          </div>
        ) : !data ? (
          <div className="kcc-empty">
            <h5>No se pudo cargar el calendario</h5>
            <p>Revisa tu permiso de Contabilidad &gt; Calendario o vuelve a intentar.</p>
            <Button color="primary" outline onClick={load}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            <div className="kcc-stats">
              <div>
                <strong>{stats.total}</strong>
                <span>visitas esta semana</span>
              </div>
              <div>
                <strong>{stats.kiosks}</strong>
                <span>kioscos esta semana</span>
              </div>
              <div>
                <strong>
                  {stats.done}/{stats.total}
                </strong>
                <span>ya contadas</span>
              </div>
              <div>
                <strong>
                  {stats.monthWith}/{stats.monthExpected}
                </strong>
                <span>kioscos con fecha en {MONTH_NAMES[Number(month.slice(5)) - 1].toLowerCase()}</span>
              </div>
            </div>

            {/* Estado de la semana y qué se puede hacer con ella */}
            <div className={`kcc-weekstate is-${weekStatus}`}>
              <div>
                <strong>
                  {weekStatus === "all"
                    ? "Semana generada"
                    : weekStatus === "some"
                      ? "Semana generada solo para algunas supervisoras"
                      : "Semana sin generar"}
                </strong>
                <span>
                  {weekStatus !== "none" &&
                    `Generada para: ${relevantGenerated.map((s) => s.name).join(", ")}. `}
                  {weekEndPast && weekStatus === "none" && "Esta semana ya pasó."}
                  {blockedBy && `Primero genera la semana del ${weekRange(blockedBy)}: se generan en orden.`}
                  {pendingHere.length > 0 && !weekEndPast &&
                    "Se arma con lo que ya pasó antes: así las fechas no se repiten ni se dejan kioscos fuera."}
                </span>
              </div>
              <div className="kcc-weekstate-actions">
                {blockedBy && (
                  <Button color="secondary" outline size="sm" onClick={() => goToWeek(blockedBy)}>
                    Ir a esa semana
                  </Button>
                )}
                {canGenerate && pendingHere.length > 0 && !weekEndPast && (
                  <Button color="primary" size="sm" disabled={busy} onClick={() => setGenerateRedo({ redo: false, ids: pendingHere })}>
                    Generar esta semana
                  </Button>
                )}
                {canRedo && (
                  <Button
                    color="secondary"
                    outline
                    size="sm"
                    disabled={busy}
                    onClick={() => setGenerateRedo({ redo: true, ids: relevantGenerated.map((s) => s.userId) })}
                  >
                    Volver a repartir
                  </Button>
                )}
              </div>
            </div>

            <div className="kcc-legend" role="group" aria-label="Filtrar por región">
              {regionsPresent.map((r) => (
                <button
                  type="button"
                  key={r}
                  className={`kcc-legend-item kcc-r-${r} ${regionFilter === r ? "on" : ""} ${regionFilter && regionFilter !== r ? "dim" : ""}`}
                  onClick={() => setRegionFilter(regionFilter === r ? null : r)}
                >
                  <span className="kcc-swatch" />
                  {regionLabels[r] || r}
                </button>
              ))}
              {specialRules.length > 0 && (
                <button type="button" className="kcc-link kcc-legend-rules" onClick={() => setShowRules(true)}>
                  Reglas por kiosco
                </button>
              )}
            </div>

            {view === "list" ? (
              weekVisits.length === 0 ? (
                <div className="kcc-empty">
                  <div className="kcc-empty-icon" aria-hidden="true">🗓️</div>
                  <h5>
                    {weekStatus === "none"
                      ? `La semana del ${weekRange(weekStart)} aún no está generada`
                      : "No hay visitas en esta semana"}
                  </h5>
                  <p>
                    {weekStatus === "none"
                      ? "Cada semana se genera por separado, en orden, para que las fechas se decidan con lo que ya pasó."
                      : "Todos sus kioscos ya tienen la visita del mes o no quedó ninguna para esta semana."}
                  </p>
                  {canGenerate && pendingHere.length > 0 && !weekEndPast && (
                    <Button color="primary" onClick={() => setGenerateRedo({ redo: false, ids: pendingHere })}>
                      Generar esta semana
                    </Button>
                  )}
                </div>
              ) : (
                <div className="kcc-list">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Kiosco</th>
                        <th>Región</th>
                        <th>Supervisora</th>
                        <th>Desde el último conteo</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...weekVisits]
                        .sort((a, b) => key(a.visitDate).localeCompare(key(b.visitDate)) || a.supervisorUserId - b.supervisorUserId)
                        .map((v) => {
                          const done = v.status === "DONE" || Boolean(v.countedOn);
                          return (
                            <tr key={v.id} onClick={() => setSelected(v)} className={done ? "is-done" : ""}>
                              <td className="kcc-datecell">
                                <span className="kcc-dt">
                                  <span className="kcc-wd">{weekdayShort(v.visitDate)}</span>
                                  {formatDmy(v.visitDate)}
                                </span>
                                {v.dayTotal > 1 && <small>día {v.daySeq} de {v.dayTotal}</small>}
                              </td>
                              <td>
                                {v.locationName}
                                {v.kind === "REVISIT" && <span className="kcc-revisit-tag"> Revisita</span>}
                                {v.manual && v.kind !== "REVISIT" && <span title="Movida a mano"> 📌</span>}
                              </td>
                              <td>
                                <span className={`kcc-tag kcc-r-${v.region}`}>
                                  <span className="kcc-swatch" />
                                  {v.regionLabel}
                                </span>
                              </td>
                              <td>{v.supervisorName}</td>
                              <td className="kcc-muted">
                                {v.gapDays == null ? "—" : `${v.gapDays} días (${formatShort(v.lastCountDate)})`}
                              </td>
                              <td>
                                <span className={`kcc-status ${done ? "ok" : ""}`}>
                                  {done ? (v.countedOn ? `Contado ${formatShort(v.countedOn)}` : "Hecha") : "Pendiente"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div
                className="kcc-grid"
                style={{ "--kcc-cols": dayNames.length }}
                role="grid"
                aria-label={`Calendario de ${monthTitle(month)}`}
              >
                {dayNames.map((d) => (
                  <div key={d} className="kcc-dow" role="columnheader">
                    {d}
                  </div>
                ))}
                {weeks.map((w) => {
                  const ws = key(w.weekStart);
                  return (
                    <React.Fragment key={ws}>
                      {weekBanner(w)}
                      {weekCells(ws, w.generatedSupervisorIds.length > 0)}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {showImport && (
        <KioskCountImportModal
          onClose={() => setShowImport(false)}
          onDone={() => {
            setShowImport(false);
            setRefreshKey((k) => k + 1);
            load();
          }}
        />
      )}

      {selected && (
        <VisitModal
          visit={selected}
          month={month}
          canEdit={canGenerate}
          editMode={editMode}
          busy={busy}
          onClose={() => setSelected(null)}
          onRevisit={() => {
            setAddDraft({ date: null, locationId: selected.locationId, revisit: true });
            setSelected(null);
          }}
          onSave={async (changes) => {
            setBusy(true);
            try {
              setData(await updateCountVisit(selected.id, { ...changes, month }));
              setSelected(null);
              showSuccess("Visita actualizada.");
            } catch (error) {
              showError(error.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {addDraft && (
        <AddVisitModal
          draft={addDraft}
          kiosks={(data?.kiosks || []).filter((k) => !supervisorId || k.supervisorUserId === supervisorId)}
          today={today}
          busy={busy}
          onClose={() => setAddDraft(null)}
          onSave={async (payload) => {
            setBusy(true);
            try {
              setData(await addCountVisit({ ...payload, month }));
              setAddDraft(null);
              showSuccess("Visita agregada.");
            } catch (error) {
              showError(error.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {generateRedo && (
        <Modal isOpen toggle={() => setGenerateRedo(null)} centered className="kcc-modal">
          <ModalHeader toggle={() => setGenerateRedo(null)}>
            {generateRedo.redo ? "Volver a repartir" : "Generar"} semana del {weekRange(weekStart)}
          </ModalHeader>
          <ModalBody>
            <GenerateChoices
              supervisors={supervisors}
              ids={generateRedo.ids}
              eligible={generateRedo.ids}
              generatedIds={generatedIds}
              onChange={(ids) => setGenerateRedo({ ...generateRedo, ids })}
            />
            <ul className="kcc-rules">
              <li>Solo se arma esta semana. Las siguientes se generan después, con lo que realmente pasó.</li>
              <li>Una región seguida y fechas al azar: no repiten el día del mes anterior.</li>
              {generateRedo.redo ? (
                <li>Se vuelve a repartir lo pendiente; lo hecho y lo que moviste a mano se conserva.</li>
              ) : (
                <li>Una vez generada no se genera otra vez; para cambiar fechas usa «Editar calendario».</li>
              )}
            </ul>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" outline onClick={() => setGenerateRedo(null)}>
              Cancelar
            </Button>
            <Button
              color="primary"
              disabled={busy || generateRedo.ids.length === 0}
              onClick={() => runGenerate(generateRedo.ids, generateRedo.redo)}
            >
              {busy ? <Spinner size="sm" /> : generateRedo.redo ? "Volver a repartir" : "Generar semana"}
            </Button>
          </ModalFooter>
        </Modal>
      )}

      <Modal isOpen={showRules} toggle={() => setShowRules(false)} centered className="kcc-modal">
        <ModalHeader toggle={() => setShowRules(false)}>Reglas por kiosco</ModalHeader>
        <ModalBody>
          <p className="kcc-muted">Los demás kioscos: una visita al mes, de un día, cualquier día hábil.</p>
          <ul className="kcc-rules plain">
            {specialRules.map((k) => (
              <li key={k.locationId}>
                <strong>{k.name}</strong>
                {k.visitsPerMonth > 1 && <span> · {k.visitsPerMonth} visitas al mes (cada ~{Math.round(30 / k.visitsPerMonth)} días)</span>}
                {k.visitDays > 1 && <span> · visita de {k.visitDays} días seguidos</span>}
                {k.allowedWeekdays && <span> · solo {k.allowedWeekdays}</span>}
              </li>
            ))}
          </ul>
        </ModalBody>
      </Modal>

      <BlockedDaysModal
        isOpen={showDays}
        month={month}
        days={data?.nonWorkingDays || []}
        busy={busy}
        onClose={() => setShowDays(false)}
        onAdd={async (date, reason) => {
          setBusy(true);
          try {
            setData(await addCountBlockedDay(date, reason));
            showSuccess("Día marcado como no hábil. Si ya había visitas ese día, muévelas con «Editar calendario».");
          } catch (error) {
            showError(error.message);
          } finally {
            setBusy(false);
          }
        }}
        onRemove={async (date) => {
          setBusy(true);
          try {
            setData(await removeCountBlockedDay(date));
          } catch (error) {
            showError(error.message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function GenerateChoices({ supervisors, ids, eligible, generatedIds, onChange }) {
  return (
    <>
      <p className="kcc-modal-lead">¿Para quién?</p>
      {supervisors.map((s) => {
        const can = eligible.includes(s.userId);
        const already = generatedIds.includes(s.userId) && !can;
        return (
          <label key={s.userId} className={`kcc-check ${can ? "" : "is-disabled"}`}>
            <input
              type="checkbox"
              disabled={!can}
              checked={ids.includes(s.userId)}
              onChange={(e) => onChange(e.target.checked ? [...ids, s.userId] : ids.filter((id) => id !== s.userId))}
            />
            <span>
              <strong>{s.name}</strong>
              <small>
                {can ? `${s.kioskCount} kioscos asignados` : already ? "Esta semana ya está generada" : "Primero debe generar una semana anterior"}
              </small>
            </span>
          </label>
        );
      })}
    </>
  );
}

function VisitModal({ visit, month, canEdit, editMode, busy, onClose, onSave, onRevisit }) {
  const [date, setDate] = useState(key(visit.visitDate));
  const [status, setStatus] = useState(visit.status);
  const [note, setNote] = useState(visit.note || "");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [y, m] = visit.visitDate.slice(0, 7).split("-").map(Number);
  const min = ymd(y, m, 1);
  const max = ymd(y, m, new Date(y, m, 0).getDate());
  const changed = date !== key(visit.visitDate) || status !== visit.status || note !== (visit.note || "");

  const save = () => {
    const changes = {};
    if (date !== key(visit.visitDate)) changes.visitDate = date;
    if (status !== visit.status) changes.status = status;
    if (note !== (visit.note || "")) changes.note = note;
    onSave(changes);
  };

  return (
    <Modal isOpen toggle={onClose} centered className="kcc-modal">
      <ModalHeader toggle={onClose}>
        <span className={`kcc-tag kcc-r-${visit.region}`}>
          <span className="kcc-swatch" />
          {visit.regionLabel}
          {visit.kind === "REVISIT" && <span className="kcc-revisit-tag"> · Revisita</span>}
        </span>
        <div className="kcc-modal-title">{visit.locationName}</div>
      </ModalHeader>
      <ModalBody>
        <dl className="kcc-facts">
          <div>
            <dt>Supervisora</dt>
            <dd>{visit.supervisorName}</dd>
          </div>
          <div>
            <dt>Visita</dt>
            <dd>
              {formatLong(visit.visitDate)}
              {visit.dayTotal > 1 && ` · día ${visit.daySeq} de ${visit.dayTotal}`}
            </dd>
          </div>
          <div>
            <dt>Último conteo</dt>
            <dd>{gapText(visit)}</dd>
          </div>
          {visit.countedOn && (
            <div>
              <dt>Conteo registrado</dt>
              <dd>{formatLong(visit.countedOn)}</dd>
            </div>
          )}
        </dl>

        {canEdit ? (
          <>
            {editMode && (
              <label className="kcc-field">
                Mover a otra fecha
                <Input type="date" value={date} min={min} max={max} onChange={(e) => setDate(e.target.value)} />
                <small>Solo días hábiles de {monthTitle(month === visit.visitDate.slice(0, 7) ? month : visit.visitDate.slice(0, 7))}. Al moverla queda fija (📌).</small>
              </label>
            )}
            <div className="kcc-field">
              Estado
              <div className="kcc-seg full" role="group" aria-label="Estado de la visita">
                <button type="button" className={status === "PLANNED" ? "on" : ""} onClick={() => setStatus("PLANNED")}>
                  {STATUS_LABEL.PLANNED}
                </button>
                <button type="button" className={status === "DONE" ? "on" : ""} onClick={() => setStatus("DONE")}>
                  {STATUS_LABEL.DONE}
                </button>
              </div>
            </div>
            <label className="kcc-field">
              Nota
              <Input
                type="textarea"
                rows={2}
                maxLength={500}
                value={note}
                placeholder="Ej.: el kiosco estaba cerrado, hay que volver"
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          </>
        ) : (
          visit.note && <p className="kcc-muted">Nota: {visit.note}</p>
        )}
      </ModalBody>
      {canEdit && (
        <ModalFooter className="kcc-modal-foot">
          {confirmCancel ? (
            <>
              <span className="kcc-muted">¿Quitar esta visita del calendario?</span>
              <Button color="secondary" outline size="sm" onClick={() => setConfirmCancel(false)}>
                No
              </Button>
              <Button color="danger" size="sm" disabled={busy} onClick={() => onSave({ status: "CANCELLED" })}>
                Sí, quitar
              </Button>
            </>
          ) : (
            <>
              {editMode && (
                <Button color="link" className="kcc-danger-link" onClick={() => setConfirmCancel(true)}>
                  Quitar visita
                </Button>
              )}
              <Button color="secondary" outline size="sm" onClick={onRevisit} title="Programar otra visita a este kiosco">
                Volver a ir
              </Button>
              <span className="kcc-spacer" />
              <Button color="secondary" outline onClick={onClose}>
                Cerrar
              </Button>
              <Button color="primary" disabled={!changed || busy} onClick={save}>
                {busy ? <Spinner size="sm" /> : "Guardar"}
              </Button>
            </>
          )}
        </ModalFooter>
      )}
    </Modal>
  );
}

function AddVisitModal({ draft, kiosks, today, busy, onClose, onSave }) {
  const [locationId, setLocationId] = useState(draft.locationId ? String(draft.locationId) : "");
  const [date, setDate] = useState(draft.date || "");
  const [note, setNote] = useState(draft.revisit ? "Revisita" : "");
  const kiosk = kiosks.find((k) => String(k.locationId) === locationId);
  const weekdayWarn =
    kiosk?.allowedWeekdays && date ? `${kiosk.name} solo permite visitas en: ${kiosk.allowedWeekdays}.` : null;
  return (
    <Modal isOpen toggle={onClose} centered className="kcc-modal">
      <ModalHeader toggle={onClose}>{draft.revisit ? "Volver a ir" : "Agregar visita"}</ModalHeader>
      <ModalBody>
        <label className="kcc-field">
          Kiosco
          <Input type="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Elige un kiosco…</option>
            {kiosks.map((k) => (
              <option key={k.locationId} value={k.locationId}>
                {k.name}
              </option>
            ))}
          </Input>
        </label>
        <label className="kcc-field">
          Fecha
          <Input type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
          <small>
            Si el kiosco ya tuvo su visita o conteo este mes, esta queda como <strong>revisita</strong> y no cambia su
            visita del mes. Si no, es su visita del mes.
          </small>
          {weekdayWarn && <small className="kcc-warn-text">{weekdayWarn}</small>}
        </label>
        <label className="kcc-field">
          Motivo / nota
          <Input type="textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej.: diferencia en el conteo, hay que contar otra vez" />
        </label>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          Cancelar
        </Button>
        <Button color="primary" disabled={!locationId || !date || busy} onClick={() => onSave({ locationId: Number(locationId), visitDate: date, note })}>
          {busy ? <Spinner size="sm" /> : "Agregar"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function BlockedDaysModal({ isOpen, month, days, busy, onClose, onAdd, onRemove }) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const inMonth = days.filter((d) => key(d.date).slice(0, 7) === month);
  return (
    <Modal isOpen={isOpen} toggle={onClose} centered className="kcc-modal">
      <ModalHeader toggle={onClose}>Días no hábiles de {monthTitle(month)}</ModalHeader>
      <ModalBody>
        <p className="kcc-muted">
          Los fines de semana y los feriados nacionales ya se saltan solos. Agrega aquí otros días (cierre,
          capacitación, etc.). Aplica a las semanas que se generen después.
        </p>
        <ul className="kcc-days">
          {inMonth.length === 0 && <li className="kcc-muted">No hay días no hábiles este mes.</li>}
          {inMonth.map((d) => (
            <li key={key(d.date)}>
              <span>
                <strong>{formatShort(d.date)}</strong> · {d.reason}
              </span>
              {d.type === "BLOCKED" ? (
                <button type="button" className="kcc-link kcc-danger-link" disabled={busy} onClick={() => onRemove(key(d.date))}>
                  Quitar
                </button>
              ) : (
                <small className="kcc-muted">Feriado</small>
              )}
            </li>
          ))}
        </ul>
        <div className="kcc-add-day">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Fecha" />
          <Input type="text" placeholder="Motivo" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} aria-label="Motivo" />
          <Button
            color="primary"
            disabled={!date || busy}
            onClick={async () => {
              await onAdd(date, reason);
              setDate("");
              setReason("");
            }}
          >
            Agregar
          </Button>
        </div>
      </ModalBody>
    </Modal>
  );
}
