import React, { useMemo, useState } from "react";
import Select from "react-select";
import { Alert, Badge, Button, Input } from "reactstrap";
import { MONTHS_ES_SHORT } from "utils/financeFormat";
import { isMappingResolved, mappingProblems, pendingMappingCount } from "./importModel";
import "./ImportWizard.css";

const CREATE_VALUE = "__create__";

const STATUS_META = {
  MATCHED: { color: "success", icon: "✓", label: "Coincide" },
  AMBIGUOUS: { color: "warning", icon: "!", label: "Ambiguo" },
  UNMATCHED: { color: "danger", icon: "✕", label: "Sin coincidencia" },
};

const cleanName = (name) => String(name || "").replace(/�/g, "").replace(/\s+/g, " ").trim();

/** Paso 2: mapear cada columna de kiosco encontrada en los Excel a un sitio (o crear uno histórico). */
function StepSites({ aggregated, files, siteMap, onSiteMapChange, sites, sitesLoading }) {
  const [onlyPending, setOnlyPending] = useState(false);

  const options = useMemo(
    () => [
      { value: CREATE_VALUE, label: "➕ Crear sitio histórico..." },
      ...sites
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((s) => ({ value: s.id, label: s.status === "CLOSED" ? `${s.name} (cerrado)` : s.name })),
    ],
    [sites]
  );

  const pending = pendingMappingCount(aggregated, siteMap);
  const problems = mappingProblems(files, siteMap);
  const rows = onlyPending ? aggregated.filter((c) => !isMappingResolved(siteMap[c.key])) : aggregated;
  const existingNames = useMemo(() => new Set(sites.map((s) => cleanName(s.name).toUpperCase())), [sites]);

  const choose = (col, option) => {
    if (!option) {
      onSiteMapChange(col.key, undefined);
    } else if (option.value === CREATE_VALUE) {
      onSiteMapChange(col.key, { create: { name: cleanName(col.excelNames[0]) } });
    } else {
      onSiteMapChange(col.key, { siteId: option.value });
    }
  };

  const selectedOption = (entry) => {
    if (!entry) return null;
    if (entry.create) return options[0];
    return options.find((o) => o.value === entry.siteId) || null;
  };

  return (
    <div>
      <p className="text-muted small">
        Se encontraron <strong>{aggregated.length}</strong> nombres de kiosco en {files.length} archivo
        {files.length === 1 ? "" : "s"}. Tus elecciones se recuerdan para todos los archivos y meses; el sistema guardará
        los alias para próximas importaciones.
      </p>

      {pending > 0 ? (
        <Alert color="warning" className="py-2" role="status">
          <strong>{pending}</strong> kiosco{pending === 1 ? "" : "s"} sin asignar: elige un sitio existente o crea un sitio
          histórico para continuar.
        </Alert>
      ) : (
        <Alert color="success" className="py-2" role="status">
          ✓ Todos los kioscos están asignados.
        </Alert>
      )}
      {problems.length > 0 && (
        <Alert color="danger" className="py-2" role="alert">
          <strong>Conflictos de asignación:</strong>
          <ul className="mb-0 pl-3">
            {problems.slice(0, 6).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="mb-2">
        <Button
          size="sm"
          color={onlyPending ? "info" : "secondary"}
          outline={!onlyPending}
          aria-pressed={onlyPending}
          onClick={() => setOnlyPending(!onlyPending)}
        >
          Mostrar sólo pendientes ({pending})
        </Button>
      </div>

      <div className="table-responsive">
        <table className="table kiw-table" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              <th>Nombre en Excel</th>
              <th>Aparece en</th>
              <th>Estado</th>
              <th style={{ minWidth: 260 }}>Sitio destino</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-muted py-4">
                  No hay kioscos pendientes.
                </td>
              </tr>
            )}
            {rows.map((col) => {
              const meta = STATUS_META[col.matchStatus] || STATUS_META.UNMATCHED;
              const entry = siteMap[col.key];
              const resolved = isMappingResolved(entry);
              const dupName =
                entry && entry.create && existingNames.has(cleanName(entry.create.name).toUpperCase());
              return (
                <tr key={col.key}>
                  <td>
                    <strong>{col.excelNames[0]}</strong>
                    {col.excelNames.length > 1 && (
                      <div className="small text-muted">Variantes: {col.excelNames.slice(1).join(", ")}</div>
                    )}
                  </td>
                  <td>
                    {col.appearances.map((a) => (
                      <span key={`${a.fileIdx}`} className="kiw-chip">
                        {MONTHS_ES_SHORT[(a.month || 1) - 1]} {a.year}
                      </span>
                    ))}
                  </td>
                  <td>
                    <Badge color={meta.color}>
                      <span aria-hidden="true">{meta.icon}</span> {meta.label}
                    </Badge>
                    {col.matchedSiteName && col.matchStatus === "MATCHED" && (
                      <div className="small text-muted">→ {col.matchedSiteName}</div>
                    )}
                    {resolved && col.matchStatus !== "MATCHED" && (
                      <div className="small text-success">✓ Asignado</div>
                    )}
                  </td>
                  <td>
                    <Select
                      aria-label={`Sitio destino para ${col.excelNames[0]}`}
                      options={options}
                      value={selectedOption(entry)}
                      onChange={(o) => choose(col, o)}
                      isLoading={sitesLoading}
                      isClearable
                      placeholder="Selecciona un sitio..."
                      noOptionsMessage={() => "Sin resultados"}
                      classNamePrefix="react-select"
                      menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                      styles={{ menuPortal: (base) => ({ ...base, zIndex: 2000 }) }}
                    />
                    {entry && entry.create && (
                      <div className="mt-2">
                        <Input
                          bsSize="sm"
                          value={entry.create.name}
                          aria-label={`Nombre del nuevo sitio histórico para ${col.excelNames[0]}`}
                          onChange={(e) => onSiteMapChange(col.key, { create: { name: e.target.value } })}
                          invalid={!String(entry.create.name).trim() || dupName}
                        />
                        <div className={`small ${dupName ? "text-danger" : "text-muted"}`}>
                          {dupName
                            ? "Ya existe un sitio con este nombre: elígelo de la lista en lugar de crearlo."
                            : "Se creará como sitio histórico (sin POS)."}
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default StepSites;
