import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as XLSX from "xlsx";
import KioskSalesByCategoryReport, {
  buildCategoryChartData,
  daysInCalendarMonth,
  groupRowsByCategory,
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
jest.mock("react-chartjs-2", () => ({
  Bar: (props) => {
    global.__kioskSalesBarProps = props;
    return <div data-testid="kiosk-sales-chart-bar" />;
  },
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

const walletsBeltsReport = {
  from: "2026-02-01",
  to: "2026-02-28",
  rows: [
    {
      categoryId: 20,
      categoryName: "Billeteras",
      subgroupCode: "CABALLERO",
      subgroupLabel: "Caballero",
      units: 2,
      totalAmount: 40,
      totalAmountNoIva: 35.71,
    },
    {
      categoryId: 21,
      categoryName: "Cinturones",
      subgroupCode: "NINO",
      subgroupLabel: "Niño",
      units: 1,
      totalAmount: 8,
      totalAmountNoIva: 7.14,
    },
    {
      categoryId: 20,
      categoryName: "Billeteras",
      subgroupCode: "DAMA",
      subgroupLabel: "Dama",
      units: 1,
      totalAmount: 15,
      totalAmountNoIva: 13.39,
    },
    {
      categoryId: 21,
      categoryName: "Cinturones",
      subgroupCode: "DAMA_CASUAL",
      subgroupLabel: "Dama casual",
      units: 1,
      totalAmount: 9,
      totalAmountNoIva: 8.04,
    },
    {
      categoryId: 21,
      categoryName: "Cinturones",
      subgroupCode: "DAMA_FORMAL",
      subgroupLabel: "Dama formal",
      units: 1,
      totalAmount: 11,
      totalAmountNoIva: 9.82,
    },
    {
      categoryId: 21,
      categoryName: "Cinturones",
      subgroupCode: "CABALLERO_CASUAL",
      subgroupLabel: "Caballero casual",
      units: 1,
      totalAmount: 12,
      totalAmountNoIva: 10.71,
    },
    {
      categoryId: 21,
      categoryName: "Cinturones",
      subgroupCode: "CABALLERO_FORMAL",
      subgroupLabel: "Caballero formal",
      units: 1,
      totalAmount: 13,
      totalAmountNoIva: 11.61,
    },
    {
      categoryId: 22,
      categoryName: "Llaveros",
      subgroupCode: null,
      subgroupLabel: null,
      units: 4,
      totalAmount: 6,
      totalAmountNoIva: 5.36,
    },
    {
      categoryId: 23,
      categoryName: "Otros",
      subgroupCode: "SIN_CLASIFICAR",
      subgroupLabel: "Sin clasificar",
      units: -1,
      totalAmount: -2.5,
      totalAmountNoIva: -2.23,
    },
  ],
  // 1 cent above the row sum (111.50 / 99.55) so the front must not re-sum.
  totals: { units: 11, totalAmount: 111.51, totalAmountNoIva: 99.56 },
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

const categoryOrder = () =>
  [...screen.getByText("Categoría").closest("table").querySelectorAll("tbody tr")].map(
    (row) => row.querySelector("td")?.textContent
  );

const unitsOf = (category) => {
  const row = screen.getByText(category).closest("tr");
  return within(row).getAllByRole("cell")[1].textContent.trim();
};

const tileValue = (label) => {
  const tile = screen.getByText(label, { selector: ".rpt-tile-label" }).closest(".rpt-tile");
  return tile.querySelector(".rpt-tile-value").textContent.trim();
};

const TIMEZONES = ["America/Guatemala", "America/New_York", "UTC"];

const withTz = async (tz, fn) => {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try {
    await fn();
  } finally {
    process.env.TZ = prev;
  }
};

beforeEach(() => {
  jest.resetAllMocks();
  global.__kioskSalesBarProps = null;
  getLocations.mockResolvedValue(kiosks);
  getKioskSalesByCategory.mockResolvedValue(mismatchedTotalsReport);
});

afterEach(cleanup);

TIMEZONES.forEach((tz) => {
  test(`febrero bisiesto/no bisiesto, diciembre y mes de 31 días no se corren con TZ=${tz}`, async () => {
    await withTz(tz, async () => {
      expect(daysInCalendarMonth(2024, 2)).toBe(29);
      expect(daysInCalendarMonth(2026, 2)).toBe(28);
      expect(daysInCalendarMonth(2026, 12)).toBe(31);
      expect(daysInCalendarMonth(2026, 1)).toBe(31);
      [
        { month: "2024-02", from: "2024-02-01", to: "2024-02-29" },
        { month: "2026-02", from: "2026-02-01", to: "2026-02-28" },
        { month: "2026-12", from: "2026-12-01", to: "2026-12-31" },
        { month: "2026-01", from: "2026-01-01", to: "2026-01-31" },
      ].forEach(({ month, from, to }) => {
        expect(monthToInclusiveRange(month)).toEqual({ from, to });
      });

      render(<KioskSalesByCategoryReport />);
      await screen.findByLabelText("Kioscos");
      for (const { month, from, to } of [
        { month: "2024-02", from: "2024-02-01", to: "2024-02-29" },
        { month: "2026-12", from: "2026-12-01", to: "2026-12-31" },
        { month: "2026-03", from: "2026-03-01", to: "2026-03-31" },
      ]) {
        fireEvent.change(screen.getByLabelText("Mes"), { target: { value: month } });
        await consultar();
        expect(lastCall()).toEqual({ from, to, compare: true });
        expect(lastCall()).not.toHaveProperty("kioskIds");
      }
    });
  });
});

test("Mes arranca en el mes actual de Guatemala y Consultar manda primer/último día", async () => {
  render(<KioskSalesByCategoryReport />);
  await screen.findByLabelText("Kioscos");
  const currentMonth = getTodayYmdGuatemala().slice(0, 7);
  expect(screen.getByLabelText("Mes")).toHaveValue(currentMonth);
  await consultar();
  expect(lastCall()).toEqual({ ...monthToInclusiveRange(currentMonth), compare: true });
});

test("al pasar de Mes a Rango copia el mes; al volver a Mes ignora el rango editado", async () => {
  render(<KioskSalesByCategoryReport />);
  await screen.findByLabelText("Kioscos");

  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Rango de fechas" }));
  expect(screen.getByLabelText("Desde")).toHaveValue("2026-01-01");
  expect(screen.getByLabelText("Hasta")).toHaveValue("2026-01-31");
  await consultar();
  expect(lastCall()).toEqual({ from: "2026-01-01", to: "2026-01-31", compare: true });

  fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-03-05" } });
  fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-03-12" } });
  await consultar();
  expect(lastCall()).toEqual({ from: "2026-03-05", to: "2026-03-12", compare: true });

  fireEvent.click(screen.getByRole("button", { name: "Mes" }));
  await consultar();
  expect(lastCall()).toEqual({ from: "2026-01-01", to: "2026-01-31", compare: true });
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
  await consultar();
  expect(lastCall().kioskIds).toBe("1,3");
});

test("pinta las filas en el orden del API, units decimales y no usa totalWithIva", async () => {
  getKioskSalesByCategory.mockResolvedValueOnce({
    from: "2026-02-01",
    to: "2026-02-28",
    rows: [
      {
        categoryId: 1,
        categoryName: "Menor monto",
        units: 2.5,
        totalAmount: 1.0,
        totalAmountNoIva: 0.89,
        totalWithIva: 99.99,
        totalWithoutIva: 88.88,
      },
      {
        categoryId: 2,
        categoryName: "Mayor monto",
        units: 1.125,
        totalAmount: 50.0,
        totalAmountNoIva: 44.64,
        totalWithIva: 99.99,
        totalWithoutIva: 88.88,
      },
      { categoryId: null, categoryName: "", units: -1.5, totalAmount: -4.0, totalAmountNoIva: -3.57 },
    ],
    totals: { units: 2.125, totalAmount: 47.01, totalAmountNoIva: 41.97, totalWithIva: 99.99, totalWithoutIva: 88.88 },
  });
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

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
  await consultar();
  expect(screen.getByText("No hay datos para mostrar")).toBeInTheDocument();
  const totalRow = screen.getByText("Total general").closest("tr");
  expect(within(totalRow).getByText("0")).toBeInTheDocument();
  expect(within(totalRow).getAllByText("Q 0.00")).toHaveLength(2);
});

test("mientras carga muestra Consultando y no deja pulsar Consultar de nuevo", async () => {
  let resolveReport;
  getKioskSalesByCategory.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveReport = resolve;
      })
  );
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("button", { name: "Consultar" }));
  expect(await screen.findByText("Consultando reporte…")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Consultando/ })).toBeDisabled();
  await act(async () => {
    resolveReport(mismatchedTotalsReport);
  });
  expect(screen.queryByText("Consultando reporte…")).not.toBeInTheDocument();
  expect(screen.getByText("Bolsos")).toBeInTheDocument();
});

