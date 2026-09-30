import React from "react";
import { Button, Spinner } from "reactstrap";

function UnsavedBar({ count, saving, onSave, onDiscard }) {
  if (!count) return null;
  return (
    <div className="kc-unsaved-bar" role="region" aria-label="Cambios sin guardar">
      <span className="kc-unsaved-count" aria-live="polite">
        <i className="nc-icon nc-alert-circle-i" aria-hidden="true" /> {count} cambio{count === 1 ? "" : "s"} sin
        guardar
      </span>
      <Button color="success" size="sm" disabled={saving} onClick={onSave}>
        {saving ? <Spinner size="sm" /> : <i className="nc-icon nc-check-2" aria-hidden="true" />} Guardar
      </Button>
      <Button color="secondary" size="sm" outline disabled={saving} onClick={onDiscard} className="text-white">
        Descartar
      </Button>
    </div>
  );
}

export default UnsavedBar;
