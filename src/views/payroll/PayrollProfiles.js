import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Spinner } from "reactstrap";
import SideDrawer from "components/SideDrawer/SideDrawer";
import TablePagination, { usePagination } from "components/TablePagination/TablePagination";
import { useAuth } from "contexts/AuthContext";
import { getPayrollProfiles, updatePayrollProfile } from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatAmount } from "utils/payrollPrintHtml";
import { Avatar, METHODS } from "./payrollUi";

const GROUP_LABELS = { PLANTA: "Planta", ADMINISTRACION: "Administración" };
const TYPE_LABELS = { PLANILLA: "Planilla", SERVICIOS: "Servicios" };
const PAY_OPTIONS = [["CHEQUE", "Cheque"], ["TRANSFERENCIA BANCARIA", "Transferencia"], ["EFECTIVO", "Efectivo"]];

const toDraft = (profile) => ({
  employmentType: profile.employmentType || "PLANILLA",
  payGroup: profile.payGroup || "ADMINISTRACION",
  paymentMethod: profile.paymentMethod || "",
  bankAccount: profile.bankAccount || "",
  salary: profile.salary ?? "",
  bonification: profile.bonification ?? "",
  terminationDate: profile.terminationDate || "",
});

const NO_FILTERS = { group: "", type: "", search: "", onlyWarnings: false, includeInactive: false };
const filtersFor = (focus) => (focus
  ? { ...NO_FILTERS, group: focus.group || "", search: focus.search || "", onlyWarnings: Boolean(focus.onlyWarnings) }
  : NO_FILTERS);

