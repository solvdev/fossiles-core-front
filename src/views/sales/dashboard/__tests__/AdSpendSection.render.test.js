/**
 * Prueba de render de 'Publicidad vs ventas' con respuestas simuladas según docs/SALES-DASHBOARD-CONTRACT.md
 * (addendum). Servicios, gráficos y avisos simulados: no hay backend ni canvas en jsdom.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import * as svc from "services/onlineAdSpendService";
import { showError, showSuccess } from "utils/notificationHelper";
import AdSpendSection from "views/sales/dashboard/AdSpendSection";
import { deriveDay } from "views/sales/dashboard/adSpendHelpers";
import { exportAdSpendExcel } from "views/sales/dashboard/adSpendExport";

jest.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
}));
let mockCanEdit = false;
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (code) => mockCanEdit && code === "VENTAS.VENTAS_ONLINE.EDITAR", initialized: true }),
}));
jest.mock("utils/dateTimeHelper", () => ({
  ...jest.requireActual("utils/dateTimeHelper"),
  getTodayYmdGuatemala: () => "2026-10-07",
}));
jest.mock("utils/notificationHelper", () => ({ showSuccess: jest.fn(), showError: jest.fn() }));
jest.mock("services/onlineAdSpendService", () => ({
  getAdSpendReport: jest.fn(),
  saveAdSpend: jest.fn(),
  bulkSaveAdSpend: jest.fn(),
  deleteAdSpend: jest.fn(),
}));
jest.mock("views/sales/dashboard/adSpendExport", () => ({ exportAdSpendExcel: jest.fn() }));

const mkDay = (date, salesAmount, adSpend, notes = null) => ({
  date,
  salesAmount,
  ordersCount: 2,
  ...deriveDay(salesAmount, adSpend),
  notes,
});

const reportFixture = () => ({
  startDate: "2026-09-01",
  endDate: "2026-09-05",
  totals: {
    salesAmount: 5900,
    ordersCount: 10,
    comparableSales: 4700,
    adSpend: 2600,
    netResult: 2100,
    roas: 1.8077,
    daysWithSpend: 4,
    daysNoSpend: 1,
    daysWin: 2,
    daysLoss: 1,
    daysEven: 1,
  },
  days: [
    mkDay("2026-09-01", 3000, 1000),
    mkDay("2026-09-02", 400, 900),
    mkDay("2026-09-03", 500, 500),
    mkDay("2026-09-04", 1200, null),
    mkDay("2026-09-05", 800, 200, "Meta ads"),
  ],
});

const flush = async (ms = 20) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

const mounted = [];
const renderSection = async (props = {}) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const all = { startDate: "2026-09-01", endDate: "2026-09-05", refreshToken: 0, ...props };
  await act(async () => {
    root.render(<AdSpendSection {...all} />);
  });
  await flush();
  mounted.push({ root, container });
  return { container, root, rerender: (next) => act(async () => root.render(<AdSpendSection {...all} {...next} />)) };
};

const setInput = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const click = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};
const button = (container, label) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const amountInput = (container, date) => container.querySelector(`#sdash-ad-amount-${date}`);

beforeAll(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  mockCanEdit = false;
  jest.clearAllMocks();
  svc.getAdSpendReport.mockImplementation(() => Promise.resolve(reportFixture()));
  svc.bulkSaveAdSpend.mockResolvedValue({ saved: 1, deleted: 0 });
  svc.saveAdSpend.mockResolvedValue({});
  // CRA resetea las implementaciones de los mocks antes de cada prueba (resetMocks: true)
  exportAdSpendExcel.mockReturnValue("publicidad.xlsx");
});
afterEach(async () => {
  while (mounted.length) {
    const { root, container } = mounted.pop();
    // eslint-disable-next-line no-await-in-loop
    await act(async () => root.unmount());
    container.remove();
  }
});

test("solo lectura: KPIs, aviso de días sin captura, gráfico y tabla sin campos editables", async () => {
  const { container } = await renderSection();
  const text = container.textContent;
  expect(svc.getAdSpendReport.mock.calls[0][0]).toMatchObject({ startDate: "2026-09-01", endDate: "2026-09-05" });
  expect(text).toContain("Publicidad vs ventas");
  expect(text).toContain("No incluye el costo de producción");
  expect(text).toContain("Inversión en publicidad");
  expect(text).toContain("Q 2,600.00");
  expect(text).toContain("Venta de esos días");
  expect(text).toContain("Q 4,700.00");
  expect(text).toContain("+Q 2,100.00");
  expect(text).toContain("Ganancia");
  expect(text).toContain("ROAS");
  expect(text).toContain("Q 1.81");
  expect(text).toContain("vendidos por cada Q1 invertido");
  expect(text).toContain("Días en ganancia vs pérdida");
  expect(text).toContain("1 día sin inversión capturada no entra al resultado.");
  expect(text).toContain("Solo lectura");
  expect(container.querySelector('[data-testid="bar"]')).not.toBeNull();
  expect(container.querySelector('.kfin-chart[role="img"]').getAttribute("aria-label")).toMatch(/2 días en ganancia, 1 día en pérdida/);
  expect(container.querySelectorAll("tbody tr")).toHaveLength(5);
  expect(container.querySelector("tbody input")).toBeNull();
  expect(container.querySelector("#sdash-ad-qdate")).toBeNull();
  expect(container.querySelector("caption").textContent).toContain("Detalle diario");
  // pérdida con flecha y texto, no solo color
  const lossRow = container.querySelectorAll("tbody tr")[1];
  expect(lossRow.textContent).toContain("▼");
  expect(lossRow.textContent).toContain("Pérdida");
  expect(lossRow.querySelector(".sdash-ad-res--bad")).not.toBeNull();
  expect(container.querySelectorAll("tbody tr")[3].textContent).toContain("Sin inversión capturada");
});

test("con permiso de edición: captura por fila y guarda solo lo que cambió (bulk)", async () => {
  mockCanEdit = true;
  const onDirtyChange = jest.fn();
  const { container } = await renderSection({ onDirtyChange });
  const input = amountInput(container, "2026-09-04");
  expect(input.getAttribute("aria-label")).toBe("Inversión del 4 de septiembre");
  expect(amountInput(container, "2026-09-01").value).toBe("1000.00");
  expect(button(container, "Guardar cambios").disabled).toBe(true);
  expect(container.textContent).toContain("Sin cambios pendientes");

  await setInput(input, "Q 300");
  await setInput(amountInput(container, "2026-09-02"), ""); // borrar
  await setInput(amountInput(container, "2026-09-03"), "500"); // igual a lo guardado: no cuenta
  expect(container.textContent).toContain("2 cambios sin guardar");
  expect(container.textContent).toContain("Vista previa con los cambios sin guardar");
  expect(container.textContent).toContain("sin guardar"); // marca en la fila
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  // el resultado de la fila editada se recalcula (1,200 - 300 = +900)
  expect(container.querySelectorAll("tbody tr")[3].textContent).toContain("+Q 900.00");
  expect(button(container, "Exportar Excel").disabled).toBe(true);

  const save = button(container, "Guardar cambios");
  expect(save.disabled).toBe(false);
  const callsBefore = svc.getAdSpendReport.mock.calls.length;
  await click(save);
  await flush();
  expect(svc.bulkSaveAdSpend).toHaveBeenCalledTimes(1);
  expect(svc.bulkSaveAdSpend).toHaveBeenCalledWith([
    { date: "2026-09-02", amount: null },
    { date: "2026-09-04", amount: 300, notes: null },
  ]);
  expect(showSuccess).toHaveBeenCalled();
  expect(svc.getAdSpendReport.mock.calls.length).toBe(callsBefore + 1); // vuelve a consultar el reporte
  expect(container.textContent).toContain("Sin cambios pendientes");
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});

test("monto inválido: muestra el error, bloquea Guardar y Descartar restaura", async () => {
  mockCanEdit = true;
  const { container } = await renderSection();
  const input = amountInput(container, "2026-09-04");
  await setInput(input, "12.345");
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(container.textContent).toContain("Máximo 2 decimales.");
  expect(container.textContent).toContain("Corrige las filas con error");
  expect(button(container, "Guardar cambios").disabled).toBe(true);
  await setInput(input, "-5");
  expect(container.textContent).toContain("El monto no puede ser negativo.");

  await click(button(container, "Descartar cambios"));
  expect(amountInput(container, "2026-09-04").value).toBe("");
  expect(container.textContent).toContain("Sin cambios pendientes");
  expect(svc.bulkSaveAdSpend).not.toHaveBeenCalled();
});

test("las notas viajan con el monto y solo se habilitan con monto", async () => {
  mockCanEdit = true;
  const { container } = await renderSection();
  const notes = container.querySelector('input[aria-label="Nota de la inversión del 4 de septiembre"]');
  expect(notes.disabled).toBe(true);
  await setInput(amountInput(container, "2026-09-04"), "150");
  expect(notes.disabled).toBe(false);
  await setInput(notes, "Instagram");
  await click(button(container, "Guardar cambios"));
  await flush();
  expect(svc.bulkSaveAdSpend).toHaveBeenCalledWith([{ date: "2026-09-04", amount: 150, notes: "Instagram" }]);
});

test("si guardar falla muestra el mensaje del backend y conserva los cambios", async () => {
  mockCanEdit = true;
  svc.bulkSaveAdSpend.mockRejectedValue(new Error("La fecha 04/09/2026 no puede ser posterior a hoy."));
  const { container } = await renderSection();
  await setInput(amountInput(container, "2026-09-04"), "150");
  await click(button(container, "Guardar cambios"));
  await flush();
  expect(showError).toHaveBeenCalledWith("La fecha 04/09/2026 no puede ser posterior a hoy.");
  expect(container.querySelector('[role="alert"]').textContent).toContain("No se guardó nada");
  expect(amountInput(container, "2026-09-04").value).toBe("150");
  expect(container.textContent).toContain("1 cambio sin guardar");
});

test("captura rápida: valida, guarda con PUT y vuelve a consultar si la fecha está en el rango", async () => {
  mockCanEdit = true;
  const { container } = await renderSection();
  const date = container.querySelector("#sdash-ad-qdate");
  const amount = container.querySelector("#sdash-ad-qamount");
  expect(date.value).toBe("2026-10-07");
  expect(date.max).toBe("2026-10-07");
  expect(container.querySelector('label[for="sdash-ad-qdate"]').textContent).toBe("Fecha");
  expect(container.querySelector('label[for="sdash-ad-qamount"]').textContent).toBe("Monto (Q)");

  // monto vacío / fecha futura: no llama al servicio
  await click(button(container, "Guardar"));
  expect(container.textContent).toContain("Escribe el monto de la inversión.");
  await setInput(date, "2026-10-08");
  await setInput(amount, "800");
  await click(button(container, "Guardar"));
  expect(container.textContent).toContain("No se puede registrar inversión de una fecha futura.");
  expect(svc.saveAdSpend).not.toHaveBeenCalled();

  // fecha dentro del rango: guarda y recarga
  await setInput(date, "2026-09-04");
  expect(container.textContent).not.toContain("fuera del rango que estás viendo");
  const callsBefore = svc.getAdSpendReport.mock.calls.length;
  await click(button(container, "Guardar"));
  await flush();
  expect(svc.saveAdSpend).toHaveBeenCalledWith("2026-09-04", { amount: 800, notes: null });
  expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining("Q 800.00 del 4 de septiembre"));
  expect(svc.getAdSpendReport.mock.calls.length).toBe(callsBefore + 1);
  expect(container.querySelector("#sdash-ad-qamount").value).toBe("");

  // fecha fuera del rango: guarda, avisa y no recarga
  await setInput(container.querySelector("#sdash-ad-qdate"), "2026-08-20");
  expect(container.textContent).toContain("fuera del rango que estás viendo");
  await setInput(container.querySelector("#sdash-ad-qamount"), "1,250.50");
  const calls2 = svc.getAdSpendReport.mock.calls.length;
  await click(button(container, "Guardar"));
  await flush();
  expect(svc.saveAdSpend).toHaveBeenLastCalledWith("2026-08-20", { amount: 1250.5, notes: null });
  expect(container.querySelector('[role="status"]').textContent).toContain("no aparece en la tabla");
  expect(svc.getAdSpendReport.mock.calls.length).toBe(calls2);
});

test("error del reporte: reintento y la captura rápida sigue disponible", async () => {
  mockCanEdit = true;
  svc.getAdSpendReport.mockRejectedValueOnce(new Error("El rango no puede exceder 400 días."));
  const { container } = await renderSection();
  expect(container.textContent).toContain("El rango no puede exceder 400 días.");
  expect(container.textContent).toContain("Reintentar");
  expect(container.querySelector("#sdash-ad-qamount")).not.toBeNull();
  await click(button(container, "Reintentar"));
  await flush();
  expect(container.textContent).toContain("Q 2,600.00");
});

test("rango de más de 400 días: no consulta y explica el límite", async () => {
  const { container } = await renderSection({ startDate: "2025-01-01", endDate: "2026-09-30" });
  expect(svc.getAdSpendReport).not.toHaveBeenCalled();
  expect(container.textContent).toContain("máximo de 400 días");
});

test("cambiar el rango o pulsar Actualizar consulta de nuevo y conserva los borradores", async () => {
  mockCanEdit = true;
  const { container, rerender } = await renderSection();
  await setInput(amountInput(container, "2026-09-04"), "150");
  await rerender({ refreshToken: 1 });
  await flush();
  expect(svc.getAdSpendReport).toHaveBeenCalledTimes(2);
  expect(amountInput(container, "2026-09-04").value).toBe("150");
  await rerender({ endDate: "2026-09-10" });
  await flush();
  expect(svc.getAdSpendReport).toHaveBeenCalledTimes(3);
  expect(svc.getAdSpendReport.mock.calls[2][0]).toMatchObject({ endDate: "2026-09-10" });
});

test("exporta el reporte guardado a Excel", async () => {
  const { container } = await renderSection();
  await click(button(container, "Exportar Excel"));
  await flush();
  expect(exportAdSpendExcel).toHaveBeenCalledTimes(1);
  expect(exportAdSpendExcel.mock.calls[0][0].days).toHaveLength(5);
  expect(showSuccess).toHaveBeenCalledWith("Se descargó publicidad.xlsx.");
  expect(button(container, "Exportar PDF")).toBeDefined();
});

test("sin ninguna inversión capturada: el resultado queda sin dato", async () => {
  svc.getAdSpendReport.mockResolvedValue({
    startDate: "2026-09-01",
    endDate: "2026-09-02",
    totals: { salesAmount: 100, ordersCount: 2, comparableSales: 0, adSpend: 0, netResult: 0, roas: null, daysWithSpend: 0, daysNoSpend: 2, daysWin: 0, daysLoss: 0, daysEven: 0 },
    days: [mkDay("2026-09-01", 60, null), mkDay("2026-09-02", 40, null)],
  });
  const { container } = await renderSection({ endDate: "2026-09-02" });
  expect(container.textContent).toContain("2 días sin inversión capturada no entran al resultado.");
  expect(container.textContent).toContain("Sin inversión capturada");
  expect(container.textContent).toContain("Aún no hay inversión capturada");
});
