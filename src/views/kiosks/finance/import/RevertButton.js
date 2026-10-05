import React, { useState } from "react";
import { Button, Spinner } from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { MONTHS_ES } from "utils/financeFormat";
import { revertKioskImport } from "services/kioskFinancialsService";
import { showError, showSuccess } from "utils/notificationHelper";

/** "Revertir lote" con confirmación. `batch` = { id|batchId, fileName, year, month }. */
function RevertButton({ batch, onReverted, disabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const id = batch.batchId ?? batch.id;

  const revert = async () => {
    setBusy(true);
    try {
      await revertKioskImport(id);
      showSuccess(`Lote #${id} revertido`);
      if (onReverted) onReverted(id);
    } catch (err) {
      showError(err.message || "No se pudo revertir el lote.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        color="danger"
        size="sm"
        outline
        className="m-0"
        disabled={busy || disabled}
        aria-label={`Revertir lote ${id}`}
        onClick={() => setOpen(true)}
      >
        {busy ? <Spinner size="sm" /> : <i className="nc-icon nc-refresh-69" aria-hidden="true" />} Revertir lote
      </Button>
      <ConfirmModal
        isOpen={open}
        toggle={() => setOpen(false)}
        onConfirm={revert}
        title={`Revertir lote #${id}`}
        message={
          <div>
            <p className="mb-1">
              Se eliminará todo lo escrito por este lote
              {batch.fileName ? (
                <>
                  {" "}
                  (<strong>{batch.fileName}</strong>
                  {batch.year ? `, ${MONTHS_ES[(batch.month || 1) - 1]} ${batch.year}` : ""})
                </>
              ) : null}
              : ventas, metas, tasas y costos, y el lote quedará marcado como revertido.
            </p>
            <p className="small text-muted mb-0">Podrás volver a importar el archivo cuando quieras.</p>
          </div>
        }
        confirmText="Sí, revertir"
        confirmColor="danger"
      />
    </>
  );
}

export default RevertButton;
