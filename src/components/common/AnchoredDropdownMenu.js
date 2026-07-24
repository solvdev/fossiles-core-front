import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const MENU_Z_INDEX = 2000;

/**
 * Dropdown anclado al input; se renderiza en document.body para no quedar recortado
 * por overflow:hidden/auto de tablas o cards.
 */
export function AnchoredDropdownMenu({
  anchorRef,
  open,
  children,
  minWidth = 220,
  maxHeight = 280,
}) {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!open || !anchorRef?.current) {
      setPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUpward = spaceBelow < 180 && spaceAbove > spaceBelow;
      const availableHeight = openUpward ? spaceAbove : spaceBelow;
      const height = Math.max(120, Math.min(maxHeight, availableHeight));

      setPosition({
        top: openUpward ? rect.top - height - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, minWidth),
        maxHeight: height,
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, anchorRef, minWidth, maxHeight]);

  if (!open || !position) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: position.width,
        maxHeight: position.maxHeight,
        zIndex: MENU_Z_INDEX,
        background: "#fff",
        border: "1px solid #ddd",
        borderRadius: 4,
        overflowY: "auto",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
      }}
    >
      {children}
    </div>,
    document.body
  );
}
