import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
} from "reactstrap";
import { getSlipSummary, printSlipBatch } from "services/internalShipmentRequestService";
import { openSlipsBookletPrintWindow } from "utils/internalShipmentSlipPrintHtml";
import { showError, showSuccess } from "utils/notificationHelper";

function PrintSlipBookletModal({ isOpen, toggle, onPrinted }) {
  const [quantity, setQuantity] = useState(50);
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setQuantity(50);
    setLoadingSummary(true);
    getSlipSummary()
      .then((data) => setSummary(data))
      .catch((err) => console.error("Error al cargar resumen de boletas:", err))
      .finally(() => setLoadingSummary(false));
  }, [isOpen]);

  const handlePrint = async () => {
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      showError("Indique una cantidad válida de boletas.");
      return;
    }
    if (qty > 300) {
      showError("El máximo permitido por impresión es de 300 boletas.");
      return;
    }
    try {
      setPrinting(true);
      const res = await printSlipBatch(qty);
      if (res?.slipNumbers?.length) {
        openSlipsBookletPrintWindow(res.slipNumbers);
        showSuccess(`Talonario generado: ${res.fromSlip} al ${res.toSlip} (${res.quantity} boletas)`);
        if (onPrinted) onPrinted(res);
        toggle();
      } else {
        showError("No se recibieron números de boleta para imprimir.");
      }
    } catch (err) {
      showError(err.message || "Error al generar talonario de boletas");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={printing ? undefined : toggle} centered>
      <ModalHeader toggle={printing ? undefined : toggle}>
        <i className="nc-icon nc-paper mr-2" /> Imprimir talonario de boletas de solicitud
      </ModalHeader>
      <ModalBody>
        <p className="text-muted small mb-3">
          Genera e imprime un talonario de boletas físicas en blanco con su número correlativo oficial (<strong>BLS-nnnnn</strong>). Con estas boletas físicas los colaboradores llenan su solicitud y luego se ingresan al sistema.
        </p>

        {loadingSummary ? (
          <div className="text-center py-3">
            <Spinner size="sm" color="primary" /> Cargando correlativo actual…
          </div>
        ) : summary ? (
          <Alert color="info" className="py-2 mb-3 small">
            <div><strong>Próximo correlativo a emitir:</strong> {summary.nextSlipNumber || "BLS-00001"}</div>
            <div><strong>Total boletas emitidas históricamente:</strong> {summary.totalPrinted || 0}</div>
            <div><strong>Boletas pendientes de ingresar:</strong> {summary.totalAvailable || 0}</div>
          </Alert>
        ) : null}

        <FormGroup>
          <Label for="slipQuantity"><strong>Cantidad de boletas a imprimir:</strong></Label>
          <Input
            id="slipQuantity"
            type="number"
            min={1}
            max={300}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            disabled={printing}
          />
          <small className="text-muted">
            Por defecto: 50 boletas (2 boletas por página tamaño carta).
          </small>
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={printing}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handlePrint} disabled={printing || loadingSummary}>
          {printing ? (
            <>
              <Spinner size="sm" className="mr-1" /> Generando…
            </>
          ) : (
            <>
              <i className="nc-icon nc-paper mr-1" /> Generar e imprimir
            </>
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PrintSlipBookletModal;
