import React, { useRef, useState } from "react";
import {
  Modal,
  ModalBody,
  ModalFooter,
  Button,
  Spinner,
} from "reactstrap";

/**
 * Diálogo de confirmación.
 *
 * Las opciones nuevas (`tone`, `icon`, `detail`, `warning`, `onConfirm` asíncrono) son
 * todas opcionales, así que las pantallas que ya lo usaban siguen funcionando sin tocarlas.
 * Lo único que cambia para ellas es el aspecto: el título pasó de la cabecera al cuerpo, y
 * con él desapareció la X de cerrar. Quedan «Cancelar», Esc y el clic fuera.
 *
 * Si `onConfirm` devuelve una promesa, el diálogo se queda abierto con los botones
 * bloqueados hasta que termine: cerrar antes deja al usuario sin saber si la acción salió,
 * y con el modal ya cerrado no hay dónde mostrarle el error.
 */

const TONOS = {
  danger: { color: "danger", icono: "nc-icon nc-simple-remove", fondo: "#fdecec", texto: "#e74c3c", franja: "#e74c3c" },
  warning: { color: "warning", icono: "nc-icon nc-alert-circle-i", fondo: "#fff4e5", texto: "#ff9500", franja: "#ff9500" },
  success: { color: "success", icono: "nc-icon nc-check-2", fondo: "#eaf7ef", texto: "#18ce0f", franja: "#18ce0f" },
  info: { color: "info", icono: "nc-icon nc-alert-circle-i", fondo: "#e8f6fb", texto: "#2ca8ff", franja: "#51bcda" },
};

function ConfirmModal({
  isOpen,
  toggle,
  onConfirm,
  title,
  message,
  detail,
  warning,
  tone,
  icon,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  confirmColor = "danger",
}) {
  const [trabajando, setTrabajando] = useState(false);

  /**
   * El contenido que se pintó la última vez que estuvo abierto.
   *
   * Quien llama suele sacar el texto de un estado que limpia al cerrar
   * (`setConfirmacion(null)`, `setTaxToDelete(null)`), y eso ocurre antes de que termine la
   * animación de cierre. Sin esta copia, durante esos milisegundos el diálogo se repinta con
   * los valores por defecto —«Confirmar acción», en rojo— y parece que se abre otro.
   */
  const ultimoContenido = useRef({});
  if (isOpen) {
    ultimoContenido.current = { title, message, detail, warning, tone, icon, confirmText, confirmColor };
  }
  const v = isOpen ? { title, message, detail, warning, tone, icon, confirmText, confirmColor } : ultimoContenido.current;

  // `tone` manda si viene; si no, se deduce de confirmColor para que las pantallas
  // antiguas hereden un icono coherente sin cambiar una línea.
  const t = TONOS[v.tone || v.confirmColor] || TONOS.danger;
  const colorBoton = v.tone ? t.color : v.confirmColor;

  const handleConfirm = async () => {
    if (trabajando) return;
    try {
      const posiblePromesa = onConfirm && onConfirm();
      if (posiblePromesa && typeof posiblePromesa.then === "function") {
        setTrabajando(true);
        await posiblePromesa;
      }
      toggle();
    } catch (e) {
      // El que llama ya avisa del error por su cuenta, así que aquí solo se cierra.
      toggle();
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      toggle={trabajando ? undefined : toggle}
      centered
      modalClassName="confirm-modal"
      // Sin esto, Esc y el clic fuera cerrarían el diálogo mientras la petición viaja,
      // y el usuario se quedaría sin saber en qué quedó.
      backdrop={trabajando ? "static" : true}
      keyboard={!trabajando}
    >
      <div className="confirm-modal__stripe" style={{ background: t.franja }} />
      <ModalBody className="pt-4 pb-3 px-4">
        <div className="d-flex" style={{ gap: 14 }}>
          <div className="confirm-modal__icon" style={{ background: t.fondo, color: t.texto }}>
            <i className={v.icon || t.icono} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h6 className="confirm-modal__title">{v.title || "Confirmar acción"}</h6>
            <div className="confirm-modal__detail text-muted">
              {v.message || "¿Está seguro de realizar esta acción?"}
            </div>
            {v.detail && <div className="confirm-modal__detail">{v.detail}</div>}
            {v.warning && (
              <div className="confirm-modal__warning text-dark">
                <i className="nc-icon nc-bell-55 mr-1" />
                {v.warning}
              </div>
            )}
          </div>
        </div>
      </ModalBody>
      {/* Los dos botones van juntos en una sola línea, alineados a la derecha. El pie de
          reactstrap deja que envuelvan cuando no caben, y entonces uno queda centrado y el
          otro suelto en la esquina, como dos elementos sin relación. Con `flex-nowrap` y
          etiquetas cortas se quedan siempre a la par. */}
      <ModalFooter
        className="pt-0 px-4 pb-4 flex-nowrap justify-content-end"
        style={{ border: "none", gap: 8 }}
      >
        {/* `flex: 0 0 auto` en los dos: el tema estira los hijos del pie, y el botón de
            cancelar acababa midiendo el triple que el de confirmar, con un hueco entre
            ambos que los hacía parecer dos controles sin relación. */}
        <Button
          color="link"
          className="text-muted px-3"
          style={{ whiteSpace: "nowrap", flex: "0 0 auto", width: "auto" }}
          onClick={toggle}
          disabled={trabajando}
        >
          {cancelText}
        </Button>
        <Button
          color={colorBoton}
          style={{ whiteSpace: "nowrap", flex: "0 0 auto", width: "auto" }}
          onClick={handleConfirm}
          disabled={trabajando}
        >
          {trabajando && <Spinner size="sm" className="mr-2" />}
          {trabajando ? "Un momento…" : v.confirmText}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ConfirmModal;
