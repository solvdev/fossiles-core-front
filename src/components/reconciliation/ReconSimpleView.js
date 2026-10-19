import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, ButtonGroup, Input, Label, Spinner, Table } from "reactstrap";
import {
  bulkReconcile, closeBatch, createBatch, downloadBatch, generateCases, getCases, getDashboard, reconcileCase, recordCaseReceipt,
} from "services/reconciliationService";
import { createClientRequestId } from "services/customerAccountService";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import { CARRIER_LABELS, RECONCILED_STATUSES, canBulkReconcile, formatQ, labelOf } from "utils/reconciliationHelper";

const PAGE_SIZE = 50;
const OPEN = "PENDIENTE_REVISION,CON_DIFERENCIAS,INFORMACION_INCOMPLETA,POSIBLE_DUPLICADO,REQUIERE_AUTORIZACION";
const SHOW = {
  pending: { label: "Por cuadrar", status: OPEN, batch: "NONE" },
  differences: { label: "Con diferencia", status: "CON_DIFERENCIAS,REQUIERE_AUTORIZACION,POSIBLE_DUPLICADO", batch: "" },
  all: { label: "Todas", status: "", batch: "" },
};

/** Lo que el usuario necesita saber de una fila, en palabras. */
export const rowResult = (r) => {
  if (r.status === "EXCLUIDO") return { tone: "muted", text: "Excluida" };
  if (r.batchCode) return { tone: "success", text: `✓ Cerrada (${r.batchCode})` };
  if (RECONCILED_STATUSES.includes(r.status)) return { tone: "success", text: "✓ Cuadra" };
  if (!r.hasReceipts) return { tone: "muted", text: "Falta registrar el pago" };
  const d = Number(r.difference);
  if (d < 0) return { tone: "danger", text: `! Faltan ${formatQ(-d)}` };
  if (d > 0) return { tone: "danger", text: `! Sobran ${formatQ(d)}` };
  if (r.status === "POSIBLE_DUPLICADO") return { tone: "danger", text: "! Posible pago duplicado" };
  if (r.status === "PENDIENTE_REVISION") return { tone: "warning", text: "Cuadra, con avisos por revisar" };
  return { tone: "danger", text: "! Revisar el detalle" };
};

const PayCell = ({ row, disabled, onSave }) => {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (amount === "" || Number(amount) <= 0) { showError("Escriba el monto recibido."); return; }
    setBusy(true);
    try { await onSave(row, Number(amount), reference.trim() || null); } finally { setBusy(false); }
  };
  const onKey = (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } };
  return (
    <div className="d-flex" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <Input bsSize="sm" type="number" step="0.01" min="0" style={{ width: 110 }} placeholder="Recibido" aria-label={`Monto recibido ${row.shipmentNumber}`}
        value={amount} disabled={disabled || busy} onChange={(e) => setAmount(e.target.value)} onKeyDown={onKey} />
      <Input bsSize="sm" style={{ width: 130 }} placeholder="Referencia" aria-label={`Referencia ${row.shipmentNumber}`}
        value={reference} disabled={disabled || busy} onChange={(e) => setReference(e.target.value)} onKeyDown={onKey} />
      <Button size="sm" color="primary" disabled={disabled || busy || amount === ""} onClick={save}>{busy ? <Spinner size="sm" /> : "Guardar"}</Button>
    </div>
  );
};

/**
 * Cuadre del día a día en tres pasos: 1) el sistema trae las ventas despachadas del período, 2) se escribe lo recibido en cada una,
 * 3) se cierra el cuadre y se descarga. Lo que no cuadra al centavo no se corrige solo: se abre el detalle para resolverlo.
 */
