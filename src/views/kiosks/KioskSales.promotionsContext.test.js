import React from "react";
import { render, screen } from "@testing-library/react";
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
  useAuth: () => ({ hasPermission: () => false, hasRole: () => false }),
}));

describe("KioskSales promotions context", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("loads promotions for the kiosk resolved from POS context on first load", async () => {
    const kioskId = 17;
    getKioskPosContext.mockResolvedValue({
      kioskId,
      kioskName: "Kiosko Centro",
      posMode: "STANDARD",
      fullName: "Cajero",
      inventory: [],
    });
    getMyKioskSales.mockResolvedValue([]);
    getKioskPromotions.mockResolvedValue([]);
    getCurrentCashSession.mockResolvedValue({ id: 1, status: "OPEN" });
    getPendingDepositSummary.mockResolvedValue(null);
    getOldestPendingFelSale.mockResolvedValue(null);

    render(<KioskSales />);

    expect(await screen.findByText("Caja abierta")).toBeInTheDocument();
    expect(getKioskPromotions).toHaveBeenCalledWith(true, kioskId);
  });
});
