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
import * as XLSX from "xlsx";

jest.mock("services/kioskSalesByCategoryService");
jest.mock("services/locationService");
jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));
jest.mock("react-chartjs-2", () => ({
  Bar: (props) => {
    global.__kioskSalesBarProps = props;
    return <div data-testid="kiosk-sales-chart-bar" />;
  },
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

const bodyRows = () => screen.getAllByRole("row").filter((row) => row.getAttribute("data-row-type"));

beforeEach(() => {
  jest.resetAllMocks();
  global.__kioskSalesBarProps = null;
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
  expect(lastCall()).toEqual({ from: "2026-02-01", to: "2026-02-28", compare: true });

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-11" } });
  await consultar();
  expect(lastCall()).toEqual({ from: "2026-11-01", to: "2026-11-30", compare: true });
});

test("modo Rango envía las fechas tal como se escribieron", async () => {
  render(<KioskSalesByCategoryReport />);
  await screen.findByLabelText("Kioscos");

  fireEvent.click(screen.getByRole("button", { name: "Rango de fechas" }));
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-03-05" } });
  fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-03-12" } });
  await consultar();

  expect(lastCall()).toEqual({ from: "2026-03-05", to: "2026-03-12", compare: true });
});

test("Todos los kioscos omite kioskIds; kioscos elegidos van en lista separada por comas", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-02" } });
  await consultar();
  expect(lastCall()).toEqual({ from: "2026-02-01", to: "2026-02-28", compare: true });
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
  expect(lastCall()).toEqual({ ...monthToInclusiveRange(initialMonth), compare: true });
});

test("agrupa filas por categoryId: cabecera de subtotal y filas indentadas con subgroupLabel", async () => {
  getKioskSalesByCategory.mockResolvedValue(splitReport);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  const rows = bodyRows();
  const bolsosIndex = rows.findIndex(
    (row) => row.getAttribute("data-row-type") === "category-subtotal" && within(row).queryByText("Bolsos")
  );
  expect(bolsosIndex).toBeGreaterThanOrEqual(0);
  expect(rows[bolsosIndex]).toHaveClass("rpt-row-subtotal");
  expect(within(rows[bolsosIndex + 1]).getByText("Dama")).toBeInTheDocument();
  expect(rows[bolsosIndex + 1]).toHaveAttribute("data-row-type", "subgroup");
  expect(rows[bolsosIndex + 1]).toHaveClass("rpt-row-subgroup");
  expect(rows[bolsosIndex + 1]).toHaveAttribute("data-subgroup-code", "DAMA");
  expect(within(rows[bolsosIndex + 2]).getByText("Caballero")).toBeInTheDocument();
  expect(rows[bolsosIndex + 2]).toHaveAttribute("data-row-type", "subgroup");
  expect(rows[bolsosIndex + 2]).toHaveAttribute("data-subgroup-code", "CABALLERO");
  expect(screen.getByText("Billeteras").closest("tr")).toHaveAttribute("data-row-type", "category");
});

test("el subtotal de categoría suma los subgrupos y Total general usa totals del backend", async () => {
  getKioskSalesByCategory.mockResolvedValue(splitReport);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  const bolsos = splitReport.rows.filter((row) => row.categoryId === 10);
  const expectedUnits = bolsos.reduce((acc, row) => acc + row.units, 0);
  const expectedAmount = bolsos.reduce((acc, row) => acc + row.totalAmount, 0);
  const expectedNoIva = bolsos.reduce((acc, row) => acc + row.totalAmountNoIva, 0);
  expect(expectedUnits).toBe(3);
  expect(expectedAmount).toBe(100);
  expect(Number(expectedNoIva.toFixed(2))).toBe(89.29);

  const bolsosHeader = screen
    .getAllByText("Bolsos")
    .find((node) => node.closest("tr")?.getAttribute("data-row-type") === "category-subtotal")
    .closest("tr");
  expect(within(bolsosHeader).getByText("3")).toBeInTheDocument();
  expect(within(bolsosHeader).getByText("Q 100.00")).toBeInTheDocument();
  expect(within(bolsosHeader).getByText("Q 89.29")).toBeInTheDocument();

  const damaRow = screen.getByText("Dama").closest("tr");
  const caballeroRow = screen.getByText("Caballero").closest("tr");
  expect(within(damaRow).getByText("Q 80.00")).toBeInTheDocument();
  expect(within(caballeroRow).getByText("Q 20.00")).toBeInTheDocument();

  const totalRow = screen.getByText("Total general").closest("tr");
  expect(within(totalRow).getByText("2.5")).toBeInTheDocument();
  expect(within(totalRow).getByText("Q 60.01")).toBeInTheDocument();
  expect(within(totalRow).getByText("Q 53.58")).toBeInTheDocument();
  expect(within(totalRow).queryByText("Q 100.00")).not.toBeInTheDocument();
  expect(within(totalRow).queryByText("Q 60.00")).not.toBeInTheDocument();
});

test("sin subgroupCode/subgroupLabel (payload viejo) muestra una sola fila con categoryName", async () => {
  const oldPayload = {
    from: "2026-02-01",
    to: "2026-02-28",
    rows: [
      { categoryId: 10, categoryName: "Bolsos", units: 2, totalAmount: 10.0, totalAmountNoIva: 8.93 },
      {
        categoryId: 11,
        categoryName: "Billeteras",
        subgroupCode: null,
        subgroupLabel: null,
        units: 2.5,
        totalAmount: 10.0,
        totalAmountNoIva: 8.93,
      },
    ],
    totals: { units: 4.5, totalAmount: 20, totalAmountNoIva: 17.86 },
  };
  getKioskSalesByCategory.mockResolvedValue(oldPayload);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  expect(bodyRows().every((row) => row.getAttribute("data-row-type") === "category")).toBe(true);
  expect(screen.queryByText("Sin subgrupo")).not.toBeInTheDocument();
  expect(screen.getByText("Bolsos").closest("tr")).toHaveAttribute("data-row-type", "category");
  expect(screen.getByText("Billeteras").closest("tr")).toHaveAttribute("data-row-type", "category");
  expect(groupRowsByCategory(oldPayload.rows).every((group) => group.split === false)).toBe(true);
});

test("SIN_CLASIFICAR / Sin clasificar se muestra dentro de su categoría", async () => {
  const withUnclassified = {
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
        subgroupCode: "SIN_CLASIFICAR",
        subgroupLabel: "Sin clasificar",
        units: 1,
        totalAmount: 15,
        totalAmountNoIva: 13.39,
      },
    ],
    totals: { units: 3, totalAmount: 95, totalAmountNoIva: 84.82 },
  };
  getKioskSalesByCategory.mockResolvedValue(withUnclassified);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  const rows = bodyRows();
  const headerIndex = rows.findIndex(
    (row) => row.getAttribute("data-row-type") === "category-subtotal" && within(row).queryByText("Bolsos")
  );
  expect(headerIndex).toBeGreaterThanOrEqual(0);
  const unclassified = rows.find(
    (row) => row.getAttribute("data-subgroup-code") === "SIN_CLASIFICAR" && within(row).queryByText("Sin clasificar")
  );
  expect(unclassified).toBeTruthy();
  expect(unclassified).toHaveAttribute("data-row-type", "subgroup");
  expect(rows.indexOf(unclassified)).toBe(headerIndex + 2);
  expect(within(unclassified).getByText("Q 15.00")).toBeInTheDocument();
});

