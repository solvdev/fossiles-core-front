import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Select from "react-select";
import {
  Alert,
  Badge,
  Button,
  ButtonGroup,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Input,
  Row,
  Spinner,
} from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { useAuth } from "contexts/AuthContext";
import {
  getKioskCompleteness,
  getKioskConfig,
  getKioskSites,
  saveKioskConfigBulk,
} from "services/kioskFinancialsService";
import { MONTHS_ES, MONTHS_ES_SHORT } from "utils/financeFormat";
import { showError, showSuccess } from "utils/notificationHelper";
import CompletenessHeatmap from "./kioskCosts/CompletenessHeatmap";
import CopyModal from "./kioskCosts/CopyModal";
import CostGrid from "./kioskCosts/CostGrid";
import SitesDrawer from "./kioskCosts/SitesDrawer";
import UnsavedBar from "./kioskCosts/UnsavedBar";
import useUnsavedGuard from "./kioskCosts/useUnsavedGuard";
import { buildMonthGrid, buildSiteGrid } from "./kioskCosts/gridBuilders";
import { applyPending, buildChanges, indexConfig, isMonthComplete, summarizePending } from "./kioskCosts/costsModel";
import "./kioskCosts/KioskCosts.css";

const PERM_EDIT = "KIOSCOS.FINANZAS.EDITAR";

const buildYears = () => {
  const current = new Date().getFullYear();
  const last = Math.max(2026, current);
  const years = [];
  for (let y = 2025; y <= last; y += 1) years.push(y);
  return years;
};

