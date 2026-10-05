import React, { useEffect, useState } from "react";
import { Badge, Button, Input, Spinner } from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { fmtDateEs } from "utils/financeFormat";
import { normalizeAlias } from "utils/financeInput";
import { updateKioskSite } from "services/kioskFinancialsService";
import { showError, showSuccess } from "utils/notificationHelper";

const draftFrom = (site) => ({
  name: site.name || "",
  status: site.status || "ACTIVE",
  closedOn: site.closedOn || "",
  override: site.posGoLiveOverride || "",
  aliases: [...(site.aliases || [])],
  exclude: !!site.excludeFromReports,
});

const sameList = (a, b) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/** Devuelve el cuerpo PUT con sólo lo que cambió (o null si no hay cambios). */
export const buildSiteUpdate = (site, draft) => {
  const body = {};
  if (draft.name.trim() && draft.name.trim() !== site.name) body.name = draft.name.trim();
  if (draft.status !== (site.status || "ACTIVE")) {
    body.status = draft.status;
    body.closedOn = draft.status === "CLOSED" ? draft.closedOn || null : null;
  } else if (draft.status === "CLOSED" && (draft.closedOn || "") !== (site.closedOn || "")) {
    body.closedOn = draft.closedOn || null;
  }
  if ((draft.override || "") !== (site.posGoLiveOverride || "")) {
    if (draft.override) body.posGoLiveOverride = draft.override;
    else body.clearGoLiveOverride = true;
  }
  if (!sameList(draft.aliases, site.aliases || [])) body.aliases = draft.aliases;
  if (!!draft.exclude !== !!site.excludeFromReports) body.excludeFromReports = !!draft.exclude;
  return Object.keys(body).length ? body : null;
};

