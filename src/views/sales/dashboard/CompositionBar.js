import React from "react";
import { fmtMoney, fmtPct } from "utils/financeFormat";
import { compositionAriaLabel } from "./salesDashboardHelpers";

/**
 * Barra apilada + leyenda (producto / empaque / envío / histórico, forma de pago, tipo de orden).
 * segments: [{key, label, amount, share (0..1), color, ink, pattern?}]. La leyenda repite monto y % para que el color
 * no sea el único canal; un segmento con `pattern: "hatch"` (histórico, sin desglose) además va rayado.
 */
export default function CompositionBar({ segments, ariaLabel, column = false, showAmount = true }) {
  if (!segments || !segments.length) {
    return <div className="kfin-muted">Sin datos en el periodo.</div>;
  }
  return (
    <div className="sdash-composition">
      <div className="sdash-stack" role="img" aria-label={ariaLabel || compositionAriaLabel(segments)}>
        {segments.map((s) => (
          <div
            key={s.key}
            className={s.pattern ? `sdash-${s.pattern}` : undefined}
            style={{ width: `${Math.max(0, s.share) * 100}%`, backgroundColor: s.color, color: s.ink }}
          >
            {s.share >= 0.08 ? fmtPct(s.share, 1) : null}
          </div>
        ))}
      </div>
      <ul className={`sdash-legend${column ? " sdash-legend--col" : ""}`}>
        {segments.map((s) => (
          <li key={s.key}>
            <span
              className={`sdash-dot${s.pattern ? ` sdash-${s.pattern}` : ""}`}
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span>
              {s.label}
              {showAmount ? (
                <>
                  {" "}
                  <b>{fmtMoney(s.amount)}</b>
                </>
              ) : null}{" "}
              · {fmtPct(s.share, 1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
