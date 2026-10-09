import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import KioskSales from "./KioskSales";
import {
  createKioskPosSale,
  getCurrentCashSession,
  getKioskPosContext,
  getKioskProductAvailability,
  getKioskPromotions,
  getMyKioskSales,
  getOldestPendingFelSale,
  getPendingDepositSummary,
} from "services/kioskPosService";

const mockPackagingGate = { allow: false };

jest.mock("utils/kioskPackagingHelper", () => {
  const actual = jest.requireActual("utils/kioskPackagingHelper");
  return {
    ...actual,
    entrecuerosPosCanAddItem: (isEntrecuerosPos, item) => {
      if (mockPackagingGate.allow) return true;
      return actual.entrecuerosPosCanAddItem(isEntrecuerosPos, item);
    },
  };
});

jest.mock("services/kioskPosService");
jest.mock("services/taxInvoiceService");
jest.mock("services/productDistributionService");
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: () => false }),
}));

const inventory = [
  {
    productId: 20,
    productCode: "LL-20",
    productName: "Llavero metal",
    colorId: 1,
    colorName: "Azul",
    hardwareCondition: "NUEVO",
    quantity: 6,
    suggestedUnitPrice: 25,
  },
  {
    productId: 30,
    productCode: "SUM-01",
    productName: "Caja chica",
    colorId: 2,
    colorName: "Negro",
    hardwareCondition: "NUEVO",
    quantity: 4,
    suggestedUnitPrice: 15,
  },
  {
    productId: 32,
    productCode: "EMP-4",
    productName: "Bolsa tela",
    colorId: 4,
    colorName: "Café",
    hardwareCondition: "NUEVO",
    quantity: 3,
    suggestedUnitPrice: 5,
    isPackaging: true,
  },
  {
    productId: 33,
    productCode: "BOX-2",
    productName: "Sobre kraft",
    colorId: 5,
    colorName: "Tostado",
    hardwareCondition: "NUEVO",
    quantity: 2,
    suggestedUnitPrice: 3,
    packaging: true,
  },
];

function mockPos(posMode) {
  getKioskPosContext.mockResolvedValue({
    kioskId: 4,
    kioskName: posMode === "ENTRECUEROS" ? "Entre Cueros" : "Kiosko Centro",
    posMode,
    fullName: "Cajero",
    inventory,
  });
  getMyKioskSales.mockResolvedValue([]);
  getKioskPromotions.mockResolvedValue([]);
  getCurrentCashSession.mockResolvedValue({ id: 1, status: "OPEN" });
  getPendingDepositSummary.mockResolvedValue(null);
  getOldestPendingFelSale.mockResolvedValue(null);
}

async function confirmSale({ entrecueros }) {
  fireEvent.click(screen.getByRole("button", { name: /Cobrar Q/ }));
  if (entrecueros) {
    fireEvent.change(await screen.findByPlaceholderText("Ej. 1842"), {
      target: { value: "1842" },
    });
  }
  fireEvent.click(screen.getByRole("button", { name: "EXACTO" }));
  const confirm = screen.getByRole("button", {
    name: entrecueros ? /Confirmar venta/ : /Confirmar y facturar/,
  });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
}

