import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import KioskSalesByCategoryReport, {
  daysInCalendarMonth,
  formatUnits,
  groupRowsByCategory,
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
jest.mock("react-chartjs-2", () => ({
  Bar: () => <div data-testid="kiosk-sales-chart-bar" />,
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
    { categoryId: 11, categoryName: "Billeteras", units: 2.5, totalAmount: 10.0, totalAmountNoIva: 8.93 },
    { categoryId: null, categoryName: null, units: -3, totalAmount: -50.0, totalAmountNoIva: -44.64 },
  ],
  totals: { units: 1.125, totalAmount: 20.01, totalAmountNoIva: 17.86 },
};

const splitReport = {
  from: "2026-02-01",
  to: "2026-02-28",
  rows: [
    {
      categoryId: 10,
      categoryName: "Bolsos",
      subgroupCode: "DAMA",
      subgroupLabel: "Dama",
      units: 2,
      totalAmount: 80,
      totalAmountNoIva: 71.43,
    },
    {
      categoryId: 10,
      categoryName: "Bolsos",
      subgroupCode: "CABALLERO",
      subgroupLabel: "Caballero",
      units: 1,
      totalAmount: 20,
      totalAmountNoIva: 17.86,
    },
    {
      categoryId: 11,
      categoryName: "Billeteras",
      subgroupCode: null,
      subgroupLabel: null,
      units: 2.5,
      totalAmount: 10,
      totalAmountNoIva: 8.93,
    },
    {
      categoryId: null,
      categoryName: null,
      subgroupCode: "SIN_CLASIFICAR",
      subgroupLabel: "Sin clasificar",
      units: -3,
      totalAmount: -50,
      totalAmountNoIva: -44.64,
    },
  ],
  totals: { units: 2.5, totalAmount: 60.01, totalAmountNoIva: 53.58 },
};

const consultar = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
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
  await consultar();
  expect(lastCall()).toEqual({ from: "2026-02-01", to: "2026-02-28" });

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-11" } });
  await consultar();
  expect(lastCall()).toEqual({ from: "2026-11-01", to: "2026-11-30" });
});

test("modo Rango envía las fechas tal como se escribieron", async () => {
  render(<KioskSalesByCategoryReport />);
  await screen.findByLabelText("Kioscos");

  fireEvent.click(screen.getByRole("button", { name: "Rango de fechas" }));
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-03-05" } });
  fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-03-12" } });
  await consultar();

  expect(lastCall()).toEqual({ from: "2026-03-05", to: "2026-03-12" });
});

test("Todos los kioscos omite kioskIds; kioscos elegidos van en lista separada por comas", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-02" } });
  await consultar();
  expect(lastCall()).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  expect(lastCall()).not.toHaveProperty("kioskIds");

  await selectKiosk("Kiosco Centro (K1)");
  await selectKiosk("Kiosco Norte (K3)");
  await consultar();
  expect(lastCall().kioskIds).toBe("1,3");
});

test("la fila Total general usa totals del backend, no la suma de filas; filas negativas se muestran", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-02" } });
  await consultar();

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
  await consultar();

  expect(await screen.findByText("El rango no puede superar 366 días")).toBeInTheDocument();
  expect(showError).toHaveBeenCalledWith("El rango no puede superar 366 días");
});

test("un 403 muestra que no hay acceso al reporte", async () => {
  getKioskSalesByCategory.mockRejectedValueOnce(new Error("No tienes acceso a este reporte."));
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  expect(await screen.findByText("No tienes acceso a este reporte.")).toBeInTheDocument();
  expect(showError).toHaveBeenCalledWith("No tienes acceso a este reporte.");
});

