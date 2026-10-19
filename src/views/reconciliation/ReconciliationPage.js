import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button, Card, CardBody, CardHeader, CardTitle, DropdownItem, DropdownMenu, DropdownToggle, Nav, NavItem, NavLink, UncontrolledDropdown,
} from "reactstrap";
import { useAuth } from "contexts/AuthContext";
import { autoApplyReceipts, getBatches, getSellers, revalidatePeriod } from "services/reconciliationService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import { defaultFilters, loadFilters, saveFilters } from "utils/reconciliationHelper";
import ReconBatchesTab from "components/reconciliation/ReconBatchesTab";
import ReconCaseDrawer from "components/reconciliation/ReconCaseDrawer";
import ReconCommissionsTab from "components/reconciliation/ReconCommissionsTab";
import ReconDashboardTab from "components/reconciliation/ReconDashboardTab";
import ReconDifferencesTab from "components/reconciliation/ReconDifferencesTab";
import ReconFilters from "components/reconciliation/ReconFilters";
import ReconInboxTab from "components/reconciliation/ReconInboxTab";
import ReconSimpleView from "components/reconciliation/ReconSimpleView";
import {
  GenerateCasesModal, ImportGuidesModal, ImportReceiptsModal, ManualReceiptModal, QuickPaymentsModal,
} from "components/reconciliation/ReconToolsModals";
import "components/reconciliation/Reconciliation.css";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "inbox", label: "Bandeja" },
  { id: "differences", label: "Diferencias" },
  { id: "batches", label: "Lotes y descargas" },
  { id: "commissions", label: "Comisiones" },
];

const VIEW_KEY = "recon.view";

const safeStorage = () => {
  try {
    return window.localStorage;
  } catch (e) {
    return null;
  }
};

/**
 * Conciliación de ventas en línea. Entra en la vista simple de cuadre (ventas del sistema → pagos recibidos → cerrar);
 * la vista completa conserva dashboard, bandeja, diferencias, lotes y comisiones.
 * La regla principal: lo cobrado debe ser igual a lo recibido, al centavo, sin tolerancias.
 */
