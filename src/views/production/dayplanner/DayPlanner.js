import React from "react";
import { Button } from "reactstrap";
import DatePickerField from "components/common/DatePickerField";
import { getTodayYmdGuatemala, shiftYmdGuatemala } from "utils/dateTimeHelper";
import { planBlockers } from "utils/dayPlanHelper";
import { concordar, contar } from "utils/textHelper";
import useDayPlanner, { nextWorkdayYmd } from "./useDayPlanner";
import { DAY_PLANNER_CSS } from "./dayPlannerStyles";
import StepSelectOrders from "./StepSelectOrders";
import StepBuildTasks from "./StepBuildTasks";
import StepReview, { dayShort } from "./StepReview";
import StepDone from "./StepDone";

const fmt = (n) => (Math.round((n || 0) * 10) / 10).toFixed(1);

function StepCard({ n, title, step, reached, summary, onChange, children }) {
  const active = step === n;
  const done = n < step && n <= reached;
  const cls = active ? "is-active" : done ? "is-done" : "is-locked";
  return (
    <section className={`dp-step ${cls}`} aria-label={`Paso ${n}: ${title}`}>
      <div className="dp-step-head">
        <span className="dp-num" aria-hidden="true">{done ? "✓" : n}</span>
        <span className="dp-ttl">{title}</span>
        {done && <button type="button" className="dp-link" onClick={onChange}>Cambiar</button>}
        {!active && summary && <span className="dp-sum">{summary}</span>}
      </div>
      {active && <div className="dp-body">{children}</div>}
    </section>
  );
}

/**
 * Armar el día: crear y asignar las tareas del día en una sola pantalla.
 *
 * Elegir OPs → Armar tareas → Revisar → Confirmar y descargar hoja. Un paso abierto a la vez,
 * un solo botón principal por paso. Reglas que se conservan del Organizador: OPL primero y sin
 * contar contra el límite, 4 h ideal y 5 h tope por tarea, solo lunes a viernes, y la mesa la
 * asigna el sistema (al marcar el corte).
 */
