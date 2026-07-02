import React, { useEffect, useMemo, useState } from "react";
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
  Table,
} from "reactstrap";
import {
  completeKioskSimpleReturn,
  lookupKioskSale,
} from "services/kioskExchangeService";
import {
  buildKioskReturnSlipPrintHtml,
  openExchangeSlipPrintWindow,
} from "utils/kioskExchangeSlipPrint";
import { formatCurrency, formatQty } from "../pos/posUtils";

function SimpleReturnWizard({ isOpen, onClose, kioskLocationId, onCompleted }) {
  const [step, setStep] = useState(1);
  const [saleQuery, setSaleQuery] = useState("");
  const [sale, setSale] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [returnedQty, setReturnedQty] = useState("1");
  const [apto, setApto] = useState("true");
  const [reason, setReason] = useState("");
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setStep(1);
    setSaleQuery("");
    setSale(null);
    setSelectedItemId("");
    setReturnedQty("1");
    setApto("true");
    setReason("");
    setObservations("");
    setError("");
  }, [isOpen]);

  const selectedItem = useMemo(
    () => (sale?.items || []).find((item) => String(item.id) === String(selectedItemId)),
    [sale, selectedItemId]
  );

  const handleLookupSale = async () => {
    setError("");
    if (!saleQuery.trim()) {
      setError("Indica el número de venta POS.");
      return;
    }
    try {
      setLoading(true);
      const result = await lookupKioskSale(saleQuery.trim(), kioskLocationId);
      setSale(result);
      setSelectedItemId(result?.items?.length === 1 ? String(result.items[0].id) : "");
      setStep(2);
    } catch (err) {
      setError(err.message || "No se encontró la venta.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError("");
    if (!selectedItem) {
      setError("Selecciona la línea devuelta.");
      return;
    }
    if (!reason.trim()) {
      setError("Indica el motivo de la devolución.");
      return;
    }
    try {
      setLoading(true);
      const slip = await completeKioskSimpleReturn({
        kioskLocationId,
        originalSaleId: sale.id,
        originalSaleItemId: selectedItem.id,
        returnedQuantity: Number(returnedQty || 1),
        apto: apto === "true",
        reason: reason.trim(),
        observations: observations.trim() || null,
      });
      openExchangeSlipPrintWindow(buildKioskReturnSlipPrintHtml(slip));
      onCompleted?.(slip);
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo registrar la devolución.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} size="lg">
      <ModalHeader toggle={onClose}>Nueva devolución</ModalHeader>
      <ModalBody>
        {error && <Alert color="danger">{error}</Alert>}

        {step === 1 && (
          <>
            <Label>Número de venta original (POS)</Label>
            <div className="d-flex">
              <Input
                value={saleQuery}
                onChange={(e) => setSaleQuery(e.target.value)}
                placeholder="Ej: POS-2026-0042"
                className="mr-2"
              />
              <Button color="primary" onClick={() => void handleLookupSale()} disabled={loading}>
                Buscar
              </Button>
            </div>
          </>
        )}

        {step === 2 && sale && (
          <>
            <p className="text-muted">Venta {sale.saleNumber} · {sale.saleDate}</p>
            <Table responsive size="sm">
              <thead>
                <tr>
                  <th />
                  <th>Código</th>
                  <th>Artículo</th>
                  <th>Cant.</th>
                  <th>Precio</th>
                </tr>
              </thead>
              <tbody>
                {(sale.items || []).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Input
                        type="radio"
                        name="return-line-simple"
                        checked={String(selectedItemId) === String(item.id)}
                        onChange={() => {
                          setSelectedItemId(String(item.id));
                          setReturnedQty(String(item.quantity || 1));
                        }}
                      />
                    </td>
                    <td>{item.productCode}</td>
                    <td>{item.productName}</td>
                    <td>{formatQty(item.quantity)}</td>
                    <td>{formatCurrency(item.unitPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <FormGroup className="mt-2" style={{ maxWidth: 180 }}>
              <Label>Cantidad devuelta</Label>
              <Input type="number" min="1" step="1" value={returnedQty} onChange={(e) => setReturnedQty(e.target.value)} />
            </FormGroup>
            <FormGroup>
              <Label>¿Producto apto para reventa?</Label>
              <Input type="select" value={apto} onChange={(e) => setApto(e.target.value)}>
                <option value="true">Sí — queda en kiosko (reintegro pendiente)</option>
                <option value="false">No — merma</option>
              </Input>
            </FormGroup>
            <FormGroup>
              <Label>Motivo</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </FormGroup>
            <FormGroup>
              <Label>Observaciones</Label>
              <Input type="textarea" value={observations} onChange={(e) => setObservations(e.target.value)} />
            </FormGroup>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {step === 2 && (
          <>
            <Button color="secondary" outline onClick={() => setStep(1)} disabled={loading}>
              Atrás
            </Button>
            <Button color="success" onClick={() => void handleSubmit()} disabled={loading}>
              {loading ? "Guardando..." : "Registrar devolución"}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

export default SimpleReturnWizard;
