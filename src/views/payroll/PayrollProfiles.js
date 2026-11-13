import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Spinner } from "reactstrap";
import SideDrawer from "components/SideDrawer/SideDrawer";
import TablePagination, { usePagination } from "components/TablePagination/TablePagination";
import { useAuth } from "contexts/AuthContext";
import { getLocations } from "services/locationService";
import { getPayrollProfiles, updatePayrollProfile } from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatAmount } from "utils/payrollPrintHtml";
import { Avatar, METHODS, SECTIONS, sectionOf } from "./payrollUi";

/** Ubicaciones que son kioscos, igual que en Supervisoras y Kioscos. */
const isKioskLocation = (location) => {
  const categoria = String(location?.categoria || "").toUpperCase();
  const name = String(location?.name || "").toUpperCase();
  const code = String(location?.code || "").toUpperCase();
  return categoria.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
};

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
  igssEnabled: profile.igssEnabled !== false,
  irtraEnabled: profile.irtraEnabled !== false,
  kioskLocationId: profile.kioskLocationId != null ? String(profile.kioskLocationId) : "",
});

/** Lo que se manda al servidor al guardar una ficha: reemplaza todos sus datos de planilla. */
const payloadOf = (profile, draft) => ({
  // El kiosco solo se manda para el personal de kiosco: de él depende qué supervisora ve sus novedades.
  ...(profile.kiosk ? {
    kioskLocationId: draft.kioskLocationId ? Number(draft.kioskLocationId) : null,
    clearKioskLocation: !draft.kioskLocationId && profile.kioskLocationId != null,
  } : {}),
  employmentType: draft.employmentType,
  payGroup: draft.payGroup,
  paymentMethod: draft.paymentMethod,
  bankAccount: String(draft.bankAccount || "").trim() || null,
  salary: Number(draft.salary),
  bonification: draft.bonification === "" ? null : Number(draft.bonification),
  terminationDate: draft.terminationDate || null,
  nit: profile.nit || null,
  igssAffiliation: profile.igssAffiliation || null,
  igssEnabled: draft.igssEnabled,
  irtraEnabled: draft.irtraEnabled,
});

// group: sección que se muestra. ADMIN_TODO junta Administración y kioscos, que cobran en las mismas fechas.
const NO_FILTERS = { group: "", search: "", onlyWarnings: false, includeInactive: false, insurance: "" };
const groupForFocus = (group) => (group === "ADMINISTRACION" ? "ADMIN_TODO" : group || "");
const filtersFor = (focus) => (focus
  ? { ...NO_FILTERS, group: groupForFocus(focus.group), search: focus.search || "", onlyWarnings: Boolean(focus.onlyWarnings) }
  : NO_FILTERS);
