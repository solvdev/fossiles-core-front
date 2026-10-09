import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import KioskSales from "./KioskSales";
import {
  getCurrentCashSession,
  getKioskPosContext,
  getKioskPromotions,
  getMyKioskSales,
  getOldestPendingFelSale,
  getPendingDepositSummary,
} from "services/kioskPosService";
import { showError } from "utils/notificationHelper";

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

jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
  showWarning: jest.fn(),
  showInfo: jest.fn(),
}));

jest.mock("services/kioskPosService", () => {
  const actual = jest.requireActual("services/kioskPosService");
  return {
    ...actual,
    getCurrentCashSession: jest.fn(),
    getKioskPosContext: jest.fn(),
    getKioskPromotions: jest.fn(),
    getMyKioskSales: jest.fn(),
    getOldestPendingFelSale: jest.fn(),
    getPendingDepositSummary: jest.fn(),
    getKioskSaleById: jest.fn(),
    updateKioskSaleInvoiceContact: jest.fn(),
    getKioskProductAvailability: jest.fn(),
  };
});
jest.mock("services/taxInvoiceService");
jest.mock("services/productDistributionService");
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: () => false }),
}));

jest.mock("./pos/PosCatalogPanel", () => {
  const React = require("react");
  const probe = (global.__posCatalogProbe = global.__posCatalogProbe || {});

  function PosCatalogPanel(props) {
    probe.props = props;
    return React.createElement(
      "div",
      null,
      React.createElement(
        "button",
        { type: "button", onClick: () => props.onAddProduct(probe.itemToAdd) },
        "Forzar alta"
      ),
      React.createElement(
        "button",
        { type: "button", onClick: () => props.onPickSizedVariant(probe.itemToSize) },
        "Forzar talla"
      )
    );
  }

  return PosCatalogPanel;
});

const wallet = {
  productId: 20,
  productCode: "LL-20",
  productName: "Llavero metal",
  colorId: 1,
  colorName: "Azul",
  hardwareCondition: "NUEVO",
  quantity: 6,
  suggestedUnitPrice: 25,
};

const sumBox = {
  productId: 30,
  productCode: "SUM-01",
  productName: "Caja chica",
  colorId: 2,
  colorName: "Negro",
  hardwareCondition: "NUEVO",
  quantity: 4,
  suggestedUnitPrice: 15,
};

const flaggedBag = {
  productId: 32,
  productCode: "EMP-4",
  productName: "Bolsa tela",
  colorId: 4,
  colorName: "Café",
  hardwareCondition: "NUEVO",
  quantity: 3,
  suggestedUnitPrice: 5,
  isPackaging: true,
};

const packagingEnvelope = {
  productId: 33,
  productCode: "BOX-2",
  productName: "Sobre kraft",
  colorId: 5,
  colorName: "Tostado",
  hardwareCondition: "NUEVO",
  quantity: 2,
  suggestedUnitPrice: 3,
  packaging: true,
};

function withSize(item, size) {
  return { ...item, quantity: 2, sizes: { [size]: 2 } };
}

function salesPosts() {
  return (global.fetch?.mock?.calls || []).filter(([url, options]) => {
    const href = String(url).split("?")[0];
    return /\/kiosk-pos\/sales$/.test(href) && String(options?.method || "").toUpperCase() === "POST";
  });
}

function cartLineCount() {
  return document.querySelectorAll(".kiosk-pos-cart-line").length;
}

function forceAdd(item) {
  global.__posCatalogProbe.itemToAdd = item;
  fireEvent.click(screen.getByRole("button", { name: "Forzar alta" }));
}

async function renderEntrecueros() {
  render(<KioskSales />);
  expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
}

async function confirmSale() {
  fireEvent.click(screen.getByRole("button", { name: /Cobrar Q/ }));
  fireEvent.change(await screen.findByPlaceholderText("Ej. 1842"), {
    target: { value: "1842" },
  });
  fireEvent.click(screen.getByRole("button", { name: "EXACTO" }));
  const confirm = screen.getByRole("button", { name: /Confirmar venta/ });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() => {
    const rejected = showError.mock.calls.some((call) => String(call[0]).includes("no vende empaques"));
    expect(rejected || salesPosts().length > 0).toBe(true);
  });
}

