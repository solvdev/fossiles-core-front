/**
 * Prueba de render del dashboard con respuestas simuladas según docs/SALES-DASHBOARD-CONTRACT.md
 * (servicios y gráficos simulados: no hay backend ni canvas en jsdom). El día de hoy se fija en 2026-10-08 para que
 * los selectores de mes y año (que dependen del año y del mes en curso) den siempre el mismo resultado.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter, useLocation } from "react-router-dom";
import * as svc from "services/salesDashboardService";
import * as svc2 from "services/onlineAdSpendService";
import SalesDashboard from "views/sales/SalesDashboard";

jest.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
}));
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: () => false, initialized: true }),
}));
// Función simple (no jest.fn): CRA resetea los mocks entre pruebas y borraría la implementación.
jest.mock("utils/dateTimeHelper", () => ({
  ...jest.requireActual("utils/dateTimeHelper"),
  getTodayYmdGuatemala: () => "2026-10-08",
}));
jest.mock("services/salesDashboardService", () => ({
  getSalesConsolidated: jest.fn(),
  getSalesKiosks: jest.fn(),
  getKioskHeatmap: jest.fn(),
  getSalesOnline: jest.fn(),
  getSalesVendor: jest.fn(),
}));
jest.mock("services/onlineAdSpendService", () => ({
  getAdSpendReport: jest.fn(),
  saveAdSpend: jest.fn(),
  bulkSaveAdSpend: jest.fn(),
}));

const days = (n, f) =>
  Array.from({ length: n }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, amount: f(i), count: 2 }));
const kpis = (t) => ({
  totalAmount: t, productAmount: t * 0.9, packagingAmount: t * 0.06, shippingAmount: t * 0.04, historicalAmount: 0,
  previousTotalAmount: t * 0.9, growthPercent: 12.4, dailyAmount: 1500, salesCount: 40, unitsFinished: 120, avgTicket: t / 40,
});
const sale = { id: 1, saleDate: "2026-09-29", reference: "OL-1", productLabel: "Billetera +1 más", quantity: 2, totalAmount: 520, status: "Entregado", party: "Ana" };
const bd = (key, label) => [{ key, label, count: 5, amount: 1000, sharePercent: 60 }, { key: "b", label: "Otro", count: 3, amount: 600, sharePercent: 40 }];
const detail = (channel, extra) => ({
  channel, label: channel, startDate: "2026-09-01", endDate: "2026-09-30", previousStartDate: "2026-08-02", previousEndDate: "2026-08-31",
  kpis: kpis(120000), dailySeries: days(30, (i) => 3000 + (i % 7) * 500 + (i === 17 ? 3000 : 0)),
  monthlyTrend: [], topProducts: [{ productId: 1, productCode: "B", productName: "Billetera", units: 148, amount: 22000 }],
  recentSales: [sale], breakdowns: {}, kioskOptions: null, ...extra,
});
const consolidated = {
  startDate: "2026-09-01", endDate: "2026-09-30", previousStartDate: "2026-08-02", previousEndDate: "2026-08-31",
  totals: kpis(480000),
  sources: [
    { channel: "KIOSKO", label: "Kioskos", kpis: kpis(268000), sharePercent: 55.6 },
    { channel: "ONLINE", label: "Online", kpis: kpis(121000), sharePercent: 25.3 },
    { channel: "VENDOR", label: "Vendedor LF", kpis: kpis(92000), sharePercent: 19.1 },
  ],
  monthlyTrend: [{ label: "abr", year: 2026, month: 4, kiosko: 1, online: 2, vendor: 3, total: 6 }],
  dailySeries: days(30, (i) => 1000 + i).map((d) => ({ date: d.date, kiosko: 1, online: 2, vendor: 3, total: d.amount })),
};

const adSpendReport = {
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  totals: { salesAmount: 600, ordersCount: 6, comparableSales: 300, adSpend: 100, netResult: 200, roas: 3, daysWithSpend: 1, daysNoSpend: 29, daysWin: 1, daysLoss: 0, daysEven: 0 },
  days: Array.from({ length: 30 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, "0")}`,
    salesAmount: i === 0 ? 300 : 10,
    ordersCount: 2,
    adSpend: i === 0 ? 100 : null,
    netResult: i === 0 ? 200 : null,
    roas: i === 0 ? 3 : null,
    status: i === 0 ? "WIN" : "NO_SPEND",
    notes: null,
  })),
};

// Kioskos = Finanzas kioscos (histórico + POS): producto + empaque + envío + histórico = total.
const kioskKpis = (overrides) => ({
  totalAmount: 150000, productAmount: 100000, packagingAmount: 8000, shippingAmount: 0, historicalAmount: 42000,
  previousTotalAmount: 120000, growthPercent: 25, dailyAmount: 1500, salesCount: 640, unitsFinished: 900, avgTicket: 168.75,
  ...overrides,
});
// Clasificación A/B/C de cada kiosko (kiosk_site.sales_category): Kiosko Centro = A; Plaza Antigua, sin clasificar.
const kioskDetail = (overrides) =>
  detail("KIOSKO", {
    kpis: kioskKpis(),
    kioskOptions: [
      { siteId: 5, kioskId: null, kioskCode: "", kioskName: "Plaza Antigua", category: null },
      { siteId: 3, kioskId: 30, kioskCode: "K3", kioskName: "Kiosko Centro", category: "A" },
    ],
    breakdowns: {
      byKiosk: [
        { key: "3", label: "Kiosko Centro", count: 640, amount: 108000, sharePercent: 72, category: "A" },
        { key: "5", label: "Plaza Antigua", count: 0, amount: 42000, sharePercent: 28, category: null },
      ],
      byPaymentMethod: [
        { key: "EFECTIVO", label: "Efectivo", count: 400, amount: 70000, sharePercent: 64.8 },
        { key: "TARJETA", label: "Tarjeta", count: 240, amount: 38000, sharePercent: 35.2 },
      ],
    },
    ...overrides,
  });

// Mapa de calor de kioscos (GET /dashboard/kiosks/heatmap, Addendum 3): septiembre 2026, siempre TODOS los sitios
// aunque el selector de kiosko tenga uno elegido. Kiosko Centro (Cat. A) vende más los viernes y sábados.
const SEPT_DAYS = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`);
const heatSite = (overrides, amountFor) => {
  const daily = SEPT_DAYS.map((date, i) => amountFor(i + 1, new Date(`${date}T00:00:00Z`).getUTCDay()));
  const total = daily.reduce((a, v) => a + v, 0);
  return { locationId: null, source: "POS", daysWithSales: daily.filter((v) => v > 0).length, daily, total, ...overrides };
};
const heatmapResponse = (overrides) => {
  const centro = heatSite(
    { siteId: 3, name: "Kiosko Centro", category: "A", previousTotal: 90000, growthPercent: 20 },
    (day, wd) => (wd === 5 || wd === 6 ? 5000 : 2500)
  );
  const plaza = heatSite(
    { siteId: 5, name: "Plaza Antigua", category: null, previousTotal: 0, growthPercent: 100 },
    () => 1000
  );
  return {
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    previousStartDate: "2026-08-02",
    previousEndDate: "2026-08-31",
    days: SEPT_DAYS,
    sites: [centro, plaza],
    categories: [
      { category: "A", kioskCount: 1, total: centro.total, previousTotal: 90000, growthPercent: 20, sharePercent: 78.5 },
      { category: null, kioskCount: 1, total: plaza.total, previousTotal: 0, growthPercent: 100, sharePercent: 21.5 },
    ],
    ...overrides,
  };
};

// Última ?query de la URL (MemoryRouter no la expone de otra forma).
let lastSearch = "";
function LocationProbe() {
  lastSearch = useLocation().search;
  return null;
}
const urlParam = (name) => new URLSearchParams(lastSearch).get(name);

const renderAt = async (url) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <LocationProbe />
        <SalesDashboard />
      </MemoryRouter>
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return { container, root };
};

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
// React sigue el valor con un descriptor propio: se asigna con el setter nativo para que detecte el cambio
const setValue = async (element, value, eventName) => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value").set.call(element, value);
  await act(async () => {
    element.dispatchEvent(new Event(eventName, { bubbles: true }));
  });
  await settle();
};
const click = async (element) => {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
};
const buttonByText = (container, label) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  // CRA resetea los mocks entre pruebas: el reporte de publicidad y el mapa de calor responden siempre algo válido
  svc2.getAdSpendReport.mockResolvedValue(adSpendReport);
  svc.getKioskHeatmap.mockResolvedValue(heatmapResponse());
});

test("consolidado", async () => {
  svc.getSalesConsolidated.mockResolvedValue(consolidated);
  const { container } = await renderAt("/?startDate=2026-09-01&endDate=2026-09-30");
  const text = container.textContent;
  expect(text).toContain("Dashboard de ventas");
  expect(text).toContain("Septiembre 2026");
  expect(text).toContain("Ventas totales");
  expect(text).toContain("Q 480,000.00");
  expect(text).toContain("+12.4%");
  expect(text).toContain("Producto terminado por fuente");
  expect(text).toContain("Ver detalle de kioskos");
  expect(svc.getSalesConsolidated.mock.calls[0][0]).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30", refresh: false });
  // sin histórico: la tabla no trae la columna 'Histórico' y la barra de composición no trae el 4.º segmento
  const headers = [...container.querySelectorAll('section[aria-label="Producto terminado por fuente"] thead th')].map((e) => e.textContent);
  expect(headers).toEqual([
    "Fuente", "Unidades terminadas", "Venta de producto", "Precio promedio por unidad", "Empaque", "Envío", "Total",
  ]);
  expect(container.querySelectorAll(".sdash-hatch").length).toBe(0);
  expect(text).not.toContain("Histórico (sin desglose)");
});

test("consolidado con histórico de kioskos: columna 'Histórico', fila de total y 4.º segmento de la composición", async () => {
  // Kioskos = 150,000 (100,000 producto + 8,000 empaque + 42,000 histórico); Online y Vendedor sin histórico
  const kiosk = kioskKpis();
  const online = { ...kpis(100000), historicalAmount: 0 };
  const vendor = { ...kpis(50000), historicalAmount: 0 };
  const totalKpis = (field) => kiosk[field] + online[field] + vendor[field];
  svc.getSalesConsolidated.mockResolvedValue({
    ...consolidated,
    totals: {
      ...kpis(300000),
      totalAmount: totalKpis("totalAmount"),
      productAmount: totalKpis("productAmount"),
      packagingAmount: totalKpis("packagingAmount"),
      shippingAmount: totalKpis("shippingAmount"),
      historicalAmount: 42000,
      salesCount: 640 + 80,
      avgTicket: 395.83,
    },
    sources: [
      { channel: "KIOSKO", label: "Kioskos", kpis: kiosk, sharePercent: 50 },
      { channel: "ONLINE", label: "Online", kpis: online, sharePercent: 33.3 },
      { channel: "VENDOR", label: "Vendedor LF", kpis: vendor, sharePercent: 16.7 },
    ],
  });
  const { container } = await renderAt("/?startDate=2026-09-01&endDate=2026-09-30");
  const table = container.querySelector('section[aria-label="Producto terminado por fuente"] table');
  const headers = [...table.querySelectorAll("thead th")].map((e) => e.textContent);
  expect(headers).toEqual([
    "Fuente", "Unidades terminadas", "Venta de producto", "Precio promedio por unidad", "Empaque", "Envío", "Histórico", "Total",
  ]);
  const rowCells = [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map((c) => c.textContent.trim()));
  // Kioskos: histórico en la columna nueva y el total incluye el histórico
  expect(rowCells[0][0]).toBe("Kioskos");
  expect(rowCells[0][6]).toBe("Q 42,000.00");
  expect(rowCells[0][7]).toBe("Q 150,000.00");
  // las demás fuentes no tienen histórico
  expect(rowCells[1][6]).toBe("—");
  expect(rowCells[2][6]).toBe("—");
  // la fila Total suma la columna
  const totalCells = [...table.querySelectorAll("tfoot tr")[0].children].map((c) => c.textContent.trim());
  expect(totalCells[0]).toBe("Total");
  expect(totalCells[6]).toBe("Q 42,000.00");
  expect(totalCells[7]).toBe("Q 300,000.00");
  expect(container.textContent).toContain("El histórico de Finanzas kioscos no tiene unidades ni desglose.");

  // composición del consolidado: el histórico aparece como 4.º segmento rayado
  const stack = container.querySelector(".sdash-stack");
  expect(stack.querySelectorAll(".sdash-hatch").length).toBe(1);
  expect(stack.lastElementChild.className).toBe("sdash-hatch");
  expect(container.querySelector(".sdash-legend").textContent).toContain("Histórico (sin desglose) Q 42,000.00 · 14.0%");
  // ticket promedio del consolidado con la definición nueva: el histórico queda fuera del promedio
  expect([...container.querySelectorAll(".kfin-kpi-label")].map((e) => e.textContent)).toEqual([
    "Ventas totales", "Ventas de hoy", "Operaciones", "Ticket promedio",
  ]);
  expect(container.textContent).toContain("Q 395.83");
  expect(container.textContent).toContain("total sin histórico ÷ operaciones");
});

test("kioskos", async () => {
  svc.getSalesKiosks.mockResolvedValue(
    detail("KIOSKO", {
      kioskOptions: [{ siteId: 3, kioskId: 3, kioskCode: "K3", kioskName: "Kiosko 3" }],
      breakdowns: { byKiosk: bd("3", "Kiosko 3"), byPaymentMethod: bd("EFECTIVO", "Efectivo") },
    })
  );
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  const text = container.textContent;
  expect(text).toContain("Ranking por kiosko");
  expect(text).toContain("Forma de pago");
  expect(text).toContain("Solo producto terminado · sin empaques");
  expect(text).toContain("Kiosko 3");
  expect(container.querySelector('a[href="/admin/total-sales?channel=kiosko&startDate=2026-09-01&endDate=2026-09-30"]')).not.toBeNull();
});

test("kioskos: fuente de Finanzas kioscos — aviso del histórico, pie fijo, rótulos (POS) y 'Solo POS'", async () => {
  svc.getSalesKiosks.mockResolvedValue(kioskDetail());
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  const text = container.textContent;

  // etiquetas de los KPIs: lo que solo viene del POS lleva (POS); el total y 'hoy' no
  const kpiLabels = [...container.querySelectorAll(".kfin-kpi-label")].map((e) => e.textContent);
  expect(kpiLabels).toEqual([
    "Ventas de kioskos",
    "Ventas de hoy",
    "Tickets (POS)",
    "Ticket promedio (POS)",
    "Unidades terminadas (POS)",
  ]);
  expect(text).toContain("Q 150,000.00");
  expect(text).toContain("Q 168.75");

  // aviso del histórico (hay histórico) y pie fijo con la fuente de cada número
  const note = container.querySelector('.sdash-kpinotes [role="note"]');
  expect(note.textContent).toBe("Q 42,000.00 vienen del histórico de Finanzas kioscos (sin tickets ni productos).");
  const caption = container.querySelector(".sdash-kpinotes .sdash-caption");
  expect(caption.textContent).toBe(
    "Ventas de kioscos = misma fuente que Finanzas kioscos (histórico + POS), con empaque incluido. Tickets, unidades, pagos y productos son solo del POS."
  );
  // las notas van justo debajo de la fila de KPIs
  expect(container.querySelector(".sdash-kpis").nextElementSibling.className).toBe("sdash-kpinotes");

  // composición del dinero: 3 segmentos (producto, empaque, histórico) con el histórico rayado y en la leyenda
  const stack = container.querySelector(".sdash-stack");
  expect([...stack.children].length).toBe(3);
  expect(stack.querySelectorAll(".sdash-hatch").length).toBe(1);
  expect(stack.lastElementChild.className).toBe("sdash-hatch");
  expect(stack.getAttribute("aria-label")).toBe("Producto terminado 66.7%, Empaque 5.3%, Histórico (sin desglose) 28.0%");
  const legend = [...container.querySelectorAll(".sdash-legend")][0];
  expect([...legend.children].map((li) => li.textContent)).toEqual([
    "Producto terminado Q 100,000.00 · 66.7%",
    "Empaque Q 8,000.00 · 5.3%",
    "Histórico (sin desglose) Q 42,000.00 · 28.0%",
  ]);
  expect(legend.querySelectorAll(".sdash-dot.sdash-hatch").length).toBe(1);

  // forma de pago y productos más vendidos: rotulados 'Solo POS'
  const posBadges = [...container.querySelectorAll(".sdash-badge--amber")].map((e) => e.textContent);
  expect(posBadges).toEqual(["Solo POS", "Solo POS"]);
  expect(container.querySelector(".sdash-subhead").textContent).toContain("Forma de pago");
  expect(container.querySelector(".sdash-subhead .sdash-badge--amber").textContent).toBe("Solo POS");
  expect(text).toContain("Solo producto terminado · sin empaques");
  expect(text).toContain("el histórico no tiene forma de pago");

  // ranking por kiosko: el sitio histórico (sin tickets) muestra '—' y no '0'
  const rows = [...container.querySelectorAll('section[aria-label="Ranking por kiosko"] tbody tr')];
  const cells = (row) => [...row.children].map((c) => c.textContent);
  // cada kiosko lleva su clasificación junto al nombre (con texto: 'Cat. A' / 'Sin clasificar')
  expect(cells(rows[0])).toEqual(["Kiosko Centro Cat. A", "640", "Q 108,000.00", "72.0%"]);
  expect(cells(rows[1])).toEqual(["Plaza Antigua Sin clasificar", "—", "Q 42,000.00", "28.0%"]);
  expect(rows[0].querySelector(".sdash-cat--a").textContent).toBe("Cat. A");
  expect(rows[1].querySelector(".sdash-cat--none").textContent).toBe("Sin clasificar");
  const rankingHeaders = [...container.querySelectorAll('section[aria-label="Ranking por kiosko"] thead th')].map((e) => e.textContent);
  expect(rankingHeaders).toEqual(["Kiosko", "Tickets (POS)", "Venta", "% del total"]);
  expect(text).toContain("Las 1 más recientes del periodo · solo POS");
});

test("kioskos sin histórico: sin aviso ni 4.º segmento, pero el pie con la fuente siempre se muestra", async () => {
  svc.getSalesKiosks.mockResolvedValue(
    kioskDetail({ kpis: kioskKpis({ totalAmount: 108000, historicalAmount: 0, previousTotalAmount: 100000 }) })
  );
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  expect(container.querySelector('.sdash-kpinotes [role="note"]')).toBeNull();
  expect(container.textContent).not.toContain("vienen del histórico");
  expect(container.querySelector(".sdash-kpinotes .sdash-caption").textContent).toContain(
    "Ventas de kioscos = misma fuente que Finanzas kioscos (histórico + POS), con empaque incluido."
  );
  const stack = container.querySelector(".sdash-stack");
  expect([...stack.children].length).toBe(2);
  expect(container.querySelectorAll(".sdash-hatch").length).toBe(0);
  expect(container.textContent).not.toContain("Histórico (sin desglose)");
  expect(container.textContent).not.toContain("el histórico no tiene forma de pago");
  // los rótulos 'Solo POS' no dependen del histórico
  expect([...container.querySelectorAll(".sdash-badge--amber")].map((e) => e.textContent)).toEqual(["Solo POS", "Solo POS"]);
});

test("kioskos: un kiosko solo con histórico (sin tickets) muestra el total, '—' en el ticket promedio y un solo segmento", async () => {
  svc.getSalesKiosks.mockResolvedValue(
    kioskDetail({
      kpis: kioskKpis({
        totalAmount: 42000, productAmount: 0, packagingAmount: 0, historicalAmount: 42000, salesCount: 0, unitsFinished: 0, avgTicket: 0,
      }),
      topProducts: [],
      recentSales: [],
      breakdowns: { byKiosk: [{ key: "5", label: "Plaza Antigua", count: 0, amount: 42000, sharePercent: 100 }], byPaymentMethod: [] },
    })
  );
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30&siteId=5");
  const values = [...container.querySelectorAll(".kfin-kpi-value")].map((e) => e.textContent);
  expect(values).toEqual(["Q 42,000.00", "Q 1,500.00", "0", "—", "0"]);
  const stack = container.querySelector(".sdash-stack");
  expect([...stack.children].length).toBe(1);
  expect(stack.firstElementChild.className).toBe("sdash-hatch");
  expect(container.querySelector('.sdash-kpinotes [role="note"]').textContent).toContain("Q 42,000.00 vienen del histórico");
  expect(container.textContent).toContain("Sin ventas de producto terminado en el periodo.");
});

test("kioskos: el selector de kiosko usa el id del sitio y la consulta y la URL llevan siteId", async () => {
  svc.getSalesKiosks.mockResolvedValue(kioskDetail());
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  const select = container.querySelector("#sdash-kiosk");
  expect(container.querySelector('label[for="sdash-kiosk"]').textContent).toBe("Kiosko");
  // opciones: Todos + todos los sitios con venta (el histórico, sin ubicación del POS, incluido), por nombre
  // (el kiosko clasificado lleva 'Cat. A' en el texto; el valor sigue siendo el id del sitio)
  expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
    ["", "Todos los kioskos"],
    ["3", "Kiosko Centro · Cat. A"],
    ["5", "Plaza Antigua"],
  ]);
  expect(select.value).toBe("");
  const calls = svc.getSalesKiosks.mock.calls;
  expect(calls[0][0]).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30", refresh: false });
  expect(calls[0][0].siteId).toBeUndefined();
  expect(calls[0][0]).not.toHaveProperty("kioskLocationId");

  // elegir el kiosko histórico (siteId 5, kioskId null) filtra por siteId
  await setValue(select, "5", "change");
  const last = () => calls[calls.length - 1][0];
  expect(last().siteId).toBe("5");
  expect(last()).not.toHaveProperty("kioskLocationId");
  expect(urlParam("siteId")).toBe("5");
  expect(urlParam("kioskLocationId")).toBeNull();
  expect(select.value).toBe("5");
  expect(container.textContent).toContain("kiosko seleccionado");

  // volver a 'Todos los kioskos' quita el filtro
  await setValue(select, "", "change");
  expect(last().siteId).toBeUndefined();
  expect(urlParam("siteId")).toBeNull();
  expect(select.value).toBe("");
});

test("kioskos: el ?kioskLocationId= de enlaces viejos se ignora (todos los kioskos) y se limpia al cambiar", async () => {
  svc.getSalesKiosks.mockResolvedValue(kioskDetail());
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30&kioskLocationId=30");
  const calls = svc.getSalesKiosks.mock.calls;
  expect(calls).toHaveLength(1);
  expect(calls[0][0].siteId).toBeUndefined();
  expect(calls[0][0]).not.toHaveProperty("kioskLocationId");
  const select = container.querySelector("#sdash-kiosk");
  expect(select.value).toBe("");
  expect(container.textContent).toContain("todos los kioskos");
  // al elegir un kiosko el parámetro viejo desaparece de la URL
  await setValue(select, "3", "change");
  expect(urlParam("siteId")).toBe("3");
  expect(urlParam("kioskLocationId")).toBeNull();
});

test("cambiar de pestaña quita el kiosko elegido (siteId) de la URL", async () => {
  svc.getSalesKiosks.mockResolvedValue(kioskDetail());
  svc.getSalesConsolidated.mockResolvedValue(consolidated);
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30&siteId=3&kioskLocationId=30");
  expect(svc.getSalesKiosks.mock.calls[0][0].siteId).toBe("3");
  expect(container.querySelector("#sdash-kiosk").value).toBe("3");
  const tab = [...container.querySelectorAll('[role="tab"]')].find((t) => t.textContent.trim() === "Consolidado");
  await click(tab);
  expect(urlParam("tab")).toBe("consolidado");
  expect(urlParam("siteId")).toBeNull();
  expect(urlParam("kioskLocationId")).toBeNull();
  expect(urlParam("startDate")).toBe("2026-09-01");
  expect(urlParam("endDate")).toBe("2026-09-30");
});

test("kioskos: 'Mapa de calor de kioscos' va entre el ranking y 'Últimas ventas' y consulta su propio endpoint", async () => {
  svc.getSalesKiosks.mockResolvedValue(kioskDetail());
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  const text = container.textContent;
  expect(text).toContain("Mapa de calor de kioscos");
  expect(text.indexOf("Ranking por kiosko")).toBeLessThan(text.indexOf("Mapa de calor de kioscos"));
  expect(text.indexOf("Mapa de calor de kioscos")).toBeLessThan(text.indexOf("Últimas ventas"));

  // hermanos directos: tarjetas de arriba -> mapa de calor -> últimas ventas
  const section = container.querySelector("#sdash-kheat-title").closest("section");
  expect(section.previousElementSibling.querySelector('section[aria-label="Ranking por kiosko"]')).not.toBeNull();
  expect(section.nextElementSibling.querySelector('section[aria-label="Últimas ventas"]')).not.toBeNull();

  // su propio endpoint: rango del dashboard, sin caché saltada y sin kiosko (compara a todos)
  const calls = svc.getKioskHeatmap.mock.calls;
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30", refresh: false });
  expect(calls[0][0].siteId).toBeUndefined();

  // calendario con la paleta de Kioskos (de /dashboard/kiosks), insights, resumen y las dos matrices
  const heat = section.querySelector(".sdash-heat");
  expect(heat.classList.contains("sdash-heat--kiosk")).toBe(true);
  expect(heat.textContent).toContain("Mapa de calor por día");
  expect(heat.textContent).toContain("venta de kioscos por día (Q)");
  expect(heat.textContent).toContain("Es el mismo criterio de la matriz de ventas diarias del módulo de Finanzas kioscos.");
  expect(heat.textContent).not.toContain("ventas online");
  expect(heat.querySelector(".sdash-badge--heat").textContent).toContain("Mediana del mes");
  expect(heat.querySelectorAll(".sdash-cd").length).toBeGreaterThanOrEqual(30);
  expect(section.querySelector('section[aria-label="Insights del mapa de calor"] li')).not.toBeNull();
  expect(section.querySelector('section[aria-label="Por clasificación"] tbody tr')).not.toBeNull();
  expect(section.querySelectorAll('section[aria-label="Kioscos por día de la semana"] tbody tr')).toHaveLength(2);
  expect(section.querySelectorAll('section[aria-label="Kioscos por día"] tbody tr')).toHaveLength(2);
  expect(section.textContent).toContain("ahora: todos los kioscos");
});

test("kioskos: si /dashboard/kiosks falla, el mapa de calor sigue en su lugar con sus matrices (sin calendario)", async () => {
  svc.getSalesKiosks.mockRejectedValue(new Error("boom"));
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  expect(container.textContent).toContain("boom");
  expect(container.textContent).toContain("Mapa de calor de kioscos");
  expect(container.querySelector('section[aria-label="Insights del mapa de calor"]')).not.toBeNull();
  expect(container.querySelector('section[aria-label="Kioscos por día de la semana"]')).not.toBeNull();
  expect(container.querySelector('section[aria-label="Kioscos por día"]')).not.toBeNull();
  // el calendario necesita la serie diaria de /dashboard/kiosks
  expect(container.querySelector(".sdash-heat")).toBeNull();
  expect(container.textContent).not.toContain("Últimas ventas");
  expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(1);
});

test("kioskos: el mapa de calor no se desmonta cuando /dashboard/kiosks falla al recargar y conserva el filtro elegido", async () => {
  svc.getSalesKiosks.mockResolvedValueOnce(kioskDetail());
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  const section = container.querySelector("#sdash-kheat-title").closest("section");
  await click(buttonByText(section, "A"));
  expect([...section.querySelectorAll('section[aria-label="Kioscos por día de la semana"] tbody th')].map((th) => th.textContent)).toEqual(["Kiosko Centro"]);

  // 'Actualizar' recarga las dos consultas; /dashboard/kiosks falla y la pestaña pasa a mostrar el error
  svc.getSalesKiosks.mockRejectedValue(new Error("boom"));
  await click(buttonByText(container, "Actualizar"));
  expect(container.textContent).toContain("boom");
  expect(container.textContent).not.toContain("Últimas ventas");
  // el mismo nodo del mapa de calor sigue ahí, con su filtro y sus datos
  expect(container.querySelector("#sdash-kheat-title").closest("section")).toBe(section);
  expect(buttonByText(section, "A").getAttribute("aria-pressed")).toBe("true");
  expect([...section.querySelectorAll('section[aria-label="Kioscos por día de la semana"] tbody th')].map((th) => th.textContent)).toEqual(["Kiosko Centro"]);
});

test("kioskos: si el kiosko elegido no vendió, el mapa de calor sigue comparando a todos los kioscos", async () => {
  svc.getSalesKiosks.mockResolvedValue(
    kioskDetail({ kpis: kioskKpis({ totalAmount: 0, salesCount: 0, historicalAmount: 0, productAmount: 0, packagingAmount: 0 }) })
  );
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30&siteId=5");
  expect(container.textContent).toContain("El kiosko seleccionado no tiene ventas en este periodo.");
  expect(container.textContent).toContain("Mapa de calor de kioscos");
  expect(container.querySelectorAll('section[aria-label="Kioscos por día de la semana"] tbody tr')).toHaveLength(2);
  expect(container.querySelector(".sdash-heat")).toBeNull();
  expect(svc.getKioskHeatmap.mock.calls[0][0].siteId).toBeUndefined();
});

test("kioskos: el calendario sigue al selector de kiosko, pero las matrices y los insights no se vuelven a consultar", async () => {
  svc.getSalesKiosks.mockResolvedValue(kioskDetail());
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  const section = () => container.querySelector("#sdash-kheat-title").closest("section");
  expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(1);
  expect(section().textContent).toContain("ahora: todos los kioscos");

  await setValue(container.querySelector("#sdash-kiosk"), "5", "change");
  const kioskCalls = svc.getSalesKiosks.mock.calls;
  expect(kioskCalls[kioskCalls.length - 1][0].siteId).toBe("5");
  expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(1);
  expect(section().textContent).toContain("ahora: Plaza Antigua");
  // las matrices siguen mostrando los dos kioscos
  expect(section().querySelectorAll('section[aria-label="Kioscos por día de la semana"] tbody tr')).toHaveLength(2);
});

test("kioskos: Actualizar y el cambio de rango vuelven a consultar el mapa de calor", async () => {
  svc.getSalesKiosks.mockResolvedValue(kioskDetail());
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  const calls = svc.getKioskHeatmap.mock.calls;
  const last = () => calls[calls.length - 1][0];
  expect(calls).toHaveLength(1);
  await click(buttonByText(container, "Actualizar"));
  expect(calls).toHaveLength(2);
  expect(last().refresh).toBe(true);
  expect(last()).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30" });
  await click(buttonByText(container, "7 días"));
  expect(calls).toHaveLength(3);
  expect(last()).toMatchObject({ startDate: "2026-10-02", endDate: "2026-10-08", refresh: false });
});

test("kioskos: si el mapa de calor falla, solo esa sección muestra el error (con reintento) y el resto de la pestaña sigue", async () => {
  svc.getSalesKiosks.mockResolvedValue(kioskDetail());
  svc.getKioskHeatmap.mockRejectedValueOnce(new Error("sin conexión con finanzas"));
  const { container } = await renderAt("/?tab=kioskos&startDate=2026-09-01&endDate=2026-09-30");
  const section = container.querySelector("#sdash-kheat-title").closest("section");
  expect(section.textContent).toContain("sin conexión con finanzas");
  expect(section.querySelector('section[aria-label="Kioscos por día de la semana"]')).toBeNull();
  // el calendario (de /dashboard/kiosks) y la pestaña no se afectan
  expect(section.querySelector(".sdash-heat")).not.toBeNull();
  expect(container.textContent).toContain("Ranking por kiosko");
  expect(container.textContent).toContain("Últimas ventas");
  await click(buttonByText(section, "Reintentar"));
  expect(svc.getKioskHeatmap).toHaveBeenCalledTimes(2);
  expect(section.querySelectorAll('section[aria-label="Kioscos por día de la semana"] tbody tr')).toHaveLength(2);
});

test("online: el mapa de calor conserva la rampa ámbar; la paleta de Kioskos solo aplica en Kioskos", async () => {
  svc.getSalesOnline.mockResolvedValue(
    detail("ONLINE", {
      breakdowns: { bySeller: bd("1", "Vendedora 1"), bySocialNetwork: bd("ig", "Instagram"), byPaymentMethod: bd("t", "Tarjeta"), byStatus: bd("e", "Entregado") },
    })
  );
  const { container } = await renderAt("/?tab=online&startDate=2026-09-01&endDate=2026-09-30");
  const heat = container.querySelector(".sdash-heat");
  expect(heat).not.toBeNull();
  expect(heat.classList.contains("sdash-heat--kiosk")).toBe(false);
  expect(container.querySelector(".sdash-heat--kiosk")).toBeNull();
  expect(heat.querySelector(".sdash-badge--heat").textContent).toContain("Mediana del mes");
  expect(heat.textContent).toContain("venta online por día (Q)");
  expect(heat.textContent).toContain("Es el mismo criterio del módulo de Finanzas kioscos, aplicado a las ventas online.");
  // Online no consulta ni muestra el mapa de calor de kioscos
  expect(svc.getKioskHeatmap).not.toHaveBeenCalled();
  expect(container.textContent).not.toContain("Mapa de calor de kioscos");
});

test("online con mapa de calor", async () => {
  svc.getSalesOnline.mockResolvedValue(
    detail("ONLINE", {
      breakdowns: { bySeller: bd("1", "Vendedora 1"), bySocialNetwork: bd("ig", "Instagram"), byPaymentMethod: bd("t", "Tarjeta"), byStatus: bd("e", "Entregado") },
    })
  );
  const { container } = await renderAt("/?tab=online&startDate=2026-09-01&endDate=2026-09-30");
  const text = container.textContent;
  expect(text).toContain("Mapa de calor por día");
  expect(text).toContain("Mediana del mes");
  expect(text).toContain("Detalle diario");
  expect(text).toContain("Promedio por día de la semana");
  expect(text).toContain("Vendedora 1");
  expect(container.querySelectorAll(".sdash-cd").length).toBeGreaterThanOrEqual(30);
  expect(container.querySelectorAll(".sdash-cd--best").length).toBe(1);
});

test("online: 'Publicidad vs ventas' va entre el mapa de calor y las listas y consulta su propio endpoint", async () => {
  svc.getSalesOnline.mockResolvedValue(
    detail("ONLINE", {
      breakdowns: { bySeller: bd("1", "Vendedora 1"), bySocialNetwork: bd("ig", "Instagram"), byPaymentMethod: bd("t", "Tarjeta"), byStatus: bd("e", "Entregado") },
    })
  );
  const { container } = await renderAt("/?tab=online&startDate=2026-09-01&endDate=2026-09-30");
  const text = container.textContent;
  expect(text).toContain("Publicidad vs ventas");
  expect(text).toContain("Detalle diario de publicidad");
  expect(text).toContain("29 días sin inversión capturada no entran al resultado.");
  expect(text.indexOf("Mapa de calor por día")).toBeLessThan(text.indexOf("Publicidad vs ventas"));
  expect(text.indexOf("Publicidad vs ventas")).toBeLessThan(text.indexOf("Por vendedora"));
  expect(svc2.getAdSpendReport.mock.calls[0][0]).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30" });
  // sin permiso de edición: solo lectura
  expect(container.querySelector("#sdash-ad-qdate")).toBeNull();
  expect(container.querySelector("tbody input")).toBeNull();
});

test("online: si /dashboard/online falla o viene vacío, 'Publicidad vs ventas' sigue disponible", async () => {
  svc.getSalesOnline.mockRejectedValue(new Error("boom"));
  let r = await renderAt("/?tab=online&startDate=2026-09-01&endDate=2026-09-30");
  expect(r.container.textContent).toContain("boom");
  expect(r.container.textContent).toContain("Publicidad vs ventas");
  expect(r.container.textContent).toContain("Detalle diario de publicidad");
  svc.getSalesOnline.mockResolvedValue(detail("ONLINE", { kpis: { ...kpis(0), salesCount: 0, totalAmount: 0 } }));
  r = await renderAt("/?tab=online&startDate=2026-09-01&endDate=2026-09-30");
  expect(r.container.textContent).toContain("Sin ventas en el periodo");
  expect(r.container.textContent).toContain("Detalle diario de publicidad");
});

test("vendedor", async () => {
  svc.getSalesVendor.mockResolvedValue(
    detail("VENDOR", { breakdowns: { byCustomer: bd("c", "Cliente 1"), byOrderType: [{ key: "OPV", label: "OPV Fossiles", count: 5, amount: 70, sharePercent: 70 }, { key: "OPC", label: "OPC marcas y cinchos", count: 2, amount: 30, sharePercent: 30 }], byStatus: bd("s", "Completada") } })
  );
  const { container } = await renderAt("/?tab=vendedor&startDate=2026-09-01&endDate=2026-09-30");
  const text = container.textContent;
  expect(text).toContain("Promedio por orden");
  expect(text).toContain("Ventas por semana");
  expect(text).toContain("OPV Fossiles");
  expect(text).toContain("Abrir envíos OPV");
});

test("error con reintento y vacío", async () => {
  svc.getSalesOnline.mockRejectedValue(new Error("boom"));
  let r = await renderAt("/?tab=online");
  expect(r.container.textContent).toContain("boom");
  expect(r.container.textContent).toContain("Reintentar");
  svc.getSalesOnline.mockResolvedValue(detail("ONLINE", { kpis: { ...kpis(0), salesCount: 0, totalAmount: 0 } }));
  r = await renderAt("/?tab=online");
  expect(r.container.textContent).toContain("Sin ventas en el periodo");
});

test("atajos de fecha y Actualizar consultan de nuevo; Actualizar viaja con refresh=true", async () => {
  svc.getSalesOnline.mockClear();
  svc.getSalesOnline.mockResolvedValue(detail("ONLINE", { breakdowns: {} }));
  const { container } = await renderAt("/?tab=online&startDate=2026-09-01&endDate=2026-09-30");
  const click = async (label) => {
    const button = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  };
  const calls = svc.getSalesOnline.mock.calls;
  expect(calls[0][0]).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-30", refresh: false });
  await click("Hoy");
  const last = () => calls[calls.length - 1][0];
  expect(last().startDate).toBe(last().endDate);
  expect(last().refresh).toBe(false);
  await click("Actualizar");
  expect(last().refresh).toBe(true);
  await click("Actualizar");
  expect(last().refresh).toBe(true);
});

/** Pestaña Online (la más simple) con helpers para los selectores de mes y año. Hoy = 2026-10-08. */
const monthYearHarness = async (url) => {
  svc.getSalesOnline.mockResolvedValue(detail("ONLINE", { breakdowns: {} }));
  const { container } = await renderAt(url);
  const calls = svc.getSalesOnline.mock.calls;
  const h = {
    container,
    calls,
    month: container.querySelector("#sdash-month"),
    year: container.querySelector("#sdash-year"),
    start: container.querySelector("#sdash-start"),
    end: container.querySelector("#sdash-end"),
    step: (label) => container.querySelector(`button[aria-label="${label}"]`),
    lastRange: () => ({ startDate: calls[calls.length - 1][0].startDate, endDate: calls[calls.length - 1][0].endDate }),
    shown: () => [h.month.value, h.year.value],
    disabledMonths: () => [...h.month.options].filter((o) => o.value && o.disabled).map((o) => o.value),
  };
  return h;
};