function KioskCosts() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission(PERM_EDIT);

  const years = useMemo(buildYears, []);
  const nowYear = new Date().getFullYear();
  const [year, setYear] = useState(years.includes(nowYear) ? nowYear : years[years.length - 1]);
  const [mode, setMode] = useState("site"); // "site" | "month"
  const [siteId, setSiteId] = useState(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [config, setConfig] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState("");
  const [sites, setSites] = useState([]);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [sitesError, setSitesError] = useState("");
  const [completeness, setCompleteness] = useState(null);
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [completenessError, setCompletenessError] = useState("");

  const [pending, setPending] = useState({});
  const [saving, setSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingYear, setPendingYear] = useState(null);
  const [showCopy, setShowCopy] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [focusRequest, setFocusRequest] = useState(null);
  const [lastJump, setLastJump] = useState(null);

  const loadSeq = useRef(0);
  const pendingCount = Object.keys(pending).length;
  const dirty = pendingCount > 0;
  const { pendingHref, confirmLeave, cancelLeave } = useUnsavedGuard(dirty);

  const index = useMemo(() => indexConfig(config), [config]);
  const categories = useMemo(() => (config && config.categories) || [], [config]);
  const siteList = useMemo(
    () => ((config && config.sites) || []).map((s) => ({ siteId: s.siteId, name: s.name, status: s.status })),
    [config]
  );

  const loadConfig = useCallback(async (targetYear) => {
    const seq = ++loadSeq.current;
    setConfigLoading(true);
    setConfigError("");
    try {
      const data = await getKioskConfig({ year: targetYear });
      if (seq !== loadSeq.current) return;
      setConfig(data);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setConfig(null);
      setConfigError(err.message || "No se pudo cargar la configuración de costos.");
    } finally {
      if (seq === loadSeq.current) setConfigLoading(false);
    }
  }, []);

  const loadCompleteness = useCallback(async (targetYear) => {
    setCompletenessLoading(true);
    setCompletenessError("");
    try {
      setCompleteness(await getKioskCompleteness({ year: targetYear }));
    } catch (err) {
      setCompleteness(null);
      setCompletenessError(err.message || "No se pudo cargar la completitud.");
    } finally {
      setCompletenessLoading(false);
    }
  }, []);

  const loadSites = useCallback(async () => {
    setSitesLoading(true);
    setSitesError("");
    try {
      setSites((await getKioskSites()) || []);
    } catch (err) {
      setSitesError(err.message || "No se pudieron cargar los sitios.");
    } finally {
      setSitesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig(year);
    loadCompleteness(year);
  }, [year, loadConfig, loadCompleteness]);

  useEffect(() => {
    loadSites();
  }, [loadSites]);

  // Kiosco activo: el elegido si existe en el año cargado, si no el primero
  const activeSiteId = useMemo(() => {
    if (siteList.length === 0) return null;
    return siteList.some((s) => s.siteId === siteId) ? siteId : siteList[0].siteId;
  }, [siteList, siteId]);

  const changeYear = (y) => {
    if (y === year) return;
    if (dirty) setPendingYear(y);
    else setYear(y);
  };

  const handleEdit = useCallback(
    (edits) => {
      if (!canEdit) return;
      setPending((prev) => edits.reduce((acc, { ref, value }) => applyPending(acc, index, ref, value), prev));
    },
    [canEdit, index]
  );

  const reloadAll = useCallback(async () => {
    await Promise.all([loadConfig(year), loadCompleteness(year)]);
  }, [loadConfig, loadCompleteness, year]);

  const save = async () => {
    const changes = buildChanges(pending);
    if (changes.length === 0) return;
    setSaving(true);
    try {
      const res = await saveKioskConfigBulk({ year, changes });
      showSuccess(
        `Guardado: ${res?.updatedCells ?? pendingCount} celda(s) en ${res?.updatedMonths ?? changes.length} mes(es)`
      );
      setPending({});
      await reloadAll();
    } catch (err) {
      showError(err.message || "No se pudieron guardar los cambios. Tus ediciones se conservan.");
    } finally {
      setSaving(false);
    }
  };

  const model = useMemo(() => {
    if (!config || siteList.length === 0) return null;
    if (mode === "site") {
      if (activeSiteId === null) return null;
      return buildSiteGrid({ index, pending, categories, siteId: activeSiteId });
    }
    return buildMonthGrid({ index, pending, categories, siteList, month });
  }, [config, siteList, mode, activeSiteId, month, index, pending, categories]);

  const siteOptions = siteList.map((s) => ({
    value: s.siteId,
    label: s.status === "CLOSED" ? `${s.name} (cerrado)` : s.name,
  }));

  const completeMonths = useMemo(() => {
    if (mode !== "site" || activeSiteId === null) return 0;
    let n = 0;
    for (let m = 1; m <= 12; m += 1) if (isMonthComplete(index, pending, categories, activeSiteId, m)) n += 1;
    return n;
  }, [mode, activeSiteId, index, pending, categories]);

  const jumpTo = (targetSiteId, targetMonth) => {
    setLastJump({ siteId: targetSiteId, month: targetMonth });
    if (mode === "site") {
      setSiteId(targetSiteId);
      setFocusRequest({ r: 1, c: targetMonth - 1, nonce: Date.now() });
    } else {
      setMonth(targetMonth);
      const row = Math.max(0, siteList.findIndex((s) => s.siteId === targetSiteId));
      setFocusRequest({ r: row, c: 0, nonce: Date.now() });
    }
  };

  const openCopy = () => {
    if (dirty) {
      showError("Guarda o descarta los cambios pendientes antes de copiar.");
      return;
    }
    setShowCopy(true);
  };

  const saveSummary = (
    <div>
      <p className="mb-2">
        Se guardarán <strong>{pendingCount}</strong> cambio{pendingCount === 1 ? "" : "s"} del año{" "}
        <strong>{year}</strong> en una sola operación:
      </p>
      <ul className="pl-3" style={{ maxHeight: 220, overflowY: "auto" }}>
        {summarizePending(pending, index).map((s) => (
          <li key={s.siteId}>
            <strong>{s.name}</strong>: {s.cells} celda{s.cells === 1 ? "" : "s"} en {s.months.map((m) => MONTHS_ES_SHORT[m - 1]).join(", ")}
          </li>
        ))}
      </ul>
      <p className="small text-muted mb-0">Las celdas editadas quedan marcadas como captura manual.</p>
    </div>
  );

  return (
    <div className="content kc-scope">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex flex-wrap justify-content-between align-items-start">
                <div>
                  <CardTitle tag="h4">
                    Costos por kiosco{" "}
                    {!canEdit && (
                      <Badge color="secondary" pill className="align-middle">
                        Solo lectura
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-muted small mb-0">
                    Costos fijos, metas y tasas variables por kiosco y mes. Los cálculos de finanzas usan estos valores.
                  </p>
                </div>
                <div className="mt-2 mt-md-0">
                  {canEdit && (
                    <Button color="info" className="btn-round mr-2" size="sm" onClick={openCopy}>
                      <i className="nc-icon nc-single-copy-04" aria-hidden="true" /> Copiar de…
                    </Button>
                  )}
                  <Button color="primary" className="btn-round" size="sm" outline onClick={() => setShowDrawer(true)}>
                    <i className="nc-icon nc-shop" aria-hidden="true" /> Sitios
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <div className="kc-toolbar">
                <div className="kc-field">
                  <label id="kc-year-label">Año</label>
                  <ButtonGroup className="kc-seg" role="group" aria-labelledby="kc-year-label">
                    {years.map((y) => (
                      <Button
                        key={y}
                        color="primary"
                        outline={y !== year}
                        aria-pressed={y === year}
                        onClick={() => changeYear(y)}
                      >
                        {y}
                      </Button>
                    ))}
                  </ButtonGroup>
                </div>
                <div className="kc-field">
                  <label id="kc-mode-label">Vista</label>
                  <ButtonGroup className="kc-seg" role="group" aria-labelledby="kc-mode-label">
                    <Button color="info" outline={mode !== "site"} aria-pressed={mode === "site"} onClick={() => setMode("site")}>
                      Por kiosco
                    </Button>
                    <Button color="info" outline={mode !== "month"} aria-pressed={mode === "month"} onClick={() => setMode("month")}>
                      Por mes
                    </Button>
                  </ButtonGroup>
                </div>
                {mode === "site" ? (
                  <div className="kc-field kc-site-select">
                    <label htmlFor="kc-site-select">Kiosco</label>
                    <Select
                      inputId="kc-site-select"
                      options={siteOptions}
                      value={siteOptions.find((o) => o.value === activeSiteId) || null}
                      onChange={(o) => o && setSiteId(o.value)}
                      placeholder="Selecciona un kiosco"
                      noOptionsMessage={() => "Sin resultados"}
                      isDisabled={siteOptions.length === 0}
                      classNamePrefix="react-select"
                    />
                  </div>
                ) : (
                  <div className="kc-field">
                    <label htmlFor="kc-month-select">Mes</label>
                    <Input id="kc-month-select" type="select" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
                      {MONTHS_ES.map((m, i) => (
                        <option key={m} value={i + 1}>
                          {m}
                        </option>
                      ))}
                    </Input>
                  </div>
                )}
                {mode === "site" && model && (
                  <div className="kc-field">
                    <label>Completitud</label>
                    <span className="small">
                      <strong>{completeMonths}</strong> de 12 meses completos
                    </span>
                  </div>
                )}
              </div>

              <div className="kc-legend mb-2">
                <span>
                  <span className="kc-swatch" style={{ background: "#fff6dc", boxShadow: "inset 3px 0 0 #fbc658" }} /> Modificado sin guardar
                </span>
                <span>
                  <span className="kc-mark kc-mark-ok">✓</span> Mes completo
                </span>
                <span>
                  <span className="kc-mark kc-mark-warn">!</span> Incompleto
                </span>
                <span className="text-muted">
                  Flechas y Tab para moverte · Enter o doble clic para editar · Esc cancela · Supr borra · Pega bloques desde Excel
                </span>
              </div>

              {configError ? (
                <Alert color="danger">
                  {configError}{" "}
                  <Button color="danger" size="sm" outline className="ml-2" onClick={() => loadConfig(year)}>
                    Reintentar
                  </Button>
                </Alert>
              ) : (configLoading && !config) || (config && siteList.length > 0 && !model) ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <div className="text-muted mt-2">Cargando costos {year}...</div>
                </div>
              ) : config && siteList.length === 0 ? (
                <div className="text-center py-5 text-muted">
                  <p>No hay kioscos configurados para {year}.</p>
                  <p className="small">
                    Importa los reportes mensuales o crea un sitio histórico desde el panel «Sitios».{" "}
                    <Link to="/admin/kiosk-financials/import">Ir a importar reportes</Link>
                  </p>
                </div>
              ) : model ? (
                <div style={{ opacity: configLoading ? 0.55 : 1 }} aria-busy={configLoading}>
                  <CostGrid
                    key={mode}
                    model={model}
                    readOnly={!canEdit || saving}
                    onEdit={handleEdit}
                    focusRequest={focusRequest}
                    ariaLabel={
                      mode === "site"
                        ? `Costos ${year} de ${siteList.find((s) => s.siteId === activeSiteId)?.name || ""} por mes`
                        : `Costos de ${MONTHS_ES[month - 1]} ${year} por kiosco`
                    }
                  />
                </div>
              ) : null}
            </CardBody>
          </Card>

          <CompletenessHeatmap
            data={completeness}
            loading={completenessLoading}
            error={completenessError}
            selected={lastJump}
            onJump={jumpTo}
          />
        </Col>
      </Row>

      <UnsavedBar
        count={pendingCount}
        saving={saving}
        onSave={() => setShowSaveConfirm(true)}
        onDiscard={() => setShowDiscardConfirm(true)}
      />

      <ConfirmModal
        isOpen={showSaveConfirm}
        toggle={() => setShowSaveConfirm(false)}
        onConfirm={save}
        title="Guardar cambios"
        message={saveSummary}
        confirmText="Guardar"
        confirmColor="success"
      />
      <ConfirmModal
        isOpen={showDiscardConfirm}
        toggle={() => setShowDiscardConfirm(false)}
        onConfirm={() => setPending({})}
        title="Descartar cambios"
        message={`Se perderán ${pendingCount} cambio${pendingCount === 1 ? "" : "s"} sin guardar.`}
        confirmText="Descartar"
        confirmColor="danger"
      />
      <ConfirmModal
        isOpen={pendingYear !== null}
        toggle={() => setPendingYear(null)}
        onConfirm={() => {
          setPending({});
          setYear(pendingYear);
        }}
        title="Cambios sin guardar"
        message={`Tienes ${pendingCount} cambio${pendingCount === 1 ? "" : "s"} sin guardar. Si cambias de año se perderán.`}
        confirmText="Descartar y cambiar de año"
        confirmColor="danger"
      />
      <ConfirmModal
        isOpen={pendingHref !== null}
        toggle={cancelLeave}
        onConfirm={() => {
          setPending({});
          confirmLeave();
        }}
        title="Cambios sin guardar"
        message={`Tienes ${pendingCount} cambio${pendingCount === 1 ? "" : "s"} sin guardar. Si sales de esta pantalla se perderán.`}
        confirmText="Salir sin guardar"
        confirmColor="danger"
      />

      <CopyModal
        isOpen={showCopy}
        toggle={() => setShowCopy(false)}
        year={year}
        years={years}
        sites={siteList}
        onCopied={(result, toYear) => {
          if (toYear === year) reloadAll();
        }}
      />
      <SitesDrawer
        isOpen={showDrawer}
        onClose={() => setShowDrawer(false)}
        sites={sites}
        loading={sitesLoading}
        error={sitesError}
        canEdit={canEdit}
        onChanged={async () => {
          await Promise.all([loadSites(), loadConfig(year), loadCompleteness(year)]);
        }}
      />
    </div>
  );
}

export default KioskCosts;
