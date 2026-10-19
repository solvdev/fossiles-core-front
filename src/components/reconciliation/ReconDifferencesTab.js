import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Spinner, Table } from "reactstrap";
import { applyReceipt, getCases, getDashboard, getUnappliedReceipts } from "services/reconciliationService";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  PROBLEM_LABELS, SOURCE_LABELS, describeDifference, differenceColor, formatQ, labelOf,
} from "utils/reconciliationHelper";
import ReconStatusBadge from "./ReconStatusBadge";

const OPEN_STATUSES = "PENDIENTE_REVISION,CON_DIFERENCIAS,INFORMACION_INCOMPLETA,POSIBLE_DUPLICADO,REQUIERE_AUTORIZACION";

const HINTS = {
  PENDIENTE_AUTORIZACION: "Espera que alguien de Administración o Contabilidad autorice o rechace el ajuste.",
  PAGO_DUPLICADO: "La misma guía o referencia aparece en más de una venta. Anule la aplicación equivocada.",
  MONTO_INCORRECTO: "Lo recibido no es igual a lo cobrado. Corrija el dato, anule la aplicación o solicite un ajuste.",
  REFERENCIA_NO_ENCONTRADA: "La referencia de la venta no existe en la fuente. Verifique el comprobante.",
  VENTA_SIN_ENVIO: "Pasaron más de 5 días sin que llegue su fondo. Revise la liquidación del transportista.",
  DATOS_INSUFICIENTES: "Falta la guía o la referencia en la venta. Capturela o impórtela.",
  FECHA_INCONSISTENTE: "El fondo tiene una fecha anterior a la venta o al despacho.",
  COMISION_INCORRECTA: "La comisión registrada no coincide con la calculada (2% sin envío).",
  ENVIO_SIN_VENTA: "Fondos recibidos que todavía no encontraron su venta.",
};

