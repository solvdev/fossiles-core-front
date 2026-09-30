import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, Nav, NavItem, NavLink, Spinner, TabContent, TabPane } from "reactstrap";
import {
  getKioskConfig,
  getKioskDailyMatrix,
  getKioskPnl,
  getKioskSites,
} from "services/kioskFinancialsService";
import { MONTHS_ES } from "utils/financeFormat";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { downloadElementPdf, exportOriginalSheetExcel } from "utils/kioskFinancialsExport";
import FinanceFilters from "./reports/FinanceFilters";
import { KButton } from "./reports/common";
import SummaryTab from "./reports/SummaryTab";
import PnlTab from "./reports/PnlTab";
import DailyMatrixTab from "./reports/DailyMatrixTab";
import GoalsTab from "./reports/GoalsTab";
import useAsyncData from "./reports/useAsyncData";
import { normalizeSiteIds, orderFixedCategories } from "./reports/financeReportHelpers";
import "./KioskFinance.css";

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "pnl", label: "P&L por kiosco" },
  { id: "diario", label: "Ventas diarias" },
  { id: "metas", label: "Metas y equilibrio" },
];

const initialFilters = () => {
  const today = getTodayYmdGuatemala();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return {
    year,
    baseYear: year - 1,
    fromMonth: 1,
    toMonth: month,
    month,
    mode: "SAME_PERIOD",
    siteIds: [],
  };
};