test("el gráfico se renderiza con datos y se apila por subgroupCode", async () => {
  getKioskSalesByCategory.mockResolvedValue(splitReport);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  expect(screen.getByTestId("kiosk-sales-by-category-chart")).toBeInTheDocument();
  expect(screen.getByTestId("kiosk-sales-chart-bar")).toBeInTheDocument();

  const bar = global.__kioskSalesBarProps;
  expect(bar).toBeTruthy();
  expect(bar.data.labels).toEqual(["Bolsos", "Billeteras", "Sin categoría"]);
  expect(bar.data.datasets.every((dataset) => dataset.stack === "sales")).toBe(true);
  expect(bar.options.scales.x.stacked).toBe(true);
  expect(bar.options.scales.y.stacked).toBe(true);
  expect(bar.data.datasets.map((dataset) => dataset.label)).toEqual([
    "Dama",
    "Caballero",
    "Sin clasificar",
    "Sin subgrupo",
  ]);
  const byLabel = Object.fromEntries(bar.data.datasets.map((dataset) => [dataset.label, dataset.data]));
  expect(byLabel.Dama).toEqual([80, 0, 0]);
  expect(byLabel.Caballero).toEqual([20, 0, 0]);
  expect(byLabel["Sin clasificar"]).toEqual([0, 0, -50]);
  expect(byLabel["Sin subgrupo"]).toEqual([0, 10, 0]);
});