describe("KioskSales empaques", () => {
  beforeEach(() => {
    mockPackagingGate.allow = false;
    jest.clearAllMocks();
    createKioskPosSale.mockResolvedValue({
      id: 91,
      saleNumber: "POS-91",
      felStatus: "SKIPPED",
    });
  });

  it("no deja agregar empaque en Entrecueros", async () => {
    mockPos("ENTRECUEROS");
    render(<KioskSales />);

    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empaques" })).not.toBeInTheDocument();
    expect(screen.queryByText("Caja chica")).not.toBeInTheDocument();
    expect(screen.queryByText("Bolsa tela")).not.toBeInTheDocument();
    expect(screen.getByText("Llavero metal")).toBeInTheDocument();

    fireEvent.focus(screen.getByPlaceholderText("Buscar producto..."));
    expect(screen.getByText("LL-20 - Llavero metal (Azul)")).toBeInTheDocument();
    expect(screen.queryByText(/SUM-01/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EMP-4/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Azul\s+6/ }));
    expect(screen.getAllByText("Llavero metal")).toHaveLength(2);
    expect(document.querySelectorAll(".kiosk-pos-cart-line")).toHaveLength(1);
    expect(screen.queryByText("Caja chica")).not.toBeInTheDocument();
    expect(screen.queryByText("Empaque")).not.toBeInTheDocument();
  });

  it("el kiosko agrega el empaque a precio de catálogo y sin descuento", async () => {
    mockPos("STANDARD");
    render(<KioskSales />);

    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Empaques" }));
    expect(screen.getByText("Caja chica")).toBeInTheDocument();
    expect(screen.getByText("Q 15.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /SUM-01/ }));

    expect(screen.getByText("Empaque")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cobrar Q 15.00/ })).toBeInTheDocument();
    expect(screen.queryByText(/-Q/)).not.toBeInTheDocument();
  });

  it("no envía empaques de bandera que ya están en el carrito de Entrecueros", async () => {
    mockPackagingGate.allow = true;
    mockPos("ENTRECUEROS");
    render(<KioskSales />);

    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Café\s+3/ }));
    fireEvent.click(screen.getByRole("button", { name: /Tostado\s+2/ }));
    expect(document.querySelectorAll(".kiosk-pos-cart-line")).toHaveLength(2);

    mockPackagingGate.allow = false;
    await confirmSale({ entrecueros: true });

    expect(createKioskPosSale).not.toHaveBeenCalled();
  });

  it("el kiosko sí registra empaques de bandera", async () => {
    mockPos("STANDARD");
    render(<KioskSales />);

    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Café\s+3/ }));
    fireEvent.click(screen.getByRole("button", { name: /Tostado\s+2/ }));
    expect(document.querySelectorAll(".kiosk-pos-cart-line")).toHaveLength(2);

    await confirmSale({ entrecueros: false });

    await waitFor(() => expect(createKioskPosSale).toHaveBeenCalledTimes(1));
    expect(createKioskPosSale).toHaveBeenCalledWith(expect.objectContaining({
      items: expect.arrayContaining([
        expect.objectContaining({ productId: 32 }),
        expect.objectContaining({ productId: 33 }),
      ]),
    }));
  });

  it("oculta SUM en catálogo, búsqueda y disponibilidad aunque la vista quedó en Empaques", async () => {
    const stock = [
      ...inventory,
      {
        productId: 31,
        productCode: "sum-9",
        productName: "Cinta sum",
        colorId: 3,
        colorName: "Rojo",
        hardwareCondition: "NUEVO",
        quantity: 2,
        suggestedUnitPrice: 8,
      },
    ];
    getKioskPosContext.mockImplementation(async (kioskLocationId) => {
      const entrecueros = String(kioskLocationId) === "8";
      return {
        admin: true,
        kioskId: entrecueros ? 8 : 4,
        kioskName: entrecueros ? "Entre Cueros" : "Kiosko Centro",
        posMode: entrecueros ? "ENTRECUEROS" : "STANDARD",
        fullName: "Cajero",
        inventory: stock,
        kiosks: [
          { kioskId: 4, kioskName: "Kiosko Centro", posMode: "STANDARD" },
          { kioskId: 8, kioskName: "Entre Cueros", posMode: "ENTRECUEROS" },
        ],
      };
    });
    getMyKioskSales.mockResolvedValue([]);
    getKioskPromotions.mockResolvedValue([]);
    getCurrentCashSession.mockResolvedValue({ id: 1, status: "OPEN" });
    getPendingDepositSummary.mockResolvedValue(null);
    getOldestPendingFelSale.mockResolvedValue(null);
    getKioskProductAvailability.mockResolvedValue([
      { kioskId: 9, kioskName: "Kiosko Norte", kioskCode: "N1", quantity: 3 },
    ]);

    render(<KioskSales />);

    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Empaques" }));
    expect(screen.getByText("Caja chica")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Kiosko Centro/ }));
    fireEvent.click(screen.getByRole("option", { name: "Entre Cueros" }));

    expect(await screen.findByRole("button", { name: /Entre Cueros/ })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Cargando POS...")).not.toBeInTheDocument();
    });

    expect(screen.queryByText("Vista")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empaques" })).not.toBeInTheDocument();
    expect(screen.queryByText("Caja chica")).not.toBeInTheDocument();
    expect(screen.queryByText("Cinta sum")).not.toBeInTheDocument();
    expect(screen.queryByText("Bolsa tela")).not.toBeInTheDocument();
    expect(screen.queryByText("Sobre kraft")).not.toBeInTheDocument();
    expect(screen.getByText("Llavero metal")).toBeInTheDocument();

    const catalogSearch = screen.getByPlaceholderText("Buscar código, nombre o color");
    fireEvent.change(catalogSearch, { target: { value: "sum" } });
    await waitFor(() => {
      expect(getKioskPosContext).toHaveBeenCalledWith(
        "8",
        expect.objectContaining({ search: "sum" })
      );
    });
    expect(screen.queryByText("Caja chica")).not.toBeInTheDocument();
    expect(screen.queryByText("Cinta sum")).not.toBeInTheDocument();
    expect(screen.queryByText(/SUM-01/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sum-9/)).not.toBeInTheDocument();

    fireEvent.change(catalogSearch, { target: { value: "bolsa" } });
    expect(screen.queryByText("Bolsa tela")).not.toBeInTheDocument();
    fireEvent.change(catalogSearch, { target: { value: "kraft" } });
    expect(screen.queryByText("Sobre kraft")).not.toBeInTheDocument();
    fireEvent.change(catalogSearch, { target: { value: "" } });
    expect(screen.getByText("Llavero metal")).toBeInTheDocument();

    const availabilitySearch = screen.getByPlaceholderText("Buscar producto...");
    fireEvent.focus(availabilitySearch);
    fireEvent.change(availabilitySearch, { target: { value: "sum" } });
    expect(screen.getByText("Sin resultados")).toBeInTheDocument();
    expect(screen.queryByText(/SUM-01/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sum-9/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Caja chica/)).not.toBeInTheDocument();

    fireEvent.change(availabilitySearch, { target: { value: "bolsa" } });
    expect(screen.queryByText(/EMP-4/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bolsa tela/)).not.toBeInTheDocument();

    fireEvent.change(availabilitySearch, { target: { value: "kraft" } });
    expect(screen.queryByText(/BOX-2/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sobre kraft/)).not.toBeInTheDocument();

    fireEvent.change(availabilitySearch, { target: { value: "llavero" } });
    fireEvent.mouseDown(screen.getByText("LL-20 - Llavero metal (Azul)"));
    fireEvent.click(screen.getByRole("button", { name: "Consultar" }));

    expect(await screen.findByText("Kiosko Norte")).toBeInTheDocument();
    expect(getKioskProductAvailability).toHaveBeenCalledTimes(1);
    expect(getKioskProductAvailability).toHaveBeenCalledWith(20, 1, 8);
    expect(screen.queryByText("Caja chica")).not.toBeInTheDocument();
    expect(screen.queryByText("Sobre kraft")).not.toBeInTheDocument();
  });

  it("el kiosko vende el empaque al precio de catálogo", async () => {
    const actualService = jest.requireActual("services/kioskPosService");
    const originalFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 91, saleNumber: "POS-91", felStatus: "SKIPPED" }),
    }));
    createKioskPosSale.mockImplementation(actualService.createKioskPosSale);

    try {
      mockPos("STANDARD");
      render(<KioskSales />);

      expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Empaques" }));
      expect(screen.getByText("Caja chica")).toBeInTheDocument();
      expect(screen.getByText("Q 15.00")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /SUM-01/ }));
      fireEvent.click(screen.getByRole("button", { name: /Cobrar Q 15.00/ }));

      expect(await screen.findByRole("button", { name: "EXACTO" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "EXACTO" }));
      const confirm = screen.getByRole("button", { name: /Confirmar y facturar Q 15\.00/ });
      expect(confirm).toBeEnabled();
      fireEvent.click(confirm);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      const saleCall = global.fetch.mock.calls.find(([url, options]) => {
        const href = String(url).split("?")[0];
        return /\/kiosk-pos\/sales$/.test(href) && String(options?.method).toUpperCase() === "POST";
      });
      expect(saleCall).toBeTruthy();
      const payload = JSON.parse(saleCall[1].body);
      expect(payload.items).toEqual([
        expect.objectContaining({
          productId: 30,
          colorId: 2,
          quantity: 1,
          size: null,
        }),
      ]);
      const sold = payload.items[0];
      expect([undefined, 15]).toContain(sold.unitPrice);
      expect(payload.amountReceived).toBe(15);
      expect(payload.manualDiscountPercent).toBeNull();
    } finally {
      global.fetch = originalFetch;
      createKioskPosSale.mockResolvedValue({
        id: 91,
        saleNumber: "POS-91",
        felStatus: "SKIPPED",
      });
    }
  });
});
