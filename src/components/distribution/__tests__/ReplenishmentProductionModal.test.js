import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import ReplenishmentProductionModal, {
  buildSuggestedOrder,
  groupShortagesForProduction,
} from "components/distribution/ReplenishmentProductionModal";
import { createProductionOrder } from "services/productionOrderService";

jest.mock("services/productionOrderService", () => ({
  createProductionOrder: jest.fn(),
}));

const kiosks = [
  {
    locationId: 3,
    name: "Kiosko Centro",
    lines: [
      { productId: 1, productCode: "BIL-01", productName: "Billetera", colorId: 10, colorName: "Negro", size: "", shortage: 2 },
      { productId: 2, productCode: "CIN-1", productName: "Cincho", colorId: 10, colorName: "Negro", size: "32", shortage: 1 },
    ],
  },
  {
    locationId: 5,
    name: "Plaza Norte",
    lines: [
      { productId: 1, productCode: "BIL-01", productName: "Billetera", colorId: 10, colorName: "Negro", size: "", shortage: 3 },
      { productId: 4, productCode: "BOL-9", productName: "Bolso", colorId: null, size: "", shortage: 0 },
    ],
  },
];

const distribution = { id: 77, distributionNumber: "DIST-20261103-412" };

beforeEach(() => {
  createProductionOrder.mockReset();
});

describe("OPK sugerida", () => {
  test("agrupa el faltante: OPK sin talla y OPC de cinchos por talla", () => {
    const { opk, opc } = groupShortagesForProduction(kiosks);
    expect(opk).toHaveLength(1);
    expect(opk[0]).toMatchObject({ productId: 1, quantity: 5 });
    expect(opk[0].kiosks.size).toBe(2);
    expect(opc).toHaveLength(1);
    expect(opc[0]).toMatchObject({ productId: 2, quantity: 1, sizes: { 32: 1 } });
  });

  test("arma la orden sugerida ligada a la distribución, sin crearla", () => {
    const { opk } = groupShortagesForProduction(kiosks);
    const order = buildSuggestedOrder("OPK", opk, { distribution, windowDays: 60 });
    expect(order).toEqual({
      orderType: "NORMAL",
      forKiosk: true,
      customerName: "KIOSCOS",
      observations:
        "Sugerida por la reposición de kioscos (DIST-20261103-412): faltante en bodega, venta de 60 días.",
      distributionId: 77,
      distributionNumber: "DIST-20261103-412",
      items: [{ productId: 1, colorId: 10, quantity: 5, sizes: {}, observations: "" }],
    });
    expect(createProductionOrder).not.toHaveBeenCalled();
  });

  test("Abrir OPK sugerida entrega la orden al formulario y no crea nada", () => {
    const onOpenOrder = jest.fn();
    render(
      <ReplenishmentProductionModal
        isOpen
        toggle={() => {}}
        kiosks={kiosks}
        windowDays={60}
        distribution={distribution}
        onOpenOrder={onOpenOrder}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir OPK sugerida" }));
    expect(onOpenOrder).toHaveBeenCalledWith(expect.objectContaining({ orderType: "NORMAL", distributionId: 77 }));
    fireEvent.click(screen.getByRole("button", { name: "Abrir OPC sugerida" }));
    expect(onOpenOrder).toHaveBeenLastCalledWith(
      expect.objectContaining({
        orderType: "CINCHOS_FOSSILES",
        distributionId: 77,
        items: [expect.objectContaining({ productId: 2, sizes: { 32: 1 } })],
      })
    );
    expect(createProductionOrder).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Crear órdenes/ })).toBeNull();
  });

  test("sin distribución creada no deja abrir la orden", () => {
    render(
      <ReplenishmentProductionModal isOpen toggle={() => {}} kiosks={kiosks} windowDays={60} distribution={null} />
    );
    expect(screen.getByRole("button", { name: "Abrir OPK sugerida" })).toBeDisabled();
    expect(screen.getByText(/Crea primero la distribución de reposición/)).toBeTruthy();
  });
});