test("un 403 no deja tabla vacía", async () => {
  getKioskSalesByCategory.mockRejectedValueOnce(new Error("No tienes acceso a este reporte."));
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();
  expect(await screen.findByText("No tienes acceso a este reporte.")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText("Total general")).not.toBeInTheDocument();
  expect(screen.queryByText("No hay datos para mostrar")).not.toBeInTheDocument();
});

test("tarjetas y Total general usan totals del API aunque la suma de filas difiera 1 centavo", async () => {
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  expect(tileValue("Total con IVA")).toBe("Q 20.01");
  expect(screen.getByText("Q 17.86 sin IVA")).toBeInTheDocument();
  expect(tileValue("Piezas de producto")).toBe("1.125");

  const totalRow = screen.getByText("Total general").closest("tr");
  expect(within(totalRow).getByText("1.125")).toBeInTheDocument();
  expect(within(totalRow).getByText("Q 20.01")).toBeInTheDocument();
  expect(within(totalRow).getByText("Q 17.86")).toBeInTheDocument();
  expect(within(totalRow).queryByText("Q -30.00")).not.toBeInTheDocument();
  expect(within(totalRow).queryByText("Q 20.00")).not.toBeInTheDocument();
});

test("subgrupo visible junto a la categoría; null pinta solo el nombre; Sin clasificar y negativos se conservan", async () => {
  getKioskSalesByCategory.mockResolvedValue(walletsBeltsReport);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();

  const billeteras = screen.getByText("Billeteras").closest("tr");
  expect(billeteras).toHaveAttribute("data-row-type", "category-subtotal");
  const caballero = screen.getByText("Caballero").closest("tr");
  expect(caballero).toHaveAttribute("data-row-type", "subgroup");
  expect(caballero).toHaveAttribute("data-subgroup-code", "CABALLERO");
  expect(within(caballero).getByText("Q 40.00")).toBeInTheDocument();
  expect(screen.getByText("Dama").closest("tr")).toHaveAttribute("data-subgroup-code", "DAMA");

  const cinturones = screen.getByText("Cinturones").closest("tr");
  expect(cinturones).toHaveAttribute("data-row-type", "category-subtotal");
  ["Niño", "Dama casual", "Dama formal", "Caballero casual", "Caballero formal"].forEach((label) => {
    expect(screen.getByText(label).closest("tr")).toHaveAttribute("data-row-type", "subgroup");
  });

  const llaveros = screen.getByText("Llaveros").closest("tr");
  expect(llaveros).toHaveAttribute("data-row-type", "category");
  expect(within(llaveros).getByText("4")).toBeInTheDocument();
  expect(within(llaveros).queryByText("Sin subgrupo")).not.toBeInTheDocument();

  const unclassified = screen.getByText("Sin clasificar").closest("tr");
  expect(unclassified).toHaveAttribute("data-row-type", "subgroup");
  expect(unclassified).toHaveAttribute("data-subgroup-code", "SIN_CLASIFICAR");
  expect(within(unclassified).getByText("Q -2.50")).toBeInTheDocument();
  expect(within(unclassified).getByText("-1")).toBeInTheDocument();

  // Grouped UI (not "Billeteras · Caballero"); first-seen categoryId order, subgroups stay with their category.
  expect(screen.queryByText("Billeteras · Caballero")).not.toBeInTheDocument();
  expect(categoryOrder()).toEqual([
    "Billeteras",
    "Caballero",
    "Dama",
    "Cinturones",
    "Niño",
    "Dama casual",
    "Dama formal",
    "Caballero casual",
    "Caballero formal",
    "Llaveros",
    "Otros",
    "Sin clasificar",
  ]);
});

