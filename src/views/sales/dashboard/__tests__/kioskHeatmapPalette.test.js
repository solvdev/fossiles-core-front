/**
 * Paleta del mapa de calor leída del CSS real (jsdom no carga estilos): Online conserva la rampa ámbar y Kioskos usa su
 * propia rampa verde azulada solo dentro del modificador `.sdash-heat--kiosk`, con contraste AA en cada tono.
 */
import fs from "fs";
import path from "path";
import { SOURCE_META } from "../salesDashboardHelpers";

const css = fs.readFileSync(path.join(__dirname, "..", "SalesDashboard.css"), "utf8").replace(/\r\n/g, "\n");

/** Cuerpos de todas las reglas cuyo selector es exactamente `selector` (sin comillas ni anidar). */
const blocksOf = (selector) => {
  const bodies = [];
  let from = 0;
  for (;;) {
    const start = css.indexOf(`\n${selector} {`, from);
    if (start < 0) break;
    const end = css.indexOf("}", start);
    bodies.push(css.slice(start + selector.length + 3, end));
    from = end;
  }
  return bodies;
};

/** { '--sdash-h0-bg': '#f4f1ea', ... } de uno o varios cuerpos de regla. */
const varsOf = (bodies) =>
  Object.fromEntries(bodies.flatMap((body) => [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])));

const defaults = varsOf(blocksOf(".kfin.sdash"));
const kiosk = varsOf(blocksOf(".sdash .sdash-heat--kiosk"));

const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
const linear = (c) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => 0.2126 * linear(channel(hex, 0)) + 0.7152 * linear(channel(hex, 1)) + 0.0722 * linear(channel(hex, 2));
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const steps = [0, 1, 2, 3, 4, 5];
const bg = (vars, i) => vars[`--sdash-h${i}-bg`];
const fg = (vars, i) => vars[`--sdash-h${i}-fg`];

describe("rampa de Online (ámbar, valor por defecto)", () => {
  test("los seis tonos y sus textos están definidos en .kfin.sdash", () => {
    expect(steps.map((i) => bg(defaults, i))).toEqual(["#f4f1ea", "#fbe7bd", "#f7cd7e", "#ee9f35", "#b45f08", "#7a3d02"]);
    expect(steps.map((i) => fg(defaults, i))).toEqual(["#252422", "#252422", "#252422", "#252422", "#ffffff", "#ffffff"]);
    expect(defaults["--sdash-wbar-strong"]).toBe("#c77d0a");
    expect(defaults["--sdash-wbar-soft"]).toBe("#f0a63a");
    expect(defaults["--sdash-heatbadge-bg"]).toBe("#fff1cf");
    expect(defaults["--sdash-insight-bg"]).toBe("#fff7e0");
  });

  test("cada tono es más oscuro que el anterior y el texto cumple AA", () => {
    steps.slice(1).forEach((i) => expect(luminance(bg(defaults, i))).toBeLessThan(luminance(bg(defaults, i - 1))));
    steps.forEach((i) => expect(contrast(bg(defaults, i), fg(defaults, i))).toBeGreaterThanOrEqual(4.5));
  });
});

describe("rampa de Kioskos (verde azulado, solo con .sdash-heat--kiosk)", () => {
  test("redefine los seis tonos, las barras, la insignia y el aviso", () => {
    steps.forEach((i) => {
      expect(bg(kiosk, i)).toMatch(/^#[0-9a-f]{6}$/);
      expect(bg(kiosk, i)).not.toBe(bg(defaults, i));
    });
    ["--sdash-wbar-strong", "--sdash-wbar-soft", "--sdash-heatbadge-bg", "--sdash-heatbadge-fg", "--sdash-insight-bg", "--sdash-insight-line", "--sdash-insight-fg"].forEach(
      (name) => {
        expect(kiosk[name]).toBeTruthy();
        expect(kiosk[name]).not.toBe(defaults[name]);
      }
    );
  });

  test("es de la familia del color de Kioskos (#51cbce) y no ámbar", () => {
    expect(bg(kiosk, 3)).toBe(SOURCE_META.KIOSKO.color);
    steps.forEach((i) => {
      const hex = bg(kiosk, i);
      // verde azulado: verde y azul por encima del rojo
      expect(channel(hex, 1)).toBeGreaterThan(channel(hex, 0));
      expect(channel(hex, 2)).toBeGreaterThan(channel(hex, 0));
    });
  });

  test("va de claro a oscuro, con texto oscuro en los cuatro primeros, blanco en los dos últimos y contraste AA en todos", () => {
    steps.slice(1).forEach((i) => expect(luminance(bg(kiosk, i))).toBeLessThan(luminance(bg(kiosk, i - 1))));
    expect(steps.map((i) => fg(kiosk, i))).toEqual(["#252422", "#252422", "#252422", "#252422", "#ffffff", "#ffffff"]);
    steps.forEach((i) => expect(contrast(bg(kiosk, i), fg(kiosk, i))).toBeGreaterThanOrEqual(4.5));
    // la insignia y el aviso también cumplen AA
    expect(contrast(kiosk["--sdash-heatbadge-bg"], kiosk["--sdash-heatbadge-fg"])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(kiosk["--sdash-insight-bg"], kiosk["--sdash-insight-fg"])).toBeGreaterThanOrEqual(4.5);
  });

  test("los tonos propios de Kioskos solo se definen dentro del modificador (el resto del CSS no los toca)", () => {
    [0, 1, 2, 4, 5].forEach((i) => {
      const hex = bg(kiosk, i);
      expect(css.split(hex).length - 1).toBe(1);
    });
  });
});

describe("las clases de sombreado leen las variables (por eso el modificador alcanza)", () => {
  const ruleFor = (selector) => {
    const start = css.indexOf(selector);
    expect(start).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf("}", start));
  };

  test("celdas del calendario y de las matrices: .sdash-hN usa --sdash-hN-bg y --sdash-hN-fg", () => {
    steps.forEach((i) => {
      expect(ruleFor(`.sdash .sdash-h${i} {`)).toContain(`background: var(--sdash-h${i}-bg)`);
      expect(ruleFor(`.sdash .sdash-h${i} {`)).toContain(`color: var(--sdash-h${i}-fg)`);
    });
  });

  test("en tablas (tbody y también tfoot, para la fila de totales) el sombreado conserva su especificidad", () => {
    steps.forEach((i) => {
      const rule = ruleFor(`.sdash .kfin-table tbody tr td.sdash-h${i}, .sdash .kfin-table tfoot tr td.sdash-h${i} {`);
      expect(rule).toContain(`var(--sdash-h${i}-bg)`);
      expect(rule).toContain(`var(--sdash-h${i}-fg)`);
    });
  });

  test("las barras del promedio por día, la insignia y el aviso del calendario también leen variables", () => {
    expect(ruleFor(".sdash .sdash-wbar--strong {")).toContain("var(--sdash-wbar-strong)");
    expect(ruleFor(".sdash .sdash-wbar--soft {")).toContain("var(--sdash-wbar-soft)");
    expect(ruleFor(".sdash .sdash-badge--heat {")).toContain("var(--sdash-heatbadge-bg)");
    expect(ruleFor(".sdash .sdash-insight {")).toContain("var(--sdash-insight-bg)");
  });
});
