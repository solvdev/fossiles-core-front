import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Spinner } from "reactstrap";
import SideDrawer from "components/SideDrawer/SideDrawer";
import { useAuth } from "contexts/AuthContext";
import { addPayrollParameter, getPayrollParameters } from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";
import { fmtDate } from "./payrollUi";

const LABELS = {
  IGSS_LABORAL_PCT: "IGSS laboral (%)",
  IGSS_PATRONAL_PCT: "IGSS patronal (%)",
  IRTRA_PCT: "IRTRA (%)",
  INTECAP_PCT: "INTECAP (%)",
  BONIFICACION_INCENTIVO_MENSUAL: "Bonificación incentivo mensual (Q)",
  ISR_DEDUCCION_PERSONAL: "ISR: deducción personal anual (Q)",
  ISR_TRAMO_LIMITE: "ISR: límite del primer tramo (Q)",
  ISR_TASA_TRAMO1_PCT: "ISR: tasa del primer tramo (%)",
  ISR_TASA_TRAMO2_PCT: "ISR: tasa del excedente (%)",
  ISR_CUOTA_FIJA_TRAMO2: "ISR: cuota fija del segundo tramo (Q)",
};

const GROUPS = [
  ["Cuotas de ley", ["IGSS_LABORAL_PCT", "IGSS_PATRONAL_PCT", "IRTRA_PCT", "INTECAP_PCT"]],
  ["Bonificación", ["BONIFICACION_INCENTIVO_MENSUAL"]],
  ["ISR en relación de dependencia", ["ISR_DEDUCCION_PERSONAL", "ISR_TRAMO_LIMITE", "ISR_TASA_TRAMO1_PCT", "ISR_TASA_TRAMO2_PCT", "ISR_CUOTA_FIJA_TRAMO2"]],
];

const isPercent = (code) => code.endsWith("_PCT");
/** Nombre sin la unidad entre paréntesis: la unidad se ve en el valor. */
const plainLabel = (code) => LABELS[code].replace(/\s*\((%|Q)\)$/, "").replace(/^ISR: /, "");
const showValue = (code, value) => {
  const text = Number(value).toLocaleString("en-US", { maximumFractionDigits: 4 });
  return isPercent(code) ? `${text} %` : `Q ${text}`;
};

const EMPTY_FORM = { code: "IGSS_LABORAL_PCT", value: "", effectiveFrom: "", description: "" };

