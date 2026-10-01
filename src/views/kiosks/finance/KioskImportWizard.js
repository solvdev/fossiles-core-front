import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, CardBody, CardHeader, CardTitle, Collapse } from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { commitKioskImport, getKioskSites, previewKioskImport } from "services/kioskFinancialsService";
import { MONTHS_ES } from "utils/financeFormat";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import useUnsavedGuard from "views/config/kioskCosts/useUnsavedGuard";
import GapFillModal from "./import/GapFillModal";
import ImportHistory from "./import/ImportHistory";
import ImportResult from "./import/ImportResult";
import StepConfirm from "./import/StepConfirm";
import StepHeader from "./import/StepHeader";
import StepSites from "./import/StepSites";
import StepUpload from "./import/StepUpload";
import StepValidation from "./import/StepValidation";
import TemplateModal from "./import/TemplateModal";
import {
  aggregateColumns,
  buildCommitPayload,
  countIssues,
  createNameConflicts,
  duplicateMonths,
  initialSiteMap,
  mappingProblems,
  pendingMappingCount,
  summarizeImport,
} from "./import/importModel";
import "./import/ImportWizard.css";

function KioskImportWizard() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [previewFiles, setPreviewFiles] = useState(null);
  const [periodBusyIdx, setPeriodBusyIdx] = useState(null);
  const [siteMap, setSiteMap] = useState({});
  const [resolutions, setResolutions] = useState({});
  const [replaceByFile, setReplaceByFile] = useState({});
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [result, setResult] = useState(null);
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [showTemplate, setShowTemplate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showGapFill, setShowGapFill] = useState(false);

  const dirty = !!previewFiles && !result;
  const { pendingHref, confirmLeave, cancelLeave } = useUnsavedGuard(dirty);

  const loadSites = useCallback(async () => {
    setSitesLoading(true);
    try {
      // Los sitios externos (p. ej. Entrecueros Pueblito) no entran a ningún reporte ni importación
      setSites(((await getKioskSites()) || []).filter((s) => !s.excludeFromReports));
    } catch (err) {
      showError(err.message || "No se pudieron cargar los sitios.");
    } finally {
      setSitesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  const files = useMemo(() => previewFiles || [], [previewFiles]);
  const aggregated = useMemo(() => aggregateColumns(files), [files]);
  const pendingMappings = pendingMappingCount(aggregated, siteMap);
  const mapProblems = mappingProblems(files, siteMap);
  const nameConflicts = createNameConflicts(
    siteMap,
    sites.map((s) => s.name)
  );
  const counts = useMemo(() => countIssues(files, resolutions, siteMap), [files, resolutions, siteMap]);

  const dupMonths = duplicateMonths(files, replaceByFile);
  const mappingOk = !!previewFiles && pendingMappings === 0 && mapProblems.length === 0 && nameConflicts.length === 0;
  const validationOk = mappingOk && counts.BLOCKING === 0 && dupMonths.length === 0;

  const canGoTo = (i) => {
    if (i === 0) return true;
    if (i === 1) return !!previewFiles;
    if (i === 2) return mappingOk;
    if (i === 3) return validationOk;
    return false;
  };

  const resetAll = () => {
    setStep(0);
    setSelected([]);
    setPreviewFiles(null);
    setSiteMap({});
    setResolutions({});
    setReplaceByFile({});
    setReplaceExisting(false);
    setResult(null);
    setAnalyzeError("");
    setCommitError("");
  };

  /** Corrige mes/año de un reporte del formato nuevo (sus fechas internas pueden venir mal): re-analiza sólo ese archivo. */
  const changePeriod = async (fileIdx, year, month) => {
    const file = files[fileIdx];
    const source = file && selected.find((f) => f.name === file.fileName);
    if (!source) return;
    setPeriodBusyIdx(fileIdx);
    try {
      const data = await previewKioskImport([source], { [file.fileName]: { year, month } });
      const fresh = data && data.files && data.files[0];
      if (!fresh) throw new Error("El servidor no devolvió información del archivo.");
      setPreviewFiles((prev) => prev.map((f, i) => (i === fileIdx ? fresh : f)));
      // Las incidencias se regeneran (cambian los ids): se descartan las resoluciones y el reemplazo de ese archivo
      setResolutions((prev) => {
        const out = { ...prev };
        delete out[fileIdx];
        return out;
      });
      setReplaceByFile((prev) => {
        const out = { ...prev };
        delete out[fileIdx];
        return out;
      });
    } catch (err) {
      showError(err.message || "No se pudo actualizar el período del archivo.");
    } finally {
      setPeriodBusyIdx(null);
    }
  };

  const handleFilesChange = (next) => {
    setSelected(next);
    if (previewFiles) {
      // Cambió la selección: el análisis anterior ya no aplica
      setPreviewFiles(null);
      setSiteMap({});
      setResolutions({});
      setReplaceByFile({});
      showWarning("Cambiaste los archivos: vuelve a analizarlos.");
    }
  };

  const analyze = async () => {
    setAnalyzing(true);
    setAnalyzeError("");
    try {
      const data = await previewKioskImport(selected);
      const list = (data && data.files) || [];
      if (list.length === 0) {
        setAnalyzeError("El servidor no devolvió información de los archivos.");
        return;
      }
      setPreviewFiles(list);
      setSiteMap(initialSiteMap(aggregateColumns(list)));
      setResolutions({});
      setReplaceByFile({});
      setReplaceExisting(false);
      setStep(1);
    } catch (err) {
      setAnalyzeError(err.message || "No se pudieron analizar los archivos.");
    } finally {
      setAnalyzing(false);
    }
  };

  const setMapping = (key, entry) =>
    setSiteMap((prev) => {
      const next = { ...prev };
      if (entry === undefined) delete next[key];
      else next[key] = entry;
      return next;
    });

  const resolve = (fileIdx, issueId, value) =>
    setResolutions((prev) => ({ ...prev, [fileIdx]: { ...(prev[fileIdx] || {}), [issueId]: value } }));

  const clearResolution = (fileIdx, issueId) =>
    setResolutions((prev) => {
      const forFile = { ...(prev[fileIdx] || {}) };
      delete forFile[issueId];
      return { ...prev, [fileIdx]: forFile };
    });

  const dropFile = (idx) => {
    const dropped = files[idx];
    const remaining = files.filter((_, i) => i !== idx);
    if (dropped) setSelected((sel) => sel.filter((f) => f.name !== dropped.fileName));
    if (remaining.length === 0) {
      setPreviewFiles(null);
      setSiteMap({});
      setResolutions({});
      setReplaceByFile({});
      setStep(0);
      return;
    }
    const remap = (obj) => {
      const out = {};
      Object.entries(obj).forEach(([k, v]) => {
        const i = Number(k);
        if (i !== idx) out[i > idx ? i - 1 : i] = v;
      });
      return out;
    };
    setPreviewFiles(remaining);
    setResolutions(remap(resolutions));
    setReplaceByFile(remap(replaceByFile));
  };

  const changeReplace = (fileIdx, value) => {
    setReplaceByFile((prev) => ({ ...prev, [fileIdx]: value }));
    if (value) setReplaceExisting(true);
  };

  const summary = useMemo(
    () => summarizeImport({ files, siteMap, resolutionsByFile: resolutions, replaceByFile }),
    [files, siteMap, resolutions, replaceByFile]
  );

  const commit = async () => {
    setCommitting(true);
    setCommitError("");
    try {
      const payload = buildCommitPayload({
        files,
        siteMap,
        resolutionsByFile: resolutions,
        replaceByFile,
        replaceExisting,
      });
      const res = await commitKioskImport(payload);
      setResult(res || { batches: [] });
      showSuccess("Importación completada");
      loadSites();
    } catch (err) {
      const message = err.message || "No se pudo completar la importación.";
      setCommitError(message);
      showError(message);
    } finally {
      setCommitting(false);
    }
  };

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const nextDisabledReason =
    step === 1
      ? pendingMappings > 0
        ? `Faltan ${pendingMappings} kiosco(s) por asignar`
        : mapProblems.length > 0
          ? "Resuelve los conflictos de asignación"
          : nameConflicts.length > 0
            ? `Ya existe un sitio llamado «${nameConflicts[0]}»`
            : ""
      : step === 2
        ? counts.BLOCKING > 0
          ? `Faltan ${counts.BLOCKING} incidencia(s) bloqueante(s)`
          : dupMonths.length > 0
            ? "Hay dos archivos del mismo mes"
            : ""
        : "";

  return (
    <div className="content kiw-scope">
      <Card>
        <CardHeader>
          <div className="d-flex flex-wrap justify-content-between align-items-start">
            <div>
              <CardTitle tag="h4">Importar reportes por kiosco</CardTitle>
              <p className="text-muted small mb-0">
                Carga los Excel mensuales de ventas y costos, en el formato anterior o en el nuevo. Nada se guarda hasta el
                último paso, y cada lote se puede revertir.
              </p>
            </div>
            <div className="mt-2 mt-md-0">
              <Button color="warning" size="sm" outline className="btn-round mr-2" onClick={() => setShowGapFill(true)}>
                <i className="nc-icon nc-calendar-60" aria-hidden="true" /> Días sin sistema
              </Button>
              <Button color="info" size="sm" outline className="btn-round mr-2" onClick={() => setShowTemplate(true)}>
                <i className="nc-icon nc-cloud-download-93" aria-hidden="true" /> Descargar plantilla estándar
              </Button>
              <Button
                color="primary"
                size="sm"
                outline
                className="btn-round"
                aria-expanded={showHistory}
                onClick={() => setShowHistory(!showHistory)}
              >
                <i className="nc-icon nc-time-alarm" aria-hidden="true" /> Historial
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <Collapse isOpen={showHistory && !result}>
            <div className="mb-4">
              <h6>Historial de importaciones</h6>
              {showHistory && !result && <ImportHistory />}
              <hr />
            </div>
          </Collapse>

          {!result && step > 0 && dupMonths.length > 0 && (
            <Alert color="danger" role="alert">
              <strong>Hay archivos repetidos para el mismo mes.</strong> El servidor rechaza dos archivos del mismo año-mes en
              una importación:
              <ul className="mb-0 pl-3">
                {dupMonths.map((g) => (
                  <li key={g.key}>
                    {MONTHS_ES[g.month - 1]} {g.year}: {g.names.join(" · ")}
                  </li>
                ))}
              </ul>
              Quita uno de ellos (paso «Archivos») y vuelve a analizar.
            </Alert>
          )}

          <StepHeader current={step} canGoTo={canGoTo} onGoTo={setStep} finished={!!result} />

          {result ? (
            <ImportResult result={result} onReset={resetAll} />
          ) : (
            <>
              {step === 0 && (
                <StepUpload
                  files={selected}
                  onFilesChange={handleFilesChange}
                  analyzing={analyzing}
                  analyzeError={analyzeError}
                  onAnalyze={analyze}
                />
              )}
              {step === 1 && previewFiles && (
                <StepSites
                  aggregated={aggregated}
                  files={files}
                  siteMap={siteMap}
                  onSiteMapChange={setMapping}
                  sites={sites}
                  sitesLoading={sitesLoading}
                />
              )}
              {step === 2 && previewFiles && (
                <StepValidation
                  files={files}
                  siteMap={siteMap}
                  resolutionsByFile={resolutions}
                  onResolve={resolve}
                  onClearResolution={clearResolution}
                  replaceByFile={replaceByFile}
                  onReplaceChange={changeReplace}
                  onDropFile={dropFile}
                  onPeriodChange={changePeriod}
                  periodBusyIdx={periodBusyIdx}
                  counts={counts}
                />
              )}
              {step === 3 && previewFiles && (
                <StepConfirm
                  summary={summary}
                  replaceExisting={replaceExisting}
                  onReplaceExistingChange={setReplaceExisting}
                  committing={committing}
                  error={commitError}
                  onCommit={commit}
                />
              )}

              {step > 0 && step < 3 && (
                <div className="kiw-actions">
                  <Button color="secondary" outline className="btn-round" onClick={back}>
                    ← Atrás
                  </Button>
                  <div className="d-flex align-items-center">
                    {nextDisabledReason && <span className="small text-danger mr-3">{nextDisabledReason}</span>}
                    <Button color="primary" className="btn-round" disabled={!canGoTo(step + 1)} onClick={next}>
                      Continuar →
                    </Button>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="mt-2">
                  <Button color="secondary" outline className="btn-round" disabled={committing} onClick={back}>
                    ← Atrás
                  </Button>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <TemplateModal isOpen={showTemplate} toggle={() => setShowTemplate(false)} sites={sites} />
      <GapFillModal isOpen={showGapFill} toggle={() => setShowGapFill(false)} />
      <ConfirmModal
        isOpen={pendingHref !== null}
        toggle={cancelLeave}
        onConfirm={confirmLeave}
        title="Importación en curso"
        message="Tienes archivos analizados sin importar. Si sales de esta pantalla se perderá el análisis."
        confirmText="Salir sin importar"
        confirmColor="danger"
      />
    </div>
  );
}

export default KioskImportWizard;
