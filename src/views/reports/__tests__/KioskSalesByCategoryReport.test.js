import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as XLSX from "xlsx";
import KioskSalesByCategoryReport, {
  daysInCalendarMonth,
  formatUnits,
  monthToInclusiveRange,
} from "../KioskSalesByCategoryReport";
import { getKioskSalesByCategory } from "services/kioskSalesByCategoryService";
import { getLocations } from "services/locationService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError } from "utils/notificationHelper";

jest.mock("services/kioskSalesByCategoryService");
jest.mock("services/locationService");
jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));
jest.mock("xlsx", () => {
  const actual = jest.requireActual("xlsx");
  return { ...actual, writeFile: jest.fn() };
});

const kiosks = [
  { id: 1, name: "Kiosco Centro", code: "K1", categoria: "KIOSCO" },
  { id: 3, name: "Kiosco Norte", code: "K3", categoria: "KIOSCO" },
];

const mismatchedTotalsReport = {
  from: "2026-02-01",
  to: "2026-02-28",
  rows: [
    { categoryId: 10, categoryName: "Bolsos", units: 2, totalAmount: 10.0, totalAmountNoIva: 8.93 },
    { categoryId: 11, categoryName: "Billeteras", units: 2.5, totalAmount: 10.0, totalAmountNoIva: 8.93 },
    { categoryId: null, categoryName: null, units: -3, totalAmount: -50.0, totalAmountNoIva: -44.64 },
  ],
  totals: { units: 1.125, totalAmount: 20.01, totalAmountNoIva: 17.86 },
};

const generate = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Generar" }));
  });
};

const lastCall = () => getKioskSalesByCategory.mock.calls[getKioskSalesByCategory.mock.calls.length - 1][0];

const selectKiosk = async (label) => {
  const input = screen.getByLabelText("Kioscos");
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown", keyCode: 40, which: 40 });
  fireEvent.click(await screen.findByText(label, { selector: "div" }));
};

beforeEach(() => {
  jest.resetAllMocks();
  getLocations.mockResolvedValue(kiosks);
  getKioskSalesByCategory.mockResolvedValue(mismatchedTotalsReport);
});

afterEach(cleanup);

test("YYYY-MM a primer y último día sin Date local ni toISOString (feb y nov 2026)", () => {
  expect(daysInCalendarMonth(2026, 2)).toBe(28);
  expect(daysInCalendarMonth(2026, 11)).toBe(30);
  expect(monthToInclusiveRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  expect(monthToInclusiveRange("2026-11")).toEqual({ from: "2026-11-01", to: "2026-11-30" });
});

test("units muestra hasta 3 decimales sin ceros a la derecha", () => {
  expect(formatUnits(5)).toBe("5");
  expect(formatUnits(2.5)).toBe("2.5");
  expect(formatUnits(1.125)).toBe("1.125");
  expect(formatUnits(-3)).toBe("-3");
  expect(formatUnits(-2.5)).toBe("-2.5");
});

test("modo Mes envía primer y último día de 2026-02 y 2026-11", async () => {
  render(<KioskSalesByCategoryReport />);
  await screen.findByLabelText("Kioscos");

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-02" } });
  await generate();
  expect(lastCall()).toEqual({ from: "2026-02-01", to: "2026-02-28" });

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-11" } });
  await generate();
  expect(lastCall()).toEqual({ from: "2026-11-01", to: "2026-11-30" });
});

test("modo Rango envía las fechas tal como se escribieron", async () => {
  render(<KioskSalesByCategoryReport />);
  await screen.findByLabelText("Kioscos");

  fireEvent.click(screen.getByRole("button", { name: "Rango de fechas" }));
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-03-05" } });
  fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-03-12" } });
  await generate();

  expect(lastCall()).toEqual({ from: "2026-03-05", to: "2026-03-12" });
});

test("Todos los kioscos omite kioskIds; kioscos elegidos van en lista separada por comas", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-02" } });
  await generate();
  expect(lastCall()).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  expect(lastCall()).not.toHaveProperty("kioskIds");

  await selectKiosk("Kiosco Centro (K1)");
  await selectKiosk("Kiosco Norte (K3)");
  await generate();
  expect(lastCall().kioskIds).toBe("1,3");
});

