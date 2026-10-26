import React, { useEffect, useState } from "react";
import { Button, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";

/**
 * Pide un motivo antes de pausar, cancelar o perdonar un atraso. El motivo es obligatorio:
 * queda en el historial de la tarea junto con quién y cuándo.
 */
export default function TaskReasonModal({ isOpen, title, description, confirmLabel, confirmColor = "primary", busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (isOpen) setReason("");
  }, [isOpen]);

  const valid = reason.trim().length >= 3;

  return (
    <Modal isOpen={isOpen} toggle={busy ? undefined : onCancel} centered>
      <ModalHeader toggle={busy ? undefined : onCancel}>{title}</ModalHeader>
      <ModalBody>
        {description && <p className="mb-3">{description}</p>}
        <Label for="task-reason-input">Motivo (obligatorio)</Label>
        <Input
          id="task-reason-input"
          type="textarea"
          rows={3}
          maxLength={500}
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Escriba qué pasó"
        />
        <small className="text-muted">{reason.trim().length}/500 · queda en el historial con su usuario y fecha.</small>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={onCancel} disabled={busy}>Volver</Button>
        <Button color={confirmColor} onClick={() => onConfirm(reason.trim())} disabled={!valid || busy}>
          {busy ? <Spinner size="sm" /> : confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
