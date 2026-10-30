import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, ButtonGroup, Input, Label, Spinner, Table } from "reactstrap";
import {
  downloadBatch, generateCases, getCase, getCases, getDashboard, excludeCase, includeCase, recordCaseReceiptsBulk, replaceCaseReceipt, settleCases, updateShippingCommission,
} from "services/reconciliationService";
import { createClientRequestId } from "services/customerAccountService";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import {
  CARRIER_LABELS, METHOD_LABELS, RECONCILED_STATUSES, canSettle, draftResult, draftsToItems, formatQ, labelOf,
} from "utils/reconciliationHelper";

const PAGE_SIZE = 50;
const ELIGIBLE_PAGE = 200;
const NOT_EXCLUDED = `${RECONCILED_STATUSES.join(",")},PENDIENTE_REVISION,CON_DIFERENCIAS,INFORMACION_INCOMPLETA,POSIBLE_DUPLICADO,REQUIERE_AUTORIZACION`;
const SHOW = {
  pending: { label: "Por liquidar", status: `${NOT_EXCLUDED},EXCLUIDO`, batch: "NONE" },
  differences: { label: "Con diferencia", status: "CON_DIFERENCIAS,REQUIERE_AUTORIZACION,POSIBLE_DUPLICADO", batch: "" },
  all: { label: "Todas", status: "", batch: "" },
};

/** Lo que el usuario necesita saber de una fila ya guardada, en palabras. */
export const rowResult = (r) => {
  if (r.status === "EXCLUIDO") return { tone: "muted", text: "Anulada" };
  if (r.batchCode) return { tone: "success", text: `✓ Liquidada (${r.batchCode})` };
  if (RECONCILED_STATUSES.includes(r.status)) return { tone: "success", text: "✓ Cuadra" };
  if (!r.hasReceipts) return { tone: "muted", text: "Falta registrar el pago" };
  const d = Number(r.difference);
  if (d < 0) return { tone: "danger", text: `! Faltan ${formatQ(-d)}` };
  if (d > 0) return { tone: "danger", text: `! Sobran ${formatQ(d)}` };
  if (r.status === "POSIBLE_DUPLICADO") return { tone: "danger", text: "! Posible pago duplicado" };
  if (r.status === "PENDIENTE_REVISION") return { tone: "success", text: `✓ Cuadra, con ${r.warningCount > 1 ? `${r.warningCount} avisos` : "avisos"}` };
  return { tone: "danger", text: "! Revisar la ficha" };
};

const stop = (e) => e.stopPropagation();

/** Monto y referencia de una venta sin pago. Lo escrito queda como borrador hasta «Guardar montos». */
const PayCell = ({ row, draft, disabled, onChange, onSave, canSave }) => {
  const amount = draft ? draft.amount : "";
  const onKey = (e) => { if (e.key === "Enter" && canSave && !disabled) { e.preventDefault(); onSave(); } };
  return (
    <div className="d-flex align-items-center" style={{ gap: 6 }} onClick={stop}>
      <Input bsSize="sm" type="number" step="0.01" min="0" style={{ width: 105 }} placeholder="Recibido" aria-label={`Monto recibido ${row.shipmentNumber}`}
        value={amount} disabled={disabled} onKeyDown={onKey} onChange={(e) => onChange({ amount: e.target.value, matchExpected: false })} />
      <Button size="sm" outline color="primary" disabled={disabled} title="Recibido = cobrado" aria-label={`Recibido igual a cobrado ${row.shipmentNumber}`}
        active={!!(draft && draft.matchExpected)} onClick={() => onChange({ amount: String(row.expected), matchExpected: true })}>=</Button>
      <Input bsSize="sm" style={{ width: 190 }} placeholder="No. Autorización/Referencia" aria-label={`No. Autorización/Referencia ${row.shipmentNumber}`}
        value={draft ? draft.reference || "" : ""} disabled={disabled} onKeyDown={onKey} onChange={(e) => onChange({ reference: e.target.value })} />
      {canSave && <Button size="sm" color="primary" disabled={disabled} aria-label={`Guardar ${row.shipmentNumber}`} onClick={onSave}>Guardar</Button>}
    </div>
  );
};

const pct = (rate) => `${(Number(rate) * 100).toLocaleString("es-GT", { maximumFractionDigits: 2 })}%`;

/** 0.035 -> "3.5". Vacío si no hay tasa. */
const percentText = (rate) => {
  if (rate == null || rate === "") return "";
  const n = Math.round(Number(rate) * 10000) / 100;
  return Number.isFinite(n) ? String(n) : "";
};

