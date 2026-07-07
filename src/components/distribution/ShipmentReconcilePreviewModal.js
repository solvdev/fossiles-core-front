import React from "react";
import {
  Alert,
  Badge,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";
import {
  formatReconcilePreviewLineLabel,
  formatReconcilePreviewSummary,
  getReconcileActionMeta,
} from "utils/shipmentReconcilePreviewHelper";

function ShipmentReconcilePreviewModal({
  isOpen,
  toggle,
  title = "Vista previa del cuadre",
  preview,
  loading = false,
  error = "",
  applying = false,
  onConfirm,
}) {
  const warnings = Array.isArray(preview?.warnings) ? preview.warnings.filter(Boolean) : [];
  const lines = Array.isArray(preview?.lines) ? preview.lines : [];
  const summary = formatReconcilePreviewSummary(preview);
  const canApply = Boolean(preview?.hasChanges) && !loading && !error;

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>{title}</ModalHeader>
      <ModalBody>
        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
            <div className="mt-2 text-muted">Analizando envíos entregados…</div>
          </div>
        ) : error ? (
          <Alert color="danger" className="mb-0">{error}</Alert>
        ) : (
          <>
            <Alert color={preview?.hasChanges ? "warning" : "success"} className="py-2">
              {preview?.hasChanges ? (
                <>
                  <strong>Se aplicarán correcciones.</strong>
                  {summary ? <div className="mt-1">{summary}</div> : null}
                </>
              ) : (
                <>
                  <strong>No hay correcciones pendientes.</strong>
                  <div className="mt-1">
                    El inventario y kardex ya coinciden con los envíos entregados revisados.
                  </div>
                </>
              )}
            </Alert>

            {warnings.length > 0 && (
              <Alert color="warning" className="py-2">
                <strong>Advertencias</strong>
                <ul className="mb-0 pl-3 mt-1">
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Alert>
            )}

            {lines.length > 0 ? (
              <Table responsive size="sm" className="mb-0">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="text-right">Esperado</th>
                    <th className="text-right">ENTRADAs actuales</th>
                    <th className="text-right">Movimientos</th>
                    <th>Acciones previstas</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={`${line.shipmentId}-${line.productId}-${line.colorId ?? "x"}-${line.lineType}`}>
                      <td>
                        <div>{formatReconcilePreviewLineLabel(line)}</div>
                        {line.lineType === "PACKING" && (
                          <small className="text-muted">Empaque SUM-</small>
                        )}
                        {line.status === "WARNING" && (
                          <Badge color="warning" className="ml-1">Revisar</Badge>
                        )}
                      </td>
                      <td className="text-right">{line.qtyExpected}</td>
                      <td className="text-right">{line.currentEntradaSum}</td>
                      <td className="text-right">{line.movementCount}</td>
                      <td>
                        {(line.actions || []).length === 0 ? (
                          <span className="text-muted">Sin acciones automáticas</span>
                        ) : (
                          <ul className="mb-0 pl-3">
                            {(line.actions || []).map((action, index) => {
                              const meta = getReconcileActionMeta(action.type);
                              return (
                                <li key={`${action.type}-${action.movementId ?? index}-${index}`}>
                                  <Badge color={meta.color} className="mr-1">{meta.label}</Badge>
                                  {action.label}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : !preview?.hasChanges ? null : (
              <div className="text-muted">No se detallaron líneas individuales.</div>
            )}

            <Alert color="light" className="border mt-3 mb-0 py-2">
              No se borran ventas ni anulaciones. Tras cuadrar, vuelva a abrir o revisar el conteo físico
              para actualizar las columnas Ent./Fin.
            </Alert>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={applying}>
          Cancelar
        </Button>
        <Button
          color="primary"
          onClick={onConfirm}
          disabled={!canApply || applying}
        >
          {applying ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Cuadrando…
            </>
          ) : (
            "Confirmar cuadre"
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ShipmentReconcilePreviewModal;