test("la fila Total general usa totals del backend, no la suma de filas; filas negativas se muestran", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-02" } });
  await generate();

  expect(screen.getByText("Bolsos")).toBeInTheDocument();
  expect(screen.getByText("Billeteras")).toBeInTheDocument();
  expect(screen.getByText("Sin categoría")).toBeInTheDocument();
  expect(screen.getByText("Q -50.00")).toBeInTheDocument();
  expect(screen.getByText("-3")).toBeInTheDocument();
  expect(screen.getByText("2.5")).toBeInTheDocument();

  const totalRow = screen.getByText("Total general").closest("tr");
  expect(within(totalRow).getByText("1.125")).toBeInTheDocument();
  expect(within(totalRow).getByText("Q 20.01")).toBeInTheDocument();
  expect(within(totalRow).getByText("Q 17.86")).toBeInTheDocument();
  expect(within(totalRow).queryByText("Q 20.00")).not.toBeInTheDocument();
  expect(within(totalRow).queryByText("Q -30.00")).not.toBeInTheDocument();
});

test("un 400 muestra el mensaje del backend", async () => {
  getKioskSalesByCategory.mockRejectedValueOnce(new Error("El rango no puede superar 366 días"));
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await generate();

  expect(await screen.findByText("El rango no puede superar 366 días")).toBeInTheDocument();
  expect(showError).toHaveBeenCalledWith("El rango no puede superar 366 días");
});

test("un 403 muestra que no hay acceso al reporte", async () => {
  getKioskSalesByCategory.mockRejectedValueOnce(new Error("No tienes acceso a este reporte."));
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await generate();

  expect(await screen.findByText("No tienes acceso a este reporte.")).toBeInTheDocument();
  expect(showError).toHaveBeenCalledWith("No tienes acceso a este reporte.");
});

const TIMEZONES = ["America/Guatemala", "America/New_York", "UTC"];

const MONTH_BOUNDS = [
  { month: "2024-02", from: "2024-02-01", to: "2024-02-29" },
  { month: "2026-02", from: "2026-02-01", to: "2026-02-28" },
  { month: "2026-12", from: "2026-12-01", to: "2026-12-31" },
  { month: "2026-01", from: "2026-01-01", to: "2026-01-31" },
];

const withTz = async (tz, fn) => {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    await fn();
  } finally {
    process.env.TZ = prev;
  }
};

const categoryOrder = () =>
  [...screen.getByText("Categoría").closest("table").querySelectorAll("tbody tr")].map(
    (row) => row.querySelector("td")?.textContent
  );

const unitsOf = (category) => {
  const row = screen.getByText(category).closest("tr");
  return within(row).getAllByRole("cell")[1].textContent.trim();
};

TIMEZONES.forEach((tz) => {
  test(`febrero bisiesto/no bisiesto, diciembre y mes de 31 días no se corren con TZ=${tz}`, async () => {
    await withTz(tz, async () => {
      expect(daysInCalendarMonth(2024, 2)).toBe(29);
      expect(daysInCalendarMonth(2026, 2)).toBe(28);
      expect(daysInCalendarMonth(2026, 12)).toBe(31);
      expect(daysInCalendarMonth(2026, 1)).toBe(31);
      MONTH_BOUNDS.forEach(({ month, from, to }) => {
        expect(monthToInclusiveRange(month)).toEqual({ from, to });
      });

      render(<KioskSalesByCategoryReport />);
      await screen.findByLabelText("Kioscos");
      // 2026-02 / 2026-11 ya cubiertos por Pixel; aquí el salto de TZ y los meses restantes.
      for (const { month, from, to } of [
        { month: "2024-02", from: "2024-02-01", to: "2024-02-29" },
        { month: "2026-12", from: "2026-12-01", to: "2026-12-31" },
        { month: "2026-03", from: "2026-03-01", to: "2026-03-31" },
      ]) {
        fireEvent.change(screen.getByLabelText("Mes"), { target: { value: month } });
        await generate();
        expect(lastCall()).toEqual({ from, to });
        expect(lastCall()).not.toHaveProperty("kioskIds");
      }
    });
  });
});