test("Limpiar filtros restablece mes, rango de fechas y kioscos", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());

  const initialMonth = screen.getByLabelText("Mes").value;
  fireEvent.click(screen.getByRole("button", { name: "Rango de fechas" }));
  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-03-05" } });
  fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-03-12" } });
  await selectKiosk("Kiosco Norte (K3)");
  expect(screen.getByText(/Kioscos: Kiosco Norte \(K3\)/)).toBeInTheDocument();
  expect(screen.getByText(/Rango: 2026-03-05 a 2026-03-12/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

  expect(screen.getByLabelText("Mes")).toHaveValue(initialMonth);
  expect(screen.queryByLabelText("Desde")).not.toBeInTheDocument();
  expect(screen.getByText(/Kioscos: todos/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mes" })).toHaveAttribute("aria-pressed", "true");

  await consultar();
  expect(lastCall()).toEqual({ ...monthToInclusiveRange(initialMonth), compare: true });
  expect(lastCall()).not.toHaveProperty("kioskIds");
});

test("la exportación a Excel incluye la columna Subgrupo", async () => {
  getKioskSalesByCategory.mockResolvedValue(splitReport);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  fireEvent.click(screen.getByRole("button", { name: /Excel/i }));

  expect(XLSX.writeFile).toHaveBeenCalled();
  const [workbook, filename] = XLSX.writeFile.mock.calls[0];
  expect(filename).toBe("ventas_kioscos_2026-02-01_2026-02-28.xlsx");
  const sheet = workbook.Sheets["Ventas de kioscos"];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  expect(aoa[0]).toEqual(["Categoría", "Subgrupo", "Unidades", "Total (con IVA) Q", "Total sin IVA Q"]);
  expect(aoa[1][0]).toBe("Bolsos");
  expect(aoa[1][1]).toBe("Dama");
  expect(aoa[2][1]).toBe("Caballero");
  expect(aoa[3]).toEqual(["Billeteras", "", "2.5", 10, 8.93]);
  expect(aoa[4][0]).toBe("Sin categoría");
  expect(aoa[4][1]).toBe("Sin clasificar");
  expect(aoa[aoa.length - 1][0]).toBe("Total general");
  expect(aoa[aoa.length - 1][1]).toBe("");
});

test("el combo excluye kioscos Entrecueros por posMode, sin importar espacios ni mayúsculas", async () => {
  getLocations.mockResolvedValue([
    { id: 1, name: "Kiosco Centro", code: "K1", categoria: "KIOSCO", posMode: "STANDARD" },
    { id: 2, name: "Kiosco Entre Uno", code: "K2", categoria: "KIOSCO", posMode: "ENTRECUEROS" },
    { id: 3, name: "Kiosco Entre Dos", code: "K3", categoria: "KIOSCO", posMode: " entrecueros " },
  ]);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());

  const input = screen.getByLabelText("Kioscos");
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown", keyCode: 40, which: 40 });
  expect(await screen.findByText("Kiosco Centro (K1)", { selector: "div" })).toBeInTheDocument();
  expect(screen.queryByText(/Kiosco Entre Uno/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Kiosco Entre Dos/)).not.toBeInTheDocument();
});

test("el combo excluye un kiosko STANDARD cuyo nombre contiene Entrecueros", async () => {
  getLocations.mockResolvedValue([
    { id: 1, name: "Kiosco Centro", code: "K1", categoria: "KIOSCO", posMode: "STANDARD" },
    { id: 2, name: "Kiosko Entrecueros", code: "K2", categoria: "KIOSCO", posMode: "STANDARD" },
  ]);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());

  const input = screen.getByLabelText("Kioscos");
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowDown", keyCode: 40, which: 40 });
  expect(await screen.findByText("Kiosco Centro (K1)", { selector: "div" })).toBeInTheDocument();
  expect(screen.queryByText(/Kiosko Entrecueros/)).not.toBeInTheDocument();
});
