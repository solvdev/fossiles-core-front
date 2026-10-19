import React, { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Spinner, Table } from "reactstrap";
import {
  applyReceipt, authorizeAdjustment, excludeCase, getCase, getUnappliedReceipts, includeCase, observeCase, proposeAdjustment,
  reconcileCase, recordCaseReceipt, refreshAmount, reopenCase, revalidateCase, rejectAdjustment, voidApplication,
} from "services/reconciliationService";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  CARRIER_LABELS, EVENT_LABELS, METHOD_LABELS, SOURCE_LABELS, describeDifference, differenceColor, formatQ, hasAction, labelOf,
} from "utils/reconciliationHelper";
import ReconStatusBadge from "./ReconStatusBadge";

const Section = ({ title, right, children }) => (
  <div className="sec"><h6><span>{title}</span><span className="font-weight-normal small">{right}</span></h6><div className="in">{children}</div></div>
);

const Field = ({ label, children, src }) => (
  <>
    <dt>{label}</dt>
    <dd>{children}{src && <span className="src">{src}</span>}</dd>
  </>
);

const when = (iso) => (iso ? String(iso).replace("T", " ").slice(0, 16) : "");

const eventText = (e) => {
  let extra = "";
  try {
    const p = e.payload ? JSON.parse(e.payload) : null;
    if (p) extra = Object.entries(p).map(([k, v]) => `${k}: ${v}`).join(" · ");
  } catch (err) {
    extra = e.payload || "";
  }
  const states = e.from && e.to && e.from !== e.to ? `${e.from} → ${e.to}` : "";
  return [states, extra].filter(Boolean).join(" — ");
};

