import React, { memo, useMemo } from "react";
import { fmtAmount, fmtMoney } from "utils/financeFormat";
import { KButton } from "views/kiosks/finance/reports/common";
import {
  MAX_NOTES_LENGTH,
  amountToInput,
  dayLabel,
  deriveDay,
  displayStatus,
  fmtRoas,
  fmtSigned,
  isFutureDate,
  longDateEs,
  notesInputLabel,
  plural,
  rowState,
  spansYears,
  spendInputLabel,
  statusFromNet,
  statusMeta,
} from "./adSpendHelpers";
import { fmtCount } from "./salesDashboardHelpers";

/** Enter baja a la fila siguiente (captura rápida de varios días seguidos). */
const focusNextAmount = (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const next = event.currentTarget.closest("tr")?.nextElementSibling?.querySelector("[data-ad-amount]");
  if (next && !next.disabled) next.focus();
};

const selectAll = (event) => event.target.select();

function ResultCell({ value, status }) {
  const meta = statusMeta(status);
  if (value === null || value === undefined) return <span className="kfin-muted">—</span>;
  return (
    <>
      <span aria-hidden="true">{meta.arrow} </span>
      <span className="sr-only">{meta.label}: </span>
      {fmtSigned(value)}
    </>
  );
}

/**
 * Una fila por día. Memoizada: al teclear solo se vuelve a pintar la fila cuyo borrador cambió
 * (day y draft conservan su identidad en las demás; onChange es estable).
 */
const AdSpendRow = memo(function AdSpendRow({ day, draft, canEdit, busy, today, withYear, onChange }) {
  const future = isFutureDate(day.date, today);
  const editable = canEdit && !future;
  const state = rowState(day, draft);
  const previewing = Boolean(draft) && state.valid && state.dirty;
  const view = previewing ? { ...day, ...deriveDay(day.salesAmount, state.amount) } : day;
  const status = displayStatus(view, today);
  const meta = statusMeta(status);

  const amountText = draft ? draft.amount : amountToInput(day.adSpend);
  const notesText = draft ? draft.notes : day.notes || "";
  const hasAmount = amountText.trim() !== "";
  const amountId = `sdash-ad-amount-${day.date}`;
  const errorId = `${amountId}-error`;
  const errorText = state.error || state.notesError;
  const rowClass = [
    "sdash-ad-row",
    previewing ? "sdash-ad-row--dirty" : "",
    !state.valid ? "sdash-ad-row--invalid" : "",
    future ? "sdash-ad-row--future" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr className={rowClass}>
      <th scope="row" className="kfin-sticky-col sdash-ad-date" title={longDateEs(day.date, { withYear: true })}>
        {dayLabel(day.date, { withYear })}
      </th>
      <td className="is-num">{fmtAmount(day.salesAmount)}</td>
      <td className="is-num">{fmtCount(day.ordersCount)}</td>
      <td className="sdash-ad-cell">
        {editable ? (
          <>
            <span className="sdash-ad-money">
              <span aria-hidden="true">Q</span>
              <input
                id={amountId}
                data-ad-amount
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="sdash-ad-input"
                value={amountText}
                placeholder="0.00"
                disabled={busy}
                aria-label={spendInputLabel(day.date, today)}
                aria-invalid={!state.valid && Boolean(state.error)}
                aria-describedby={errorText ? errorId : undefined}
                onChange={(e) => onChange(day.date, "amount", e.target.value)}
                onKeyDown={focusNextAmount}
                onFocus={selectAll}
              />
            </span>
            {errorText ? (
              <div id={errorId} className="sdash-ad-error">
                {errorText}
              </div>
            ) : null}
          </>
        ) : (
          <span className="is-num sdash-ad-static">
            {day.adSpend === null ? <span className="kfin-muted">—</span> : fmtAmount(day.adSpend)}
          </span>
        )}
      </td>
      <td className={`is-num sdash-ad-res sdash-ad-res--${meta.tone}`}>
        <ResultCell value={view.netResult} status={status} />
      </td>
      <td className="is-num">{view.adSpend === null || view.roas === null ? <span className="kfin-muted">—</span> : fmtRoas(view.roas)}</td>
      <td>
        <span className={`sdash-status ${meta.pill ? `sdash-status--${meta.pill}` : ""}`}>
          <span aria-hidden="true">{meta.arrow}</span> {meta.label}
        </span>
        {previewing ? <span className="sdash-ad-unsaved">sin guardar</span> : null}
      </td>
      <td className="sdash-ad-notes">
        {editable ? (
          <input
            type="text"
            autoComplete="off"
            className="sdash-ad-input sdash-ad-input--text"
            value={notesText}
            maxLength={MAX_NOTES_LENGTH}
            placeholder={hasAmount ? "Nota (opcional)" : "Primero el monto"}
            disabled={busy || !hasAmount}
            aria-label={notesInputLabel(day.date, today)}
            onChange={(e) => onChange(day.date, "notes", e.target.value)}
          />
        ) : (
          <span>{day.notes || ""}</span>
        )}
      </td>
    </tr>
  );
});

