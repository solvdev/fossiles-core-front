import React, { useState } from "react";
import {
  Alert, Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner, Table,
} from "reactstrap";
import {
  createReceipt, generateCases, importGuides, importReceipts, recordQuickReceipt,
} from "services/reconciliationService";
import { describeImport, SOURCE_LABELS } from "utils/reconciliationHelper";

const ReportTable = ({ report }) =>
  report && report.length ? (
    <div style={{ maxHeight: 220, overflow: "auto" }} className="mt-2">
      <Table size="sm" className="recon-table">
        <thead><tr><th>Fila</th><th>Resultado</th><th>Detalle</th></tr></thead>
        <tbody>
          {report.slice(0, 100).map((r, i) => (
            <tr key={`${r.row}-${i}`}><td>{r.row}</td><td>{r.status}</td><td style={{ whiteSpace: "normal" }}>{r.message}</td></tr>
          ))}
        </tbody>
      </Table>
      {report.length > 100 && <small className="text-muted">Se muestran las primeras 100 filas con novedad.</small>}
    </div>
  ) : null;

/** Crea un caso por cada venta despachada del período. Repetirlo no duplica nada. */
export const GenerateCasesModal = ({ isOpen, toggle, defaultFrom, defaultTo, onDone }) => {
  const [from, setFrom] = useState(defaultFrom || "");
  const [to, setTo] = useState(defaultTo || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await generateCases(from, to);
      setResult(r);
      if (onDone) onDone(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle}>
      <ModalHeader toggle={toggle}>Generar casos del período</ModalHeader>
      <ModalBody>
        <p className="text-muted">Crea un caso por cada venta despachada y guarda lo cobrado. Las ventas que ya tienen caso se omiten, así que se puede repetir sin riesgo.</p>
        <div className="d-flex" style={{ gap: 12 }}>
          <FormGroup className="flex-fill"><Label for="gen-from">Desde</Label><Input id="gen-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></FormGroup>
          <FormGroup className="flex-fill"><Label for="gen-to">Hasta</Label><Input id="gen-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></FormGroup>
        </div>
        {error && <Alert color="danger">{error}</Alert>}
        {result && (
          <Alert color="success">
            {result.created} casos nuevos, {result.alreadyExisted} ya existían, {result.excluded} excluidos por devolución o anulación (de {result.total} ventas).
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle}>Cerrar</Button>
        <Button color="primary" onClick={run} disabled={busy || !from || !to}>{busy ? <Spinner size="sm" /> : "Generar casos"}</Button>
      </ModalFooter>
    </Modal>
  );
};

/** Importa una liquidación, extracto o reporte. El mismo archivo no se procesa dos veces. */
export const ImportReceiptsModal = ({ isOpen, toggle, onDone }) => {
  const [file, setFile] = useState(null);
  const [source, setSource] = useState("CARRIER");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await importReceipts(file, source);
      setResult(r);
      if (onDone) onDone(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>Importar fondos recibidos</ModalHeader>
      <ModalBody>
        <p className="text-muted">
          Excel o CSV de la liquidación del transportista, el extracto del banco o el reporte de tarjeta. Se reconocen columnas como guía, monto,
          monto de envío, referencia, autorización, fecha y transportista. Un fondo se aplica solo si su guía, referencia o ENVL apunta a una sola venta.
        </p>
        <div className="d-flex" style={{ gap: 12 }}>
          <FormGroup className="flex-fill">
            <Label for="imp-source">Fuente</Label>
            <Input id="imp-source" type="select" value={source} onChange={(e) => setSource(e.target.value)}>
              {["CARRIER", "BANK", "CARD", "CASH"].map((k) => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}
            </Input>
          </FormGroup>
          <FormGroup className="flex-fill">
            <Label for="imp-file">Archivo</Label>
            <Input id="imp-file" type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => { setFile(e.target.files[0] || null); setResult(null); }} />
          </FormGroup>
        </div>
        {error && <Alert color="danger" style={{ whiteSpace: "pre-wrap" }}>{error}</Alert>}
        {result && (
          <Alert color={result.duplicateFile ? "warning" : "success"}>
            {describeImport(result)}
            <ReportTable report={result.report} />
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle}>Cerrar</Button>
        <Button color="primary" onClick={run} disabled={busy || !file}>{busy ? <Spinner size="sm" /> : "Importar"}</Button>
      </ModalFooter>
    </Modal>
  );
};

const EMPTY_RECEIPT = { sourceType: "CARRIER", carrier: "", guideNumber: "", reference: "", authorizationNumber: "", receivedDate: "", amount: "", shippingAmount: "" };

/** Captura manual de un fondo (efectivo del motorista, un depósito suelto). */
export const ManualReceiptModal = ({ isOpen, toggle, onDone }) => {
  const [form, setForm] = useState(EMPTY_RECEIPT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const patch = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await createReceipt({
        ...form,
        amount: form.amount === "" ? null : Number(form.amount),
        shippingAmount: form.shippingAmount === "" ? null : Number(form.shippingAmount),
        receivedDate: form.receivedDate || null,
      });
      setResult(r);
      setForm(EMPTY_RECEIPT);
      if (onDone) onDone(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle}>
      <ModalHeader toggle={toggle}>Capturar un fondo</ModalHeader>
      <ModalBody>
        <FormGroup>
          <Label for="man-source">Fuente</Label>
          <Input id="man-source" type="select" value={form.sourceType} onChange={(e) => patch("sourceType", e.target.value)}>
            {Object.keys(SOURCE_LABELS).map((k) => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}
          </Input>
        </FormGroup>
        <div className="d-flex" style={{ gap: 12 }}>
          <FormGroup className="flex-fill"><Label for="man-amount">Monto recibido (Q) *</Label><Input id="man-amount" type="number" step="0.01" value={form.amount} onChange={(e) => patch("amount", e.target.value)} /></FormGroup>
          <FormGroup className="flex-fill"><Label for="man-ship">Monto de envío (Q)</Label><Input id="man-ship" type="number" step="0.01" value={form.shippingAmount} onChange={(e) => patch("shippingAmount", e.target.value)} /></FormGroup>
        </div>
        <div className="d-flex" style={{ gap: 12 }}>
          <FormGroup className="flex-fill"><Label for="man-guide">Guía</Label><Input id="man-guide" value={form.guideNumber} onChange={(e) => patch("guideNumber", e.target.value)} /></FormGroup>
          <FormGroup className="flex-fill"><Label for="man-ref">Referencia / boleta</Label><Input id="man-ref" value={form.reference} onChange={(e) => patch("reference", e.target.value)} /></FormGroup>
        </div>
        <div className="d-flex" style={{ gap: 12 }}>
          <FormGroup className="flex-fill"><Label for="man-carrier">Transportista</Label><Input id="man-carrier" value={form.carrier} onChange={(e) => patch("carrier", e.target.value)} /></FormGroup>
          <FormGroup className="flex-fill"><Label for="man-date">Fecha</Label><Input id="man-date" type="date" value={form.receivedDate} onChange={(e) => patch("receivedDate", e.target.value)} /></FormGroup>
        </div>
        {error && <Alert color="danger">{error}</Alert>}
        {result && (
          <Alert color={result.kind === "NONE" ? "warning" : "success"}>
            Fondo guardado. {result.kind === "APLICADO" ? "Se aplicó solo a su venta." : result.reason}
            {result.candidates && result.candidates.length > 0 && " Hay candidatos para revisar en Diferencias."}
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle}>Cerrar</Button>
        <Button color="primary" onClick={run} disabled={busy || form.amount === ""}>{busy ? <Spinner size="sm" /> : "Guardar fondo"}</Button>
      </ModalFooter>
    </Modal>
  );
};

/** Carga guías recuperadas del portal del transportista. Primero se ve lo que haría; solo llena guías que faltan. */
export const ImportGuidesModal = ({ isOpen, toggle, onDone }) => {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [applied, setApplied] = useState(null);

  const run = async (dryRun) => {
    setBusy(true);
    setError("");
    try {
      const r = await importGuides(file, dryRun);
      if (dryRun) setPreview(r);
      else {
        setApplied(r);
        if (onDone) onDone(r);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const shown = applied || preview;

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>Importar guías históricas</ModalHeader>
      <ModalBody>
        <p className="text-muted">
          Archivo con el ENVL y la guía (columnas «ENVL» y «Guía»), sacado del portal del transportista. Solo se llenan guías que faltan: nunca se
          cambia una guía existente ni se tocan montos.
        </p>
        <FormGroup>
          <Label for="gd-file">Archivo</Label>
          <Input id="gd-file" type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e) => { setFile(e.target.files[0] || null); setPreview(null); setApplied(null); }} />
        </FormGroup>
        {error && <Alert color="danger" style={{ whiteSpace: "pre-wrap" }}>{error}</Alert>}
        {shown && (
          <Alert color={applied ? "success" : "info"}>
            {applied ? "Guías guardadas." : "Vista previa (todavía no se guardó nada)."}{" "}
            {shown.rows} filas · {applied ? shown.set : shown.toSet} guías {applied ? "guardadas" : "por guardar"} · {shown.sameAlready} ya estaban iguales ·{" "}
            {shown.conflicts} conflictos · {shown.notFound} sin venta.
            <ReportTable report={shown.report} />
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle}>Cerrar</Button>
        <Button color="info" onClick={() => run(true)} disabled={busy || !file}>{busy ? <Spinner size="sm" /> : "Ver qué haría"}</Button>
        <Button color="primary" onClick={() => run(false)} disabled={busy || !file || !preview || preview.toSet === 0 || !!applied}>Guardar las guías</Button>
      </ModalFooter>
    </Modal>
  );
};

const newRow = () => ({ key: Math.random().toString(36).slice(2), identifier: "", amount: "", reference: "", state: "idle", message: "", warn: false });
const filled = (r) => r.identifier.trim() !== "" || r.amount !== "" || r.reference.trim() !== "";
const blankRows = () => [newRow(), newRow(), newRow()];

/**
 * Registrar pagos escribiendo: una fila por pago con el ENVL (o la guía), el monto y la referencia.
 * La fuente se deduce de cómo se cobró la venta. Cada fila dice al momento si cuadra o cuánto falta o sobra.
 */
export const QuickPaymentsModal = ({ isOpen, toggle, onDone }) => {
  const [rows, setRows] = useState(blankRows);
  const [date, setDate] = useState("");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const patch = (key, p) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p, state: "idle", message: "" } : r)));
  const pending = rows.filter((r) => filled(r) && r.state !== "saved");
  const saved = rows.filter((r) => r.state === "saved").length;
  const withDifference = rows.filter((r) => r.state === "saved" && r.warn).length;

  const run = async () => {
    setBusy(true);
    let any = false;
    const next = [...rows];
    for (let i = 0; i < next.length; i += 1) {
      const r = next[i];
      if (!filled(r) || r.state === "saved") continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const res = await recordQuickReceipt({
          identifier: r.identifier.trim(),
          amount: r.amount === "" ? null : Number(r.amount),
          reference: r.reference.trim() || null,
          receivedDate: date || null,
          sourceType: source || null,
        });
        next[i] = { ...r, state: "saved", warn: Number(res.difference) !== 0, message: res.message };
        any = true;
      } catch (e) {
        next[i] = { ...r, state: "error", message: e.message };
      }
      setRows([...next]);
    }
    setBusy(false);
    if (any && onDone) onDone();
  };

  const clearSaved = () => setRows((rs) => {
    const keep = rs.filter((r) => r.state !== "saved");
    return keep.length ? keep : blankRows();
  });

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl" style={{ maxWidth: 1000 }}>
      <ModalHeader toggle={toggle}>Registrar pagos recibidos</ModalHeader>
      <ModalBody>
        <p className="text-muted mb-2">
          Escriba una fila por cada pago: el número de envío (ENVL) o la guía de la venta, lo que se recibió y la referencia de la liquidación o boleta.
          El sistema busca la venta y dice al instante si lo recibido es igual a lo cobrado. Si hay diferencia, <strong>no se corrige sola</strong>:
          queda pendiente para revisarla.
        </p>
        <div className="d-flex flex-wrap mb-2" style={{ gap: 12 }}>
          <FormGroup className="mb-0">
            <Label for="qp-date" className="small mb-0">Fecha en que se recibió (hoy si la deja vacía)</Label>
            <Input id="qp-date" type="date" bsSize="sm" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormGroup>
          <FormGroup className="mb-0">
            <Label for="qp-source" className="small mb-0">Origen del dinero</Label>
            <Input id="qp-source" type="select" bsSize="sm" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Automático (según la venta)</option>
              {["CARRIER", "BANK", "CARD", "CASH"].map((k) => <option key={k} value={k}>{SOURCE_LABELS[k]}</option>)}
            </Input>
          </FormGroup>
        </div>
        <div className="table-responsive">
          <Table size="sm" className="recon-table">
            <thead>
              <tr><th style={{ width: "24%" }}>ENVL o guía *</th><th style={{ width: "16%" }}>Monto recibido (Q) *</th><th style={{ width: "22%" }}>Referencia</th><th>Resultado</th></tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const locked = r.state === "saved";
                return (
                  <tr key={r.key}>
                    <td><Input bsSize="sm" aria-label={`ENVL o guía, fila ${idx + 1}`} placeholder="ENVL-01234" value={r.identifier} disabled={locked || busy} onChange={(e) => patch(r.key, { identifier: e.target.value })} /></td>
                    <td><Input bsSize="sm" type="number" step="0.01" min="0" aria-label={`Monto, fila ${idx + 1}`} value={r.amount} disabled={locked || busy} onChange={(e) => patch(r.key, { amount: e.target.value })} /></td>
                    <td><Input bsSize="sm" aria-label={`Referencia, fila ${idx + 1}`} value={r.reference} disabled={locked || busy} onChange={(e) => patch(r.key, { reference: e.target.value })} /></td>
                    <td style={{ whiteSpace: "normal" }}>
                      {r.state === "saved" && <span className={r.warn ? "text-warning" : "text-success"}>{r.warn ? "! " : "✓ "}{r.message}</span>}
                      {r.state === "error" && <span className="text-danger">✕ {r.message}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        <Button size="sm" color="link" className="pl-0" onClick={() => setRows((rs) => [...rs, ...blankRows()])}>+ Agregar más filas</Button>
        {saved > 0 && (
          <Alert color={withDifference ? "warning" : "success"} className="py-2 mb-0">
            {saved} pago(s) guardado(s){withDifference ? `, ${withDifference} con diferencia (marcados con «!»): revíselos en la pestaña Diferencias.` : ", todos cuadran al centavo."}
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        {saved > 0 && <Button color="link" onClick={clearSaved}>Quitar las guardadas</Button>}
        <Button color="secondary" onClick={toggle}>Cerrar</Button>
        <Button color="primary" onClick={run} disabled={busy || pending.length === 0}>
          {busy ? <Spinner size="sm" /> : `Guardar ${pending.length} pago${pending.length === 1 ? "" : "s"}`}
        </Button>
      </ModalFooter>
    </Modal>
  );
};
