import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Spinner } from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { useAuth } from "contexts/AuthContext";
import {
  cancelEmployeeCharge,
  decideEmployeeCharge,
  getEmployeeCharges,
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
                        <td style={{ minWidth: 180 }}>{charge.description}</td>
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