test("el gráfico agrupa por categoryId, apila por subgroupCode y conserva totalAmount (null sigue apareciendo)", async () => {
  const groups = groupRowsByCategory(walletsBeltsReport.rows);
  const chart = buildCategoryChartData(groups);
  expect(chart.stacked).toBe(true);
  expect(chart.data.labels).toEqual(["Billeteras", "Cinturones", "Llaveros", "Otros"]);

  const byLabel = Object.fromEntries(chart.data.datasets.map((ds) => [ds.label, ds]));
  expect(byLabel.Caballero.data).toEqual([40, 0, 0, 0]);
  expect(byLabel.Dama.data).toEqual([15, 0, 0, 0]);
  expect(byLabel.Niño.data).toEqual([0, 8, 0, 0]);
  expect(byLabel["Dama casual"].data).toEqual([0, 9, 0, 0]);
  expect(byLabel["Dama formal"].data).toEqual([0, 11, 0, 0]);
  expect(byLabel["Caballero casual"].data).toEqual([0, 12, 0, 0]);
  expect(byLabel["Caballero formal"].data).toEqual([0, 13, 0, 0]);
  expect(byLabel["Sin subgrupo"].data).toEqual([0, 0, 6, 0]);
  expect(byLabel["Sin clasificar"].data).toEqual([0, 0, 0, -2.5]);
  chart.data.datasets.forEach((ds) => expect(ds.stack).toBe("sales"));

  const stackedValues = chart.data.datasets.flatMap((ds) => ds.data).filter((n) => n !== 0);
  expect(stackedValues.sort((a, b) => a - b)).toEqual(
    walletsBeltsReport.rows.map((row) => row.totalAmount).sort((a, b) => a - b)
  );

  const ungrouped = buildCategoryChartData(groupRowsByCategory(mismatchedTotalsReport.rows));
  expect(ungrouped.stacked).toBe(false);
  expect(ungrouped.data.labels).toEqual(["Bolsos", "Billeteras", "Sin categoría"]);
  expect(ungrouped.data.datasets[0].data).toEqual([10, 10, -50]);

  getKioskSalesByCategory.mockResolvedValue(walletsBeltsReport);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  await consultar();
  expect(global.__kioskSalesBarProps.data.labels).toEqual(chart.data.labels);
  expect(global.__kioskSalesBarProps.data.datasets.map((ds) => ds.data)).toEqual(chart.data.datasets.map((ds) => ds.data));
});

