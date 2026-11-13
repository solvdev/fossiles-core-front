import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import EmployeeCharges from "../EmployeeCharges";
import { decideEmployeeCharge, getEmployeeCharges, markEmployeeChargePaid } from "services/payrollService";

jest.mock("services/payrollService");
jest.mock("utils/notificationHelper");

let mockGranted = new Set(["PLANILLA.CARGOS.VER", "PLANILLA.CARGOS.EDITAR"]);
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (code) => mockGranted.has(code) }),
}));

const base = { description: "Compra de colaborador ENVI-1", chargedOn: "2026-10-20", reservedInDrafts: 0 };
const charges = [
  { ...base, id: 1, employeeName: "ANA PLANTA", payGroup: "PLANTA", amount: 200, balance: 200, settlementMethod: "DESCUENTO", status: "PENDIENTE" },
  { ...base, id: 2, employeeName: "BETO ADMIN", payGroup: "ADMINISTRACION", amount: 100, balance: 100, settlementMethod: null, status: "PENDIENTE" },
  { ...base, id: 3, employeeName: "CARLA ADMIN", payGroup: "ADMINISTRACION", amount: 60, balance: 60, settlementMethod: "TRANSFERENCIA", status: "PENDIENTE" },
  { ...base, id: 4, employeeName: "DORA ADMIN", payGroup: "ADMINISTRACION", amount: 50, balance: 0, settlementMethod: "EFECTIVO", status: "PAGADO" },
  { ...base, id: 5, employeeName: "ELSA ADMIN", payGroup: "ADMINISTRACION", amount: 80, balance: 80, settlementMethod: "DESCUENTO", status: "PENDIENTE", reservedInDrafts: 80 },
];

const rowOf = (name) => screen.getByText(name).closest("tr");
const rowButtons = (name) => within(rowOf(name)).queryAllByRole("button").map((button) => button.textContent.trim());

beforeEach(() => {
  mockGranted = new Set(["PLANILLA.CARGOS.VER", "PLANILLA.CARGOS.EDITAR"]);
  getEmployeeCharges.mockResolvedValue(charges);
});
afterEach(cleanup);

test("cada cargo ofrece solo las acciones que le corresponden", async () => {
  render(<EmployeeCharges />);
  await screen.findByText("ANA PLANTA");
  expect(getEmployeeCharges).toHaveBeenCalledWith({ status: "" });
  expect(screen.getByText(/1 esperan decisión/)).toBeInTheDocument();

  expect(within(rowOf("ANA PLANTA")).queryByRole("combobox")).not.toBeInTheDocument();
  expect(within(rowOf("ANA PLANTA")).getByText("Descuento en planilla")).toBeInTheDocument();
  expect(rowButtons("ANA PLANTA")).toEqual(["Anular"]);

  expect(within(rowOf("BETO ADMIN")).getByRole("combobox")).toHaveValue("");
  expect(rowButtons("BETO ADMIN")).toEqual(["Anular"]);
  expect(rowButtons("CARLA ADMIN")).toContain("Pagado");
  expect(rowButtons("DORA ADMIN")).toEqual([]);

  expect(within(rowOf("ELSA ADMIN")).queryByRole("combobox")).not.toBeInTheDocument();
  expect(within(rowOf("ELSA ADMIN")).getByText(/80.00 en borrador/)).toBeInTheDocument();
  expect(rowButtons("ELSA ADMIN")).toEqual([]);
});

test("Contabilidad decide la forma de pago y registra el pago con confirmación", async () => {
  decideEmployeeCharge.mockResolvedValue({});
  markEmployeeChargePaid.mockResolvedValue({});
  render(<EmployeeCharges />);
  await screen.findByText("BETO ADMIN");

  fireEvent.change(within(rowOf("BETO ADMIN")).getByRole("combobox"), { target: { value: "TRANSFERENCIA" } });
  await act(async () => {
    fireEvent.click(within(rowOf("BETO ADMIN")).getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(decideEmployeeCharge).toHaveBeenCalledWith(2, "TRANSFERENCIA"));

  fireEvent.click(within(rowOf("CARLA ADMIN")).getByRole("button", { name: "Pagado" }));
  const dialog = await screen.findByRole("dialog");
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Marcar pagado" })); });
  await waitFor(() => expect(markEmployeeChargePaid).toHaveBeenCalledWith(3));
});

test("planta solo descuenta, salvo quien ya salió, que puede pagar por transferencia o en efectivo", async () => {
  decideEmployeeCharge.mockResolvedValue({});
  getEmployeeCharges.mockResolvedValue([
    { ...base, id: 6, employeeName: "FABI PLANTA", payGroup: "PLANTA", employeeActive: true, amount: 90, balance: 90,
      settlementMethod: null, status: "PENDIENTE" },
    { ...base, id: 7, employeeName: "GABY PLANTA", payGroup: "PLANTA", employeeActive: false, amount: 200, balance: 120,
      settlementMethod: "DESCUENTO", status: "PARCIAL" },
  ]);
  render(<EmployeeCharges />);
  await screen.findByText("FABI PLANTA");
  const options = (name) => Array.from(within(rowOf(name)).getByRole("combobox").options).map((o) => o.value);
  expect(options("FABI PLANTA")).toEqual(["", "DESCUENTO"]);
  expect(options("GABY PLANTA")).toEqual(["", "DESCUENTO", "TRANSFERENCIA", "EFECTIVO"]);
  expect(within(rowOf("GABY PLANTA")).getByText(/de baja/)).toBeInTheDocument();

  fireEvent.change(within(rowOf("GABY PLANTA")).getByRole("combobox"), { target: { value: "EFECTIVO" } });
  await act(async () => {
    fireEvent.click(within(rowOf("GABY PLANTA")).getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(decideEmployeeCharge).toHaveBeenCalledWith(7, "EFECTIVO"));
});

test("sin permiso de edición los cargos solo se consultan", async () => {
  mockGranted = new Set(["PLANILLA.CARGOS.VER"]);
  render(<EmployeeCharges />);
  await screen.findByText("ANA PLANTA");
  ["ANA PLANTA", "BETO ADMIN", "CARLA ADMIN", "ELSA ADMIN"].forEach((name) => {
    expect(rowButtons(name)).toEqual([]);
    expect(within(rowOf(name)).queryByRole("combobox")).not.toBeInTheDocument();
  });
});