/**
 * Tabla 'Detalle diario': un renglón por día del rango con venta, pedidos, inversión (editable si el usuario
 * puede), resultado, ROAS y estado. Encabezado y totales fijos; se desplaza dentro de su caja.
 */
export default function AdSpendTable({
  days,
  totals,
  drafts,
  summary,
  previewTotals,
  canEdit,
  saving,
  today,
  periodLabel,
  onChange,
  onSave,
  onDiscard,
}) {
  const withYear = useMemo(() => spansYears(days), [days]);
  const totalStatus = totals.daysWithSpend > 0 ? statusFromNet(totals.netResult) : "NO_SPEND";
  const totalMeta = statusMeta(totalStatus);
  const pendingText =
    summary.pending === 0
      ? "Sin cambios pendientes"
      : `${plural(summary.entries.length, "cambio", "cambios")} sin guardar${
          summary.invalid.length ? ` · ${plural(summary.invalid.length, "fila con error", "filas con error")}` : ""
        }`;

  return (
    <section className="kfin-card" aria-label="Detalle diario de publicidad">
      <header className="kfin-card-head">
        <div>
          <h5 className="kfin-card-title">Detalle diario de publicidad</h5>
          <div className="kfin-card-sub">
            {periodLabel} · {canEdit ? "escribe la inversión de cada día y guarda al terminar" : "solo lectura"}
          </div>
        </div>
        <span className="kfin-muted kfin-noprint">Desplázate dentro de la tabla</span>
      </header>

      {canEdit ? (
        <div className="sdash-ad-bar kfin-noprint">
          <span className={`sdash-ad-pending ${summary.pending ? "is-pending" : ""}`} role="status" aria-live="polite">
            {pendingText}
          </span>
          <KButton large variant="good" onClick={onSave} disabled={!summary.canSave || saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </KButton>
          <KButton large onClick={onDiscard} disabled={summary.pending === 0 || saving}>
            Descartar cambios
          </KButton>
          {summary.invalid.length ? (
            <span className="sdash-ad-hint sdash-ad-hint--bad">Corrige las filas con error para poder guardar.</span>
          ) : null}
          {summary.outOfRange.length ? (
            <span className="sdash-ad-hint">
              {plural(summary.outOfRange.length, "cambio es", "cambios son")} de fechas fuera del rango visible y se
              guardará{summary.outOfRange.length === 1 ? "" : "n"} igual.
            </span>
          ) : null}
        </div>
      ) : (
        <div className="sdash-ad-hint" role="note">
          Solo lectura: necesitas el permiso para editar ventas online para registrar la inversión.
        </div>
      )}

      {previewTotals ? (
        <div className="sdash-ad-preview" role="note">
          <b>Vista previa con los cambios sin guardar:</b> inversión {fmtMoney(previewTotals.adSpend)} · venta de esos días{" "}
          {fmtMoney(previewTotals.comparableSales)} · resultado {fmtSigned(previewTotals.netResult)} · ROAS{" "}
          {previewTotals.roas === null ? "—" : `Q ${fmtRoas(previewTotals.roas)}`}
        </div>
      ) : null}

      <div className="kfin-scroll sdash-scroll sdash-ad-scroll" tabIndex={0} aria-label="Detalle diario de publicidad, desplazable">
        <table className="kfin-table kfin-table--simple sdash-ad-table">
          <caption className="sr-only">
            {`Detalle diario de ${periodLabel}: venta online, pedidos, inversión en publicidad, resultado, ROAS y estado de cada día.${
              canEdit ? " La columna Inversión es editable." : ""
            } Los días sin inversión capturada no entran al resultado.`}
          </caption>
          <thead>
            <tr>
              <th scope="col" className="kfin-sticky-col">
                Fecha
              </th>
              <th scope="col" className="is-num">
                Venta
              </th>
              <th scope="col" className="is-num">
                Pedidos
              </th>
              <th scope="col" className="is-num">
                Inversión (Q)
              </th>
              <th scope="col" className="is-num">
                Resultado
              </th>
              <th scope="col" className="is-num" title="Q vendidos por cada Q1 invertido">
                ROAS
              </th>
              <th scope="col">Estado</th>
              <th scope="col">Nota</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <AdSpendRow
                key={day.date}
                day={day}
                draft={drafts[day.date]}
                canEdit={canEdit}
                busy={saving}
                today={today}
                withYear={withYear}
                onChange={onChange}
              />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="kfin-sticky-col">
                Total
              </th>
              <td className="is-num">{fmtAmount(totals.salesAmount)}</td>
              <td className="is-num">{fmtCount(totals.ordersCount)}</td>
              <td className="is-num">{fmtAmount(totals.adSpend)}</td>
              <td className={`is-num sdash-ad-res sdash-ad-res--${totalMeta.tone}`}>
                <ResultCell value={totals.daysWithSpend > 0 ? totals.netResult : null} status={totalStatus} />
              </td>
              <td className="is-num">{totals.roas === null ? <span className="kfin-muted">—</span> : fmtRoas(totals.roas)}</td>
              <td className="kfin-muted" colSpan={2}>
                Resultado y ROAS: solo {plural(totals.daysWithSpend, "día con inversión", "días con inversión")} (venta{" "}
                {fmtMoney(totals.comparableSales)})
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
