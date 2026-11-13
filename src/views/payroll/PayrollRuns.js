import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import * as XLSX from "xlsx-js-style";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import SideDrawer from "components/SideDrawer/SideDrawer";
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
import PayrollShell from "./PayrollShell";
import {
  Avatar,
  GROUP_LABELS,
  GROUP_SHORT,
  METHODS,
  ModuleLink,
  StatusPill,
  amountOrDash,
  daysUntil,
  fmtDate,
  fmtLong,
  fmtShort,
  SECTIONS,
  people,
  q,
  sectionOf,
  sum,
  todayIso,
} from "./payrollUi";

const STEPS = [["BORRADOR", "Borrador"], ["APROBADA", "Aprobada"], ["PAGADA", "Pagada"]];
const TAB_KEYS = ["runs", "profiles", "parameters"];
const RUN_FILTERS = [
  ["ALL", "Todas"], ["PLANTA", "Planta"], ["ADMINISTRACION", "Administración"], ["BORRADOR", "Borrador"],
  ["PAGADA", "Pagadas"], ["ANULADA", "Anuladas"],
];
const PAY_FILTERS = [["ALL", "Todos"], ["CHEQUE", "Cheque"], ["TRANSFERENCIA BANCARIA", "Transferencia"], ["EFECTIVO", "Efectivo"], ["WARN", "Con aviso"]];

// Avisos que se corrigen en Fichas (los demás solo informan).
const PROFILE_WARNINGS = [
  "Sin forma de pago",
  "Cobran por transferencia sin número de cuenta",
  "Activos del grupo sin salario",
  "De planilla con bonificación 0",
  "Sin departamento",
];
const GROUP_REVIEW_WARNINGS = ["No estaban en la planilla anterior", "Cambiaron de cuenta o de forma de pago"];

/** Fecha ISO tantos días antes, sin pasar por la zona horaria del navegador. */
const isoDaysBefore = (iso, days) => {
  const [y, m, d] = String(iso).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - days));
  return date.toISOString().slice(0, 10);
};

/** Pestaña con la que se llegó (por ejemplo desde Cargos); si no hay, Planillas. */
const initialTab = () => {
  try {
    const tab = window.history.state && window.history.state.usr && window.history.state.usr.tab;
    return TAB_KEYS.includes(tab) ? tab : "runs";
  } catch (error) {
    return "runs";
  }
};

const lineDeductions = (line) =>
  (Number(line.igssEmployee) || 0) + (Number(line.isr) || 0) + (Number(line.opiDiscount) || 0) + (Number(line.otherDeductions) || 0);
const lineGross = (line) => (Number(line.baseSalary) || 0) + (Number(line.bonification) || 0) + (Number(line.extraPay) || 0);
const needsAccount = (line) => line.paymentMethod === "TRANSFERENCIA BANCARIA" && !line.bankAccount;
const maskAccount = (account) => (account ? `•••• ${String(account).slice(-4)}` : "");

