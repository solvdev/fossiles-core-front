import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Spinner } from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import SideDrawer from "components/SideDrawer/SideDrawer";
import { useAuth } from "contexts/AuthContext";
import {
  cancelEmployeeCharge,
  createEmployeeCharge,
  decideEmployeeCharge,
  getEmployeeCharges,
  getPayrollProfiles,
  markEmployeeChargePaid,
} from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatAmount } from "utils/payrollPrintHtml";
import TablePagination, { usePagination } from "components/TablePagination/TablePagination";
import PayrollShell from "./PayrollShell";
import { Avatar, amountOrDash, fmtShort, q } from "./payrollUi";

const SETTLEMENT_LABELS = { DESCUENTO: "Descuento en planilla", TRANSFERENCIA: "Transferencia", EFECTIVO: "Efectivo" };
const SETTLEMENT_SHORT = { DESCUENTO: "Descuento", TRANSFERENCIA: "Transferencia", EFECTIVO: "Efectivo" };
const STATUS_LABELS = { PENDIENTE: "Pendiente", PARCIAL: "Parcial", PAGADO: "Pagado", ANULADO: "Anulado" };
const FILTERS = [["DECIDIR", "Por decidir"], ["ABIERTOS", "Abiertos"], ["PAGADO", "Pagados"], ["ANULADO", "Anulados"], ["TODOS", "Todos"]];

const CONCEPTS = [
  ["DESCUADRE_INVENTARIO", "Descuadre de inventario"],
  ["FALTANTE_CAJA", "Faltante de caja"],
  ["DANO", "Daño de producto o equipo"],
  ["OTRO", "Otro"],
];
const CONCEPT_LABELS = Object.fromEntries(CONCEPTS);

const todayIso = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const emptyForm = () => ({
  employeeId: "", employeeSearch: "", concept: "DESCUADRE_INVENTARIO", amount: "", reason: "", reference: "",
  chargedOn: todayIso(), inInstallments: false, installmentAmount: "", authorized: false, authorizationNote: "",
});

const isOpen = (charge) => charge.status === "PENDIENTE" || charge.status === "PARCIAL";
const awaitsDecision = (charge) => isOpen(charge) && !charge.settlementMethod;
const isReserved = (charge) => Number(charge.reservedInDrafts) > 0;
/** Se puede decidir en lote: abierto, sin decisión y sin saldo ya metido en un borrador. */
const isBulkable = (charge) => awaitsDecision(charge) && !isReserved(charge);

/**
 * Planta se descuenta en planilla: si su cargo aún no tiene decisión (venía de otro grupo) solo puede quedar en
 * descuento. Quien ya salió (baja o inactivo) puede saldar lo pendiente por transferencia o en efectivo.
 */
const settlementOptions = (charge) =>
  charge.payGroup === "PLANTA" && charge.employeeActive !== false ? ["DESCUENTO"] : Object.keys(SETTLEMENT_LABELS);

/**
 * Compras de colaborador con 50 %. Planta se descuenta completo en planilla; en administración
 * Contabilidad decide si se descuenta, se transfiere o se paga en efectivo.
 */
