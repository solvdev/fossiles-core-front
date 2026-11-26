import React, { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";
import {
  SHIPMENT_SOURCE,
  bulkShipmentSource,
  defaultShipmentSource,
  formatShipmentQty as fmt,
  shipmentSourceOptions,
} from "utils/shipmentSourceHelper";

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
 * Desglose de stock antes de enviar cuando la bodega principal no alcanza. El usuario elige por línea de dónde
 * sale: la principal, todo de la otra cubeta, o la principal y el faltante de la otra (envío directo: la principal
 * es Devoluciones; envío de distribución: Bodega PT).
 */
function ShipmentDispatchStockModal({ isOpen, check, sending, onCancel, onConfirm }) {
  const [chosen, setChosen] = useState({});

  useEffect(() => {
    if (isOpen) setChosen({});
  }, [isOpen, check?.shipmentId]);

  if (!check) return null;
  const primary = check.primaryWarehouseLabel || "bodega principal";
  const fallback = check.fallbackWarehouseLabel;
  const canFallback = Boolean(check.fallbackAvailable && check.canSendWithFallback);
  const lines = Array.isArray(check.lines) ? check.lines : [];
  const pending = lines.filter((line) => Number(line.requiredQuantity || 0) > 0);

  const sourceOf = (line) => chosen[line.detailId] ?? defaultShipmentSource(line);
  const complete = pending.length > 0 && pending.every((line) => sourceOf(line));
  const allFromFallback = pending.every((line) => bulkShipmentSource(line, true));

  const applyToAll = (wholeFallback) =>
    setChosen(
      pending.reduce((acc, line) => {
        const source = bulkShipmentSource(line, wholeFallback);
        if (source) acc[line.detailId] = source;
        return acc;
      }, {})
    );

  const confirm = () =>
    onConfirm({
      takeShortageFromFallback: pending.some((line) => sourceOf(line) === SHIPMENT_SOURCE.BOTH),
      fromFallbackDetailIds: pending
        .filter((line) => sourceOf(line) === SHIPMENT_SOURCE.FALLBACK)
        .map((line) => line.detailId),
    });

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
          Elija de qué bodega sale cada línea:
        </p>
        {fallback && canFallback ? (
          <div className="mb-2">
            <Button color="warning" outline size="sm" className="mr-2" disabled={sending} onClick={() => applyToAll(false)}>
              Solo el faltante de {fallback}
            </Button>
            {allFromFallback ? (
              <Button color="warning" outline size="sm" disabled={sending} onClick={() => applyToAll(true)}>
                Todo de {fallback}
              </Button>
            ) : null}
          </div>
        ) : null}
        <Table size="sm" bordered responsive className="mb-3">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Color / talla</th>
              <th className="text-right">Requerido</th>
              <th className="text-right">Devoluciones</th>
              <th className="text-right">Bodega PT</th>
              <th className="text-right">Faltante en {primary}</th>
              <th style={{ minWidth: 220 }}>Sale de</th>
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
                  <td>
                    {Number(line.requiredQuantity || 0) > 0 ? (
                      <Input
                        type="select"
                        bsSize="sm"
                        aria-label={`Bodega de salida de ${line.productCode || line.productName || "producto"}`}
                        value={sourceOf(line)}
                        disabled={sending}
                        onChange={(e) => setChosen((prev) => ({ ...prev, [line.detailId]: e.target.value }))}
                      >
                        {!defaultShipmentSource(line) && (
                          <option value="">{stillShort ? "Sin stock suficiente" : "Elija…"}</option>
                        )}
                        {shipmentSourceOptions(line, primary, fallback).map((option) => (
                          <option key={option.value} value={option.value} disabled={!option.enabled}>
                            {option.label}
                          </option>
                        ))}
                      </Input>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>

        {fallback && canFallback ? (
          <div className="small text-muted">
            Lo que salga de {fallback} queda escrito en el kardex con tu usuario como autorización.
          </div>
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
        <Button color="primary" onClick={confirm} disabled={sending || !canFallback || !complete}>
          {sending ? <Spinner size="sm" /> : "Enviar"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ShipmentDispatchStockModal;