/** Porcentajes y montos legales con fecha de vigencia. Un cambio se registra como un valor nuevo desde una fecha. */
function PayrollParameters() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("PLANILLA.CORRIDAS.APROBAR");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [expanded, setExpanded] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await getPayrollParameters()) || []);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byCode = useMemo(() => {
    const grouped = {};
    rows.forEach((row) => {
      grouped[row.code] = grouped[row.code] || [];
      grouped[row.code].push(row);
    });
    return grouped;
  }, [rows]);

  const toggleHistory = (code) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const openForm = (code) => {
    setForm({ ...EMPTY_FORM, code: code || EMPTY_FORM.code });
    setErrors({});
  };
  const setField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const submit = async () => {
    const found = {};
    if (form.value === "") found.value = "Indique el valor.";
    else if (!(Number(form.value) >= 0)) found.value = "El valor no puede ser negativo.";
    else if (isPercent(form.code) && Number(form.value) > 100) found.value = "Un porcentaje no puede pasar de 100.";
    if (!form.effectiveFrom) found.effectiveFrom = "Indique desde qué fecha rige.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      await addPayrollParameter({ ...form, value: Number(form.value), description: form.description.trim() || null });
      showSuccess("Valor registrado. Recalcule las planillas en borrador que lo usen.");
      setForm(null);
      await load();
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner size="sm" />;

  return (
    <>
      <div className="pl-row mb-3">
        <p className="pl-sub mb-0" style={{ maxWidth: 640 }}>
          Cada planilla toma el valor vigente al cierre de su período; las aprobadas y pagadas no cambian. Un cambio se
          programa como valor nuevo desde una fecha.
        </p>
        <span className="pl-spacer" />
        {canEdit && <Button color="primary" className="m-0" onClick={() => openForm()}>Programar cambio</Button>}
      </div>

      <div className="pl-params">
        {GROUPS.map(([title, codes]) => (
          <section key={title} className="pl-card">
            <div className="pl-card__head"><h5>{title}</h5></div>
            {codes.map((code) => {
              const list = [...(byCode[code] || [])].sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
              const current = list.find((row) => row.current) || list[0];
              const older = list.filter((row) => row !== current);
              return (
                <div key={code} className="pl-param">
                  <div className="pl-param__top">
                    <div>
                      <div>{plainLabel(code)}</div>
                      <div className="pl-sub">
                        {current ? <>Vigente desde {fmtDate(current.effectiveFrom)}{current.description ? ` · ${current.description}` : ""}</> : "Sin valor registrado"}
                      </div>
                    </div>
                    <div className="pl-row" style={{ flexWrap: "nowrap" }}>
                      <span className="pl-param__v pl-num">{current ? showValue(code, current.value) : "—"}</span>
                      {older.length > 0 && (
                        <Button color="link" size="sm" className="m-0 p-1" aria-expanded={expanded.has(code)}
                          aria-label={`Historial de ${plainLabel(code)}`} onClick={() => toggleHistory(code)}>
                          <i className="nc-icon nc-time-alarm" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button color="link" size="sm" className="m-0 p-1" aria-label={`Cambiar ${plainLabel(code)}`} onClick={() => openForm(code)}>
                          Cambiar
                        </Button>
                      )}
                    </div>
                  </div>
                  {expanded.has(code) && older.length > 0 && (
                    <ul className="pl-hist">
                      {older.map((row) => (
                        <li key={row.id}>
                          <span>Desde {fmtDate(row.effectiveFrom)}{row.description ? ` · ${row.description}` : ""}</span>
                          <b className="pl-num">{showValue(code, row.value)}</b>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <SideDrawer
        isOpen={Boolean(form)}
        onClose={() => { if (!saving) setForm(null); }}
        title="Programar cambio de parámetro"
        subtitle="El valor nuevo rige desde la fecha que indique."
        footer={(
          <>
            <Button color="secondary" outline disabled={saving} onClick={() => setForm(null)}>Cancelar</Button>
            <Button color="primary" disabled={saving} onClick={submit}>{saving ? "Registrando…" : "Registrar valor"}</Button>
          </>
        )}
      >
        {form && (
          <>
            <div className="pl-field">
              <label htmlFor="param-codigo">Parámetro</label>
              <Input id="param-codigo" type="select" value={form.code} onChange={(e) => setField("code", e.target.value)}>
                {Object.entries(LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Input>
            </div>
            <div className="pl-two">
              <div className="pl-field">
                <label htmlFor="param-valor">Valor nuevo</label>
                <Input id="param-valor" type="number" step="0.0001" min="0" className="pl-num" value={form.value} invalid={Boolean(errors.value)}
                  onChange={(e) => setField("value", e.target.value)} />
                {errors.value && <span className="pl-err">{errors.value}</span>}
              </div>
              <div className="pl-field">
                <label htmlFor="param-desde">Rige desde</label>
                <Input id="param-desde" type="date" value={form.effectiveFrom} invalid={Boolean(errors.effectiveFrom)}
                  onChange={(e) => setField("effectiveFrom", e.target.value)} />
                {errors.effectiveFrom && <span className="pl-err">{errors.effectiveFrom}</span>}
              </div>
            </div>
            <div className="pl-field">
              <label htmlFor="param-motivo">Motivo</label>
              <Input id="param-motivo" maxLength={200} value={form.description} placeholder="Acuerdo, decreto o circular"
                onChange={(e) => setField("description", e.target.value)} />
            </div>
            <div className="pl-next" style={{ padding: "12px 14px", marginBottom: 0 }}>
              <div className="pl-next__txt">
                <span>Las planillas en borrador que usen este valor quedan marcadas como desactualizadas: hay que recalcularlas.</span>
              </div>
            </div>
          </>
        )}
      </SideDrawer>
    </>
  );
}

export default PayrollParameters;
