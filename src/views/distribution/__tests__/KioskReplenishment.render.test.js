import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { getKioskReplenishmentSuggestion } from "services/kioskReplenishmentService";
import { createStandaloneKioskShipment } from "services/productDistributionService";
import KioskReplenishment from "views/distribution/KioskReplenishment";

jest.mock("services/kioskReplenishmentService", () => ({
  getKioskReplenishmentSuggestion: jest.fn(),
}));
jest.mock("services/productDistributionService", () => ({
  createStandaloneKioskShipment: jest.fn(),
}));
jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));
jest.mock("components/distribution/CreateStandaloneKioskShipmentModal", () => () => null);
jest.mock("components/distribution/ReplenishmentProductionModal", () => {
  const actual = jest.requireActual("components/distribution/ReplenishmentProductionModal");
  return { __esModule: true, ...actual, default: () => null };
});

const line = (over = {}) => ({
  productId: 1,
  productCode: "BIL-01",
  productName: "Billetera",
  colorId: 10,
  colorName: "Negro",
  size: "",
  hardwareCondition: "NUEVO",
  stock: 2,
  inTransit: 1,
  sold: 10,
  dailyRate: 0.16,
  min: 3,
  max: 8,
  need: 6,
  suggested: 5,
  shortage: 2,
  deferred: 1,
  reason: "Bajo mínimo",
  topSeller: true,
  base: true,
  ...over,
});

const suggestion = () => ({
  windowDays: 60,
  since: "2026-09-03",
  totalShortage: 2,
  kiosks: [
    {
      locationId: 3,
      name: "Kiosko Centro",
      code: "K3",
      category: "A",
      categorySource: "FINANZAS",
      unitsSold: 120,
      weeklyBudget: 20,
      totalSuggested: 5,
      totalShortage: 2,
      totalDeferred: 1,
      lines: [line()],
    },
    {
      locationId: 5,
      name: "Plaza Norte",
      code: "K5",
      category: "B",
      categorySource: "CALCULADA",
      unitsSold: 40,
      weeklyBudget: 8,
      totalSuggested: 3,
      totalShortage: 0,
      totalDeferred: 0,
      lines: [
        line({
          productId: 2,
          productCode: "CIN-1",
          productName: "Cincho",
          size: "32",
          suggested: 3,
          shortage: 0,
          deferred: 0,
          need: 3,
          topSeller: false,
          base: false,
        }),
      ],
    },
    {
      locationId: 8,
      name: "Outlet Sur",
      code: "K8",
      category: "C",
      categorySource: "FINANZAS",
      unitsSold: 8,
      weeklyBudget: 3,
      totalSuggested: 1,
      totalShortage: 0,
      totalDeferred: 0,
      lines: [line({ productId: 3, suggested: 1, shortage: 0, deferred: 0, need: 1, topSeller: false, base: false })],
    },
  ],
});

const mount = async () => {
  const view = render(<KioskReplenishment />);
  await waitFor(() => expect(screen.getByText("Kiosko Centro")).toBeTruthy());
  return view;
};

const openRowDetail = (kioskName) => {
  fireEvent.click(screen.getByRole("button", { name: `Acciones de ${kioskName}` }));
  const menu = document.querySelector(".dropdown-menu.show");
  fireEvent.click(within(menu).getByText("Detalle"));
};

beforeEach(() => {
  getKioskReplenishmentSuggestion.mockReset();
  createStandaloneKioskShipment.mockReset();
  getKioskReplenishmentSuggestion.mockResolvedValue(suggestion());
  createStandaloneKioskShipment.mockImplementation(async ({ locationId }) => ({
    id: locationId,
    shipmentNumber: `ENVK-${locationId}`,
  }));
});

