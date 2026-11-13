/**
 * Lleva la vista hasta el elemento con un desplazamiento corto.
 *
 * El panel principal (.main-panel) usa perfect-scrollbar con overflow oculto, y ahí el
 * scrollIntoView({ behavior: "smooth" }) del navegador no se mueve; por eso se anima a mano.
 * Fuera de ese panel se usa el desplazamiento normal.
 */
export function scrollToElement(element, { duration = 280 } = {}) {
  if (!element) return;
  const container = typeof element.closest === "function" ? element.closest(".main-panel") : null;
  if (!container || container.scrollHeight <= container.clientHeight) {
    if (typeof element.scrollIntoView === "function") element.scrollIntoView({ block: "start" });
    return;
  }
  const start = container.scrollTop;
  const target = Math.max(0, start + element.getBoundingClientRect().top - container.getBoundingClientRect().top);
  if (typeof window.requestAnimationFrame !== "function" || duration <= 0) {
    container.scrollTop = target;
    return;
  }
  const begin = window.performance.now();
  const step = (now) => {
    const progress = Math.min(1, (now - begin) / duration);
    const eased = 1 - (1 - progress) ** 3;
    container.scrollTop = start + (target - start) * eased;
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

export default scrollToElement;