test("sin subgrupo (backend viejo) muestra una fila por categoría, sin cabecera de subtotal", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  expect(screen.queryByRole("row", { name: /subtotal/i })).not.toBeInTheDocument();
  expect(screen.queryAllByRole("row").filter((row) => row.getAttribute("data-row-type") === "category-subtotal")).toHaveLength(
    0
  );
  expect(screen.queryAllByRole("row").filter((row) => row.getAttribute("data-row-type") === "subgroup")).toHaveLength(0);
  expect(screen.getAllByRole("row").filter((row) => row.getAttribute("data-row-type") === "category")).toHaveLength(3);

  const groups = groupRowsByCategory(mismatchedTotalsReport.rows);
  expect(groups.every((group) => group.split === false)).toBe(true);
});

test("agrupa por categoría: cabecera con subtotal y filas de subgrupo indentadas", async () => {
  getKioskSalesByCategory.mockResolvedValue(splitReport);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  const bolsosHeader = screen
    .getAllByText("Bolsos")
    .find((node) => node.closest("tr")?.getAttribute("data-row-type") === "category-subtotal")
    .closest("tr");
  expect(within(bolsosHeader).getByText("3")).toBeInTheDocument();
  expect(within(bolsosHeader).getByText("Q 100.00")).toBeInTheDocument();
  expect(within(bolsosHeader).getByText("Q 89.29")).toBeInTheDocument();

  const damaRow = screen.getByText("Dama").closest("tr");
  expect(damaRow).toHaveAttribute("data-row-type", "subgroup");
  expect(damaRow).toHaveClass("rpt-row-subgroup");
  expect(within(damaRow).getByText("2")).toBeInTheDocument();
  expect(within(damaRow).getByText("Q 80.00")).toBeInTheDocument();

  const caballeroRow = screen.getByText("Caballero").closest("tr");
  expect(caballeroRow).toHaveAttribute("data-row-type", "subgroup");
  expect(within(caballeroRow).getByText("Q 20.00")).toBeInTheDocument();

  const billeterasRow = screen.getByText("Billeteras").closest("tr");
  expect(billeterasRow).toHaveAttribute("data-row-type", "category");
  expect(within(billeterasRow).getByText("2.5")).toBeInTheDocument();

  const uncategorizedHeader = screen.getByText("Sin categoría").closest("tr");
  expect(uncategorizedHeader).toHaveAttribute("data-row-type", "category-subtotal");
  const unclassifiedRow = screen.getByText("Sin clasificar").closest("tr");
  expect(unclassifiedRow).toHaveAttribute("data-row-type", "subgroup");
  expect(within(unclassifiedRow).getByText("Q -50.00")).toBeInTheDocument();

  const totalRow = screen.getByText("Total general").closest("tr");
  expect(within(totalRow).getByText("Q 60.01")).toBeInTheDocument();
});

test("el gráfico se muestra cuando hay datos y no cuando la tabla está vacía", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();
  expect(screen.getByTestId("kiosk-sales-by-category-chart")).toBeInTheDocument();
  expect(screen.getByTestId("kiosk-sales-chart-bar")).toBeInTheDocument();

  getKioskSalesByCategory.mockResolvedValue({
    from: "2026-02-01",
    to: "2026-02-28",
    rows: [],
    totals: { units: 0, totalAmount: 0, totalAmountNoIva: 0 },
  });
  await consultar();
  expect(screen.queryByTestId("kiosk-sales-by-category-chart")).not.toBeInTheDocument();
  expect(screen.getByText("No hay datos para mostrar")).toBeInTheDocument();
});

test("Limpiar filtros restaura mes actual y todos los kioscos", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());

  const initialMonth = screen.getByLabelText("Mes").value;
  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-02" } });
  await selectKiosk("Kiosco Centro (K1)");
  expect(screen.getByText(/Kioscos: Kiosco Centro \(K1\)/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

  expect(screen.getByLabelText("Mes")).toHaveValue(initialMonth);
  expect(screen.getByText(/Kioscos: todos/)).toBeInTheDocument();
  expect(screen.queryByText("Kiosco Centro (K1)", { selector: "div" })).not.toBeInTheDocument();

  await consultar();
  expect(lastCall()).not.toHaveProperty("kioskIds");
  expect(lastCall()).toEqual(monthToInclusiveRange(initialMonth));
});
