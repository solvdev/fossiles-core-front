import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Protege cambios sin guardar: beforeunload (recarga/cierre) y clics en enlaces internos
 * (BrowserRouter no admite useBlocker). Devuelve la ruta pendiente para mostrar una confirmación.
 */
function useUnsavedGuard(dirty) {
  const navigate = useNavigate();
  const [pendingHref, setPendingHref] = useState(null);

  useEffect(() => {
    if (!dirty) return undefined;

    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
      return "";
    };

    const onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const href = anchor.getAttribute("href") || "";
      if (!href.startsWith("/") || href.startsWith("//")) return; // hash, externos y rutas relativas raras
      if (href === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendingHref(href);
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const confirmLeave = useCallback(() => {
    const href = pendingHref;
    setPendingHref(null);
    if (href) navigate(href);
  }, [pendingHref, navigate]);

  const cancelLeave = useCallback(() => setPendingHref(null), []);

  return { pendingHref, confirmLeave, cancelLeave };
}

export default useUnsavedGuard;
