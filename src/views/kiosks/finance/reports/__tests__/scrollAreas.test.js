import { useScrollAreas, wheelAction } from "../scrollAreas";

// useEffect real sólo corre dentro de un componente: aquí se ejecuta el efecto directamente.
jest.mock("react", () => ({ ...jest.requireActual("react"), useEffect: (fn) => fn() }));

const wide = { scrollLeft: 100, scrollWidth: 3000, clientWidth: 1000, scrollHeight: 600, clientHeight: 600 };
const wideAndTall = { ...wide, scrollHeight: 2000, clientHeight: 700 };

describe("wheelAction", () => {
  test("tabla sólo ancha: la rueda vertical se convierte en desplazamiento horizontal", () => {
    expect(wheelAction({ deltaX: 0, deltaY: 120 }, wide)).toEqual({ scrollLeftBy: 120 });
    expect(wheelAction({ deltaX: 0, deltaY: -80 }, wide)).toEqual({ scrollLeftBy: -80 });
  });

  test("tabla ancha y alta: la rueda es nativa (mueve la tabla en vertical y al final la página)", () => {
    expect(wheelAction({ deltaX: 0, deltaY: 120 }, wideAndTall)).toBeNull();
  });

  test("al final del recorrido horizontal deja avanzar la página", () => {
    expect(wheelAction({ deltaX: 0, deltaY: 120 }, { ...wide, scrollLeft: 2000 })).toBeNull(); // ya está a la derecha
    expect(wheelAction({ deltaX: 0, deltaY: -120 }, { ...wide, scrollLeft: 0 })).toBeNull(); // ya está a la izquierda
    expect(wheelAction({ deltaX: 0, deltaY: -120 }, { ...wide, scrollLeft: 2000 })).toEqual({ scrollLeftBy: -120 });
  });

  test("Shift, Ctrl (zoom) y gestos horizontales del trackpad son nativos", () => {
    expect(wheelAction({ deltaX: 0, deltaY: 120, shiftKey: true }, wide)).toBeNull();
    expect(wheelAction({ deltaX: 0, deltaY: 120, ctrlKey: true }, wide)).toBeNull();
    expect(wheelAction({ deltaX: 90, deltaY: 10 }, wide)).toBeNull();
  });

  test("sin desbordamiento horizontal no interviene", () => {
    expect(wheelAction({ deltaX: 0, deltaY: 120 }, { ...wide, scrollWidth: 1000 })).toBeNull();
  });
});

describe("useScrollAreas (delegación sobre .kfin-scroll)", () => {
  const setup = (metrics) => {
    const root = document.createElement("div");
    root.innerHTML = '<div class="kfin-scroll"><table><tbody><tr><td id="cell">x</td></tr></tbody></table></div>' +
      '<div id="outside">fuera</div>';
    document.body.appendChild(root);
    const area = root.querySelector(".kfin-scroll");
    Object.entries(metrics).forEach(([k, v]) => {
      if (k === "scrollLeft" || k === "scrollTop") {
        area[k] = v;
      } else {
        Object.defineProperty(area, k, { value: v, configurable: true });
      }
    });
    useScrollAreas({ current: root });
    return { root, area };
  };

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("la rueda sobre la tabla la mueve hacia los lados y no desplaza la página", () => {
    const { area } = setup(wide);
    const event = new WheelEvent("wheel", { deltaY: 150, bubbles: true, cancelable: true });
    area.querySelector("#cell").dispatchEvent(event);

    expect(area.scrollLeft).toBe(250);
    expect(event.defaultPrevented).toBe(true);
  });

  test("la rueda fuera de la tabla no se toca", () => {
    const { root } = setup(wide);
    const event = new WheelEvent("wheel", { deltaY: 150, bubbles: true, cancelable: true });
    root.querySelector("#outside").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  test("arrastrar con el mouse desplaza la tabla; un clic simple no", () => {
    const { area } = setup({ ...wide, scrollTop: 0 });
    const cell = area.querySelector("#cell");

    cell.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 500, clientY: 300, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 450, clientY: 300, bubbles: true, cancelable: true }));
    expect(area.scrollLeft).toBe(150); // 100 + 50 hacia la izquierda del cursor
    expect(area.classList.contains("is-dragging")).toBe(true);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(area.classList.contains("is-dragging")).toBe(false);

    cell.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 500, clientY: 300, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 502, clientY: 301, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(area.scrollLeft).toBe(150); // movimiento menor a 4 px = clic
  });
});
