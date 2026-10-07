import React, { useState } from "react";
import { fmtMoney } from "utils/financeFormat";
import { KButton } from "views/kiosks/finance/reports/common";
import { longDateEs, validateQuickAdd } from "./adSpendHelpers";

/**
 * Captura rápida de la inversión de un día (PUT /ad-spend/{fecha}): fecha (hoy por defecto, nunca futura) + monto.
 * `onSubmit({ date, amount, notes })` devuelve una promesa; si rechaza, el contenedor ya mostró el error y aquí
 * se conserva lo escrito.
 */
export default function AdSpendQuickAdd({ today, byDate, rangeLoaded, onSubmit }) {
  const [date, setDate] = useState(today);
  const [amountText, setAmountText] = useState("");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const existing = byDate.get(date);
  const withYear = date.slice(0, 4) !== today.slice(0, 4);
  let hint = "";
  if (existing && existing.adSpend !== null) {
    hint = `Ya hay ${fmtMoney(existing.adSpend)} capturados el ${longDateEs(date, { withYear })}: se reemplazarán.`;
  } else if (rangeLoaded && date && !byDate.has(date)) {
    hint = "Esa fecha está fuera del rango que estás viendo: se guardará, pero no aparecerá en la tabla.";
  }

  const submit = async (event) => {
    event.preventDefault();
    if (saving) return;
    const check = validateQuickAdd({ date, amountText }, today);
    setErrors(check.errors);
    if (!check.ok) return;
    setSaving(true);
    try {
      await onSubmit({ date, amount: check.amount, notes: existing && existing.notes ? existing.notes : null });
      setAmountText("");
      setErrors({});
    } catch (error) {
      /* el contenedor ya mostró el mensaje; se conserva lo escrito para reintentar */
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="kfin-card sdash-ad-quick kfin-noprint" onSubmit={submit} noValidate aria-label="Captura rápida de inversión">
      <div className="kfin-field">
        <label htmlFor="sdash-ad-qdate">Fecha</label>
        <input
          id="sdash-ad-qdate"
          type="date"
          className="form-control"
          value={date}
          max={today}
          disabled={saving}
          aria-invalid={Boolean(errors.date)}
          aria-describedby={errors.date ? "sdash-ad-qdate-error" : undefined}
          onChange={(e) => {
            setDate(e.target.value);
            setErrors((prev) => ({ ...prev, date: undefined }));
          }}
        />
        {errors.date ? (
          <div id="sdash-ad-qdate-error" className="sdash-ad-error">
            {errors.date}
          </div>
        ) : null}
      </div>
      <div className="kfin-field">
        <label htmlFor="sdash-ad-qamount">Monto (Q)</label>
        <input
          id="sdash-ad-qamount"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="form-control"
          placeholder="Ej. 800 o 1,250.50"
          value={amountText}
          disabled={saving}
          aria-invalid={Boolean(errors.amount)}
          aria-describedby={errors.amount ? "sdash-ad-qamount-error" : undefined}
          onChange={(e) => {
            setAmountText(e.target.value);
            setErrors((prev) => ({ ...prev, amount: undefined }));
          }}
        />
        {errors.amount ? (
          <div id="sdash-ad-qamount-error" className="sdash-ad-error">
            {errors.amount}
          </div>
        ) : null}
      </div>
      <KButton type="submit" large variant="good" disabled={saving}>
        {saving ? "Guardando…" : "Guardar"}
      </KButton>
      <div className="sdash-ad-quick-note">
        <b>Captura rápida.</b> Un solo monto por día, de todas las plataformas.{hint ? ` ${hint}` : ""}
      </div>
    </form>
  );
}