/** Lo escrito en el campo (3.5 o 3,5) a tasa decimal. null si está vacío; undefined si no es un porcentaje válido. */
const parsePercent = (text) => {
  const raw = String(text).trim().replace("%", "").replace(",", ".");
  if (raw === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return undefined;
  const n = Number(raw);
  if (!(n > 0) || n > 100) return undefined;
  return Math.round(n * 100) / 10000;
};

/** Lo que de verdad costó el envío. Se compara con el envío cobrado al cliente; es solo un registro y no cambia el cuadre. */
const RealShippingCell = ({ row, canEdit, onSave }) => {
  const saved = row.realShipping == null ? "" : String(row.realShipping);
  const [value, setValue] = useState(saved);
  useEffect(() => { setValue(saved); }, [saved]);
  const dirty = value !== saved;
  const diff = row.realShipping == null || row.chargedShipping == null ? null : Math.round((Number(row.chargedShipping) - Number(row.realShipping)) * 100) / 100;
  const submit = () => onSave(value === "" ? null : Number(value));
  return (
    <div onClick={stop} style={{ minWidth: 150 }}>
      {canEdit ? (
        <div className="d-flex align-items-center" style={{ gap: 6 }}>
          <Input bsSize="sm" type="number" step="0.01" min="0" style={{ width: 90 }} placeholder="Real" aria-label={`Envío real ${row.shipmentNumber}`}
            value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && dirty) { e.preventDefault(); submit(); } }} />
          {dirty && <Button size="sm" color="primary" aria-label={`Guardar envío real ${row.shipmentNumber}`} onClick={submit}>Guardar</Button>}
        </div>
      ) : <span>{row.realShipping == null ? "—" : formatQ(row.realShipping)}</span>}
      <div className="small text-muted">
        Cobrado {row.chargedShipping == null ? "—" : formatQ(row.chargedShipping)}
        {diff !== null && <span className={diff < 0 ? "text-danger" : "text-success"}> · {diff === 0 ? "igual" : diff > 0 ? `+${formatQ(diff)} a favor` : `-${formatQ(-diff)} en contra`}</span>}
      </div>
    </div>
  );
};

/** Comisión sobre el total con el envío cobrado. El porcentaje se escribe y queda fijo en esa venta. Forza y Guatex arrancan en 3.5% si nadie lo escribió. */
const CommissionCell = ({ row, canEdit, onSave }) => {
  const saved = percentText(row.carrierCommissionRate);
  const [value, setValue] = useState(saved);
  useEffect(() => { setValue(saved); }, [saved]);
  const written = parsePercent(value);
  const dirty = (written === undefined ? value : percentText(written)) !== saved;
  const submit = () => {
    if (written === undefined) {
      showError("Escriba un porcentaje mayor a 0 y hasta 100, con a lo más 2 decimales.");
      return;
    }
    onSave(written);
  };
  return (
    <div onClick={stop} style={{ minWidth: 120 }}>
      {canEdit ? (
        <div className="d-flex align-items-center" style={{ gap: 6 }}>
          <Input bsSize="sm" type="number" step="0.01" min="0.01" max="100" style={{ width: 78 }} placeholder="%"
            aria-label={`Porcentaje de comisión ${row.shipmentNumber}`} value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && dirty) { e.preventDefault(); submit(); } }} />
          <span className="small text-muted">%</span>
          {dirty && <Button size="sm" color="primary" aria-label={`Guardar comisión ${row.shipmentNumber}`} onClick={submit}>Guardar</Button>}
        </div>
      ) : <span>{saved === "" ? "—" : pct(row.carrierCommissionRate)}</span>}
      <div className="small text-muted">{row.carrierCommission == null ? "Escriba el porcentaje" : formatQ(row.carrierCommission)}</div>
    </div>
  );
};

