import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Nav,
  NavItem,
  NavLink,
  Spinner,
  TabContent,
  TabPane,
  Table,
} from "reactstrap";
import classnames from "classnames";
import * as XLSX from "xlsx-js-style";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import TablePagination, { usePagination } from "components/TablePagination/TablePagination";
import { useAuth } from "contexts/AuthContext";
import {
  annulPayrollRun,
  approvePayrollRun,
  assignPayrollCheques,
  changePayrollPayDate,
  createPayrollRun,
  getPayDays,
  getPayrollRun,
  getPayrollRuns,
  payPayrollRun,
  recalculatePayrollRun,
} from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";
import { scrollToElement } from "utils/scrollToElement";
import {
  buildPayrollChequesHtml,
  buildPayrollVouchersHtml,
  chequeLines,
  formatAmount,
  openPayrollPrintWindow,
} from "utils/payrollPrintHtml";
import PayrollParameters from "./PayrollParameters";
import PayrollProfiles from "./PayrollProfiles";

const GROUP_LABELS = {
  PLANTA: "Planta (5 y 20)",
  ADMINISTRACION: "Administración y kioscos (15 y fin de mes)",
};
const GROUP_SHORT = { PLANTA: "Planta", ADMINISTRACION: "Administración y kioscos" };
const STATUS_LABELS = { BORRADOR: "Borrador", APROBADA: "Aprobada", PAGADA: "Pagada", ANULADA: "Anulada" };
const STEPS = [["BORRADOR", "Borrador"], ["APROBADA", "Aprobada"], ["PAGADA", "Pagada"]];
const TABS = [["runs", "Planillas"], ["profiles", "Fichas"], ["parameters", "Parámetros"]];

// Avisos que se corrigen en Fichas (los demás solo informan).
const PROFILE_WARNINGS = [
  "Sin forma de pago",
  "Cobran por transferencia sin número de cuenta",
  "Activos del grupo sin salario",
  "De planilla con bonificación 0",
  "Sin departamento",
];
const GROUP_REVIEW_WARNINGS = ["No estaban en la planilla anterior", "Cambiaron de cuenta o de forma de pago"];

const fmtDate = (iso) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};
const q = (value) => `Q ${formatAmount(value)}`;
const sum = (lines, key) => lines.reduce((total, line) => total + (Number(line[key]) || 0), 0);
const people = (count) => (count === 1 ? "1 colaborador" : `${count} colaboradores`);

/** Fecha ISO tantos días antes, sin pasar por la zona horaria del navegador. */
const isoDaysBefore = (iso, days) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - days));
  return date.toISOString().slice(0, 10);
};

const todayIso = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

