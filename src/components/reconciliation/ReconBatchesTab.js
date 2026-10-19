import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, Input, Spinner, Table } from "reactstrap";
import {
  closeBatch, createBatch, downloadBatch, getBatches, getCases, getExports, voidBatch,
} from "services/reconciliationService";
import { createClientRequestId } from "services/customerAccountService";
import { showError, showSuccess } from "utils/notificationHelper";
import { CARRIER_LABELS, METHOD_LABELS, formatQ } from "utils/reconciliationHelper";

const statusBadge = (s) => (s === "CLOSED" ? <Badge color="success">Cerrado</Badge> : s === "VOID" ? <Badge color="secondary">Anulado</Badge> : <Badge color="warning">Abierto</Badge>);
const when = (iso) => (iso ? String(iso).replace("T", " ").slice(0, 16) : "—");

/** Lotes y descargas: crear, revisar, cerrar (registra la descarga), anular y descargar el Excel. */
const ReconBatchesTab = ({ filters, version, perms, onChanged, onGoInbox }) => {
  const [batches, setBatches] = useState([]);
  const [exportsList, setExportsList] = useState([]);
  const [available, setAvailable] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ from: filters.from, to: filters.to, carrier: "", method: "" });
  const [closing, setClosing] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [b, e, a] = await Promise.all([
        getBatches(), getExports(),
        getCases({ ...filters, status: "CONCILIADO_AUTO,CONCILIADO_MANUAL,CONCILIADO_CON_AJUSTE", batch: "NONE", q: "" }, { size: 1 }),
      ]);
      setBatches(b);
      setExportsList(e);
      setAvailable(a.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load, version]);
  useEffect(() => { setForm((f) => ({ ...f, from: filters.from, to: filters.to })); }, [filters.from, filters.to]);

  const act = async (fn, okText) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fn();
      if (okText) showSuccess(typeof okText === "function" ? okText(r) : okText);
      await load();
      onChanged();
      return r;
    } catch (e) {
      setMessage({ color: "danger", text: e.message });
      showError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const doClose = async (b) => {
    const r = await act(() => closeBatch(b.id, `cierre-${b.id}-${createClientRequestId()}`), null);
    if (r) {
      setMessage({ color: r.alreadyClosed ? "info" : "success", text: r.alreadyClosed
        ? `El lote ${r.batch.code} ya estaba cerrado. Se devolvió el mismo cierre, sin duplicar nada.`
        : `Lote ${r.batch.code} cerrado. Casos exportados: ${r.exportedCases} = casos cerrados: ${r.closedCases}. La descarga quedó registrada en el libro. Huella ${String(r.contentSha256).slice(0, 12)}…` });
      setClosing(null);
    }
  };

  const doVoid = async (b) => {
    const r = await act(() => voidBatch(b.id, reason), "Lote anulado. La descarga se revirtió con movimientos nuevos.");
    if (r) { setVoiding(null); setReason(""); }
  };

  const doDownload = (b) => act(() => downloadBatch(b.id), (r) => `Descargado ${r.filename}`);

  if (loading && batches.length === 0) return <div className="text-center p-4"><Spinner /></div>;

  return (
    <>
      <p className="text-muted">La <strong>descarga</strong> deja en cero lo que se debía cobrar. Un lote agrupa casos ya conciliados; al cerrarlo se congelan, se registra la descarga en el libro (un movimiento por caso) y se genera el Excel. Cerrar dos veces no duplica nada.</p>
      {error && <Alert color="danger">{error}</Alert>}
      {message && <Alert color={message.color} toggle={() => setMessage(null)}>{message.text}</Alert>}
      <Card className="mb-3">
        <CardBody>
          <div className="d-flex flex-wrap align-items-end" style={{ gap: 12 }}>
            <div><strong>{available}</strong> casos conciliados sin lote en el filtro actual</div>
            <div><label htmlFor="b-from" className="small text-muted mb-0 d-block">Desde</label><Input id="b-from" type="date" bsSize="sm" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></div>
            <div><label htmlFor="b-to" className="small text-muted mb-0 d-block">Hasta</label><Input id="b-to" type="date" bsSize="sm" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></div>
            <div><label htmlFor="b-carrier" className="small text-muted mb-0 d-block">Transportista</label>
              <Input id="b-carrier" type="select" bsSize="sm" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })}><option value="">Todos</option>{Object.keys(CARRIER_LABELS).map((k) => <option key={k} value={k}>{CARRIER_LABELS[k]}</option>)}</Input></div>
            <div><label htmlFor="b-method" className="small text-muted mb-0 d-block">Método</label>
              <Input id="b-method" type="select" bsSize="sm" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}><option value="">Todos</option>{Object.keys(METHOD_LABELS).map((k) => <option key={k} value={k}>{METHOD_LABELS[k]}</option>)}</Input></div>
            <Button color="primary" size="sm" disabled={!perms.close || busy || !form.from || !form.to} onClick={() => act(() => createBatch(form), (r) => `Lote ${r.code} creado con ${r.cases} casos. Revíselo y ciérrelo.`)}>Crear lote con los conciliados</Button>
          </div>
          {!perms.close && <small className="text-muted">Crear y cerrar lotes requiere el permiso de cierre (Administración o Contabilidad).</small>}
        </CardBody>
      </Card>

      {batches.length === 0 ? (
        <div className="recon-empty"><h5>No hay lotes</h5><p>Concilie casos en la bandeja y cree un lote con ellos.</p></div>
      ) : (
        <div className="table-responsive">
          <Table size="sm" className="recon-table">
            <thead><tr><th>Lote</th><th>Período</th><th className="num">Casos</th><th className="num">Esperado</th><th className="num">Recibido</th><th className="num">Ajustes</th><th className="num">Pendiente</th><th>Estado</th><th>Cierre</th><th /></tr></thead>
            <tbody>
              {batches.map((b) => (
                <React.Fragment key={b.id}>
                  <tr>
                    <td><strong>{b.code}</strong></td><td>{b.periodFrom} → {b.periodTo}</td><td className="num">{b.cases}</td>
                    <td className="num">{formatQ(b.expected)}</td><td className="num">{formatQ(b.received)}</td><td className="num">{formatQ(b.adjusted)}</td><td className="num">{formatQ(b.pending)}</td>
                    <td>{statusBadge(b.status)}</td><td>{b.status === "CLOSED" ? `${b.closedByName || (b.closedBy ? `usuario ${b.closedBy}` : "—")} · ${when(b.closedAt)}` : "—"}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <Button size="sm" color="link" onClick={() => onGoInbox({ batch: String(b.id), status: "" })}>Ver casos</Button>
                      {b.status === "OPEN" && <Button size="sm" color="primary" disabled={!perms.close || busy} onClick={() => { setClosing(b.id); setVoiding(null); }}>Revisar y cerrar</Button>}
                      {b.status !== "VOID" && <Button size="sm" outline disabled={busy} onClick={() => doDownload(b)}>Descargar Excel</Button>}
                      {b.status !== "VOID" && <Button size="sm" color="link" className="text-danger" disabled={!perms.authorize || busy} onClick={() => { setVoiding(b.id); setClosing(null); setReason(""); }}>Anular</Button>}
                    </td>
                  </tr>
                  {closing === b.id && (
                    <tr><td colSpan={10}>
                      <Alert color="info" className="mb-0">
                        Se cerrarán <strong>{b.cases}</strong> casos: cobrado {formatQ(b.expected)}, recibido {formatQ(b.received)}, ajustes autorizados {formatQ(b.adjusted)}, saldo {formatQ(b.pending)}.
                        Es irreversible para estos casos: quedan bloqueados, el archivo se congela y la descarga se registra en el libro. Solo se corrige anulando el lote completo, con motivo.
                        <div className="mt-2"><Button size="sm" color="primary" disabled={busy} onClick={() => doClose(b)}>Confirmar descarga y cerrar lote</Button>{" "}<Button size="sm" color="link" onClick={() => setClosing(null)}>Cancelar</Button></div>
                      </Alert>
                    </td></tr>
                  )}
                  {voiding === b.id && (
                    <tr><td colSpan={10}>
                      <Alert color="warning" className="mb-0">
                        Anular el lote {b.status === "CLOSED" ? "revierte la descarga con movimientos nuevos (nada se borra) y" : ""} devuelve sus casos a la bandeja.
                        <Input type="textarea" rows={2} className="mt-2" placeholder="Motivo (mínimo 10 caracteres)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo de la anulación del lote" />
                        <div className="mt-2"><Button size="sm" color="danger" disabled={busy || reason.trim().length < 10} onClick={() => doVoid(b)}>Anular lote</Button>{" "}<Button size="sm" color="link" onClick={() => setVoiding(null)}>Cancelar</Button></div>
                      </Alert>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <h6 className="mt-4">Historial de descargas</h6>
      {exportsList.length === 0 ? <p className="text-muted">Aún no hay descargas.</p> : (
        <div className="table-responsive">
          <Table size="sm" className="recon-table">
            <thead><tr><th>Lote</th><th>Fecha</th><th>Usuario</th><th className="num">Filas</th><th>Huella SHA-256</th><th>Tipo</th></tr></thead>
            <tbody>{exportsList.map((x) => <tr key={x.id}><td>{x.batchCode}</td><td>{when(x.createdAt)}</td><td>{x.createdByName || x.createdBy || "—"}</td><td className="num">{x.rows}</td><td><code>{String(x.sha256).slice(0, 16)}…</code></td><td>{x.kind === "CIERRE" ? "Cierre" : "Nueva descarga del mismo contenido"}</td></tr>)}</tbody>
          </Table>
        </div>
      )}
      <p className="text-muted small">Las descargas repetidas entregan las mismas filas congeladas (misma huella). El Excel es el respaldo; el registro de la descarga es el libro.</p>
    </>
  );
};

export default ReconBatchesTab;
