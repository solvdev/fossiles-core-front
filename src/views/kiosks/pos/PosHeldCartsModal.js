import React, { useEffect, useState } from "react";
import {
  Badge,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "reactstrap";
import { formatCurrency } from "./posUtils";
import {
  EXTRA_APPROVED,
  EXTRA_PENDING,
  EXTRA_REJECTED,
  defaultHeldCartLabel,
  lineTotalWithExtra,
  parseHeldCart,
} from "./posExtraUtils";

const STATUS_BADGE = {
  [EXTRA_PENDING]: { color: "warning", text: "Complemento pendiente" },
  [EXTRA_APPROVED]: { color: "success", text: "Complemento autorizado" },
  [EXTRA_REJECTED]: { color: "danger", text: "Complemento rechazado" },
};

const formatTime = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
};

/** Pide la etiqueta con la que se deja la venta en espera. */
export function PosHoldCartModal({ isOpen, cart, onClose, onConfirm, saving = false }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (isOpen) setLabel("");
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} toggle={saving ? undefined : onClose} centered>
      <ModalHeader toggle={saving ? undefined : onClose}>Poner venta en espera</ModalHeader>
      <ModalBody>
        <p className="text-muted small mb-3">
          Guarda el carrito para atender a otro cliente. Podrás retomarlo desde «En espera» hoy mismo; no se
          descuenta stock ni se factura hasta cobrarlo.
        </p>
        <FormGroup className="mb-0">
          <Label>Identificación (opcional)</Label>
          <Input
            value={label}
            maxLength={160}
            placeholder={defaultHeldCartLabel(cart)}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </FormGroup>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          color="primary"
          onClick={() => onConfirm(label.trim() || defaultHeldCartLabel(cart))}
          disabled={saving}
        >
          {saving ? "Guardando..." : "Dejar en espera"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/** Lista de ventas en espera del kiosko (del día) con estado de sus complementos. */
function PosHeldCartsModal({
  isOpen,
  onClose,
  heldCarts,
  requestsById,
  cartIsEmpty,
  busyId,
  onResume,
  onDiscard,
}) {
  return (
    <Modal isOpen={isOpen} toggle={onClose} centered size="lg">
      <ModalHeader toggle={onClose}>Ventas en espera</ModalHeader>
      <ModalBody>
        {!cartIsEmpty && heldCarts.length > 0 ? (
          <div className="kiosk-pos-extra-block-note mb-3">
            Para retomar una venta primero cobra o deja en espera la venta actual.
          </div>
        ) : null}
        {heldCarts.length === 0 ? (
          <p className="text-muted mb-0">No hay ventas en espera.</p>
        ) : (
          heldCarts.map((held) => {
            const parsed = parseHeldCart(held.cartJson);
            const total = parsed.cart.reduce((sum, line) => sum + lineTotalWithExtra(line), 0);
            const extras = parsed.cart.filter((line) => line.extraRequest);
            const busy = busyId === held.id;
            return (
              <div key={held.id} className="kiosk-pos-held-row">
                <div className="kiosk-pos-held-row-main">
                  <div className="kiosk-pos-held-row-title">
                    {held.label || "Venta en espera"}
                    <span className="text-muted small">
                      {" "}· {formatTime(held.createdAt)}
                      {held.createdByName ? ` · ${held.createdByName}` : ""}
                    </span>
                  </div>
                  <div className="kiosk-pos-held-row-items">
                    {parsed.cart.map((line) => `${line.quantity} × ${line.productName}`).join(", ")}
                  </div>
                  <div className="kiosk-pos-held-row-flags">
                    <strong>{formatCurrency(total)}</strong>
                    {extras.map((line) => {
                      const status = requestsById?.[line.extraRequest.id]?.status || line.extraRequest.status;
                      const badge = STATUS_BADGE[status] || { color: "secondary", text: status };
                      return (
                        <Badge key={line.key} color={badge.color} className="ml-2">
                          {badge.text}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
                <div className="kiosk-pos-held-row-actions">
                  <Button
                    color="primary"
                    size="sm"
                    disabled={!cartIsEmpty || busy}
                    onClick={() => onResume(held)}
                  >
                    Retomar
                  </Button>
                  <Button
                    color="danger"
                    outline
                    size="sm"
                    disabled={busy}
                    onClick={() => onDiscard(held)}
                  >
                    Descartar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onClose}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PosHeldCartsModal;
