/**
 * OnlineHeatmap compartido por Online (rampa ámbar, por defecto) y Kioskos (variant="kiosk", rampa verde azulada):
 * el modificador de paleta, el pie y la leyenda reutilizable.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import OnlineHeatmap, { HeatLegend } from "views/sales/dashboard/OnlineHeatmap";

const SEPT = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, "0")}`,
  amount: 1000 + (i % 7) * 100,
  count: 2,
}));

const mounted = [];
const mount = async (element) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  mounted.push({ root, container });
  return container;
};

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(async () => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    // eslint-disable-next-line no-await-in-loop
    await act(async () => root.unmount());
    container.remove();
  }
});

describe("OnlineHeatmap", () => {
  test("por defecto es el de Online: contenedor sin modificador, 'venta online' y el pie de siempre", async () => {
    const container = await mount(<OnlineHeatmap dailySeries={SEPT} periodLabel="Septiembre 2026" />);
    const heat = container.querySelector(".sdash-heat");
    expect(heat).not.toBeNull();
    expect(heat.className).toBe("sdash-heat");
    expect(container.querySelector(".sdash-heat--kiosk")).toBeNull();
    expect(heat.textContent).toContain("Septiembre 2026 · venta online por día (Q) · sombreado contra la mediana del mes");
    expect(heat.querySelector(".kfin-card-foot").textContent).toContain(
      "Es el mismo criterio del módulo de Finanzas kioscos, aplicado a las ventas online."
    );
    // los tres bloques de siempre siguen siendo hijos directos del contenedor
    expect([...heat.children].map((el) => el.tagName + "." + el.className.split(" ")[0])).toEqual(["DIV.sdash-row", "SECTION.kfin-card"]);
    expect(heat.querySelector(".sdash-row").children).toHaveLength(2);
  });

  test("las barras del promedio y la insignia usan clases (no colores en línea): el color lo decide la paleta", async () => {
    const container = await mount(<OnlineHeatmap dailySeries={SEPT} periodLabel="Septiembre 2026" />);
    const bars = [...container.querySelectorAll(".sdash-pr-bar")];
    expect(bars).toHaveLength(7);
    bars.forEach((bar) => {
      expect(bar.className).toMatch(/sdash-wbar--(strong|soft)/);
      expect(bar.getAttribute("style")).toMatch(/^width: [\d.]+%;?$/);
      expect(bar.style.background).toBe("");
    });
    expect(container.querySelectorAll(".sdash-wbar--strong")).toHaveLength(2);
    expect(container.querySelector(".sdash-badge--heat")).not.toBeNull();
    expect(container.querySelector(".sdash-badge--amber")).toBeNull();
  });

  test("variant='kiosk' agrega el modificador de paleta y el pie de Kioskos", async () => {
    const container = await mount(
      <OnlineHeatmap dailySeries={SEPT} periodLabel="Septiembre 2026" noun="venta de kioscos" variant="kiosk" />
    );
    const heat = container.querySelector(".sdash-heat");
    expect(heat.className).toBe("sdash-heat sdash-heat--kiosk");
    expect(heat.textContent).toContain("venta de kioscos por día (Q)");
    expect(heat.querySelector(".kfin-card-foot").textContent).toContain(
      "Es el mismo criterio de la matriz de ventas diarias del módulo de Finanzas kioscos."
    );
    expect(heat.querySelector(".kfin-card-foot").textContent).not.toContain("online");
  });

  test("footNote reemplaza la última frase del pie", async () => {
    const container = await mount(
      <OnlineHeatmap dailySeries={SEPT} periodLabel="Septiembre 2026" noun="venta de kioscos" variant="kiosk" footNote="Pie propio." />
    );
    const foot = container.querySelector(".kfin-card-foot").textContent;
    expect(foot).toContain("Umbrales del sombreado (× mediana de los días con venta del mes): 0.5, 0.85, 1.15, 1.5, 2. Pie propio.");
    expect(foot).not.toContain("Finanzas kioscos");
  });

  test("sin serie diaria no dibuja nada", async () => {
    const container = await mount(<OnlineHeatmap dailySeries={[]} periodLabel="x" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("HeatLegend", () => {
  test("por defecto es la leyenda de Online: seis tonos, sin venta y mejor día", async () => {
    const container = await mount(<HeatLegend />);
    const legend = container.firstElementChild;
    expect(legend.getAttribute("role")).toBe("group");
    expect(legend.getAttribute("aria-label")).toBe("Escala de sombreado respecto a la mediana del mes");
    expect(legend.querySelector(".kfin-heat-legend-title").textContent).toBe("Sombreado vs. mediana:");
    expect([...legend.querySelectorAll(".kfin-heat-swatch")].map((s) => s.className.split(" ").pop())).toEqual([
      "sdash-h0", "sdash-h1", "sdash-h2", "sdash-h3", "sdash-h4", "sdash-h5", "sdash-hzero",
    ]);
    expect(legend.textContent).toContain("0.00 sin venta");
    expect(legend.textContent).toContain("★ mejor día");
  });

  test("se puede cambiar el título y las claves; con bestLabel vacío no hay estrella", async () => {
    const container = await mount(
      <HeatLegend title="Sombreado vs. promedio:" ariaLabel="Escala propia" zeroLabel="sin dato" bestLabel="" />
    );
    const legend = container.firstElementChild;
    expect(legend.getAttribute("aria-label")).toBe("Escala propia");
    expect(legend.querySelector(".kfin-heat-legend-title").textContent).toBe("Sombreado vs. promedio:");
    expect(legend.textContent).toContain("sin dato");
    expect(legend.textContent).not.toContain("★");
    expect(legend.querySelectorAll(".kfin-heat-key")).toHaveLength(7); // 6 tonos + sin venta
  });
});