const inGroup = (profile, group) => {
  if (!group) return true;
  const section = sectionOf(profile.payGroup, profile.kiosk);
  return group === "ADMIN_TODO" ? section !== "PLANTA" : section === group;
};

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
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [kiosks, setKiosks] = useState([]);

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

  // Los kioscos solo sirven para asignar a su personal; si no cargan, la ficha se edita igual.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locations = (await getLocations()) || [];
        if (!cancelled) setKiosks(locations.filter(isKioskLocation));
      } catch (error) {
        // sin lista de kioscos no se puede elegir, pero nada más se pierde
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
      inGroup(p, filters.group) &&
      (!filters.onlyWarnings || (p.warnings || []).length > 0) &&
      (!filters.insurance || (filters.insurance === "SIN_IGSS" ? p.igssEnabled === false : p.irtraEnabled === false)) &&
      (!search || `${p.fullName} ${p.departmentName || ""} ${p.position || ""}`.toLowerCase().includes(search)));
  }, [profiles, filters]);
  const pagination = usePagination(visible, 25);

  const summary = useMemo(() => {
    const active = profiles.filter((p) => p.status === "active");
    const count = (section, type) => active.filter((p) => sectionOf(p.payGroup, p.kiosk) === section
      && (!type || p.employmentType === type)).length;
    const bySection = (section) => ({ total: count(section), planilla: count(section, "PLANILLA"), servicios: count(section, "SERVICIOS") });
    return {
      PLANTA: bySection("PLANTA"),
      KIOSCOS: bySection("KIOSCOS"),
      ADMINISTRACION: bySection("ADMINISTRACION"),
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
      const saved = await updatePayrollProfile(editing.id, payloadOf(editing, draft));
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

  const toggleSelected = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const pageIds = pagination.pageItems.map((p) => p.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const selectedProfiles = profiles.filter((p) => selected.has(p.id));

  /** Cambia IGSS o IRTRA de varias fichas a la vez; cada una se guarda completa con lo suyo y solo cambia ese interruptor. */
  const applyInsurance = async (patch) => {
    setBulkBusy(true);
    try {
      const outcomes = await Promise.allSettled(selectedProfiles.map(async (profile) => {
        const saved = await updatePayrollProfile(profile.id, payloadOf(profile, { ...toDraft(profile), ...patch }));
        return saved;
      }));
      const saved = outcomes.filter((o) => o.status === "fulfilled").map((o) => o.value);
      const failed = outcomes.filter((o) => o.status === "rejected");
      if (saved.length > 0) {
        const byId = new Map(saved.map((p) => [p.id, p]));
        setProfiles((current) => current.map((p) => byId.get(p.id) || p));
        showSuccess(saved.length === 1 ? "1 ficha actualizada." : `${saved.length} fichas actualizadas.`);
      }
      if (failed.length > 0) {
        showError(`${failed.length === 1 ? "No se pudo guardar 1 ficha" : `No se pudieron guardar ${failed.length} fichas`}: ${failed[0].reason && failed[0].reason.message ? failed[0].reason.message : "revise sus datos."}`);
      }
      setSelected(new Set(failed.length > 0 ? selectedProfiles.filter((_, i) => outcomes[i].status === "rejected").map((p) => p.id) : []));
    } finally {
      setBulkBusy(false);
    }
  };

  if (loading) return <Spinner size="sm" />;

  const tile = (section) => (
    <button type="button" className="pl-tile" aria-pressed={filters.group === section}
      onClick={() => setFilters(filters.group === section ? { ...filters, group: "" } : { ...filters, group: section, onlyWarnings: false })}>
      <b className="pl-num">{summary[section].total}</b>
      <span>{SECTIONS[section]}</span>
      <small className="d-block pl-sub">{summary[section].planilla} de planilla · {summary[section].servicios} de servicios</small>
    </button>
  );

  return (
    <>
      <div className="pl-tiles">
        {tile("PLANTA")}
        {tile("KIOSCOS")}
        {tile("ADMINISTRACION")}
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
            <option value="ADMIN_TODO">Administración y kioscos (juntos)</option>
            <option value="KIOSCOS">Kioscos</option>
            <option value="ADMINISTRACION">Administración (sin kioscos)</option>
          </Input>
          <Input type="select" bsSize="sm" aria-label="Seguro" value={filters.insurance} style={{ width: "auto" }}
            onChange={(e) => setFilters({ ...filters, insurance: e.target.value })}>
            <option value="">Con o sin seguro</option>
            <option value="SIN_IGSS">Sin IGSS</option>
            <option value="SIN_IRTRA">Sin IRTRA e INTECAP</option>
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
                <th style={{ width: 36 }}>
                  {canEdit && pageIds.length > 0 && (
                    <input type="checkbox" aria-label="Seleccionar las fichas de la página" checked={allOnPageSelected}
                      onChange={(e) => setSelected((current) => {
                        const next = new Set(current);
                        pageIds.forEach((id) => (e.target.checked ? next.add(id) : next.delete(id)));
                        return next;
                      })} />
                  )}
                </th>
                <th>Colaborador</th>
                <th>Grupo</th>
                <th>Vinculación</th>
                <th>Forma de pago</th>
                <th className="r">Salario mensual</th>
                <th className="r">Bonificación</th>
                <th>Seguro</th>
                <th>Avisos</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && (
                <tr><td colSpan="10" className="pl-empty">No hay fichas con esos filtros.</td></tr>
              )}
              {pagination.pageItems.map((profile) => {
                const method = METHODS[profile.paymentMethod];
                return (
                  <tr key={profile.id} className={canEdit ? "pl-click" : undefined} tabIndex={canEdit ? 0 : undefined}
                    onClick={() => openEditor(profile)} onKeyDown={(e) => { if (e.key === "Enter") openEditor(profile); }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      {canEdit && (
                        <input type="checkbox" aria-label={`Seleccionar a ${profile.fullName}`} checked={selected.has(profile.id)}
                          onChange={() => toggleSelected(profile.id)} />
                      )}
                    </td>
                    <td>
                      <div className="pl-who">
                        <Avatar name={profile.fullName} />
                        <div>
                          <b>{profile.fullName}</b>
                          <small>{[profile.departmentName, profile.position].filter(Boolean).join(" · ") || "Sin departamento"}</small>
                          {profile.kiosk && profile.kioskLocationId != null && (
                            <small className="d-block">{(kiosks.find((k) => k.id === profile.kioskLocationId) || {}).name || "Kiosco asignado"}</small>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{SECTIONS[sectionOf(profile.payGroup, profile.kiosk)]}</td>
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
                      <span className={`pl-tag ${profile.igssEnabled === false ? "pl-tag--off" : "pl-tag--ok"}`}>
                        {profile.igssEnabled === false ? "Sin IGSS" : "IGSS"}
                      </span>
                      <span className={`pl-tag ${profile.irtraEnabled === false ? "pl-tag--off" : "pl-tag--ok"}`}>
                        {profile.irtraEnabled === false ? "Sin IRTRA" : "IRTRA"}
                      </span>
                    </td>
                    <td>
                      {(profile.warnings || []).map((warning) => <span key={warning} className="pl-tag">{warning}</span>)}
                      {profile.kiosk && profile.kioskLocationId == null && <span className="pl-tag">Sin kiosco asignado</span>}
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
        {canEdit && selectedProfiles.length > 0 && (
          <div className="pl-bulk" role="region" aria-label="Acciones en lote">
            <b>{selectedProfiles.length === 1 ? "1 seleccionado" : `${selectedProfiles.length} seleccionados`}</b>
            <span className="pl-spacer" />
            <span>IGSS:</span>
            <Button size="sm" color="neutral" disabled={bulkBusy} onClick={() => applyInsurance({ igssEnabled: true })}>Sí goza</Button>
            <Button size="sm" color="neutral" disabled={bulkBusy} onClick={() => applyInsurance({ igssEnabled: false })}>No goza</Button>
            <span>IRTRA e INTECAP:</span>
            <Button size="sm" color="neutral" disabled={bulkBusy} onClick={() => applyInsurance({ irtraEnabled: true })}>Sí lleva</Button>
            <Button size="sm" color="neutral" disabled={bulkBusy} onClick={() => applyInsurance({ irtraEnabled: false })}>No lleva</Button>
            <Button size="sm" color="link" className="text-white" disabled={bulkBusy} onClick={() => setSelected(new Set())}>Quitar selección</Button>
          </div>
        )}
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
            {editing.kiosk && (
              <div className="pl-field">
                <label htmlFor="ficha-kiosco">Kiosco donde trabaja</label>
                <Input id="ficha-kiosco" type="select" value={draft.kioskLocationId} onChange={(e) => setField("kioskLocationId", e.target.value)}>
                  <option value="">Sin kiosco asignado</option>
                  {kiosks.map((kiosk) => <option key={kiosk.id} value={kiosk.id}>{kiosk.name}</option>)}
                </Input>
                <small>La supervisora de ese kiosco ve a esta persona para registrar sus novedades.</small>
              </div>
            )}
            <div className="pl-field">
              <span className="pl-fl">Seguro social</span>
              <label className="pl-switch">
                <input type="checkbox" checked={draft.igssEnabled} onChange={(e) => setField("igssEnabled", e.target.checked)} />
                <span>Goza IGSS <small>Se le descuenta la cuota laboral y se paga la patronal.</small></span>
              </label>
              <label className="pl-switch">
                <input type="checkbox" checked={draft.irtraEnabled} onChange={(e) => setField("irtraEnabled", e.target.checked)} />
                <span>Lleva IRTRA e INTECAP <small>Cuota patronal; no se le descuenta nada.</small></span>
              </label>
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
