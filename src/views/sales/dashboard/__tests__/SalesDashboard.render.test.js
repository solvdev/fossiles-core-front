/**
 * Prueba de render del dashboard con respuestas simuladas según docs/SALES-DASHBOARD-CONTRACT.md
 * (servicios y gráficos simulados: no hay backend ni canvas en jsdom).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
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
jest.mock("services/salesDashboardService", () => ({
  getSalesConsolidated: jest.fn(),
  getSalesKiosks: jest.fn(),
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
  totalAmount: t, productAmount: t * 0.9, packagingAmount: t * 0.06, shippingAmount: t * 0.04,
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

const renderAt = async (url) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <SalesDashboard />
      </MemoryRouter>
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return { container, root };
};

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  // CRA resetea los mocks entre pruebas: el reporte de publicidad responde siempre algo válido
  svc2.getAdSpendReport.mockResolvedValue(adSpendReport);
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
});

test("kioskos", async () => {
  svc.getSalesKiosks.mockResolvedValue(
    detail("KIOSKO", {
      kioskOptions: [{ kioskId: 3, kioskCode: "K3", kioskName: "Kiosko 3" }],
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

test("selector de mes: elige, avanza/retrocede y pasa a 'Personalizado' al teclear fechas", async () => {
  svc.getSalesOnline.mockClear();
  svc.getSalesOnline.mockResolvedValue(detail("ONLINE", { breakdowns: {} }));
  const { container } = await renderAt("/?tab=online&startDate=2026-03-01&endDate=2026-03-31");
  const select = container.querySelector("#sdash-month");
  const start = container.querySelector("#sdash-start");
  const end = container.querySelector("#sdash-end");
  const stepButton = (label) => container.querySelector(`button[aria-label="${label}"]`);
  const settle = () =>
    act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  const setValue = async (element, value, eventName) => {
    // React sigue el valor con un descriptor propio: se asigna con el setter nativo para que detecte el cambio
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
  const calls = svc.getSalesOnline.mock.calls;
  const lastRange = () => ({ startDate: calls[calls.length - 1][0].startDate, endDate: calls[calls.length - 1][0].endDate });

  // etiquetado y estado inicial: marzo 2026 completo
  expect(container.querySelector('label[for="sdash-month"]').textContent).toBe("Mes");
  expect(select.value).toBe("2026-03");
  expect(select.options[0].value).toBe("");
  expect(select.options[0].textContent).toBe("Personalizado");
  expect(select.options[0].disabled).toBe(true);
  expect([...select.options].find((o) => o.value === "2026-03").textContent).toBe("Marzo 2026");
  expect(stepButton("Mes anterior").disabled).toBe(false);
  expect(stepButton("Mes siguiente").disabled).toBe(false);

  // elegir un mes fija Desde = día 1 y Hasta = último día (febrero de 2026 no es bisiesto)
  await setValue(select, "2026-02", "change");
  expect(lastRange()).toEqual({ startDate: "2026-02-01", endDate: "2026-02-28" });
  expect(start.value).toBe("2026-02-01");
  expect(end.value).toBe("2026-02-28");
  expect(select.value).toBe("2026-02");

  // ◀ / ▶ cruzan el año
  await click(stepButton("Mes anterior"));
  expect(lastRange()).toEqual({ startDate: "2026-01-01", endDate: "2026-01-31" });
  await click(stepButton("Mes anterior"));
  expect(lastRange()).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  await click(stepButton("Mes siguiente"));
  expect(lastRange()).toEqual({ startDate: "2026-01-01", endDate: "2026-01-31" });

  // una fecha a medio teclear no consulta ni cambia el selector
  const callsBefore = calls.length;
  await setValue(end, "0002-01-31", "input");
  expect(calls.length).toBe(callsBefore);
  expect(select.value).toBe("2026-01");

  // un rango que ya no es un mes completo pasa a 'Personalizado' y se puede seguir tecleando
  await setValue(end, "2026-01-20", "input");
  expect(lastRange()).toEqual({ startDate: "2026-01-01", endDate: "2026-01-20" });
  expect(select.value).toBe("");
  expect(select.options[0].disabled).toBe(false);

  // desde un rango personalizado ◀ parte del mes de Desde
  await click(stepButton("Mes anterior"));
  expect(lastRange()).toEqual({ startDate: "2025-12-01", endDate: "2025-12-31" });
  expect(select.value).toBe("2025-12");

  // los atajos siguen funcionando y el selector refleja el mes que coincide
  await click([...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Mes anterior"));
  const prevMonth = lastRange();
  expect(prevMonth.startDate.endsWith("-01")).toBe(true);
  expect(select.value).toBe(prevMonth.startDate.slice(0, 7));
  await click([...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Mes"));
  expect(select.value).toBe(lastRange().startDate.slice(0, 7));
  expect(stepButton("Mes siguiente").disabled).toBe(true);
});
