import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import {
  createSupplierPayment,
  getPayables,
  getPaymentConfig,
} from "services/supplierPaymentService";
import { getSuppliers } from "services/supplierService";
import { showError } from "utils/notificationHelper";
import SupplierPayables from "../SupplierPayables";

jest.mock("services/supplierPaymentService", () => ({
  getPayables: jest.fn(),
  getPaymentConfig: jest.fn(),
  createSupplierPayment: jest.fn(),
  createPayableDocument: jest.fn(),
  generateRentPayables: jest.fn(),
  importPayablesTemplate: jest.fn(),
  downloadPayablesTemplate: jest.fn(),
  voidPayableDocument: jest.fn(),
}));
jest.mock("services/supplierService", () => ({
  getSuppliers: jest.fn(),
}));
jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));
jest.mock("utils/supplierChequePrintFlow", () => ({
  printSupplierCheques: jest.fn(),
}));

const MIX_MESSAGE = "Un pago no puede combinar rentas con pagos a proveedores.";

const summary = (over = {}) => ({
  totalBalance: 5000,
  orderCount: 1,
  supplierCount: 1,
  overdueAmount: 0,
  overdueCount: 0,
  dueIn7DaysAmount: 5000,
  dueIn7DaysCount: 1,
  paidThisMonth: 0,
  paymentsThisMonth: 0,
  ...over,
});

const supplierRow = {
  rowKey: "PO-10",
  kind: "ORDEN",
  code: "OC-10",
  supplierName: "Cuero SA",
  payeeName: "Cuero SA",
  payeeKey: "S-1",
  orderId: 10,
  documentId: null,
  receivedDate: "2026-10-01",
  dueDate: "2026-11-20",
  daysToDue: 3,
  total: 5000,
  paid: 0,
  balance: 5000,
  status: "POR_VENCER",
  concept: null,
};

const rentRow = {
  rowKey: "DOC-88",
  kind: "RENTA",
  code: "RENTA-K4-2026-11",
  supplierName: "Ana López",
  payeeName: "Ana López",
  payeeKey: "S-4",
  orderId: null,
  documentId: 88,
  receivedDate: "2026-11-10",
  dueDate: "2026-11-10",
  daysToDue: -7,
  total: 2500,
  paid: 0,
  balance: 2500,
  status: "VENCIDA",
  concept: "Renta de kiosco",
};

const config = {
  payablesStartDate: "2026-01-01",
  methods: [
    { id: 1, name: "Efectivo", active: true, requiresBank: false, requiresReference: false, printsCheque: false },
  ],
  accounts: [],
};

const payload = (rows, summaryOver = {}) => ({
  today: "2026-11-17",
  summary: summary(summaryOver),
  rows,
  canPay: true,
});

const suppliersPayload = payload([supplierRow]);
const rentsPayload = payload([rentRow], {
  totalBalance: 2500,
  orderCount: 0,
  supplierCount: 0,
  overdueAmount: 2500,
  overdueCount: 1,
  dueIn7DaysAmount: 0,
  dueIn7DaysCount: 0,
});

const renderView = () => render(
  <MemoryRouter>
    <SupplierPayables />
  </MemoryRouter>
);

beforeEach(() => {
  getPayables.mockImplementation((scope) => Promise.resolve(scope === "RENTS" ? rentsPayload : suppliersPayload));
  getPaymentConfig.mockResolvedValue(config);
  getSuppliers.mockResolvedValue([]);
  createSupplierPayment.mockResolvedValue({ id: 1, number: "PAG-1", printsCheque: false });
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test("las pestañas piden el alcance SUPPLIERS y RENTS y cada una trae su resumen", async () => {
  renderView();
  await screen.findByText("OC-10");
  expect(getPayables).toHaveBeenCalledWith("SUPPLIERS");
  expect(screen.getByRole("tab", { name: "Proveedores" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("1 órdenes de 1 proveedores")).toBeInTheDocument();
  expect(screen.getByText("Vence en 3 días")).toBeInTheDocument();
  expect(screen.getByText("20 nov 2026")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Rentas" }));
  await screen.findByText("RENTA-K4-2026-11");
  expect(getPayables).toHaveBeenCalledWith("RENTS");
  expect(screen.getByRole("tab", { name: "Rentas" })).toHaveAttribute("aria-selected", "true");
  expect(screen.queryByText("OC-10")).not.toBeInTheDocument();
  expect(screen.getByText("1 renta")).toBeInTheDocument();
  expect(screen.getByText("Venció hace 7 días")).toBeInTheDocument();
  expect(screen.getAllByText("10 nov 2026").length).toBeGreaterThan(0);
  expect(screen.getByLabelText("Buscar renta o beneficiario")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Todas/ })).toHaveTextContent("Todas (1)");
});

test("cambiar de pestaña limpia la selección del pago", async () => {
  renderView();
  await screen.findByText("OC-10");
  fireEvent.click(screen.getByLabelText("Seleccionar OC-10"));
  expect(screen.getByText("1 orden de Cuero SA")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pagar estas órdenes" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Rentas" }));
  await screen.findByText("RENTA-K4-2026-11");
  expect(screen.queryByText(/de Cuero SA/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Pagar estas/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Seleccionar RENTA-K4-2026-11")).not.toBeChecked();
});

test("un 400 del pago muestra el message del backend", async () => {
  createSupplierPayment.mockRejectedValueOnce(new Error(MIX_MESSAGE));
  renderView();
  await screen.findByText("OC-10");
  fireEvent.click(screen.getByLabelText("Seleccionar OC-10"));
  fireEvent.click(screen.getByRole("button", { name: "Pagar estas órdenes" }));
  await screen.findByText("Qué se paga");
  fireEvent.click(screen.getByRole("button", { name: "Guardar pago" }));
  await waitFor(() => expect(showError).toHaveBeenCalledWith(MIX_MESSAGE));
  expect(createSupplierPayment).toHaveBeenCalledTimes(1);
});
