import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, FormGroup, Input, Label, Spinner, Table } from "reactstrap";
import { useAuth } from "contexts/AuthContext";
import { getPayrollProfiles, updatePayrollProfile } from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatAmount } from "utils/payrollPrintHtml";
import TablePagination, { usePagination } from "components/TablePagination/TablePagination";

const EDITABLE = ["employmentType", "payGroup", "paymentMethod", "bankAccount", "salary", "bonification", "terminationDate"];
const GROUP_LABELS = { PLANTA: "Planta", ADMINISTRACION: "Administración" };

const toDraft = (profile) => ({
  employmentType: profile.employmentType || "PLANILLA",
  payGroup: profile.payGroup || "ADMINISTRACION",
  paymentMethod: profile.paymentMethod || "",
  bankAccount: profile.bankAccount || "",
  salary: profile.salary ?? "",
  bonification: profile.bonification ?? "",
  terminationDate: profile.terminationDate || "",
});

const NUMERIC = new Set(["salary", "bonification"]);
const NO_FILTERS = { group: "", type: "", search: "", onlyWarnings: false, includeInactive: false };
const filtersFor = (focus) => (focus
  ? { ...NO_FILTERS, group: focus.group || "", search: focus.search || "", onlyWarnings: Boolean(focus.onlyWarnings) }
  : NO_FILTERS);

const sameValue = (key, a, b) => {
  const left = a === null || a === undefined ? "" : String(a).trim();
  const right = b === null || b === undefined ? "" : String(b).trim();
  if (NUMERIC.has(key) && left !== "" && right !== "") return Number(left) === Number(right);
  return left === right;
};

/**
 * Datos de la ficha que usa la planilla, de todos en una tabla: vinculación, grupo, forma de pago, cuenta, salario,
 * bonificación y fecha de baja. Guardar reemplaza esos datos: lo que se deja vacío queda vacío.
 * `focus` llega desde una planilla para mostrar el grupo, las fichas con avisos o una persona.
 */