test("Mes arranca en el mes actual de Guatemala y Generar manda primer/último día", async () => {
  render(<KioskSalesByCategoryReport />);
  await screen.findByLabelText("Kioscos");
  const currentMonth = getTodayYmdGuatemala().slice(0, 7);
  expect(screen.getByLabelText("Mes")).toHaveValue(currentMonth);
  await generate();
  expect(lastCall()).toEqual(monthToInclusiveRange(currentMonth));
});

test("al pasar de Mes a Rango copia el mes; al volver a Mes ignora el rango editado", async () => {
  render(<KioskSalesByCategoryReport />);
  await screen.findByLabelText("Kioscos");

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Rango de fechas" }));
  expect(screen.getByLabelText("Desde")).toHaveValue("2026-01-01");
  expect(screen.getByLabelText("Hasta")).toHaveValue("2026-01-31");
  await generate();
  expect(lastCall()).toEqual({ from: "2026-01-01", to: "2026-01-31" });

  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-03-05" } });
  fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-03-12" } });
  await generate();
  expect(lastCall()).toEqual({ from: "2026-03-05", to: "2026-03-12" });

  fireEvent.click(screen.getByRole("button", { name: "Mes" }));
  await generate();
  expect(lastCall()).toEqual({ from: "2026-01-01", to: "2026-01-31" });
});

test("el combo solo ofrece kioscos de GET /locations (sin bodegas, online ni POS de prueba)", async () => {
  getLocations.mockResolvedValue([
    { id: 1, name: "Kiosco Centro", code: "K1", categoria: "KIOSCO" },
    { id: 2, name: "Bodega Central", code: "BOD", categoria: "BODEGA" },
    { id: 3, name: "Kiosco Norte", code: "K3", categoria: "KIOSCO" },
    { id: 4, name: "Kiosco prueba POS", code: "K99", categoria: "KIOSCO", posTestMode: true },
    { id: 5, name: "Tienda Online", code: "WEB", categoria: "ONLINE" },
    { id: 8, name: "Planta", code: "P1", categoria: "PLANTA" },
  ]);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  expect(getLocations.mock.calls[0][0]).toBeUndefined();

  const input = screen.getByLabelText("Kioscos");
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown", keyCode: 40, which: 40 });
  expect(await screen.findByText("Kiosco Centro (K1)", { selector: "div" })).toBeInTheDocument();
  expect(screen.getByText("Kiosco Norte (K3)", { selector: "div" })).toBeInTheDocument();
  expect(screen.queryByText(/Bodega Central/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Kiosco prueba POS/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Tienda Online/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Planta/)).not.toBeInTheDocument();

  await selectKiosk("Kiosco Centro (K1)");
  await selectKiosk("Kiosco Norte (K3)");
  await generate();
  expect(lastCall().kioskIds).toBe("1,3");
});

