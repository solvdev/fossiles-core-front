import React, { useEffect, useState } from "react";
import {
  Button, FormGroup, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner,
} from "reactstrap";
import { showError, showWarning } from "utils/notificationHelper";

const CARRIERS_WITH_GUIDE = ["FORZA_DELIVERY", "GUATEX"];

const DispatchModal = ({
  isOpen,
  sale,
  productionOrderId,
  onClose,
  onSuccess,
  dispatchCustomerShipment,
}) => {
  const [dispatchData, setDispatchData] = useState({ guideNumber: "", shippingCarrier: "" });
  const [dispatching, setDispatching] = useState(false);

  useEffect(() => {
    if (sale) {
      setDispatchData({
        guideNumber: sale.guideNumber || "",
        shippingCarrier: sale.shippingCarrier || "",
      });
    }
  }, [sale]);

  const handleDispatch = async () => {
    setDispatching(true);
    try {
      const result = await dispatchCustomerShipment(productionOrderId, sale.onlineSaleId, dispatchData);
      // El despacho sale igual; el servidor avisa si falta la guía de Forza o Guatex.
      if (result?.warning) showWarning(result.warning);
      if (onSuccess) await onSuccess();
    } catch (err) {
      showError(err.message || "Error al despachar envío");
    } finally {
      setDispatching(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose}>
      <ModalHeader toggle={onClose}>
        Despachar envío — {sale?.customerName}
      </ModalHeader>
      <ModalBody>
        <p>
          <strong>Venta:</strong> #{sale?.saleNumber}
          <br />
          <strong>Dirección:</strong> {sale?.address}
          {sale?.observations && (
            <>
              <br />
              <strong>Observaciones:</strong> {sale.observations}
            </>
          )}
        </p>
        <FormGroup>
          <Label>Transporte</Label>
          <Input
            type="select"
            value={dispatchData.shippingCarrier}
            onChange={(e) => setDispatchData((p) => ({ ...p, shippingCarrier: e.target.value }))}
          >
            <option value="">Seleccionar...</option>
            <option value="FORZA_DELIVERY">Forza Delivery</option>
            <option value="GUATEX">Guatex</option>
          </Input>
        </FormGroup>
        <FormGroup>
          <Label>Número de guía{CARRIERS_WITH_GUIDE.includes(dispatchData.shippingCarrier) ? " *" : ""}</Label>
          <Input
            type="text"
            value={dispatchData.guideNumber}
            onChange={(e) => setDispatchData((p) => ({ ...p, guideNumber: e.target.value }))}
            placeholder="Número de guía"
          />
          {CARRIERS_WITH_GUIDE.includes(dispatchData.shippingCarrier) && !dispatchData.guideNumber.trim() && (
            <small className="text-warning">
              Escriba la guía que generó el transportista. Sin ella no se puede conciliar el cobro. El envío sale igual.
            </small>
          )}
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={onClose}>Cancelar</Button>
        <Button color="success" onClick={handleDispatch} disabled={dispatching}>
          {dispatching ? <Spinner size="sm" /> : "Confirmar despacho"}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default DispatchModal;
