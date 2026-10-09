/**
 * Prueba de render de 'Mapa de calor de kioscos' con respuestas simuladas según el Addendum 3 de
 * docs/SALES-DASHBOARD-CONTRACT.md (servicio simulado: no hay backend en jsdom).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import * as svc from "services/salesDashboardService";
import KioskHeatmapSection from "views/sales/dashboard/KioskHeatmapSection";
import {
  rangeOf,
  septemberDailySeries,
  septemberResponse,
  septemberWithoutC,
  siteByWeekday,
} from "views/sales/dashboard/__fixtures__/kioskHeatmapFixtures";

jest.mock("services/salesDashboardService", () => ({
  getKioskHeatmap: jest.fn(),
}));

const flush = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const BASE_PROPS = {
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  refreshToken: 0,
  calendarPeriod: "Septiembre 2026",
  calendarScope: "todos los kioscos",
};

const mounted = [];
const renderSection = async (props = {}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const all = { ...BASE_PROPS, dailySeries: septemberDailySeries(), ...props };
  await act(async () => {
    root.render(<KioskHeatmapSection {...all} />);
  });
  await flush();
  mounted.push({ root, container });
  return {
    container,
    rerender: async (next) => {
      await act(async () => {
        root.render(<KioskHeatmapSection {...all} {...next} />);
      });
      await flush();
    },
  };
};

const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
};
const button = (root, label) => [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const card = (container, label) => container.querySelector(`section[aria-label="${label}"]`);
const cells = (row) => [...row.children].map((c) => c.textContent.trim());
const bodyRows = (container, label) => [...card(container, label).querySelectorAll("tbody tr")];
const rowNames = (container, label) => bodyRows(container, label).map((r) => r.querySelector("th").textContent.trim());
const text = (el) => el.textContent.trim();

const WEEKDAY_CARD = "Kioscos por día de la semana";
const DAY_CARD = "Kioscos por día";
const SUMMARY_CARD = "Por clasificación";
const INSIGHTS_CARD = "Insights del mapa de calor";

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  // CRA resetea las implementaciones de los mocks antes de cada prueba (resetMocks: true)
  svc.getKioskHeatmap.mockResolvedValue(septemberResponse());
});
afterEach(async () => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    // eslint-disable-next-line no-await-in-loop
    await act(async () => root.unmount());
    container.remove();
  }
});

describe("carga y encabezado", () => {
  test("consulta su propio endpoint con el rango (sin kiosko ni caché saltada) y aclara qué sigue al selector", async () => {
    const { container } = await renderSection();
    expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(1);
    const args = svc.getKioskHeatmap.mock.calls[0][0];
    expect(args).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30", refresh: false });
    expect(args.siteId).toBeUndefined();

    expect(text(container.querySelector("#sdash-kheat-title"))).toBe("Mapa de calor de kioscos");
    expect(container.querySelector("section").getAttribute("aria-labelledby")).toBe("sdash-kheat-title");
    expect(container.querySelector(".sdash-kheat-sub").textContent).toContain("Septiembre 2026");
    const note = container.querySelector(".sdash-kheat > .sdash-def");
    expect(note.getAttribute("role")).toBe("note");
    expect(note.textContent).toContain("siguen el selector de Kiosko (ahora: todos los kioscos)");
    expect(note.textContent).toContain("comparan siempre todos los kioscos");
  });

  test("con un kiosko elegido la aclaración dice cuál", async () => {
    const { container } = await renderSection({ calendarScope: "Kiosko Centro" });
    expect(container.querySelector(".sdash-kheat > .sdash-def").textContent).toContain("(ahora: Kiosko Centro)");
  });

  test("muestra el esqueleto mientras carga la primera vez y deja el título", async () => {
    svc.getKioskHeatmap.mockReturnValue(new Promise(() => {}));
    const { container } = await renderSection();
    const skeleton = container.querySelector('[role="status"][aria-label="Cargando mapa de calor de kioscos"]');
    expect(skeleton).not.toBeNull();
    expect(container.textContent).toContain("Mapa de calor de kioscos");
    expect(card(container, WEEKDAY_CARD)).toBeNull();
    expect(card(container, INSIGHTS_CARD)).toBeNull();
  });
});

describe("insights", () => {
  test("una frase por línea, en orden, con el tono escrito (A favor / Atención) y no solo en color", async () => {
    const { container } = await renderSection();
    const items = [...card(container, INSIGHTS_CARD).querySelectorAll("li")];
    expect(items.map((li) => text(li.querySelector(".sdash-ins-text")))).toEqual([
      "Los días con más venta fueron el 4 (vie) Q 860, 11 (vie) Q 860 y 18 (vie) Q 860.",
      "Viernes y sábado concentran el 60% de la venta de kioscos en el 27% de los días. Los domingos son el día más flojo.",
      "Kiosco líder: Centro (Cat. A) con Q 5,000 (51.7% del total).",
      "Los kioscos Cat. A (2 de 5) venden el 77.5% del total.",
      "Mayor crecimiento: Centro +25.0% vs periodo anterior (de Q 4,000 a Q 5,000).",
      "Mayor caída: Cerrado -100.0% vs periodo anterior (de Q 5,000 a Q 0).",
      "Patrón común: en 3 de 4 kioscos el mejor día de la semana es el viernes.",
      "1 kiosco sin venta en el periodo: Cerrado.",
    ]);
    expect(items.map((li) => li.className)).toEqual([
      "sdash-ins sdash-ins--neutral",
      "sdash-ins sdash-ins--neutral",
      "sdash-ins sdash-ins--good",
      "sdash-ins sdash-ins--neutral",
      "sdash-ins sdash-ins--good",
      "sdash-ins sdash-ins--warn",
      "sdash-ins sdash-ins--neutral",
      "sdash-ins sdash-ins--warn",
    ]);
    expect(items.map((li) => (li.querySelector(".sdash-ins-tag") || { textContent: "" }).textContent)).toEqual([
      "", "", "A favor", "", "A favor", "Atención", "", "Atención",
    ]);
    expect(card(container, INSIGHTS_CARD).textContent).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("con un rango corto y pocos datos solo salen las frases que tienen base; sin ninguna avisa", async () => {
    const days = rangeOf("2026-09-01", 2);
    svc.getKioskHeatmap.mockResolvedValue({
      ...septemberResponse(),
      endDate: "2026-09-02",
      days,
      sites: [siteByWeekday(days, [0, 100, 0, 0, 0, 0, 0], { siteId: 1, name: "Único", category: "B" })],
      categories: [],
    });
    const { container } = await renderSection({ endDate: "2026-09-02", dailySeries: [] });
    const lines = [...card(container, INSIGHTS_CARD).querySelectorAll(".sdash-ins-text")].map(text);
    expect(lines).toEqual([]);
    expect(card(container, INSIGHTS_CARD).textContent).toContain("Todavía no hay datos suficientes");
    // el resto de la sección sí se dibuja
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Único"]);
  });
});

describe("Por clasificación", () => {
  test("una fila por clasificación (A, B, C y sin clasificar) más el total, con variación en flecha y texto", async () => {
    const { container } = await renderSection();
    const table = card(container, SUMMARY_CARD).querySelector("table");
    expect([...table.querySelectorAll("thead th")].map(text)).toEqual([
      "Clasificación",
      "Kioscos",
      "Venta",
      "% del total",
      "Promedio por kiosco",
      "vs periodo anterior",
      "Día fuerte",
    ]);
    const rows = [...table.querySelectorAll("tbody tr")].map(cells);
    expect(rows).toEqual([
      ["Cat. A", "2", "Q 7,500.00", "77.5%", "Q 3,750.00", "▲aumento, favorable: +7.1%", "Viernes · Q 750 por día"],
      ["Cat. B", "1", "Q 1,260.00", "13.0%", "Q 1,260.00", "▲aumento, favorable: +5.0%", "Viernes · Q 90 por día"],
      ["Cat. C", "1", "Q 0.00", "0.0%", "Q 0.00", "▼disminución, desfavorable: -100.0%", "—"],
      // sin periodo anterior no hay variación que mostrar (el backend manda 100 %)
      ["Sin clasificar", "1", "Q 920.00", "9.5%", "Q 920.00", "– Sin comparar", "Sábado · Q 80 por día"],
    ]);
    expect(cells(table.querySelector("tfoot tr"))).toEqual([
      "Todos los kioscos",
      "5",
      "Q 9,680.00",
      "100.0%",
      "Q 1,936.00",
      "▼disminución, desfavorable: -26.7%",
      "Viernes · Q 860 por día",
    ]);
    // la variación lleva flecha y color (bueno / malo) pero también texto
    expect(table.querySelectorAll(".kfin-delta--good")).toHaveLength(2);
    expect(table.querySelectorAll(".kfin-delta--bad")).toHaveLength(2);
    expect(table.querySelectorAll(".kfin-delta--neutral")).toHaveLength(1);
  });

  test("solo muestra las clasificaciones que existen", async () => {
    svc.getKioskHeatmap.mockResolvedValue(septemberWithoutC());
    const { container } = await renderSection();
    expect([...card(container, SUMMARY_CARD).querySelectorAll("tbody th")].map(text)).toEqual([
      "Cat. A",
      "Cat. B",
      "Sin clasificar",
    ]);
  });
});

describe("matriz 'Kioscos por día de la semana'", () => {
  test("columnas Kiosko · Cat. · Total y Lun…Dom con cuántas veces cae cada día en el rango", async () => {
    const { container } = await renderSection();
    const headers = [...card(container, WEEKDAY_CARD).querySelectorAll("thead th")];
    expect(headers.map(text)).toEqual([
      "Kiosko",
      "Cat.",
      "Total",
      "Lun4 días",
      "Mar5 días",
      "Mié5 días",
      "Jue4 días",
      "Vie4 días",
      "Sáb4 días",
      "Dom4 días",
    ]);
    expect(headers.every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(headers[0].className).toContain("sdash-mx-c1");
    expect(headers[1].className).toContain("sdash-mx-c2");
    expect(headers[2].className).toContain("sdash-mx-c3");
    // la abreviatura 'Cat.' se explica al pasar el cursor y los días de la semana traen su nombre completo
    expect(headers[1].getAttribute("title")).toBe("Clasificación de ventas del kiosco (A, B o C)");
    expect(headers[2].getAttribute("title")).toBe("Venta del periodo");
    expect(headers[7].getAttribute("title")).toBe("Viernes: 4 días en el rango");
  });

  test("filas por kiosco en el orden A, B, C y sin clasificar, con promedio por día de la semana y ★ en el mejor", async () => {
    const { container } = await renderSection();
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Centro", "Norte", "Sur", "Cerrado", "Plaza"]);
    const rows = bodyRows(container, WEEKDAY_CARD);
    // venta promedio por ocurrencia de cada día (los días sin venta cuentan como 0)
    expect(cells(rows[0])).toEqual([
      "Centro", "Cat. A", "5,000.00", "100.00", "100.00", "100.00", "100.00", "500.00 ★ mejor día", "300.00", "0.00",
    ]);
    expect(cells(rows[4])).toEqual([
      "Plaza", "Sin clasificar", "920.00", "20.00", "20.00", "20.00", "20.00", "20.00", "80.00 ★ mejor día", "40.00",
    ]);
    // un kiosco sin venta no tiene mejor día ni sombreado
    expect(cells(rows[3]).slice(2)).toEqual(["0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00", "0.00"]);
    expect(rows[3].querySelectorAll(".sdash-mx-best")).toHaveLength(0);
    expect(rows[3].querySelectorAll("td.sdash-hzero")).toHaveLength(7);

    // sombreado contra el promedio de la fila: viernes 2.9× (≥ 2×), sábado 1.75×, lunes 0.58×, domingo sin venta
    const centro = [...rows[0].querySelectorAll("td.sdash-mx-cell")];
    expect(centro.map((td) => td.className.split(" ").filter((c) => /^sdash-(h\d|hzero)$/.test(c))[0])).toEqual([
      "sdash-h1", "sdash-h1", "sdash-h1", "sdash-h1", "sdash-h5", "sdash-h4", "sdash-hzero",
    ]);
    expect(centro[4].className).toContain("sdash-mx-best");
    expect(centro[4].getAttribute("title")).toContain("mejor día de la semana");
    expect(centro[4].getAttribute("title")).toContain("= 2.92× el promedio del kiosco");
    // la ★ siempre trae texto para lectores de pantalla
    expect(centro[4].querySelector(".sr-only").textContent).toBe(" mejor día");
    expect(centro[4].querySelector('[aria-hidden="true"]').textContent).toBe(" ★");
    expect(card(container, WEEKDAY_CARD).querySelectorAll("tbody .sdash-mx-best")).toHaveLength(4);
  });

  test("la fila de abajo suma todos los kioscos y también marca su mejor día", async () => {
    const { container } = await renderSection();
    const footer = card(container, WEEKDAY_CARD).querySelector("tfoot tr");
    expect(cells(footer)).toEqual([
      "Todos los kioscos", "", "9,680.00", "200.00", "200.00", "200.00", "200.00", "860.00 ★ mejor día", "590.00", "70.00",
    ]);
    expect(footer.querySelectorAll(".sdash-mx-best")).toHaveLength(1);
  });

  test("insignia de clasificación con texto junto a cada kiosco (Cat. A/B/C o Sin clasificar)", async () => {
    const { container } = await renderSection();
    const badges = bodyRows(container, WEEKDAY_CARD).map((r) => r.querySelector(".sdash-cat"));
    expect(badges.map(text)).toEqual(["Cat. A", "Cat. A", "Cat. B", "Cat. C", "Sin clasificar"]);
    expect(badges.map((b) => b.className)).toEqual([
      "sdash-cat sdash-cat--a",
      "sdash-cat sdash-cat--a",
      "sdash-cat sdash-cat--b",
      "sdash-cat sdash-cat--c",
      "sdash-cat sdash-cat--none",
    ]);
    expect(badges[0].getAttribute("title")).toBe("Clasificación de ventas: categoría A");
    expect(badges[4].getAttribute("title")).toContain("Sin clasificación de ventas");
    // cada nombre es el encabezado de su fila
    const heads = bodyRows(container, WEEKDAY_CARD).map((r) => r.querySelector("th"));
    expect(heads.every((th) => th.getAttribute("scope") === "row")).toBe(true);
  });

  test("con un rango de menos de una semana los días que no caen en él quedan con guion", async () => {
    const days = rangeOf("2026-09-01", 3);
    svc.getKioskHeatmap.mockResolvedValue({
      ...septemberResponse(),
      endDate: "2026-09-03",
      days,
      sites: [siteByWeekday(days, [0, 10, 30, 20, 0, 0, 0], { siteId: 1, name: "Corto", category: "A" })],
      categories: [],
    });
    const { container } = await renderSection({ endDate: "2026-09-03", dailySeries: [] });
    const row = bodyRows(container, WEEKDAY_CARD)[0];
    expect(cells(row).slice(3)).toEqual(["—", "10.00", "30.00 ★ mejor día", "20.00", "—", "—", "—"]);
    expect(row.querySelectorAll("td.sdash-mx-na")).toHaveLength(4);
    expect([...card(container, WEEKDAY_CARD).querySelectorAll("thead th")].map(text).slice(3)).toEqual([
      "Lun0 días",
      "Mar1 día",
      "Mié1 día",
      "Jue1 día",
      "Vie0 días",
      "Sáb0 días",
      "Dom0 días",
    ]);
  });
});

describe("matriz 'Kioscos por día'", () => {
  test("una columna por cada día del rango y 0.00 (sin sombrear) en los días sin venta", async () => {
    const { container } = await renderSection();
    const matrix = card(container, DAY_CARD);
    const headers = [...matrix.querySelectorAll("thead th")];
    expect(headers).toHaveLength(3 + 30);
    expect(headers.slice(0, 3).map(text)).toEqual(["Kiosko", "Cat.", "Total"]);
    expect(text(headers[3])).toBe("1mar");
    expect(text(headers[32])).toBe("30mié");
    expect(headers[3].getAttribute("title")).toBe("Martes 01/09/2026");

    expect(rowNames(container, DAY_CARD)).toEqual(["Centro", "Norte", "Sur", "Cerrado", "Plaza"]);
    const rows = bodyRows(container, DAY_CARD);
    expect(cells(rows[0]).slice(0, 3)).toEqual(["Centro", "Cat. A", "5,000.00"]);
    // Centro no vende los domingos: cuatro días en 0.00 y sin sombrear
    const zeros = [...rows[0].querySelectorAll("td.sdash-hzero")];
    expect(zeros).toHaveLength(4);
    expect(zeros.every((td) => text(td) === "0.00")).toBe(true);
    // un kiosco sin ninguna venta: los 30 días en 0.00
    const closed = [...rows[3].querySelectorAll("td.sdash-mx-cell")];
    expect(closed).toHaveLength(30);
    expect(closed.every((td) => td.className.includes("sdash-hzero") && text(td) === "0.00")).toBe(true);
  });

  test("cada kiosco se sombrea contra su propia mediana de días con venta", async () => {
    const { container } = await renderSection();
    const rows = bodyRows(container, DAY_CARD);
    const centro = [...rows[0].querySelectorAll("td.sdash-mx-cell")];
    // mediana de Centro = Q 100: viernes 4 (Q 500) = 5× → ≥ 2×; lunes 7 (Q 100) = 1× → 0.85–1.15×; domingo 6 sin venta
    expect(text(centro[3])).toBe("500.00");
    expect(centro[3].className).toContain("sdash-h5");
    expect(centro[3].getAttribute("title")).toBe("Centro · Viernes 04/09/2026: Q 500.00 = 5.00× la mediana del kiosco");
    expect(text(centro[6])).toBe("100.00");
    expect(centro[6].className).toContain("sdash-h2");
    expect(centro[5].className).toContain("sdash-hzero");
    expect(centro[5].getAttribute("title")).toBe("Centro · Domingo 06/09/2026: Q 0.00");
    // Plaza (mediana Q 20): el sábado 5 (Q 80) es 4× su mediana aunque en Centro sea una cifra baja
    const plaza = [...rows[4].querySelectorAll("td.sdash-mx-cell")];
    expect(text(plaza[4])).toBe("80.00");
    expect(plaza[4].className).toContain("sdash-h5");
    expect(text(plaza[0])).toBe("20.00");
    expect(plaza[0].className).toContain("sdash-h2");
  });

  test("la fila de totales suma los kioscos y se sombrea contra su propia mediana", async () => {
    const { container } = await renderSection();
    const footer = card(container, DAY_CARD).querySelector("tfoot tr");
    const row = cells(footer);
    expect(row.slice(0, 3)).toEqual(["Todos los kioscos", "", "9,680.00"]);
    const days = [...footer.querySelectorAll("td.sdash-mx-cell")];
    expect(days).toHaveLength(30);
    expect(text(days[0])).toBe("200.00"); // martes 1
    expect(days[0].className).toContain("sdash-h2"); // mediana de la red = 200
    expect(text(days[3])).toBe("860.00"); // viernes 4
    expect(days[3].className).toContain("sdash-h5");
    expect(text(days[5])).toBe("70.00"); // domingo 6
    expect(days[5].className).toContain("sdash-h0");
  });

  test("con 62 días todavía dibuja la matriz; con 63 solo la nota", async () => {
    const make = (count) => {
      const days = rangeOf("2026-08-01", count);
      return {
        ...septemberResponse(),
        startDate: days[0],
        endDate: days[count - 1],
        days,
        sites: [
          siteByWeekday(days, [10, 10, 10, 10, 50, 40, 0], { siteId: 1, name: "Centro", category: "A", previousTotal: 100 }),
          siteByWeekday(days, [5, 5, 5, 5, 5, 20, 20], { siteId: 2, name: "Sur", category: "B", previousTotal: 100 }),
        ],
        categories: [],
      };
    };
    svc.getKioskHeatmap.mockResolvedValue(make(62));
    const a = await renderSection({ startDate: "2026-08-01", endDate: "2026-10-01", dailySeries: [] });
    expect(card(a.container, DAY_CARD).querySelector("table")).not.toBeNull();
    expect(a.container.textContent).not.toContain("Elige un rango de hasta 62 días");

    svc.getKioskHeatmap.mockResolvedValue(make(63));
    const b = await renderSection({ startDate: "2026-08-01", endDate: "2026-10-02", dailySeries: [] });
    expect(card(b.container, DAY_CARD).querySelector("table")).toBeNull();
  });
});

describe("más de 62 días", () => {
  const longResponse = () => {
    const days = rangeOf("2026-08-01", 66);
    return {
      ...septemberResponse(),
      startDate: "2026-08-01",
      endDate: "2026-10-05",
      days,
      sites: [
        siteByWeekday(days, [10, 10, 10, 10, 50, 40, 0], { siteId: 1, name: "Centro", category: "A", previousTotal: 100 }),
        siteByWeekday(days, [5, 5, 5, 5, 5, 20, 20], { siteId: 2, name: "Sur", category: "B", previousTotal: 100 }),
      ],
      categories: [],
    };
  };

  test("avisa que hay que elegir un rango de hasta 62 días, sin dibujar la matriz por día", async () => {
    svc.getKioskHeatmap.mockResolvedValue(longResponse());
    const { container } = await renderSection({ startDate: "2026-08-01", endDate: "2026-10-05" });
    const dayCard = card(container, DAY_CARD);
    const note = dayCard.querySelector('[role="note"]');
    expect(note.textContent).toContain("Elige un rango de hasta 62 días para ver kiosco por día");
    expect(note.textContent).toContain("El rango actual tiene 66 días");
    expect(dayCard.querySelector("table")).toBeNull();
  });

  test("la matriz por día de la semana, el resumen, los insights y el filtro siguen disponibles", async () => {
    svc.getKioskHeatmap.mockResolvedValue(longResponse());
    const { container } = await renderSection({ startDate: "2026-08-01", endDate: "2026-10-05" });
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Centro", "Sur"]);
    expect(bodyRows(container, SUMMARY_CARD)).toHaveLength(2);
    expect(card(container, INSIGHTS_CARD).querySelectorAll("li").length).toBeGreaterThan(0);
    // el filtro por clasificación sigue funcionando con las dos matrices (la de por día solo muestra la nota)
    await click(button(container, "B"));
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Sur"]);
    expect(card(container, DAY_CARD).querySelector("table")).toBeNull();
    // 66 días: la etiqueta de las columnas del insight incluye el mes
    expect(text(card(container, INSIGHTS_CARD).querySelector(".sdash-ins-text"))).toMatch(/^Los días con más venta fueron el \d{2}\/\d{2} \(/);
  });
});

describe("filtro por clasificación", () => {
  const filters = (container) => [...container.querySelectorAll(".sdash-kheat-filter button")];

  test("Todas / A / B / C / Sin clasificar, con el estado pulsado y el conteo en el nombre accesible", async () => {
    const { container } = await renderSection();
    const group = container.querySelector(".sdash-kheat-filter .kfin-btnseg");
    expect(group.getAttribute("role")).toBe("group");
    expect(text(container.querySelector(`#${group.getAttribute("aria-labelledby")}`))).toBe("Clasificación");
    expect(filters(container).map(text)).toEqual(["Todas", "A", "B", "C", "Sin clasificar"]);
    expect(filters(container).map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false", "false", "false"]);
    expect(filters(container).map((b) => b.getAttribute("aria-label"))).toEqual([
      "Todas: 5 kioscos",
      "Cat. A: 2 kioscos",
      "Cat. B: 1 kiosco",
      "Cat. C: 1 kiosco",
      "Sin clasificar: 1 kiosco",
    ]);
    expect(filters(container).every((b) => b.getAttribute("type") === "button")).toBe(true);
    expect(container.querySelector(".sdash-kheat-filter .kfin-hint").textContent).toContain("Filtra las dos matrices");
  });

  test("filtra las dos matrices (filas y fila de totales) y no toca los insights ni el resumen", async () => {
    const { container } = await renderSection();
    const insightsBefore = text(card(container, INSIGHTS_CARD));
    const summaryBefore = text(card(container, SUMMARY_CARD));

    await click(button(container, "A"));
    expect(button(container, "A").getAttribute("aria-pressed")).toBe("true");
    expect(button(container, "Todas").getAttribute("aria-pressed")).toBe("false");
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Centro", "Norte"]);
    expect(rowNames(container, DAY_CARD)).toEqual(["Centro", "Norte"]);
    const weekdayFooter = cells(card(container, WEEKDAY_CARD).querySelector("tfoot tr"));
    expect(weekdayFooter.slice(0, 3)).toEqual(["Total Cat. A", "", "7,500.00"]);
    expect(weekdayFooter.slice(3)).toEqual(["150.00", "150.00", "150.00", "150.00", "750.00 ★ mejor día", "450.00", "0.00"]);
    expect(cells(card(container, DAY_CARD).querySelector("tfoot tr")).slice(0, 3)).toEqual(["Total Cat. A", "", "7,500.00"]);
    // los insights y el resumen siguen hablando de toda la red
    expect(text(card(container, INSIGHTS_CARD))).toBe(insightsBefore);
    expect(text(card(container, SUMMARY_CARD))).toBe(summaryBefore);
    expect(bodyRows(container, SUMMARY_CARD)).toHaveLength(4);
    // y no se vuelve a consultar el endpoint
    expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(1);

    await click(button(container, "Sin clasificar"));
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Plaza"]);
    expect(cells(card(container, DAY_CARD).querySelector("tfoot tr"))[0]).toBe("Total sin clasificar");

    await click(button(container, "C"));
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Cerrado"]);

    await click(button(container, "Todas"));
    expect(rowNames(container, WEEKDAY_CARD)).toHaveLength(5);
    expect(cells(card(container, WEEKDAY_CARD).querySelector("tfoot tr"))[0]).toBe("Todos los kioscos");
  });

  test("una clasificación sin kioscos queda deshabilitada", async () => {
    svc.getKioskHeatmap.mockResolvedValue(septemberWithoutC());
    const { container } = await renderSection();
    expect(filters(container).map((b) => b.disabled)).toEqual([false, false, false, true, false]);
    expect(button(container, "C").getAttribute("aria-label")).toBe("Cat. C: 0 kioscos");
  });

  test("si la clasificación elegida desaparece al cambiar el rango, vuelve a mostrar todos los kioscos", async () => {
    const { container, rerender } = await renderSection();
    await click(button(container, "C"));
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Cerrado"]);

    svc.getKioskHeatmap.mockResolvedValue(septemberWithoutC());
    await rerender({ endDate: "2026-09-29" });
    expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(2);
    expect(rowNames(container, WEEKDAY_CARD)).toEqual(["Centro", "Norte", "Sur", "Plaza"]);
    expect(button(container, "Todas").getAttribute("aria-pressed")).toBe("true");
    expect(button(container, "C").disabled).toBe(true);
  });
});

describe("calendario de calor de kioscos", () => {
  test("reutiliza el mapa de calor de Online con la paleta de Kioskos y 'venta de kioscos'", async () => {
    const { container } = await renderSection();
    const heat = container.querySelector(".sdash-heat");
    expect(heat.classList.contains("sdash-heat--kiosk")).toBe(true);
    expect(heat.textContent).toContain("Septiembre 2026 · venta de kioscos por día (Q) · sombreado contra la mediana del mes");
    expect(heat.textContent).toContain("Venta de kioscos promedio de cada día (Q)");
    expect(heat.textContent).toContain("concentran el 60% de la venta de kioscos");
    expect(heat.textContent).toContain("Es el mismo criterio de la matriz de ventas diarias del módulo de Finanzas kioscos.");
    expect(heat.textContent).not.toContain("online");
    expect(heat.querySelectorAll(".sdash-cd:not(.sdash-cd--empty)")).toHaveLength(30);
    expect(heat.querySelectorAll(".sdash-cd--best")).toHaveLength(1);
    expect(heat.querySelectorAll(".sdash-wbar--strong")).toHaveLength(2);
    expect(heat.querySelector(".sdash-badge--heat").textContent).toBe("Mediana del mes: Q 200");
    expect(heat.querySelector('section[aria-label="Detalle diario"] table')).not.toBeNull();
  });

  test("sin serie diaria de /dashboard/kiosks no se dibuja el calendario, pero las matrices sí", async () => {
    const { container } = await renderSection({ dailySeries: null });
    expect(container.querySelector(".sdash-heat")).toBeNull();
    expect(container.querySelector(".sdash-kheat > .sdash-def").textContent).not.toContain("siguen el selector");
    expect(container.querySelector(".sdash-kheat > .sdash-def").textContent).toContain("comparan siempre todos los kioscos");
    expect(rowNames(container, WEEKDAY_CARD)).toHaveLength(5);
  });

  test("se atenúa mientras se recarga la consulta de arriba", async () => {
    const { container } = await renderSection({ calendarBusy: true });
    const wrapper = container.querySelector(".sdash-heat").parentElement;
    expect(wrapper.className).toBe("kfin-refetching");
    expect(wrapper.getAttribute("aria-busy")).toBe("true");
  });
});

describe("estados: vacío, error, recarga y rangos largos", () => {
  test("sin ventas de ningún kiosco muestra el estado vacío y ninguna matriz", async () => {
    svc.getKioskHeatmap.mockResolvedValue({ ...septemberResponse(), sites: [], categories: [] });
    const { container } = await renderSection();
    const empty = container.querySelector(".kfin-empty");
    expect(empty.getAttribute("role")).toBe("status");
    expect(empty.textContent).toContain("Sin ventas de kioscos en el periodo");
    expect(empty.textContent).toContain("Ningún kiosco tiene ventas en este periodo");
    expect(card(container, WEEKDAY_CARD)).toBeNull();
    expect(card(container, INSIGHTS_CARD)).toBeNull();
    expect(container.querySelector(".sdash-kheat-filter")).toBeNull();
    // el calendario (de otra consulta) no se afecta
    expect(container.querySelector(".sdash-heat")).not.toBeNull();
  });

  test("kioscos que solo vendieron en el periodo anterior también cuentan como vacío", async () => {
    const response = septemberResponse();
    svc.getKioskHeatmap.mockResolvedValue({
      ...response,
      sites: response.sites.map((s) => ({ ...s, total: 0, daily: s.daily.map(() => 0), previousTotal: 100, growthPercent: -100 })),
    });
    const { container } = await renderSection();
    expect(container.querySelector(".kfin-empty").textContent).toContain("Sin ventas de kioscos en el periodo");
    expect(card(container, WEEKDAY_CARD)).toBeNull();
  });

  test("un error muestra el mensaje con 'Reintentar' y al reintentar dibuja todo", async () => {
    svc.getKioskHeatmap.mockRejectedValueOnce(new Error("El mapa de calor no está disponible"));
    const { container } = await renderSection();
    const alert = container.querySelector(".alert");
    expect(alert.textContent).toContain("El mapa de calor no está disponible");
    expect(card(container, WEEKDAY_CARD)).toBeNull();
    expect(container.textContent).toContain("Mapa de calor de kioscos");
    await click(button(container, "Reintentar"));
    expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(2);
    expect(container.querySelector(".alert")).toBeNull();
    expect(rowNames(container, WEEKDAY_CARD)).toHaveLength(5);
  });

  test("cambiar el rango o pulsar Actualizar vuelve a consultar; Actualizar salta la caché", async () => {
    const { rerender } = await renderSection();
    const calls = svc.getKioskHeatmap.mock.calls;
    expect(calls).toHaveLength(1);

    await rerender({ endDate: "2026-09-29" });
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-29", refresh: false });

    await rerender({ endDate: "2026-09-29", refreshToken: 1 });
    expect(calls).toHaveLength(3);
    expect(calls[2][0]).toMatchObject({ endDate: "2026-09-29", refresh: true });
  });

  test("mientras recarga conserva lo que ya se veía, atenuado", async () => {
    const { container, rerender } = await renderSection();
    expect(rowNames(container, WEEKDAY_CARD)).toHaveLength(5);
    svc.getKioskHeatmap.mockReturnValue(new Promise(() => {}));
    await rerender({ endDate: "2026-09-29" });
    expect(rowNames(container, WEEKDAY_CARD)).toHaveLength(5);
    const dimmed = container.querySelectorAll(".kfin-refetching[aria-busy='true']");
    expect(dimmed.length).toBeGreaterThanOrEqual(2);
    expect(container.querySelector('[role="status"][aria-label="Cargando mapa de calor de kioscos"]')).toBeNull();
  });

  test("más de 400 días: no consulta y explica el límite; el calendario sigue", async () => {
    const { container } = await renderSection({ startDate: "2025-01-01", endDate: "2026-09-30" });
    expect(svc.getKioskHeatmap).not.toHaveBeenCalled();
    // la aclaración de siempre y, debajo, el aviso del límite
    const notes = [...container.querySelectorAll(".sdash-kheat > .sdash-def")];
    expect(notes).toHaveLength(2);
    expect(notes[1].getAttribute("role")).toBe("note");
    expect(notes[1].textContent).toContain("admite un máximo de 400 días y el rango elegido tiene 638");
    expect(card(container, WEEKDAY_CARD)).toBeNull();
    expect(card(container, INSIGHTS_CARD)).toBeNull();
    expect(container.querySelector(".kfin-empty")).toBeNull();
    expect(container.querySelector(".sdash-heat")).not.toBeNull();
  });

  test("400 días exactos sí se consultan", async () => {
    const days = rangeOf("2025-09-01", 400);
    await renderSection({ startDate: days[0], endDate: days[399] });
    expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(1);
  });

  test("al volver de un rango de más de 400 días a uno válido consulta de nuevo", async () => {
    const { container, rerender } = await renderSection({ startDate: "2025-01-01", endDate: "2026-09-30" });
    expect(svc.getKioskHeatmap).not.toHaveBeenCalled();
    await rerender({ startDate: "2026-09-01", endDate: "2026-09-30" });
    expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(1);
    expect(rowNames(container, WEEKDAY_CARD)).toHaveLength(5);
    expect(container.textContent).not.toContain("admite un máximo de 400 días");
  });
});

describe("desplazamiento de las matrices (rueda y arrastre de Finanzas kioscos)", () => {
  /** Simula una caja con desborde solo horizontal (jsdom no calcula el layout). */
  const withOverflow = (box) => {
    const metrics = { scrollWidth: 3000, clientWidth: 1000, scrollHeight: 400, clientHeight: 400 };
    Object.entries(metrics).forEach(([key, value]) => Object.defineProperty(box, key, { value, configurable: true }));
    box.scrollLeft = 100;
    box.scrollTop = 0;
  };

  test("la rueda sobre la matriz por día la mueve hacia los lados sin desplazar la página", async () => {
    const { container } = await renderSection();
    const box = card(container, DAY_CARD).querySelector(".kfin-scroll");
    withOverflow(box);
    const event = new WheelEvent("wheel", { deltaY: 150, bubbles: true, cancelable: true });
    box.querySelector("tbody td.sdash-mx-cell").dispatchEvent(event);
    expect(box.scrollLeft).toBe(250);
    expect(event.defaultPrevented).toBe(true);
  });

  test("arrastrar la matriz por día de la semana la desplaza; un clic simple no", async () => {
    const { container } = await renderSection();
    const box = card(container, WEEKDAY_CARD).querySelector(".kfin-scroll");
    withOverflow(box);
    const cell = box.querySelector("tbody td.sdash-mx-cell");
    cell.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 500, clientY: 300, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 450, clientY: 300, bubbles: true, cancelable: true }));
    expect(box.scrollLeft).toBe(150);
    expect(box.classList.contains("is-dragging")).toBe(true);
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(box.classList.contains("is-dragging")).toBe(false);

    box.scrollLeft = 100;
    cell.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 500, clientY: 300, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 498, clientY: 300, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(box.scrollLeft).toBe(100);
  });

  test("fuera de las cajas con desplazamiento (el filtro) la rueda es la nativa", async () => {
    const { container } = await renderSection();
    const box = card(container, WEEKDAY_CARD).querySelector(".kfin-scroll");
    withOverflow(box);
    // el filtro queda fuera de las cajas con desplazamiento: la rueda sobre él es la nativa
    const event = new WheelEvent("wheel", { deltaY: 150, bubbles: true, cancelable: true });
    button(container, "A").dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(box.scrollLeft).toBe(100);
  });
});

