import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import {
  generateLiquidationWeek,
  getLiquidationWeek,
  updateLiquidation,
} from "services/kioskCountCalendarService";
import { addDays, formatDmy, formatLong, formatShort, key, weekRange } from "utils/kioskCountDateHelper";
import { downloadLiquidationWeekExcel } from "utils/kioskLiquidationExport";
import { showError, showSuccess } from "utils/notificationHelper";

function GreenCell({ row }) {
  if (row.areasToFix == null) return <span className="kcc-muted">{row.greenNote || "Sin revisar"}</span>;
  if (row.areasToFix === 0) return <span className="kcc-pill ok">Sin áreas por corregir</span>;
  return (
    <span className="kcc-pill warn">
      {row.areasToFix} {row.areasToFix === 1 ? "área" : "áreas"} por corregir
    </span>
  );
}

/**
 * Liquidación semanal: la revisión de contabilidad de cada conteo (si salió bien el conteo, depósitos, cambios,
 * facturas verdes), unas 4 semanas después de la visita. Un kiosco por día, como en el Excel de contabilidad.
 */
export default function KioskLiquidationTab({ weekStart, supervisorId, today, refreshKey }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showPending, setShowPending] = useState(false);
  const [warnings, setWarnings] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getLiquidationWeek(weekStart));
    } catch (error) {
      showError(error.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    setWarnings([]);
    load();
  }, [load, refreshKey]);

  const groups = useMemo(
    () => (data?.groups || []).filter((g) => !supervisorId || g.supervisorUserId === supervisorId),
    [data, supervisorId]
  );
  const pending = useMemo(
    () => (data?.pending || []).filter((p) => !supervisorId || p.supervisorUserId === supervisorId),
    [data, supervisorId]
  );
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const liquidated = groups.reduce((n, g) => n + g.rows.filter((r) => r.status === "LIQUIDATED").length, 0);
  const toFix = groups.reduce((n, g) => n + g.rows.reduce((m, r) => m + (r.areasToFix || 0), 0), 0);
  const weekEndPast = addDays(weekStart, 4) < today;
  const canGenerate = Boolean(data?.canGenerate);

  const generate = async () => {
    setBusy(true);
    try {
      const result = await generateLiquidationWeek({
        weekStart,
        supervisorUserIds: supervisorId ? [supervisorId] : null,
      });
      setData(result.week);
      setWarnings(result.warnings || []);
      showSuccess("Liquidación de la semana actualizada.");
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const exportExcel = () => {
    if (!total) {
      showError("No hay liquidaciones en esta semana.");
      return;
    }
    try {
      downloadLiquidationWeekExcel({
        weekLabel: `Semana del ${weekRange(weekStart)}`,
        weekStart,
        groups,
      });
    } catch (error) {
      showError(error.message || "No se pudo generar el Excel.");
    }
  };

  if (loading) {
    return (
      <div className="kcc-center">
        <Spinner color="primary" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="kcc-empty">
        <h5>No se pudo cargar la liquidación</h5>
        <Button color="primary" outline onClick={load}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="kcc-stats">
        <div>
          <strong>{total}</strong>
          <span>kioscos por liquidar esta semana</span>
        </div>
        <div>
          <strong>
            {liquidated}/{total}
          </strong>
          <span>ya liquidados</span>
        </div>
        <div>
          <strong>{toFix}</strong>
          <span>áreas por corregir (facturas verdes)</span>
        </div>
        <div>
          <strong>{pending.length}</strong>
          <span>conteos sin fecha de liquidación</span>
        </div>
      </div>

      <div className="kcc-weekstate is-none">
        <div>
          <strong>Liquidar de la semana del {weekRange(weekStart)}</strong>
          <span>
            La liquidación es la revisión de contabilidad de cada conteo: si salió bien, depósitos, cambios y facturas
            verdes. Se hace unos 30 días después de la visita, un kiosco por día.
          </span>
        </div>
        <div className="kcc-weekstate-actions">
          {pending.length > 0 && (
            <Button color="secondary" outline size="sm" onClick={() => setShowPending((v) => !v)}>
              {showPending ? "Ocultar" : "Ver"} conteos sin fecha ({pending.length})
            </Button>
          )}
          {canGenerate && !weekEndPast && (
            <Button color="primary" size="sm" disabled={busy} onClick={generate}>
              {busy ? <Spinner size="sm" /> : "Llenar la semana"}
            </Button>
          )}
          <Button color="secondary" outline size="sm" onClick={exportExcel}>
            Descargar Excel
          </Button>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="kcc-alert kcc-alert-warn" role="alert">
          <ul>
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {showPending && (
        <div className="kcc-pending">
          <strong>Conteos hechos que todavía no tienen fecha de liquidación</strong>
          <ul>
            {pending.map((p) => (
              <li key={`${p.locationId}-${p.periodTo}`}>
                <span>{p.locationName}</span>
                <span className="kcc-muted">
                  contado el {formatDmy(p.periodTo)} · hace {Math.max(0, Math.round((new Date(today) - new Date(key(p.periodTo))) / 86400000))} días
                </span>
              </li>
            ))}
          </ul>
          <small className="kcc-muted">
            «Llenar la semana» los va poniendo del más viejo al más reciente, uno por día, y deja pasar 14 días antes de
            liquidar un conteo.
          </small>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.supervisorUserId} className="kcc-liqgroup">
          <h6>
            {group.supervisorName}
            <small>{group.rows.length} kioscos</small>
          </h6>
          {group.rows.length === 0 ? (
            <p className="kcc-muted kcc-liq-empty">Sin liquidaciones esta semana.</p>
          ) : (
            <div className="kcc-list">
              <table>
                <thead>
                  <tr>
                    <th>No.</th>
                    <th>Kiosco</th>
                    <th>Período del inventario</th>
                    <th>Contabilidad</th>
                    <th>Entrega de correcciones</th>
                    <th>Fecha de liquidación</th>
                    <th>Facturas verdes</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, i) => (
                    <tr key={row.id} onClick={() => setEditing(row)} className={row.status === "LIQUIDATED" ? "is-done" : ""}>
                      <td>{i + 1}</td>
                      <td>
                        <strong className="kcc-plain">{row.locationName}</strong>
                        {row.source === "GENERATED" && <span className="kcc-revisit-tag"> Generada</span>}
                      </td>
                      <td className="kcc-nowrap">
                        {row.periodFrom ? `${formatShort(row.periodFrom)} – ` : "hasta "}
                        {formatShort(row.periodTo)}
                      </td>
                      <td>{row.accountant || <span className="kcc-muted">Sin asignar</span>}</td>
                      <td className="kcc-nowrap">{row.correctionsDue ? formatShort(row.correctionsDue) : "—"}</td>
                      <td className="kcc-nowrap">
                        <strong className="kcc-cap">{formatLong(row.liquidationDate)}</strong>
                        {row.liquidationDays > 1 && <small> · {row.liquidationDays} días</small>}
                      </td>
                      <td>
                        <GreenCell row={row} />
                      </td>
                      <td>
                        <span className={`kcc-status ${row.status === "LIQUIDATED" ? "ok" : ""}`}>
                          {row.status === "LIQUIDATED" ? "Liquidada" : "Pendiente"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      {editing && (
        <LiquidationModal
          row={editing}
          accountants={data.accountants || []}
          canEdit={canGenerate}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            setBusy(true);
            try {
              setData(await updateLiquidation(editing.id, { ...changes, viewWeek: weekStart }));
              setEditing(null);
              showSuccess("Liquidación actualizada.");
            } catch (error) {
              showError(error.message);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}

function LiquidationModal({ row, accountants, canEdit, busy, onClose, onSave }) {
  const [status, setStatus] = useState(row.status);
  const [areas, setAreas] = useState(row.areasToFix == null ? "" : String(row.areasToFix));
  const [accountant, setAccountant] = useState(row.accountant || "");
  const [corrections, setCorrections] = useState(row.correctionsDue ? key(row.correctionsDue) : "");
  const [date, setDate] = useState(key(row.liquidationDate));
  const [days, setDays] = useState(String(row.liquidationDays));
  const [note, setNote] = useState(row.note || "");

  const save = () => {
    const changes = {};
    if (status !== row.status) changes.status = status;
    const original = row.areasToFix == null ? "" : String(row.areasToFix);
    if (areas !== original) {
      if (areas === "") changes.clearAreas = true;
      else changes.areasToFix = Number(areas);
    }
    if (accountant !== (row.accountant || "")) changes.accountant = accountant;
    if (corrections && corrections !== (row.correctionsDue ? key(row.correctionsDue) : "")) changes.correctionsDue = corrections;
    if (date !== key(row.liquidationDate)) changes.liquidationDate = date;
    if (Number(days) !== row.liquidationDays) changes.liquidationDays = Number(days);
    if (note !== (row.note || "")) changes.note = note;
    onSave(changes);
  };

  return (
    <Modal isOpen toggle={onClose} centered className="kcc-modal">
      <ModalHeader toggle={onClose}>
        <div className="kcc-modal-title">{row.locationName}</div>
        <small className="kcc-muted">
          Inventario {row.periodFrom ? `${formatShort(row.periodFrom)} – ` : "hasta "}
          {formatShort(row.periodTo)} · {row.supervisorName}
        </small>
      </ModalHeader>
      <ModalBody>
        <div className="kcc-field">
          Estado
          <div className="kcc-seg full" role="group" aria-label="Estado de la liquidación">
            <button type="button" className={status === "PENDING" ? "on" : ""} disabled={!canEdit} onClick={() => setStatus("PENDING")}>
              Pendiente
            </button>
            <button type="button" className={status === "LIQUIDATED" ? "on" : ""} disabled={!canEdit} onClick={() => setStatus("LIQUIDATED")}>
              Liquidada
            </button>
          </div>
        </div>
        <label className="kcc-field">
          Facturas verdes: áreas por corregir
          <Input type="number" min="0" max="99" value={areas} disabled={!canEdit} onChange={(e) => setAreas(e.target.value)} placeholder="Vacío = sin revisar" />
          <small>0 si no hay nada que corregir. {row.greenNote ? `En el Excel decía: «${row.greenNote}».` : ""}</small>
        </label>
        <label className="kcc-field">
          Contabilidad
          <Input type="text" list="kcc-accountants" value={accountant} disabled={!canEdit} onChange={(e) => setAccountant(e.target.value)} placeholder="Quién revisa" />
          <datalist id="kcc-accountants">
            {accountants.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </label>
        <div className="kcc-two">
          <label className="kcc-field">
            Entrega de correcciones
            <Input type="date" value={corrections} disabled={!canEdit} onChange={(e) => setCorrections(e.target.value)} />
          </label>
          <label className="kcc-field">
            Fecha de liquidación
            <Input type="date" value={date} disabled={!canEdit} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="kcc-field">
          Días de liquidación
          <Input type="select" value={days} disabled={!canEdit} onChange={(e) => setDays(e.target.value)}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "día" : "días"}
              </option>
            ))}
          </Input>
          <small>Entrecueros y Celajes llevan 2 días.</small>
        </label>
        <label className="kcc-field">
          Nota
          <Input type="textarea" rows={2} maxLength={500} value={note} disabled={!canEdit} onChange={(e) => setNote(e.target.value)} placeholder="Depósitos, cambios, diferencias…" />
        </label>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          Cerrar
        </Button>
        {canEdit && (
          <Button color="primary" disabled={busy} onClick={save}>
            {busy ? <Spinner size="sm" /> : "Guardar"}
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