/** Gestión de diferencias: los mismos casos de la bandeja agrupados por tipo de problema, más los fondos sin venta. */
const ReconDifferencesTab = ({ filters, version, selectedProblem, onSelectProblem, onOpen, perms, onChanged }) => {
  const [counts, setCounts] = useState({});
  const [unappliedCount, setUnappliedCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    const base = { ...filters, status: "", batch: "", q: "" };
    const caseFilter = selectedProblem && selectedProblem !== "ENVIO_SIN_VENTA" ? { ...base, problem: selectedProblem } : { ...base, status: OPEN_STATUSES };
    Promise.all([
      getDashboard(base),
      selectedProblem === "ENVIO_SIN_VENTA" ? Promise.resolve({ rows: [] }) : getCases(caseFilter, { size: 200, sort: "difference", dir: "asc" }),
      !selectedProblem || selectedProblem === "ENVIO_SIN_VENTA" ? getUnappliedReceipts(100) : Promise.resolve([]),
    ]).then(([dash, page, unapplied]) => {
      if (!alive) return;
      setCounts(dash.byProblem || {});
      setUnappliedCount(dash.unappliedReceipts || 0);
      setRows(page.rows.filter((r) => r.problemType));
      setReceipts(unapplied);
    }).catch((e) => alive && setError(e.message)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filters, selectedProblem, version]);

  const ordered = useMemo(() => [...rows].sort((a, b) => {
    const pa = a.problemType === "PENDIENTE_AUTORIZACION" ? 0 : 1;
    const pb = b.problemType === "PENDIENTE_AUTORIZACION" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return Math.abs(Number(b.difference) || Number(b.expected)) - Math.abs(Number(a.difference) || Number(a.expected));
  }), [rows]);

  const today = new Date();
  const ageDays = (ymd) => Math.max(0, Math.round((today - new Date(`${ymd}T12:00:00`)) / 86400000));
  const totalOpen = Object.values(counts).reduce((a, b) => a + b, 0) + unappliedCount;

  const associate = async (caseId, receiptId) => {
    try { await applyReceipt(caseId, receiptId); showSuccess("Fondo asociado tras confirmación"); onChanged(); } catch (e) { showError(e.message); }
  };

  return (
    <>
      <div className="recon-chips mb-2" role="group" aria-label="Filtrar por tipo de problema">
        <Button size="sm" color={!selectedProblem ? "primary" : "secondary"} outline={!!selectedProblem} onClick={() => onSelectProblem("")}>Todas <Badge color="light">{totalOpen}</Badge></Button>
        {Object.keys(PROBLEM_LABELS).map((k) => {
          const n = k === "ENVIO_SIN_VENTA" ? unappliedCount : counts[k] || 0;
          return <Button key={k} size="sm" color={selectedProblem === k ? "primary" : "secondary"} outline={selectedProblem !== k} onClick={() => onSelectProblem(k)}>{PROBLEM_LABELS[k]} <Badge color="light">{n}</Badge></Button>;
        })}
      </div>
      {selectedProblem && <p className="text-muted small">{HINTS[selectedProblem]}</p>}
      {error && <Alert color="danger">{error}</Alert>}
      {loading && <div className="text-center p-3"><Spinner size="sm" /> Cargando…</div>}
      {!loading && selectedProblem !== "ENVIO_SIN_VENTA" && (
        ordered.length === 0 ? (
          <div className="recon-empty"><h5>Sin diferencias abiertas de este tipo</h5><p>Cuando el motor de reglas encuentre una, aparecerá aquí con su motivo.</p></div>
        ) : (
          <div className="table-responsive">
            <Table hover size="sm" className="recon-table">
              <thead><tr><th>Tipo</th><th>ENVL</th><th className="num">Diferencia</th><th className="num">Antigüedad</th><th>Estado</th></tr></thead>
              <tbody>
                {ordered.map((r) => {
                  const d = describeDifference(r);
                  return (
                    <tr key={r.id} className="recon-row" onClick={() => onOpen(r.id)}>
                      <td><strong>{PROBLEM_LABELS[r.problemType]}</strong></td>
                      <td>{r.shipmentNumber}</td>
                      <td className={`num ${differenceColor(d.tone)}`}><strong>{d.symbol} {r.hasReceipts ? d.text : formatQ(r.expected)}</strong></td>
                      <td className="num">{ageDays(r.saleDate)} d</td>
                      <td><ReconStatusBadge status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        )
      )}
      {!loading && (!selectedProblem || selectedProblem === "ENVIO_SIN_VENTA") && (
        <>
          <h6 className="mt-4">Envío sin venta asociada: fondos que no encontraron su venta</h6>
          {receipts.length === 0 ? <p className="text-muted">No hay fondos sin aplicar.</p> : (
            <div className="table-responsive">
              <Table size="sm" className="recon-table">
                <thead><tr><th>Fondo</th><th className="num">Sin aplicar</th><th>Coincidencia</th></tr></thead>
                <tbody>
                  {receipts.map((m) => (
                    <tr key={m.receipt.id}>
                      <td><strong>{m.receipt.guide || m.receipt.reference || `Fondo ${m.receipt.id}`}</strong><div className="small text-muted">{labelOf(SOURCE_LABELS, m.receipt.source)} · {m.receipt.receivedDate || "sin fecha"}</div></td>
                      <td className="num">{formatQ(m.receipt.remaining)}</td>
                      <td style={{ whiteSpace: "normal" }}>
                        <Badge color={m.kind === "AMBIGUOUS" || m.kind === "NONE" ? "danger" : "warning"}>{m.kind === "NONE" ? "Sin coincidencia" : m.kind === "AMBIGUOUS" ? "Ambiguo" : m.kind === "BLOCKED" ? "Bloqueado" : "Un candidato"}</Badge>{" "}
                        <span className="small">{m.reason}</span>
                        <div className="mt-1">
                          {m.candidates.map((c) => (
                            <Button key={c.caseId} size="sm" outline className="mr-1 mb-1" disabled={!perms.reconcile} onClick={() => associate(c.caseId, m.receipt.id)}
                              title={c.reason}>Asociar a {c.shipmentNumber} ({(c.saleDate || "").slice(5)}, {formatQ(c.expected)})</Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default ReconDifferencesTab;
