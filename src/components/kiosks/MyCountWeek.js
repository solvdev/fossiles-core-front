import React, { useCallback, useEffect, useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { changeMyVisitDate, getMyCountWeek } from "services/kioskCountCalendarService";
import { startKioscoConteo } from "services/kioscoInventoryService";
import { toApiLocalDateTimeGuatemala } from "utils/dateTimeHelper";
import { addDays, formatDmy, key, weekdayShort, weekRange } from "utils/kioskCountDateHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import "./MyCountWeek.css";

const STATE = {
  DRAFT: ["En conteo", "info"],
  CONTADO: ["Contado, por revisar", "warn"],
  REVISADO: ["Revisado", "info"],
  CERRADO: ["Cerrado", "ok"],
};

const visitDay = (visit) => key(visit.actualDate || visit.visitDate);

/**
 * «Tu calendario de la semana»: a qué kiosco le toca ir a la supervisora, qué día y por qué período, con la opción de
 * crear el conteo desde ahí y de cambiar la fecha en que llegó (dentro de la semana y con justificación). Solo muestra
 * las visitas de quien está conectada; para quien no es supervisora no aparece.
 */
export default function MyCountWeek({ onOpenCount }) {
  const [week, setWeek] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(null);
  const [changing, setChanging] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMyCountWeek(week));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [week]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data?.supervisor) return null;

  const start = key(data.weekStart);
  const today = key(data.today);

  const create = async ({ visit, from, to }) => {
    const fromApi = toApiLocalDateTimeGuatemala(from);
    const toApi = toApiLocalDateTimeGuatemala(to);
    if (!fromApi || !toApi || fromApi > toApi) {
      showError("Revisa el período: «desde» no puede ser posterior a «hasta».");
      return;
    }
    setBusy(true);
    try {
      const report = await startKioscoConteo(visit.locationId, fromApi, toApi);
      setCreating(null);
      showSuccess(`Conteo de ${visit.locationName} abierto.`);
      onOpenCount(visit.locationId, report.id);
      load();
    } catch (error) {
      showError(error.message || "No se pudo crear el conteo.");
    } finally {
      setBusy(false);
    }
  };

  const change = async ({ visit, date, reason }) => {
    setBusy(true);
    try {
      setData(await changeMyVisitDate(visit.id, date, reason));
      setChanging(null);
      showSuccess("Fecha cambiada.");
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mcw">
      <header className="mcw-head">
        <div>
          <h6>Tu calendario de la semana</h6>
          <small>{weekRange(start)}</small>
        </div>
        <div className="mcw-nav">
          {loading && <Spinner size="sm" />}
          <button type="button" aria-label="Semana anterior" onClick={() => setWeek(addDays(start, -7))}>
            ‹
          </button>
          <button type="button" className="mcw-today" onClick={() => setWeek(null)}>
            Esta semana
          </button>
          <button type="button" aria-label="Semana siguiente" onClick={() => setWeek(addDays(start, 7))}>
            ›
          </button>
        </div>
      </header>

      {data.visits.length === 0 ? (
        <p className="mcw-empty">No tienes visitas programadas esta semana.</p>
      ) : (
        <ul className="mcw-list">
          {data.visits.map((visit) => {
            const day = visitDay(visit);
            const [label, tone] = STATE[visit.countStatus] || (day < today ? ["Atrasada", "late"] : ["Pendiente", "none"]);
            return (
              <li key={visit.id} className={`mcw-item ${day === today ? "is-today" : ""}`}>
                <div className="mcw-day">
                  <span>{weekdayShort(day)}</span>
                  <strong>{Number(day.slice(8))}</strong>
                  {day === today && <small>Hoy</small>}
                </div>
                <div className="mcw-info">
                  <strong>
                    {visit.locationName}
                    {visit.dayTotal > 1 && ` · día ${visit.daySeq} de ${visit.dayTotal}`}
                    {visit.kind === "REVISIT" && " · Revisita"}
                  </strong>
                  <span>
                    Período: {visit.periodFrom ? formatDmy(visit.periodFrom) : "sin conteo anterior"} al{" "}
                    {visit.periodTo ? formatDmy(visit.periodTo) : "—"}
                  </span>
                  {visit.actualDate && (
                    <span className="mcw-changed">
                      Programada {formatDmy(visit.visitDate)}, cambiada al {formatDmy(visit.actualDate)}:{" "}
                      {visit.changeReason}
                    </span>
                  )}
                </div>
                <span className={`mcw-state ${tone}`}>{label}</span>
                <div className="mcw-actions">
                  {visit.countId ? (
                    <Button color="primary" outline size="sm" onClick={() => onOpenCount(visit.locationId, visit.countId)}>
                      Abrir conteo
                    </Button>
                  ) : (
                    <Button color="primary" size="sm" onClick={() => setCreating(visit)}>
                      Crear conteo
                    </Button>
                  )}
                  <button type="button" className="mcw-link" onClick={() => setChanging(visit)}>
                    Cambiar fecha
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {creating && <CreateModal visit={creating} busy={busy} onClose={() => setCreating(null)} onSave={create} />}
      {changing && (
        <ChangeDateModal visit={changing} weekStart={start} busy={busy} onClose={() => setChanging(null)} onSave={change} />
      )}
    </section>
  );
}

function CreateModal({ visit, busy, onClose, onSave }) {
  const [from, setFrom] = useState(visit.periodFrom ? `${key(visit.periodFrom)}T00:00` : "");
  const [to, setTo] = useState(visit.periodTo ? `${key(visit.periodTo)}T23:59` : "");
  return (
    <Modal isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>Crear conteo · {visit.locationName}</ModalHeader>
      <ModalBody>
        <label className="mcw-field">
          Desde (hora Guatemala)
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="mcw-field">
          Hasta (hora Guatemala)
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <small className="text-muted">Revisa el período antes de crear el conteo.</small>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          Cancelar
        </Button>
        <Button color="primary" disabled={!from || !to || busy} onClick={() => onSave({ visit, from, to })}>
          {busy ? <Spinner size="sm" /> : "Crear conteo"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function ChangeDateModal({ visit, weekStart, busy, onClose, onSave }) {
  const [date, setDate] = useState(visitDay(visit));
  const [reason, setReason] = useState("");
  const monday = key(visit.visitDate) >= weekStart ? weekStart : addDays(weekStart, -7);
  const valid = date && date !== visitDay(visit) && reason.trim().length >= 10;
  return (
    <Modal isOpen toggle={onClose} centered>
      <ModalHeader toggle={onClose}>Cambiar fecha · {visit.locationName}</ModalHeader>
      <ModalBody>
        <label className="mcw-field">
          Fecha en que llegaste o vas a llegar
          <Input type="date" value={date} min={monday} max={addDays(monday, 6)} onChange={(e) => setDate(e.target.value)} />
          <small>Solo un día de la misma semana ({weekRange(monday)}). Programada: {formatDmy(visit.visitDate)}.</small>
        </label>
        <label className="mcw-field">
          Justificación (obligatoria)
          <Input
            type="textarea"
            rows={3}
            maxLength={500}
            value={reason}
            placeholder="Explica por qué cambia la fecha"
            onChange={(e) => setReason(e.target.value)}
          />
          <small>Mínimo 10 caracteres.</small>
        </label>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          Cancelar
        </Button>
        <Button color="primary" disabled={!valid || busy} onClick={() => onSave({ visit, date, reason })}>
          {busy ? <Spinner size="sm" /> : "Guardar cambio"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