const ReconciliationPage = () => {
  const { hasPermission } = useAuth();
  const today = getTodayYmdGuatemala();
  const perms = useMemo(() => ({
    reconcile: hasPermission("VENTAS.CONCILIACION.CONCILIAR"),
    import: hasPermission("VENTAS.CONCILIACION.IMPORTAR"),
    adjust: hasPermission("VENTAS.CONCILIACION.AJUSTAR"),
    authorize: hasPermission("VENTAS.CONCILIACION.AUTORIZAR"),
    close: hasPermission("VENTAS.CONCILIACION.CERRAR"),
    commissions: hasPermission("VENTAS.CONCILIACION.COMISIONES"),
  }), [hasPermission]);

  const [tab, setTab] = useState("dashboard");
  const [filters, setFilters] = useState(() => loadFilters(safeStorage(), defaultFilters(today)));
  const [sellers, setSellers] = useState([]);
  const [batches, setBatches] = useState([]);
  const [version, setVersion] = useState(0);
  const [openId, setOpenId] = useState(null);
  const [rowIds, setRowIds] = useState([]);
  const [problem, setProblem] = useState("");
  const [modal, setModal] = useState(null);
  const [view, setView] = useState(() => {
    try { return (safeStorage() && safeStorage().getItem(VIEW_KEY)) === "full" ? "full" : "simple"; } catch (e) { return "simple"; }
  });
  const switchView = (v) => {
    setView(v);
    try { const st = safeStorage(); if (st) st.setItem(VIEW_KEY, v); } catch (e) { /* solo es una preferencia */ }
  };

  useEffect(() => { saveFilters(safeStorage(), filters); }, [filters]);
  useEffect(() => {
    getSellers().then(setSellers).catch(() => setSellers([]));
    getBatches().then(setBatches).catch(() => setBatches([]));
  }, [version]);
  useEffect(() => {
    document.body.classList.toggle("recon-drawer-open", openId != null);
    return () => document.body.classList.remove("recon-drawer-open");
  }, [openId]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const goInbox = (patch) => { setFilters((f) => ({ ...f, ...patch })); setTab("inbox"); };
  const goTab = (id, problemType) => { setTab(id); if (problemType !== undefined) setProblem(problemType); };

  const step = (delta) => {
    const i = rowIds.indexOf(openId);
    const next = rowIds[i + delta];
    if (next) setOpenId(next);
  };

  const runAutoApply = async () => {
    try {
      const r = await autoApplyReceipts();
      (r.ambiguous || r.unmatched ? showWarning : showSuccess)(`${r.autoApplied} fondos aplicados solos. ${r.ambiguous} ambiguos y ${r.unmatched} sin coincidencia quedan para revisar en Diferencias.`);
      reload();
    } catch (e) { showError(e.message); }
  };

  const runRevalidate = async () => {
    try {
      const r = await revalidatePeriod(filters.from, filters.to);
      showSuccess(`${r.revalidated} casos revalidados.`);
      reload();
    } catch (e) { showError(e.message); }
  };

  return (
    <div className="content recon-page">
      <Card>
        <CardHeader className="d-flex justify-content-between align-items-start flex-wrap" style={{ gap: 8 }}>
          <div>
            <CardTitle tag="h4" className="mb-0">Conciliación de ventas en línea</CardTitle>
            <small className="text-muted">Lo cobrado debe ser igual a lo recibido, al centavo. Sin tolerancias.</small>
          </div>
          <div className="d-flex align-items-center" style={{ gap: 8 }}>
            <Button color="primary" size="sm" outline={view === "simple"} disabled={!perms.import} onClick={() => setModal("quick")}>
              {view === "simple" ? "Registrar varios por ENVL" : "Registrar pagos"}
            </Button>
            {view === "simple" ? (
              <Button color="secondary" size="sm" outline onClick={() => switchView("full")}>Vista completa</Button>
            ) : (
              <Button color="secondary" size="sm" outline onClick={() => switchView("simple")}>Vista simple</Button>
            )}
            {view === "full" && <UncontrolledDropdown>
              <DropdownToggle caret outline color="primary" size="sm">Más herramientas</DropdownToggle>
              <DropdownMenu right>
                <DropdownItem header>Preparar</DropdownItem>
                <DropdownItem disabled={!perms.reconcile} onClick={() => setModal("generate")}>Generar casos del período</DropdownItem>
                <DropdownItem disabled={!perms.reconcile} onClick={runRevalidate}>Revalidar el período</DropdownItem>
                <DropdownItem divider />
                <DropdownItem header>Si prefiere cargar un archivo</DropdownItem>
                <DropdownItem disabled={!perms.import} onClick={() => setModal("import")}>Importar liquidación o extracto (Excel/CSV)</DropdownItem>
                <DropdownItem disabled={!perms.import} onClick={() => setModal("guides")}>Importar guías históricas</DropdownItem>
                <DropdownItem disabled={!perms.import} onClick={runAutoApply}>Aplicar fondos pendientes</DropdownItem>
                <DropdownItem divider />
                <DropdownItem disabled={!perms.import} onClick={() => setModal("manual")}>Capturar un fondo suelto (sin venta conocida)</DropdownItem>
              </DropdownMenu>
            </UncontrolledDropdown>}
          </div>
        </CardHeader>
        <CardBody>
          {view === "simple" && (
            <ReconSimpleView filters={filters} onFilters={setFilters} version={version} perms={perms} onOpen={setOpenId} onChanged={reload} onRowsLoaded={setRowIds} />
          )}
          {view === "full" && <>
          <Nav tabs className="recon-tabs mb-3" role="tablist">
            {TABS.map((t) => (
              <NavItem key={t.id}>
                <NavLink active={tab === t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</NavLink>
              </NavItem>
            ))}
          </Nav>
          {tab !== "batches" && tab !== "commissions" && (
            <ReconFilters filters={filters} onChange={setFilters} sellers={sellers} batches={batches} today={today} hideStatus={tab === "differences"} hideBatch={tab === "differences"} />
          )}
          {tab === "dashboard" && <ReconDashboardTab filters={filters} version={version} onGoInbox={goInbox} onGoTab={goTab} />}
          {tab === "inbox" && (
            <ReconInboxTab filters={filters} onFilters={setFilters} version={version} openId={openId} onOpen={setOpenId} perms={perms}
              onChanged={reload} onRowsLoaded={setRowIds} />
          )}
          {tab === "differences" && (
            <ReconDifferencesTab filters={filters} version={version} selectedProblem={problem} onSelectProblem={setProblem} onOpen={setOpenId} perms={perms} onChanged={reload} />
          )}
          {tab === "batches" && <ReconBatchesTab filters={filters} version={version} perms={perms} onChanged={reload} onGoInbox={goInbox} />}
          {tab === "commissions" && <ReconCommissionsTab filters={filters} version={version} perms={perms} onGoInbox={goInbox} onChanged={reload} />}
          </>}
        </CardBody>
      </Card>

      {openId != null && (
        <ReconCaseDrawer id={openId} perms={perms} onClose={() => setOpenId(null)} onChanged={reload} onPrev={() => step(-1)} onNext={() => step(1)} />
      )}

      {modal === "generate" && <GenerateCasesModal isOpen toggle={() => setModal(null)} defaultFrom={filters.from} defaultTo={filters.to} onDone={reload} />}
      {modal === "import" && <ImportReceiptsModal isOpen toggle={() => setModal(null)} onDone={reload} />}
      {modal === "quick" && <QuickPaymentsModal isOpen toggle={() => setModal(null)} onDone={reload} />}
      {modal === "manual" && <ManualReceiptModal isOpen toggle={() => setModal(null)} onDone={reload} />}
      {modal === "guides" && <ImportGuidesModal isOpen toggle={() => setModal(null)} onDone={reload} />}
    </div>
  );
};

export default ReconciliationPage;