describe("KioskSales rechaza empaques que igual llegan a Entrecueros", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPackagingGate.allow = false;
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 91, saleNumber: "POS-91", felStatus: "SKIPPED" }),
    }));
    getKioskPosContext.mockResolvedValue({
      kioskId: 4,
      kioskName: "Entre Cueros",
      posMode: "ENTRECUEROS",
      fullName: "Cajero",
      inventory: [wallet, sumBox, flaggedBag, packagingEnvelope],
    });
    getMyKioskSales.mockResolvedValue([]);
    getKioskPromotions.mockResolvedValue([]);
    getCurrentCashSession.mockResolvedValue({ id: 1, status: "OPEN" });
    getPendingDepositSummary.mockResolvedValue(null);
    getOldestPendingFelSale.mockResolvedValue(null);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("rechaza el empaque al agregarlo al carrito", async () => {
    await renderEntrecueros();

    for (const item of [sumBox, flaggedBag, packagingEnvelope, withSize(sumBox, "34")]) {
      showError.mockClear();
      forceAdd(item);
      expect(showError).toHaveBeenCalledWith("Entrecueros no vende empaques.");
      expect(cartLineCount()).toBe(0);
      expect(screen.queryByText("Toca la talla para agregar al carrito")).not.toBeInTheDocument();
    }

    expect(salesPosts()).toHaveLength(0);
  });

  it("rechaza el empaque al elegir una talla", async () => {
    await renderEntrecueros();

    for (const item of [withSize(sumBox, "34"), withSize(flaggedBag, "36"), withSize(packagingEnvelope, "38")]) {
      showError.mockClear();
      global.__posCatalogProbe.itemToSize = item;
      fireEvent.click(screen.getByRole("button", { name: "Forzar talla" }));
      const size = Object.keys(item.sizes)[0];
      fireEvent.click(await screen.findByRole("button", { name: new RegExp(`\\b${size}\\b`) }));
      expect(showError).toHaveBeenCalledWith("Entrecueros no vende empaques.");
      expect(cartLineCount()).toBe(0);
    }

    expect(salesPosts()).toHaveLength(0);
  });

  it("rechaza el empaque al confirmar la venta y no hace POST a /api/kiosk-pos/sales", async () => {
    await renderEntrecueros();
    mockPackagingGate.allow = true;
    forceAdd(sumBox);
    expect(cartLineCount()).toBe(1);
    expect(screen.getByText("Empaque")).toBeInTheDocument();

    mockPackagingGate.allow = false;
    showError.mockClear();
    await confirmSale();

    expect(salesPosts()).toHaveLength(0);
    expect(showError).toHaveBeenCalledWith("Entrecueros no vende empaques.");
    expect(cartLineCount()).toBe(1);
  });

  it("bloquea un carrito mixto al confirmar la venta", async () => {
    await renderEntrecueros();
    mockPackagingGate.allow = true;
    forceAdd(wallet);
    forceAdd(sumBox);
    expect(cartLineCount()).toBe(2);

    mockPackagingGate.allow = false;
    showError.mockClear();
    await confirmSale();

    expect(salesPosts()).toHaveLength(0);
    expect(showError).toHaveBeenCalledWith("Entrecueros no vende empaques.");
    expect(cartLineCount()).toBe(2);
  });

  it("rechaza un empaque con bandera isPackaging al confirmar la venta", async () => {
    await renderEntrecueros();
    mockPackagingGate.allow = true;
    forceAdd(flaggedBag);
    expect(cartLineCount()).toBe(1);

    mockPackagingGate.allow = false;
    showError.mockClear();
    await confirmSale();

    expect(salesPosts()).toHaveLength(0);
    expect(showError).toHaveBeenCalledWith("Entrecueros no vende empaques.");
  });

  it("rechaza un empaque con bandera packaging al confirmar la venta", async () => {
    await renderEntrecueros();
    mockPackagingGate.allow = true;
    forceAdd(packagingEnvelope);
    expect(cartLineCount()).toBe(1);

    mockPackagingGate.allow = false;
    showError.mockClear();
    await confirmSale();

    expect(salesPosts()).toHaveLength(0);
    expect(showError).toHaveBeenCalledWith("Entrecueros no vende empaques.");
  });

  it("bloquea un carrito mixto con empaque de bandera al confirmar la venta", async () => {
    await renderEntrecueros();
    mockPackagingGate.allow = true;
    forceAdd(wallet);
    forceAdd(flaggedBag);
    forceAdd(packagingEnvelope);
    expect(cartLineCount()).toBe(3);

    mockPackagingGate.allow = false;
    showError.mockClear();
    await confirmSale();

    expect(salesPosts()).toHaveLength(0);
    expect(showError).toHaveBeenCalledWith("Entrecueros no vende empaques.");
    expect(cartLineCount()).toBe(3);
  });
});
