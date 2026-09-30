import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Col, Input, Row } from "reactstrap";
import { MONTHS_ES, fmtDateEs, fmtMoney } from "utils/financeFormat";
import IssueResolver from "./IssueResolver";
import {
  SEVERITIES,
  hasFileError,
  isIssueResolvable,
  isIssueResolved,
  totalsDiff,
} from "./importModel";
import "./ImportWizard.css";

export const SEVERITY_LABEL = {
  BLOCKING: { icon: "✕", text: "Bloqueante", plural: "Bloqueantes" },
  WARNING: { icon: "!", text: "Advertencia", plural: "Advertencias" },
  INFO: { icon: "i", text: "Informativa", plural: "Informativas" },
};

const CODE_LABEL = {
  NON_NUMERIC_CELL: "Texto en celda de ventas",
  NEGATIVE_VALUE: "Venta negativa",
  UNMATCHED_COLUMN: "Kiosco sin coincidencia",
  DUPLICATE_COLUMN: "Columna repetida",
  TOTAL_MISMATCH: "Total no coincide",
  OUT_OF_MONTH_VALUE: "Valor fuera del mes",
  OUTLIER: "Venta atípica",
  MISSING_COSTS: "Costos incompletos",
  MISSING_GOAL: "Sin meta",
  OVERLAPS_POS: "Traslape con ventas POS",
  DUPLICATE_FILE: "Archivo duplicado",
  LAYOUT_ASSUMPTION: "Suposición de formato",
  FILE_ERROR: "Error de archivo",
};

const PAGE = 100;

const FORMAT_LABEL = {
  LEGACY: "Formato anterior",
  SHEET_YEAR: "Formato nuevo",
};

const PERIOD_SOURCE_TEXT = {
  FILE_NAME: "del nombre del archivo",
  DATES: "de las fechas de la hoja",
  OVERRIDE: "corregido por ti",
};

export function SeverityChip({ severity }) {
  const meta = SEVERITY_LABEL[severity] || SEVERITY_LABEL.INFO;
  return (
    <span className={`kiw-sev kiw-sev-${severity}`}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.text}
    </span>
  );
}

/** Mes/año del reporte: editable en el formato nuevo, donde las fechas de la hoja pueden traer el mes equivocado. */
function PeriodEditor({ file, busy, onPeriodChange }) {
  const [yearDraft, setYearDraft] = useState(String(file.year || ""));
  useEffect(() => setYearDraft(String(file.year || "")), [file.year]);

  const applyYear = () => {
    const y = Number(yearDraft);
    if (!Number.isInteger(y) || y < 2000 || y > 2100) {
      setYearDraft(String(file.year || ""));
      return;
    }
    if (y !== file.year) onPeriodChange(y, file.month);
  };

  return (
    <div className="mb-2">
      <div className="d-flex align-items-center">
        <Input
          type="select"
          bsSize="sm"
          style={{ maxWidth: 140 }}
          aria-label={"Mes del reporte " + file.fileName}
          value={file.month || 1}
          disabled={busy}
          onChange={(e) => onPeriodChange(file.year, Number(e.target.value))}
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
          aria-label={"Año del reporte " + file.fileName}
          min={2000}
          max={2100}
          value={yearDraft}
          disabled={busy}
          onChange={(e) => setYearDraft(e.target.value)}
          onBlur={applyYear}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyYear();
          }}
        />
        {busy && <span className="small text-muted ml-2">Actualizando...</span>}
      </div>
      <div className="small text-muted mt-1">
        Mes {PERIOD_SOURCE_TEXT[file.periodSource] || "detectado"}. Corrígelo si no es el correcto: las fechas de este
        formato no son confiables.
      </div>
    </div>
  );
}

