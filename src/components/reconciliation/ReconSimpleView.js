import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Badge, Button, DropdownItem, DropdownMenu, DropdownToggle, Input, Label, Spinner, Table, UncontrolledDropdown,
} from "reactstrap";
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
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Tocar uno de estos dentro de la fila no abre el detalle de la venta.
const NO_EXPAND = "button,input,select,a,label,.dropdown-menu,.recon-noexpand";

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

/** Cómo se nombra una venta en botones y avisos. Si no tiene ENVL, por su número de pedido. */
const rowName = (r) => r.shipmentNumber || (r.saleNumber ? `Pedido ${r.saleNumber}` : `Caso ${r.id}`);

/** 2026-10-05 -> "05 oct". El año completo queda en el title de la celda. */
const shortDate = (ymd) => {
  const [, month, day] = String(ymd || "").split("-");
  const label = MONTHS[Number(month) - 1];
  return label && day ? `${day} ${label}` : "—";
};

const count = (n) => Number(n || 0).toLocaleString("es-GT");
const plural = (n, word) => `${word}${Number(n) === 1 ? "" : "s"}`;

/** Monto y referencia de una venta sin pago. Lo escrito queda como borrador hasta «Guardar montos». */
const PayCell = ({ row, draft, disabled, onChange, onSave, canSave }) => {
  const name = rowName(row);
  const onKey = (e) => { if (e.key === "Enter" && canSave && !disabled) { e.preventDefault(); onSave(); } };
  return (
    <>
      <div className="recon-pay">
        <Input bsSize="sm" type="number" step="0.01" min="0" placeholder="0.00" aria-label={`Monto recibido ${name}`}
          value={draft ? draft.amount : ""} disabled={disabled} onKeyDown={onKey} onChange={(e) => onChange({ amount: e.target.value, matchExpected: false })} />
        <button type="button" className="recon-eq" disabled={disabled} title="Llegó exactamente lo cobrado" aria-label={`Recibido igual a cobrado ${name}`}
          aria-pressed={!!(draft && draft.matchExpected)} onClick={() => onChange({ amount: String(row.expected), matchExpected: true })}>=</button>
      </div>
      <Input bsSize="sm" className="recon-ghost" placeholder="+ Referencia" title="No. Autorización/Referencia" aria-label={`No. Autorización/Referencia ${name}`}
        value={draft ? draft.reference || "" : ""} disabled={disabled} onKeyDown={onKey} onChange={(e) => onChange({ reference: e.target.value })} />
    </>
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
  const name = rowName(row);
  const saved = row.realShipping == null ? "" : String(row.realShipping);
  const [value, setValue] = useState(saved);
  useEffect(() => { setValue(saved); }, [saved]);
  const dirty = value !== saved;
  const diff = row.realShipping == null || row.chargedShipping == null ? null : Math.round((Number(row.chargedShipping) - Number(row.realShipping)) * 100) / 100;
  const submit = () => onSave(value === "" ? null : Number(value));
  return (
    <>
      {canEdit ? (
        <div className="recon-soft-field">
          <Input bsSize="sm" type="number" step="0.01" min="0" className="recon-soft" placeholder="Real" aria-label={`Envío real ${name}`}
            value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && dirty) { e.preventDefault(); submit(); } }} />
          {dirty && <button type="button" className="recon-tick" title="Guardar" aria-label={`Guardar envío real ${name}`} onClick={submit}>✓</button>}
        </div>
      ) : <span>{row.realShipping == null ? "—" : formatQ(row.realShipping)}</span>}
      <div className="recon-sub">
        Cobrado {row.chargedShipping == null ? "—" : formatQ(row.chargedShipping)}
        {diff !== null && <span className={diff < 0 ? "recon-bad" : "recon-good"}> · {diff === 0 ? "igual" : diff > 0 ? `+${formatQ(diff)} a favor` : `-${formatQ(-diff)} en contra`}</span>}
      </div>
    </>
  );
};