function exportRunToExcel(run) {
  const header = ["Colaborador", "Puesto", "Sección", "Vinculación", "Forma de pago", "Cuenta", "Salario mensual", "Días",
    "Sueldo", "Bonificación", "IGSS laboral", "ISR", "Compras colaborador", "Otras deducciones", "Líquido",
    "IGSS patronal", "IRTRA", "INTECAP", "Horas extra y feriados", "Días de ausencia", "Días de vacaciones", "Cheque"];
  const keys = ["monthlySalary", "daysPaid", "baseSalary", "bonification", "igssEmployee", "isr", "opiDiscount",
    "otherDeductions", "netPay", "igssEmployer", "irtra", "intecap", "extraPay", "absenceDays", "vacationDays"];
  const rows = run.lines.map((line) => [line.employeeName, line.position || "", SECTIONS[sectionOf(run.payGroup, line.kiosk)], line.employmentType,
    line.paymentMethod || "", line.bankAccount || "", ...keys.map((key) => Number(line[key]) || 0), line.chequeNumber || ""]);
  const totals = ["TOTAL", "", "", "", "", "", ...keys.map((key) => (key === "monthlySalary" || key === "daysPaid" ? "" : sum(run.lines, key))), ""];
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

function Steps({ status }) {
  const current = STEPS.findIndex(([s]) => s === status);
  return (
    <div className="pl-steps" aria-label="Estado de la planilla">
      {STEPS.map(([key, label], index) => {
        const done = index < current || status === "PAGADA";
        const cls = done ? "pl-step--hecho" : index === current ? "pl-step--actual" : "";
        return (
          <React.Fragment key={key}>
            {index > 0 && <span className={`pl-step-line ${index <= current ? "pl-step-line--hecho" : ""}`} />}
            <span className={`pl-step ${cls}`}>
              <i>{done ? "✓" : index + 1}</i>
              <span>{label}</span>
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function PayrollRuns() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission("PLANILLA.CORRIDAS.CREAR");
  const canApprove = hasPermission("PLANILLA.CORRIDAS.APROBAR");

  const [activeTab, setActiveTab] = useState(initialTab);
  // Fichas y Parámetros quedan montados después de abrirlos, para no perder lo que se estaba editando.
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(["runs", initialTab()]));
  const [payDays, setPayDays] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [result, setResult] = useState(null);
  const [changedLineIds, setChangedLineIds] = useState(() => new Set());
  const [lineSearch, setLineSearch] = useState("");
  const [payFilter, setPayFilter] = useState("ALL");
  const [section, setSection] = useState("ALL");
  const [showColumns, setShowColumns] = useState(false);
  const [voucherId, setVoucherId] = useState(null);
  const [runFilter, setRunFilter] = useState("ALL");
  const [showMissed, setShowMissed] = useState(false);
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

  const filteredRuns = useMemo(
    () => runs.filter((item) => runFilter === "ALL" || item.payGroup === runFilter || item.status === runFilter),
    [runs, runFilter]
  );
  const runsPagination = usePagination(filteredRuns, 10);

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
    setPayFilter("ALL");
    setSection("ALL");
    setVoucherId(null);
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
    setVoucherId(null);
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
    setVoucherId(null);
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
    return lines.filter((line) => {
      if (section !== "ALL" && sectionOf(selected.payGroup, line.kiosk) !== section) return false;
      const matchesFilter = payFilter === "ALL"
        || (payFilter === "WARN" ? !line.paymentMethod || needsAccount(line) : line.paymentMethod === payFilter);
      return matchesFilter && (!term || `${line.employeeName} ${line.position || ""}`.toLowerCase().includes(term));
    });
  }, [lines, lineSearch, payFilter, section, selected]);
  const printable = selected ? chequeLines(selected) : [];
  const sectionCounts = lines.reduce((acc, line) => {
    const key = sectionOf(selected.payGroup, line.kiosk);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const hasSections = Boolean(selected) && selected.payGroup !== "PLANTA" && lines.length > 0;
  const missingCheques = lines.filter((line) => line.paymentMethod === "CHEQUE" && Number(line.netPay) > 0 && !line.chequeNumber).length;
  const withoutPaymentMethod = lines.filter((line) => !line.paymentMethod);
  const canChangePayDate = selected && ((selected.status === "BORRADOR" && canCreate) || (selected.status === "APROBADA" && canApprove));
  // Vouchers y cheques solo de una planilla aprobada o pagada; una anulada conserva números que ya no valen.
  const canPrint = selected && (selected.status === "APROBADA" || selected.status === "PAGADA");
  const voucherLine = voucherId ? lines.find((line) => line.id === voucherId) : null;

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
          tone: "aviso", icon: "nc-icon nc-alert-circle-i",
          title: "Nadie cobra en este período",
          text: "Revise en Fichas el grupo, el salario y las fechas de ingreso y baja; luego recalcule.",
          action: { key: "fichas", label: "Revisar fichas", onClick: () => goToProfiles({ group }) },
        };
      }
      if (selected.stale) {
        return {
          tone: "alerta", icon: "nc-icon nc-alert-circle-i",
          title: "Planilla desactualizada",
          text: "Cambiaron fichas, cargos o parámetros después del cálculo. Recalcule para poder aprobar.",
          action: canCreate ? { key: "recalcular", label: "Recalcular", onClick: recalc } : null,
        };
      }
      if (withoutPaymentMethod.length > 0) {
        return {
          tone: "aviso", icon: "nc-icon nc-alert-circle-i",
          title: `${people(withoutPaymentMethod.length)} sin forma de pago`,
          text: "Complételo en Fichas y recalcule para poder aprobar.",
          action: { key: "fichas", label: "Completar en Fichas", onClick: () => goToProfiles({ group, onlyWarnings: true }) },
        };
      }
      return {
        tone: "info", icon: "nc-icon nc-check-2",
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
          tone: "aviso", icon: "nc-icon nc-single-copy-04",
          title: `Faltan ${missingCheques} números de cheque`,
          text: "Numérelos para imprimir los cheques y registrar el pago.",
          action: canApprove ? { key: "cheques", label: "Numerar cheques", onClick: openChequeForm } : null,
        };
      }
      return {
        tone: "info", icon: "nc-icon nc-check-2",
        title: "Lista para pagar",
        text: "Imprima vouchers y cheques, y registre el pago al entregarlos.",
        action: canApprove ? { key: "pagar", label: "Registrar pago", onClick: askPay } : null,
      };
    }
    if (selected.status === "PAGADA") {
      return { tone: "listo", icon: "nc-icon nc-check-2", title: `Pagada el ${fmtDate(selected.paidAt)}`, text: "La partida contable quedó registrada." };
    }
    const sameDay = payDays.find((day) => day.payGroup === selected.payGroup && day.scheduledDate === selected.scheduledDate);
    let action = null;
    if (sameDay && sameDay.runId && sameDay.runId !== selected.id) {
      action = { key: "abrir", label: `Abrir planilla #${sameDay.runId}`, onClick: () => openRun(sameDay.runId) };
    } else if (canCreate) {
      action = { key: "preparar", label: "Preparar de nuevo", onClick: () => prepare(sameDay || selected) };
    }
    return {
      tone: "neutro", icon: "nc-icon nc-simple-remove",
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

  /** Lo que se revisa antes del siguiente paso: lo que bloquea va marcado en rojo, lo demás solo informa. */
  const checklist = (() => {
    if (!selected || lines.length === 0) return [];
    const items = [];
    if (selected.status === "BORRADOR") {
      items.push(withoutPaymentMethod.length > 0
        ? {
          kind: "block", text: `${people(withoutPaymentMethod.length)} sin forma de pago`,
          detail: withoutPaymentMethod.map((line) => line.employeeName).join(", "),
          action: { label: "Completar", onClick: () => goToProfiles({ group: selected.payGroup, onlyWarnings: true }) },
        }
        : { kind: "ok", text: "Todos tienen forma de pago" });
      items.push(selected.stale
        ? {
          kind: "block", text: "Algo cambió después del cálculo",
          detail: "Fichas, cargos o parámetros. Recalcule antes de aprobar.",
          action: canCreate ? { label: "Recalcular", onClick: recalc } : null,
        }
        : { kind: "ok", text: "El cálculo está al día con fichas, cargos y parámetros" });
      (selected.warnings || [])
        .filter((warning) => !warning.startsWith("Sin forma de pago"))
        .forEach((warning) => {
          const action = warningAction(warning);
          items.push({
            kind: PROFILE_WARNINGS.some((prefix) => warning.startsWith(prefix)) ? "warn" : "info",
            text: warning,
            action,
          });
        });
      const purchases = sum(lines, "opiDiscount");
      if (purchases > 0) {
        items.push({
          kind: "info",
          text: `Se rebajan ${q(purchases)} de compras de colaborador`,
          detail: `${people(lines.filter((line) => Number(line.opiDiscount) > 0).length)} con descuento en esta planilla.`,
          link: { to: "/admin/payroll/charges", label: "Ver cargos" },
        });
      }
    }
    return items;
  })();
  const blockers = checklist.filter((item) => item.kind === "block").length;

  const today = todayIso();
  const nextPayKeys = useMemo(() => {
    const keys = new Set();
    ["PLANTA", "ADMINISTRACION"].forEach((group) => {
      const next = payDays.find((day) => day.payGroup === group && day.scheduledDate >= today);
      if (next) keys.add(`${next.payGroup}-${next.scheduledDate}`);
    });
    return keys;
  }, [payDays, today]);
  const nextDays = payDays.filter((day) => nextPayKeys.has(`${day.payGroup}-${day.scheduledDate}`));
  const otherDays = payDays.filter((day) => !nextPayKeys.has(`${day.payGroup}-${day.scheduledDate}`));
  const runById = (id) => runs.find((item) => item.id === id);

  const dayAccess = (day) => (day.runId ? (
    <button type="button" className="fossiles-acceso" aria-label={`Abrir planilla #${day.runId}`} onClick={() => openRun(day.runId)}>
      #{day.runId} <StatusPill status={day.runStatus} />
      {openingId === day.runId ? <Spinner size="sm" /> : <i className="nc-icon nc-minimal-right fossiles-acceso__flecha" />}
    </button>
  ) : (
    canCreate && <Button color="primary" size="sm" disabled={busy} onClick={() => prepare(day)}>Preparar</Button>
  ));

  const nextPayCards = loading ? <Spinner size="sm" /> : (
    <div className="pl-cards2">
      {nextDays.map((day) => {
        const left = daysUntil(day.payDate);
        const when = left <= 0 ? (left === 0 ? "hoy" : `hace ${-left} días`) : left === 1 ? "mañana" : `en ${left} días`;
        const info = day.runId ? runById(day.runId) : null;
        return (
          <section key={`${day.payGroup}-${day.scheduledDate}`} className="pl-card pl-nextpay" aria-label={`Próximo pago de ${GROUP_SHORT[day.payGroup]}`}>
            <div className="pl-row">
              <span className="pl-lbl">{GROUP_SHORT[day.payGroup]} · próximo pago</span>
              <span className="pl-spacer" />
              {day.runId ? <StatusPill status={day.runStatus} /> : <span className="pl-pill pl-pill--neutro">Sin preparar</span>}
            </div>
            <div>
              <div className="pl-nextpay__when">{fmtLong(day.payDate)}</div>
              <div className="pl-sub">
                Pago {when}
                {day.payDate !== day.scheduledDate && <span> · antes de la fecha programada ({fmtDate(day.scheduledDate)})</span>}
              </div>
            </div>
            <div className="pl-facts">
              <div><span className="pl-lbl">Período</span><b>{fmtShort(day.periodStart)} al {fmtShort(day.periodEnd)}</b></div>
              <div>
                <span className="pl-lbl">{info ? "Líquido" : "Borrador"}</span>
                <b className="pl-num">{info ? q(info.totalNet) : "se prepara 3 días antes"}</b>
              </div>
            </div>
            {day.runId && (
              <Steps status={day.runStatus} />
            )}
            <div className="pl-row">
              {day.runId ? (
                <Button color="primary" className="m-0" aria-label={`Abrir planilla #${day.runId}`} onClick={() => openRun(day.runId)}>
                  {openingId === day.runId ? <Spinner size="sm" /> : `Abrir planilla #${day.runId}`}
                </Button>
              ) : (
                canCreate && <Button color="primary" className="m-0" disabled={busy} onClick={() => prepare(day)}>Preparar</Button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );

  /** Una fecha del calendario: cuándo se paga, qué período cubre y su planilla o el botón para prepararla. */
  const dayRow = (day, past) => (
    <li key={`${day.payGroup}-${day.scheduledDate}`} className={`pl-day${past ? " pl-day--past" : ""}`}>
      <div className="pl-day__info">
        <div className="pl-day__date">{fmtLong(day.payDate)}</div>
        <div className="pl-sub">
          Período {fmtShort(day.periodStart)} al {fmtShort(day.periodEnd)}
          {day.payDate !== day.scheduledDate && <> · se adelanta del {fmtShort(day.scheduledDate)}</>}
        </div>
      </div>
      {day.runId ? dayAccess(day) : (canCreate && (
        <Button color="primary" outline={!past} size="sm" className="m-0" disabled={busy} onClick={() => prepare(day)}>Preparar</Button>
      ))}
    </li>
  );

  // Cada grupo por su lado: lo que viene después de la tarjeta de arriba y, aparte, lo que quedó sin planilla.
  const calendarGroups = ["PLANTA", "ADMINISTRACION"].map((group) => {
    const days = otherDays.filter((day) => day.payGroup === group);
    return {
      group,
      later: days.filter((day) => day.scheduledDate >= today),
      missed: days.filter((day) => day.scheduledDate < today && !day.runId),
    };
  });
  const totalMissed = calendarGroups.reduce((total, item) => total + item.missed.length, 0);
  const calendar = !loading && calendarGroups.some((item) => item.later.length > 0 || item.missed.length > 0) && (
    <section aria-label="Calendario de pagos">
      <div className="pl-row mb-2">
        <h5 className="mb-0" style={{ fontWeight: 700, fontSize: 15 }}>Calendario de pagos</h5>
        <span className="pl-sub">Lo que viene después del próximo pago</span>
      </div>
      <div className="pl-cards2">
        {calendarGroups.map(({ group, later }) => (
          <div key={group} className="pl-card pl-calendar">
            <div className="pl-calendar__head"><b>{GROUP_SHORT[group]}</b><span className="pl-sub">{group === "PLANTA" ? "Paga el 5 y el 20" : "Paga el 15 y fin de mes · incluye kioscos"}</span></div>
            {later.length === 0 ? <p className="pl-sub px-3 py-3 mb-0">No hay más fechas por ahora.</p> : <ul className="pl-days">{later.map((day) => dayRow(day, false))}</ul>}
          </div>
        ))}
      </div>
      {totalMissed > 0 && (
        <div className="mt-2">
          <button type="button" className="pl-linkbtn" aria-expanded={showMissed} onClick={() => setShowMissed(!showMissed)}>
            {showMissed ? "Ocultar" : "Ver"} fechas anteriores sin planilla ({totalMissed})
          </button>
          {showMissed && (
            <div className="pl-cards2 mt-2">
              {calendarGroups.filter((item) => item.missed.length > 0).map(({ group, missed }) => (
                <div key={group} className="pl-card pl-calendar">
                  <div className="pl-calendar__head"><b>{GROUP_SHORT[group]}</b><span className="pl-sub">Pasaron sin prepararse</span></div>
                  <ul className="pl-days">{missed.map((day) => dayRow(day, true))}</ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );

  const history = (
    <section className="pl-card">
      <div className="pl-card__head">
        <h5>Historial de planillas</h5>
        <div className="pl-chips" role="group" aria-label="Filtrar planillas">
          {RUN_FILTERS.map(([key, label]) => (
            <button key={key} type="button" className="pl-chip" aria-pressed={runFilter === key} onClick={() => setRunFilter(key)}>{label}</button>
          ))}
        </div>
      </div>
      <div className="pl-scroll mt-2">
        <table className="pl-table">
          <thead>
            <tr>
              <th>#</th><th>Grupo</th><th>Se paga</th><th>Período</th><th>Estado</th>
              <th className="r">Bruto</th><th className="r">Deducciones</th><th className="r">Líquido</th><th />
            </tr>
          </thead>
          <tbody>
            {filteredRuns.length === 0 && (
              <tr><td colSpan="9" className="pl-empty">{runs.length === 0 ? "Todavía no hay planillas." : "No hay planillas con ese filtro."}</td></tr>
            )}
            {runsPagination.pageItems.map((item) => (
              <tr key={item.id} className="pl-click" tabIndex={0} onClick={() => openRun(item.id)}
                onKeyDown={(e) => { if (e.key === "Enter") openRun(item.id); }}>
                <td><b>{item.id}</b></td>
                <td>{GROUP_SHORT[item.payGroup] || item.payGroup}</td>
                <td>{fmtDate(item.payDate)}</td>
                <td>{fmtDate(item.periodStart)} al {fmtDate(item.periodEnd)}</td>
                <td><StatusPill status={item.status} /></td>
                <td className="r pl-num">{formatAmount(item.totalGross)}</td>
                <td className="r pl-num">{formatAmount(item.totalDeductions)}</td>
                <td className="r pl-num"><b>{formatAmount(item.totalNet)}</b></td>
                <td className="r">
                  {openingId === item.id ? <Spinner size="sm" /> : (
                    <span className="text-info small font-weight-bold">Abrir <i className="nc-icon nc-minimal-right" /></span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-3 pb-2"><TablePagination pagination={runsPagination} /></div>
    </section>
  );

  const byMethod = Object.keys(METHODS).map((method) => {
    const group = lines.filter((line) => line.paymentMethod === method);
    return { method, count: group.length, amount: sum(group, "netPay") };
  });
  const totalNet = sum(lines, "netPay") || 1;

  const methodCell = (line) => {
    if (!line.paymentMethod) {
      return (
        <>
          <span className="pl-tag pl-tag--bad">Sin forma de pago</span>
          <Button color="link" size="sm" className="p-0 ml-1 align-baseline"
            onClick={(e) => { e.stopPropagation(); goToProfiles({ search: line.employeeName }); }}>
            Completar
          </Button>
        </>
      );
    }
    const method = METHODS[line.paymentMethod] || { label: line.paymentMethod, icon: "nc-icon nc-money-coins" };
    return (
      <span className="pl-pay">
        <i className={method.icon} aria-hidden="true" />
        <span>
          {method.label}
          {line.paymentMethod === "CHEQUE" && (
            <><br /><small className="pl-num">{line.chequeNumber || "sin número"}</small></>
          )}
          {line.paymentMethod === "TRANSFERENCIA BANCARIA" && (
            <><br /><small>{line.bankAccount ? maskAccount(line.bankAccount) : <span style={{ color: "#94550a" }}>sin cuenta</span>}</small></>
          )}
        </span>
      </span>
    );
  };

  const linesTable = (
    <div className={recalculating ? "fossiles-recalculando" : undefined}>
      {recalculating && (
        <div className="fossiles-recalculando__capa"><Spinner size="sm" className="mr-2" />Recalculando…</div>
      )}
      <div className="pl-scroll">
        <table className="pl-table">
          <thead>
            <tr>
              <th>Colaborador</th>
              <th>Pago</th>
              <th className="r">Días</th>
              {showColumns ? (
                <>
                  <th className="r">Sueldo</th><th className="r">Bonificación</th><th className="r">Extras</th><th className="r">IGSS</th>
                  <th className="r">ISR</th><th className="r">Compras</th><th className="r">Otras</th>
                </>
              ) : (
                <><th className="r">Devengado</th><th className="r">Deducciones</th></>
              )}
              <th className="r">Líquido</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={showColumns ? 12 : 7} className="pl-empty">Sin colaboradores en este período.</td></tr>
            )}
            {lines.length > 0 && visibleLines.length === 0 && (
              <tr><td colSpan={showColumns ? 12 : 7} className="pl-empty">Nadie coincide con el filtro.</td></tr>
            )}
            {visibleLines.map((line) => (
              <tr key={line.id} className={`pl-click${changedLineIds.has(line.id) ? " pl-flash" : ""}`} tabIndex={0}
                aria-label={`Ver voucher de ${line.employeeName}`}
                onClick={() => setVoucherId(line.id)} onKeyDown={(e) => { if (e.key === "Enter") setVoucherId(line.id); }}>
                <td>
                  <div className="pl-who">
                    <Avatar name={line.employeeName} />
                    <div>
                      <b>{line.employeeName}</b>
                      <small>{[line.position, line.departmentName].filter(Boolean).join(" · ")}{line.employmentType === "SERVICIOS" ? " · Servicios" : ""}</small>
                    </div>
                  </div>
                </td>
                <td>{methodCell(line)}</td>
                <td className="r pl-num">{Number(line.daysPaid)}</td>
                {showColumns ? (
                  <>
                    <td className="r pl-num">{amountOrDash(line.baseSalary)}</td>
                    <td className="r pl-num">{amountOrDash(line.bonification)}</td>
                    <td className="r pl-num">{amountOrDash(line.extraPay)}</td>
                    <td className="r pl-num">{amountOrDash(line.igssEmployee)}</td>
                    <td className="r pl-num">{amountOrDash(line.isr)}</td>
                    <td className="r pl-num">{amountOrDash(line.opiDiscount)}</td>
                    <td className="r pl-num">{amountOrDash(line.otherDeductions)}</td>
                  </>
                ) : (
                  <>
                    <td className="r pl-num">{formatAmount(lineGross(line))}</td>
                    <td className="r pl-num">{amountOrDash(lineDeductions(line))}</td>
                  </>
                )}
                <td className="r pl-num pl-net">{formatAmount(line.netPay)}</td>
                <td className="r text-muted"><i className="nc-icon nc-minimal-right" aria-hidden="true" /></td>
              </tr>
            ))}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan="3">Total ({visibleLines.length}{visibleLines.length !== lines.length ? ` de ${lines.length}` : ""})</td>
                {showColumns ? (
                  <>
                    <td className="r pl-num">{formatAmount(sum(visibleLines, "baseSalary"))}</td>
                    <td className="r pl-num">{formatAmount(sum(visibleLines, "bonification"))}</td>
                    <td className="r pl-num">{formatAmount(sum(visibleLines, "extraPay"))}</td>
                    <td className="r pl-num">{formatAmount(sum(visibleLines, "igssEmployee"))}</td>
                    <td className="r pl-num">{formatAmount(sum(visibleLines, "isr"))}</td>
                    <td className="r pl-num">{formatAmount(sum(visibleLines, "opiDiscount"))}</td>
                    <td className="r pl-num">{formatAmount(sum(visibleLines, "otherDeductions"))}</td>
                  </>
                ) : (
                  <>
                    <td className="r pl-num">{formatAmount(visibleLines.reduce((total, line) => total + lineGross(line), 0))}</td>
                    <td className="r pl-num">{formatAmount(visibleLines.reduce((total, line) => total + lineDeductions(line), 0))}</td>
                  </>
                )}
                <td className="r pl-num">{formatAmount(sum(visibleLines, "netPay"))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );

  const voucher = voucherLine && (
    <SideDrawer
      isOpen
      onClose={() => setVoucherId(null)}
      title={voucherLine.employeeName}
      subtitle={`${[voucherLine.position || "Sin puesto", voucherLine.departmentName].filter(Boolean).join(" · ")} · Planilla #${selected.id}`}
      avatar={<Avatar name={voucherLine.employeeName} />}
      footer={(
        <>
          {selected.status === "BORRADOR" && canCreate && (
            <Button color="secondary" outline onClick={() => goToProfiles({ search: voucherLine.employeeName })}>Editar ficha</Button>
          )}
          <Button color="primary" onClick={() => setVoucherId(null)}>Listo</Button>
        </>
      )}
    >
      <div>
        <div className="pl-lbl">Líquido a recibir</div>
        <div className="pl-big pl-num">{q(voucherLine.netPay)}</div>
      </div>
      <div className="pl-dl pl-num">
        <div className="pl-sec">Devengado</div>
        <div><span>Sueldo ({Number(voucherLine.daysPaid)} días)</span><b>{q(voucherLine.baseSalary)}</b></div>
        <div><span>Bonificación incentivo</span><b>{q(voucherLine.bonification)}</b></div>
        {Number(voucherLine.extraPay) > 0 && <div><span>Horas extra y feriados trabajados</span><b>{q(voucherLine.extraPay)}</b></div>}
        <div className="pl-sec">Deducciones</div>
        <div><span>IGSS laboral</span><b>− {q(voucherLine.igssEmployee)}</b></div>
        <div><span>ISR</span><b>− {q(voucherLine.isr)}</b></div>
        <div>
          <span>Compras de colaborador {Number(voucherLine.opiDiscount) > 0 && <ModuleLink to="/admin/payroll/charges">ver cargos</ModuleLink>}</span>
          <b>− {q(voucherLine.opiDiscount)}</b>
        </div>
        {Number(voucherLine.otherDeductions) > 0 && <div><span>Otras deducciones</span><b>− {q(voucherLine.otherDeductions)}</b></div>}
        {Number(voucherLine.absenceDays) > 0 && (
          <div><span>Ausencia sin goce</span><b>{Number(voucherLine.absenceDays)} {Number(voucherLine.absenceDays) === 1 ? "día" : "días"} menos de sueldo</b></div>
        )}
        {Number(voucherLine.vacationDays) > 0 && (
          <div><span>Vacaciones en el período</span><b>{Number(voucherLine.vacationDays)} {Number(voucherLine.vacationDays) === 1 ? "día" : "días"} con goce</b></div>
        )}
        <div className="pl-tot"><span>Líquido</span><span>{q(voucherLine.netPay)}</span></div>
      </div>
      <div className="pl-dl">
        <div className="pl-sec">Pago</div>
        <div><span>Forma de pago</span><b>{voucherLine.paymentMethod ? (METHODS[voucherLine.paymentMethod] || {}).label || voucherLine.paymentMethod : "Sin definir"}</b></div>
        {voucherLine.paymentMethod === "CHEQUE" && <div><span>Cheque</span><b className="pl-num">{voucherLine.chequeNumber || "Sin número"}</b></div>}
        {voucherLine.paymentMethod === "TRANSFERENCIA BANCARIA" && (
          <div><span>Cuenta</span><b className="pl-num">{voucherLine.bankAccount ? maskAccount(voucherLine.bankAccount) : "Sin cuenta"}</b></div>
        )}
      </div>
    </SideDrawer>
  );

  const runDetail = selected && (
    <>
      <div className="mb-2">
        <Button color="link" className="p-0 text-muted" onClick={closeRun}>
          <i className="nc-icon nc-minimal-left mr-1" /> Volver a planillas
        </Button>
      </div>
      <div className="d-flex flex-wrap justify-content-between align-items-start mb-3" style={{ gap: 12 }}>
        <div>
          <h5 className="mb-1" style={{ fontWeight: 700 }}>
            Planilla #{selected.id} · {GROUP_LABELS[selected.payGroup] || selected.payGroup}{" "}
            <StatusPill status={selected.status} />
          </h5>
          <small className="text-muted">
            Pago {fmtLong(selected.payDate)} · período {fmtShort(selected.periodStart)} al {fmtShort(selected.periodEnd)}
            {selected.bankName ? ` · ${selected.bankName}` : ""}
          </small>
        </div>
        {selected.status === "ANULADA" ? <span className="pl-pill pl-pill--anulada">Anulada</span> : <Steps status={selected.status} />}
      </div>

      {nextStep && (
        <div className={`pl-next${nextStep.tone === "info" ? "" : ` pl-next--${nextStep.tone}`}`}>
          <div className="pl-next__ico"><i className={nextStep.icon} aria-hidden="true" /></div>
          <div className="pl-next__txt">
            <b>{nextStep.title}</b>
            <span>{nextStep.text}</span>
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

      <div className="pl-row mb-3">
        {selected.status === "BORRADOR" && canCreate && primaryKey !== "recalcular" && (
          <Button size="sm" color="secondary" className="m-0" disabled={busy || recalculating} onClick={recalc}>
            {recalculating ? <><Spinner size="sm" className="mr-1" />Recalculando…</> : "Recalcular"}
          </Button>
        )}
        {selected.status === "APROBADA" && canApprove && primaryKey !== "cheques" && (
          <Button size="sm" color="secondary" outline className="m-0" disabled={busy} onClick={openChequeForm}>
            Numerar cheques
          </Button>
        )}
        {canChangePayDate && (
          <Button size="sm" color="secondary" outline className="m-0" disabled={busy} onClick={() => setPayDate(selected.payDate)}>
            Fecha de pago
          </Button>
        )}
        {lines.length > 0 && (
          <Button size="sm" color="default" outline className="m-0" onClick={() => exportRunToExcel(selected)}>
            Excel
          </Button>
        )}
        {canPrint && printable.length > 0 && (
          <>
            <Button size="sm" color="default" outline className="m-0" onClick={() => printDocs(buildPayrollVouchersHtml)}>
              Vouchers
            </Button>
            <Button size="sm" color="default" outline className="m-0" onClick={() => printDocs(buildPayrollChequesHtml)}>
              Cheques
            </Button>
          </>
        )}
        <span className="pl-spacer" />
        {(selected.status === "BORRADOR" || selected.status === "APROBADA") && canApprove && (
          <Button size="sm" color="danger" outline className="m-0" disabled={busy} onClick={() => setAnnulReason("")}>
            Anular
          </Button>
        )}
      </div>

      {result && (
        <Alert color={result.tone} className="py-2" toggle={() => setResult(null)}>{result.text}</Alert>
      )}
      {selected.notes && <p className="small text-muted mb-2">{selected.notes}</p>}

      {checklist.length > 0 && (
        <section className="pl-card" aria-label="Revisión">
          <div className="pl-card__head">
            <h5>Antes de aprobar</h5>
            <span className="pl-sub">
              {blockers === 0 ? "Nada bloquea el siguiente paso" : blockers === 1 ? "1 pendiente bloquea" : `${blockers} pendientes bloquean`}
            </span>
          </div>
          <ul className="pl-checks mt-2">
            {checklist.map((item) => (
              <li key={`${item.kind}-${item.text}`}>
                <span className={`pl-mark pl-mark--${item.kind}`} aria-hidden="true">
                  {item.kind === "ok" ? "✓" : item.kind === "info" ? "i" : "!"}
                </span>
                <div className="pl-checks__t">
                  {item.text}
                  {item.detail && <small>{item.detail}</small>}
                </div>
                {item.action && <Button size="sm" color="secondary" outline className="m-0" onClick={item.action.onClick}>{item.action.label}</Button>}
                {item.link && <ModuleLink to={item.link.to}>{item.link.label}</ModuleLink>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {lines.length > 0 && (
        <section className="pl-card pl-summary" aria-label="Resumen">
          <div>
            <div className="pl-lbl">Líquido a pagar</div>
            <div className="pl-big pl-num">{q(selected.totalNet)}</div>
            <div className="pl-sub pl-num">Bruto {q(selected.totalGross)} − deducciones {q(selected.totalDeductions)}</div>
          </div>
          <div>
            <div className="pl-lbl">Colaboradores</div>
            <div className="pl-mid">{lines.length}</div>
            <div className="pl-sub">
              {lines.filter((line) => line.employmentType === "PLANILLA").length} de planilla ·{" "}
              {lines.filter((line) => line.employmentType === "SERVICIOS").length} de servicios
            </div>
            {hasSections && (
              <div className="pl-sub">{sectionCounts.ADMINISTRACION || 0} de administración · {sectionCounts.KIOSCOS || 0} de kioscos</div>
            )}
          </div>
          <div>
            <div className="pl-lbl">Cómo se paga</div>
            <div className="pl-bar" role="img" aria-label="Reparto del líquido por forma de pago">
              {byMethod.filter((item) => item.amount > 0).map((item) => (
                <i key={item.method} style={{ width: `${(item.amount / totalNet) * 100}%`, background: METHODS[item.method].color }} />
              ))}
            </div>
            <div className="pl-legend">
              {byMethod.map((item) => (
                <div key={item.method}>
                  <span className="pl-dot" style={{ background: METHODS[item.method].color }} />
                  {METHODS[item.method].label} · {item.count}
                  <b className="pl-num">{q(item.amount)}</b>
                </div>
              ))}
              {withoutPaymentMethod.length > 0 && (
                <div>
                  <span className="pl-dot" style={{ background: "#b03a2e" }} />
                  Sin forma de pago · {withoutPaymentMethod.length}
                  <b className="pl-num">{q(sum(withoutPaymentMethod, "netPay"))}</b>
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="pl-lbl">Cuota patronal</div>
            <div className="pl-mid pl-num">{q(sum(lines, "igssEmployer") + sum(lines, "irtra") + sum(lines, "intecap"))}</div>
            <div className="pl-sub pl-num">
              IGSS {q(sum(lines, "igssEmployer"))}<br />IRTRA {q(sum(lines, "irtra"))} · INTECAP {q(sum(lines, "intecap"))}
            </div>
          </div>
        </section>
      )}

      <section className="pl-card">
        <div className="pl-tools">
          <div className="pl-search">
            <i className="nc-icon nc-zoom-split" aria-hidden="true" />
            <Input bsSize="sm" placeholder="Buscar colaborador o puesto" aria-label="Buscar colaborador" value={lineSearch}
              onChange={(e) => setLineSearch(e.target.value)} />
          </div>
          {hasSections && (
            <div className="pl-seg" role="radiogroup" aria-label="Sección">
              {[["ALL", "Todos", lines.length], ["ADMINISTRACION", SECTIONS.ADMINISTRACION, sectionCounts.ADMINISTRACION || 0], ["KIOSCOS", SECTIONS.KIOSCOS, sectionCounts.KIOSCOS || 0]].map(([key, label, count]) => (
                <button key={key} type="button" role="radio" aria-checked={section === key} onClick={() => setSection(key)}>{label} · {count}</button>
              ))}
            </div>
          )}
          <div className="pl-chips" role="group" aria-label="Filtrar por forma de pago">
            {PAY_FILTERS.map(([key, label]) => (
              <button key={key} type="button" className="pl-chip" aria-pressed={payFilter === key} onClick={() => setPayFilter(key)}>{label}</button>
            ))}
          </div>
          <span className="pl-spacer" />
          <Button size="sm" color="secondary" outline className="m-0" aria-pressed={showColumns} onClick={() => setShowColumns(!showColumns)}>
            {showColumns ? "Ocultar" : "Ver"} columnas de detalle
          </Button>
        </div>
        {linesTable}
      </section>
      {lines.length > 0 && (
        <p className="pl-sub mb-0">Pulse una fila para ver el voucher del colaborador.</p>
      )}
      {voucher}
    </>
  );

  const selectedTab = selected && activeTab === "runs" ? "runs" : activeTab;

  return (
    <PayrollShell active={selectedTab} onSelect={selectTab}>
      <div ref={topRef} />
      {activeTab === "runs" && (selected ? runDetail : (
        <>
          {nextPayCards}
          {history}
          {calendar}
          <p className="pl-sub">
            Planta: 5 y 20 · Administración y kioscos: 15 y fin de mes · Fin de semana o feriado: día hábil anterior ·
            El borrador se prepara solo 3 días antes del pago.
          </p>
        </>
      ))}
      {visitedTabs.has("profiles") && <div hidden={activeTab !== "profiles"}><PayrollProfiles focus={profilesFocus} /></div>}
      {visitedTabs.has("parameters") && <div hidden={activeTab !== "parameters"}><PayrollParameters /></div>}

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
    </PayrollShell>
  );
}

export default PayrollRuns;
