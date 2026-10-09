import React, { useState } from "react";
import { Card, CardBody, CardHeader, CardTitle, Collapse, Spinner } from "reactstrap";
import { MONTHS_ES, MONTHS_ES_SHORT } from "utils/financeFormat";

const flagsOf = (m) => [!!m.hasSales, !!m.hasCosts, !!m.hasGoal];

const describe = (m) => {
  const [s, c, g] = flagsOf(m);
  return `ventas ${s ? "sí" : "no"}, costos ${c ? "sí" : "no"}, meta ${g ? "sí" : "no"}`;
};

/** Mapa de calor kiosco x mes (GET /completeness). Al hacer clic salta a ese kiosco y mes. */
function CompletenessHeatmap({ data, loading, error, selected, onJump }) {
  const [open, setOpen] = useState(true);
  const sites = (data && data.sites) || [];

  return (
    <Card className="mt-3">
      <CardHeader
        role="button"
        tabIndex={0}
        aria-expanded={open}
        style={{ cursor: "pointer" }}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
      >
        <CardTitle tag="h6" className="mb-0">
          <i className={`nc-icon ${open ? "nc-minimal-down" : "nc-minimal-right"}`} aria-hidden="true" /> Completitud de
          datos por kiosco y mes
        </CardTitle>
      </CardHeader>
      <Collapse isOpen={open}>
        <CardBody>
          <div className="kc-legend mb-2">
            <span>
              <span className="kc-swatch kc-heat-full" /> ✓ Ventas, costos y meta
            </span>
            <span>
              <span className="kc-swatch kc-heat-part" /> ! Datos parciales
            </span>
            <span>
              <span className="kc-swatch kc-heat-none" /> · Sin datos
            </span>
            <span className="text-muted">Clic en una celda para ir a ese kiosco y mes.</span>
          </div>
          {loading ? (
            <div className="text-center py-3">
              <Spinner size="sm" color="primary" /> Cargando completitud...
            </div>
          ) : error ? (
            <div className="text-danger small">{error}</div>
          ) : sites.length === 0 ? (
            <div className="text-muted small">Sin información de completitud para este año.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="kc-heat">
                <thead>
                  <tr>
                    <th className="kc-heat-site">Kiosco</th>
                    {MONTHS_ES_SHORT.map((m) => (
                      <th key={m}>{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.siteId}>
                      <th className="kc-heat-site" title={site.name}>
                        {site.name}
                      </th>
                      {MONTHS_ES_SHORT.map((_, i) => {
                        const month = i + 1;
                        const m = (site.months || []).find((x) => x.month === month) || {};
                        const count = flagsOf(m).filter(Boolean).length;
                        const cls = count === 3 ? "kc-heat-full" : count === 0 ? "kc-heat-none" : "kc-heat-part";
                        const mark = count === 3 ? "✓" : count === 0 ? "·" : "!";
                        const isSel = selected && selected.siteId === site.siteId && selected.month === month;
                        return (
                          <td key={month}>
                            <button
                              type="button"
                              className={`kc-heat-cell ${cls} ${isSel ? "kc-heat-sel" : ""}`}
                              aria-label={`${site.name}, ${MONTHS_ES[i]}: ${describe(m)}. Ir a esta celda`}
                              title={`${site.name} - ${MONTHS_ES[i]}: ${describe(m)}`}
                              onClick={() => onJump(site.siteId, month)}
                            >
                              {mark}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Collapse>
    </Card>
  );
}

export default CompletenessHeatmap;
