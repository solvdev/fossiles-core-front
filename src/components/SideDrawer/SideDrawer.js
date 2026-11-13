import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Panel lateral para ver o editar un registro sin salir de la lista.
 * Se cierra con Esc, con la X o al hacer clic fuera. `footer` lleva los botones de acción.
 */
function SideDrawer({ isOpen, onClose, title, subtitle, avatar, footer, children }) {
  const panel = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.activeElement;
    if (panel.current) panel.current.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && typeof previous.focus === "function") previous.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return createPortal(
    <div className="pl">
      <div className="pl-scrim" onClick={onClose} />
      <aside className="pl-drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <div className="pl-drawer__head">
          <div className="pl-who" style={{ minWidth: 0 }}>
            {avatar && <span className="pl-av">{avatar}</span>}
            <div>
              <h3>{title}</h3>
              {subtitle && <small className="pl-sub">{subtitle}</small>}
            </div>
          </div>
          <button type="button" className="btn btn-link btn-sm p-1 m-0" aria-label="Cerrar" onClick={onClose}>
            <i className="nc-icon nc-simple-remove" />
          </button>
        </div>
        <div className="pl-drawer__body">{children}</div>
        {footer && <div className="pl-drawer__foot">{footer}</div>}
      </aside>
    </div>,
    document.body
  );
}

export default SideDrawer;
