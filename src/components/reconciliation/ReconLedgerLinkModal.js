import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table,
} from "reactstrap";
import {
  applyLedgerLink, downloadBatch, getLedgerLinkPeriods, getLedgerLinkPreview,
} from "services/reconciliationService";
import { createClientRequestId } from "services/customerAccountService";
import { formatQ } from "utils/reconciliationHelper";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";

/**
 * Liquidar un periodo de revisión del libro contable de ventas en línea.
 * El libro es lo que Contabilidad revisó: aquí se compara contra la conciliación, se ven las diferencias y, al aprobar, la
 * conciliación queda igual al libro, se liquida (lote + Excel) y se cierra la revisión. Todo o nada.
 */

const STATE_META = {
  LISTA: { label: "Cuadra", color: "success", help: "Cuadra tal cual" },
  LISTA_CON_CAMBIOS: { label: "Cuadra al igualar", color: "info", help: "Cuadra después de igualarla al libro" },
  EXCLUIR: { label: "Se excluye", color: "secondary", help: "El libro la tiene devuelta o anulada" },
  NO_LISTA: { label: "No cuadra", color: "danger", help: "Aun con el libro no cuadra" },
  SIN_REVISAR: { label: "Sin revisar", color: "warning", help: "No está marcada «Revisado» en el libro" },
  YA_LIQUIDADA: { label: "Ya liquidada", color: "secondary", help: "Ya está en un lote" },
  NO_ENTRA: { label: "No entra", color: "secondary", help: "Devuelta/anulada o excluida" },
  NO_DESPACHADA: { label: "No despachada", color: "secondary", help: "Aún no se concilia" },
};

const FILTERS = [
  { id: "attention", label: "Con novedad" },
  { id: "ready", label: "Listas" },
  { id: "notready", label: "No cuadran / sin revisar" },
  { id: "all", label: "Todas" },
];

const matches = (r, f) => {
  if (f === "all") return true;
  if (f === "ready") return r.selectable;
  if (f === "notready") return r.state === "NO_LISTA" || r.state === "SIN_REVISAR";
  return r.diffs.length > 0 || !["LISTA", "YA_LIQUIDADA", "NO_ENTRA", "NO_DESPACHADA"].includes(r.state);
};

const periodText = (p) => `${p.label} · ${p.status === "CLOSED" ? "cerrado" : "en revisión"} · ${p.reviewed} de ${p.sales} revisadas${p.batches.length ? ` · liquidado: ${p.batches.map((b) => b.code).join(", ")}` : ""}`;

const DiffList = ({ diffs }) => (diffs.length === 0 ? <span className="text-muted">—</span> : (
  <ul className="list-unstyled mb-0" style={{ fontSize: 12 }}>
    {diffs.map((d) => (
      <li key={d.key} className={d.fixable ? "" : "text-muted"} title={d.note || ""}>
        <b>{d.label}:</b> libro <b>{d.ledger}</b> · conciliación {d.recon}
        {d.fixable ? <Badge color="info" className="ml-1" pill>se iguala</Badge> : null}
      </li>
    ))}
  </ul>
));

