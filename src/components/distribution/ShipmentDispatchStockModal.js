import React, { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";

const fmt = (value) => {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

/** Etiqueta de envío directo a kiosco (sale de Devoluciones, sin distribución). */
export function DirectKioskShipmentBadge({ shipment, className = "ml-1" }) {
  if (!shipment?.directKioskShipment) return null;
  return (
    <Badge color="warning" className={className} title="Sin distribución: sale de Devoluciones">
      Envío directo a kiosco
    </Badge>
  );
}

/**
 * Desglose de stock antes de enviar cuando la bodega principal no alcanza. El faltante solo se toma de la otra
 * cubeta si el usuario marca la casilla: envío directo → de Bodega PT; envío de distribución → de Devoluciones.
 */
function ShipmentDispatchStockModal({ isOpen, check, sending, onCancel, onConfirm }) {
  const [takeFallback, setTakeFallback] = useState(false);

  useEffect(() => {
    if (isOpen) setTakeFallback(false);
  }, [isOpen, check?.shipmentId]);

  if (!check) return null;
  const primary = check.primaryWarehouseLabel || "bodega principal";
  const fallback = check.fallbackWarehouseLabel;
  const canFallback = Boolean(check.fallbackAvailable && check.canSendWithFallback);
  const lines = Array.isArray(check.lines) ? check.lines : [];

  return (
    <Modal isOpen={isOpen} toggle={sending ? undefined : onCancel} size="lg">
      <ModalHeader toggle={sending ? undefined : onCancel}>
        No alcanza {primary} · {check.shipmentNumber || `Envío #${check.shipmentId}`}
        {check.directKioskShipment ? (
          <Badge color="warning" className="ml-2 align-middle">
            Envío directo a kiosco
          </Badge>
        ) : null}
      </ModalHeader>
      <ModalBody>
        <p className="mb-2">
          {check.directKioskShipment
            ? "Un envío directo a kiosco sale solo de Devoluciones."
            : "Un envío de distribución sale solo de Bodega PT."}{" "}
          Así queda lo que hay para cada línea:
        </p>
        <Table size="sm" bordered responsive className="mb-3">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Color / talla</th>
              <th className="text-right">Requerido</th>
              <th className="text-right">Devoluciones</th>
              <th className="text-right">Bodega PT</th>
              <th className="text-right">Faltante en {primary}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const short = Number(line.shortageQuantity || 0) > 0;
              const stillShort = Number(line.shortageAfterFallback || 0) > 0;
              return (
                <tr key={line.detailId || `${line.productId}-${line.colorId}-${line.size}`}>
                  <td>
                    <strong>{line.productCode || line.productId}</strong>{" "}
                    <span className="text-muted">{line.productName}</span>
                  </td>
                  <td className="small">
                    {line.colorName || "—"}
                    {line.size ? ` · ${line.size}` : ""}
                  </td>
                  <td className="text-right">{fmt(line.requiredQuantity)}</td>
                  <td className="text-right">{fmt(line.returnsAvailable)}</td>
                  <td className="text-right">{fmt(line.ptAvailable)}</td>
                  <td className={`text-right ${short ? "text-danger font-weight-bold" : "text-muted"}`}>
                    {short ? fmt(line.shortageQuantity) : "—"}
                    {stillShort ? (
                      <div className="small text-danger">sin cubrir: {fmt(line.shortageAfterFallback)}</div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        {fallback && canFallback ? (
          <FormGroup check className="p-2 border rounded" style={{ background: "#fff8e1" }}>
            <Label check>
              <Input
                type="checkbox"
                checked={takeFallback}
                disabled={sending}
                onChange={(e) => setTakeFallback(e.target.checked)}
              />
              <span className="form-check-sign" />
              <strong>Tomar el faltante de {fallback}</strong>
            </Label>
            <div className="small text-muted mt-1">
              Sale primero todo lo que hay en {primary} y el resto de {fallback}. El kardex lo deja escrito con tu
              usuario como autorización.
            </div>
          </FormGroup>
        ) : (
          <Alert color="danger" className="mb-0">
            {fallback
              ? `Ni sumando ${fallback} alcanza para todas las líneas. Ajusta las cantidades del envío.`
              : "Este envío no puede tomar el faltante de otra bodega. Ajusta las cantidades del envío."}
          </Alert>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onCancel} disabled={sending}>
          Cancelar
        </Button>
        <Button
          color="primary"
          onClick={() => onConfirm(true)}
          disabled={sending || !canFallback || !takeFallback}
        >
          {sending ? <Spinner size="sm" /> : `Enviar tomando de ${fallback || "la otra bodega"}`}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ShipmentDispatchStockModal;
