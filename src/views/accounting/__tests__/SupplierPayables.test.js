import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import {
  createSupplierPayment,
  generateRentPayables,
  getPayables,
  getPaymentConfig,
} from "services/supplierPaymentService";
import { getSuppliers } from "services/supplierService";
import { showError, showSuccess } from "utils/notificationHelper";
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
  expect(showSuccess).not.toHaveBeenCalled();
  expect(createSupplierPayment).toHaveBeenCalledTimes(1);
});

test("un error que no es 400 sigue yendo al toast de error, sin éxito", async () => {
  createSupplierPayment.mockRejectedValueOnce(new Error("No se pudo registrar el pago."));
  renderView();
  await screen.findByText("OC-10");
  fireEvent.click(screen.getByLabelText("Seleccionar OC-10"));
  fireEvent.click(screen.getByRole("button", { name: "Pagar estas órdenes" }));
  await screen.findByText("Qué se paga");
  fireEvent.click(screen.getByRole("button", { name: "Guardar pago" }));
  await waitFor(() => expect(showError).toHaveBeenCalledWith("No se pudo registrar el pago."));
  expect(showSuccess).not.toHaveBeenCalled();
});

test("búsqueda y chips de estado filtran las filas de la pestaña activa", async () => {
  const otherSupplier = {
    ...supplierRow,
    rowKey: "PO-11",
    code: "OC-11",
    supplierName: "Hilos GT",
    payeeName: "Hilos GT",
    payeeKey: "S-2",
    orderId: 11,
    status: "VENCIDA",
    daysToDue: -4,
    dueDate: "2026-11-13",
  };
  getPayables.mockImplementation((scope) => Promise.resolve(
    scope === "RENTS" ? rentsPayload : payload([supplierRow, otherSupplier])
  ));
  renderView();
  await screen.findByText("OC-10");
  expect(screen.getByText("OC-11")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Todas/ })).toHaveTextContent("Todas (2)");
  expect(screen.getByRole("button", { name: /Vencidas/ })).toHaveTextContent("Vencidas (1)");
  expect(screen.getByRole("button", { name: /Por vencer/ })).toHaveTextContent("Por vencer (1)");

  fireEvent.click(screen.getByRole("button", { name: /Vencidas/ }));
  expect(screen.queryByText("OC-10")).not.toBeInTheDocument();
  expect(screen.getByText("OC-11")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Todas/ }));
  fireEvent.change(screen.getByLabelText("Buscar proveedor u orden"), { target: { value: "Hilos" } });
  expect(screen.queryByText("OC-10")).not.toBeInTheDocument();
  expect(screen.getByText("OC-11")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Buscar proveedor u orden"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("tab", { name: "Rentas" }));
  await screen.findByText("RENTA-K4-2026-11");
  expect(screen.getByRole("button", { name: /Todas/ })).toHaveTextContent("Todas (1)");
  expect(screen.getByRole("button", { name: /Vencidas/ })).toHaveTextContent("Vencidas (1)");
  expect(screen.getByRole("button", { name: /Por vencer/ })).toHaveTextContent("Por vencer (0)");
  expect(screen.queryByText("OC-11")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Por vencer/ }));
  expect(screen.queryByText("RENTA-K4-2026-11")).not.toBeInTheDocument();
  expect(screen.getByText("No hay rentas por pagar con ese filtro.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /Todas/ }));
  fireEvent.change(screen.getByLabelText("Buscar renta o beneficiario"), { target: { value: "Ana" } });
  expect(screen.getByText("RENTA-K4-2026-11")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Buscar renta o beneficiario"), { target: { value: "Hilos" } });
  expect(screen.queryByText("RENTA-K4-2026-11")).not.toBeInTheDocument();
  expect(screen.getByText("No hay rentas por pagar con ese filtro.")).toBeInTheDocument();
});

test("VENCE pinta dueDate 2026-11-30 como día 30 bajo TZ UTC negativa, sin correr la fecha", async () => {
  const prevTz = process.env.TZ;
  process.env.TZ = "America/New_York";
  getPayables.mockResolvedValue(payload([{ ...supplierRow, dueDate: "2026-11-30", daysToDue: 13 }]));
  try {
    renderView();
    await screen.findByText("OC-10");
    expect(screen.getByText("30 nov 2026")).toBeInTheDocument();
    expect(screen.queryByText("29 nov 2026")).not.toBeInTheDocument();
    expect(screen.getByText("Vence en 13 días")).toBeInTheDocument();
  } finally {
    process.env.TZ = prevTz;
  }
});

test("el modal de generar rentas menciona otras rentas y manda solo el mes", async () => {
  generateRentPayables.mockResolvedValue({ created: 1, createdTotal: 2500, alreadyExisting: 0, skipped: [] });
  renderView();
  await screen.findByText("OC-10");
  fireEvent.click(screen.getByRole("button", { name: "Generar rentas del mes" }));
  expect(screen.getByText(/kiosco con contrato y por las otras rentas/i)).toBeInTheDocument();
  expect(screen.getByText(/vence el día de pago de ese mismo mes/i)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "2026-12" } });
  fireEvent.click(screen.getByRole("button", { name: "Generar" }));
  await waitFor(() => {
    expect(generateRentPayables).toHaveBeenCalledWith("2026-12");
    expect(screen.getByText("RESULTADO")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generar" })).toBeEnabled();
  });
  expect(generateRentPayables).toHaveBeenCalledTimes(1);
});

test("filas vacías muestran el vacío de la pestaña activa", async () => {
  getPayables.mockResolvedValue(payload([]));
  renderView();
  expect(await screen.findByText("No hay órdenes por pagar con ese filtro.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Todas/ })).toHaveTextContent("Todas (0)");
  expect(screen.queryByText("OC-10")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Rentas" }));
  expect(await screen.findByText("No hay rentas por pagar con ese filtro.")).toBeInTheDocument();
  expect(screen.queryByText("No hay órdenes por pagar con ese filtro.")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Todas/ })).toHaveTextContent("Todas (0)");
});

test("canPay=false oculta las acciones de pago en Proveedores y en Rentas", async () => {
  getPayables.mockImplementation((scope) => Promise.resolve({
    ...(scope === "RENTS" ? rentsPayload : suppliersPayload),
    canPay: false,
  }));
  renderView();
  await screen.findByText("OC-10");
  expect(screen.queryByRole("button", { name: "Generar rentas del mes" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nuevo documento por pagar" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Plantilla de saldos" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Subir saldos" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Seleccionar OC-10")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Pagar estas/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: "Rentas" }));
  await screen.findByText("RENTA-K4-2026-11");
  expect(screen.queryByRole("button", { name: "Generar rentas del mes" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Nuevo documento por pagar" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Seleccionar RENTA-K4-2026-11")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Pagar estas/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Anular" })).not.toBeInTheDocument();
});