test("Excel incluye columna Subgrupo (vacía si subgroupLabel es null) y totals del API", async () => {
  getKioskSalesByCategory.mockResolvedValue(walletsBeltsReport);
  render(<KioskSalesByCategoryReport />);
  await waitFor(() => expect(getLocations).toHaveBeenCalled());
  expect(screen.getByRole("button", { name: /Excel/ })).toBeDisabled();
  await consultar();

  fireEvent.click(screen.getByRole("button", { name: /Excel/ }));
  expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
  const [workbook, fileName] = XLSX.writeFile.mock.calls[0];
  expect(fileName).toBe("ventas_kioscos_2026-02-01_2026-02-28.xlsx");
  expect(workbook.SheetNames).toContain("Ventas de kioscos");
  const data = XLSX.utils.sheet_to_json(workbook.Sheets["Ventas de kioscos"], { header: 1 });
  expect(data[0]).toEqual(["Categoría", "Subgrupo", "Unidades", "Total (con IVA) Q", "Total sin IVA Q"]);
  expect(data[1]).toEqual(["Billeteras", "Caballero", "2", 40, 35.71]);
  expect(data[2]).toEqual(["Cinturones", "Niño", "1", 8, 7.14]);
  expect(data[3]).toEqual(["Billeteras", "Dama", "1", 15, 13.39]);
  expect(data[8]).toEqual(["Llaveros", "", "4", 6, 5.36]);
  expect(data[9]).toEqual(["Otros", "Sin clasificar", "-1", -2.5, -2.23]);
  expect(data[10]).toEqual(["Total general", "", "11", 111.51, 99.56]);
  expect(JSON.stringify(data)).not.toMatch(/totalWithIva|totalWithoutIva/);
});