function EmployeeCharges() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("PLANILLA.CARGOS.EDITAR");
  const [filter, setFilter] = useState("DECIDIR");
  const [search, setSearch] = useState("");
  const [charges, setCharges] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [selection, setSelection] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [firstLoad, setFirstLoad] = useState(true);
  const canCreate = hasPermission("PLANILLA.CARGOS.CREAR");
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [profiles, setProfiles] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCharges((await getEmployeeCharges({})) || []);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Si no hay nada por decidir, se abre en los cargos abiertos para no mostrar una lista vacía.
  useEffect(() => {
    if (loading || !firstLoad) return;
    setFirstLoad(false);
    if (charges.length > 0 && !charges.some(awaitsDecision)) setFilter("ABIERTOS");
  }, [loading, firstLoad, charges]);

  const act = async (charge, action, message) => {
    setBusyId(charge.id);
    try {
      await action();
      showSuccess(message);
      await load();
    } catch (error) {
      showError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const openForm = async () => {
    setForm(emptyForm());
    setErrors({});
    if (profiles === null) {
      try {
        setProfiles(((await getPayrollProfiles()) || []).filter((p) => p.status === "active"));
      } catch (error) {
        setProfiles([]);
        showError(error.message);
      }
    }
  };
  const closeForm = () => {
    if (!saving) setForm(null);
  };
  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const matchingProfiles = useMemo(() => {
    const term = form ? form.employeeSearch.trim().toLowerCase() : "";
    return (profiles || []).filter((p) => !term || p.fullName.toLowerCase().includes(term));
  }, [profiles, form]);

  const submitCharge = async () => {
    const found = {};
    const amount = Number(form.amount);
    if (!form.employeeId) found.employeeId = "Elija al colaborador.";
    if (!(amount > 0)) found.amount = "Indique un monto mayor que cero.";
    if (!form.reason.trim()) found.reason = "Escriba qué pasó y cómo se calculó el monto.";
    if (form.chargedOn > todayIso()) found.chargedOn = "La fecha no puede ser futura.";
    if (form.inInstallments) {
      const installment = Number(form.installmentAmount);
      if (!(installment > 0)) found.installmentAmount = "Indique la cuota por quincena.";
      else if (amount > 0 && installment > amount) found.installmentAmount = "La cuota no puede ser mayor que el monto.";
    }
    if (!form.authorized) found.authorized = "Confirme que el colaborador aceptó el cargo.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await createEmployeeCharge({
        employeeId: Number(form.employeeId),
        concept: form.concept,
        amount,
        reason: form.reason.trim(),
        reference: form.reference.trim() || null,
        chargedOn: form.chargedOn || null,
        employeeAuthorized: true,
        authorizationNote: form.authorizationNote.trim() || null,
        installmentAmount: form.inInstallments ? Number(form.installmentAmount) : null,
      });
      showSuccess("Cargo registrado.");
      setForm(null);
      setFilter("ABIERTOS");
      setSelection(new Set());
      await load();
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  const open = useMemo(() => charges.filter(isOpen), [charges]);
  const toDecide = useMemo(() => charges.filter(awaitsDecision), [charges]);
  const counts = {
    DECIDIR: toDecide.length,
    ABIERTOS: open.length,
    PAGADO: charges.filter((c) => c.status === "PAGADO").length,
    ANULADO: charges.filter((c) => c.status === "ANULADO").length,
    TODOS: charges.length,
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return charges.filter((c) => {
      const matchesFilter = filter === "TODOS" || (filter === "DECIDIR" && awaitsDecision(c))
        || (filter === "ABIERTOS" && isOpen(c)) || c.status === filter;
      return matchesFilter && (!term || `${c.employeeName} ${c.description}`.toLowerCase().includes(term));
    });
  }, [charges, filter, search]);
  const pagination = usePagination(visible, 25);

  const bulkRows = visible.filter(isBulkable);
  const selectedIds = [...selection].filter((id) => charges.some((c) => c.id === id && isBulkable(c)));

  const changeFilter = (key) => {
    setFilter(key);
    setSelection(new Set());
  };
  const toggleOne = (id) =>
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = (checked) => setSelection(checked ? new Set(bulkRows.map((c) => c.id)) : new Set());

  /** Aplica una decisión a varios cargos; los de planta que no admiten esa forma se quedan como están. */
  const decideSelected = async (method) => {
    const chosen = charges.filter((c) => selectedIds.includes(c.id));
    const allowed = chosen.filter((c) => settlementOptions(c).includes(method));
    const skipped = chosen.length - allowed.length;
    setBulkBusy(true);
    try {
      const outcomes = await Promise.allSettled(allowed.map((c) => decideEmployeeCharge(c.id, method)));
      const failed = outcomes.filter((o) => o.status === "rejected");
      const done = outcomes.length - failed.length;
      if (done > 0) {
        showSuccess(`${done === 1 ? "1 cargo actualizado" : `${done} cargos actualizados`}${skipped ? `. ${skipped} de planta se quedan en descuento.` : "."}`);
      }
      if (failed.length > 0) showError(failed[0].reason && failed[0].reason.message ? failed[0].reason.message : "No se pudo guardar una decisión.");
      if (done === 0 && failed.length === 0 && skipped > 0) showError("Los cargos de planta solo pueden quedar en descuento en planilla.");
      setSelection(new Set());
      await load();
    } finally {
      setBulkBusy(false);
    }
  };

  const reservedTotal = open.reduce((total, c) => total + (Number(c.reservedInDrafts) || 0), 0);
  const allBulkChecked = bulkRows.length > 0 && bulkRows.every((c) => selection.has(c.id));

  return (
    <PayrollShell active="charges" chargesToDecide={toDecide.length}>
      <section className="pl-card pl-summary" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }} aria-label="Resumen de cargos">
        <div>
          <div className="pl-lbl">Esperan decisión</div>
          <div className="pl-big pl-num">{toDecide.length}</div>
          <div className="pl-sub pl-num">{q(toDecide.reduce((total, c) => total + (Number(c.balance) || 0), 0))} sin definir cómo se cobra</div>
        </div>
        <div>
          <div className="pl-lbl">Saldo abierto</div>
          <div className="pl-big pl-num">{q(open.reduce((total, c) => total + (Number(c.balance) || 0), 0))}</div>
          <div className="pl-sub">{open.length === 1 ? "1 cargo" : `${open.length} cargos`} de {new Set(open.map((c) => c.employeeId || c.employeeName)).size} personas</div>
        </div>
        <div>
          <div className="pl-lbl">Ya en una planilla</div>
          <div className="pl-big pl-num">{q(reservedTotal)}</div>
          <div className="pl-sub">Reservado en borradores, se rebaja al aprobar</div>
        </div>
      </section>

      <section className="pl-card">
        <div className="pl-tools">
          <div className="pl-chips" role="group" aria-label="Filtrar cargos">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" className="pl-chip" aria-pressed={filter === key} onClick={() => changeFilter(key)}>
                {label} <em>{counts[key]}</em>
              </button>
            ))}
          </div>
          <span className="pl-spacer" />
          <div className="pl-search">
            <i className="nc-icon nc-zoom-split" aria-hidden="true" />
            <Input bsSize="sm" placeholder="Buscar colaborador o descripción" aria-label="Buscar cargo" value={search}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          {canCreate && (
            <Button size="sm" color="primary" className="m-0" onClick={openForm}>Nuevo cargo</Button>
          )}
        </div>

        {loading ? (
          <div className="px-4 pb-4"><Spinner size="sm" /></div>
        ) : (
          <>
            <div className="pl-scroll">
              <table className="pl-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      {canEdit && bulkRows.length > 0 && (
                        <input type="checkbox" aria-label="Seleccionar todos los que esperan decisión" checked={allBulkChecked}
                          onChange={(e) => toggleAll(e.target.checked)} />
                      )}
                    </th>
                    <th>Fecha</th>
                    <th>Colaborador</th>
                    <th>Descripción</th>
                    <th className="r">Monto</th>
                    <th className="r">Saldo</th>
                    <th>Cómo se cobra</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan="9" className="pl-empty">
                        {filter === "DECIDIR" ? "Nada espera decisión. Todo está al día." : "No hay cargos con ese filtro."}
                      </td>
                    </tr>
                  )}
                  {pagination.pageItems.map((charge) => {
                    const plant = charge.payGroup === "PLANTA";
                    const left = charge.employeeActive === false;
                    const reserved = isReserved(charge);
                    const options = settlementOptions(charge);
                    const editable = canEdit && isOpen(charge) && !reserved
                      && (options.length > 1 || !charge.settlementMethod);
                    const draft = drafts[charge.id] ?? charge.settlementMethod ?? "";
                    const untouched = Number(charge.balance) === Number(charge.amount) && !reserved;
                    return (
                      <tr key={charge.id}>
                        <td>
                          {canEdit && isBulkable(charge) && (
                            <input type="checkbox" aria-label={`Seleccionar cargo de ${charge.employeeName}`}
                              checked={selection.has(charge.id)} onChange={() => toggleOne(charge.id)} />
                          )}
                        </td>
                        <td className="pl-num">{fmtShort(charge.chargedOn)}</td>
                        <td>
                          <div className="pl-who">
                            <Avatar name={charge.employeeName} />
                            <div>
                              <b>{charge.employeeName}</b>
                              <small>{plant ? "Planta" : "Administración"}{left && " · de baja"}</small>
                            </div>
                          </div>
                        </td>
                        <td style={{ minWidth: 180 }}>
                          {charge.description}
                          {charge.sourceType === "MANUAL" && (
                            <div className="pl-sub" style={{ fontSize: 12 }}>
                              <span className="pl-tag pl-tag--info">{CONCEPT_LABELS[charge.concept] || "Manual"}</span>
                              {charge.reference && <span>{charge.reference}</span>}
                              {charge.installmentAmount != null && <span> · cuota {q(charge.installmentAmount)} por quincena</span>}
                            </div>
                          )}
                        </td>
                        <td className="r pl-num">{formatAmount(charge.amount)}</td>
                        <td className="r pl-num">
                          <b>{amountOrDash(charge.balance)}</b>
                          {reserved && <div className="pl-sub" style={{ fontSize: 12 }}>{formatAmount(charge.reservedInDrafts)} en borrador</div>}
                        </td>
                        <td>
                          {editable ? (
                            <div className="pl-decide">
                              <div className="pl-seg" role="radiogroup" aria-label={`Cómo se cobra a ${charge.employeeName}`}>
                                {Object.keys(SETTLEMENT_LABELS).map((value) => (
                                  <button key={value} type="button" role="radio" aria-checked={draft === value}
                                    aria-label={SETTLEMENT_LABELS[value]}
                                    disabled={!options.includes(value)} title={options.includes(value) ? undefined : "Planta se descuenta en planilla"}
                                    onClick={() => setDrafts({ ...drafts, [charge.id]: value })}>
                                    {SETTLEMENT_SHORT[value]}
                                  </button>
                                ))}
                              </div>
                              {draft && draft !== charge.settlementMethod && (
                                <Button size="sm" color="primary" className="m-0" disabled={busyId === charge.id}
                                  onClick={() => act(charge, () => decideEmployeeCharge(charge.id, draft), "Decisión guardada.")}>
                                  Guardar
                                </Button>
                              )}
                            </div>
                          ) : (
                            SETTLEMENT_LABELS[charge.settlementMethod] || <span className="pl-tag">Sin decidir</span>
                          )}
                        </td>
                        <td><span className={`pl-pill pl-pill--${charge.status.toLowerCase()}`}>{STATUS_LABELS[charge.status] || charge.status}</span></td>
                        <td className="r text-nowrap">
                          {canEdit && isOpen(charge) && (charge.settlementMethod === "TRANSFERENCIA" || charge.settlementMethod === "EFECTIVO") && (
                            <Button size="sm" color="success" className="m-0 mr-1" disabled={busyId === charge.id}
                              onClick={() => setConfirm({
                                title: "Marcar como pagado",
                                message: `El colaborador pagó ${formatAmount(charge.balance)} por ${SETTLEMENT_LABELS[charge.settlementMethod].toLowerCase()}.`,
                                confirmText: "Marcar pagado",
                                confirmColor: "success",
                                action: () => act(charge, () => markEmployeeChargePaid(charge.id), "Cargo saldado."),
                              })}>
                              Pagado
                            </Button>
                          )}
                          {canEdit && isOpen(charge) && untouched && (
                            <Button size="sm" color="danger" outline className="m-0" disabled={busyId === charge.id}
                              onClick={() => setConfirm({
                                title: "Anular cargo",
                                message: "Solo para cargos registrados por error. No se puede deshacer.",
                                confirmText: "Anular",
                                confirmColor: "danger",
                                action: () => act(charge, () => cancelEmployeeCharge(charge.id), "Cargo anulado."),
                              })}>
                              Anular
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-3 pb-2"><TablePagination pagination={pagination} /></div>
          </>
        )}

        {selectedIds.length > 0 && (
          <div className="pl-bulk" role="region" aria-label="Acciones en lote">
            <b>{selectedIds.length === 1 ? "1 seleccionado" : `${selectedIds.length} seleccionados`}</b>
            <span className="pl-spacer" />
            <span>Decidir:</span>
            {Object.keys(SETTLEMENT_LABELS).map((value) => (
              <Button key={value} size="sm" color="neutral" disabled={bulkBusy} onClick={() => decideSelected(value)}>
                {SETTLEMENT_LABELS[value]}
              </Button>
            ))}
            <Button size="sm" color="link" className="text-white" disabled={bulkBusy} onClick={() => setSelection(new Set())}>
              Quitar selección
            </Button>
          </div>
        )}
      </section>

      <p className="pl-sub">
        Compras de colaborador al 50 %. Planta se descuenta en planilla. En administración Contabilidad decide cómo se
        cobra. Quien ya salió puede saldar lo pendiente por transferencia o en efectivo. Los kioscos no tienen compras.
      </p>

      <SideDrawer
        isOpen={Boolean(form)}
        onClose={closeForm}
        title="Nuevo cargo a un colaborador"
        subtitle="Descuadres, faltantes de caja, daños u otros cobros."
        footer={(
          <>
            <Button color="secondary" outline disabled={saving} onClick={closeForm}>Cancelar</Button>
            <Button color="primary" disabled={saving} onClick={submitCharge}>{saving ? "Registrando…" : "Registrar cargo"}</Button>
          </>
        )}
      >
        {form && (
          <>
            <div className="pl-field">
              <label htmlFor="cargo-colaborador">Colaborador</label>
              <Input id="cargo-buscar" aria-label="Buscar colaborador" bsSize="sm" placeholder="Buscar por nombre" value={form.employeeSearch}
                onChange={(e) => setField("employeeSearch", e.target.value)} />
              <Input id="cargo-colaborador" type="select" invalid={Boolean(errors.employeeId)} value={form.employeeId}
                onChange={(e) => setField("employeeId", e.target.value)}>
                <option value="">{profiles === null ? "Cargando…" : "Elija al colaborador"}</option>
                {matchingProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} · {p.payGroup === "PLANTA" ? "Planta" : "Administración"}
                  </option>
                ))}
              </Input>
              {errors.employeeId && <span className="pl-err">{errors.employeeId}</span>}
            </div>
            <div className="pl-field">
              <span className="pl-fl">Concepto</span>
              <div className="pl-seg" role="radiogroup" aria-label="Concepto">
                {CONCEPTS.map(([value, label]) => (
                  <button key={value} type="button" role="radio" aria-checked={form.concept === value}
                    onClick={() => setField("concept", value)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="pl-two">
              <div className="pl-field">
                <label htmlFor="cargo-monto">Monto (Q)</label>
                <Input id="cargo-monto" type="number" min="0" step="0.01" className="pl-num" value={form.amount}
                  invalid={Boolean(errors.amount)} onChange={(e) => setField("amount", e.target.value)} />
                {errors.amount && <span className="pl-err">{errors.amount}</span>}
              </div>
              <div className="pl-field">
                <label htmlFor="cargo-fecha">Fecha del cargo</label>
                <Input id="cargo-fecha" type="date" max={todayIso()} value={form.chargedOn}
                  invalid={Boolean(errors.chargedOn)} onChange={(e) => setField("chargedOn", e.target.value)} />
                {errors.chargedOn && <span className="pl-err">{errors.chargedOn}</span>}
              </div>
            </div>
            <div className="pl-field">
              <label htmlFor="cargo-motivo">Motivo</label>
              <Input id="cargo-motivo" type="textarea" rows={3} maxLength={500} value={form.reason}
                placeholder="Qué pasó y cómo se calculó el monto" invalid={Boolean(errors.reason)}
                onChange={(e) => setField("reason", e.target.value)} />
              {errors.reason && <span className="pl-err">{errors.reason}</span>}
            </div>
            <div className="pl-field">
              <label htmlFor="cargo-referencia">Referencia</label>
              <Input id="cargo-referencia" maxLength={100} value={form.reference} placeholder="Kiosco, conteo o documento"
                onChange={(e) => setField("reference", e.target.value)} />
            </div>
            <div className="pl-field">
              <label className="pl-row" style={{ gap: 8, fontWeight: 600 }}>
                <input type="checkbox" checked={form.inInstallments} onChange={(e) => setField("inInstallments", e.target.checked)} />
                Cobrar en cuotas
              </label>
              {form.inInstallments && (
                <>
                  <Input id="cargo-cuota" aria-label="Cuota por quincena" type="number" min="0" step="0.01" className="pl-num"
                    placeholder="Cuota por quincena (Q)" value={form.installmentAmount} invalid={Boolean(errors.installmentAmount)}
                    onChange={(e) => setField("installmentAmount", e.target.value)} />
                  {errors.installmentAmount && <span className="pl-err">{errors.installmentAmount}</span>}
                  {Number(form.amount) > 0 && Number(form.installmentAmount) > 0 && Number(form.installmentAmount) <= Number(form.amount) && (
                    <small>Se descuenta en {Math.ceil(Number(form.amount) / Number(form.installmentAmount))} quincenas, como máximo la cuota en cada planilla.</small>
                  )}
                </>
              )}
            </div>
            <div className="pl-field">
              <label className="pl-row" style={{ gap: 8, fontWeight: 600, alignItems: "flex-start" }}>
                <input type="checkbox" checked={form.authorized} onChange={(e) => setField("authorized", e.target.checked)} style={{ marginTop: 3 }} />
                <span>El colaborador aceptó este cargo</span>
              </label>
              {errors.authorized && <span className="pl-err">{errors.authorized}</span>}
              <Input id="cargo-constancia" aria-label="Dónde está la constancia" maxLength={200} value={form.authorizationNote}
                placeholder="Dónde está la constancia (carta firmada, quién la guarda)"
                onChange={(e) => setField("authorizationNote", e.target.value)} />
              <small>Sin la aceptación del colaborador no se registra. Planta se descuenta en planilla; en administración Contabilidad decide después cómo se cobra.</small>
            </div>
          </>
        )}
      </SideDrawer>

      <ConfirmModal
        isOpen={Boolean(confirm)}
        toggle={() => setConfirm(null)}
        title={confirm?.title}
        message={confirm?.message}
        confirmText={confirm?.confirmText}
        confirmColor={confirm?.confirmColor}
        onConfirm={async () => {
          await confirm.action();
          setConfirm(null);
        }}
      />
    </PayrollShell>
  );
}

export default EmployeeCharges;
