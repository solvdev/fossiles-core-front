import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Input, Spinner } from "reactstrap";
import { createKioskSite } from "services/kioskFinancialsService";
import { showError, showSuccess } from "utils/notificationHelper";
import SiteCard from "./SiteCard";

/** Panel lateral "Sitios": alias, go-live, cierre y creación de sitios históricos. */
function SitesDrawer({ isOpen, onClose, sites, loading, error, canEdit, onChanged }) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    if (closeRef.current) closeRef.current.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (sites || []).filter(
      (s) => !q || s.name.toLowerCase().includes(q) || (s.aliases || []).some((a) => a.toLowerCase().includes(q))
    );
  }, [sites, search]);

  if (!isOpen) return null;

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await createKioskSite({ name, status: "ACTIVE" });
      showSuccess(`Sitio histórico "${name}" creado`);
      setNewName("");
      await onChanged();
    } catch (err) {
      showError(err.message || "No se pudo crear el sitio.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="kc-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="kc-drawer" role="dialog" aria-modal="true" aria-label="Sitios de kioscos">
        <div className="kc-drawer-head">
          <h5>Sitios de kioscos</h5>
          <Button innerRef={closeRef} color="secondary" size="sm" outline onClick={onClose} aria-label="Cerrar panel">
            Cerrar
          </Button>
        </div>
        <div className="kc-drawer-body">
          {!canEdit && (
            <Alert color="info" className="py-2">
              Modo lectura: no tienes permiso para editar sitios.
            </Alert>
          )}
          {canEdit && (
            <div className="kc-site-card">
              <h6>Crear sitio histórico</h6>
              <div className="small text-muted mb-2">
                Para kioscos que ya no existen en el catálogo (sin POS). Sólo tendrán datos importados.
              </div>
              <div className="d-flex">
                <Input
                  bsSize="sm"
                  placeholder="Nombre del sitio"
                  value={newName}
                  aria-label="Nombre del nuevo sitio histórico"
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") create();
                  }}
                />
                <Button size="sm" color="success" className="ml-2 my-0" disabled={!newName.trim() || creating} onClick={create}>
                  {creating ? <Spinner size="sm" /> : "Crear"}
                </Button>
              </div>
            </div>
          )}
          <Input
            type="search"
            bsSize="sm"
            className="mb-3"
            placeholder="Buscar kiosco o alias..."
            aria-label="Buscar kiosco o alias"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {loading ? (
            <div className="text-center py-4">
              <Spinner color="primary" /> <div>Cargando sitios...</div>
            </div>
          ) : error ? (
            <Alert color="danger">{error}</Alert>
          ) : filtered.length === 0 ? (
            <div className="text-muted text-center py-4">No hay sitios que coincidan.</div>
          ) : (
            filtered.map((site) => <SiteCard key={site.id} site={site} canEdit={canEdit} onSaved={onChanged} />)
          )}
        </div>
      </aside>
    </>
  );
}

export default SitesDrawer;