/** Encabezado que ordena la lista al tocarlo. El orden lo hace el servidor, así vale para todas las páginas. */
const SortTh = ({ label, field, sort, onSort, className }) => (
  <th className={className} aria-sort={sort.key === field ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
    <button type="button" className="recon-sort" onClick={() => onSort(field)}>{label}{sort.key === field ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
  </th>
);

/** Si la venta es una devolución, su número de devolución es lo que se ve (el mismo del documento impreso). */
const ReturnTag = ({ row }) => (row.returnNumber ? <Badge color="warning" className="ml-1" title="Número de devolución">Devolución No. {row.returnNumber}</Badge> : null);

const Kv = ({ label, children }) => (
  <div className="kv"><span className="k">{label}</span><span className="v">{children}</span></div>
);

/** Venta a la vista dentro de la misma fila, sin salir de la liquidación. La ficha completa es el panel lateral. */
const RowDetail = ({ state, onFull }) => {
  if (!state || state.loading) return <div className="p-3"><Spinner size="sm" /> Cargando la venta…</div>;
  if (state.error) return <Alert color="danger" className="m-2 py-2">{state.error}</Alert>;
  const { sale, checks, row } = state.data;
  const fails = (checks || []).filter((c) => c.outcome === "FAIL");
  return (
    <div className="recon-inline p-3">
      <div className="d-flex justify-content-between align-items-start mb-2" style={{ gap: 8 }}>
        <strong>{row.shipmentNumber} · {sale ? sale.customerName : "—"}</strong><ReturnTag row={row} />
        <Button size="sm" outline color="primary" onClick={onFull}>Ficha completa</Button>
      </div>
      <div className="recon-inline-grid">
        <div>
          <Kv label="Pedido">{row.saleNumber}</Kv>
          <Kv label="Vendedor">{row.seller || "—"}</Kv>
          <Kv label="Forma de pago">{labelOf(METHOD_LABELS, row.paymentMethod)}</Kv>
          <Kv label="Referencia en la venta">{(sale && sale.paymentAuthorization) || "—"}</Kv>
          <Kv label="Dirección de envío">{(sale && sale.address) || "Sin dirección registrada"}</Kv>
          <Kv label="Despacho">{sale && sale.dispatchedAt ? String(sale.dispatchedAt).replace("T", " ").slice(0, 16) : "Sin fecha registrada"}</Kv>
          <Kv label="Factura FEL">{sale && sale.invoiceId ? "Asociada" : "No asociada"}</Kv>
        </div>
        <div>
          <Table size="sm" className="mb-1 recon-table">
            <thead><tr><th>Producto</th><th>Talla</th><th className="num">Cant.</th><th className="num">Precio</th><th className="num">Subtotal</th></tr></thead>
            <tbody>
              {((sale && sale.items) || []).map((i, k) => (
                <tr key={k}>
                  <td style={{ whiteSpace: "normal" }}>{[i.name || i.code, i.color].filter(Boolean).join(" · ") || "—"}</td>
                  <td>{i.size || "—"}</td>
                  <td className="num">{i.quantity}</td>
                  <td className="num">{formatQ(i.unitPrice)}</td>
                  <td className="num">{formatQ(i.subtotal)}</td>
                </tr>
              ))}
              {!((sale && sale.items) || []).length && <tr><td colSpan={5} className="text-muted">Sin líneas registradas</td></tr>}
            </tbody>
          </Table>
          <div className="small text-right">
            Productos {sale ? formatQ(sale.net) : "—"} + Envío {sale ? formatQ(sale.shipping) : "—"} = <strong>Total cobrado {sale ? formatQ(sale.total) : "—"}</strong>
          </div>
        </div>
      </div>
      {fails.length > 0 && (
        <div className="mt-2">
          {fails.map((c) => (
            <div key={c.code} className="small">
              <Badge color={c.severity === "CRITICAL" ? "danger" : "warning"}>{c.severity === "CRITICAL" ? "Crítico" : "Aviso"}</Badge>{" "}
              <strong>{c.name}.</strong> {c.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** Trae todas las ventas del período que ya se pueden liquidar (puede pasar de una página). */
const fetchSettleable = async (period) => {
  const rows = [];
  for (let page = 0; page < 10; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const res = await getCases({ ...period, status: `${RECONCILED_STATUSES.join(",")},PENDIENTE_REVISION`, batch: "NONE" }, { page, size: ELIGIBLE_PAGE, sort: "saleDate", dir: "asc" });
    rows.push(...res.rows);
    if (rows.length >= res.total || res.rows.length === 0) break;
  }
  return rows.filter(canSettle);
};

/**
 * Liquidación en tres momentos sobre una sola pantalla: 1) revisar las ventas del período y abrir su detalle sin salir,
 * 2) escribir lo recibido (o «=» cuando llegó completo) y guardar todo junto, 3) liquidar las ventas elegidas y descargar el Excel.
 * Lo que no cuadra al centavo no se corrige solo: se abre la ficha para resolverlo con las herramientas de siempre.
 */
const ReconSimpleView = ({ filters, onFilters, version, perms, openId, onOpen, onChanged, onRowsLoaded }) => {
  const [show, setShow] = useState("pending");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState({ key: "saleDate", dir: "asc" });
  const [summary, setSummary] = useState(null);
  const [ready, setReady] = useState([]);
  const [deselected, setDeselected] = useState(() => new Set());
  const [drafts, setDrafts] = useState({});
  const [rowErrors, setRowErrors] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());
  const [details, setDetails] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState(filters.q || "");
  const [annul, setAnnul] = useState(null);   // { id, reason }: venta que se está anulando
  const [confirmKey, setConfirmKey] = useState(null);
  const [settling, setSettling] = useState(false);
  const [done, setDone] = useState(null);
  const synced = useRef("");

  const period = { from: filters.from, to: filters.to, carrier: filters.carrier };

  // Momento 1: traer del sistema las ventas del período. Es idempotente: las que ya están no se duplican.
  useEffect(() => {
    const key = `${filters.from}|${filters.to}`;
    if (!perms.reconcile || !filters.from || !filters.to || synced.current === key) return;
    synced.current = key;
    setSyncing(true);
    generateCases(filters.from, filters.to)
      .then((r) => { if (r && r.created > 0) onChanged(); })
      .catch((e) => showError(e.message))
      .finally(() => setSyncing(false));
  }, [filters.from, filters.to, perms.reconcile]);

  useEffect(() => {
    const t = setTimeout(() => { if ((filters.q || "") !== text) { setPage(0); onFilters({ ...filters, q: text }); } }, 350);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => { setPage(0); }, [filters.from, filters.to, filters.carrier, show, sort]);
  useEffect(() => { setDeselected(new Set()); }, [filters.from, filters.to, filters.carrier]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const base = { ...period, q: filters.q };
    Promise.all([
      getCases({ ...base, status: SHOW[show].status, batch: SHOW[show].batch }, { page, size: PAGE_SIZE, sort: sort.key, dir: sort.dir }),
      getDashboard(period),
      fetchSettleable(period),
    ])
      .then(([list, dash, settleable]) => {
        if (!alive) return;
        setRows(list.rows);
        setTotal(list.total);
        setSummary(dash);
        setReady(settleable);
        if (onRowsLoaded) onRowsLoaded(list.rows.map((r) => r.id));
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filters.from, filters.to, filters.carrier, filters.q, show, page, sort, version]);

  const setDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { amount: "", matchExpected: false, reference: "", ...(d[id] || {}), ...patch } }));
  const clearDraft = (id) => setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });

  const editable = (r) => !r.hasReceipts && !r.batchCode && r.status !== "EXCLUIDO";
  const draftItems = useMemo(() => draftsToItems(drafts), [drafts]);

  // Momento 2: guardar todos los montos escritos de una vez. Lo que falla se queda en su fila con el motivo.
  // Guarda todos los borradores (onlyId vacío) o solo el de una fila. Los pagos nuevos van en bloque; los corregidos, uno por uno.
  const saveDrafts = async (onlyId) => {
    const picked = Object.entries(drafts).filter(([id]) => onlyId == null || String(onlyId) === id);
    const fresh = draftsToItems(Object.fromEntries(picked.filter(([, d]) => !d.editing)));
    const edits = draftsToItems(Object.fromEntries(picked.filter(([, d]) => d.editing)));
    if (fresh.length + edits.length === 0) return;
    setSaving(true);
    try {
      const out = [];
      if (fresh.length > 0) out.push(...(await recordCaseReceiptsBulk(fresh)).rows);
      for (const item of edits) {
        try {
          out.push(await replaceCaseReceipt(item.caseId, { amount: item.amount, matchExpected: item.matchExpected, reference: item.reference }));
        } catch (e) {
          out.push({ caseId: item.caseId, ok: false, message: e.message });
        }
      }
      const next = { ...drafts };
      const errors = { ...rowErrors };
      [...fresh, ...edits].forEach((i) => { delete errors[i.caseId]; });
      out.forEach((r) => {
        if (r.ok) delete next[r.caseId];
        else if (r.caseId != null) errors[r.caseId] = r.message;
      });
      setDrafts(next);
      setRowErrors(errors);
      const saved = out.filter((r) => r.ok).length;
      const failed = out.length - saved;
      const off = out.filter((r) => r.ok && Number(r.difference) !== 0).length;
      const what = saved === 1 ? "1 monto guardado" : `${saved} montos guardados`;
      if (failed > 0 || off > 0) {
        showWarning(`${what}${off ? ` (${off} con diferencia: queda pendiente)` : ""}.${failed ? ` ${failed} con error, revíselo en su fila.` : ""}`);
      } else {
        showSuccess(`${what}: cuadra${saved === 1 ? "" : "n"} al centavo.`);
      }
      onChanged();
    } catch (e) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Esc: si la ficha completa está abierta la cierra la página; si no, se cierra el detalle de las filas abiertas.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape" || openId != null) return;
      setExpanded((s) => (s.size > 0 ? new Set() : s));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openId]);

  // Envío real y porcentaje de comisión: se guardan al momento y la fila se actualiza sin recargar la lista.
  const canEditExtras = (r) => !r.batchCode && r.status !== "EXCLUIDO" && perms.reconcile;
  const saveExtras = async (r, patch) => {
    try {
      const saved = await updateShippingCommission(r.id, {
        realShipping: r.realShipping == null ? null : r.realShipping,
        commissionRate: r.carrierCommissionFixed || r.carrierCommissionRate == null ? null : r.carrierCommissionRate,
        ...patch,
      });
      if (saved && saved.id != null) setRows((list) => list.map((x) => (x.id === saved.id ? saved : x)));
      else onChanged();
    } catch (e) {
      showError(e.message);
    }
  };

  // Anular: la venta ya no está anulada en el sistema pero físicamente sí. Sale de la conciliación con su motivo (se puede reincorporar).
  const canAnnul = (r) => !r.batchCode && r.status !== "EXCLUIDO" && perms.reconcile;
  const confirmAnnul = async (r) => {
    try {
      await excludeCase(r.id, (annul.reason || "").trim());
      setAnnul(null);
      setRowErrors((e) => { const n = { ...e }; delete n[r.id]; return n; });
      clearDraft(r.id);
      showSuccess(`${r.shipmentNumber} quedó anulada en la conciliación.`);
      onChanged();
    } catch (e) {
      setRowErrors((errs) => ({ ...errs, [r.id]: e.message }));
    }
  };
  const reinstate = async (r) => {
    try {
      await includeCase(r.id);
      showSuccess(`${r.shipmentNumber} volvió a la conciliación.`);
      onChanged();
    } catch (e) {
      setRowErrors((errs) => ({ ...errs, [r.id]: e.message }));
    }
  };

  // Corregir un pago ya guardado: la fila vuelve a ser editable con lo que tiene, y al guardar se reemplaza.
  const canEditPayment = (r) => r.hasReceipts && !r.batchCode && r.status !== "EXCLUIDO" && perms.import && perms.reconcile;
  const startEdit = (r) => setDraft(r.id, { amount: String(r.received), matchExpected: false, reference: r.reference || "", editing: true });
  const toggleSort = (field) => setSort((s) => (s.key === field ? { key: field, dir: s.dir === "asc" ? "desc" : "asc" } : { key: field, dir: "asc" }));

  const fillAllEqual = () => {
    setDrafts((d) => {
      const next = { ...d };
      rows.filter(editable).forEach((r) => { next[r.id] = { reference: "", ...(next[r.id] || {}), amount: String(r.expected), matchExpected: true }; });
      return next;
    });
  };

  // Detalle de la venta dentro de la fila.
  const toggleRow = (id) => {
    setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    if (!details[id]) {
      setDetails((d) => ({ ...d, [id]: { loading: true } }));
      getCase(id)
        .then((data) => setDetails((d) => ({ ...d, [id]: { data } })))
        .catch((e) => setDetails((d) => ({ ...d, [id]: { error: e.message } })));
    }
  };

  // Momento 3: liquidar solo lo elegido.
  const isChecked = (r) => canSettle(r) && !deselected.has(r.id);
  const toggleCheck = (id) => setDeselected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = ready.filter((r) => !deselected.has(r.id));
  const chosenTotal = chosen.reduce((a, r) => a + Number(r.expected || 0), 0);
  const withWarnings = chosen.filter((r) => r.status === "PENDIENTE_REVISION").length;
  const allChecked = ready.length > 0 && chosen.length === ready.length;
  const toggleAll = () => setDeselected(allChecked ? new Set(ready.map((r) => r.id)) : new Set());

  const settle = async () => {
    setSettling(true);
    try {
      const r = await settleCases(chosen.map((x) => x.id), confirmKey);
      setDone(r);
      setConfirmKey(null);
      setDeselected(new Set());
      if (r.skipped && r.skipped.length > 0) {
        showWarning(`${r.skipped.length} venta(s) no se liquidaron: ${r.skipped.slice(0, 3).map((s) => `${s.shipmentNumber || s.caseId} (${s.reason})`).join("; ")}.`);
      }
      try { await downloadBatch(r.close.batch.id); } catch (e) { showError(`La liquidación quedó hecha, pero la descarga falló: ${e.message}. Puede descargarla desde Vista completa › Lotes.`); }
      onChanged();
    } catch (e) {
      showError(e.message);
    } finally {
      setSettling(false);
    }
  };

  const expected = summary ? Number(summary.expected) : 0;
  const received = summary ? Number(summary.received) : 0;
  const totalCases = summary ? Object.values(summary.byStatus || {}).reduce((a, b) => a + b, 0) : 0;
  const pendingCount = summary ? totalCases - Number(summary.reconciled || 0) - Number(summary.excluded || 0) : 0;
  const noPayment = summary ? Number(summary.incomplete || 0) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unsaved = draftItems.length;

  return (
    <div className="recon-simple">
      <div className="recon-steps mb-3" aria-label="Pasos de la liquidación">
        <div className="step"><span className="n">1</span><div><strong>Revisar</strong><div className="small text-muted">{totalCases} venta{totalCases === 1 ? "" : "s"} en el período</div></div></div>
        <div className="step"><span className="n">2</span><div><strong>Montos</strong><div className="small text-muted">{unsaved > 0 ? `${unsaved} sin guardar` : `${noPayment} sin pago registrado`}</div></div></div>
        <div className="step"><span className="n">3</span><div><strong>Liquidar</strong><div className="small text-muted">{ready.length} lista{ready.length === 1 ? "" : "s"} · {formatQ(ready.reduce((a, r) => a + Number(r.expected || 0), 0))}</div></div></div>
      </div>

      <div className="d-flex flex-wrap align-items-end mb-3" style={{ gap: 12 }}>
        <div><Label for="rs-from" className="small mb-0">Desde</Label><Input id="rs-from" type="date" bsSize="sm" value={filters.from} onChange={(e) => onFilters({ ...filters, from: e.target.value })} /></div>
        <div><Label for="rs-to" className="small mb-0">Hasta</Label><Input id="rs-to" type="date" bsSize="sm" value={filters.to} onChange={(e) => onFilters({ ...filters, to: e.target.value })} /></div>
        <div>
          <Label for="rs-carrier" className="small mb-0">Transportista</Label>
          <Input id="rs-carrier" type="select" bsSize="sm" value={filters.carrier} onChange={(e) => onFilters({ ...filters, carrier: e.target.value })}>
            <option value="">Todos</option>
            {Object.keys(CARRIER_LABELS).map((k) => <option key={k} value={k}>{CARRIER_LABELS[k]}</option>)}
          </Input>
        </div>
        <div className="flex-fill" style={{ maxWidth: 280 }}>
          <Label for="rs-q" className="small mb-0">Buscar</Label>
          <Input id="rs-q" type="search" bsSize="sm" placeholder="ENVL o guía" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {syncing && <small className="text-muted"><Spinner size="sm" /> Trayendo las ventas del sistema…</small>}
      </div>

      <div className="recon-totals mb-3">
        <div><div className="l">Cobrado según el sistema</div><div className="v">{formatQ(expected)}</div></div>
        <div><div className="l">Recibido</div><div className="v">{formatQ(received)}</div></div>
        <div><div className="l">Falta por cuadrar</div><div className={`v ${pendingCount === 0 && totalCases > 0 ? "text-success" : ""}`}>{pendingCount === 0 && totalCases > 0 ? "✓ Nada" : `${pendingCount} venta${pendingCount === 1 ? "" : "s"}`}</div></div>
      </div>

      <div className="d-flex flex-wrap justify-content-between align-items-center mb-2" style={{ gap: 8 }}>
        <ButtonGroup size="sm">
          {Object.entries(SHOW).map(([k, s]) => <Button key={k} outline={show !== k} color="primary" onClick={() => setShow(k)}>{s.label}</Button>)}
        </ButtonGroup>
        <div className="d-flex align-items-center" style={{ gap: 8 }}>
          {rows.some(editable) && <Button size="sm" outline color="primary" disabled={!perms.import || saving} onClick={fillAllEqual}>Todo lo de esta página llegó completo (=)</Button>}
          {unsaved > 0 && <Button size="sm" color="primary" disabled={!perms.import || saving} onClick={() => saveDrafts()}>{saving ? <Spinner size="sm" /> : `Guardar montos (${unsaved})`}</Button>}
        </div>
      </div>

      {error && <Alert color="danger">{error}</Alert>}
      <div className="table-responsive">
        <Table hover size="sm" className="recon-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}><Input type="checkbox" aria-label="Elegir todas las que se pueden liquidar" checked={allChecked} disabled={ready.length === 0 || !perms.close} onChange={toggleAll} /></th>
              <SortTh label="Fecha" field="saleDate" sort={sort} onSort={toggleSort} /><SortTh label="ENVL" field="shipmentNumber" sort={sort} onSort={toggleSort} /><SortTh label="Cliente" field="customerName" sort={sort} onSort={toggleSort} /><SortTh label="Guía" field="guideNumber" sort={sort} onSort={toggleSort} className="hide-sm" /><th className="num">Cobrado</th><th>Envío real</th><th>Comisión</th><th>Recibido</th><th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && <tr><td colSpan={10} className="text-center p-4"><Spinner size="sm" /> Cargando…</td></tr>}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={10}><div className="recon-empty">
                {show === "pending" && totalCases > 0
                  ? <><h5>✓ No queda nada por liquidar en este período</h5><p>Todo lo que cuadraba ya se liquidó.</p></>
                  : <><h5>No hay ventas aquí</h5><p>No hay ventas despachadas en este período o con esta búsqueda.</p></>}
              </div></td></tr>
            )}
            {rows.map((r) => {
              const draft = drafts[r.id];
              const editing = !!(draft && draft.editing);
              const live = draft && (editable(r) || editing) ? draftResult(r.expected, draft.amount) : null;
              const canSave = !!draft && draftsToItems({ [r.id]: draft }).length > 0;
              const res = live ? { tone: live.ok ? "success" : "danger", text: `${live.text} · sin guardar` } : rowResult(r);
              const open = expanded.has(r.id);
              return (
                <React.Fragment key={r.id}>
                  <tr className={`recon-row ${open ? "is-open" : ""}`} onClick={() => toggleRow(r.id)} aria-expanded={open}>
                    <td onClick={stop}>
                      {canSettle(r) && <Input type="checkbox" aria-label={`Liquidar ${r.shipmentNumber}`} checked={isChecked(r)} disabled={!perms.close} onChange={() => toggleCheck(r.id)} />}
                    </td>
                    <td>{(r.saleDate || "").slice(5)}</td>
                    <td><span className="mr-1">{open ? "▾" : "▸"}</span><strong>{r.shipmentNumber}</strong><ReturnTag row={r} />
                      <div className="small text-muted">{labelOf(CARRIER_LABELS, r.carrier)} · {labelOf(METHOD_LABELS, r.paymentMethod)}</div></td>
                    <td style={{ whiteSpace: "normal", minWidth: 120 }}>{r.customerName || <span className="text-muted">—</span>}</td>
                    <td className="hide-sm">{r.guideNumber || <span className="text-muted">—</span>}</td>
                    <td className="num">{formatQ(r.expected)}</td>
                    <td><RealShippingCell row={r} canEdit={canEditExtras(r)} onSave={(v) => saveExtras(r, { realShipping: v })} /></td>
                    <td><CommissionCell row={r} canEdit={canEditExtras(r)} onSave={(v) => saveExtras(r, { commissionRate: v })} /></td>
                    <td>
                      {editable(r) || editing
                        ? <PayCell row={r} draft={draft} disabled={!perms.import || saving} canSave={canSave} onSave={() => saveDrafts(r.id)}
                            onChange={(patch) => { setDraft(r.id, patch); setRowErrors((e) => { const n = { ...e }; delete n[r.id]; return n; }); }} />
                        : <>{formatQ(r.received)}{r.reference && <div className="small text-muted">{r.reference}</div>}</>}
                    </td>
                    <td className={`text-${res.tone}`} style={{ whiteSpace: "normal" }}>
                      {res.text}
                      {draft && (editable(r) || editing) && <Button size="sm" color="link" className="py-0" onClick={(e) => { stop(e); clearDraft(r.id); }}>{editing ? "Cancelar" : "Quitar"}</Button>}
                      {!draft && canEditPayment(r) && <Button size="sm" color="link" className="py-0" aria-label={`Editar el pago de ${r.shipmentNumber}`} onClick={(e) => { stop(e); startEdit(r); }}>Editar</Button>}
                      {r.status === "EXCLUIDO" && r.excludedReason && <div className="small text-muted">{r.excludedReason}</div>}
                      {r.status === "EXCLUIDO" && !r.batchCode && perms.reconcile && (
                        <Button size="sm" color="link" className="py-0" aria-label={`Reincorporar ${r.shipmentNumber}`} onClick={(e) => { stop(e); reinstate(r); }}>Reincorporar</Button>
                      )}
                      {canAnnul(r) && !(annul && annul.id === r.id) && (
                        <Button size="sm" color="link" className="py-0 text-danger" aria-label={`Anular ${r.shipmentNumber}`} onClick={(e) => { stop(e); setAnnul({ id: r.id, reason: "" }); }}>Anular</Button>
                      )}
                      {annul && annul.id === r.id && (
                        <div className="mt-1" onClick={stop}>
                          <Input bsSize="sm" placeholder="Motivo de la anulación (mínimo 10 letras)" aria-label={`Motivo de la anulación ${r.shipmentNumber}`}
                            value={annul.reason} onChange={(e) => setAnnul({ id: r.id, reason: e.target.value })} />
                          <Button size="sm" color="danger" className="mt-1 mr-1" disabled={annul.reason.trim().length < 10}
                            aria-label={`Confirmar anulación ${r.shipmentNumber}`} onClick={() => confirmAnnul(r)}>Anular venta</Button>
                          <Button size="sm" outline className="mt-1" onClick={() => setAnnul(null)}>Cancelar</Button>
                        </div>
                      )}
                      {rowErrors[r.id] && <div className="small text-danger">{rowErrors[r.id]}</div>}
                    </td>
                  </tr>
                  {open && (
                    <tr className="recon-detail-row"><td colSpan={10} className="p-0"><RowDetail state={details[r.id]} onFull={() => onOpen(r.id)} /></td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </div>
      {pages > 1 && (
        <div className="d-flex justify-content-between align-items-center mb-3">
          <small className="text-muted">Página {page + 1} de {pages}</small>
          <div>
            <Button size="sm" outline disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>{" "}
            <Button size="sm" outline disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
      <small className="text-muted d-block mb-3">Toque una fila para ver la venta a detalle. «=» significa que llegó exactamente lo cobrado. Lo que no cuadra al centavo no se corrige solo.</small>

      <div className="recon-close-bar">
        {done ? (
          <Alert color="success" className="mb-0" toggle={() => setDone(null)}>
            Liquidación {done.close.batch.code} lista: {done.close.closedCases} ventas
            {done.acceptedWithWarnings > 0 ? ` (${done.acceptedWithWarnings} con avisos anotados en su historial)` : ""}. {done.close.alreadyClosed ? "Ya estaba hecha; no se duplicó nada." : "Se descargó el Excel y los saldos quedaron en cero."}
          </Alert>
        ) : confirmKey ? (
          <Alert color="info" className="mb-0">
            Se liquidarán <strong>{chosen.length}</strong> ventas por <strong>{formatQ(chosenTotal)}</strong> del {filters.from} al {filters.to}
            {withWarnings > 0 ? `; ${withWarnings} llevan avisos que se aceptan y quedan anotados en su historial` : ""}.
            Quedan bloqueadas y se descarga el Excel. Lo que no está marcado sigue pendiente.
            <div className="mt-2">
              <Button size="sm" color="primary" disabled={settling} onClick={settle}>{settling ? <Spinner size="sm" /> : "Sí, liquidar y descargar"}</Button>{" "}
              <Button size="sm" color="link" disabled={settling} onClick={() => setConfirmKey(null)}>Cancelar</Button>
            </div>
          </Alert>
        ) : (
          <div className="d-flex flex-wrap align-items-center" style={{ gap: 12 }}>
            <Button color="primary" disabled={!perms.close || chosen.length === 0 || unsaved > 0} onClick={() => setConfirmKey(`liquidar-${createClientRequestId()}`)}>
              Liquidar {chosen.length} · {formatQ(chosenTotal)} y descargar Excel
            </Button>
            <small className="text-muted">
              {unsaved > 0 ? "Guarde los montos escritos antes de liquidar."
                : ready.length === 0 ? "Aún no hay ventas que cuadren para liquidar."
                  : `${ready.length - chosen.length > 0 ? `${ready.length - chosen.length} sin marcar. ` : ""}${pendingCount > ready.length ? `${pendingCount - ready.length} venta(s) por cuadrar quedarán para después.` : "Todo el período cuadra."}`}
              {!perms.close && " Liquidar requiere el permiso de cierre."}
            </small>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReconSimpleView;
