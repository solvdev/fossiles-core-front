import React from "react";
import "@testing-library/jest-dom";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ProductionOrderForm from "../ProductionOrderForm";
import {
  createProductionOrder,
  getProductionOrderById,
  updateProductionOrder,
  validateMaterials,
} from "services/productionOrderService";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";
import { getCustomers } from "services/customerService";
import { getLocations } from "services/locationService";

jest.mock("reactstrap", () => {
  const actual = jest.requireActual("reactstrap");
  return {
    ...actual,
    Modal: ({ isOpen, children }) => (isOpen ? <div>{children}</div> : null),
  };
});

jest.mock("services/productionOrderService", () => ({
  getProductionOrderById: jest.fn(),
  createProductionOrder: jest.fn(),
  updateProductionOrder: jest.fn(),
  validateMaterials: jest.fn(),
}));

jest.mock("services/productService", () => ({
  getProducts: jest.fn(),
}));

jest.mock("services/colorService", () => ({
  getColors: jest.fn(),
}));

jest.mock("services/customerService", () => ({
  getCustomers: jest.fn(),
}));

jest.mock("services/locationService", () => ({
  getLocations: jest.fn(),
}));

jest.mock("services/authService", () => ({
  getAuthHeader: () => ({}),
}));

jest.mock("utils/notificationHelper", () => ({
  showSuccess: jest.fn(),
  showError: jest.fn(),
}));

jest.mock("views/customers/CustomersForm", () => () => null);
jest.mock("components/production/OpcGenerateShipmentModal", () => () => null);
jest.mock("components/production/ProductionOrderPartialReleasesPanel", () => () => null);
jest.mock("components/production/OpvShipmentPriceReviewModal", () => () => null);

const PRODUCTS = [
  { id: 1, code: "FOSS-01", name: "Cincho Casual" },
  { id: 2, code: "BILL-01", name: "Billetera" },
];
const COLORS = [{ id: 10, name: "Negro" }];

beforeEach(() => {
  getProducts.mockResolvedValue(PRODUCTS);
  getColors.mockResolvedValue(COLORS);
  getCustomers.mockResolvedValue([]);
  getLocations.mockResolvedValue([]);
  createProductionOrder.mockResolvedValue({ id: 1 });
  updateProductionOrder.mockResolvedValue({ id: 9 });
  getProductionOrderById.mockResolvedValue(null);
  validateMaterials.mockResolvedValue(null);
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [],
  });
});

async function renderForm(props = {}) {
  let view;
  await act(async () => {
    view = render(
      <ProductionOrderForm isOpen toggle={jest.fn()} onSuccess={jest.fn()} {...props} />
    );
    await Promise.resolve();
  });
  await screen.findByPlaceholderText("Buscar producto por código o nombre...");
  await waitFor(() => expect(getProducts).toHaveBeenCalled());
  await waitFor(() => expect(getColors).toHaveBeenCalled());
  return view;
}

async function selectProduct(code) {
  const search = screen.getByPlaceholderText("Buscar producto por código o nombre...");
  await waitFor(() => {
    fireEvent.focus(search);
    expect(screen.getByText(code)).toBeInTheDocument();
  });
  fireEvent.click(screen.getByText(code));
}

function sizeBadge(size, qty) {
  const re = new RegExp(`${size}\\s*:\\s*${qty}`);
  return (_, node) => Boolean(node?.classList?.contains("badge") && re.test(node.textContent || ""));
}

function orderTypeSelect() {
  return screen.getByText("Tipo de Orden *").closest(".form-group").querySelector("select");
}