test("pinta las filas en el orden del API, units decimales y no usa totalWithIva", async () => {
  getKioskSalesByCategory.mockResolvedValueOnce({
    from: "2026-02-01",
    to: "2026-02-28",
    rows: [
      { categoryId: 1, categoryName: "Menor monto", units: 2.5, totalAmount: 1.0, totalAmountNoIva: 0.89, totalWithIva: 99.99, totalWithoutIva: 88.88 },
      { categoryId: 2, categoryName: "Mayor monto", units: 1.125, totalAmount: 50.0, totalAmountNoIva: 44.64, totalWithIva: 99.99, totalWithoutIva: 88.88 },
      { categoryId: null, categoryName: "", units: -1.5, totalAmount: -4.0, totalAmountNoIva: -3.57 },
    ],
    totals: { units: 2.125, totalAmount: 47.01, totalAmountNoIva: 41.97, totalWithIva: 99.99, totalWithoutIva: 88.88 },
  });
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await generate();

  expect(screen.getByRole("columnheader", { name: "Categoría" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Unidades" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Total (con IVA) Q" })).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Total sin IVA Q" })).toBeInTheDocument();
  expect(categoryOrder()).toEqual(["Menor monto", "Mayor monto", "Sin categoría"]);
  expect(unitsOf("Menor monto")).toBe("2.5");
  expect(unitsOf("Mayor monto")).toBe("1.125");
  expect(unitsOf("Sin categoría")).toBe("-1.5");
  expect(screen.getByText("Q 1.00")).toBeInTheDocument();
  expect(screen.getByText("Q 50.00")).toBeInTheDocument();
  expect(screen.queryByText("Q 99.99")).not.toBeInTheDocument();
  expect(screen.queryByText("Q 88.88")).not.toBeInTheDocument();
  const totalRow = screen.getByText("Total general").closest("tr");
  expect(within(totalRow).getByText("2.125")).toBeInTheDocument();
  expect(within(totalRow).getByText("Q 47.01")).toBeInTheDocument();
});

test("sin filas muestra el vacío y el Total general del backend", async () => {
  getKioskSalesByCategory.mockResolvedValueOnce({
    from: "2026-02-01",
    to: "2026-02-28",
    rows: [],
    totals: { units: 0, totalAmount: 0, totalAmountNoIva: 0 },
  });
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await generate();
  expect(screen.getByText("No hay datos para mostrar")).toBeInTheDocument();
  const totalRow = screen.getByText("Total general").closest("tr");
  expect(within(totalRow).getByText("0")).toBeInTheDocument();
  expect(within(totalRow).getAllByText("Q 0.00")).toHaveLength(2);
});

test("mientras carga muestra Generando y no deja pulsar Generar de nuevo", async () => {
  let resolveReport;
  getKioskSalesByCategory.mockImplementation(
    () => new Promise((resolve) => {
      resolveReport = resolve;
    })
  );
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Generar" }));
  expect(await screen.findByText("Generando reporte…")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Generar/ })).toBeDisabled();
  await act(async () => {
    resolveReport(mismatchedTotalsReport);
  });
  expect(screen.queryByText("Generando reporte…")).not.toBeInTheDocument();
  expect(screen.getByText("Bolsos")).toBeInTheDocument();
});

test("un 403 no deja tabla vacía", async () => {
  getKioskSalesByCategory.mockRejectedValueOnce(new Error("No tienes acceso a este reporte."));
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await generate();
  expect(await screen.findByText("No tienes acceso a este reporte.")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText("Total general")).not.toBeInTheDocument();
  expect(screen.queryByText("No hay datos para mostrar")).not.toBeInTheDocument();
});

test("Excel exporta las mismas filas y el total con totalAmount / totalAmountNoIva", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  expect(screen.getByRole("button", { name: /Excel/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-02" } });
  await generate();

  fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
  expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
  const [workbook, fileName] = XLSX.writeFile.mock.calls[0];
  expect(fileName).toBe("ventas_kioscos_2026-02-01_2026-02-28.xlsx");
  expect(workbook.SheetNames).toContain("Ventas de kioscos");
  const data = XLSX.utils.sheet_to_json(workbook.Sheets["Ventas de kioscos"], { header: 1 });
  expect(data[0]).toEqual(["Categoría", "Unidades", "Total (con IVA) Q", "Total sin IVA Q"]);
  expect(data[1]).toEqual(["Bolsos", "2", 10, 8.93]);
  expect(data[2]).toEqual(["Billeteras", "2.5", 10, 8.93]);
  expect(data[3]).toEqual(["Sin categoría", "-3", -50, -44.64]);
  expect(data[4]).toEqual(["Total general", "1.125", 20.01, 17.86]);
  expect(JSON.stringify(data)).not.toMatch(/totalWithIva|totalWithoutIva/);
});
