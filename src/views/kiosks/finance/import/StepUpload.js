import React, { useRef, useState } from "react";
import { Alert, Button, Progress, Spinner } from "reactstrap";
import { MAX_FILES, MAX_FILE_BYTES, formatBytes, validateSelection } from "./importModel";
import "./ImportWizard.css";

/** Paso 1: seleccionar/arrastrar uno o varios .xlsx y analizarlos. */
function StepUpload({ files, onFilesChange, analyzing, analyzeError, onAnalyze }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);
  const [errors, setErrors] = useState([]);

  const add = (incoming) => {
    const { accepted, errors: errs } = validateSelection(files, incoming);
    setErrors(errs);
    if (accepted.length !== files.length) onFilesChange(accepted);
  };

  const remove = (idx) => {
    setErrors([]);
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div>
      <div
        className={`kiw-dropzone ${over ? "is-over" : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Seleccionar archivos Excel para importar"
        onClick={() => inputRef.current && inputRef.current.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (inputRef.current) inputRef.current.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer && e.dataTransfer.files) add(e.dataTransfer.files);
        }}
      >
        <div className="kiw-drop-icon">
          <i className="nc-icon nc-cloud-upload-94" aria-hidden="true" />
        </div>
        <div>
          <strong>Arrastra los reportes mensuales aquí</strong> o haz clic para seleccionarlos
        </div>
        <div className="small text-muted mt-1">
          Archivos .xlsx · máximo {MAX_FILES} archivos · {formatBytes(MAX_FILE_BYTES)} cada uno
        </div>
        <div className="small text-muted">
          Acepta los dos formatos de reporte, incluso mezclados: el anterior (hoja «Reporte de Vtas orig.») y el nuevo (hojas
          «ventas 2025» / «ventas 2026»).
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          multiple
          style={{ display: "none" }}
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {errors.length > 0 && (
        <Alert color="warning" className="mt-3" role="alert">
          <strong>Algunos archivos no se agregaron:</strong>
          <ul className="mb-0 pl-3">
            {errors.map((msg) => (
              <li key={msg}>{msg}</li>
            ))}
          </ul>
        </Alert>
      )}
      {analyzeError && (
        <Alert color="danger" className="mt-3" role="alert">
          {analyzeError}
        </Alert>
      )}

      {files.length > 0 && (
        <div className="mt-3">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong>
              {files.length} archivo{files.length === 1 ? "" : "s"} · {formatBytes(totalBytes)}
            </strong>
            <Button color="link" size="sm" disabled={analyzing} onClick={() => onFilesChange([])}>
              Quitar todos
            </Button>
          </div>
          {files.map((file, i) => (
            <div key={`${file.name}-${file.size}`} className="kiw-file-row">
              <i className="nc-icon nc-single-copy-04 text-success" aria-hidden="true" />
              <span className="kiw-file-name" title={file.name}>
                {file.name}
              </span>
              <span className="small text-muted">{formatBytes(file.size)}</span>
              <Button
                color="danger"
                size="sm"
                outline
                className="m-0 py-1 px-2"
                disabled={analyzing}
                aria-label={`Quitar ${file.name}`}
                onClick={() => remove(i)}
              >
                Quitar
              </Button>
            </div>
          ))}
        </div>
      )}

      {analyzing && (
        <div className="mt-3" aria-live="polite">
          <Progress animated striped color="info" value={100} />
          <div className="text-muted small mt-1">
            <Spinner size="sm" /> Analizando archivos... esto puede tardar unos segundos.
          </div>
        </div>
      )}

      <div className="kiw-actions">
        <span className="small text-muted">
          El análisis no guarda nada: podrás revisar kioscos e incidencias antes de importar.
        </span>
        <Button color="primary" className="btn-round" disabled={files.length === 0 || analyzing} onClick={onAnalyze}>
          {analyzing ? <Spinner size="sm" /> : <i className="nc-icon nc-zoom-split" aria-hidden="true" />} Analizar
        </Button>
      </div>
    </div>
  );
}

export default StepUpload;
