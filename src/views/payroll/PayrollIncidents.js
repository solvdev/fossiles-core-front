import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Spinner } from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import SideDrawer from "components/SideDrawer/SideDrawer";
import { cancelIncident, createIncidents, getIncidentWorkspace, getIncidents } from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";
import PayrollShell from "./PayrollShell";
import { Avatar, SECTIONS, fmtDate, fmtLong, fmtShort, todayIso } from "./payrollUi";

const KINDS = [
  ["HORA_EXTRA", "Hora extra"],
  ["FERIADO_TRABAJADO", "Feriado trabajado"],
  ["AUSENCIA", "Ausencia sin goce"],
  ["VACACIONES", "Vacaciones"],
];
const KIND_LABEL = Object.fromEntries(KINDS);
const KIND_PILL = { HORA_EXTRA: "aprobada", FERIADO_TRABAJADO: "borrador", AUSENCIA: "anulada", VACACIONES: "pagada" };
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SECTION_ORDER = ["PLANTA", "KIOSCOS", "ADMINISTRACION"];

const pad = (n) => String(n).padStart(2, "0");
const monthStart = (year, month) => `${year}-${pad(month + 1)}-01`;
const monthEnd = (year, month) => `${year}-${pad(month + 1)}-${pad(new Date(year, month + 1, 0).getDate())}`;
const isRanged = (kind) => kind === "AUSENCIA" || kind === "VACACIONES";
const days = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

const emptyForm = (kind = "HORA_EXTRA", date = "") => ({
  kind, employeeIds: new Set(), dateFrom: date || todayIso(), dateTo: date || todayIso(), hours: "", hourlyRate: "", note: "", query: "",
});

/** Cuánto o qué abarca una novedad, en una frase corta. */
const detailOf = (incident) => {
  if (incident.kind === "HORA_EXTRA") return `${Number(incident.hours)} h${incident.hourlyRateOverride != null ? ` · pago Q${Number(incident.hourlyRateOverride).toFixed(2)} por hora` : ""}`;
  if (incident.kind === "FERIADO_TRABAJADO") {
    return `${incident.holidayName || "Feriado"}${incident.hours != null ? ` · ${Number(incident.hours)} h` : " · jornada completa"}${incident.hourlyRateOverride != null ? ` · Q${Number(incident.hourlyRateOverride).toFixed(2)} por hora` : ""}`;
  }
  const count = days(incident.dateFrom, incident.dateTo);
  return `${count} ${count === 1 ? "día" : "días"}`;
};
const datesOf = (incident) => (incident.dateFrom === incident.dateTo ? fmtShort(incident.dateFrom) : `${fmtShort(incident.dateFrom)} al ${fmtShort(incident.dateTo)}`);

/**
 * Novedades de personal: feriados trabajados, horas extra, ausencias y vacaciones. Cada quien ve y registra a su gente:
 * las supervisoras a los kioscos que supervisan, el jefe de producción a planta y Contabilidad a administración.
 * Lo que se registra entra directo a la planilla del período que cubre su fecha.
 */