/** Detalle de un caso: qué coincide, qué no, por qué falla cada validación y qué hacer. Se abre sin perder la tabla. */
const ReconCaseDrawer = ({ id, onClose, onChanged, onPrev, onNext, perms }) => {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // { action, label, min, text }
  const [receipts, setReceipts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState(null); // { amount, reference, date }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setDetail(await getCase(id));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { setForm(null); setReceipts(null); setPay(null); load(); }, [load]);

  const run = async (fn, okMessage) => {
    setBusy(true);
    try {
      await fn();
      showSuccess(okMessage);
      setForm(null);
      setReceipts(null);
      setPay(null);
      await load();
      onChanged();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openForm = (action, label, min, placeholder) => setForm({ action, label, min, placeholder, text: "" });

  const submitForm = () => {
    const text = form.text.trim();
    if (text.length < form.min) { showError(`Escriba al menos ${form.min} caracteres.`); return; }
    const map = {
      reconcile: () => run(() => reconcileCase(id, text), "Caso conciliado"),
      reopen: () => run(() => reopenCase(id, text), "Caso reabierto"),
      exclude: () => run(() => excludeCase(id, text), "Caso excluido"),
      observe: () => run(() => observeCase(id, text), "Observación registrada"),
      refresh: () => run(() => refreshAmount(id, text), "Monto actualizado desde la venta"),
      propose: () => run(() => proposeAdjustment(id, text), "Ajuste enviado a autorización"),
      reject: () => run(() => rejectAdjustment(pending.id, text), "Ajuste rechazado"),
      voidApp: () => run(() => voidApplication(form.target, text), "Aplicación anulada"),
    };
    map[form.action]();
  };

  const pending = detail && detail.differences.find((d) => d.status === "PROPOSED");

  const submitPay = () => {
    if (!pay.amount || Number(pay.amount) <= 0) { showError("Escriba el monto recibido."); return; }
    run(async () => {
      await recordCaseReceipt(id, { amount: Number(pay.amount), reference: pay.reference.trim() || null, receivedDate: pay.date || null });
    }, "Pago registrado");
  };

  const showReceipts = async () => {
    try {
      const list = await getUnappliedReceipts(100);
      list.sort((a, b) => Number(b.candidates.some((c) => c.caseId === id)) - Number(a.candidates.some((c) => c.caseId === id)));
      setReceipts(list);
    } catch (e) {
      showError(e.message);
    }
  };

  if (loading && !detail) return <div className="recon-drawer"><div className="p-4 text-center"><Spinner /></div></div>;
  if (error && !detail) {
    return (
      <div className="recon-drawer"><div className="head"><h5>Detalle</h5><Button size="sm" onClick={onClose}>Cerrar</Button></div>
        <div className="body"><Alert color="danger">{error}</Alert><Button size="sm" onClick={load}>Reintentar</Button></div></div>
    );
  }
  if (!detail) return null;

  const { row, sale, checks, applications, differences, events, ledger, commission } = detail;
  const d = describeDifference(row);
  const rank = { FAIL: 0, PASS: 1, NA: 2 };
  const sortedChecks = [...checks].sort((a, b) => rank[a.outcome] - rank[b.outcome]);
  const fails = checks.filter((c) => c.outcome === "FAIL");
  const closed = detail.actions.length === 0 && row.batchId;

  return (
    <aside className="recon-drawer" aria-label="Detalle de conciliación">
      <div className="head">
        <div><small className="text-muted">Detalle de conciliación</small><h5 className="mb-0">{row.shipmentNumber} · {labelOf(CARRIER_LABELS, row.carrier)}</h5></div>
        <div>
          <Button size="sm" outline onClick={onPrev} aria-label="Caso anterior">◀</Button>{" "}
          <Button size="sm" outline onClick={onNext} aria-label="Caso siguiente">▶</Button>{" "}
          <Button size="sm" color="secondary" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
      <div className="body">
        {detail.sourceChanged && (
          <Alert color="warning" className="py-2">
            La venta cambió de monto después de crear el caso ({formatQ(sale && sale.total)} hoy contra {formatQ(row.expected)} del caso).
            {hasAction(detail, "REFRESH_AMOUNT") && perms.reconcile && <> <Button size="sm" color="link" onClick={() => openForm("refresh", "Motivo para tomar el monto actual de la venta", 10, "Por qué cambió el monto")}>Tomar el monto actual</Button></>}
          </Alert>
        )}
        <Section title="Resumen de conciliación" right={<ReconStatusBadge status={row.status} />}>
          <div className="compare">
            <div><div className="l">Cobrado</div><div className="v">{formatQ(row.expected)}</div></div>
            <div><div className="l">Recibido</div><div className="v">{row.hasReceipts ? formatQ(row.received) : "—"}</div></div>
            <div><div className="l">Diferencia</div><div className={`v ${differenceColor(d.tone)}`}>{d.symbol} {d.text}</div></div>
          </div>
          <dl className="kv">
            <Field label="Saldo pendiente"><strong>{formatQ(row.pendingBalance)}</strong>{Number(row.authorizedAdjustment) > 0 && <span className="text-muted"> (tras ajuste autorizado de {formatQ(row.authorizedAdjustment)})</span>}</Field>
            {fails.length > 0 && <Field label="Por revisar">{fails.length} validación(es) con falla: {fails.map((f) => f.code).join(", ")}</Field>}
          </dl>
          {(row.status === "CON_DIFERENCIAS" || row.status === "REQUIERE_AUTORIZACION") && (
            <Alert color="danger" className="mt-2 mb-0 py-2">El estado no hace desaparecer la diferencia. Solo se resuelve corrigiendo el dato de origen o con un ajuste autorizado y documentado.</Alert>
          )}
        </Section>

        <Section title="Acciones">
          {closed && <Alert color="info" className="mb-0">Este caso está en el lote cerrado <strong>{row.batchCode}</strong>. No se modifica; solo se corrige anulando el lote completo.</Alert>}
          {!closed && (
            <div className="d-flex flex-wrap" style={{ gap: 8 }}>
              {hasAction(detail, "RECONCILE") && <Button size="sm" color="primary" disabled={!perms.reconcile || busy} onClick={() => openForm("reconcile", "Observación (opcional)", 0, "Qué advertencias se aceptan")}>Conciliar con observación</Button>}
              {hasAction(detail, "REOPEN") && <Button size="sm" outline disabled={!perms.reconcile || busy} onClick={() => openForm("reopen", "Motivo para reabrir", 5, "Por qué se reabre")}>Reabrir</Button>}
              {hasAction(detail, "PROPOSE_ADJUSTMENT") && <Button size="sm" outline color="warning" disabled={!perms.adjust || busy} onClick={() => openForm("propose", "Motivo del ajuste (mínimo 15 caracteres)", 15, `Qué pasó con ${formatQ(Math.abs(row.difference))} y por qué se acepta`)}>Solicitar ajuste autorizado</Button>}
              {hasAction(detail, "AUTHORIZE") && pending && <Button size="sm" color="success" disabled={!perms.authorize || busy} onClick={() => run(() => authorizeAdjustment(pending.id), "Ajuste autorizado. Queda visible aparte; no se oculta.")}>Autorizar ajuste de {formatQ(pending.amount)}</Button>}
              {hasAction(detail, "REJECT_ADJUSTMENT") && pending && <Button size="sm" outline color="danger" disabled={!perms.authorize || busy} onClick={() => openForm("reject", "Motivo del rechazo", 3, "Por qué se rechaza")}>Rechazar</Button>}
              {hasAction(detail, "APPLY_RECEIPT") && <Button size="sm" color="primary" disabled={!perms.import || busy} onClick={() => setPay({ amount: "", reference: "", date: "" })}>Registrar pago recibido</Button>}
              {hasAction(detail, "APPLY_RECEIPT") && <Button size="sm" outline disabled={!perms.reconcile || busy} onClick={showReceipts}>Aplicar un fondo ya cargado</Button>}
              {hasAction(detail, "INCLUDE") && <Button size="sm" outline disabled={!perms.reconcile || busy} onClick={() => run(() => includeCase(id), "Caso reincorporado")}>Reincorporar</Button>}
              {hasAction(detail, "EXCLUDE") && <Button size="sm" outline color="secondary" disabled={!perms.reconcile || busy} onClick={() => openForm("exclude", "Motivo de la exclusión (mínimo 10 caracteres)", 10, "Por qué no entra a la conciliación")}>Excluir</Button>}
              {hasAction(detail, "REVALIDATE") && <Button size="sm" outline disabled={!perms.reconcile || busy} onClick={() => run(() => revalidateCase(id), "Caso revalidado")}>Revalidar</Button>}
              {hasAction(detail, "OBSERVE") && <Button size="sm" outline disabled={!perms.reconcile || busy} onClick={() => openForm("observe", "Observación", 3, "Nota para el historial")}>Observación</Button>}
            </div>
          )}
          {form && (
            <div className="mt-3">
              <label htmlFor="recon-form-text" className="small text-muted mb-1">{form.label}</label>
              <Input id="recon-form-text" type="textarea" rows={3} value={form.text} placeholder={form.placeholder} onChange={(e) => setForm({ ...form, text: e.target.value })} autoFocus />
              <div className="mt-2"><Button size="sm" color="primary" disabled={busy} onClick={submitForm}>Confirmar</Button>{" "}<Button size="sm" color="link" onClick={() => setForm(null)}>Cancelar</Button></div>
            </div>
          )}
          {pay && (
            <div className="mt-3 p-2" style={{ border: "1px solid var(--recon-line, #dee2e6)", borderRadius: 4 }}>
              <strong className="small">Registrar pago recibido</strong>
              <p className="small text-muted mb-2">Cobrado: {formatQ(row.expected)}. Escriba lo que realmente se recibió; el sistema calcula la diferencia.</p>
              <div className="d-flex flex-wrap" style={{ gap: 8 }}>
                <div><label htmlFor="pay-amount" className="small mb-0">Monto recibido (Q) *</label>
                  <Input id="pay-amount" bsSize="sm" type="number" step="0.01" min="0" value={pay.amount} autoFocus onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></div>
                <div><label htmlFor="pay-ref" className="small mb-0">Referencia</label>
                  <Input id="pay-ref" bsSize="sm" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></div>
                <div><label htmlFor="pay-date" className="small mb-0">Fecha (hoy si vacía)</label>
                  <Input id="pay-date" bsSize="sm" type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></div>
              </div>
              <div className="mt-2"><Button size="sm" color="primary" disabled={busy} onClick={submitPay}>Guardar pago</Button>{" "}<Button size="sm" color="link" onClick={() => setPay(null)}>Cancelar</Button></div>
            </div>
          )}
          {receipts && (
            <div className="mt-3">
              <strong className="small">Fondos sin aplicar</strong>
              {receipts.length === 0 ? <p className="text-muted small mb-0">No hay fondos sin aplicar. Importe o capture uno desde Herramientas.</p> : (
                <Table size="sm" className="recon-table mt-1">
                  <thead><tr><th>Fuente</th><th>Guía / referencia</th><th className="num">Sin aplicar</th><th /></tr></thead>
                  <tbody>
                    {receipts.slice(0, 30).map((r) => (
                      <tr key={r.receipt.id}>
                        <td>{labelOf(SOURCE_LABELS, r.receipt.source)}{r.candidates.some((c) => c.caseId === id) && <Badge color="info" className="ml-1">sugerido</Badge>}</td>
                        <td>{r.receipt.guide || r.receipt.reference || "—"}</td>
                        <td className="num">{formatQ(r.receipt.remaining)}</td>
                        <td><Button size="sm" color="primary" disabled={busy} onClick={() => run(() => applyReceipt(id, r.receipt.id), "Fondo aplicado")}>Aplicar</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          )}
        </Section>

        <Section title="Venta">
          <dl className="kv">
            <Field label="Pedido / ENVL" src="online_sale.sale_number / shipment_number">{row.saleNumber} · <strong>{row.shipmentNumber}</strong></Field>
            <Field label="Fecha de venta" src="online_sale.sale_date">{row.saleDate}</Field>
            <Field label="Cliente" src="online_sale.customer_name">{sale && sale.customerName}</Field>
            <Field label="Vendedor" src="online_sale.salesperson (texto libre)">{row.seller}</Field>
            <Field label="Productos (neto)" src="online_sale.net_amount">{sale && formatQ(sale.net)}</Field>
            <Field label="Envío" src="online_sale.shipping_cost">{sale && formatQ(sale.shipping)}</Field>
            <Field label="Total cobrado" src="online_sale.total_amount"><strong>{sale && formatQ(sale.total)}</strong></Field>
            <Field label="Factura FEL" src="online_sale.invoice_id">{sale && sale.invoiceId ? "Asociada" : "No asociada"}</Field>
          </dl>
        </Section>

        <Section title="Envío">
          <dl className="kv">
            <Field label="Transportista" src="online_sale.shipping_carrier">{labelOf(CARRIER_LABELS, row.carrier)}</Field>
            <Field label="Guía" src="online_sale.guide_number">{row.guideNumber || (row.carrier === "MOTORISTA" ? "No aplica" : <span className="text-danger">Sin guía capturada</span>)}</Field>
            <Field label="Despacho" src="online_sale.dispatched_at">{sale && sale.dispatchedAt ? when(sale.dispatchedAt) : <span className="text-muted">Sin fecha de despacho registrada (venta anterior a esta columna)</span>}</Field>
          </dl>
        </Section>

        <Section title="Pago">
          <dl className="kv">
            <Field label="Forma de pago" src="online_sale.payment_method">{labelOf(METHOD_LABELS, row.paymentMethod)}</Field>
            <Field label="Autorización en la venta" src="online_sale.payment_authorization">{(sale && sale.paymentAuthorization) || "—"}</Field>
          </dl>
          {applications.length === 0 ? <p className="text-muted small mt-2 mb-0">Sin fondos aplicados.</p> : (
            <Table size="sm" className="recon-table mt-2">
              <thead><tr><th>Fondo</th><th>Referencia</th><th>Fecha</th><th className="num">Aplicado</th><th /></tr></thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id} className={a.status === "VOID" ? "text-muted" : ""}>
                    <td>{labelOf(SOURCE_LABELS, a.source)}<div className="small text-muted">{a.matchMethod}{a.status === "VOID" ? " · anulada" : ""}</div></td>
                    <td>{a.reference || a.guide || "—"}</td>
                    <td>{a.receivedDate || "—"}</td>
                    <td className="num">{formatQ(a.amountApplied)}</td>
                    <td>{a.status === "ACTIVE" && !closed && perms.reconcile && <Button size="sm" color="link" onClick={() => setForm({ action: "voidApp", label: "Motivo de la anulación", min: 5, placeholder: "Por qué se anula la aplicación", text: "", target: a.id })}>Anular</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <Section title="Comisión del vendedor" right={commission && commission.status}>
          <dl className="kv">
            <Field label="Base de cálculo">{formatQ(commission && commission.base)} <span className="text-muted">(productos, sin envío)</span></Field>
            <Field label="Tasa">{commission ? `${(Number(commission.rate) * 100).toFixed(0)}%` : "—"}</Field>
            <Field label="Calculada">{formatQ(commission && commission.expected)}</Field>
            <Field label="Registrada en el sistema">{commission && commission.registered != null ? formatQ(commission.registered) : <span className="text-muted">Aún sin registrar</span>} <span className="text-muted">se congela al cerrar el mes</span></Field>
          </dl>
        </Section>

        <Section title="Validaciones" right={fails.length ? `${fails.length} por revisar` : "todas correctas"}>
          <div className="table-responsive">
            <Table size="sm" className="vt mb-0">
              <thead><tr><th>Resultado</th><th>Regla</th><th>Esperado</th><th>Encontrado</th></tr></thead>
              <tbody>
                {sortedChecks.map((c) => (
                  <tr key={c.code}>
                    <td>{c.outcome === "PASS" ? <Badge color="success">✓ Cumple</Badge> : c.outcome === "NA" ? <Badge color="secondary">N/A</Badge> : c.severity === "CRITICAL" ? <Badge color="danger">✕ Crítico</Badge> : <Badge color="warning">! Advertencia</Badge>}</td>
                    <td><strong>{c.code}</strong> {c.name}{c.outcome === "FAIL" && <div className="text-muted">{c.message} {c.action && <strong>Acción: {c.action}</strong>}</div>}</td>
                    <td>{c.expected}</td>
                    <td>{c.found}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Section>

        {differences.length > 0 && (
          <Section title="Ajustes">
            {differences.map((x) => (
              <p key={x.id} className="mb-1 small"><strong>{x.status}</strong> · {formatQ(x.amount)} · propuso {x.proposedByName || x.proposedBy || "—"}{x.authorizedBy ? `, autorizó ${x.authorizedByName || x.authorizedBy}` : ""} — {x.reason}</p>
            ))}
          </Section>
        )}

        {ledger.length > 0 && (
          <Section title="Libro de descargas" right="solo agregar">
            <Table size="sm" className="recon-table mb-0">
              <thead><tr><th>Movimiento</th><th className="num">Monto</th><th>Fecha</th></tr></thead>
              <tbody>{ledger.map((l) => <tr key={l.id}><td>{l.type}{l.note ? <div className="small text-muted">{l.note}</div> : null}</td><td className="num">{formatQ(l.amount)}</td><td>{when(l.at)}</td></tr>)}</tbody>
            </Table>
          </Section>
        )}

        <Section title="Historial" right="solo se agrega, no se edita">
          <ul className="hist">
            {events.map((e) => (
              <li key={e.id}><div className="t">{when(e.at)} · {e.actorName || (e.actorId ? `usuario ${e.actorId}` : "sistema")}</div><strong>{EVENT_LABELS[e.type] || e.type}</strong>{eventText(e) && <div className="small text-muted">{eventText(e)}</div>}</li>
            ))}
          </ul>
        </Section>
      </div>
    </aside>
  );
};

export default ReconCaseDrawer;
