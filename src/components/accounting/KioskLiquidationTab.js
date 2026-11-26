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
  fixLiquidationManually,
  generateLiquidationWeek,
  getLiquidationWeek,
  getLiquidationYear,
  updateLiquidation,
} from "services/kioskCountCalendarService";
import { addDays, formatDmy, key, weekdayShort, weekRange } from "utils/kioskCountDateHelper";
import { downloadLiquidationExcel } from "utils/kioskLiquidationExport";
import { countLink, countState } from "utils/kioskLiquidationState";
import { showError, showSuccess } from "utils/notificationHelper";

const SOURCE_LABEL = { SISTEMA: "Conteo del sistema", CALENDARIO: "Visita hecha", MANUAL: "Manual" };

/** Fecha numérica de ancho fijo («lun 16/11/2026»): las fechas escritas con letras cambiaban de lugar. */
function DateCell({ value }) {
  if (!value) return <span className="kcc-muted">—</span>;
  return (
    <span className="kcc-dt">
      <span className="kcc-wd">{weekdayShort(value)}</span>
      {formatDmy(value)}
    </span>
  );
}

function GreenCell({ row }) {
  if (row.areasToFix == null) return <span className="kcc-muted">{row.greenNote || "Sin revisar"}</span>;
  if (row.areasToFix === 0) return <span className="kcc-pill ok">Sin áreas por corregir</span>;
  return (
    <span className="kcc-pill warn">
      {row.areasToFix} {row.areasToFix === 1 ? "área" : "áreas"} por corregir
    </span>
  );
}

function AccountantCell({ row }) {
  let assigned = <span className="kcc-muted">Sin asignar</span>;
  if (row.accountants?.length) assigned = <>{row.accountants.map((a) => a.name).join(" y ")}</>;
  else if (row.accountant) {
    assigned = (
      <span className="kcc-acct-miss" title="Ese nombre del Excel no tiene un usuario de contabilidad">
        {row.accountant} · sin usuario
      </span>
    );
  }
  return (
    <>
      {assigned}
      {(row.reviewedBy || row.closedBy) && (
        <small className="kcc-sub" title="Datos del conteo físico">
          {row.reviewedBy && `Revisó ${row.reviewedBy}`}
          {row.reviewedBy && row.closedBy && row.reviewedBy !== row.closedBy ? " · " : ""}
          {row.closedBy && row.closedBy !== row.reviewedBy && `Cerró ${row.closedBy}`}
        </small>
      )}
    </>
  );
}

/** Estado que viene del conteo físico, con enlace para abrirlo. */
function StateCell({ row }) {
  const state = countState(row);
  const link = countLink(row);
  return (
    <>
      <span className={`kcc-status kcc-st-${state.tone}`} title={state.hint}>
        {state.label}
      </span>
      {row.closedAt && <small className="kcc-sub">{formatDmy(row.closedAt)}</small>}
      {link && (
        <a className="kcc-sub kcc-link-a" href={link} onClick={(e) => e.stopPropagation()}>
          Abrir conteo
        </a>
      )}
    </>
  );
}

/**
 * Liquidación semanal: la revisión de contabilidad de cada conteo (si salió bien el conteo, depósitos, cambios,
 * facturas verdes), unas 4 semanas después de la visita. Un kiosco por día, como en el Excel de contabilidad.
 */