function FileCard({ file, replace, onReplaceChange, onDrop, onPeriodChange, periodBusy }) {
  const diff = totalsDiff(file.stats);
  const mismatch = diff !== null && Math.abs(diff) >= 0.01;
  const ai = file.alreadyImported;
  if (hasFileError(file)) {
    const errors = (file.issues || []).filter((i) => i.code === "FILE_ERROR");
    return (
      <div className="kiw-file-card" style={{ borderLeftColor: "#ef8156" }}>
        <h6>{file.fileName}</h6>
        <Alert color="danger" className="py-2 small mb-2" role="alert">
          <strong>✕ Archivo no legible.</strong>
          {errors.map((e) => (
            <div key={e.id || e.message}>{e.message}</div>
          ))}
        </Alert>
        <Button color="danger" size="sm" outline className="m-0" onClick={onDrop}>
          Quitar este archivo
        </Button>
      </div>
    );
  }
  return (
    <div className={`kiw-file-card ${ai || mismatch ? "has-warning" : ""}`}>
      <h6>{file.fileName}</h6>
      {file.format && (
        <div className="mb-1">
          <span className="badge badge-info">{FORMAT_LABEL[file.format] || file.format}</span>
        </div>
      )}
      {file.periodEditable ? (
        <PeriodEditor file={file} busy={periodBusy} onPeriodChange={onPeriodChange} />
      ) : (
        <div className="small text-muted mb-2">
          {MONTHS_ES[(file.month || 1) - 1]} {file.year}
        </div>
      )}
      <div className="kiw-kv">
        <span>Columnas (kioscos)</span>
        <strong>{file.stats ? file.stats.columns : (file.columns || []).length}</strong>
      </div>
      <div className="kiw-kv">
        <span>Días / celdas de venta</span>
        <strong>
          {file.stats ? `${file.stats.days} / ${file.stats.salesCells}` : "—"}
        </strong>
      </div>
      <div className="kiw-kv">
        <span>Ventas recalculadas</span>
        <strong>{fmtMoney(file.stats && file.stats.salesTotal)}</strong>
      </div>
      <div className="kiw-kv">
        <span>Total en la hoja</span>
        <strong>{fmtMoney(file.stats && file.stats.sheetTotal)}</strong>
      </div>
      <div className="kiw-kv">
        <span>Diferencia</span>
        {diff === null ? (
          <span>—</span>
        ) : mismatch ? (
          <strong className="text-warning">
            <span aria-hidden="true">! </span>
            {fmtMoney(diff)}
          </strong>
        ) : (
          <strong className="text-success">
            <span aria-hidden="true">✓ </span>Coincide
          </strong>
        )}
      </div>
      {ai && (
        <Alert color="warning" className="mt-2 mb-0 py-2 small">
          <strong>Ya importado.</strong>{" "}
          {ai.sameFile ? "Este mismo archivo" : "Ya hay datos de este mes"} se importó en el lote #{ai.batchId}
          {ai.createdAt ? ` (${fmtDateEs(String(ai.createdAt).slice(0, 10))})` : ""}.
          <div className="form-check mt-1 mb-0">
            <label className="form-check-label">
              <Input type="checkbox" checked={!!replace} onChange={(e) => onReplaceChange(e.target.checked)} />
              Reemplazar los datos existentes con este archivo
              <span className="form-check-sign" />
            </label>
          </div>
          {!replace && <div className="mt-1">Sin reemplazo, este archivo se omitirá al importar.</div>}
        </Alert>
      )}
    </div>
  );
}

