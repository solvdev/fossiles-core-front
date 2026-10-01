import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { commitGapFill, previewGapFill } from "services/kioskFinancialsService";
import { MONTHS_ES, fmtDateEs, fmtMoney } from "utils/financeFormat";
import { showError, showSuccess } from "utils/notificationHelper";
import "./ImportWizard.css";

/** "2026-09-01","2026-09-03","2026-09-05"... -> "1, 3, 5–10" (días del mes, tramos seguidos agrupados). */
export const compactDays = (dates) => {
  const days = [...new Set((dates || []).map((d) => Number(String(d).slice(8, 10))).filter((n) => n > 0))].sort(
    (a, b) => a - b
  );
  const parts = [];
  let i = 0;
  while (i < days.length) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j] + 1) j += 1;
    parts.push(j > i ? `${days[i]}–${days[j]}` : String(days[i]));
    i = j + 1;
  }
  return parts.join(", ");
};

function Collapsible({ title, count, children }) {
  const [open, setOpen] = useState(false);
  if (!count) return null;
  return (
    <div className="mt-3">
      <Button color="link" size="sm" className="p-0" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "▾" : "▸"} {title} ({count})
      </Button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/**
 * Cubre los "días sin sistema": días del reporte Excel con venta que son anteriores a la primera venta del kiosco en el
 * POS (el sistema tiene Q 0.00 ahí). Sólo escribe ventas de los kioscos marcados; el resto del reporte no se toca.
 */
function GapFillModal({ isOpen, toggle }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [period, setPeriod] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [applied, setApplied] = useState(null);
  const [error, setError] = useState("");
  const [yearDraft, setYearDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) {
      setFile(null);
      setPreview(null);
      setPeriod(null);
      setSelected(new Set());
      setApplied(null);
      setError("");
      setConfirm(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setYearDraft(preview ? String(preview.year) : "");
  }, [preview]);

  const analyze = async (nextFile, nextPeriod) => {
    setAnalyzing(true);
    setError("");
    try {
      const data = await previewGapFill(nextFile, nextPeriod);
      setPreview(data);
      setSelected(new Set((data.sites || []).filter((s) => (s.candidates || []).length > 0).map((s) => s.siteId)));
    } catch (err) {
      setPreview(null);
      setError(err.message || "No se pudo analizar el archivo.");
    } finally {
      setAnalyzing(false);
    }
  };

  const onPick = (e) => {
    const picked = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!picked) return;
    setFile(picked);
    setPeriod(null);
    setApplied(null);
    analyze(picked, null);
  };

  const changePeriod = (year, month) => {
    const next = { year, month };
    setPeriod(next);
    analyze(file, next);
  };

  const applyYear = () => {
    const y = Number(yearDraft);
    if (!preview || !Number.isInteger(y) || y < 2000 || y > 2100) {
      setYearDraft(preview ? String(preview.year) : "");
      return;
    }
    if (y !== preview.year) changePeriod(y, preview.month);
  };

  const sitesWithCandidates = useMemo(
    () => ((preview && preview.sites) || []).filter((s) => (s.candidates || []).length > 0),
    [preview]
  );
  const chosen = sitesWithCandidates.filter((s) => selected.has(s.siteId));
  const chosenDays = chosen.reduce((sum, s) => sum + s.candidates.length, 0);
  const chosenAmount = chosen.reduce((sum, s) => sum + Number(s.candidateTotal || 0), 0);

  const toggleSite = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const apply = async () => {
    setApplying(true);
    setError("");
    try {
      const res = await commitGapFill(file, [...selected], period);
      setApplied(res);
      showSuccess("Días sin sistema cubiertos");
    } catch (err) {
      const message = err.message || "No se pudo aplicar la corrección.";
      setError(message);
      showError(message);
    } finally {
      setApplying(false);
    }
  };

  const others = ((preview && preview.sites) || []).filter(
    (s) => (s.differences || []).length > 0 || (s.afterGoLiveGaps || []).length > 0
  );
  const differenceRows = others.flatMap((s) => (s.differences || []).map((d) => ({ ...d, name: s.name })));
  const gapRows = others.flatMap((s) => (s.afterGoLiveGaps || []).map((d) => ({ ...d, name: s.name })));

  return (
    <>
      <Modal isOpen={isOpen} toggle={applying ? undefined : toggle} size="xl" scrollable className="kiw-scope">
        <ModalHeader toggle={applying ? undefined : toggle}>Cubrir días sin sistema</ModalHeader>
        <ModalBody>
          {applied ? (
            <Alert color="success" role="status">
              <strong>Listo.</strong> Se escribieron {applied.salesRows} días ({fmtMoney(applied.amount)}) de{" "}
              {(applied.sites || []).length} kiosco{(applied.sites || []).length === 1 ? "" : "s"} para{" "}
              {MONTHS_ES[(applied.month || 1) - 1]} {applied.year}. Lote #{applied.batchId}: puedes revertirlo desde el
              Historial (empieza con «DIAS SIN SISTEMA»).
              <ul className="mb-0 mt-2 pl-3">
                {(applied.sites || []).map((s) => (
                  <li key={s.siteId}>
                    {s.name}: {s.days} día{s.days === 1 ? "" : "s"} · {fmtMoney(s.amount)}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : (
            <>
              <p className="small text-muted">
                Sube el Excel del reporte. Se cubren los días que el reporte tiene con venta y que son <strong>anteriores a
                la primera venta del kiosco en el sistema</strong> (hoy en Q 0.00). Sólo se escriben ventas, sólo de los
                kioscos que marques; costos, tasas, metas y el POS no se tocan, y un día que el sistema ya tiene nunca se
                pisa.
              </p>
              <div className="d-flex align-items-center flex-wrap">
                <Button color="primary" outline className="btn-round mr-3" disabled={analyzing || applying} onClick={() => inputRef.current && inputRef.current.click()}>
                  {file ? "Cambiar archivo" : "Elegir Excel (.xlsx)"}
                </Button>
                <input ref={inputRef} type="file" accept=".xlsx" style={{ display: "none" }} aria-hidden="true" tabIndex={-1} onChange={onPick} />
                {file && <span className="small">{file.name}</span>}
                {analyzing && (
                  <span className="small text-muted ml-3">
                    <Spinner size="sm" /> Analizando...
                  </span>
                )}
              </div>
            </>
          )}

          {error && (
            <Alert color="danger" className="mt-3" role="alert">
              {error}
            </Alert>
          )}

          {preview && !applied && (
            <div className="mt-3">
              <div className="d-flex align-items-center flex-wrap mb-2">
                <strong className="mr-2">Mes del reporte:</strong>
                <Input
                  type="select"
                  bsSize="sm"
                  style={{ maxWidth: 140 }}
                  aria-label="Mes del reporte"
                  value={preview.month}
                  disabled={analyzing}
                  onChange={(e) => changePeriod(preview.year, Number(e.target.value))}
                >
                  {MONTHS_ES.map((name, i) => (
                    <option key={name} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </Input>
                <Input
                  type="number"
                  bsSize="sm"
                  className="ml-2"
                  style={{ maxWidth: 90 }}
                  aria-label="Año del reporte"
                  min={2000}
                  max={2100}
                  value={yearDraft}
                  disabled={analyzing}
                  onChange={(e) => setYearDraft(e.target.value)}
                  onBlur={applyYear}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applyYear();
                  }}
                />
                <span className="small text-muted ml-3">Corrígelo si no es el mes correcto.</span>
              </div>

              {sitesWithCandidates.length === 0 ? (
                <Alert color="info" role="status">
                  No hay días sin sistema por cubrir en este reporte: ningún kiosco tiene días con venta en el Excel y Q 0.00
                  en el sistema antes de su primera venta en el POS.
                </Alert>
              ) : (
                <>
                  <div className="table-responsive">
                    <table className="table kiw-table" style={{ minWidth: 720 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>
                            <Input
                              type="checkbox"
                              aria-label="Seleccionar todos los kioscos"
                              checked={chosen.length === sitesWithCandidates.length}
                              onChange={(e) =>
                                setSelected(e.target.checked ? new Set(sitesWithCandidates.map((s) => s.siteId)) : new Set())
                              }
                              style={{ position: "static", opacity: 1, visibility: "visible", margin: 0 }}
                            />
                          </th>
                          <th>Kiosco</th>
                          <th>Primera venta en el POS</th>
                          <th>Días por cubrir</th>
                          <th className="text-right">Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sitesWithCandidates.map((s) => (
                          <tr key={s.siteId}>
                            <td>
                              <Input
                                type="checkbox"
                                aria-label={`Cubrir ${s.name}`}
                                checked={selected.has(s.siteId)}
                                onChange={() => toggleSite(s.siteId)}
                                style={{ position: "static", opacity: 1, visibility: "visible", margin: 0 }}
                              />
                            </td>
                            <td>{s.name}</td>
                            <td>{fmtDateEs(s.goLive)}</td>
                            <td>
                              {compactDays(s.candidates.map((c) => c.date))}{" "}
                              <span className="text-muted small">({s.candidates.length})</span>
                            </td>
                            <td className="text-right">{fmtMoney(s.candidateTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th />
                          <th colSpan={2}>Seleccionado: {chosen.length} de {sitesWithCandidates.length} kioscos</th>
                          <th>{chosenDays} días</th>
                          <th className="text-right">{fmtMoney(chosenAmount)}</th>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}

              <Collapsible title="Otras diferencias que NO se aplican (mismo día, monto distinto)" count={differenceRows.length}>
                <table className="table kiw-table">
                  <thead>
                    <tr>
                      <th>Kiosco</th>
                      <th>Día</th>
                      <th className="text-right">Reporte</th>
                      <th className="text-right">Sistema</th>
                    </tr>
                  </thead>
                  <tbody>
                    {differenceRows.map((d) => (
                      <tr key={`${d.name}-${d.date}`}>
                        <td>{d.name}</td>
                        <td>{fmtDateEs(d.date)}</td>
                        <td className="text-right">{fmtMoney(d.excelAmount)}</td>
                        <td className="text-right">{fmtMoney(d.systemAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Collapsible>
              <Collapsible title="Días sin sistema posteriores al arranque del kiosco (no se pueden cubrir aquí)" count={gapRows.length}>
                <ul className="small pl-3 mb-0">
                  {gapRows.map((d) => (
                    <li key={`${d.name}-${d.date}`}>
                      {d.name} · {fmtDateEs(d.date)} · {fmtMoney(d.excelAmount)}
                    </li>
                  ))}
                </ul>
              </Collapsible>
              <Collapsible title="Columnas del Excel que no entran" count={(preview.ignoredColumns || []).length}>
                <ul className="small pl-3 mb-0">
                  {(preview.ignoredColumns || []).map((c) => (
                    <li key={`${c.excelName}-${c.reason}`}>
                      {c.excelName}: {c.reason}
                    </li>
                  ))}
                </ul>
              </Collapsible>
              <Collapsible title="Celdas con texto que se ignoraron" count={(preview.skippedCells || []).length}>
                <ul className="small pl-3 mb-0">
                  {(preview.skippedCells || []).map((c) => (
                    <li key={`${c.excelName}-${c.cell}`}>
                      {c.excelName} · {fmtDateEs(c.date)} · celda {c.cell}: «{c.rawValue}»
                    </li>
                  ))}
                </ul>
              </Collapsible>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={toggle} disabled={applying}>
            {applied ? "Cerrar" : "Cancelar"}
          </Button>
          {!applied && (
            <Button
              color="primary"
              disabled={!preview || analyzing || applying || chosen.length === 0}
              onClick={() => setConfirm(true)}
            >
              {applying ? <Spinner size="sm" /> : null} Aplicar a {chosen.length} kiosco{chosen.length === 1 ? "" : "s"}
            </Button>
          )}
        </ModalFooter>
      </Modal>
      <ConfirmModal
        isOpen={confirm}
        toggle={() => setConfirm(false)}
        onConfirm={apply}
        title="Cubrir días sin sistema"
        message={`Se escribirán ${chosenDays} días (${fmtMoney(chosenAmount)}) de ${chosen.length} kiosco${
          chosen.length === 1 ? "" : "s"
        } para ${preview ? MONTHS_ES[(preview.month || 1) - 1] : ""} ${preview ? preview.year : ""}. Podrás revertirlo desde el Historial.`}
        confirmText="Aplicar"
        confirmColor="primary"
      />
    </>
  );
}

export default GapFillModal;
