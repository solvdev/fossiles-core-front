import React, { useMemo } from "react";
import Select from "react-select";
import { Input, UncontrolledTooltip } from "reactstrap";
import { MONTHS_ES } from "utils/financeFormat";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { KButton, KSeg } from "./common";
import {
  applySupervisorSelection,
  buildSupervisorOptions,
  describeComparison,
  selectedSupervisorOptions,
  validateCustomRange,
} from "./financeReportHelpers";

const MODE_HELP =
  "Mismas fechas: compara lo vendido en el rango elegido, sólo hasta hoy, contra esos mismos días del año base. Un kiosco que arrancó en el POS a mitad de año se compara desde su primera venta contra los mismos días del año anterior. Meses completos: compara cada mes entero de ambos años, aunque el mes actual aún no termine. Fechas específicas: tú eliges el rango exacto del periodo actual y el rango exacto contra el que se compara (cualquier día, mes o año).";

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderColor: state.isFocused ? "#51cbce" : "#dddddd",
    boxShadow: "none",
    "&:hover": { borderColor: "#51cbce" },
  }),
  menu: (base) => ({ ...base, zIndex: 30 }),
  multiValue: (base) => ({ ...base, backgroundColor: "#e4f6f7" }),
  placeholder: (base) => ({ ...base, color: "#66615b" }),
};

const yearOptions = (fromYear, toYear) => {
  const out = [];
  for (let y = toYear; y >= fromYear; y -= 1) out.push(y);
  return out;
};

/**
 * Barra de filtros compartida. `tab` decide qué campos se muestran:
 * resumen -> año, año base, desde/hasta, modo, kioscos; resto -> año, mes, kioscos.
 */
