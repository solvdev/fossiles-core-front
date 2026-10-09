import React from "react";
import { Alert, Button, FormGroup, Input, Label, Spinner } from "reactstrap";
import { MONTHS_ES } from "utils/financeFormat";
import "./ImportWizard.css";

const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  return `${MONTHS_ES[Number(m) - 1]} ${y}`;
};

/** Paso 4: resumen previo al commit. */
function StepConfirm({ summary, replaceExisting, onReplaceExistingChange, committing, error, onCommit }) {
  const stats = [
    { label: "Archivos a importar", value: summary.files },
    { label: "Meses", value: summary.months.length },
    { label: "Filas de ventas", value: summary.salesRows.toLocaleString("es-GT") },
    { label: "Filas de metas y tasas", value: summary.configRows.toLocaleString("es-GT") },
    { label: "Filas de costos", value: summary.costRows.toLocaleString("es-GT") },
    { label: "Archivos que reemplazan", value: summary.replaced, warn: summary.replaced > 0 },
    { label: "Sitios nuevos", value: summary.createdSites },
    { label: "Celdas corregidas / ignoradas", value: `${summary.fixedCells} / ${summary.ignoredCells}` },
  ];

  return (
    <div>
      <div className="kiw-summary">
        {stats.map((s) => (
          <div key={s.label} className={`kiw-stat ${s.warn ? "warn" : ""}`}>
            <div className="kiw-stat-label">{s.label}</div>
            <div className="kiw-stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <p className="mb-1">
        <strong>Meses:</strong> {summary.months.map(monthLabel).join(", ") || "—"}
      </p>
      {summary.skipped > 0 && (
        <Alert color="info" className="py-2">
          {summary.skipped} archivo{summary.skipped === 1 ? "" : "s"} ya importado{summary.skipped === 1 ? "" : "s"} se
          omitirá{summary.skipped === 1 ? "" : "n"} porque no marcaste reemplazo.
        </Alert>
      )}
      {summary.files === 0 && (
        <Alert color="warning" className="py-2">
          No hay archivos por importar. Vuelve al paso de validación y marca el reemplazo, o agrega otros archivos.
        </Alert>
      )}

      <FormGroup check className="my-3">
        <Label check>
          <Input type="checkbox" checked={replaceExisting} onChange={(e) => onReplaceExistingChange(e.target.checked)} />
          Reemplazar datos existentes de los mismos kioscos y meses
          <span className="form-check-sign" />
        </Label>
        <div className="small text-muted ml-4">
          Necesario si esos meses ya tienen ventas, costos o metas cargados. Se borrará lo anterior de esos kioscos y meses y se
          escribirá lo nuevo. Cada lote se puede revertir después.
        </div>
      </FormGroup>

      {error && (
        <Alert color="danger" role="alert">
          <strong>No se pudo importar:</strong> {error}
        </Alert>
      )}

      <div className="kiw-actions">
        <span className="small text-muted">El servidor vuelve a validar todo antes de guardar.</span>
        <Button color="success" className="btn-round" disabled={committing || summary.files === 0} onClick={onCommit}>
          {committing ? <Spinner size="sm" /> : <i className="nc-icon nc-check-2" aria-hidden="true" />} Importar{" "}
          {summary.files} archivo{summary.files === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

export default StepConfirm;
