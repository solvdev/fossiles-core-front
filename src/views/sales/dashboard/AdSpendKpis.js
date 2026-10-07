import React, { memo } from "react";
import { fmtMoney } from "utils/financeFormat";
import { AD_COLORS, fmtRoas, fmtSigned, plural, statusFromNet, statusMeta } from "./adSpendHelpers";

const TONE_ACCENT = { good: AD_COLORS.win, bad: AD_COLORS.loss, neutral: AD_COLORS.even, none: AD_COLORS.line };

/** Chip de estado con flecha y texto (el color no es la única señal). */
export function StatusChip({ status, children }) {
  const meta = statusMeta(status);
  const kind = meta.tone === "good" ? "good" : meta.tone === "bad" ? "bad" : "neutral";
  return (
    <span className={`kfin-delta kfin-delta--${kind}`}>
      <span aria-hidden="true">{meta.arrow}</span>
      <span>{children || meta.label}</span>
    </span>
  );
}

/**
 * Fila de KPIs de 'Publicidad vs ventas'. totals = totales del reporte (solo días con inversión capturada
 * en la venta comparable, el resultado y el ROAS).
 */
function AdSpendKpis({ totals }) {
  const hasSpend = totals.daysWithSpend > 0;
  const resultStatus = hasSpend ? statusFromNet(totals.netResult) : "NO_SPEND";
  const resultValue = hasSpend ? fmtSigned(totals.netResult) : "—";
  const roasValue = totals.roas === null || totals.roas === undefined ? "—" : `Q ${fmtRoas(totals.roas)}`;
  const accentOf = (status) => ({ "--sdash-accent": TONE_ACCENT[statusMeta(status).tone] });

  return (
    <div className="kfin-kpis sdash-kpis sdash-ad-kpis">
      <div
        className="kfin-kpi"
        role="group"
        aria-label={`Inversión en publicidad: ${fmtMoney(totals.adSpend)}`}
        style={{ "--sdash-accent": AD_COLORS.spend }}
      >
        <div className="kfin-kpi-label">Inversión en publicidad</div>
        <div className="kfin-kpi-value" title={fmtMoney(totals.adSpend)}>
          {fmtMoney(totals.adSpend)}
        </div>
        <div className="kfin-kpi-delta">
          <span className="sdash-note">{plural(totals.daysWithSpend, "día con inversión", "días con inversión")}</span>
        </div>
      </div>

      <div
        className="kfin-kpi"
        role="group"
        aria-label={`Venta de esos días: ${fmtMoney(totals.comparableSales)}`}
        style={{ "--sdash-accent": AD_COLORS.sales }}
      >
        <div className="kfin-kpi-label">Venta de esos días</div>
        <div className="kfin-kpi-value" title={fmtMoney(totals.comparableSales)}>
          {fmtMoney(totals.comparableSales)}
        </div>
        <div className="kfin-kpi-delta">
          <span className="sdash-note">de {fmtMoney(totals.salesAmount)} vendidos en el periodo</span>
        </div>
      </div>

      <div
        className="kfin-kpi"
        role="group"
        aria-label={`Resultado: ${resultValue}, ${hasSpend ? statusMeta(resultStatus).label : "sin inversión capturada"}`}
        style={accentOf(resultStatus)}
      >
        <div className="kfin-kpi-label">Resultado</div>
        <div className={`kfin-kpi-value sdash-ad-result sdash-ad-result--${statusMeta(resultStatus).tone}`}>
          {resultValue}
        </div>
        <div className="kfin-kpi-delta">
          <StatusChip status={resultStatus} />
          <span className="sdash-note">venta − inversión</span>
        </div>
      </div>

      <div
        className="kfin-kpi"
        role="group"
        aria-label={`ROAS: ${roasValue} por cada Q1 invertido`}
        style={{ "--sdash-accent": AD_COLORS.salesInk }}
      >
        <div className="kfin-kpi-label">ROAS</div>
        <div className="kfin-kpi-value">{roasValue}</div>
        <div className="kfin-kpi-delta">
          <span className="sdash-note">vendidos por cada Q1 invertido</span>
        </div>
      </div>

      <div
        className="kfin-kpi"
        role="group"
        aria-label={`Días en ganancia ${totals.daysWin}, en pérdida ${totals.daysLoss}${
          totals.daysEven ? `, en equilibrio ${totals.daysEven}` : ""
        }`}
        style={{ "--sdash-accent": AD_COLORS.even }}
      >
        <div className="kfin-kpi-label">Días en ganancia vs pérdida</div>
        <div className="kfin-kpi-value">
          {totals.daysWin} <span className="sdash-ad-vs">vs</span> {totals.daysLoss}
        </div>
        <div className="kfin-kpi-delta">
          <StatusChip status="WIN">{totals.daysWin} ganancia</StatusChip>{" "}
          <StatusChip status="LOSS">{totals.daysLoss} pérdida</StatusChip>
          {totals.daysEven > 0 ? (
            <>
              {" "}
              <StatusChip status="EVEN">{totals.daysEven} equilibrio</StatusChip>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(AdSpendKpis);