/** Un grupo de botones donde se elige una sola opción. */
function Segmented({ label, value, options, onChange }) {
  return (
    <div className="pl-field">
      <span className="pl-fl">{label}</span>
      <div className="pl-seg" role="radiogroup" aria-label={label}>
        {options.map(([optionValue, optionLabel]) => (
          <button key={optionValue} type="button" role="radio" aria-checked={value === optionValue} onClick={() => onChange(optionValue)}>
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Datos de la ficha que usa la planilla: vinculación, grupo, forma de pago, cuenta, salario, bonificación y fecha de baja.
 * La lista solo se lee; cada ficha se edita en un panel lateral. Guardar reemplaza esos datos: lo que se deja vacío queda vacío.
 * `focus` llega desde una planilla para mostrar el grupo, las fichas con avisos o una persona.
 */
function PayrollProfiles({ focus }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("PLANILLA.CORRIDAS.CREAR");
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(() => filtersFor(focus));
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProfiles((await getPayrollProfiles()) || []);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Solo un enfoque nuevo cambia los filtros; los que mueve el usuario se respetan.
  const latestFocus = useRef(focus);
  latestFocus.current = focus;
  const focusNonce = focus ? focus.nonce : null;
  useEffect(() => {
    if (focusNonce != null) setFilters(filtersFor(latestFocus.current));
  }, [focusNonce]);

  const visible = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return profiles.filter((p) =>
      (filters.includeInactive || p.status === "active") &&
      (!filters.group || p.payGroup === filters.group) &&
      (!filters.type || p.employmentType === filters.type) &&
      (!filters.onlyWarnings || (p.warnings || []).length > 0) &&
      (!search || `${p.fullName} ${p.departmentName || ""} ${p.position || ""}`.toLowerCase().includes(search)));
  }, [profiles, filters]);
  const pagination = usePagination(visible, 25);

  const summary = useMemo(() => {
    const active = profiles.filter((p) => p.status === "active");
    const count = (group, type) => active.filter((p) => p.payGroup === group && p.employmentType === type).length;
    return {
      plantPlanilla: count("PLANTA", "PLANILLA"),
      plantServicios: count("PLANTA", "SERVICIOS"),
      adminPlanilla: count("ADMINISTRACION", "PLANILLA"),
      adminServicios: count("ADMINISTRACION", "SERVICIOS"),
      withWarnings: active.filter((p) => (p.warnings || []).length > 0).length,
    };
  }, [profiles]);

  const openEditor = (profile) => {
    if (!canEdit) return;
    setEditing(profile);
    setDraft(toDraft(profile));
    setErrors({});
  };
  const closeEditor = () => {
    if (saving) return;
    setEditing(null);
    setDraft(null);
  };
  const setField = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const save = async () => {
    const found = {};
    if (draft.salary === "" || !(Number(draft.salary) >= 0)) found.salary = "Indique el salario mensual, de cero en adelante.";
    if (draft.bonification !== "" && !(Number(draft.bonification) >= 0)) found.bonification = "La bonificación no puede ser negativa.";
    if (!draft.paymentMethod) found.paymentMethod = "Indique la forma de pago.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    try {
      const saved = await updatePayrollProfile(editing.id, {
        employmentType: draft.employmentType,
        payGroup: draft.payGroup,
        paymentMethod: draft.paymentMethod,
        bankAccount: String(draft.bankAccount || "").trim() || null,
        salary: Number(draft.salary),
        bonification: draft.bonification === "" ? null : Number(draft.bonification),
        terminationDate: draft.terminationDate || null,
        nit: editing.nit || null,
        igssAffiliation: editing.igssAffiliation || null,
      });
      setProfiles((current) => current.map((p) => (p.id === saved.id ? saved : p)));
      setEditing(null);
      setDraft(null);
      showSuccess(`Ficha de ${saved.fullName} guardada.`);
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner size="sm" />;

  const tile = (group, type, label, count) => (
    <button type="button" className="pl-tile" aria-pressed={filters.group === group && filters.type === type}
      onClick={() => setFilters(filters.group === group && filters.type === type
        ? { ...filters, group: "", type: "" } : { ...filters, group, type, onlyWarnings: false })}>
      <b className="pl-num">{count}</b>
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <div className="pl-tiles">
        {tile("PLANTA", "PLANILLA", "Planta · planilla", summary.plantPlanilla)}
        {tile("PLANTA", "SERVICIOS", "Planta · servicios", summary.plantServicios)}
        {tile("ADMINISTRACION", "PLANILLA", "Administración · planilla", summary.adminPlanilla)}
        {tile("ADMINISTRACION", "SERVICIOS", "Administración · servicios", summary.adminServicios)}
        <button type="button" className="pl-tile pl-tile--warn" aria-pressed={filters.onlyWarnings}
          onClick={() => setFilters({ ...filters, onlyWarnings: !filters.onlyWarnings })}>
          <b className="pl-num">{summary.withWarnings}</b>
          <span>Fichas con avisos</span>
        </button>
      </div>

      <section className="pl-card">
        <div className="pl-tools">
          <div className="pl-search">
            <i className="nc-icon nc-zoom-split" aria-hidden="true" />
            <Input bsSize="sm" placeholder="Nombre, departamento o puesto" aria-label="Buscar ficha" value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
          </div>
          <Input type="select" bsSize="sm" aria-label="Grupo" value={filters.group} style={{ width: "auto" }}
            onChange={(e) => setFilters({ ...filters, group: e.target.value })}>
            <option value="">Todos los grupos</option>
            <option value="PLANTA">Planta</option>
            <option value="ADMINISTRACION">Administración y kioscos</option>
          </Input>
          <label className="pl-row mb-0" style={{ gap: 6, textTransform: "none", fontSize: 13, color: "#252422" }}>
            <input type="checkbox" checked={filters.includeInactive}
              onChange={(e) => setFilters({ ...filters, includeInactive: e.target.checked })} />
            Incluir inactivos
          </label>
          <span className="pl-spacer" />
          <span className="pl-sub">Bonificación vacía: Q250 al mes (ley)</span>
        </div>
        <div className="pl-scroll">
          <table className="pl-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Grupo</th>
                <th>Vinculación</th>
                <th>Forma de pago</th>
                <th className="r">Salario mensual</th>
                <th className="r">Bonificación</th>
                <th>Avisos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan="8" className="pl-empty">No hay fichas con esos filtros.</td></tr>
              )}
              {pagination.pageItems.map((profile) => {
                const method = METHODS[profile.paymentMethod];
                return (
                  <tr key={profile.id} className={canEdit ? "pl-click" : undefined} tabIndex={canEdit ? 0 : undefined}
                    onClick={() => openEditor(profile)} onKeyDown={(e) => { if (e.key === "Enter") openEditor(profile); }}>
                    <td>
                      <div className="pl-who">
                        <Avatar name={profile.fullName} />
                        <div>
                          <b>{profile.fullName}</b>
                          <small>{[profile.departmentName, profile.position].filter(Boolean).join(" · ") || "Sin departamento"}</small>
                        </div>
                      </div>
                    </td>
                    <td>{GROUP_LABELS[profile.payGroup] || profile.payGroup}</td>
                    <td>{TYPE_LABELS[profile.employmentType] || profile.employmentType}</td>
                    <td>
                      {method ? (
                        <span className="pl-pay">
                          <i className={method.icon} aria-hidden="true" />
                          <span>{method.label}{profile.bankAccount && <><br /><small>{profile.bankAccount}</small></>}</span>
                        </span>
                      ) : <span className="pl-sub">{profile.paymentMethod || "—"}</span>}
                    </td>
                    <td className="r pl-num">{profile.salary != null ? formatAmount(profile.salary) : "—"}</td>
                    <td className="r pl-num">{profile.bonification != null ? formatAmount(profile.bonification) : <span className="pl-sub">Ley</span>}</td>
                    <td>
                      {(profile.warnings || []).map((warning) => <span key={warning} className="pl-tag">{warning}</span>)}
                      {profile.status !== "active" && <span className="pl-tag pl-tag--bad">Inactivo</span>}
                      {profile.terminationDate && <span className="pl-tag pl-tag--info">Baja {profile.terminationDate}</span>}
                    </td>
                    <td className="r">
                      {canEdit && (
                        <Button size="sm" color="link" className="m-0 p-1" aria-label={`Editar ficha de ${profile.fullName}`}
                          onClick={(e) => { e.stopPropagation(); openEditor(profile); }}>
                          <i className="nc-icon nc-ruler-pencil" /> Editar
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 pb-2"><TablePagination pagination={pagination} /></div>
      </section>

      <SideDrawer
        isOpen={Boolean(editing)}
        onClose={closeEditor}
        title={editing ? editing.fullName : ""}
        subtitle={editing ? ([editing.departmentName, editing.position].filter(Boolean).join(" · ") || "Sin departamento") : ""}
        avatar={editing ? <Avatar name={editing.fullName} /> : null}
        footer={(
          <>
            <Button color="secondary" outline disabled={saving} onClick={closeEditor}>Cancelar</Button>
            <Button color="primary" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar ficha"}</Button>
          </>
        )}
      >
        {editing && draft && (
          <>
            {(editing.warnings || []).length > 0 && (
              <div className="pl-next pl-next--aviso" style={{ padding: "10px 14px", marginBottom: 0 }}>
                <div className="pl-next__txt"><span><b style={{ display: "inline", fontSize: 13 }}>Avisos de esta ficha:</b> {editing.warnings.join(", ")}.</span></div>
              </div>
            )}
            <Segmented label="Grupo de pago" value={draft.payGroup} onChange={(v) => setField("payGroup", v)}
              options={[["PLANTA", "Planta (5 y 20)"], ["ADMINISTRACION", "Administración (15 y fin de mes)"]]} />
            <Segmented label="Vinculación" value={draft.employmentType} onChange={(v) => setField("employmentType", v)}
              options={[["PLANILLA", "Planilla"], ["SERVICIOS", "Servicios"]]} />
            <div className="pl-field">
              <Segmented label="Forma de pago" value={draft.paymentMethod} onChange={(v) => setField("paymentMethod", v)} options={PAY_OPTIONS} />
              {errors.paymentMethod && <span className="pl-err">{errors.paymentMethod}</span>}
            </div>
            {draft.paymentMethod === "TRANSFERENCIA BANCARIA" && (
              <div className="pl-field">
                <label htmlFor="ficha-cuenta">Número de cuenta</label>
                <Input id="ficha-cuenta" maxLength={50} value={draft.bankAccount} inputMode="numeric"
                  onChange={(e) => setField("bankAccount", e.target.value)} />
                <small>Va en la hoja de transferencias. Sin cuenta, la planilla lo avisa.</small>
              </div>
            )}
            <div className="pl-two">
              <div className="pl-field">
                <label htmlFor="ficha-salario">Salario mensual (Q)</label>
                <Input id="ficha-salario" type="number" step="0.01" min="0" className="pl-num" value={draft.salary} invalid={Boolean(errors.salary)}
                  onChange={(e) => setField("salary", e.target.value)} />
                {errors.salary && <span className="pl-err">{errors.salary}</span>}
              </div>
              <div className="pl-field">
                <label htmlFor="ficha-bonificacion">Bonificación (Q)</label>
                <Input id="ficha-bonificacion" type="number" step="0.01" min="0" className="pl-num" placeholder="Ley: 250" value={draft.bonification}
                  invalid={Boolean(errors.bonification)} onChange={(e) => setField("bonification", e.target.value)} />
                {errors.bonification ? <span className="pl-err">{errors.bonification}</span> : <small>Vacío usa el monto de ley.</small>}
              </div>
            </div>
            <div className="pl-field">
              <label htmlFor="ficha-baja">Fecha de baja</label>
              <Input id="ficha-baja" type="date" value={draft.terminationDate} onChange={(e) => setField("terminationDate", e.target.value)} />
              <small>Déjela vacía si sigue activo.</small>
            </div>
          </>
        )}
      </SideDrawer>
    </>
  );
}

export default PayrollProfiles;