export default function KioskFinancialsReports() {
  const currentYear = useMemo(() => Number(getTodayYmdGuatemala().slice(0, 4)), []);
  const [activeTab, setActiveTab] = useState("resumen");
  const [filters, setFilters] = useState(initialFilters);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState(null);
  const tabsRef = useRef(null);

  const sitesQuery = useAsyncData(() => getKioskSites(), []);
  const configQuery = useAsyncData(() => getKioskConfig({ year: filters.year }), [filters.year]);
  const sites = useMemo(() => sitesQuery.data || [], [sitesQuery.data]);

  const updateFilters = useCallback((patch) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      if (patch.year !== undefined && patch.year !== prev.year) {
        // Al cambiar el año, el base pasa al anterior y el rango se ajusta al año.
        next.baseYear = patch.year - 1;
        const cur = Number(getTodayYmdGuatemala().slice(5, 7));
        const closed = patch.year < currentYear;
        next.toMonth = closed ? 12 : patch.year === currentYear ? cur : 1;
        next.month = closed ? Math.min(prev.month, 12) : patch.year === currentYear ? Math.min(prev.month, cur) : 1;
        next.fromMonth = 1;
      }
      // Mantiene el rango coherente (Desde <= Hasta).
      if (patch.fromMonth !== undefined && next.fromMonth > next.toMonth) next.toMonth = next.fromMonth;
      if (patch.toMonth !== undefined && next.toMonth < next.fromMonth) next.fromMonth = next.toMonth;
      if (patch.siteIds !== undefined) next.siteIds = normalizeSiteIds(patch.siteIds);
      return next;
    });
  }, [currentYear]);

  const activeSiteNames = useMemo(() => {
    if (!filters.siteIds.length) return "";
    const names = filters.siteIds.map((id) => (sites.find((s) => s.id === id) || {}).name).filter(Boolean);
    return names.length <= 3 ? names.join(", ") : `${names.length} kioscos seleccionados`;
  }, [filters.siteIds, sites]);

  // Mes que se exporta: el del tab activo (en Resumen, el último mes del rango).
  const exportMonth = activeTab === "resumen" ? filters.toMonth : filters.month;

  const handleExcel = async () => {
    setBusy("xlsx");
    setNotice(null);
    try {
      const { year, siteIds } = filters;
      const [matrix, pnl, config] = await Promise.all([
        getKioskDailyMatrix({ year, month: exportMonth, siteIds }),
        getKioskPnl({ year, month: exportMonth, siteIds }),
        configQuery.data ? Promise.resolve(configQuery.data) : getKioskConfig({ year }).catch(() => null),
      ]);
      const categories = orderFixedCategories(pnl, config?.categories);
      const fileName = exportOriginalSheetExcel({ year, month: exportMonth, matrix, pnl, config, categories });
      setNotice({ color: "success", text: `Excel generado: ${fileName}` });
    } catch (err) {
      setNotice({ color: "danger", text: err.message || "No se pudo generar el Excel." });
    } finally {
      setBusy("");
    }
  };

  const handlePdf = async () => {
    setBusy("pdf");
    setNotice(null);
    try {
      const tab = TABS.find((t) => t.id === activeTab);
      const period =
        activeTab === "resumen"
          ? `${MONTHS_ES[filters.fromMonth - 1]}–${MONTHS_ES[filters.toMonth - 1]} ${filters.year} vs ${filters.baseYear}`
          : `${MONTHS_ES[filters.month - 1]} ${filters.year}`;
      await downloadElementPdf(tabsRef.current, {
        title: `Finanzas por kiosco · ${tab.label} · ${period}`,
        filename: `Finanzas_Kioscos_${tab.id}_${filters.year}.pdf`,
      });
    } catch (err) {
      setNotice({ color: "danger", text: err.message || "No se pudo generar el PDF." });
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="content kfin">
      <div className="card kfin-shell">
        <div className="card-header kfin-header">
          <div>
            <h4 className="card-title kfin-title">Finanzas por kiosco</h4>
            <p className="kfin-subtitle">
              Ventas, costos, margen y metas por kiosco, con comparativo contra el año anterior.
            </p>
          </div>
          <div className="kfin-export kfin-noprint">
            <KButton
              large
              variant="good"
              onClick={handleExcel}
              disabled={!!busy}
              title="Hoja con el layout original de los Excel de ventas"
            >
              {busy === "xlsx" ? <Spinner size="sm" /> : null} Exportar Excel · {MONTHS_ES[exportMonth - 1]} {filters.year}
            </KButton>
            <KButton large onClick={handlePdf} disabled={!!busy}>
              {busy === "pdf" ? <Spinner size="sm" /> : null} Exportar PDF
            </KButton>
          </div>
        </div>
        <div className="card-body">
          {notice ? (
            <Alert color={notice.color} toggle={() => setNotice(null)} fade={false} className="kfin-noprint">
              {notice.text}
            </Alert>
          ) : null}
          {sitesQuery.error ? (
            <Alert color="warning" fade={false}>
              No se pudo cargar la lista de kioscos ({sitesQuery.error}). El filtro por kiosco no estará disponible.
            </Alert>
          ) : null}

          <Nav tabs className="kfin-tabs kfin-noprint" role="tablist">
            {TABS.map((t) => (
              <NavItem key={t.id}>
                <NavLink
                  href="#"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  className={activeTab === t.id ? "active" : ""}
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveTab(t.id);
                  }}
                >
                  {t.label}
                </NavLink>
              </NavItem>
            ))}
          </Nav>

          <FinanceFilters
            tab={activeTab}
            filters={filters}
            onChange={updateFilters}
            sites={sites}
            sitesLoading={sitesQuery.loading}
            currentYear={currentYear}
          />

          <div ref={tabsRef} className="kfin-print-area">
            <TabContent activeTab={activeTab}>
              <TabPane tabId="resumen">
                {activeTab === "resumen" && <SummaryTab filters={filters} activeSiteNames={activeSiteNames} />}
              </TabPane>
              <TabPane tabId="pnl">
                {activeTab === "pnl" && <PnlTab filters={filters} config={configQuery.data} />}
              </TabPane>
              <TabPane tabId="diario">{activeTab === "diario" && <DailyMatrixTab filters={filters} />}</TabPane>
              <TabPane tabId="metas">{activeTab === "metas" && <GoalsTab filters={filters} />}</TabPane>
            </TabContent>
          </div>
        </div>
      </div>
    </div>
  );
}