function PayrollProfiles({ focus }) {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("PLANILLA.CORRIDAS.CREAR");
  const [profiles, setProfiles] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState(() => new Set());
  const [filters, setFilters] = useState(() => filtersFor(focus));

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
    const count = (fn) => active.filter(fn).length;
    return {
      plantPlanilla: count((p) => p.payGroup === "PLANTA" && p.employmentType === "PLANILLA"),
      plantServicios: count((p) => p.payGroup === "PLANTA" && p.employmentType === "SERVICIOS"),
      adminPlanilla: count((p) => p.payGroup === "ADMINISTRACION" && p.employmentType === "PLANILLA"),
      adminServicios: count((p) => p.payGroup === "ADMINISTRACION" && p.employmentType === "SERVICIOS"),
      withWarnings: count((p) => (p.warnings || []).length > 0),
    };
  }, [profiles]);

  const draftOf = (profile) => drafts[profile.id] || toDraft(profile);
  const isDirty = (profile) => {
    const draft = drafts[profile.id];
    if (!draft) return false;
    const original = toDraft(profile);
    return EDITABLE.some((key) => !sameValue(key, original[key], draft[key]));
  };
  // Los cambios se aplican sobre el estado vigente: varias filas se pueden editar y guardar a la vez.
  const setField = (profile, key, value) =>
    setDrafts((current) => ({ ...current, [profile.id]: { ...(current[profile.id] || toDraft(profile)), [key]: value } }));
  const setSaving = (id, saving) =>
    setSavingIds((current) => {
      const next = new Set(current);
      if (saving) next.add(id);
      else next.delete(id);
      return next;
    });

  const save = async (profile) => {
    const draft = draftOf(profile);
    if (draft.salary === "" || !(Number(draft.salary) >= 0)) {
      showError("Indique el salario mensual, de cero en adelante.");
      return;
    }
    if (draft.bonification !== "" && !(Number(draft.bonification) >= 0)) {
      showError("La bonificación no puede ser negativa.");
      return;
    }
    if (!draft.paymentMethod) {
      showError("Indique la forma de pago.");
      return;
    }
    setSaving(profile.id, true);
    try {
      const saved = await updatePayrollProfile(profile.id, {
        employmentType: draft.employmentType,
        payGroup: draft.payGroup,
        paymentMethod: draft.paymentMethod,
        bankAccount: String(draft.bankAccount || "").trim() || null,
        salary: Number(draft.salary),
        bonification: draft.bonification === "" ? null : Number(draft.bonification),
        terminationDate: draft.terminationDate || null,
        nit: profile.nit || null,
        igssAffiliation: profile.igssAffiliation || null,
      });
      setProfiles((current) => current.map((p) => (p.id === saved.id ? saved : p)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[profile.id];
        return next;
      });
      showSuccess(`Ficha de ${saved.fullName} guardada.`);
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(profile.id, false);
    }
  };

  if (loading) return <Spinner size="sm" />;

  return (
    <>
      <p className="small text-muted mb-2">
        Activos · Planta: {summary.plantPlanilla} de planilla, {summary.plantServicios} de servicios · Administración y
        kioscos: {summary.adminPlanilla} de planilla, {summary.adminServicios} de servicios.
        {summary.withWarnings > 0 && <strong> {summary.withWarnings} fichas con avisos.</strong>} Bonificación vacía: Q250
        al mes.
      </p>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <Input placeholder="Nombre, departamento o puesto" aria-label="Buscar ficha" value={filters.search} style={{ width: 280 }}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })} />
        <Input type="select" value={filters.group} style={{ width: "auto" }}
          onChange={(e) => setFilters({ ...filters, group: e.target.value })}>
          <option value="">Todos los grupos</option>
          <option value="PLANTA">Planta</option>
          <option value="ADMINISTRACION">Administración y kioscos</option>
        </Input>
        <Input type="select" value={filters.type} style={{ width: "auto" }}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">Planilla y servicios</option>
          <option value="PLANILLA">Planilla</option>
          <option value="SERVICIOS">Servicios</option>
        </Input>
        <FormGroup check inline className="mb-0">
          <Label check>
            <Input type="checkbox" checked={filters.onlyWarnings}
              onChange={(e) => setFilters({ ...filters, onlyWarnings: e.target.checked })} />
            <span className="form-check-sign" />
            Solo con avisos
          </Label>
        </FormGroup>
        <FormGroup check inline className="mb-0">
          <Label check>
            <Input type="checkbox" checked={filters.includeInactive}
              onChange={(e) => setFilters({ ...filters, includeInactive: e.target.checked })} />
            <span className="form-check-sign" />
            Incluir inactivos
          </Label>
        </FormGroup>
      </div>
      <Table size="sm" responsive>
        <thead>
          <tr>
            <th>Colaborador</th>
            <th>Vinculación</th>
            <th>Grupo</th>
            <th>Forma de pago</th>
            <th>Cuenta</th>
            <th className="text-right">Salario mensual</th>
            <th className="text-right">Bonificación</th>
            <th>Baja</th>
            <th>Avisos</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 && (
            <tr>
              <td colSpan="10" className="text-muted">No hay fichas con esos filtros.</td>
            </tr>
          )}
          {pagination.pageItems.map((profile) => {
            const draft = draftOf(profile);
            return (
              <tr key={profile.id}>
                <td>
                  {profile.fullName}
                  <div className="small text-muted">
                    {[profile.departmentName, profile.position].filter(Boolean).join(" · ") || "Sin departamento"}
                  </div>
                </td>
                {canEdit ? (
                  <>
                    <td>
                      <Input type="select" bsSize="sm" value={draft.employmentType} style={{ minWidth: 110 }}
                        onChange={(e) => setField(profile, "employmentType", e.target.value)}>
                        <option value="PLANILLA">Planilla</option>
                        <option value="SERVICIOS">Servicios</option>
                      </Input>
                    </td>
                    <td>
                      <Input type="select" bsSize="sm" value={draft.payGroup} style={{ minWidth: 150 }}
                        onChange={(e) => setField(profile, "payGroup", e.target.value)}>
                        <option value="PLANTA">Planta</option>
                        <option value="ADMINISTRACION">Administración</option>
                      </Input>
                    </td>
                    <td>
                      <Input type="select" bsSize="sm" value={draft.paymentMethod} style={{ minWidth: 150 }}
                        onChange={(e) => setField(profile, "paymentMethod", e.target.value)}>
                        <option value="">Sin definir</option>
                        <option value="TRANSFERENCIA BANCARIA">Transferencia</option>
                        <option value="CHEQUE">Cheque</option>
                        <option value="EFECTIVO">Efectivo</option>
                      </Input>
                    </td>
                    <td>
                      <Input bsSize="sm" maxLength={50} value={draft.bankAccount} style={{ minWidth: 130 }}
                        onChange={(e) => setField(profile, "bankAccount", e.target.value)} />
                    </td>
                    <td>
                      <Input bsSize="sm" type="number" step="0.01" min="0" className="text-right" value={draft.salary}
                        style={{ minWidth: 110 }}
                        onChange={(e) => setField(profile, "salary", e.target.value)} />
                    </td>
                    <td>
                      <Input bsSize="sm" type="number" step="0.01" min="0" className="text-right" placeholder="Ley"
                        value={draft.bonification} onChange={(e) => setField(profile, "bonification", e.target.value)} />
                    </td>
                    <td>
                      <Input bsSize="sm" type="date" value={draft.terminationDate} style={{ minWidth: 150 }}
                        onChange={(e) => setField(profile, "terminationDate", e.target.value)} />
                    </td>
                  </>
                ) : (
                  <>
                    <td>{profile.employmentType}</td>
                    <td>{GROUP_LABELS[profile.payGroup] || profile.payGroup}</td>
                    <td>{profile.paymentMethod || "—"}</td>
                    <td>{profile.bankAccount || "—"}</td>
                    <td className="text-right">{profile.salary != null ? formatAmount(profile.salary) : "—"}</td>
                    <td className="text-right">{profile.bonification != null ? formatAmount(profile.bonification) : "Ley"}</td>
                    <td>{profile.terminationDate || ""}</td>
                  </>
                )}
                <td>
                  {(profile.warnings || []).map((warning) => (
                    <Badge key={warning} color="warning" className="mr-1 mb-1">{warning}</Badge>
                  ))}
                </td>
                <td>
                  {canEdit && isDirty(profile) && (
                    <Button size="sm" color="primary" disabled={savingIds.has(profile.id)} onClick={() => save(profile)}>
                      Guardar
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <TablePagination pagination={pagination} />
    </>
  );
}

export default PayrollProfiles;