export default function DayPlanner() {
  const planner = useDayPlanner();
  const {
    date, setDate, weekend, goToMonday, step, reached, goTo, tasks, selectedIds, selectedOrders,
    loading, loadError, orders, buildTasks, goReview, confirm, confirming, previewLoading, preview,
    previewError, downloadSheet,
  } = planner;

  const today = getTodayYmdGuatemala();
  const tomorrow = nextWorkdayYmd(shiftYmdGuatemala(today, 1));
  const blockers = planBlockers(tasks);
  const selectedHours = selectedOrders.reduce((s, o) => s + (o.items || []).reduce(
    (a, i) => a + (i.remainingQuantity || 0) * (i.prdTimePerUnit || 0.1), 0), 0);
  const baseTasksHours = tasks.reduce((s, t) => s + (t.onlineSale ? 0 : t.lines.reduce(
    (a, l) => a + l.quantity * (l.prdTimePerUnit || 0.1), 0)), 0);

  let bar;
  if (step === 1) {
    const n = selectedIds.length;
    const disabled = n === 0 || weekend || loading || loadError;
    bar = (
      <>
        <div className="dp-hint">
          {n ? <><b>{n}</b> {concordar(n, "OP marcada", "OPs marcadas")} · {fmt(selectedHours)} h</>
            : orders.length ? "Marque al menos una OP" : "No hay OPs pendientes"}
        </div>
        <Button color="primary" className="dp-big" disabled={disabled} onClick={buildTasks}>
          Armar tareas{n ? ` (${n} ${concordar(n, "OP", "OPs")})` : ""}
        </Button>
      </>
    );
  } else if (step === 2) {
    bar = (
      <>
        <Button onClick={() => goTo(1)}>← Elegir OPs</Button>
        <div className="dp-hint">
          {blockers.length
            ? <><b style={{ color: "#a3300f" }}>{blockers[0]}.</b> Quite productos o use «Arreglar sola».</>
            : <><b>{tasks.length}</b> {concordar(tasks.length, "tarea", "tareas")} · {fmt(baseTasksHours)} h base · todo dentro del límite</>}
        </div>
        <Button color="primary" className="dp-big" disabled={blockers.length > 0 || tasks.length === 0} onClick={goReview}>
          Revisar
        </Button>
      </>
    );
  } else if (step === 3) {
    const blocked = !preview || previewLoading || preview.blocked;
    bar = (
      <>
        <Button onClick={() => goTo(2)} disabled={confirming}>← Armar tareas</Button>
        <div className="dp-hint">
          {confirming ? "Creando tareas…"
            : preview?.blocked ? <b style={{ color: "#a3300f" }}>Hay tareas que no se pueden confirmar. Vuelva a «Armar tareas».</b>
              : previewError ? "No se pudo calcular la propuesta."
                : <>Se {concordar(tasks.length, "crea", "crean")} <b>{contar(tasks.length, "tarea")}</b> de una vez.</>}
        </div>
        <Button color="success" className="dp-big" disabled={blocked || confirming} onClick={() => confirm()}>
          {confirming ? "Confirmando…" : "Confirmar y repartir"}
        </Button>
      </>
    );
  } else {
    bar = (
      <>
        <div className="dp-hint">Listo. Puede bajar la hoja o armar otro grupo.</div>
        <Button className="dp-big" onClick={planner.startOver}>Armar otro grupo</Button>
      </>
    );
  }

  return (
    <div className="content dp">
      <style>{DAY_PLANNER_CSS}</style>

      <div className="dp-head">
        <div className="dp-grow">
          <h4>Armar el día</h4>
          <small className="text-muted">Elija las OPs, arme las tareas y confirme. La mesa la asigna el sistema.</small>
        </div>
        <div className="d-flex flex-wrap align-items-center" style={{ gap: 8 }} role="group" aria-label="Día de trabajo">
          <span className="dp-small" style={{ fontWeight: 800 }}>Día de trabajo</span>
          <div className="dp-seg">
            <button type="button" aria-pressed={date === today} onClick={() => setDate(today)}>Hoy {dayShort(today)}</button>
            <button type="button" aria-pressed={date === tomorrow} onClick={() => setDate(tomorrow)}>Mañana {dayShort(tomorrow)}</button>
          </div>
          <div style={{ width: 150 }}>
            <DatePickerField value={date} onChange={(v) => v && setDate(v)} soloHabiles bsSize="md" />
          </div>
        </div>
        <Button onClick={() => downloadSheet(date)} title="Descarga la hoja con las tareas del día">⬇ Hoja del día</Button>
      </div>

      {weekend && (
        <div className="dp-note bad" role="alert">
          <div className="dp-x"><strong>Sábado y domingo no se produce.</strong> Elija un día de lunes a viernes.</div>
          <Button className="dp-sm" onClick={goToMonday}>Ir al lunes</Button>
        </div>
      )}

      <StepCard
        n={1} title="Elegir OPs" step={step} reached={reached} onChange={() => goTo(1)}
        summary={`${selectedIds.length} ${concordar(selectedIds.length, "OP marcada", "OPs marcadas")}`}
      >
        <StepSelectOrders planner={planner} />
      </StepCard>
      <StepCard
        n={2} title="Armar tareas" step={step} reached={reached} onChange={() => goTo(2)}
        summary={`${contar(tasks.length, "tarea")} · ${fmt(baseTasksHours)} h base`}
      >
        <StepBuildTasks planner={planner} />
      </StepCard>
      <StepCard
        n={3} title="Revisar" step={step} reached={reached} onChange={() => goTo(3)}
        summary={preview ? "Día y mesas propuestos" : ""}
      >
        <StepReview planner={planner} />
      </StepCard>
      <StepCard n={4} title="Listo y hoja del día" step={step} reached={reached} summary="">
        <StepDone planner={planner} />
      </StepCard>

      <div className="dp-bottom" role="region" aria-label="Acciones del paso">
        <div className="dp-bottom-in">{bar}</div>
      </div>
    </div>
  );
}