export default function FinanceFilters({
  tab,
  filters,
  onChange,
  sites,
  sitesLoading,
  currentYear,
  supervisorData,
  supervisorsLoading,
}) {
  const years = useMemo(() => yearOptions(2023, currentYear + 1), [currentYear]);
  const options = useMemo(
    () =>
      (sites || []).map((s) => ({
        value: s.id,
        label: s.status === "CLOSED" ? `${s.name} (cerrado)` : s.name,
      })),
    [sites]
  );
  const selected = options.filter((o) => filters.siteIds.includes(o.value));
  const isSummary = tab === "resumen";
  const supervisorOptions = useMemo(() => buildSupervisorOptions(supervisorData), [supervisorData]);
  const selectedSupervisors = useMemo(
    () => selectedSupervisorOptions(supervisorOptions, filters.siteIds),
    [supervisorOptions, filters.siteIds]
  );
  const today = getTodayYmdGuatemala();
  const isCustom = isSummary && filters.mode === "CUSTOM";
  const comparisonText = isSummary ? describeComparison({ ...filters, today }) : "";
  const customError = isCustom ? validateCustomRange({ ...filters, today }) : null;

  const isForecast = tab === "proyeccion";

  return (
    <div className="kfin-filters kfin-noprint" role="search" aria-label="Filtros del reporte">
      {!isForecast && !isCustom && (
      <div className="kfin-field">
        <label htmlFor="kfin-year">Año</label>
        <Input
          type="select"
          id="kfin-year"
          bsSize="sm"
          value={filters.year}
          onChange={(e) => onChange({ year: Number(e.target.value) })}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Input>
      </div>
      )}

      {isForecast ? null : isCustom ? (
        <>
          <div className="kfin-field kfin-field--dates">
            <span className="kfin-label" id="kfin-cur-label">Periodo actual</span>
            <div className="kfin-daterange" role="group" aria-labelledby="kfin-cur-label">
              <Input
                type="date"
                bsSize="sm"
                aria-label="Periodo actual, desde"
                max={today}
                value={filters.from}
                onChange={(e) => onChange({ from: e.target.value })}
              />
              <span aria-hidden="true">–</span>
              <Input
                type="date"
                bsSize="sm"
                aria-label="Periodo actual, hasta"
                max={today}
                value={filters.to}
                onChange={(e) => onChange({ to: e.target.value })}
              />
            </div>
          </div>
          <div className="kfin-field kfin-field--dates">
            <span className="kfin-label" id="kfin-base-label">Comparar contra</span>
            <div className="kfin-daterange" role="group" aria-labelledby="kfin-base-label">
              <Input
                type="date"
                bsSize="sm"
                aria-label="Periodo de comparación, desde"
                max={today}
                value={filters.baseFrom}
                onChange={(e) => onChange({ baseFrom: e.target.value })}
              />
              <span aria-hidden="true">–</span>
              <Input
                type="date"
                bsSize="sm"
                aria-label="Periodo de comparación, hasta"
                max={today}
                value={filters.baseTo}
                onChange={(e) => onChange({ baseTo: e.target.value })}
              />
            </div>
          </div>
          <div className="kfin-field">
            <span className="kfin-label" id="kfin-preset-label">Atajos</span>
            <KSeg aria-labelledby="kfin-preset-label">
              <KButton
                title="Pone el periodo de comparación en las mismas fechas, un año antes"
                onClick={() => onChange({ preset: "LAST_YEAR" })}
              >
                Mismas fechas, año anterior
              </KButton>
              <KButton
                title="Pone el periodo de comparación justo antes del actual, con la misma duración"
                onClick={() => onChange({ preset: "PREVIOUS" })}
              >
                Periodo anterior
              </KButton>
            </KSeg>
          </div>
        </>
      ) : isSummary ? (
        <>
          <div className="kfin-field">
            <label htmlFor="kfin-base">Año base</label>
            <Input
              type="select"
              id="kfin-base"
              bsSize="sm"
              value={filters.baseYear}
              onChange={(e) => onChange({ baseYear: Number(e.target.value) })}
            >
              {years
                .filter((y) => y !== filters.year)
                .map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
            </Input>
          </div>
          <div className="kfin-field">
            <label htmlFor="kfin-from">Desde</label>
            <Input
              type="select"
              id="kfin-from"
              bsSize="sm"
              value={filters.fromMonth}
              onChange={(e) => onChange({ fromMonth: Number(e.target.value) })}
            >
              {MONTHS_ES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </Input>
          </div>
          <div className="kfin-field">
            <label htmlFor="kfin-to">Hasta</label>
            <Input
              type="select"
              id="kfin-to"
              bsSize="sm"
              value={filters.toMonth}
              onChange={(e) => onChange({ toMonth: Number(e.target.value) })}
            >
              {MONTHS_ES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </Input>
          </div>
        </>
      ) : (
        <div className="kfin-field">
          <label htmlFor="kfin-month">Mes</label>
          <Input
            type="select"
            id="kfin-month"
            bsSize="sm"
            value={filters.month}
            onChange={(e) => onChange({ month: Number(e.target.value) })}
          >
            {MONTHS_ES.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </Input>
        </div>
      )}

      {supervisorOptions.length > 0 || supervisorsLoading ? (
        <div className="kfin-field kfin-field--grow">
          <label htmlFor="kfin-supervisors">
            Supervisora <span className="kfin-muted">(marca los kioscos que tiene asignados)</span>
          </label>
          <Select
            inputId="kfin-supervisors"
            isMulti
            isLoading={supervisorsLoading}
            options={supervisorOptions}
            value={selectedSupervisors}
            onChange={(vals) =>
              onChange({ siteIds: applySupervisorSelection(filters.siteIds, selectedSupervisors, vals || []) })
            }
            placeholder="Todas las supervisoras"
            noOptionsMessage={() => "Sin supervisoras"}
            loadingMessage={() => "Cargando…"}
            closeMenuOnSelect={false}
            styles={selectStyles}
            aria-label="Filtrar por supervisora"
          />
        </div>
      ) : null}

      <div className="kfin-field kfin-field--grow">
        <label htmlFor="kfin-sites">
          Kioscos {tab === "pnl" ? <span className="kfin-muted">(uno solo = vista mes a mes)</span> : null}
        </label>
        <Select
          inputId="kfin-sites"
          isMulti
          isLoading={sitesLoading}
          options={options}
          value={selected}
          onChange={(vals) => onChange({ siteIds: (vals || []).map((v) => v.value) })}
          placeholder="Todos los kioscos"
          noOptionsMessage={() => "Sin kioscos"}
          loadingMessage={() => "Cargando…"}
          closeMenuOnSelect={false}
          styles={selectStyles}
          aria-label="Filtrar por kiosco"
        />
      </div>

      {isSummary ? (
        <div className="kfin-field">
          <span className="kfin-label" id="kfin-mode-label">
            Comparación{" "}
            <button type="button" id="kfin-mode-info" className="kfin-info" aria-label={`Ayuda: ${MODE_HELP}`}>
              ⓘ
            </button>
          </span>
          <KSeg aria-labelledby="kfin-mode-label">
            <KButton
              large
              active={filters.mode === "SAME_PERIOD"}
              aria-pressed={filters.mode === "SAME_PERIOD"}
              onClick={() => onChange({ mode: "SAME_PERIOD" })}
            >
              Mismas fechas
            </KButton>
            <KButton
              large
              active={filters.mode === "FULL_MONTH"}
              aria-pressed={filters.mode === "FULL_MONTH"}
              onClick={() => onChange({ mode: "FULL_MONTH" })}
            >
              Meses completos
            </KButton>
            <KButton
              large
              active={filters.mode === "CUSTOM"}
              aria-pressed={filters.mode === "CUSTOM"}
              onClick={() => onChange({ mode: "CUSTOM" })}
            >
              Fechas específicas
            </KButton>
          </KSeg>
          <div className={`kfin-hint${customError ? " kfin-hint--error" : ""}`} role="note">
            {customError || comparisonText}
          </div>
          <UncontrolledTooltip target="kfin-mode-info" placement="bottom" innerClassName="kfin-tooltip">
            {MODE_HELP}
          </UncontrolledTooltip>
        </div>
      ) : null}
    </div>
  );
}