describe("Reposición de kioscos", () => {
  test("muestra las tres tarjetas de resumen con los totales de los kioscos marcados", async () => {
    await mount();
    expect(screen.getByText("Envíos marcados").parentNode.textContent).toMatch(/2/);
    expect(screen.getByText("Unidades a enviar").parentNode.textContent).toMatch(/8/);
    expect(screen.getByText("Faltan en bodega").parentNode.textContent).toMatch(/2/);
    expect(screen.getByText(/Totales de todos los kioscos marcados/)).toBeTruthy();
  });

  test("la categoría es un chip neutro y el color queda para el estado", async () => {
    await mount();
    const chips = document.querySelectorAll(".kr-cat-chip");
    expect(chips).toHaveLength(3);
    chips.forEach((chip) => {
      expect(chip.className).not.toMatch(/badge/);
      expect(chip.className).not.toMatch(/success|info|warning|danger|primary/);
    });
    const centroRow = screen.getByText("Kiosko Centro").closest("tr");
    expect(centroRow.querySelector(".text-danger").textContent.trim()).toBe("2");
    const plazaRow = screen.getByText("Plaza Norte").closest("tr");
    expect(plazaRow.querySelector(".text-danger")).toBeNull();
    expect(plazaRow.textContent).toContain("*");

    fireEvent.click(screen.getByRole("button", { name: "Confirmar y crear envíos" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(screen.getByText("Envío ENVK-3")).toBeTruthy());
    expect(screen.getByText("Envío ENVK-3").className).toMatch(/badge-success/);
  });

  test("las reglas A/B/C están plegadas por defecto", async () => {
    await mount();
    const how = screen.getByText("¿Cómo se calcula?");
    expect(how.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(how);
    expect(screen.getByText("¿Cómo se calcula?").getAttribute("aria-expanded")).toBe("true");
    await waitFor(() => expect(screen.getByText(/se rellena hasta el máximo/)).toBeVisible());
  });

  test("si falla la carga muestra Reintentar y no el mensaje vacío", async () => {
    getKioskReplenishmentSuggestion.mockRejectedValue(new Error("No se pudo calcular la reposición"));
    render(<KioskReplenishment />);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeTruthy();
    expect(screen.queryByText("No hay kioscos activos para analizar.")).toBeNull();
    expect(screen.getByText("No se pudo calcular la reposición")).toBeTruthy();
  });

  test("el mensaje vacío solo aparece cuando la respuesta llega sin kioscos", async () => {
    getKioskReplenishmentSuggestion.mockResolvedValue({
      windowDays: 60,
      since: "2026-09-03",
      totalShortage: 0,
      kiosks: [],
    });
    render(<KioskReplenishment />);
    expect(await screen.findByText("No hay kioscos activos para analizar.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  test("buscar y filtrar no pierde las marcas; los totales siguen incluyendo lo oculto", async () => {
    await mount();
    expect(screen.getByLabelText("Seleccionar Kiosko Centro").checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Buscar kiosco"), { target: { value: "Plaza" } });
    expect(screen.queryByText("Kiosko Centro")).toBeNull();
    expect(screen.getByText("Plaza Norte")).toBeTruthy();
    expect(screen.getByText("Envíos marcados").parentNode.textContent).toMatch(/2/);
    expect(screen.getByText("Unidades a enviar").parentNode.textContent).toMatch(/8/);
    expect(screen.getByText(/incluye 1 oculto\(s\) por el filtro/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Buscar kiosco"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filtrar por categoría"), { target: { value: "A" } });
    expect(screen.getByText("Kiosko Centro")).toBeTruthy();
    expect(screen.queryByText("Plaza Norte")).toBeNull();
    expect(screen.getByLabelText("Seleccionar Kiosko Centro").checked).toBe(true);
    expect(screen.getByText("Envíos marcados").parentNode.textContent).toMatch(/2/);

    fireEvent.change(screen.getByLabelText("Filtrar por categoría"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Solo con faltantes" }));
    expect(screen.getByText("Kiosko Centro")).toBeTruthy();
    expect(screen.queryByText("Plaza Norte")).toBeNull();
    expect(screen.getByText("Unidades a enviar").parentNode.textContent).toMatch(/8/);

    fireEvent.click(screen.getByRole("button", { name: "Solo con faltantes" }));
    fireEvent.click(screen.getByRole("button", { name: "Solo marcados" }));
    expect(screen.getByText("Kiosko Centro")).toBeTruthy();
    expect(screen.getByText("Plaza Norte")).toBeTruthy();
    expect(screen.queryByText("Outlet Sur")).toBeNull();
  });

  test("pide confirmación antes de crear y bloquea entradas mientras crea", async () => {
    const resolvers = [];
    createStandaloneKioskShipment.mockImplementation(
      () => new Promise((resolve) => { resolvers.push(resolve); })
    );
    await mount();
    openRowDetail("Kiosko Centro");
    expect(screen.getByLabelText("Enviar BIL-01").disabled).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Confirmar y crear envíos" }));
    const dialog = screen.getByText("Confirmar envíos").closest(".modal");
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText("Kiosko Centro")).toBeTruthy();
    expect(within(dialog).getByText("Plaza Norte")).toBeTruthy();
    expect(createStandaloneKioskShipment).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(createStandaloneKioskShipment).toHaveBeenCalled());
    expect(createStandaloneKioskShipment.mock.calls[0][0]).toMatchObject({
      locationId: 3,
      confirmOnly: true,
      products: [expect.objectContaining({ productId: 1, quantity: 5 })],
    });
    expect(screen.getByLabelText("Seleccionar Kiosko Centro").disabled).toBe(true);
    expect(screen.getByLabelText("Seleccionar Plaza Norte").disabled).toBe(true);
    expect(screen.getByLabelText("Enviar BIL-01").disabled).toBe(true);

    await act(async () => { resolvers[0]({ id: 91, shipmentNumber: "ENVK-91" }); });
    await waitFor(() => expect(resolvers.length).toBe(2));
    await act(async () => { resolvers[1]({ id: 92, shipmentNumber: "ENVK-92" }); });
    await waitFor(() => expect(screen.getByText("Envío ENVK-91")).toBeTruthy());
  });

  test("al recalcular con datos existentes atenúa la tabla y no deja editar", async () => {
    await mount();
    let resolveReload;
    getKioskReplenishmentSuggestion.mockImplementation(
      () => new Promise((resolve) => { resolveReload = resolve; })
    );
    fireEvent.click(screen.getByRole("button", { name: /Recalcular/ }));
    expect(await screen.findByLabelText("Recalculando")).toBeTruthy();
    expect(screen.getByLabelText("Seleccionar Kiosko Centro").disabled).toBe(true);
    expect(document.querySelector(".kr-table-wrap").classList.contains("is-busy")).toBe(true);
    resolveReload(suggestion());
    await waitFor(() => expect(screen.queryByLabelText("Recalculando")).toBeNull());
  });
});
