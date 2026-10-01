import { useEffect } from "react";

/**
 * Desplazamiento cómodo de las tablas anchas de Finanzas (P&L por kiosco, Ventas diarias, metas...).
 * Las tablas tienen decenas de columnas (un kiosco por columna): al estar sobre ellas la rueda debe mover la tabla y
 * no la página, y se puede arrastrar para desplazar. Se aplica por delegación a todo contenedor `.kfin-scroll` dentro
 * del elemento raíz, sin tocar el JSX de cada pestaña.
 */

export const SCROLL_AREA_SELECTOR = ".kfin-scroll";

/** Elementos sobre los que arrastrar NO debe desplazar la tabla (se pueden clicar/seleccionar). */
const INTERACTIVE = "a, button, input, select, textarea, label, [role='button'], .kfin-help, .kfin-info";

const OVERFLOW_TOLERANCE = 1;

/**
 * Qué hacer con un evento de rueda sobre un contenedor con scroll (función pura, probada aparte).
 * - Si la tabla también desborda en vertical, la rueda hace lo nativo: mueve la tabla y, al llegar al borde, la página.
 * - Si sólo desborda en horizontal (el caso normal en pantallas grandes), la rueda vertical se convierte en
 *   desplazamiento horizontal, salvo al final del recorrido (ahí deja avanzar la página).
 * - Shift + rueda, gestos horizontales del trackpad y Ctrl + rueda (zoom) siempre son nativos.
 * @returns {{scrollLeftBy:number}|null} null = no intervenir.
 */
export const wheelAction = (event, metrics) => {
  if (event.ctrlKey || event.shiftKey) return null;
  const canScrollX = metrics.scrollWidth - metrics.clientWidth > OVERFLOW_TOLERANCE;
  const canScrollY = metrics.scrollHeight - metrics.clientHeight > OVERFLOW_TOLERANCE;
  if (!canScrollX || canScrollY) return null;
  if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return null;
  const dy = event.deltaY;
  const atLeft = metrics.scrollLeft <= 0;
  const atRight = metrics.scrollLeft + metrics.clientWidth >= metrics.scrollWidth - OVERFLOW_TOLERANCE;
  if ((dy < 0 && atLeft) || (dy > 0 && atRight)) return null;
  return { scrollLeftBy: dy };
};

/** deltaMode: 0 píxeles, 1 líneas, 2 páginas -> píxeles. */
const toPixels = (event, el) => {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * el.clientHeight;
  return event.deltaY;
};

/** Activa rueda horizontal y arrastre en todos los `.kfin-scroll` bajo `rootRef`. */
export function useScrollAreas(rootRef) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const areaOf = (target) => {
      const el = target && target.closest ? target.closest(SCROLL_AREA_SELECTOR) : null;
      return el && root.contains(el) ? el : null;
    };

    const onWheel = (event) => {
      const el = areaOf(event.target);
      if (!el) return;
      const action = wheelAction(
        { deltaX: event.deltaX, deltaY: toPixels(event, el), shiftKey: event.shiftKey, ctrlKey: event.ctrlKey },
        {
          scrollLeft: el.scrollLeft,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          scrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
        }
      );
      if (!action) return;
      event.preventDefault();
      el.scrollLeft += action.scrollLeftBy;
    };

    let drag = null;
    const onMouseMove = (event) => {
      if (!drag) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return; // clic normal, no arrastre
      drag.moved = true;
      drag.el.classList.add("is-dragging");
      drag.el.scrollLeft = drag.left - dx;
      drag.el.scrollTop = drag.top - dy;
      event.preventDefault();
    };
    const endDrag = () => {
      if (!drag) return;
      drag.el.classList.remove("is-dragging");
      drag = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", endDrag);
    };
    const onMouseDown = (event) => {
      if (event.button !== 0) return;
      const el = areaOf(event.target);
      if (!el || (event.target.closest && event.target.closest(INTERACTIVE))) return;
      const canScroll = el.scrollWidth - el.clientWidth > OVERFLOW_TOLERANCE || el.scrollHeight - el.clientHeight > OVERFLOW_TOLERANCE;
      if (!canScroll) return;
      drag = { el, x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", endDrag);
    };

    // passive:false para poder cancelar el desplazamiento de la página al convertir la rueda en horizontal
    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("mousedown", onMouseDown);
    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("mousedown", onMouseDown);
      endDrag();
    };
  }, [rootRef]);
}
