import React, { useMemo } from "react";
import Select from "react-select";
import { Input, UncontrolledTooltip } from "reactstrap";
import { MONTHS_ES } from "utils/financeFormat";
import { KButton, KSeg } from "./common";

const MODE_HELP =
  "Mismo periodo: cada kiosco se compara contra las mismas fechas del año base. Los kioscos que entraron al POS a mitad de año se comparan desde su primera venta real contra los mismos días calendario del año anterior. Mes completo: compara meses completos de ambos años.";

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
export default function FinanceFilters({ tab, filters, onChange, sites, sitesLoading, currentYear }) {
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

  return (
    <div className="kfin-filters kfin-noprint" role="search" aria-label="Filtros del reporte">
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

      {isSummary ? (
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
              Mismo periodo
            </KButton>
            <KButton
              large
              active={filters.mode === "FULL_MONTH"}
              aria-pressed={filters.mode === "FULL_MONTH"}
              onClick={() => onChange({ mode: "FULL_MONTH" })}
            >
              Mes completo
            </KButton>
          </KSeg>
          <UncontrolledTooltip target="kfin-mode-info" placement="bottom" innerClassName="kfin-tooltip">
            {MODE_HELP}
          </UncontrolledTooltip>
        </div>
      ) : null}
    </div>
  );
}