function SiteCard({ site, canEdit, onSaved }) {
  const [draft, setDraft] = useState(() => draftFrom(site));
  const [aliasText, setAliasText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    setDraft(draftFrom(site));
    setAliasText("");
  }, [site]);

  const body = buildSiteUpdate(site, draft);
  const dirty = !!body;
  const isHistoric = site.locationId === null || site.locationId === undefined;

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const addAlias = () => {
    const normalized = normalizeAlias(aliasText);
    if (!normalized) return;
    if (draft.aliases.includes(normalized)) {
      setAliasText("");
      return;
    }
    set({ aliases: [...draft.aliases, normalized] });
    setAliasText("");
  };

  const save = async () => {
    if (!body) return;
    setSaving(true);
    try {
      await updateKioskSite(site.id, body);
      showSuccess(`Sitio "${draft.name}" actualizado`);
      await onSaved();
    } catch (err) {
      showError(err.message || "No se pudo actualizar el sitio.");
    } finally {
      setSaving(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={`kc-site-card ${site.status === "CLOSED" ? "is-closed" : ""} ${dirty ? "is-dirty" : ""}`}>
      <div className="d-flex justify-content-between align-items-start">
        <h6>{site.name}</h6>
        <div>
          {isHistoric ? (
            <Badge color="secondary" className="mr-1">
              Histórico
            </Badge>
          ) : (
            <Badge color="info" className="mr-1">
              {site.locationCode || "POS"}
            </Badge>
          )}
          {site.excludeFromReports && (
            <Badge color="warning" className="mr-1">
              Externo
            </Badge>
          )}
          <Badge color={site.status === "CLOSED" ? "secondary" : "success"}>
            {site.status === "CLOSED" ? "Cerrado" : "Activo"}
          </Badge>
        </div>
      </div>

      <label htmlFor={`kc-site-name-${site.id}`}>Nombre</label>
      <Input
        id={`kc-site-name-${site.id}`}
        bsSize="sm"
        value={draft.name}
        disabled={!canEdit}
        onChange={(e) => set({ name: e.target.value })}
      />

      <label htmlFor={`kc-site-golive-${site.id}`}>Inicio de ventas POS (go-live)</label>
      <div className="small text-muted mb-1">
        Detectado: {site.posGoLiveDetected ? fmtDateEs(site.posGoLiveDetected) : "sin ventas POS"} · Efectivo:{" "}
        {site.goLiveEffective ? fmtDateEs(site.goLiveEffective) : "—"}
      </div>
      <div className="d-flex align-items-center">
        <Input
          id={`kc-site-golive-${site.id}`}
          type="date"
          bsSize="sm"
          value={draft.override}
          disabled={!canEdit}
          onChange={(e) => set({ override: e.target.value })}
          aria-label="Fecha manual de go-live (override)"
          style={{ maxWidth: 170 }}
        />
        {draft.override ? (
          <Button size="sm" color="link" disabled={!canEdit} onClick={() => set({ override: "" })}>
            Quitar override
          </Button>
        ) : (
          <span className="small text-muted ml-2">Sin override (se usa la fecha detectada)</span>
        )}
      </div>

      <label htmlFor={`kc-site-alias-${site.id}`}>Alias (nombres en los Excel)</label>
      <div>
        {draft.aliases.length === 0 && <span className="small text-muted">Sin alias</span>}
        {draft.aliases.map((a) => (
          <span key={a} className="kc-chip">
            {a}
            {canEdit && (
              <button
                type="button"
                aria-label={`Quitar alias ${a}`}
                onClick={() => set({ aliases: draft.aliases.filter((x) => x !== a) })}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {canEdit && (
        <div className="d-flex">
          <Input
            id={`kc-site-alias-${site.id}`}
            bsSize="sm"
            placeholder="Agregar alias y Enter"
            value={aliasText}
            onChange={(e) => setAliasText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAlias();
              }
            }}
          />
          <Button size="sm" color="info" className="ml-2 my-0" onClick={addAlias} disabled={!aliasText.trim()}>
            Agregar
          </Button>
        </div>
      )}

      <label htmlFor={`kc-site-status-${site.id}`}>Estado</label>
      <div className="d-flex align-items-center flex-wrap">
        <Input
          id={`kc-site-status-${site.id}`}
          type="select"
          bsSize="sm"
          disabled={!canEdit}
          style={{ maxWidth: 140 }}
          value={draft.status}
          onChange={(e) => {
            const status = e.target.value;
            if (status === "CLOSED") setConfirmClose(true);
            else set({ status, closedOn: "" });
          }}
        >
          <option value="ACTIVE">Activo</option>
          <option value="CLOSED">Cerrado</option>
        </Input>
        {draft.status === "CLOSED" && (
          <Input
            type="date"
            bsSize="sm"
            aria-label="Fecha de cierre"
            className="ml-2"
            style={{ maxWidth: 170 }}
            value={draft.closedOn}
            max={today}
            disabled={!canEdit}
            onChange={(e) => set({ closedOn: e.target.value })}
          />
        )}
      </div>

      <div className="form-check mt-2">
        <label className="form-check-label">
          <Input
            type="checkbox"
            checked={!!draft.exclude}
            disabled={!canEdit}
            onChange={(e) => set({ exclude: e.target.checked })}
          />
          Sitio externo: no aparece en ningún reporte de Finanzas
          <span className="form-check-sign" />
        </label>
      </div>

      {canEdit && (
        <div className="text-right mt-2">
          <Button size="sm" color="secondary" outline className="mr-2" disabled={!dirty || saving} onClick={() => setDraft(draftFrom(site))}>
            Deshacer
          </Button>
          <Button size="sm" color="primary" disabled={!dirty || saving} onClick={save}>
            {saving ? <Spinner size="sm" /> : null} Guardar sitio
          </Button>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmClose}
        toggle={() => setConfirmClose(false)}
        onConfirm={() => set({ status: "CLOSED", closedOn: draft.closedOn || today })}
        title="Cerrar kiosco"
        message={`Marcar "${site.name}" como cerrado. Sus datos históricos se conservan; podrás guardar la fecha de cierre.`}
        confirmText="Marcar cerrado"
        confirmColor="warning"
      />
    </div>
  );
}

export default SiteCard;