const ReconLedgerLinkModal = ({ isOpen, toggle, onDone }) => {
  const [periods, setPeriods] = useState([]);
  const [periodId, setPeriodId] = useState("");
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [assumeEqual, setAssumeEqual] = useState(false);
  const [closePeriod, setClosePeriod] = useState(true);
  const [deselected, setDeselected] = useState(new Set());
  const [filter, setFilter] = useState("attention");
  const [confirmKey, setConfirmKey] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    getLedgerLinkPeriods().then(setPeriods).catch((e) => setError(e.message));
  }, [isOpen]);

  const load = useCallback(async (id, equal) => {
    if (!id) { setPreview(null); return; }
    setLoading(true);
    setError("");
    try {
      const p = await getLedgerLinkPreview(id, equal);
      setPreview(p);
      setDeselected(new Set());
      setConfirmKey(null);
      setResult(null);
      setClosePeriod(p.canClosePeriod);
    } catch (e) {
      setError(e.message);
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const choose = (id) => { setPeriodId(id); setAssumeEqual(false); load(id, false); };
  const toggleEqual = () => { const v = !assumeEqual; setAssumeEqual(v); load(periodId, v); };

  const rows = useMemo(() => (preview ? preview.rows : []), [preview]);
  const selectable = useMemo(() => rows.filter((r) => r.selectable), [rows]);
  const chosen = useMemo(() => selectable.filter((r) => !deselected.has(r.saleId)), [selectable, deselected]);
  const liquidating = chosen.filter((r) => r.state !== "EXCLUIR");
  const total = liquidating.reduce((a, r) => a + Number(r.ledgerTotal != null ? r.ledgerTotal : r.reconExpected || 0), 0);
  const changed = chosen.filter((r) => r.state === "LISTA_CON_CAMBIOS" || r.state === "EXCLUIR").length;
  const allLeft = selectable.length - chosen.length;
  const canCloseNow = preview && preview.canClosePeriod && allLeft === 0;
  const shown = rows.filter((r) => matches(r, filter));

  const toggleRow = (id) => setDeselected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allChecked = selectable.length > 0 && chosen.length === selectable.length;
  const toggleAll = () => setDeselected(allChecked ? new Set(selectable.map((r) => r.saleId)) : new Set());

  const run = async () => {
    setBusy(true);
    try {
      const r = await applyLedgerLink(periodId, { saleIds: chosen.map((x) => x.saleId), closePeriod: closePeriod && canCloseNow, assumeEqual }, confirmKey);
      if (!r.applied) {
        setConfirmKey(null);
        setResult(r);
        // Lo que impidió la liquidación sale de la selección para poder intentarlo de nuevo con el resto.
        setDeselected((s) => { const n = new Set(s); (r.blocked || []).forEach((b) => b.saleId && n.add(b.saleId)); return n; });
        showWarning(r.message);
        return;
      }
      setResult(r);
      setConfirmKey(null);
      showSuccess(r.message);
      if (r.batchId) {
        try { await downloadBatch(r.batchId); } catch (e) { showError(`La liquidación quedó hecha, pero la descarga falló: ${e.message}. Puede descargarla en Vista completa › Lotes.`); }
      }
      if (onDone) onDone(r);
      getLedgerLinkPeriods().then(setPeriods).catch(() => {});
      load(periodId, assumeEqual).then(() => setResult(r));
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const s = preview ? preview.summary : null;
  const settledNow = result && result.applied;

  return (
    <Modal isOpen={isOpen} toggle={busy ? undefined : toggle} size="xl" scrollable className="recon-ledger-link">
      <ModalHeader toggle={busy ? undefined : toggle}>Liquidar un periodo revisado en el libro contable</ModalHeader>
      <ModalBody>
        <p className="text-muted mb-2" style={{ fontSize: 13 }}>
          El libro es lo que Contabilidad dejó revisado. Elija el periodo, vea en qué difiere la conciliación y, si todo está bien, un solo botón
          la iguala al libro, liquida, descarga el Excel y cierra la revisión. Si alguna venta no queda lista, no se cambia nada.
        </p>
        <div className="d-flex align-items-center flex-wrap mb-3" style={{ gap: 10 }}>
          <label className="mb-0 font-weight-bold" htmlFor="ledger-link-period">Periodo de revisión</label>
          <Input id="ledger-link-period" type="select" bsSize="sm" style={{ maxWidth: 520 }} value={periodId} onChange={(e) => choose(e.target.value)} disabled={busy}>
            <option value="">Elija un periodo…</option>
            {periods.map((p) => <option key={p.id} value={p.id}>{periodText(p)}</option>)}
          </Input>
          {periodId && <Button size="sm" outline disabled={loading || busy} onClick={() => load(periodId, assumeEqual)}>Volver a comparar</Button>}
        </div>

        {error && <Alert color="danger">{error}</Alert>}
        {loading && <div className="text-center py-4"><Spinner /> <span className="ml-2">Comparando el libro con la conciliación…</span></div>}

        {preview && !loading && (
          <>
            {preview.warnings.map((w) => <Alert key={w} color="warning" className="py-2 mb-2">{w}</Alert>)}
            {preview.period.batches.length > 0 && (
              <Alert color="info" className="py-2 mb-2">
                Este periodo ya se liquidó con: {preview.period.batches.map((b) => `${b.code} (${b.cases} ventas, ${formatQ(b.expected)})`).join("; ")}.
                Las ventas que queden pendientes pueden liquidarse en otro lote.
              </Alert>
            )}
            <div className="d-flex flex-wrap mb-2" style={{ gap: 14, fontSize: 13 }}>
              <span><b>{s.sales}</b> ventas</span>
              <span className="text-success"><b>{s.ready + s.readyWithChanges}</b> listas ({s.readyWithChanges} con cambios)</span>
              {s.toExclude > 0 && <span><b>{s.toExclude}</b> se excluyen</span>}
              <span className={s.notReady ? "text-danger" : ""}><b>{s.notReady}</b> no cuadran</span>
              <span className={s.unreviewed ? "text-warning" : ""}><b>{s.unreviewed}</b> sin revisar</span>
              <span className="text-muted"><b>{s.alreadySettled}</b> ya liquidadas · <b>{s.notApplicable}</b> no aplican</span>
            </div>
            <div className="d-flex align-items-center flex-wrap mb-2" style={{ gap: 8 }}>
              {FILTERS.map((f) => (
                <Button key={f.id} size="sm" color={filter === f.id ? "primary" : "secondary"} outline={filter !== f.id} onClick={() => setFilter(f.id)}>{f.label}</Button>
              ))}
              <label className="mb-0 ml-auto" style={{ fontSize: 12.5 }}>
                <input type="checkbox" checked={assumeEqual} disabled={busy} onChange={toggleEqual} /> Si el libro no anota depósito real, tomar lo recibido = lo cobrado
              </label>
            </div>

            <div style={{ maxHeight: "46vh", overflow: "auto" }}>
              <Table size="sm" className="recon-table" responsive={false}>
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>
                      <input type="checkbox" aria-label="Marcar todas las listas" checked={allChecked} onChange={toggleAll} disabled={selectable.length === 0 || busy} />
                    </th>
                    <th>Venta / ENVL</th>
                    <th>Estado</th>
                    <th className="text-right">Cobrado<br /><small>libro → concil.</small></th>
                    <th className="text-right">Recibido<br /><small>depósito → concil.</small></th>
                    <th>Diferencias con el libro</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.length === 0 && <tr><td colSpan={6} className="text-center text-muted py-3">Nada que mostrar con este filtro.</td></tr>}
                  {shown.map((r) => {
                    const meta = STATE_META[r.state] || { label: r.state, color: "secondary", help: "" };
                    return (
                      <tr key={r.saleId} className={r.selectable && deselected.has(r.saleId) ? "text-muted" : ""}>
                        <td>
                          {r.selectable && (
                            <input type="checkbox" aria-label={`Marcar ${r.shipmentNumber || r.saleNumber}`} checked={!deselected.has(r.saleId)} disabled={busy} onChange={() => toggleRow(r.saleId)} />
                          )}
                        </td>
                        <td style={{ whiteSpace: "normal" }}>
                          <b>{r.shipmentNumber || "Sin ENVL"}</b> <small className="text-muted">#{r.saleNumber}</small><br />
                          <small className="text-muted">{r.saleDate} · {r.customer || "—"}</small>
                        </td>
                        <td style={{ whiteSpace: "normal" }}>
                          <Badge color={meta.color} title={meta.help}>{meta.label}</Badge>
                          <div style={{ fontSize: 11.5 }} className="text-muted">{r.reason}</div>
                        </td>
                        <td className="text-right">{formatQ(r.ledgerTotal)}<br /><small className="text-muted">{formatQ(r.reconExpected)}</small></td>
                        <td className="text-right">{r.ledgerDeposit != null ? formatQ(r.ledgerDeposit) : <span className="text-muted">—</span>}<br />
                          <small className="text-muted">{r.reconReceived != null ? formatQ(r.reconReceived) : "—"}</small></td>
                        <td style={{ whiteSpace: "normal" }}><DiffList diffs={r.diffs} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>

            {result && !result.applied && (
              <Alert color="danger" className="mt-3 mb-0">
                <b>{result.message}</b>
                <ul className="mb-0 mt-1">
                  {(result.blocked || []).slice(0, 12).map((b, i) => <li key={`${b.saleId}-${i}`}>{b.shipmentNumber || b.saleNumber || b.saleId}: {b.reason}</li>)}
                </ul>
                {(result.blocked || []).length > 12 && <small>y {result.blocked.length - 12} más.</small>}
                <div className="mt-1"><small>Esas ventas se quitaron de la selección: puede liquidar el resto o resolverlas en el detalle.</small></div>
              </Alert>
            )}
            {settledNow && (
              <Alert color="success" className="mt-3 mb-0">
                {result.message} {result.batchId ? "Se descargó el Excel del lote." : ""}
              </Alert>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter className="d-flex justify-content-between flex-wrap" style={{ gap: 8 }}>
        <div style={{ fontSize: 12.5 }}>
          {preview && (
            <label className="mb-0">
              <input type="checkbox" checked={closePeriod && canCloseNow} disabled={!canCloseNow || busy} onChange={(e) => setClosePeriod(e.target.checked)} />
              {" "}Cerrar también la revisión del libro (bloquea el periodo)
              {!canCloseNow && (
                <div className="text-muted">
                  {preview.closeBlocker || (allLeft > 0 ? `Marque todas las ventas listas (faltan ${allLeft}) para poder cerrar` : "No tiene permiso para cerrar la revisión")}
                </div>
              )}
            </label>
          )}
        </div>
        <div className="d-flex align-items-center" style={{ gap: 8 }}>
          {confirmKey ? (
            <>
              <span style={{ fontSize: 12.5 }}>
                Se igualarán <b>{changed}</b> ventas al libro y se liquidarán <b>{liquidating.length}</b> por <b>{formatQ(total)}</b>
                {closePeriod && canCloseNow ? "; la revisión del libro se cierra" : ""}. Se descarga el Excel.
              </span>
              <Button color="link" disabled={busy} onClick={() => setConfirmKey(null)}>Cancelar</Button>
              <Button color="primary" disabled={busy} onClick={run}>{busy ? <Spinner size="sm" /> : "Sí, igualar, liquidar y descargar"}</Button>
            </>
          ) : (
            <>
              <Button color="link" disabled={busy} onClick={toggle}>Cerrar</Button>
              <Button color="primary" size="lg" disabled={!preview || !preview.canApply || chosen.length === 0 || busy || loading}
                onClick={() => setConfirmKey(createClientRequestId())}
                title="Iguala la conciliación a lo revisado en el libro, liquida, descarga y cierra">
                Aplicar el libro y liquidar{chosen.length ? ` (${chosen.length})` : ""}
              </Button>
            </>
          )}
        </div>
      </ModalFooter>
    </Modal>
  );
};

export default ReconLedgerLinkModal;
