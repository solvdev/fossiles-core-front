/**
 * Prueba de render del dashboard con respuestas simuladas según docs/SALES-DASHBOARD-CONTRACT.md
 * (servicios y gráficos simulados: no hay backend ni canvas en jsdom).
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import * as svc from "services/salesDashboardService";
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