function StatusPill({ status }) {
  return (
    <span className={`fossiles-estado fossiles-estado--${String(status || "").toLowerCase()}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function exportRunToExcel(run) {
  const header = ["Colaborador", "Puesto", "Vinculación", "Forma de pago", "Cuenta", "Salario mensual", "Días",
    "Sueldo", "Bonificación", "IGSS laboral", "ISR", "Compras colaborador", "Otras deducciones", "Líquido",
    "IGSS patronal", "IRTRA", "INTECAP", "Cheque"];
  const keys = ["monthlySalary", "daysPaid", "baseSalary", "bonification", "igssEmployee", "isr", "opiDiscount",
    "otherDeductions", "netPay", "igssEmployer", "irtra", "intecap"];
  const rows = run.lines.map((line) => [line.employeeName, line.position || "", line.employmentType,
    line.paymentMethod || "", line.bankAccount || "", ...keys.map((key) => Number(line[key]) || 0), line.chequeNumber || ""]);
  const totals = ["TOTAL", "", "", "", "", ...keys.map((key) => (key === "monthlySalary" || key === "daysPaid" ? "" : sum(run.lines, key))), ""];
  const title = [`Planilla ${GROUP_LABELS[run.payGroup] || run.payGroup}, pago ${fmtDate(run.payDate)}, período ${fmtDate(run.periodStart)} al ${fmtDate(run.periodEnd)}, estado ${run.status}`];
  const sheet = XLSX.utils.aoa_to_sheet([title, [], header, ...rows, totals]);
  sheet["!cols"] = header.map((_, i) => ({ wch: i === 0 ? 34 : 14 }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Planilla");
  // Para cargar los pagos en la banca en línea.
  const transfers = run.lines.filter((line) => line.paymentMethod === "TRANSFERENCIA BANCARIA" && Number(line.netPay) > 0);
  if (transfers.length > 0) {
    const transferSheet = XLSX.utils.aoa_to_sheet([
      ["Colaborador", "Cuenta", "Monto"],
      ...transfers.map((line) => [line.employeeName, line.bankAccount || "SIN CUENTA", Number(line.netPay) || 0]),
      ["TOTAL", "", sum(transfers, "netPay")],
    ]);
    transferSheet["!cols"] = [{ wch: 34 }, { wch: 22 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(book, transferSheet, "Transferencias");
  }
  XLSX.writeFile(book, `planilla_${run.payGroup.toLowerCase()}_${run.scheduledDate}.xlsx`);
}

/** Qué cambió entre dos cálculos de la misma planilla. */
function compareRuns(before, after) {
  const previous = new Map((before.lines || []).map((line) => [line.employeeId, line]));
  const changedIds = new Set();
  (after.lines || []).forEach((line) => {
    const old = previous.get(line.employeeId);
    if (!old || Number(old.netPay) !== Number(line.netPay) || Number(old.opiDiscount) !== Number(line.opiDiscount)) {
      changedIds.add(line.id);
    }
  });
  const currentIds = new Set((after.lines || []).map((line) => line.employeeId));
  const removed = (before.lines || []).filter((line) => !currentIds.has(line.employeeId)).length;
  return { changedIds, removed };
}

function PayrollRuns() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("PLANILLA.CORRIDAS.CREAR");
  const canApprove = hasPermission("PLANILLA.CORRIDAS.APROBAR");

  const [activeTab, setActiveTab] = useState("runs");
  // Fichas y Parámetros quedan montados después de abrirlos, para no perder lo que se estaba editando.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(["runs"]));
  const [payDays, setPayDays] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [result, setResult] = useState(null);
  const [changedLineIds, setChangedLineIds] = useState(() => new Set());
  const [lineSearch, setLineSearch] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [chequeForm, setChequeForm] = useState(null);
  const [annulReason, setAnnulReason] = useState(null);
  const [payDate, setPayDate] = useState(null);
  const [profilesFocus, setProfilesFocus] = useState(null);
  const [openingId, setOpeningId] = useState(null);
  // Número de la última apertura o acción; la respuesta de una anterior se descarta.
  const latestRequest = useRef(0);
  const topRef = useRef(null);
  // Cada vez que se abre o se cierra una planilla la vista sube a su inicio, ya con el contenido nuevo pintado.
  const [scrollRequest, setScrollRequest] = useState(0);

  const runsPagination = usePagination(runs, 10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [days, list] = await Promise.all([getPayDays(), getPayrollRuns()]);
      setPayDays(days || []);
      setRuns(list || []);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // El destello de las filas recalculadas dura lo que su animación; luego se limpia para el siguiente.
  useEffect(() => {
    if (changedLineIds.size === 0) return undefined;
    const timer = setTimeout(() => setChangedLineIds(new Set()), 1600);
    return () => clearTimeout(timer);
  }, [changedLineIds]);

  useEffect(() => {
    if (scrollRequest > 0) scrollToElement(topRef.current);
  }, [scrollRequest]);

  const scrollToTop = () => setScrollRequest((count) => count + 1);

  const showRun = (detail) => {
    setSelected(detail);
    setResult(null);
    setLineSearch("");
    setChangedLineIds(new Set());
    setActiveTab("runs");
    scrollToTop();
  };

  const openRun = async (id) => {
    const request = ++latestRequest.current;
    setOpeningId(id);
    try {
      const detail = await getPayrollRun(id);
      if (request === latestRequest.current) showRun(detail);
    } catch (error) {
      if (request === latestRequest.current) showError(error.message);
    } finally {
      setOpeningId((current) => (current === id ? null : current));
    }
  };

  const closeRun = () => {
    latestRequest.current += 1;
    setSelected(null);
    setResult(null);
    scrollToTop();
  };

  /** Al volver a Planillas se recargan la lista y la planilla abierta, que un cambio en Fichas pudo desactualizar. */
  const selectTab = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setVisitedTabs((current) => new Set(current).add(tab));
    if (tab === "runs") {
      load();
      if (selected) openRun(selected.id);
    }
  };

  const goToProfiles = (focus) => {
    setProfilesFocus({ ...focus, nonce: Date.now() });
    selectTab("profiles");
  };

  const run = async (action, successMessage) => {
    setBusy(true);
    const request = ++latestRequest.current;
    try {
      const updated = await action();
      if (updated && updated.id && request === latestRequest.current) {
        setSelected(updated);
        setResult(null);
      }
      showSuccess(successMessage);
      await load();
      return true;
    } catch (error) {
      showError(error.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const prepare = (day) => setConfirm({
    title: `Preparar planilla de ${GROUP_SHORT[day.payGroup] || day.payGroup}`,
    message: `Pago del ${fmtDate(day.payDate)}, período del ${fmtDate(day.periodStart)} al ${fmtDate(day.periodEnd)}.`,
    detail: "Se calcula con las fichas, los parámetros y las compras de colaborador vigentes, y queda en borrador para revisarla.",
    confirmText: "Preparar",
    tone: "info",
    action: async () => {
      try {
        const created = await createPayrollRun({ payGroup: day.payGroup, scheduledDate: day.scheduledDate });
        showSuccess(`Planilla #${created.id} preparada en borrador.`);
        await load();
        showRun(created);
      } catch (error) {
        showError(error.message);
      }
    },
  });

  const recalc = async () => {
    if (!selected) return;
    setRecalculating(true);
    const before = selected;
    const request = ++latestRequest.current;
    try {
      const updated = await recalculatePayrollRun(before.id);
      if (request !== latestRequest.current) return;
      const { changedIds, removed } = compareRuns(before, updated);
      const sameTotal = Number(before.totalNet) === Number(updated.totalNet);
      setSelected(updated);
      setChangedLineIds(changedIds);
      setResult(changedIds.size === 0 && removed === 0 && sameTotal
        ? { tone: "success", text: "Recalculada: sin cambios." }
        : {
          tone: "success",
          text: `Recalculada: ${changedIds.size === 1 ? "1 colaborador cambió" : `${changedIds.size} colaboradores cambiaron`}`
            + `${removed > 0 ? `, ${removed} ya no ${removed === 1 ? "entra" : "entran"}` : ""}. `
            + `Líquido total ${q(updated.totalNet)} (antes ${q(before.totalNet)}).`,
        });
      await load();
    } catch (error) {
      showError(error.message);
    } finally {
      setRecalculating(false);
    }
  };

  const lines = useMemo(() => (selected && selected.lines) || [], [selected]);
  const visibleLines = useMemo(() => {
    const term = lineSearch.trim().toLowerCase();
    return term ? lines.filter((line) => `${line.employeeName} ${line.position || ""}`.toLowerCase().includes(term)) : lines;
  }, [lines, lineSearch]);
  const printable = selected ? chequeLines(selected) : [];
  const missingCheques = lines.filter((line) => line.paymentMethod === "CHEQUE" && Number(line.netPay) > 0 && !line.chequeNumber).length;
  const withoutPaymentMethod = lines.filter((line) => !line.paymentMethod).length;
  const canChangePayDate = selected && ((selected.status === "BORRADOR" && canCreate) || (selected.status === "APROBADA" && canApprove));
  // Vouchers y cheques solo de una planilla aprobada o pagada; una anulada conserva números que ya no valen.
  const canPrint = selected && (selected.status === "APROBADA" || selected.status === "PAGADA");
  const byMethod = (method) => lines.filter((line) => line.paymentMethod === method).length;

  const printDocs = (builder) => {
    if (!openPayrollPrintWindow(builder(selected))) {
      showError("El navegador bloqueó la ventana de impresión.");
    }
  };

  const askApprove = () => setConfirm({
    title: `Aprobar planilla #${selected.id}`,
    message: "Los montos quedan fijos y se rebajan las compras de colaborador.",
    confirmText: "Aprobar",
    tone: "info",
    action: () => run(() => approvePayrollRun(selected.id), "Planilla aprobada."),
  });

  const askPay = () => setConfirm({
    title: "Registrar pago",
    message: "La planilla queda pagada y se genera su partida contable. Después no se puede anular.",
    confirmText: "Registrar pago",
    tone: "success",
    action: () => run(() => payPayrollRun(selected.id), "Pago registrado y partida generada."),
  });

  const openChequeForm = () => setChequeForm({
    firstChequeNumber: selected.suggestedFirstChequeNumber || "",
    bankName: selected.bankName || "",
  });

  /** Qué toca hacer con la planilla abierta y el botón que lo hace. */
  const nextStep = (() => {
    if (!selected) return null;
    const group = selected.payGroup;
    if (selected.status === "BORRADOR") {
      if (lines.length === 0) {
        return {
          tone: "aviso",
          title: "Nadie cobra en este período",
          text: "Revise en Fichas el grupo, el salario y las fechas de ingreso y baja; luego recalcule.",
          action: { key: "fichas", label: "Revisar fichas", onClick: () => goToProfiles({ group }) },
        };
      }
      if (selected.stale) {
        return {
          tone: "alerta",
          title: "Planilla desactualizada",
          text: "Cambiaron fichas, cargos o parámetros después del cálculo. Recalcule para poder aprobar.",
          action: canCreate ? { key: "recalcular", label: "Recalcular", onClick: recalc } : null,
        };
      }
      if (withoutPaymentMethod > 0) {
        return {
          tone: "aviso",
          title: `${people(withoutPaymentMethod)} sin forma de pago`,
          text: "Complételo en Fichas y recalcule para poder aprobar.",
          action: { key: "fichas", label: "Completar en Fichas", onClick: () => goToProfiles({ group, onlyWarnings: true }) },
        };
      }
      return {
        tone: "info",
        title: "Revise los montos y apruebe",
        text: canApprove
          ? "Al aprobar, los montos quedan fijos y se rebajan las compras de colaborador."
          : "La aprueba quien tiene permiso para aprobar planillas.",
        action: canApprove ? { key: "aprobar", label: "Aprobar", onClick: askApprove } : null,
      };
    }
    if (selected.status === "APROBADA") {
      if (missingCheques > 0) {
        return {
          tone: "aviso",
          title: `Faltan ${missingCheques} números de cheque`,
          text: "Numérelos para imprimir los cheques y registrar el pago.",
          action: canApprove ? { key: "cheques", label: "Numerar cheques", onClick: openChequeForm } : null,
        };
      }
      return {
        tone: "info",
        title: "Lista para pagar",
        text: "Imprima vouchers y cheques, y registre el pago al entregarlos.",
        action: canApprove ? { key: "pagar", label: "Registrar pago", onClick: askPay } : null,
      };
    }
    if (selected.status === "PAGADA") {
      return { tone: "listo", title: `Pagada el ${fmtDate(selected.paidAt)}`, text: "La partida contable quedó registrada." };
    }
    const sameDay = payDays.find((day) => day.payGroup === selected.payGroup && day.scheduledDate === selected.scheduledDate);
    let action = null;
    if (sameDay && sameDay.runId && sameDay.runId !== selected.id) {
      action = { key: "abrir", label: `Abrir planilla #${sameDay.runId}`, onClick: () => openRun(sameDay.runId) };
    } else if (canCreate) {
      action = { key: "preparar", label: "Preparar de nuevo", onClick: () => prepare(sameDay || selected) };
    }
    return {
      tone: "neutro",
      title: "Anulada",
      text: selected.cancellationReason ? `Motivo: ${selected.cancellationReason}.` : "La fecha quedó libre para otra planilla.",
      action,
    };
  })();
  const primaryKey = nextStep && nextStep.action ? nextStep.action.key : null;

  /** El aviso enlaza con lo que lo corrige. */
  const warningAction = (warning) => {
    if (!selected) return null;
    if (PROFILE_WARNINGS.some((prefix) => warning.startsWith(prefix))) {
      return { label: "Revisar en Fichas", onClick: () => goToProfiles({ group: selected.payGroup, onlyWarnings: true }) };
    }
    if (GROUP_REVIEW_WARNINGS.some((prefix) => warning.startsWith(prefix))) {
      return { label: "Ver fichas del grupo", onClick: () => goToProfiles({ group: selected.payGroup }) };
    }
    return null;
  };

  const today = todayIso();
  const nextPayKeys = useMemo(() => {
    const keys = new Set();
    ["PLANTA", "ADMINISTRACION"].forEach((group) => {
      const next = payDays.find((day) => day.payGroup === group && day.scheduledDate >= today);
      if (next) keys.add(`${next.payGroup}-${next.scheduledDate}`);
    });
    return keys;
  }, [payDays, today]);

  const payDaysTable = loading ? (
    <Spinner size="sm" />
  ) : (
    <Table size="sm" responsive>
      <thead>
        <tr>
          <th>Grupo</th>
          <th>Fecha programada</th>
          <th>Se paga</th>
          <th>Período</th>
          <th>Planilla</th>
        </tr>
      </thead>
      <tbody>
        {payDays.map((day) => {
          const key = `${day.payGroup}-${day.scheduledDate}`;
          return (
            <tr key={key}>
              <td>
                {GROUP_LABELS[day.payGroup] || day.payGroup}
                {nextPayKeys.has(key) && <span className="fossiles-estado fossiles-estado--aprobada ml-2">Próximo</span>}
              </td>
              <td>{fmtDate(day.scheduledDate)}</td>
              <td>
                {fmtDate(day.payDate)}
                {day.payDate !== day.scheduledDate && <small className="text-muted"> (antes de la fecha programada)</small>}
              </td>
              <td>{fmtDate(day.periodStart)} al {fmtDate(day.periodEnd)}</td>
              <td>
                {day.runId ? (
                  <button type="button" className="fossiles-acceso" aria-label={`Abrir planilla #${day.runId}`}
                    onClick={() => openRun(day.runId)}>
                    #{day.runId} <StatusPill status={day.runStatus} />
                    {openingId === day.runId
                      ? <Spinner size="sm" />
                      : <i className="nc-icon nc-minimal-right fossiles-acceso__flecha" />}
                  </button>
                ) : (
                  canCreate && (
                    <Button color="primary" size="sm" disabled={busy} onClick={() => prepare(day)}>
                      Preparar
                    </Button>
                  )
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );

  const runDetail = selected && (
    <>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <Button color="link" className="p-0 text-muted" onClick={closeRun}>
          <i className="nc-icon nc-minimal-left mr-1" /> Volver a planillas
        </Button>
        <Button close aria-label="Cerrar planilla" onClick={closeRun} />
      </div>
      <div className="d-flex flex-wrap justify-content-between align-items-start mb-3" style={{ gap: 12 }}>
        <div>
          <CardTitle tag="h5" className="mb-1">
            Planilla #{selected.id} · {GROUP_LABELS[selected.payGroup] || selected.payGroup}{" "}
            <StatusPill status={selected.status} />
          </CardTitle>
          <small className="text-muted">
            Pago {fmtDate(selected.payDate)} · período {fmtDate(selected.periodStart)} al {fmtDate(selected.periodEnd)}
            {selected.bankName ? ` · ${selected.bankName}` : ""}
          </small>
        </div>
        <div className="fossiles-pasos" aria-label="Estado de la planilla">
          {selected.status === "ANULADA" ? (
            <span className="fossiles-paso fossiles-paso--anulada">Anulada</span>
          ) : STEPS.map(([status, label], index) => {
            const current = STEPS.findIndex(([s]) => s === selected.status);
            const finished = selected.status === "PAGADA";
            const stepClass = index < current || finished ? "fossiles-paso--hecho"
              : index === current ? "fossiles-paso--actual" : "";
            return <span key={status} className={`fossiles-paso ${stepClass}`}>{label}</span>;
          })}
        </div>
      </div>

      {nextStep && (
        <div className={`fossiles-siguiente${nextStep.tone === "info" ? "" : ` fossiles-siguiente--${nextStep.tone}`}`}>
          <div>
            <div className="fossiles-siguiente__titulo">{nextStep.title}</div>
            <div className="small">{nextStep.text}</div>
          </div>
          {nextStep.action && (
            <Button color={nextStep.tone === "alerta" ? "danger" : "primary"}
              disabled={busy || recalculating} onClick={nextStep.action.onClick}>
              {nextStep.action.key === "recalcular" && recalculating ? (
                <><Spinner size="sm" className="mr-2" />Recalculando…</>
              ) : nextStep.action.label}
            </Button>
          )}
        </div>
      )}

      <div className="d-flex flex-wrap mb-3" style={{ gap: 6 }}>
        {selected.status === "BORRADOR" && canCreate && primaryKey !== "recalcular" && (
          <Button size="sm" color="secondary" disabled={busy || recalculating} onClick={recalc}>
            {recalculating ? <><Spinner size="sm" className="mr-1" />Recalculando…</> : "Recalcular"}
          </Button>
        )}
        {selected.status === "APROBADA" && canApprove && primaryKey !== "cheques" && (
          <Button size="sm" color="secondary" outline disabled={busy} onClick={openChequeForm}>
            Numerar cheques
          </Button>
        )}
        {canChangePayDate && (
          <Button size="sm" color="secondary" outline disabled={busy} onClick={() => setPayDate(selected.payDate)}>
            Fecha de pago
          </Button>
        )}
        {(selected.status === "BORRADOR" || selected.status === "APROBADA") && canApprove && (
          <Button size="sm" color="danger" outline disabled={busy} onClick={() => setAnnulReason("")}>
            Anular
          </Button>
        )}
        {lines.length > 0 && (
          <Button size="sm" color="default" outline onClick={() => exportRunToExcel(selected)}>
            Excel
          </Button>
        )}
        {canPrint && printable.length > 0 && (
          <>
            <Button size="sm" color="default" outline onClick={() => printDocs(buildPayrollVouchersHtml)}>
              Vouchers
            </Button>
            <Button size="sm" color="default" outline onClick={() => printDocs(buildPayrollChequesHtml)}>
              Cheques
            </Button>
          </>
        )}
      </div>

      {result && (
        <Alert color={result.tone} className="py-2" toggle={() => setResult(null)}>{result.text}</Alert>
      )}
      {selected.notes && <p className="small text-muted mb-2">{selected.notes}</p>}

      {(selected.warnings || []).length > 0 && (
        <div className="mb-3">
          <div className="small font-weight-bold mb-1">Avisos</div>
          <ul className="small pl-3 mb-0">
            {selected.warnings.map((warning) => {
              const action = warningAction(warning);
              return (
                <li key={warning} className="mb-1">
                  <span>{warning}</span>
                  {action && (
                    <Button color="link" size="sm" className="p-0 ml-2 align-baseline" onClick={action.onClick}>
                      {action.label}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {lines.length > 0 && (
        <div className="fossiles-resumen">
          <div className="fossiles-resumen__dato">
            <div className="fossiles-resumen__etiqueta">Colaboradores</div>
            <div className="fossiles-resumen__valor">{lines.length}</div>
          </div>
          <div className="fossiles-resumen__dato">
            <div className="fossiles-resumen__etiqueta">Bruto</div>
            <div className="fossiles-resumen__valor">{q(selected.totalGross)}</div>
          </div>
          <div className="fossiles-resumen__dato">
            <div className="fossiles-resumen__etiqueta">Deducciones</div>
            <div className="fossiles-resumen__valor">{q(selected.totalDeductions)}</div>
          </div>
          <div className="fossiles-resumen__dato">
            <div className="fossiles-resumen__etiqueta">Líquido</div>
            <div className="fossiles-resumen__valor">{q(selected.totalNet)}</div>
          </div>
          <div className="fossiles-resumen__dato">
            <div className="fossiles-resumen__etiqueta">Cheque · transferencia · efectivo</div>
            <div className="fossiles-resumen__valor">
              {byMethod("CHEQUE")} · {byMethod("TRANSFERENCIA BANCARIA")} · {byMethod("EFECTIVO")}
            </div>
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <Input bsSize="sm" className="mb-2" style={{ maxWidth: 320 }} placeholder="Buscar colaborador o puesto"
          aria-label="Buscar colaborador" value={lineSearch} onChange={(e) => setLineSearch(e.target.value)} />
      )}
      <div className={recalculating ? "fossiles-recalculando" : undefined}>
        {recalculating && (
          <div className="fossiles-recalculando__capa"><Spinner size="sm" className="mr-2" />Recalculando…</div>
        )}
        <Table size="sm" responsive striped>
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Vinculación</th>
              <th>Pago</th>
              <th className="text-right">Días</th>
              <th className="text-right">Sueldo</th>
              <th className="text-right">Bonificación</th>
              <th className="text-right">IGSS</th>
              <th className="text-right">ISR</th>
              <th className="text-right">Compras</th>
              <th className="text-right">Líquido</th>
              <th>Cheque</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan="11" className="text-muted">Sin colaboradores en este período.</td>
              </tr>
            )}
            {lines.length > 0 && visibleLines.length === 0 && (
              <tr>
                <td colSpan="11" className="text-muted">Nadie coincide con la búsqueda.</td>
              </tr>
            )}
            {visibleLines.map((line) => (
              <tr key={line.id} className={changedLineIds.has(line.id) ? "fossiles-flash" : undefined}>
                <td>
                  {line.employeeName}
                  {line.position && <div className="small text-muted">{line.position}</div>}
                </td>
                <td>{line.employmentType}</td>
                <td>
                  {line.paymentMethod || (
                    <>
                      <span className="text-danger">Sin forma de pago</span>
                      <Button color="link" size="sm" className="p-0 ml-1 align-baseline"
                        onClick={() => goToProfiles({ search: line.employeeName })}>
                        Completar
                      </Button>
                    </>
                  )}
                </td>
                <td className="text-right">{Number(line.daysPaid)}</td>
                <td className="text-right">{formatAmount(line.baseSalary)}</td>
                <td className="text-right">{formatAmount(line.bonification)}</td>
                <td className="text-right">{formatAmount(line.igssEmployee)}</td>
                <td className="text-right">{formatAmount(line.isr)}</td>
                <td className="text-right">{formatAmount(line.opiDiscount)}</td>
                <td className="text-right font-weight-bold">{formatAmount(line.netPay)}</td>
                <td>{line.chequeNumber || ""}</td>
              </tr>
            ))}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="font-weight-bold">
                <td colSpan="4">Total ({lines.length})</td>
                <td className="text-right">{formatAmount(sum(lines, "baseSalary"))}</td>
                <td className="text-right">{formatAmount(sum(lines, "bonification"))}</td>
                <td className="text-right">{formatAmount(sum(lines, "igssEmployee"))}</td>
                <td className="text-right">{formatAmount(sum(lines, "isr"))}</td>
                <td className="text-right">{formatAmount(sum(lines, "opiDiscount"))}</td>
                <td className="text-right">{formatAmount(sum(lines, "netPay"))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </Table>
      </div>
      {lines.length > 0 && (
        <p className="small text-muted mb-0">
          Cuota patronal: IGSS {q(sum(lines, "igssEmployer"))} · IRTRA {q(sum(lines, "irtra"))} · INTECAP{" "}
          {q(sum(lines, "intecap"))}.
        </p>
      )}
    </>
  );

  return (
    <div className="content">
      <div ref={topRef} />
      <Card>
        <CardHeader>
          <CardTitle tag="h4" className="mb-0">Planilla quincenal</CardTitle>
          <p className="text-muted small mb-0 mt-1">
            Planta: 5 y 20 · Administración y kioscos: 15 y fin de mes · Fin de semana o feriado: día hábil anterior ·
            El borrador se prepara solo 3 días antes del pago.
          </p>
        </CardHeader>
        <CardBody>
          <Nav tabs className="mb-3">
            {TABS.map(([tab, label]) => (
              <NavItem key={tab}>
                <NavLink className={classnames({ active: activeTab === tab })} style={{ cursor: "pointer" }}
                  onClick={() => selectTab(tab)}>
                  {label}
                </NavLink>
              </NavItem>
            ))}
          </Nav>
          <TabContent activeTab={activeTab}>
            <TabPane tabId="runs">{selected ? runDetail : payDaysTable}</TabPane>
            <TabPane tabId="profiles">{visitedTabs.has("profiles") && <PayrollProfiles focus={profilesFocus} />}</TabPane>
            <TabPane tabId="parameters">{visitedTabs.has("parameters") && <PayrollParameters />}</TabPane>
          </TabContent>
        </CardBody>
      </Card>

      {activeTab === "runs" && !selected && (
        <Card>
          <CardHeader>
            <CardTitle tag="h5" className="mb-0">Planillas</CardTitle>
          </CardHeader>
          <CardBody>
            <Table size="sm" responsive hover>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Grupo</th>
                  <th>Se paga</th>
                  <th>Período</th>
                  <th>Estado</th>
                  <th className="text-right">Bruto</th>
                  <th className="text-right">Deducciones</th>
                  <th className="text-right">Líquido</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 && (
                  <tr>
                    <td colSpan="9" className="text-muted">Todavía no hay planillas.</td>
                  </tr>
                )}
                {runsPagination.pageItems.map((item) => (
                  <tr key={item.id} style={{ cursor: "pointer" }} onClick={() => openRun(item.id)}>
                    <td>{item.id}</td>
                    <td>{GROUP_LABELS[item.payGroup] || item.payGroup}</td>
                    <td>{fmtDate(item.payDate)}</td>
                    <td>{fmtDate(item.periodStart)} al {fmtDate(item.periodEnd)}</td>
                    <td><StatusPill status={item.status} /></td>
                    <td className="text-right">{formatAmount(item.totalGross)}</td>
                    <td className="text-right">{formatAmount(item.totalDeductions)}</td>
                    <td className="text-right">{formatAmount(item.totalNet)}</td>
                    <td className="text-right">
                      {openingId === item.id ? <Spinner size="sm" /> : (
                        <span className="text-info small font-weight-bold">Abrir <i className="nc-icon nc-minimal-right" /></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <TablePagination pagination={runsPagination} />
          </CardBody>
        </Card>
      )}

      <ConfirmModal
        isOpen={Boolean(confirm)}
        toggle={() => setConfirm(null)}
        title={confirm?.title}
        message={confirm?.message}
        detail={confirm?.detail}
        tone={confirm?.tone}
        confirmText={confirm?.confirmText}
        onConfirm={() => confirm.action()}
      />

      <Modal isOpen={Boolean(chequeForm)} toggle={() => setChequeForm(null)}>
        <ModalHeader toggle={() => setChequeForm(null)}>Numerar cheques</ModalHeader>
        <ModalBody>
          <p className="small text-muted">
            Se numeran en orden alfabético desde este número. Se pueden volver a numerar antes de registrar el pago.
          </p>
          <FormGroup>
            <Label>Primer número de cheque</Label>
            <Input value={chequeForm?.firstChequeNumber || ""} placeholder="99645508/GCF" maxLength={30}
              onChange={(e) => setChequeForm({ ...chequeForm, firstChequeNumber: e.target.value })} />
          </FormGroup>
          <FormGroup>
            <Label>Banco</Label>
            <Input value={chequeForm?.bankName || ""} maxLength={100}
              onChange={(e) => setChequeForm({ ...chequeForm, bankName: e.target.value })} />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setChequeForm(null)}>Cancelar</Button>
          <Button color="primary" disabled={busy || !chequeForm?.firstChequeNumber?.trim()}
            onClick={async () => {
              const ok = await run(() => assignPayrollCheques(selected.id, chequeForm), "Cheques numerados.");
              if (ok) setChequeForm(null);
            }}>
            Numerar
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={payDate !== null} toggle={() => setPayDate(null)}>
        <ModalHeader toggle={() => setPayDate(null)}>Fecha de pago</ModalHeader>
        <ModalBody>
          <p className="small text-muted">
            Se puede adelantar hasta 10 días, nunca después de la fecha programada. En borrador, la planilla se recalcula.
          </p>
          {selected && (
            <FormGroup>
              <Label>Se paga el</Label>
              <Input type="date" value={payDate || ""} max={selected.scheduledDate}
                min={isoDaysBefore(selected.scheduledDate, 10)} onChange={(e) => setPayDate(e.target.value)} />
            </FormGroup>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setPayDate(null)}>Cancelar</Button>
          <Button color="primary" disabled={busy || !payDate}
            onClick={async () => {
              const ok = await run(() => changePayrollPayDate(selected.id, payDate), "Fecha de pago actualizada.");
              if (ok) setPayDate(null);
            }}>
            Guardar
          </Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={annulReason !== null} toggle={() => setAnnulReason(null)}>
        <ModalHeader toggle={() => setAnnulReason(null)}>Anular planilla</ModalHeader>
        <ModalBody>
          <p className="small text-muted">
            Si estaba aprobada, los descuentos de compras vuelven al saldo de cada colaborador.
          </p>
          <FormGroup>
            <Label>Motivo</Label>
            <Input type="textarea" maxLength={500} value={annulReason || ""} onChange={(e) => setAnnulReason(e.target.value)} />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setAnnulReason(null)}>Cancelar</Button>
          <Button color="danger" disabled={busy || !annulReason?.trim()}
            onClick={async () => {
              const ok = await run(() => annulPayrollRun(selected.id, annulReason.trim()), "Planilla anulada.");
              if (ok) setAnnulReason(null);
            }}>
            Anular
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default PayrollRuns;
