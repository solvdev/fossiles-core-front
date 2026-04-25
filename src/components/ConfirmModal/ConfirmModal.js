import React from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
} from "reactstrap";

function ConfirmModal({ isOpen, toggle, onConfirm, title, message, confirmText = "Confirmar", cancelText = "Cancelar", confirmColor = "danger" }) {
  const handleConfirm = () => {
    onConfirm();
    toggle();
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} centered>
      <ModalHeader toggle={toggle}>{title || "Confirmar acción"}</ModalHeader>
      <ModalBody>
        {message || "¿Está seguro de realizar esta acción?"}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle}>
          {cancelText}
        </Button>
        <Button color={confirmColor} onClick={handleConfirm}>
          {confirmText}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ConfirmModal;

