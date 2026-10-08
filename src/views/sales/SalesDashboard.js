import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Nav, NavItem, NavLink } from "reactstrap";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { KButton, KSeg } from "views/kiosks/finance/reports/common";
import ConsolidatedTab from "views/sales/dashboard/ConsolidatedTab";
import KioskTab from "views/sales/dashboard/KioskTab";
import OnlineTab from "views/sales/dashboard/OnlineTab";
import VendorTab from "views/sales/dashboard/VendorTab";
import {
  MONTH_OPTIONS_COUNT,
  SHORTCUTS,
  SOURCE_DESCRIPTION,
  TABS,
  activeShortcut,
  applyRangeChange,
  buildMonthOptions,
  describePeriod,
  detectMonth,
  monthRange,
  parseDashboardParams,
  previousRange,
  shortcutRange,
  stepMonth,
} from "views/sales/dashboard/salesDashboardHelpers";
import "views/kiosks/finance/KioskFinance.css";
import "views/sales/dashboard/SalesDashboard.css";

const PANEL_ID = "sdash-panel";

/** Triángulo de los botones de mes (SVG: los glifos ◀ ▶ se dibujan como emoji en algunos móviles). */
function MonthStepIcon({ direction }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <path d={direction < 0 ? "M11.5 2v12L3.5 8z" : "M4.5 2v12l8-6z"} fill="currentColor" />
    </svg>
  );
}
const UNSAVED_AD_SPEND_CONFIRM =
  "Tienes cambios de inversión en publicidad sin guardar. Si cambias de pestaña se perderán. ¿Quieres salir sin guardarlos?";

/**
 * Dashboard de ventas por fuente: Consolidado · Kioskos · Online · Vendedor LF.
 * El estado vive en la URL (?tab=&startDate=&endDate=&kioskLocationId=) y cada pestaña consulta su propio
 * endpoint solo cuando está activa.
 */
function SalesDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [today] = useState(getTodayYmdGuatemala);
  const { tab, startDate, endDate, kioskLocationId } = useMemo(
    () => parseDashboardParams(searchParams, today),
    [searchParams, today]
  );
  // Borrador de las fechas: mientras se teclea una fecha incompleta no se toca la URL ni se consulta.
  const [draft, setDraft] = useState({ startDate, endDate });
  const [refreshToken, setRefreshToken] = useState(0);
  // 'Publicidad vs ventas' (pestaña Online) avisa si hay capturas sin guardar para no perderlas al cambiar de pestaña.
  const adSpendDirtyRef = useRef(false);
  const onAdSpendDirtyChange = useCallback((dirty) => {
    adSpendDirtyRef.current = dirty;
  }, []);

  useEffect(() => {
    setDraft({ startDate, endDate });
  }, [startDate, endDate]);

  const updateParams = useCallback(
    (patch, { push = false } = {}) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined || value === null || value === "") next.delete(key);
            else next.set(key, value);
          });
          return next;
        },
        { replace: !push }
      );
    },
    [setSearchParams]
  );

  const selectTab = useCallback(
    (id) => {
      if (id === tab) return;
      if (adSpendDirtyRef.current && !window.confirm(UNSAVED_AD_SPEND_CONFIRM)) return;
      // El kiosko elegido solo aplica a la pestaña Kioskos.
      updateParams({ tab: id, startDate, endDate, kioskLocationId: "" }, { push: true });
    },
    [tab, startDate, endDate, updateParams]
  );

  const onDateChange = (field) => (event) => {
    const value = event.target.value;
    setDraft((prev) => ({ ...prev, [field]: value }));
    const next = applyRangeChange({ startDate, endDate }, field, value);
    if (next) updateParams({ startDate: next.startDate, endDate: next.endDate });
  };

  const applyRange = (range) => {
    if (range) updateParams({ startDate: range.startDate, endDate: range.endDate });
  };

  const applyShortcut = (id) => applyRange(shortcutRange(id, getTodayYmdGuatemala()));

  // Mes calendario completo (o mes en curso hasta hoy); "" = rango personalizado. Sale de la URL, no del borrador:
  // una fecha a medio teclear no cambia el selector.
  const selectedMonth = detectMonth(startDate, endDate, today);
  const monthOptions = useMemo(
    () => buildMonthOptions(today, MONTH_OPTIONS_COUNT, selectedMonth),
    [today, selectedMonth]
  );
  const canStepBack = stepMonth(startDate, endDate, today, -1) !== null;
  const canStepForward = stepMonth(startDate, endDate, today, 1) !== null;

  const onMonthChange = (event) => {
    if (event.target.value) applyRange(monthRange(event.target.value, getTodayYmdGuatemala()));
  };

  const onMonthStep = (delta) => applyRange(stepMonth(startDate, endDate, getTodayYmdGuatemala(), delta));

  const currentShortcut = activeShortcut(startDate, endDate, today);
  const previous = previousRange(startDate, endDate);
  const subtitle = [
    describePeriod(startDate, endDate),
    `comparado con ${describePeriod(previous.startDate, previous.endDate)}`,
    SOURCE_DESCRIPTION[tab],
  ].join(" · ");

  const tabProps = { startDate, endDate, refreshToken };
  let content;
  switch (tab) {
    case "kioskos":
      content = (
        <KioskTab
          {...tabProps}
          kioskLocationId={kioskLocationId}
          onKioskChange={(value) => updateParams({ kioskLocationId: value })}
        />
      );
      break;
    case "online":
      content = <OnlineTab {...tabProps} onAdSpendDirtyChange={onAdSpendDirtyChange} />;
      break;
    case "vendedor":
      content = <VendorTab {...tabProps} />;
      break;
    default:
      content = <ConsolidatedTab {...tabProps} onSelectTab={selectTab} />;
  }

  return (
    <div className="content kfin sdash">
      <div className="card kfin-shell">
        <div className="card-header kfin-header">
          <div>
            <h4 className="card-title kfin-title">Dashboard de ventas</h4>
            <p className="kfin-subtitle">{subtitle}</p>
          </div>
          <div className="kfin-filters sdash-filters kfin-noprint">
            <div className="sdash-fgroup">
              <div className="kfin-field sdash-month">
                <label htmlFor="sdash-month">Mes</label>
                <div className="sdash-month-control" role="group" aria-label="Selector de mes">
                  <KButton
                    large
                    className="sdash-month-step"
                    aria-label="Mes anterior"
                    title="Mes anterior"
                    disabled={!canStepBack}
                    onClick={() => onMonthStep(-1)}
                  >
                    <MonthStepIcon direction={-1} />
                  </KButton>
                  <select
                    id="sdash-month"
                    className="form-control sdash-month-select"
                    value={selectedMonth}
                    onChange={onMonthChange}
                  >
                    {monthOptions.map((o) => (
                      // 'Personalizado' no se elige a mano: se activa solo y queda deshabilitado mientras el rango es un mes
                      <option key={o.value || "custom"} value={o.value} disabled={o.value === "" && selectedMonth !== ""}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <KButton
                    large
                    className="sdash-month-step"
                    aria-label="Mes siguiente"
                    title="Mes siguiente"
                    disabled={!canStepForward}
                    onClick={() => onMonthStep(1)}
                  >
                    <MonthStepIcon direction={1} />
                  </KButton>
                </div>
              </div>
              <div className="kfin-field">
                <label htmlFor="sdash-start">Desde</label>
                <input
                  id="sdash-start"
                  type="date"
                  className="form-control"
                  value={draft.startDate}
                  onChange={onDateChange("startDate")}
                />
              </div>
              <div className="kfin-field">
                <label htmlFor="sdash-end">Hasta</label>
                <input
                  id="sdash-end"
                  type="date"
                  className="form-control"
                  value={draft.endDate}
                  onChange={onDateChange("endDate")}
                />
              </div>
            </div>
            <div className="sdash-fgroup">
              <KSeg aria-label="Atajos de fecha">
                {SHORTCUTS.map((s) => (
                  <KButton
                    key={s.id}
                    large
                    active={currentShortcut === s.id}
                    aria-pressed={currentShortcut === s.id}
                    onClick={() => applyShortcut(s.id)}
                  >
                    {s.label}
                  </KButton>
                ))}
              </KSeg>
              <KButton
                large
                onClick={() => setRefreshToken((n) => n + 1)}
                title="Vuelve a consultar sin usar la caché de 60 segundos"
              >
                Actualizar
              </KButton>
            </div>
          </div>
        </div>

        <div className="card-body">
          <Nav tabs className="kfin-tabs kfin-noprint" role="tablist" aria-label="Fuente de ventas">
            {TABS.map((t) => (
              <NavItem key={t.id}>
                <NavLink
                  href="#"
                  role="tab"
                  id={`sdash-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={PANEL_ID}
                  className={tab === t.id ? "active" : ""}
                  style={{ "--sdash-tab-accent": t.accent }}
                  onClick={(e) => {
                    e.preventDefault();
                    selectTab(t.id);
                  }}
                >
                  {t.color ? <span className="sdash-dot" style={{ background: t.color }} aria-hidden="true" /> : null}
                  {t.label}
                </NavLink>
              </NavItem>
            ))}
          </Nav>

          <div id={PANEL_ID} role="tabpanel" aria-labelledby={`sdash-tab-${tab}`} className="sdash-panel">
            {content}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SalesDashboard;
