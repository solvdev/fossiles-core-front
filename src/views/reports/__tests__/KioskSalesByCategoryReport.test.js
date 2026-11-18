import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import KioskSalesByCategoryReport, {
  daysInCalendarMonth,
  monthToInclusiveRange,
} from "../KioskSalesByCategoryReport";
import { getKioskSalesByCategory } from "services/kioskSalesByCategoryService";
import { getLocations } from "services/locationService";
import { showError } from "utils/notificationHelper";

jest.mock("services/kioskSalesByCategoryService");
jest.mock("services/locationService");
jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));

const kiosks = [
  { id: 1, name: "Kiosco Centro", code: "K1", categoria: "KIOSCO" },
  { id: 3, name: "Kiosco Norte", code: "K3", categoria: "KIOSCO" },
];

const mismatchedTotalsReport = {
  from: "2026-02-01",
  to: "2026-02-28",
  rows: [
    { categoryId: 10, categoryName: "Bolsos", units: 2, totalAmount: 10.0, totalAmountNoIva: 8.93 },
    { categoryId: 11, categoryName: "Billeteras", units: 1, totalAmount: 10.0, totalAmountNoIva: 8.93 },
    { categoryId: null, categoryName: null, units: -3, totalAmount: -50.0, totalAmountNoIva: -44.64 },
  ],
  totals: { units: 99, totalAmount: 20.01, totalAmountNoIva: 17.86 },
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

  const totalRow = screen.getByText("Total general").closest("tr");
  expect(within(totalRow).getByText("99")).toBeInTheDocument();
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
