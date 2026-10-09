import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
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

describe("KioskSales empaques", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
