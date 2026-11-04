import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  createReplenishmentDistribution,
  getKioskReplenishmentSuggestion,
} from "services/kioskReplenishmentService";
import { showError } from "utils/notificationHelper";
import KioskReplenishment from "views/distribution/KioskReplenishment";

jest.mock("services/kioskReplenishmentService", () => ({
  getKioskReplenishmentSuggestion: jest.fn(),
  createReplenishmentDistribution: jest.fn(),
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

const renderPage = () =>
  render(
    <MemoryRouter>
      <KioskReplenishment />
    </MemoryRouter>
  );

const mount = async () => {
  const view = renderPage();
  await waitFor(() => expect(screen.getByText("Kiosko Centro")).toBeTruthy());
  return view;
};

const openRowDetail = (kioskName) => {
  fireEvent.click(screen.getByRole("button", { name: `Acciones de ${kioskName}` }));
  const menu = document.querySelector(".dropdown-menu.show");
  fireEvent.click(within(menu).getByText("Detalle"));
};

const tileValue = (label) =>
  screen.getByText(label).closest(".kr-tile").querySelector(".kr-tile-value").textContent;

const confirmCreate = async () => {
  fireEvent.click(screen.getByRole("button", { name: "Crear distribución…" }));
  const dialog = screen.getByText("Crear distribución de reposición").closest(".modal");
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear distribución" }));
  });
};

const createdDistribution = () => ({
  id: 77,
  distributionNumber: "DIST-20261103-412",
  origin: "REPOSICION",
  shipmentCount: 3,
  shipments: [
    { id: 1, locationId: 3, shipmentNumber: "K3-ENV-00010", status: "CONFIRMED" },
    { id: 2, locationId: 3, shipmentNumber: "K3-ENV-00011", status: "DRAFT", pendingProduction: true },
    { id: 3, locationId: 5, shipmentNumber: "K5-ENV-00004", status: "CONFIRMED" },
  ],
});

beforeEach(() => {
  getKioskReplenishmentSuggestion.mockReset();
  createReplenishmentDistribution.mockReset();
  showError.mockReset();
  getKioskReplenishmentSuggestion.mockResolvedValue(suggestion());
  createReplenishmentDistribution.mockResolvedValue(createdDistribution());
});

describe("Reposición de kioscos", () => {
  test("muestra las tres tarjetas de resumen con los totales de los kioscos marcados", async () => {
    await mount();
    expect(tileValue("Envíos marcados")).toBe("2");
    expect(tileValue("Unidades a enviar")).toBe("8");
    expect(tileValue("Faltan en bodega")).toBe("2");
    expect(screen.getByText(/Totales de todos los kioscos marcados/)).toBeTruthy();
  });

  test("la categoría es un chip neutro y el estado del envío usa un chip con contraste", async () => {
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

    await confirmCreate();
    const status = await screen.findByText("Envío K3-ENV-00010, K3-ENV-00011");
    expect(status.className).toMatch(/kr-status-ok/);
    expect(status.className).not.toMatch(/badge-success/);
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
    renderPage();
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
    renderPage();
    expect(await screen.findByText("No hay kioscos activos para analizar.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  test("buscar y filtrar no pierde las marcas; los totales siguen incluyendo lo oculto", async () => {
    await mount();
    expect(screen.getByLabelText("Seleccionar Kiosko Centro").checked).toBe(true);
    fireEvent.change(screen.getByLabelText("Buscar kiosco"), { target: { value: "Plaza" } });
    expect(screen.queryByText("Kiosko Centro")).toBeNull();
    expect(screen.getByText("Plaza Norte")).toBeTruthy();
    expect(tileValue("Envíos marcados")).toBe("2");
    expect(tileValue("Unidades a enviar")).toBe("8");
    expect(screen.getByText(/incluye 1 oculto\(s\) por el filtro/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Buscar kiosco"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Filtrar por categoría"), { target: { value: "A" } });
    expect(screen.getByText("Kiosko Centro")).toBeTruthy();
    expect(screen.queryByText("Plaza Norte")).toBeNull();
    expect(screen.getByLabelText("Seleccionar Kiosko Centro").checked).toBe(true);
    expect(tileValue("Envíos marcados")).toBe("2");

    fireEvent.change(screen.getByLabelText("Filtrar por categoría"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Solo con faltantes" }));
    expect(screen.getByText("Kiosko Centro")).toBeTruthy();
    expect(screen.queryByText("Plaza Norte")).toBeNull();
    expect(tileValue("Unidades a enviar")).toBe("8");

    fireEvent.click(screen.getByRole("button", { name: "Solo con faltantes" }));
    fireEvent.click(screen.getByRole("button", { name: "Solo marcados" }));
    expect(screen.getByText("Kiosko Centro")).toBeTruthy();
    expect(screen.getByText("Plaza Norte")).toBeTruthy();
    expect(screen.queryByText("Outlet Sur")).toBeNull();
  });

  test("crea UNA distribución con una sola llamada y el payload exacto por kiosco", async () => {
    await mount();
    openRowDetail("Kiosko Centro");
    fireEvent.change(screen.getByLabelText("Enviar BIL-01"), { target: { value: "4" } });

    fireEvent.click(screen.getByRole("button", { name: "Crear distribución…" }));
    const dialog = screen.getByText("Crear distribución de reposición").closest(".modal");
    expect(within(dialog).getByText("Kiosko Centro")).toBeTruthy();
    expect(within(dialog).getByText("Plaza Norte")).toBeTruthy();
    expect(within(dialog).queryByText("Outlet Sur")).toBeNull();
    expect(within(dialog).getByLabelText("Descripción").value).toBe("Reposición automática (venta de 60 días)");
    expect(createReplenishmentDistribution).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Crear distribución" }));
    });

    expect(createReplenishmentDistribution).toHaveBeenCalledTimes(1);
    const payload = createReplenishmentDistribution.mock.calls[0][0];
    expect(payload).toMatchObject({
      windowDays: 60,
      description: "Reposición automática (venta de 60 días)",
    });
    expect(payload.distributionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.kiosks).toEqual([
      {
        locationId: 3,
        notes: "Reposición automática (venta de 60 días)",
        lines: [
          {
            productId: 1,
            colorId: 10,
            size: "",
            hardwareCondition: "NUEVO",
            quantity: 4,
            suggestedQuantity: 5,
            shortage: 2,
          },
        ],
      },
      {
        locationId: 5,
        notes: "Reposición automática (venta de 60 días)",
        lines: [
          {
            productId: 2,
            colorId: 10,
            size: "32",
            hardwareCondition: "NUEVO",
            quantity: 3,
            suggestedQuantity: 3,
            shortage: 0,
          },
        ],
      },
    ]);

    expect(await screen.findByText("DIST-20261103-412")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver distribución" }).getAttribute("href")).toBe(
      "/admin/product-distributions/77"
    );
    // Ya creada: todo queda bloqueado para no duplicar.
    expect(screen.getByLabelText("Seleccionar Kiosko Centro").disabled).toBe(true);
    expect(screen.getByLabelText("Enviar BIL-01").disabled).toBe(true);
    expect(screen.getByRole("button", { name: "Crear distribución…" }).disabled).toBe(true);
  });

  test("bloquea las entradas mientras crea", async () => {
    let resolveCreate;
    createReplenishmentDistribution.mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );
    await mount();
    openRowDetail("Kiosko Centro");
    fireEvent.click(screen.getByRole("button", { name: "Crear distribución…" }));
    const dialog = screen.getByText("Crear distribución de reposición").closest(".modal");
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear distribución" }));
    await waitFor(() => expect(createReplenishmentDistribution).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("Seleccionar Kiosko Centro").disabled).toBe(true);
    expect(screen.getByLabelText("Enviar BIL-01").disabled).toBe(true);
    await act(async () => { resolveCreate(createdDistribution()); });
    expect(await screen.findByText("DIST-20261103-412")).toBeTruthy();
  });

  test("si falla no queda nada a medias: avisa y desbloquea la pantalla", async () => {
    createReplenishmentDistribution.mockRejectedValue(new Error("bodega ocupada"));
    await mount();
    await confirmCreate();
    await waitFor(() => expect(showError).toHaveBeenCalledWith(expect.stringMatching(/No se creó la distribución: bodega ocupada/)));
    expect(createReplenishmentDistribution).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/K3-ENV/)).toBeNull();
    expect(screen.getByLabelText("Seleccionar Plaza Norte").disabled).toBe(false);
    expect(screen.getByRole("button", { name: "Crear distribución…" }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: /Recalcular/ }).disabled).toBe(false);
    openRowDetail("Plaza Norte");
    expect(screen.getByLabelText("Enviar CIN-1").disabled).toBe(false);
  });

  test("avisa cuando un kiosco ya tiene una reposición sin despachar", async () => {
    const data = suggestion();
    data.kiosks[0].openReplenishmentDistributions = ["DIST-20261030-398"];
    getKioskReplenishmentSuggestion.mockResolvedValue(data);
    await mount();
    expect(screen.getByText(/1 kiosco\(s\) ya tienen una reposición sin despachar/)).toBeTruthy();
    const chip = screen.getByText("Reposición pendiente");
    expect(chip.className).toMatch(/kr-status-warn/);
    expect(chip.getAttribute("title")).toContain("DIST-20261030-398");
  });

  test("el faltante se ofrece como OPK sugerida y Reposición no crea órdenes", async () => {
    await mount();
    expect(screen.getByRole("button", { name: /OPK sugerida \(2\)/ })).toBeTruthy();
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