/** Comisión sobre el total con el envío cobrado. El porcentaje se escribe y queda fijo en esa venta. Forza y Guatex arrancan en 3.5% si nadie lo escribió. */
const CommissionCell = ({ row, canEdit, onSave }) => {
  const name = rowName(row);
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
    <>
      {canEdit ? (
        <div className="recon-soft-field">
          <Input bsSize="sm" type="number" step="0.01" min="0.01" max="100" className="recon-soft recon-soft-pct" aria-label={`Porcentaje de comisión ${name}`} value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && dirty) { e.preventDefault(); submit(); } }} />
          <span className="recon-sub">%</span>
          {dirty && <button type="button" className="recon-tick" title="Guardar" aria-label={`Guardar comisión ${name}`} onClick={submit}>✓</button>}
        </div>
      ) : <span>{saved === "" ? "—" : pct(row.carrierCommissionRate)}</span>}
      <div className="recon-sub">{row.carrierCommission == null ? "Escriba el porcentaje" : formatQ(row.carrierCommission)}</div>
    </>
  );
};

/** Botón de encabezado que ordena la lista. El orden lo hace el servidor, así vale para todas las páginas. */
const SortButton = ({ label, field, sort, onSort }) => (
  <button type="button" className="recon-sort" onClick={() => onSort(field)}>{label}{sort.key === field ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button>
);

const ariaSort = (sort, ...fields) => (fields.includes(sort.key) ? (sort.dir === "asc" ? "ascending" : "descending") : "none");

/** Si la venta es una devolución, su número de devolución es lo que se ve (el mismo del documento impreso). */
const ReturnTag = ({ row }) => (row.returnNumber ? <span className="recon-tag" title="Número de devolución">Devolución No. {row.returnNumber}</span> : null);

const Kv = ({ label, children }) => (
  <div className="kv"><span className="k">{label}</span><span className="v">{children}</span></div>
);

/** Una columna del resumen: el paso, su número principal y un dato de apoyo. */
const Step = ({ n, title, value, unit, now, children }) => (
  <div className={`step ${now ? "is-now" : ""}`} aria-current={now ? "step" : undefined}>
    <span className="n">{n}</span>
    <div>
      <div className="t">{title}</div>
      <div className="v">{value} <small>{unit}</small></div>
      <div className="s">{children}</div>
    </div>
  </div>
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
        <div><strong>{rowName(row)} · {sale ? sale.customerName : "—"}</strong> <ReturnTag row={row} /></div>
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

/**
 * Copia en este navegador de lo escrito y aún sin guardar, por usuario, para no perderlo si se va la luz o se cierra la página.
 * Es solo una copia de trabajo: el pago existe hasta que se guarda en el servidor.
 */
const draftsKey = (userKey) => `recon.drafts.${userKey || "anon"}`;
const loadStoredDrafts = (userKey) => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(draftsKey(userKey)) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    return {};
  }
};
const storeDrafts = (userKey, drafts) => {
  try {
    if (Object.keys(drafts).length === 0) window.localStorage.removeItem(draftsKey(userKey));
    else window.localStorage.setItem(draftsKey(userKey), JSON.stringify(drafts));
  } catch (e) { /* sin almacenamiento disponible, solo se pierde la copia */ }
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
const ReconSimpleView = ({ userKey, filters, onFilters, version, perms, openId, onOpen, onChanged, onRowsLoaded }) => {
  const [show, setShow] = useState("pending");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState({ key: "saleDate", dir: "asc" });
  const [summary, setSummary] = useState(null);
  const [ready, setReady] = useState([]);
  const [deselected, setDeselected] = useState(() => new Set());
  const [drafts, setDrafts] = useState(() => loadStoredDrafts(userKey));
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

  // Lo escrito sobrevive a un corte de luz o de internet: se copia al navegador y se ofrece de nuevo al volver.
  useEffect(() => {
    const restored = draftItems.length;
    if (restored > 0) showWarning(`Se recuperaron ${restored} monto${restored === 1 ? "" : "s"} sin guardar de la última vez. Revíselos y guárdelos.`);
  }, []);
  useEffect(() => { storeDrafts(userKey, drafts); }, [userKey, drafts]);
  // Un borrador recuperado ya no vale si esa venta recibió su pago, se liquidó o se anuló mientras tanto.
  useEffect(() => {
    setDrafts((d) => {
      const stale = rows.filter((r) => d[r.id] && !(d[r.id].editing ? !r.batchCode && r.status !== "EXCLUIDO" : editable(r)));
      if (stale.length === 0) return d;
      const next = { ...d };
      stale.forEach((r) => { delete next[r.id]; });
      return next;
    });
  }, [rows]);

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
      showSuccess(`${rowName(r)} quedó anulada en la conciliación.`);
      onChanged();
    } catch (e) {
      setRowErrors((errs) => ({ ...errs, [r.id]: e.message }));
    }
  };
  const reinstate = async (r) => {
    try {
      await includeCase(r.id);
      showSuccess(`${rowName(r)} volvió a la conciliación.`);
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
  const differences = summary ? Number(summary.withDifferences || 0) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unsaved = draftItems.length;
  const readyTotal = ready.reduce((a, r) => a + Number(r.expected || 0), 0);
  // El paso donde queda trabajo: primero lo que falta por cuadrar y, cuando ya no queda, liquidar.
  const nowStep = totalCases === 0 ? 1 : unsaved > 0 || pendingCount > ready.length ? 2 : ready.length > 0 ? 3 : null;
  const segments = summary ? [
    { key: "ok", label: "✓ Cuadran", value: Number(summary.reconciled || 0) },
    { key: "pending", label: "Por revisar", value: Number(summary.pending || 0) },
    { key: "bad", label: "! Con diferencia", value: differences },
    { key: "void", label: "Anuladas", value: Number(summary.excluded || 0) },
    { key: "rest", label: "Sin pago", value: noPayment },
  ].filter((s) => s.value > 0) : [];
  const tabCount = (k) => {
    if (show === k && !loading) return total;
    if (k === "all") return totalCases;
    if (k === "differences") return differences;
    return null;
  };

  return (
    <div className="recon-simple">
      <div className="recon-filters mb-3">
        <div><Label for="rs-from" className="mb-0">Desde</Label><Input id="rs-from" type="date" bsSize="sm" value={filters.from} onChange={(e) => onFilters({ ...filters, from: e.target.value })} /></div>
        <div><Label for="rs-to" className="mb-0">Hasta</Label><Input id="rs-to" type="date" bsSize="sm" value={filters.to} onChange={(e) => onFilters({ ...filters, to: e.target.value })} /></div>
        <div>
          <Label for="rs-carrier" className="mb-0">Transportista</Label>
          <Input id="rs-carrier" type="select" bsSize="sm" value={filters.carrier} onChange={(e) => onFilters({ ...filters, carrier: e.target.value })}>
            <option value="">Todos</option>
            {Object.keys(CARRIER_LABELS).map((k) => <option key={k} value={k}>{CARRIER_LABELS[k]}</option>)}
          </Input>
        </div>
        <div className="grow">
          <Label for="rs-q" className="mb-0">Buscar</Label>
          <Input id="rs-q" type="search" bsSize="sm" placeholder="ENVL, guía o pedido" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {syncing && <small className="text-muted"><Spinner size="sm" /> Trayendo las ventas del sistema…</small>}
      </div>

      <section className="recon-summary mb-3" aria-label="Cuadre del período">
        <div className="recon-steps" aria-label="Pasos de la liquidación">
          <Step n={1} title="Revisar" value={count(totalCases)} unit={plural(totalCases, "venta")} now={nowStep === 1}>
            Cobrado según el sistema <b>{formatQ(expected)}</b>
          </Step>
          <Step n={2} title="Montos" value={count(noPayment)} unit="sin pago" now={nowStep === 2}>
            Recibido <b>{formatQ(received)}</b>{unsaved > 0 && <> · <b>{count(unsaved)} sin guardar</b></>}
          </Step>
          <Step n={3} title="Liquidar" value={count(ready.length)} unit={plural(ready.length, "lista")} now={nowStep === 3}>
            Por <b>{formatQ(readyTotal)}</b>
          </Step>
        </div>
        {totalCases > 0 && (
          <div className="recon-meter">
            <div className="recon-bar" role="img" aria-label={`De ${count(totalCases)} ventas: ${segments.map((s) => `${s.label.replace(/^[✓!] /, "")} ${count(s.value)}`).join(", ")}`}>
              {segments.map((s) => <i key={s.key} className={s.key} style={{ flex: `${s.value} 1 0` }} title={`${s.label}: ${count(s.value)}`} />)}
            </div>
            <div className="recon-legend">
              {segments.map((s) => <span key={s.key}><b className={s.key} />{s.label} <strong>{count(s.value)}</strong></span>)}
              <span className="end">Falta por cuadrar <strong className={pendingCount === 0 ? "recon-good" : ""}>{pendingCount === 0 ? "✓ Nada" : `${count(pendingCount)} ${plural(pendingCount, "venta")}`}</strong></span>
            </div>
          </div>
        )}
      </section>

      <div className="d-flex flex-wrap justify-content-between align-items-center mb-2" style={{ gap: 8 }}>
        <div className="recon-seg" role="tablist" aria-label="Qué ventas ver">
          {Object.entries(SHOW).map(([k, s]) => {
            const c = tabCount(k);
            return (
              <button key={k} type="button" role="tab" aria-selected={show === k} className={show === k ? "is-on" : ""} onClick={() => setShow(k)}>
                {s.label}{c != null && <span className={`c ${k === "differences" && c > 0 ? "bad" : ""}`}>{count(c)}</span>}
              </button>
            );
          })}
        </div>
        {rows.some(editable) && <Button size="sm" outline color="primary" disabled={!perms.import || saving} onClick={fillAllEqual}>Esta página llegó completa (=)</Button>}
      </div>

      {error && <Alert color="danger">{error}</Alert>}
      <div className="recon-table-wrap">
        <Table className="recon-table recon-liq mb-0">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: 30 }}><Input type="checkbox" className="recon-check" aria-label="Elegir todas las que se pueden liquidar" checked={allChecked} disabled={ready.length === 0 || !perms.close} onChange={toggleAll} /></th>
              <th rowSpan={2} style={{ width: 62 }} aria-sort={ariaSort(sort, "saleDate")}><SortButton label="Fecha" field="saleDate" sort={sort} onSort={toggleSort} /></th>
              <th rowSpan={2} style={{ width: 150 }} aria-sort={ariaSort(sort, "shipmentNumber", "guideNumber")}><SortButton label="ENVL" field="shipmentNumber" sort={sort} onSort={toggleSort} /> · <SortButton label="Guía" field="guideNumber" sort={sort} onSort={toggleSort} /></th>
              <th rowSpan={2} aria-sort={ariaSort(sort, "customerName")}><SortButton label="Cliente" field="customerName" sort={sort} onSort={toggleSort} /></th>
              <th rowSpan={2} className="num" style={{ width: 88 }}>Cobrado</th>
              <th rowSpan={2} style={{ width: 136 }}>Recibido</th>
              <th rowSpan={2} style={{ width: 128 }}>Resultado</th>
              <th colSpan={2} className="reg group">Solo registro, no cambia el cuadre</th>
              <th rowSpan={2} style={{ width: 36 }}><span className="sr-only">Más acciones</span></th>
            </tr>
            <tr>
              <th className="reg" style={{ width: 120 }}>Envío real</th>
              <th className="reg" style={{ width: 100 }}>Comisión</th>
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
              const name = rowName(r);
              const draft = drafts[r.id];
              const editing = !!(draft && draft.editing);
              const paying = editable(r) || editing;
              const live = draft && paying ? draftResult(r.expected, draft.amount) : null;
              const canSave = !!draft && draftsToItems({ [r.id]: draft }).length > 0;
              const res = live ? { tone: live.ok ? "success" : "danger", text: live.text, note: " · sin guardar" } : rowResult(r);
              const open = expanded.has(r.id);
              const annulling = !!(annul && annul.id === r.id);
              const rowClass = ["recon-row", open && "is-open", draft && paying && "is-draft", !(draft && paying) && res.tone === "danger" && "is-bad", r.status === "EXCLUIDO" && "is-void"].filter(Boolean).join(" ");
              return (
                <React.Fragment key={r.id}>
                  <tr className={rowClass} onClick={(e) => { if (!e.target.closest(NO_EXPAND)) toggleRow(r.id); }} aria-expanded={open}>
                    <td className="recon-noexpand">
                      {canSettle(r) && <Input type="checkbox" className="recon-check" aria-label={`Liquidar ${name}`} checked={isChecked(r)} disabled={!perms.close} onChange={() => toggleCheck(r.id)} />}
                    </td>
                    <td className="recon-date" title={r.saleDate || undefined}>{shortDate(r.saleDate)}</td>
                    <td>
                      <div className="recon-envl">
                        <button type="button" className="recon-caret" aria-expanded={open} aria-label={`Ver detalle de ${name}`} onClick={() => toggleRow(r.id)}>{open ? "▾" : "▸"}</button>
                        {r.shipmentNumber ? <strong>{r.shipmentNumber}</strong> : <><span className="recon-tag">Sin ENVL</span> <strong className="font-weight-bold">{name}</strong></>}
                      </div>
                      <div className="recon-sub pl">{labelOf(CARRIER_LABELS, r.carrier)}</div>
                      {r.guideNumber && <div className="recon-sub pl">Guía {r.guideNumber}</div>}
                      {r.returnNumber && <div className="pl"><ReturnTag row={r} /></div>}
                    </td>
                    <td className="recon-client">
                      {r.customerName || <span className="text-muted">—</span>}
                      <div className="recon-sub">{labelOf(METHOD_LABELS, r.paymentMethod)}</div>
                    </td>
                    <td className="num recon-money">{formatQ(r.expected)}</td>
                    <td className="recon-noexpand">
                      {paying
                        ? <PayCell row={r} draft={draft} disabled={!perms.import || saving} canSave={canSave} onSave={() => saveDrafts(r.id)}
                            onChange={(patch) => { setDraft(r.id, patch); setRowErrors((e) => { const n = { ...e }; delete n[r.id]; return n; }); }} />
                        : <>
                            <div className="recon-paid">
                              {r.status === "EXCLUIDO" && !r.hasReceipts ? "—" : formatQ(r.received)}
                              {canEditPayment(r) && <Button size="sm" color="link" className="py-0" aria-label={`Editar el pago de ${name}`} onClick={() => startEdit(r)}>Editar</Button>}
                            </div>
                            {r.reference && <div className="recon-sub">{r.reference}</div>}
                          </>}
                    </td>
                    <td className="recon-result">
                      {res.tone === "muted"
                        ? <span className="recon-quiet">{res.text}</span>
                        : <span className={`recon-pill ${res.tone}`}>{res.text}{res.note && <span className="ns">{res.note}</span>}</span>}
                      {draft && paying && (
                        <div className="recon-rowact">
                          {canSave && <Button size="sm" color="primary" disabled={!perms.import || saving} aria-label={`Guardar ${name}`} onClick={() => saveDrafts(r.id)}>Guardar</Button>}
                          <Button size="sm" color="link" className="py-0" onClick={() => clearDraft(r.id)}>{editing ? "Cancelar" : "Quitar"}</Button>
                        </div>
                      )}
                      {r.status === "EXCLUIDO" && r.excludedReason && <div className="recon-sub">{r.excludedReason}</div>}
                      {r.status === "EXCLUIDO" && !r.batchCode && perms.reconcile && (
                        <Button size="sm" color="link" className="py-0 px-0" aria-label={`Reincorporar ${name}`} onClick={() => reinstate(r)}>Reincorporar</Button>
                      )}
                      {rowErrors[r.id] && <div className="recon-sub recon-bad">{rowErrors[r.id]}</div>}
                    </td>
                    <td className="reg recon-noexpand"><RealShippingCell row={r} canEdit={canEditExtras(r)} onSave={(v) => saveExtras(r, { realShipping: v })} /></td>
                    <td className="reg recon-noexpand"><CommissionCell row={r} canEdit={canEditExtras(r)} onSave={(v) => saveExtras(r, { commissionRate: v })} /></td>
                    <td className="recon-noexpand recon-more-cell">
                      <UncontrolledDropdown>
                        <DropdownToggle tag="button" type="button" className="recon-more" aria-label={`Más acciones de ${name}`}>⋯</DropdownToggle>
                        <DropdownMenu right container="body" className="recon-row-menu">
                          <DropdownItem onClick={() => onOpen(r.id)}>Ver ficha completa</DropdownItem>
                          {canAnnul(r) && !annulling && <DropdownItem divider />}
                          {canAnnul(r) && !annulling && (
                            <DropdownItem className="is-danger" aria-label={`Anular ${name}`} onClick={() => setAnnul({ id: r.id, reason: "" })}>Anular venta…</DropdownItem>
                          )}
                        </DropdownMenu>
                      </UncontrolledDropdown>
                    </td>
                  </tr>
                  {annulling && (
                    <tr className="recon-annul-row"><td colSpan={10}>
                      <div className="recon-annul">
                        <strong>Anular {name}</strong>
                        <Input bsSize="sm" placeholder="Motivo de la anulación (mínimo 10 letras)" aria-label={`Motivo de la anulación ${name}`}
                          value={annul.reason} onChange={(e) => setAnnul({ id: r.id, reason: e.target.value })} />
                        <Button size="sm" color="danger" disabled={annul.reason.trim().length < 10} aria-label={`Confirmar anulación ${name}`} onClick={() => confirmAnnul(r)}>Anular venta</Button>
                        <Button size="sm" color="link" onClick={() => setAnnul(null)}>Cancelar</Button>
                      </div>
                    </td></tr>
                  )}
                  {open && (
                    <tr className="recon-detail-row"><td colSpan={10} className="p-0"><RowDetail state={details[r.id]} onFull={() => onOpen(r.id)} /></td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </Table>
      </div>

      <div className="recon-pager">
        <small className="text-muted">
          {total > 0 && <>{count(page * PAGE_SIZE + 1)} a {count(Math.min((page + 1) * PAGE_SIZE, total))} de {count(total)} · </>}
          Toque una fila para ver la venta. «=» significa que llegó exactamente lo cobrado. Lo que no cuadra al centavo no se corrige solo.
        </small>
        {pages > 1 && (
          <div className="d-flex" style={{ gap: 6 }}>
            <Button size="sm" outline disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <Button size="sm" outline disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </div>
        )}
      </div>

      {done ? (
        <div className="recon-dock is-done">
          <span>
            Liquidación {done.close.batch.code} lista: {done.close.closedCases} ventas
            {done.acceptedWithWarnings > 0 ? ` (${done.acceptedWithWarnings} con avisos anotados en su historial)` : ""}. {done.close.alreadyClosed ? "Ya estaba hecha; no se duplicó nada." : "Se descargó el Excel y los saldos quedaron en cero."}
          </span>
          <Button size="sm" color="link" onClick={() => setDone(null)}>Cerrar</Button>
        </div>
      ) : confirmKey ? (
        <div className="recon-dock is-confirm">
          <span>
            Se liquidarán <strong>{chosen.length}</strong> ventas por <strong>{formatQ(chosenTotal)}</strong> del {filters.from} al {filters.to}
            {withWarnings > 0 ? `; ${withWarnings} llevan avisos que se aceptan y quedan anotados en su historial` : ""}.
            {" "}Quedan bloqueadas y se descarga el Excel. Lo que no está marcado sigue pendiente.
          </span>
          <div className="group">
            <Button size="sm" color="link" disabled={settling} onClick={() => setConfirmKey(null)}>Cancelar</Button>
            <Button color="primary" disabled={settling} onClick={settle}>{settling ? <Spinner size="sm" /> : "Sí, liquidar y descargar"}</Button>
          </div>
        </div>
      ) : (
        <div className="recon-dock">
          <div className="group">
            {unsaved > 0 ? (
              <>
                <Button color="primary" disabled={!perms.import || saving} onClick={() => saveDrafts()}>{saving ? <Spinner size="sm" /> : `Guardar montos (${unsaved})`}</Button>
                <Button size="sm" color="link" disabled={saving} onClick={() => { setDrafts({}); setRowErrors({}); }}>Descartar</Button>
              </>
            ) : <small className="text-muted">Sin montos por guardar.</small>}
          </div>
          <div className="group">
            <small className="text-muted">
              {unsaved > 0 ? "Guarde los montos escritos antes de liquidar."
                : ready.length === 0 ? "Aún no hay ventas que cuadren para liquidar."
                  : `${ready.length - chosen.length > 0 ? `${ready.length - chosen.length} sin marcar. ` : ""}${pendingCount > ready.length ? `${pendingCount - ready.length} venta(s) por cuadrar quedarán para después.` : "Todo el período cuadra."}`}
              {!perms.close && " Liquidar requiere el permiso de cierre."}
            </small>
            <Button color="primary" outline={unsaved > 0} disabled={!perms.close || chosen.length === 0 || unsaved > 0} onClick={() => setConfirmKey(`liquidar-${createClientRequestId()}`)}>
              Liquidar {chosen.length} · {formatQ(chosenTotal)} y descargar Excel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReconSimpleView;
