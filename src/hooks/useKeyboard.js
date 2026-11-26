import React, { useEffect, useRef } from "react";
import "./useKeyboard.css";

/**
 * Atajos de teclado y navegación con Enter para pantallas que se usan mucho con el teclado.
 *
 * useHotkeys({ "/": fn, "e": fn, "ctrl+enter": fn, "arrowdown": fn }, { enabled })
 *  - Las teclas sueltas (letras, números, "/", "?", flechas) no se disparan mientras se escribe en un campo.
 *  - Las combinaciones con ctrl/alt y "escape" funcionan también dentro de los campos.
 *  - Si la función devuelve false, no se cancela el comportamiento normal de la tecla.
 */

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export const isTyping = (target) =>
  Boolean(target && (TYPING.has(target.tagName) || target.isContentEditable));

export const keyName = (event) => {
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  let key = (event.key || "").toLowerCase();
  if (key === " ") key = "space";
  // shift solo cuenta en teclas que no cambian de carácter (shift+enter, shift+tab)
  if (event.shiftKey && key.length > 1) parts.push("shift");
  parts.push(key);
  return parts.join("+");
};

export function useHotkeys(map, { enabled = true } = {}) {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (event) => {
      if (event.defaultPrevented || event.isComposing) return;
      const name = keyName(event);
      const handler = ref.current[name];
      if (!handler) return;
      const combo = name.includes("+") && (name.startsWith("ctrl") || name.startsWith("alt"));
      if (isTyping(event.target) && !combo && name !== "escape") return;
      // Con un modal abierto, los atajos de la pantalla de atrás no aplican.
      if (document.querySelector(".modal.show") && !event.target.closest?.(".modal")) return;
      if (handler(event) !== false) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), button[type="submit"]:not([disabled])';

/** Lleva el foco al campo siguiente (o anterior) dentro del contenedor. Devuelve false si no hay a dónde ir. */
export const focusSibling = (container, current, step = 1) => {
  if (!container) return false;
  const fields = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null && el.tabIndex !== -1
  );
  const index = fields.indexOf(current);
  const next = fields[index + step];
  if (!next) return false;
  next.focus();
  if (typeof next.select === "function" && next.tagName === "INPUT" && !["checkbox", "radio", "date"].includes(next.type)) {
    next.select();
  }
  return true;
};

/**
 * onKeyDown para un formulario: Enter pasa al campo siguiente (Shift+Enter al anterior) en vez de guardar;
 * Ctrl+Enter guarda. En un textarea, Enter hace salto de línea como siempre. Uso: <form onKeyDown={enterMovesNext}>
 */
export const enterMovesNext = (event) => {
  if (event.key !== "Enter" || event.isComposing) return;
  const form = event.currentTarget;
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();
    if (typeof form.requestSubmit === "function") form.requestSubmit();
    else form.querySelector('button[type="submit"]')?.click();
    return;
  }
  const target = event.target;
  if (target.tagName === "TEXTAREA" || target.tagName === "BUTTON" || target.tagName === "A") return;
  if (target.getAttribute("data-enter") === "default") return;
  event.preventDefault();
  focusSibling(form, target, event.shiftKey ? -1 : 1);
};

/** Pequeña etiqueta de tecla para mostrar los atajos en pantalla. */
export const Kbd = ({ children }) => <kbd className="kbd-hint">{children}</kbd>;