function PayrollIncidents() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [workspace, setWorkspace] = useState(null);
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [kindFilter, setKindFilter] = useState("ALL");
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toCancel, setToCancel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [space, list] = await Promise.all([
        getIncidentWorkspace(year),
        getIncidents({ from: `${year}-01-01`, to: `${year}-12-31` }),
      ]);
      setWorkspace(space);
      setIncidents(list || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la vista de novedades.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const people = useMemo(() => (workspace ? workspace.people || [] : []), [workspace]);
  const sections = useMemo(() => SECTION_ORDER.filter((s) => workspace && (workspace.sections || []).includes(s)), [workspace]);
  const today = todayIso();

  const goMonth = (delta) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  const monthIncidents = useMemo(() => {
    const start = monthStart(year, month);
    const end = monthEnd(year, month);
    const term = search.trim().toLowerCase();
    return incidents.filter((i) => i.dateFrom <= end && i.dateTo >= start
      && (kindFilter === "ALL" || i.kind === kindFilter)
      && (sectionFilter === "ALL" || i.section === sectionFilter)
      && (!term || i.employeeName.toLowerCase().includes(term)));
  }, [incidents, year, month, kindFilter, sectionFilter, search]);
  const kindCounts = useMemo(() => {
    const start = monthStart(year, month);
    const end = monthEnd(year, month);
    const inMonth = incidents.filter((i) => i.dateFrom <= end && i.dateTo >= start);
    const counts = { ALL: inMonth.length };
    KINDS.forEach(([kind]) => { counts[kind] = inMonth.filter((i) => i.kind === kind).length; });
    return counts;
  }, [incidents, year, month]);

  const holidayWorkers = (date) => incidents.filter((i) => i.kind === "FERIADO_TRABAJADO" && i.dateFrom === date).length;

  const openForm = (kind, date) => {
    setForm(emptyForm(kind, date));
    setFormErrors({});
  };
  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFormErrors((current) => ({ ...current, [key]: "" }));
  };
  const setKind = (kind) => setForm((current) => ({
    ...current, kind, hours: "", hourlyRate: "",
    dateFrom: kind === "FERIADO_TRABAJADO" ? "" : (current.dateFrom || todayIso()), dateTo: current.dateTo || todayIso(),
  }));
  const toggleEmployee = (id) => setForm((current) => {
    const next = new Set(current.employeeIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { ...current, employeeIds: next };
  });

  const formPeople = useMemo(() => {
    if (!form) return [];
    const term = form.query.trim().toLowerCase();
    return people.filter((p) => !term || `${p.fullName} ${p.position || ""} ${p.kioskName || ""}`.toLowerCase().includes(term));
  }, [people, form]);

  const pastHolidays = useMemo(() => (workspace ? (workspace.holidays || []).filter((h) => h.date <= today) : []), [workspace, today]);

  const submit = async () => {
    const found = {};
    if (form.employeeIds.size === 0) found.employeeIds = "Elija al menos una persona.";
    if (!form.dateFrom) found.dateFrom = form.kind === "FERIADO_TRABAJADO" ? "Elija el feriado." : "Indique la fecha.";
    if (isRanged(form.kind) && form.dateFrom && (!form.dateTo || form.dateTo < form.dateFrom)) found.dateTo = "La fecha final no puede ser anterior a la inicial.";
    if (form.kind === "HORA_EXTRA" && !(Number(form.hours) > 0 && Number(form.hours) <= 16)) found.hours = "Indique las horas extra: más de 0 y hasta 16.";
    if (form.kind === "FERIADO_TRABAJADO" && form.hours !== "" && !(Number(form.hours) > 0 && Number(form.hours) <= 24)) found.hours = "Las horas deben ser más de 0 y hasta 24.";
    if (form.hourlyRate !== "" && !(Number(form.hourlyRate) >= 0)) found.hourlyRate = "El pago por hora no puede ser negativo.";
    setFormErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const created = await createIncidents({
        employeeIds: [...form.employeeIds],
        kind: form.kind,
        dateFrom: form.dateFrom,
        dateTo: isRanged(form.kind) ? form.dateTo : null,
        hours: form.hours === "" ? null : Number(form.hours),
        hourlyRate: form.hourlyRate === "" ? null : Number(form.hourlyRate),
        note: form.note.trim() || null,
      });
      showSuccess(created.length === 1 ? "Novedad registrada." : `${created.length} novedades registradas.`);
      setForm(null);
      const date = new Date(`${form.dateFrom}T00:00:00`);
      if (date.getFullYear() === year) {
        setMonth(date.getMonth());
      }
      await load();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const doCancel = async () => {
    await cancelIncident(toCancel.id);
    showSuccess("Novedad anulada.");
    await load();
  };

  const factorText = (kind) => {
    if (!workspace) return "";
    if (kind === "HORA_EXTRA") return `Se paga a ×${Number(workspace.overtimeFactor)} del valor de la hora (sueldo ÷ 30 ÷ ${Number(workspace.workdayHours)}). Si indica un pago por hora, se usa ese.`;
    if (kind === "FERIADO_TRABAJADO") return `Cada hora trabajada se paga a ×${Number(workspace.holidayFactor)} del valor de la hora. Si no anota horas, cuenta la jornada de ${Number(workspace.workdayHours)} h.`;
    if (kind === "AUSENCIA") return "Cada día de ausencia resta un día de sueldo, bonificación incluida.";
    return "Las vacaciones quedan registradas para llevar el control; no cambian el pago.";
  };

  const subtitle = "Feriados trabajados, horas extra, ausencias y vacaciones. Lo que registre entra a la planilla del período de esa fecha.";

  if (loading && !workspace) {
    return <PayrollShell active="incidents" title="Novedades de personal" subtitle={subtitle}><Spinner size="sm" /></PayrollShell>;
  }
  if (error && !workspace) {
    return (
      <PayrollShell active="incidents" title="Novedades de personal" subtitle={subtitle}>
        <Alert color="danger">{error}</Alert>
      </PayrollShell>
    );
  }

  const scopeText = sections.map((s) => SECTIONS[s]).join(", ");
  return (
    <PayrollShell active="incidents" title="Novedades de personal" subtitle={subtitle}>
      <div className="pl-row mb-3">
        <span className="pl-sub">Usted registra a: <b>{scopeText || "nadie"}</b>{people.length > 0 ? ` · ${people.length} ${people.length === 1 ? "persona" : "personas"}` : ""}</span>
        <span className="pl-spacer" />
        <Button color="primary" className="m-0" disabled={people.length === 0} onClick={() => openForm("HORA_EXTRA")}>Nueva novedad</Button>
      </div>

      {people.length === 0 && (
        <Alert color="warning">
          No hay personal a su cargo para registrar. Si es supervisora, pida que le asignen sus kioscos en Supervisoras y Kioscos
          y que cada colaborador tenga su kiosco en la ficha.
        </Alert>
      )}

      <section className="pl-card" aria-label="Feriados de Guatemala">
        <div className="pl-card__head">
          <h5>Feriados de Guatemala {year}</h5>
          <span className="pl-sub">Si alguien trabajó en un feriado, regístrelo aquí.</span>
        </div>
        <div className="pl-holidays">
          {(workspace.holidays || []).map((holiday) => {
            const future = holiday.date > today;
            const workers = holidayWorkers(holiday.date);
            return (
              <div key={holiday.date} className={`pl-holiday${future ? " pl-holiday--future" : ""}`}>
                <div className="pl-holiday__date">{fmtLong(holiday.date)}</div>
                <div className="pl-holiday__name">{holiday.name}</div>
                <div className="pl-holiday__meta">
                  {holiday.halfDay && <span className="pl-tag pl-tag--info">Medio día</span>}
                  {holiday.cityOnly && <span className="pl-tag pl-tag--info">Solo ciudad</span>}
                  {workers > 0 && <span className="pl-tag pl-tag--ok">{workers} {workers === 1 ? "trabajó" : "trabajaron"}</span>}
                </div>
                <Button size="sm" color="secondary" outline className="m-0" disabled={future || people.length === 0}
                  aria-label={`Registrar quién trabajó el ${holiday.name}`} title={future ? "Todavía no llega" : undefined}
                  onClick={() => openForm("FERIADO_TRABAJADO", holiday.date)}>
                  Registrar quién trabajó
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="pl-card">
        <div className="pl-tools">
          <div className="pl-month" role="group" aria-label="Mes">
            <button type="button" className="pl-month__btn" aria-label="Mes anterior" onClick={() => goMonth(-1)}><i className="nc-icon nc-minimal-left" /></button>
            <b>{MONTHS[month]} {year}</b>
            <button type="button" className="pl-month__btn" aria-label="Mes siguiente" onClick={() => goMonth(1)}><i className="nc-icon nc-minimal-right" /></button>
          </div>
          <div className="pl-chips" role="group" aria-label="Tipo de novedad">
            {[["ALL", "Todas"], ...KINDS].map(([key, label]) => (
              <button key={key} type="button" className="pl-chip" aria-pressed={kindFilter === key} onClick={() => setKindFilter(key)}>
                {label} <em>{kindCounts[key] || 0}</em>
              </button>
            ))}
          </div>
          <span className="pl-spacer" />
          {sections.length > 1 && (
            <Input type="select" bsSize="sm" aria-label="Sección" value={sectionFilter} style={{ width: "auto" }} onChange={(e) => setSectionFilter(e.target.value)}>
              <option value="ALL">Todas las secciones</option>
              {sections.map((s) => <option key={s} value={s}>{SECTIONS[s]}</option>)}
            </Input>
          )}
          <div className="pl-search">
            <i className="nc-icon nc-zoom-split" aria-hidden="true" />
            <Input bsSize="sm" placeholder="Buscar persona" aria-label="Buscar persona" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="pl-scroll">
          <table className="pl-table">
            <thead>
              <tr><th>Persona</th><th>Novedad</th><th>Fechas</th><th>Detalle</th><th>Nota</th><th /></tr>
            </thead>
            <tbody>
              {monthIncidents.length === 0 && (
                <tr><td colSpan="6" className="pl-empty">No hay novedades en {MONTHS[month]} con esos filtros.</td></tr>
              )}
              {monthIncidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <div className="pl-who">
                      <Avatar name={incident.employeeName} />
                      <div><b>{incident.employeeName}</b><small>{SECTIONS[incident.section] || ""}</small></div>
                    </div>
                  </td>
                  <td><span className={`pl-pill pl-pill--${KIND_PILL[incident.kind]}`}>{KIND_LABEL[incident.kind] || incident.kind}</span></td>
                  <td className="pl-num">{datesOf(incident)}</td>
                  <td>{detailOf(incident)}</td>
                  <td className="pl-sub">{incident.note || "—"}</td>
                  <td className="r">
                    <Button size="sm" color="danger" outline className="m-0" aria-label={`Anular la novedad de ${incident.employeeName}`}
                      onClick={() => setToCancel(incident)}>Anular</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SideDrawer
        isOpen={Boolean(form)}
        onClose={() => { if (!saving) setForm(null); }}
        title="Nueva novedad"
        subtitle="Entra a la planilla del período de esa fecha."
        footer={(
          <>
            <Button color="secondary" outline disabled={saving} onClick={() => setForm(null)}>Cancelar</Button>
            <Button color="primary" disabled={saving} onClick={submit}>
              {saving ? "Registrando…" : form && form.employeeIds.size > 1 ? `Registrar a ${form.employeeIds.size} personas` : "Registrar"}
            </Button>
          </>
        )}
      >
        {form && (
          <>
            <div className="pl-field">
              <span className="pl-fl">Qué pasó</span>
              <div className="pl-seg" role="radiogroup" aria-label="Tipo de novedad">
                {KINDS.map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={form.kind === value} onClick={() => setKind(value)}>{label}</button>
                ))}
              </div>
              <small>{factorText(form.kind)}</small>
            </div>

            {form.kind === "FERIADO_TRABAJADO" ? (
              <div className="pl-field">
                <label htmlFor="nov-feriado">Feriado trabajado</label>
                <Input id="nov-feriado" type="select" value={form.dateFrom} invalid={Boolean(formErrors.dateFrom)} onChange={(e) => setField("dateFrom", e.target.value)}>
                  <option value="">Elija el feriado</option>
                  {pastHolidays.map((h) => <option key={h.date} value={h.date}>{fmtDate(h.date)} · {h.name}</option>)}
                </Input>
                {formErrors.dateFrom && <span className="pl-err">{formErrors.dateFrom}</span>}
              </div>
            ) : (
              <div className="pl-two">
                <div className="pl-field">
                  <label htmlFor="nov-desde">{isRanged(form.kind) ? "Desde" : "Día"}</label>
                  <Input id="nov-desde" type="date" value={form.dateFrom} max={form.kind === "HORA_EXTRA" ? today : undefined}
                    invalid={Boolean(formErrors.dateFrom)} onChange={(e) => setField("dateFrom", e.target.value)} />
                  {formErrors.dateFrom && <span className="pl-err">{formErrors.dateFrom}</span>}
                </div>
                {isRanged(form.kind) && (
                  <div className="pl-field">
                    <label htmlFor="nov-hasta">Hasta</label>
                    <Input id="nov-hasta" type="date" value={form.dateTo} min={form.dateFrom} invalid={Boolean(formErrors.dateTo)}
                      onChange={(e) => setField("dateTo", e.target.value)} />
                    {formErrors.dateTo && <span className="pl-err">{formErrors.dateTo}</span>}
                  </div>
                )}
              </div>
            )}

            {!isRanged(form.kind) && (
              <div className="pl-two">
                <div className="pl-field">
                  <label htmlFor="nov-horas">{form.kind === "HORA_EXTRA" ? "Horas extra" : "Horas trabajadas"}</label>
                  <Input id="nov-horas" type="number" min="0" step="0.25" className="pl-num" value={form.hours}
                    placeholder={form.kind === "FERIADO_TRABAJADO" ? "Jornada completa" : ""} invalid={Boolean(formErrors.hours)}
                    onChange={(e) => setField("hours", e.target.value)} />
                  {formErrors.hours && <span className="pl-err">{formErrors.hours}</span>}
                </div>
                <div className="pl-field">
                  <label htmlFor="nov-pago">Pago por hora (Q)</label>
                  <Input id="nov-pago" type="number" min="0" step="0.01" className="pl-num" value={form.hourlyRate}
                    placeholder="Según el recargo" invalid={Boolean(formErrors.hourlyRate)} onChange={(e) => setField("hourlyRate", e.target.value)} />
                  {formErrors.hourlyRate ? <span className="pl-err">{formErrors.hourlyRate}</span> : <small>Opcional: reemplaza el recargo.</small>}
                </div>
              </div>
            )}

            <div className="pl-field">
              <span className="pl-fl">Personas ({form.employeeIds.size} elegidas)</span>
              <Input bsSize="sm" aria-label="Buscar persona para la novedad" placeholder="Buscar por nombre, puesto o kiosco" value={form.query}
                onChange={(e) => setField("query", e.target.value)} />
              <div className="pl-people" role="group" aria-label="Personas">
                {formPeople.length > 0 && (
                  <label className="pl-person pl-person--all">
                    <input type="checkbox" checked={formPeople.every((p) => form.employeeIds.has(p.id))}
                      onChange={(e) => setForm((current) => {
                        const next = new Set(current.employeeIds);
                        formPeople.forEach((p) => (e.target.checked ? next.add(p.id) : next.delete(p.id)));
                        return { ...current, employeeIds: next };
                      })} />
                    <span>Todas las que se ven ({formPeople.length})</span>
                  </label>
                )}
                {formPeople.map((person) => (
                  <label key={person.id} className="pl-person">
                    <input type="checkbox" checked={form.employeeIds.has(person.id)} onChange={() => toggleEmployee(person.id)} />
                    <span>{person.fullName}<small>{[SECTIONS[person.section], person.kioskName, person.position].filter(Boolean).join(" · ")}</small></span>
                  </label>
                ))}
                {formPeople.length === 0 && <div className="pl-empty" style={{ padding: 16 }}>Nadie coincide con la búsqueda.</div>}
              </div>
              {formErrors.employeeIds && <span className="pl-err">{formErrors.employeeIds}</span>}
            </div>

            <div className="pl-field">
              <label htmlFor="nov-nota">Nota</label>
              <Input id="nov-nota" maxLength={300} value={form.note} placeholder="Por qué, quién lo autorizó…" onChange={(e) => setField("note", e.target.value)} />
            </div>
          </>
        )}
      </SideDrawer>

      <ConfirmModal
        isOpen={Boolean(toCancel)}
        toggle={() => setToCancel(null)}
        title="Anular novedad"
        message={toCancel ? `${KIND_LABEL[toCancel.kind] || toCancel.kind} de ${toCancel.employeeName}, ${datesOf(toCancel)}.` : ""}
        detail="Deja de contar en la planilla. No se puede anular si la planilla de ese período ya está aprobada."
        confirmText="Anular"
        confirmColor="danger"
        onConfirm={async () => {
          try {
            await doCancel();
          } catch (err) {
            showError(err.message);
          }
          setToCancel(null);
        }}
      />
    </PayrollShell>
  );
}

export default PayrollIncidents;