test("selectores de mes y año: dos selects con etiqueta (Mes: Enero…Diciembre, Año: del actual a 2023), sin la lista combinada", async () => {
  const h = await monthYearHarness("/?tab=online&startDate=2026-03-01&endDate=2026-03-31");
  const { container, month, year } = h;

  // etiquetas reales ligadas a cada select y un solo grupo accesible
  expect(container.querySelector('label[for="sdash-month"]').textContent).toBe("Mes");
  expect(container.querySelector('label[for="sdash-year"]').textContent).toBe("Año");
  expect(month.tagName).toBe("SELECT");
  expect(year.tagName).toBe("SELECT");
  expect(container.querySelector('[role="group"][aria-label="Selector de mes y año"]')).not.toBeNull();

  // Mes: 'Personalizado' (deshabilitado mientras el rango es un mes completo) + los 12 meses, sin el año en la etiqueta
  expect([...month.options].map((o) => o.value)).toEqual(["", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"]);
  expect([...month.options].map((o) => o.textContent)).toEqual([
    "Personalizado", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
  ]);
  expect(month.options[0].disabled).toBe(true);
  expect([...month.options].some((o) => /\d{4}/.test(o.textContent))).toBe(false);
  // hoy es 8/10/2026: noviembre y diciembre del año en curso no se pueden elegir
  expect(h.disabledMonths()).toEqual(["11", "12"]);

  // Año: del año en curso a 2023, el más reciente primero, sin años futuros
  expect([...year.options].map((o) => o.textContent)).toEqual(["2026", "2025", "2024", "2023"]);
  expect([...year.options].some((o) => o.disabled)).toBe(false);

  // estado inicial: marzo 2026 completo; los botones ◀ ▶ conservan su aria-label y siguen habilitados
  expect(h.shown()).toEqual(["03", "2026"]);
  expect(h.step("Mes anterior").disabled).toBe(false);
  expect(h.step("Mes siguiente").disabled).toBe(false);
  expect(h.step("Mes anterior").getAttribute("title")).toBe("Mes anterior");
  // Desde / Hasta y los atajos siguen ahí
  expect(container.querySelector('label[for="sdash-start"]').textContent).toBe("Desde");
  expect(container.querySelector('label[for="sdash-end"]').textContent).toBe("Hasta");
  ["Hoy", "7 días", "Mes", "Mes anterior", "Actualizar"].forEach((label) => {
    expect(buttonByText(container, label)).toBeTruthy();
  });
});

test("selectores de mes y año: elegir mes o año fija el mes calendario completo (con acotado al mes en curso)", async () => {
  const h = await monthYearHarness("/?tab=online&startDate=2026-03-01&endDate=2026-03-31");
  const { month, year, start, end } = h;

  // elegir un mes fija Desde = día 1 y Hasta = último día (febrero de 2026 no es bisiesto)
  await setValue(month, "02", "change");
  expect(h.lastRange()).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  expect(start.value).toBe("2026-02-01");
  expect(end.value).toBe("2026-02-28");
  expect(h.shown()).toEqual(["02", "2026"]);

  // elegir un año conserva el mes: febrero de 2024 es bisiesto
  await setValue(year, "2024", "change");
  expect(h.lastRange()).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" });
  expect(end.value).toBe("2024-02-29");
  expect(h.shown()).toEqual(["02", "2024"]);
  // en un año pasado todos los meses están disponibles
  expect(h.disabledMonths()).toEqual([]);

  // diciembre de 2024 -> año 2026: aún no existe diciembre de 2026 -> mes en curso (octubre) hasta hoy
  await setValue(month, "12", "change");
  expect(h.lastRange()).toEqual({ startDate: "2024-12-01", endDate: "2024-12-31" });
  await setValue(year, "2026", "change");
  expect(h.lastRange()).toEqual({ startDate: "2026-10-01", endDate: "2026-10-08" });
  expect(h.shown()).toEqual(["10", "2026"]);
  expect(h.disabledMonths()).toEqual(["11", "12"]);
  expect(h.step("Mes siguiente").disabled).toBe(true);

  // el mes en curso (octubre) llega hasta hoy; un mes pasado del año en curso es completo
  await setValue(month, "09", "change");
  expect(h.lastRange()).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
  await setValue(month, "10", "change");
  expect(h.lastRange()).toEqual({ startDate: "2026-10-01", endDate: "2026-10-08" });
  expect(h.shown()).toEqual(["10", "2026"]);

  // ◀ / ▶ cruzan el año y el selector de año los sigue
  await setValue(month, "01", "change");
  expect(h.lastRange()).toEqual({ startDate: "2026-01-01", endDate: "2026-01-31" });
  await click(h.step("Mes anterior"));
  expect(h.lastRange()).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  expect(h.shown()).toEqual(["12", "2025"]);
  await click(h.step("Mes siguiente"));
  expect(h.lastRange()).toEqual({ startDate: "2026-01-01", endDate: "2026-01-31" });
  expect(h.shown()).toEqual(["01", "2026"]);
});

test("selectores de mes y año: un rango personalizado muestra 'Personalizado' y el año de Desde; elegir año o mes lo vuelve un mes completo", async () => {
  const h = await monthYearHarness("/?tab=online&startDate=2026-01-01&endDate=2026-01-31");
  const { month, year, start, end } = h;
  expect(h.shown()).toEqual(["01", "2026"]);

  // una fecha a medio teclear no consulta ni cambia los selectores
  const callsBefore = h.calls.length;
  await setValue(end, "0002-01-31", "input");
  expect(h.calls.length).toBe(callsBefore);
  expect(h.shown()).toEqual(["01", "2026"]);

  // un rango que ya no es un mes completo pasa a 'Personalizado' (se activa solo) y se puede seguir tecleando
  await setValue(end, "2026-01-20", "input");
  expect(h.lastRange()).toEqual({ startDate: "2026-01-01", endDate: "2026-01-20" });
  expect(h.shown()).toEqual(["", "2026"]);
  expect(month.options[0].disabled).toBe(false);

  // ◀ desde un rango personalizado parte del mes de Desde
  await click(h.step("Mes anterior"));
  expect(h.lastRange()).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  expect(h.shown()).toEqual(["12", "2025"]);

  // elegir un año desde 'Personalizado' usa el mes de Desde (enero) en ese año, completo
  await setValue(end, "2025-12-20", "input");
  expect(h.shown()).toEqual(["", "2025"]);
  await setValue(start, "2025-01-10", "input");
  expect(h.lastRange()).toEqual({ startDate: "2025-01-10", endDate: "2025-12-20" });
  expect(h.shown()).toEqual(["", "2025"]);
  await setValue(year, "2024", "change");
  expect(h.lastRange()).toEqual({ startDate: "2024-01-01", endDate: "2024-01-31" });
  expect(h.shown()).toEqual(["01", "2024"]);
  expect(month.options[0].disabled).toBe(true);

  // un rango de varios años: Mes = Personalizado y Año = año de Desde
  await setValue(start, "2024-12-15", "input");
  await setValue(end, "2025-01-10", "input");
  expect(h.lastRange()).toEqual({ startDate: "2024-12-15", endDate: "2025-01-10" });
  expect(h.shown()).toEqual(["", "2024"]);
  expect(start.value).toBe("2024-12-15");
  // elegir un mes desde 'Personalizado' usa el año de Desde: marzo de 2024 completo
  await setValue(month, "03", "change");
  expect(h.lastRange()).toEqual({ startDate: "2024-03-01", endDate: "2024-03-31" });
  expect(h.shown()).toEqual(["03", "2024"]);

  // personalizado con Desde en diciembre y año en curso: no hay diciembre de 2026 -> mes en curso
  await setValue(start, "2024-12-15", "input");
  await setValue(year, "2026", "change");
  expect(h.lastRange()).toEqual({ startDate: "2026-10-01", endDate: "2026-10-08" });
  expect(h.shown()).toEqual(["10", "2026"]);
});

test("selectores de mes y año: los atajos y 'Actualizar' siguen funcionando y los selectores reflejan el rango", async () => {
  const h = await monthYearHarness("/?tab=online&startDate=2026-03-01&endDate=2026-03-31");
  const last = () => h.calls[h.calls.length - 1][0];

  await click(buttonByText(h.container, "Mes anterior"));
  expect(h.lastRange()).toEqual({ startDate: "2026-09-01", endDate: "2026-09-30" });
  expect(h.shown()).toEqual(["09", "2026"]);
  await click(buttonByText(h.container, "Mes"));
  expect(h.lastRange()).toEqual({ startDate: "2026-10-01", endDate: "2026-10-08" });
  expect(h.shown()).toEqual(["10", "2026"]);
  expect(h.step("Mes siguiente").disabled).toBe(true);
  await click(buttonByText(h.container, "7 días"));
  expect(h.lastRange()).toEqual({ startDate: "2026-10-02", endDate: "2026-10-08" });
  expect(h.shown()).toEqual(["", "2026"]);
  await click(buttonByText(h.container, "Hoy"));
  expect(h.lastRange()).toEqual({ startDate: "2026-10-08", endDate: "2026-10-08" });
  expect(h.shown()).toEqual(["", "2026"]);
  expect(last().refresh).toBe(false);
  await click(buttonByText(h.container, "Actualizar"));
  expect(last().refresh).toBe(true);
  // 'Actualizar' no cambia el rango ni los selectores
  expect(h.lastRange()).toEqual({ startDate: "2026-10-08", endDate: "2026-10-08" });
  expect(h.shown()).toEqual(["", "2026"]);
});

test("selectores de mes y año: un año fuera de la lista (enlace viejo, ◀ antes de 2023) se muestra tal cual, sin poder elegirse", async () => {
  const h = await monthYearHarness("/?tab=online&startDate=2022-05-01&endDate=2022-05-31");
  const { month, year } = h;
  expect([...year.options].map((o) => o.value)).toEqual(["2026", "2025", "2024", "2023", "2022"]);
  expect(year.value).toBe("2022");
  expect(year.options[4].disabled).toBe(true);
  expect(month.value).toBe("05");

  // elegir un año de la lista conserva el mes y el año extra desaparece
  await setValue(year, "2025", "change");
  expect(h.lastRange()).toEqual({ startDate: "2025-05-01", endDate: "2025-05-31" });
  expect([...year.options].map((o) => o.value)).toEqual(["2026", "2025", "2024", "2023"]);

  // ◀ desde enero de 2023 llega a diciembre de 2022: el selector sigue mostrando el año real
  await setValue(year, "2023", "change");
  await setValue(month, "01", "change");
  expect(h.lastRange()).toEqual({ startDate: "2023-01-01", endDate: "2023-01-31" });
  await click(h.step("Mes anterior"));
  expect(h.lastRange()).toEqual({ startDate: "2022-12-01", endDate: "2022-12-31" });
  expect(h.shown()).toEqual(["12", "2022"]);
  expect([...year.options].map((o) => o.value)).toEqual(["2026", "2025", "2024", "2023", "2022"]);
});

test("selectores de mes y año: sin fechas en la URL abre en el mes en curso (octubre 2026 hasta hoy)", async () => {
  const h = await monthYearHarness("/?tab=online");
  expect(h.lastRange()).toEqual({ startDate: "2026-10-01", endDate: "2026-10-08" });
  expect(h.shown()).toEqual(["10", "2026"]);
  expect(h.step("Mes siguiente").disabled).toBe(true);
  expect(h.step("Mes anterior").disabled).toBe(false);
});