const ReconSimpleView = ({ filters, onFilters, version, perms, onOpen, onChanged, onRowsLoaded }) => {
  const [show, setShow] = useState("pending");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [summary, setSummary] = useState(null);
  const [ready, setReady] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState(filters.q || "");
  const [confirmClose, setConfirmClose] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState(null);
  const synced = useRef("");

  const period = { from: filters.from, to: filters.to, carrier: filters.carrier };

  // Paso 1: traer del sistema las ventas del período. Es idempotente: las que ya están no se duplican.
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const base = { ...period, q: filters.q };
    Promise.all([
      getCases({ ...base, status: SHOW[show].status, batch: SHOW[show].batch }, { page, size: PAGE_SIZE, sort: "saleDate", dir: "asc" }),
      getDashboard(period),
      getCases({ ...period, status: RECONCILED_STATUSES.join(","), batch: "NONE" }, { size: 1 }),
    ])
      .then(([list, dash, rec]) => {
        if (!alive) return;
        setRows(list.rows);
        setTotal(list.total);
        setSummary(dash);
        setReady(rec.total);
        if (onRowsLoaded) onRowsLoaded(list.rows.map((r) => r.id));
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filters.from, filters.to, filters.carrier, filters.q, show, page, version]);

  const savePayment = useCallback(async (row, amount, reference) => {
    try {
      await recordCaseReceipt(row.id, { amount, reference, receivedDate: null });
      const diff = amount - Number(row.expected);
      if (Math.abs(diff) < 0.005) showSuccess(`${row.shipmentNumber}: cuadra al centavo.`);
      else showWarning(`${row.shipmentNumber}: ${diff < 0 ? "faltan" : "sobran"} ${formatQ(Math.abs(diff))}. Queda pendiente; ábrala para resolverlo.`);
      onChanged();
    } catch (e) {
      showError(e.message);
    }
  }, [onChanged]);

  const accept = async (row) => {
    try { await reconcileCase(row.id, "Revisado en el cuadre: el monto cuadra y se aceptan los avisos"); showSuccess(`${row.shipmentNumber} cuadrada.`); onChanged(); } catch (e) { showError(e.message); }
  };

  const safe = rows.filter(canBulkReconcile);
  const acceptAll = async () => {
    try {
      const r = await bulkReconcile(safe.map((x) => x.id), "Revisado en el cuadre: el monto cuadra y se aceptan los avisos");
      showSuccess(`${r.done} ventas cuadradas.`);
      onChanged();
    } catch (e) { showError(e.message); }
  };

  // Paso 3: cerrar el cuadre con las que ya cuadran y descargar el Excel.
  const closeAndDownload = async () => {
    setClosing(true);
    try {
      const batch = await createBatch({ from: filters.from, to: filters.to, carrier: filters.carrier || "", method: "" });
      const r = await closeBatch(batch.id, `cierre-${batch.id}-${createClientRequestId()}`);
      setClosed(r);
      setConfirmClose(false);
      try { await downloadBatch(batch.id); } catch (e) { showError(`El cuadre quedó cerrado, pero la descarga falló: ${e.message}. Puede descargarlo desde Vista completa › Lotes.`); }
      onChanged();
    } catch (e) {
      showError(e.message);
    } finally {
      setClosing(false);
    }
  };

  const expected = summary ? Number(summary.expected) : 0;
  const received = summary ? Number(summary.received) : 0;
  const totalCases = summary ? Object.values(summary.byStatus || {}).reduce((a, b) => a + b, 0) : 0;
  const pendingCount = summary ? totalCases - Number(summary.reconciled || 0) - Number(summary.excluded || 0) : 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="recon-simple">
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
        {safe.length > 0 && <Button size="sm" color="success" outline disabled={!perms.reconcile} onClick={acceptAll}>Dar por cuadradas las {safe.length} que cuadran con avisos</Button>}
      </div>

      {error && <Alert color="danger">{error}</Alert>}
      <div className="table-responsive">
        <Table hover size="sm" className="recon-table">
          <thead>
            <tr><th>Fecha</th><th>ENVL</th><th className="hide-sm">Guía</th><th className="num">Cobrado</th><th>Recibido</th><th>Resultado</th></tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && <tr><td colSpan={6} className="text-center p-4"><Spinner size="sm" /> Cargando…</td></tr>}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={6}><div className="recon-empty">
                {show === "pending" && totalCases > 0
                  ? <><h5>✓ Todo cuadra en este período</h5><p>{ready > 0 ? "Cierre el cuadre para descargar el Excel." : "No queda nada por cerrar."}</p></>
                  : <><h5>No hay ventas aquí</h5><p>No hay ventas despachadas en este período o con esta búsqueda.</p></>}
              </div></td></tr>
            )}
            {rows.map((r) => {
              const res = rowResult(r);
              const editable = !r.hasReceipts && !r.batchCode && r.status !== "EXCLUIDO";
              return (
                <tr key={r.id} className="recon-row" onClick={() => onOpen(r.id)}>
                  <td>{(r.saleDate || "").slice(5)}</td>
                  <td><strong>{r.shipmentNumber}</strong><div className="small text-muted">{labelOf(CARRIER_LABELS, r.carrier)}</div></td>
                  <td className="hide-sm">{r.guideNumber || <span className="text-muted">—</span>}</td>
                  <td className="num">{formatQ(r.expected)}</td>
                  <td>{editable ? <PayCell row={r} disabled={!perms.import} onSave={savePayment} /> : formatQ(r.received)}</td>
                  <td className={`text-${res.tone}`} style={{ whiteSpace: "normal" }}>
                    {res.text}
                    {r.status === "PENDIENTE_REVISION" && Number(r.difference) === 0 && r.hasReceipts && (
                      <Button size="sm" color="link" className="py-0" disabled={!perms.reconcile} onClick={(e) => { e.stopPropagation(); accept(r); }}>Dar por cuadrada</Button>
                    )}
                  </td>
                </tr>
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
      <small className="text-muted d-block mb-3">Toque una fila para ver el detalle. Lo que no cuadra al centavo no se corrige solo.</small>

      <div className="recon-close-bar">
        {closed ? (
          <Alert color="success" className="mb-0" toggle={() => setClosed(null)}>
            Cuadre {closed.batch.code} cerrado con {closed.closedCases} ventas. {closed.alreadyClosed ? "Ya estaba cerrado; no se duplicó nada." : "Se descargó el Excel y los saldos quedaron en cero."}
          </Alert>
        ) : confirmClose ? (
          <Alert color="info" className="mb-0">
            Se cerrarán las <strong>{ready}</strong> ventas que ya cuadran{filters.carrier ? ` de ${labelOf(CARRIER_LABELS, filters.carrier)}` : ""} del {filters.from} al {filters.to}.
            Quedan bloqueadas y se descarga el Excel. Las que no cuadran siguen pendientes.
            <div className="mt-2">
              <Button size="sm" color="primary" disabled={closing} onClick={closeAndDownload}>{closing ? <Spinner size="sm" /> : "Sí, cerrar y descargar"}</Button>{" "}
              <Button size="sm" color="link" onClick={() => setConfirmClose(false)}>Cancelar</Button>
            </div>
          </Alert>
        ) : (
          <div className="d-flex flex-wrap align-items-center" style={{ gap: 12 }}>
            <Button color="primary" disabled={!perms.close || ready === 0} onClick={() => setConfirmClose(true)}>Cerrar cuadre y descargar Excel ({ready})</Button>
            <small className="text-muted">
              {ready === 0 ? "Aún no hay ventas cuadradas para cerrar." : pendingCount > 0 ? `${pendingCount} venta(s) sin cuadrar quedarán para después.` : "Todo el período cuadra."}
              {!perms.close && " Cerrar requiere el permiso de cierre."}
            </small>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReconSimpleView;