/** Paso 3: incidencias con filtros y resolución inline; las BLOCKING deben resolverse para continuar. */
function StepValidation({
  files,
  siteMap,
  resolutionsByFile,
  onResolve,
  onClearResolution,
  replaceByFile,
  onReplaceChange,
  onDropFile,
  onPeriodChange,
  periodBusyIdx,
  counts,
}) {
  const [severityFilter, setSeverityFilter] = useState(new Set(SEVERITIES));
  const [fileFilter, setFileFilter] = useState("all");
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    const all = [];
    files.forEach((file, fileIdx) => {
      (file.issues || []).forEach((issue) => all.push({ file, fileIdx, issue }));
    });
    const rank = { BLOCKING: 0, WARNING: 1, INFO: 2 };
    return all.sort((a, b) => (rank[a.issue.severity] ?? 3) - (rank[b.issue.severity] ?? 3) || a.fileIdx - b.fileIdx);
  }, [files]);

  const totals = { BLOCKING: 0, WARNING: 0, INFO: 0 };
  rows.forEach(({ issue }) => {
    if (totals[issue.severity] !== undefined) totals[issue.severity] += 1;
  });

  const visible = rows.filter(
    ({ issue, fileIdx }) =>
      severityFilter.has(issue.severity) && (fileFilter === "all" || String(fileIdx) === fileFilter)
  );

  const toggleSeverity = (sev) => {
    const next = new Set(severityFilter);
    if (next.has(sev)) next.delete(sev);
    else next.add(sev);
    setSeverityFilter(next);
    setLimit(PAGE);
  };

  return (
    <div>
      {counts.BLOCKING > 0 ? (
        <Alert color="danger" className="py-2" role="alert">
          <strong>{counts.BLOCKING}</strong> incidencia{counts.BLOCKING === 1 ? "" : "s"} bloqueante
          {counts.BLOCKING === 1 ? "" : "s"} por resolver antes de continuar.
        </Alert>
      ) : (
        <Alert color="success" className="py-2" role="status">
          ✓ No hay incidencias bloqueantes pendientes
          {counts.resolved > 0 ? ` (${counts.resolved} resuelta${counts.resolved === 1 ? "" : "s"})` : ""}.
        </Alert>
      )}

      <Row>
        {files.map((file, i) => (
          <Col key={`${file.fileName}-${i}`} lg="4" md="6" className="mb-2">
            <FileCard
              file={file}
              replace={replaceByFile[i]}
              onReplaceChange={(v) => onReplaceChange(i, v)}
              onDrop={() => onDropFile(i)}
              onPeriodChange={(year, month) => onPeriodChange(i, year, month)}
              periodBusy={periodBusyIdx === i}
            />
          </Col>
        ))}
      </Row>

      <div className="d-flex flex-wrap align-items-center justify-content-between mt-2">
        <div className="kiw-filter" role="group" aria-label="Filtrar por severidad">
          {SEVERITIES.map((sev) => {
            const on = severityFilter.has(sev);
            const shown = sev === "BLOCKING" ? `${counts.BLOCKING} sin resolver / ${totals.BLOCKING}` : totals[sev];
            return (
              <Button
                key={sev}
                size="sm"
                color={sev === "BLOCKING" ? "danger" : sev === "WARNING" ? "warning" : "info"}
                outline={!on}
                aria-pressed={on}
                onClick={() => toggleSeverity(sev)}
              >
                <span aria-hidden="true">{SEVERITY_LABEL[sev].icon} </span>
                {SEVERITY_LABEL[sev].plural} ({shown})
              </Button>
            );
          })}
        </div>
        {files.length > 1 && (
          <Input
            type="select"
            bsSize="sm"
            style={{ maxWidth: 260 }}
            aria-label="Filtrar por archivo"
            value={fileFilter}
            onChange={(e) => {
              setFileFilter(e.target.value);
              setLimit(PAGE);
            }}
          >
            <option value="all">Todos los archivos</option>
            {files.map((f, i) => (
              <option key={`${f.fileName}-${i}`} value={i}>
                {f.fileName}
              </option>
            ))}
          </Input>
        )}
      </div>

      <div className="table-responsive">
        <table className="table kiw-table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Severidad</th>
              <th>Archivo</th>
              <th>Incidencia</th>
              <th>Resolución</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-4">
                  {rows.length === 0 ? "El análisis no encontró incidencias." : "No hay incidencias con los filtros elegidos."}
                </td>
              </tr>
            )}
            {visible.slice(0, limit).map(({ file, fileIdx, issue }) => {
              const resolvable = issue.severity === "BLOCKING" && isIssueResolvable(file, issue);
              const resolved = isIssueResolved(file, issue, resolutionsByFile[fileIdx], siteMap);
              return (
                <tr key={`${fileIdx}-${issue.id}-${issue.code}`}>
                  <td>
                    <SeverityChip severity={issue.severity} />
                  </td>
                  <td className="small">
                    {file.fileName}
                    <div className="text-muted">
                      {MONTHS_ES[(file.month || 1) - 1]} {file.year}
                    </div>
                  </td>
                  <td className="kiw-msg">
                    <strong>{CODE_LABEL[issue.code] || issue.code}</strong>
                    <div>{issue.message}</div>
                    <div className="small text-muted">
                      {issue.excelName ? `${issue.excelName} · ` : ""}
                      {issue.date ? `${fmtDateEs(issue.date)} · ` : ""}
                      {issue.cell ? `Celda ${issue.cell}` : ""}
                    </div>
                  </td>
                  <td>
                    {resolvable ? (
                      <IssueResolver
                        issue={issue}
                        resolution={(resolutionsByFile[fileIdx] || {})[issue.id]}
                        onResolve={(value) => onResolve(fileIdx, issue.id, value)}
                        onClear={() => onClearResolution(fileIdx, issue.id)}
                      />
                    ) : issue.severity === "BLOCKING" ? (
                      issue.code === "FILE_ERROR" ? (
                        <Button color="danger" size="sm" outline className="m-0" onClick={() => onDropFile(fileIdx)}>
                          Quitar archivo
                        </Button>
                      ) : issue.code === "UNMATCHED_COLUMN" ? (
                        resolved ? (
                          <span className="kiw-sev kiw-sev-OK">
                            <span aria-hidden="true">✓</span>Kiosco asignado en el paso 2
                          </span>
                        ) : (
                          <span className="small text-danger">
                            Asigna el kiosco «{issue.excelName}» en el paso «Kioscos».
                          </span>
                        )
                      ) : (
                        <span className="small text-danger">
                          No se puede resolver aquí. Corrige el archivo y vuelve a analizarlo.
                        </span>
                      )
                    ) : (
                      <span className="small text-muted">Sin acción requerida</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {visible.length > limit && (
        <div className="text-center">
          <Button color="link" onClick={() => setLimit(limit + PAGE)}>
            Mostrar más ({visible.length - limit} restantes)
          </Button>
        </div>
      )}
    </div>
  );
}

export default StepValidation;