describe("accesibilidad", () => {
  test("tablas con título, encabezados con alcance y cajas desplazables con nombre", async () => {
    const { container } = await renderSection();
    [WEEKDAY_CARD, DAY_CARD, SUMMARY_CARD].forEach((label) => {
      const table = card(container, label).querySelector("table");
      const caption = table.querySelector("caption.sr-only");
      expect(caption).not.toBeNull();
      expect(caption.textContent.length).toBeGreaterThan(30);
      expect([...table.querySelectorAll("thead th")].every((th) => th.getAttribute("scope") === "col")).toBe(true);
      expect([...table.querySelectorAll("tbody th")].every((th) => th.getAttribute("scope") === "row")).toBe(true);
    });
    const boxes = [WEEKDAY_CARD, DAY_CARD, SUMMARY_CARD].map((label) => card(container, label).querySelector(".kfin-scroll"));
    boxes.forEach((box) => {
      expect(box.getAttribute("tabindex")).toBe("0");
      expect(box.getAttribute("aria-label")).toMatch(/desplazable$/);
    });
    // las matrices llevan su leyenda de sombreado y las claves ★ / 0.00
    expect(card(container, WEEKDAY_CARD).querySelector(".kfin-heat-legend").textContent).toContain("mejor día de la semana del kiosco");
    expect(card(container, WEEKDAY_CARD).querySelector(".kfin-heat-legend").textContent).toContain("Sombreado vs. promedio del kiosco");
    expect(card(container, DAY_CARD).querySelector(".kfin-heat-legend").textContent).toContain("Sombreado vs. mediana del kiosco");
    expect(card(container, DAY_CARD).querySelector(".kfin-heat-legend").textContent).toContain("0.00 sin venta");
    expect(card(container, DAY_CARD).querySelector(".kfin-heat-legend").textContent).not.toContain("★");
    // los umbrales del sombreado se explican al pie
    expect(card(container, DAY_CARD).textContent).toContain("0.5, 0.85, 1.15, 1.5, 2");
  });

  test("la variación del resumen nunca depende solo del color: flecha y texto alternativo", async () => {
    const { container } = await renderSection();
    const chips = [...card(container, SUMMARY_CARD).querySelectorAll(".kfin-delta")];
    chips.forEach((chip) => {
      expect(chip.querySelector('[aria-hidden="true"]')).not.toBeNull();
      expect(chip.textContent.trim().length).toBeGreaterThan(3);
    });
    expect(chips.some((c) => c.textContent.includes("▲"))).toBe(true);
    expect(chips.some((c) => c.textContent.includes("▼"))).toBe(true);
    expect(chips.some((c) => c.querySelector(".sr-only"))).toBe(true);
  });
});