export default function KioskLiquidationTab({ weekStart, supervisorId, today, refreshKey, kiosks }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showPending, setShowPending] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [fixing, setFixing] = useState(null);
  const [fixDate, setFixDate] = useState("");
  const [registering, setRegistering] = useState(false);

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

  /** Fija a mano la fecha de liquidación de un conteo; el sistema manda si ya tiene ese conteo. */
  const fix = async (payload) => {
    setBusy(true);
    try {
      const result = await fixLiquidationManually({ ...payload, viewWeek: weekStart });
      setData(result.week);
      setWarnings(result.warnings || []);
      setFixing(null);
      setFixDate("");
      setRegistering(false);
      showSuccess("Guardado.");
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  };

  /** Mismo formato del libro de contabilidad: el año completo o solo la semana que se está viendo. */
  const exportExcel = async (scope) => {
    const year = Number(weekStart.slice(0, 4));
    try {
      if (scope === "week") {
        downloadLiquidationExcel({ year, groups, fileSuffix: `semana-${weekStart}` });
        return;
      }
      const result = await getLiquidationYear(year);
      downloadLiquidationExcel({
        year,
        groups: result.groups.filter((g) => !supervisorId || g.supervisorUserId === supervisorId),
        nonWorkingDays: result.nonWorkingDays,
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
            verdes. Al día siguiente del conteo mandan el reporte y contabilidad empieza a revisar; queda liquidada cuando
            cierra el conteo físico. Un kiosco por día.
          </span>
        </div>
        <div className="kcc-weekstate-actions">
          {pending.length > 0 && (
            <Button color="secondary" outline size="sm" onClick={() => setShowPending((v) => !v)}>
              {showPending ? "Ocultar" : "Ver"} conteos sin fecha ({pending.length})
            </Button>
          )}
          {canGenerate && (
            <Button color="secondary" outline size="sm" onClick={() => setRegistering(true)}>
              Registrar conteo hecho
            </Button>
          )}
          {canGenerate && !weekEndPast && (
            <Button color="primary" size="sm" disabled={busy} onClick={generate}>
              {busy ? <Spinner size="sm" /> : "Llenar la semana"}
            </Button>
          )}
          <UncontrolledDropdown>
            <DropdownToggle caret color="secondary" outline size="sm">
              Descargar Excel
            </DropdownToggle>
            <DropdownMenu end>
              <DropdownItem onClick={() => exportExcel("year")}>Todo {weekStart.slice(0, 4)}</DropdownItem>
              <DropdownItem onClick={() => exportExcel("week")}>Solo esta semana</DropdownItem>
            </DropdownMenu>
          </UncontrolledDropdown>
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
          <ul className="kcc-pending-list">
            {pending.map((p) => {
              const id = `${p.locationId}-${p.periodTo}`;
              const days = Math.max(0, Math.round((new Date(today) - new Date(key(p.periodTo))) / 86400000));
              return (
                <li key={id}>
                  <span className="kcc-pend-main">
                    <strong className="kcc-plain">{p.locationName}</strong>
                    <span className={`kcc-src ${String(p.source).toLowerCase()}`} title="De dónde sale este conteo">
                      {SOURCE_LABEL[p.source] || p.source}
                    </span>
                  </span>
                  <span className="kcc-pend-act">
                    <DateCell value={p.periodTo} />
                    <span className="kcc-muted">hace {days} días</span>
                    {canGenerate &&
                      (fixing === id ? (
                        <>
                          <Input
                            type="date"
                            value={fixDate}
                            min={key(p.periodTo)}
                            aria-label={`Fecha de liquidación de ${p.locationName}`}
                            onChange={(e) => setFixDate(e.target.value)}
                          />
                          <Button
                            color="primary"
                            size="sm"
                            disabled={!fixDate || busy}
                            onClick={() => fix({ locationId: p.locationId, countDate: key(p.periodTo), liquidationDate: fixDate })}
                          >
                            Guardar
                          </Button>
                          <button type="button" className="kcc-link" onClick={() => setFixing(null)}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="kcc-link"
                          onClick={() => {
                            setFixing(id);
                            setFixDate("");
                          }}
                        >
                          Fijar fecha
                        </button>
                      ))}
                  </span>
                </li>
              );
            })}
          </ul>
          <small className="kcc-muted">
            Nacen de las visitas hechas del calendario. «Llenar la semana» los va poniendo del más viejo al más
            reciente, uno por día, desde el día siguiente al conteo. Con «Fijar fecha» eliges tú el día. Si el sistema ya
            tiene el conteo, manda su fecha.
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
                    <th>Conteo</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, i) => (
                    <tr key={row.id} onClick={() => setEditing(row)} className={row.status === "LIQUIDATED" ? "is-done" : ""}>
                      <td>{i + 1}</td>
                      <td>
                        <strong className="kcc-plain">{row.locationName}</strong>
                        {row.source !== "IMPORT" && (
                          <span className="kcc-revisit-tag"> {row.source === "MANUAL" ? "Manual" : "Generada"}</span>
                        )}
                      </td>
                      <td className="kcc-datecell">
                        {row.periodFrom ? `${formatDmy(row.periodFrom)} – ` : "hasta "}
                        {formatDmy(row.periodTo)}
                      </td>
                      <td>
                        <AccountantCell row={row} />
                      </td>
                      <td className="kcc-datecell">{row.correctionsDue ? formatDmy(row.correctionsDue) : "—"}</td>
                      <td className="kcc-datecell">
                        <DateCell value={row.liquidationDate} />
                        {row.liquidationDays > 1 && <small>{row.liquidationDays} días seguidos</small>}
                      </td>
                      <td>
                        <GreenCell row={row} />
                      </td>
                      <td>
                        <StateCell row={row} />
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
          reviewers={data.accountants || []}
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

      {registering && (
        <RegisterCountModal
          kiosks={(kiosks || []).filter((k) => !supervisorId || k.supervisorUserId === supervisorId)}
          reviewers={data.accountants || []}
          today={today}
          busy={busy}
          onClose={() => setRegistering(false)}
          onSave={fix}
        />
      )}
    </>
  );
}

function ReviewerChecks({ reviewers, ids, disabled, onChange }) {
  return (
    <div className="kcc-checks" role="group" aria-label="Contabilidad">
      {reviewers.map((p) => {
        const on = ids.includes(p.userId);
        return (
          <label key={p.userId} className={on ? "on" : ""}>
            <input
              type="checkbox"
              checked={on}
              disabled={disabled}
              onChange={(e) => onChange(e.target.checked ? [...ids, p.userId] : ids.filter((id) => id !== p.userId))}
            />
            {p.name}
          </label>
        );
      })}
      {!reviewers.length && <span className="kcc-muted">No hay usuarios con rol de contabilidad.</span>}
    </div>
  );
}

function LiquidationModal({ row, reviewers, canEdit, busy, onClose, onSave }) {
  const originalIds = useMemo(() => (row.accountants || []).map((a) => a.userId), [row]);
  const [status, setStatus] = useState(row.status);
  const [areas, setAreas] = useState(row.areasToFix == null ? "" : String(row.areasToFix));
  const [accountantIds, setAccountantIds] = useState(originalIds);
  const [corrections, setCorrections] = useState(row.correctionsDue ? key(row.correctionsDue) : "");
  const [date, setDate] = useState(key(row.liquidationDate));
  const [days, setDays] = useState(String(row.liquidationDays));
  const [note, setNote] = useState(row.note || "");

  const save = () => {
    const changes = {};
    if (!row.countId && status !== row.status) changes.status = status;
    const original = row.areasToFix == null ? "" : String(row.areasToFix);
    if (areas !== original) {
      if (areas === "") changes.clearAreas = true;
      else changes.areasToFix = Number(areas);
    }
    if ([...accountantIds].sort().join() !== [...originalIds].sort().join()) changes.accountantUserIds = accountantIds;
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
          Inventario {row.periodFrom ? `${formatDmy(row.periodFrom)} – ` : "hasta "}
          {formatDmy(row.periodTo)} · {row.supervisorName}
        </small>
      </ModalHeader>
      <ModalBody>
        {row.countId ? (
          <div className="kcc-countbox">
            <div>
              <strong>Conteo físico</strong>
              <span className={`kcc-status kcc-st-${countState(row).tone}`}>{countState(row).label}</span>
            </div>
            <small>
              {countState(row).hint} El estado lo define el conteo: la liquidación queda hecha cuando contabilidad lo cierra.
            </small>
            <dl>
              {row.reviewedBy && (
                <div>
                  <dt>Revisó</dt>
                  <dd>
                    {row.reviewedBy}
                    {row.reviewedAt ? ` · ${formatDmy(row.reviewedAt)}` : ""}
                  </dd>
                </div>
              )}
              {row.closedBy && (
                <div>
                  <dt>Cerró</dt>
                  <dd>
                    {row.closedBy}
                    {row.closedAt ? ` · ${formatDmy(row.closedAt)}` : ""}
                  </dd>
                </div>
              )}
              {row.countObservations && (
                <div>
                  <dt>Observaciones del conteo</dt>
                  <dd>{row.countObservations}</dd>
                </div>
              )}
            </dl>
            <a href={countLink(row)} className="kcc-link-a">
              Abrir conteo físico
            </a>
          </div>
        ) : (
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
            <small>Esta liquidación no tiene conteo físico en el sistema (viene del Excel anterior).</small>
          </div>
        )}
        <div className="kcc-field">
          Contabilidad asignada
          <ReviewerChecks reviewers={reviewers} ids={accountantIds} disabled={!canEdit} onChange={setAccountantIds} />
          {!originalIds.length && row.accountant && (
            <small className="kcc-acct-miss">
              En el Excel decía «{row.accountant}», pero no tiene un usuario de contabilidad: elige a quién corresponde.
            </small>
          )}
          <small>Quién le toca revisarla. Quién revisó y cerró de verdad sale del conteo.</small>
        </div>
        <label className="kcc-field">
          Facturas verdes: áreas por corregir
          <Input type="number" min="0" max="99" value={areas} disabled={!canEdit} onChange={(e) => setAreas(e.target.value)} placeholder="Vacío = sin revisar" />
          <small>0 si no hay nada que corregir. {row.greenNote ? `En el Excel decía: «${row.greenNote}».` : ""}</small>
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
          Nota de liquidación
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

/** Registra un conteo que ya se hizo y, si se quiere, fija su fecha de liquidación. El sistema manda sobre la fecha. */
function RegisterCountModal({ kiosks, reviewers, today, busy, onClose, onSave }) {
  const [locationId, setLocationId] = useState("");
  const [countDate, setCountDate] = useState("");
  const [liquidationDate, setLiquidationDate] = useState("");
  const [accountantIds, setAccountantIds] = useState([]);
  const [note, setNote] = useState("");
  return (
    <Modal isOpen toggle={onClose} centered className="kcc-modal">
      <ModalHeader toggle={onClose}>Registrar conteo hecho</ModalHeader>
      <ModalBody>
        <p className="kcc-muted">
          Para un conteo que no aparece en el sistema ni en el Excel. Si el sistema ya tiene el conteo de ese kiosco
          (en esa fecha o a pocos días), <strong>manda la fecha del sistema</strong>.
        </p>
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
        <div className="kcc-two">
          <label className="kcc-field">
            Fecha en que se hizo el conteo
            <Input type="date" value={countDate} max={today} onChange={(e) => setCountDate(e.target.value)} />
          </label>
          <label className="kcc-field">
            Fecha de liquidación (opcional)
            <Input type="date" value={liquidationDate} min={countDate || undefined} onChange={(e) => setLiquidationDate(e.target.value)} />
            <small>Vacía: queda esperando su turno.</small>
          </label>
        </div>
        <div className="kcc-field">
          Contabilidad (quién revisa)
          <ReviewerChecks reviewers={reviewers} ids={accountantIds} onChange={setAccountantIds} />
        </div>
        <label className="kcc-field">
          Nota
          <Input type="textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          Cancelar
        </Button>
        <Button
          color="primary"
          disabled={!locationId || !countDate || busy}
          onClick={() =>
            onSave({
              locationId: Number(locationId),
              countDate,
              liquidationDate: liquidationDate || null,
              accountantUserIds: accountantIds.length ? accountantIds : null,
              note,
            })
          }
        >
          {busy ? <Spinner size="sm" /> : "Guardar"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