describe("ProductionOrderForm cincho size grid", () => {
  test("NORMAL (OPV): belt shows the size grid, non-belt does not; submit payload uses sizes sum", async () => {
    await renderForm();
    expect(orderTypeSelect().value).toBe("NORMAL");
    expect(screen.queryByText("Tallas *")).not.toBeInTheDocument();
    expect(screen.getByText("Cantidad *")).toBeInTheDocument();

    await selectProduct("FOSS-01");
    expect(await screen.findByText("Tallas *")).toBeInTheDocument();
    expect(screen.queryByText("Cantidad *")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /Negro/ }));
    fireEvent.click(screen.getByRole("button", { name: "32" }));
    fireEvent.click(screen.getByRole("button", { name: "34" }));

    const sizeQtyInputs = await screen.findAllByPlaceholderText("0");
    fireEvent.change(sizeQtyInputs[0], { target: { value: "2" } });
    fireEvent.change(sizeQtyInputs[1], { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar Item/ }));

    expect(await screen.findByText(sizeBadge("32", 2))).toBeInTheDocument();
    expect(screen.getByText(sizeBadge("34", 1))).toBeInTheDocument();

    await selectProduct("BILL-01");
    expect(screen.queryByText("Tallas *")).not.toBeInTheDocument();
    expect(screen.getByText("Cantidad *")).toBeInTheDocument();

    const qtyInput = screen.getByPlaceholderText("Cantidad");
    fireEvent.change(qtyInput, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: /Agregar Item/ }));

    await screen.findByText("2 item(s) agregado(s)");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear" }));
    });

    await waitFor(() => expect(createProductionOrder).toHaveBeenCalledTimes(1));
    const payload = createProductionOrder.mock.calls[0][0];
    expect(payload.orderType).toBe("NORMAL");
    expect(payload.items).toEqual([
      expect.objectContaining({
        productId: 1,
        colorId: 10,
        quantity: 3,
        sizes: { "32": 2, "34": 1 },
      }),
      expect.objectContaining({
        productId: 2,
        quantity: 5,
        sizes: null,
      }),
    ]);
  });

  test("VENTA_EN_LINEA (OPL): belt shows the size grid and a wallet does not", async () => {
    await renderForm({ initialValues: { orderType: "VENTA_EN_LINEA" } });

    await selectProduct("FOSS-01");
    expect(await screen.findByText("Tallas *")).toBeInTheDocument();
    expect(screen.queryByText("Cantidad *")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar selección" }));
    await selectProduct("BILL-01");
    expect(screen.queryByText("Tallas *")).not.toBeInTheDocument();
    expect(screen.getByText("Cantidad *")).toBeInTheDocument();
  });

  test("editing an OPL belt line shows existing sizes and submits a normalized payload", async () => {
    getProductionOrderById.mockResolvedValue({
      id: 9,
      code: "OPL-9",
      orderType: "VENTA_EN_LINEA",
      items: [
        {
          id: 44,
          productId: 1,
          colorId: 10,
          quantity: 3,
          sizes: { " 32 ": 2, "34": 1 },
          observations: "",
        },
      ],
    });

    await renderForm({ orderId: 9 });
    expect(await screen.findByText("Editar Orden de Producción")).toBeInTheDocument();
    expect(await screen.findByText(sizeBadge("32", 2))).toBeInTheDocument();
    expect(screen.getByText(sizeBadge("34", 1))).toBeInTheDocument();
    // Add-item grid is not pre-filled from the loaded line; it appears only after picking a cincho.
    expect(screen.queryByText("Tallas *")).not.toBeInTheDocument();

    const itemsTable = screen.getByText(sizeBadge("32", 2)).closest("table");
    expect(within(itemsTable).getByText("FOSS-01 - Cincho Casual")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    });
    await waitFor(() => expect(updateProductionOrder).toHaveBeenCalledTimes(1));
    expect(updateProductionOrder.mock.calls[0][0]).toBe(9);
    expect(updateProductionOrder.mock.calls[0][1].items).toEqual([
      expect.objectContaining({
        id: 44,
        productId: 1,
        quantity: 3,
        sizes: { "32": 2, "34": 1 },
      }),
    ]);
  });
});
