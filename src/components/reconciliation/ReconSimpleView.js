import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Badge, Button, ButtonGroup, Input, Label, Spinner, Table } from "reactstrap";
import {
  downloadBatch, generateCases, getCase, getCases, getDashboard, recordCaseReceiptsBulk, settleCases,
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
  pending: { label: "Por liquidar", status: NOT_EXCLUDED, batch: "NONE" },
  differences: { label: "Con diferencia", status: "CON_DIFERENCIAS,REQUIERE_AUTORIZACION,POSIBLE_DUPLICADO", batch: "" },
  all: { label: "Todas", status: "", batch: "" },
};

/** Lo que el usuario necesita saber de una fila ya guardada, en palabras. */
export const rowResult = (r) => {
  if (r.status === "EXCLUIDO") return { tone: "muted", text: "Excluida" };
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
const PayCell = ({ row, draft, disabled, onChange }) => {
  const amount = draft ? draft.amount : "";
  return (
    <div className="d-flex align-items-center" style={{ gap: 6 }} onClick={stop}>
      <Input bsSize="sm" type="number" step="0.01" min="0" style={{ width: 105 }} placeholder="Recibido" aria-label={`Monto recibido ${row.shipmentNumber}`}
        value={amount} disabled={disabled} onChange={(e) => onChange({ amount: e.target.value, matchExpected: false })} />
      <Button size="sm" outline color="primary" disabled={disabled} title="Recibido = cobrado" aria-label={`Recibido igual a cobrado ${row.shipmentNumber}`}
        active={!!(draft && draft.matchExpected)} onClick={() => onChange({ amount: String(row.expected), matchExpected: true })}>=</Button>
      <Input bsSize="sm" style={{ width: 120 }} placeholder="Referencia" aria-label={`Referencia ${row.shipmentNumber}`}
        value={draft ? draft.reference || "" : ""} disabled={disabled} onChange={(e) => onChange({ reference: e.target.value })} />
    </div>
  );
};

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
        <strong>{row.shipmentNumber} · {sale ? sale.customerName : "—"}</strong>
        <Button size="sm" outline color="primary" onClick={onFull}>Ficha completa</Button>
      </div>
      <div className="recon-inline-grid">
        <div>
          <Kv label="Pedido">{row.saleNumber}</Kv>
          <Kv label="Vendedor">{row.seller || "—"}</Kv>
          <Kv label="Forma de pago">{labelOf(METHOD_LABELS, row.paymentMethod)}</Kv>
          <Kv label="Referencia en la venta">{(sale && sale.paymentAuthorization) || "—"}</Kv>
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
const ReconSimpleView = ({ filters, onFilters, version, perms, onOpen, onChanged, onRowsLoaded }) => {
  const [show, setShow] = useState("pending");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
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
  useEffect(() => { setPage(0); }, [filters.from, filters.to, filters.carrier, show]);
  useEffect(() => { setDeselected(new Set()); }, [filters.from, filters.to, filters.carrier]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const base = { ...period, q: filters.q };
    Promise.all([
      getCases({ ...base, status: SHOW[show].status, batch: SHOW[show].batch }, { page, size: PAGE_SIZE, sort: "saleDate", dir: "asc" }),
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
  }, [filters.from, filters.to, filters.carrier, filters.q, show, page, version]);

  const setDraft = (id, patch) => setDrafts((d) => ({ ...d, [id]: { amount: "", matchExpected: false, reference: "", ...(d[id] || {}), ...patch } }));
  const clearDraft = (id) => setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });

  const editable = (r) => !r.hasReceipts && !r.batchCode && r.status !== "EXCLUIDO";
  const draftItems = useMemo(() => draftsToItems(drafts), [drafts]);

  // Momento 2: guardar todos los montos escritos de una vez. Lo que falla se queda en su fila con el motivo.
  const saveDrafts = async () => {
    setSaving(true);
    try {
      const res = await recordCaseReceiptsBulk(draftItems);
      const errors = {};
      const next = { ...drafts };
      res.rows.forEach((r) => {
        if (r.ok) delete next[r.caseId];
        else if (r.caseId != null) errors[r.caseId] = r.message;
      });
      setDrafts(next);
      setRowErrors(errors);
      const exact = res.rows.filter((r) => r.ok && Number(r.difference) === 0).length;
      const off = res.rows.filter((r) => r.ok && Number(r.difference) !== 0).length;
      if (res.failed > 0 || off > 0) {
        showWarning(`${res.saved} guardados (${exact} cuadran${off ? `, ${off} con diferencia: quedan pendientes` : ""}).${res.failed ? ` ${res.failed} con error, revíselos en su fila.` : ""}`);
      } else {
        showSuccess(`${res.saved} montos guardados: todos cuadran al centavo.`);
      }
      onChanged();
    } catch (e) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

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
          {unsaved > 0 && <Button size="sm" color="primary" disabled={!perms.import || saving} onClick={saveDrafts}>{saving ? <Spinner size="sm" /> : `Guardar montos (${unsaved})`}</Button>}
        </div>
      </div>

      {error && <Alert color="danger">{error}</Alert>}
      <div className="table-responsive">
        <Table hover size="sm" className="recon-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}><Input type="checkbox" aria-label="Elegir todas las que se pueden liquidar" checked={allChecked} disabled={ready.length === 0 || !perms.close} onChange={toggleAll} /></th>
              <th>Fecha</th><th>ENVL</th><th>Cliente</th><th className="hide-sm">Guía</th><th className="num">Cobrado</th><th>Recibido</th><th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && <tr><td colSpan={8} className="text-center p-4"><Spinner size="sm" /> Cargando…</td></tr>}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={8}><div className="recon-empty">
                {show === "pending" && totalCases > 0
                  ? <><h5>✓ No queda nada por liquidar en este período</h5><p>Todo lo que cuadraba ya se liquidó.</p></>
                  : <><h5>No hay ventas aquí</h5><p>No hay ventas despachadas en este período o con esta búsqueda.</p></>}
              </div></td></tr>
            )}
            {rows.map((r) => {
              const draft = drafts[r.id];
              const live = draft && editable(r) ? draftResult(r.expected, draft.amount) : null;
              const res = live ? { tone: live.ok ? "success" : "danger", text: `${live.text} · sin guardar` } : rowResult(r);
              const open = expanded.has(r.id);
              return (
                <React.Fragment key={r.id}>
                  <tr className={`recon-row ${open ? "is-open" : ""}`} onClick={() => toggleRow(r.id)} aria-expanded={open}>
                    <td onClick={stop}>
                      {canSettle(r) && <Input type="checkbox" aria-label={`Liquidar ${r.shipmentNumber}`} checked={isChecked(r)} disabled={!perms.close} onChange={() => toggleCheck(r.id)} />}
                    </td>
                    <td>{(r.saleDate || "").slice(5)}</td>
                    <td><span className="mr-1">{open ? "▾" : "▸"}</span><strong>{r.shipmentNumber}</strong>
                      <div className="small text-muted">{labelOf(CARRIER_LABELS, r.carrier)} · {labelOf(METHOD_LABELS, r.paymentMethod)}</div></td>
                    <td style={{ whiteSpace: "normal", minWidth: 120 }}>{r.customerName || <span className="text-muted">—</span>}</td>
                    <td className="hide-sm">{r.guideNumber || <span className="text-muted">—</span>}</td>
                    <td className="num">{formatQ(r.expected)}</td>
                    <td>
                      {editable(r)
                        ? <PayCell row={r} draft={draft} disabled={!perms.import || saving} onChange={(patch) => { setDraft(r.id, patch); setRowErrors((e) => { const n = { ...e }; delete n[r.id]; return n; }); }} />
                        : <>{formatQ(r.received)}{r.reference && <div className="small text-muted">{r.reference}</div>}</>}
                    </td>
                    <td className={`text-${res.tone}`} style={{ whiteSpace: "normal" }}>
                      {res.text}
                      {draft && editable(r) && <Button size="sm" color="link" className="py-0" onClick={(e) => { stop(e); clearDraft(r.id); }}>Quitar</Button>}
                      {rowErrors[r.id] && <div className="small text-danger">{rowErrors[r.id]}</div>}
                    </td>
                  </tr>
                  {open && (
                    <tr className="recon-detail-row"><td colSpan={8} className="p-0"><RowDetail state={details[r.id]} onFull={() => onOpen(r.id)} /></td></tr>
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
