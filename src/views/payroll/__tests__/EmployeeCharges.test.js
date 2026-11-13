import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import EmployeeCharges from "../EmployeeCharges";
import {
  createEmployeeCharge,
  decideEmployeeCharge,
  getEmployeeCharges,
  getPayrollProfiles,
  markEmployeeChargePaid,
} from "services/payrollService";

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
const showAll = () => fireEvent.click(screen.getByRole("button", { name: /^Todos/ }));

beforeEach(() => {
  mockGranted = new Set(["PLANILLA.CARGOS.VER", "PLANILLA.CARGOS.EDITAR"]);
  getEmployeeCharges.mockResolvedValue(charges);
});
afterEach(cleanup);

test("abre en lo que espera decisión y resume los montos", async () => {
  render(<EmployeeCharges />);
  await screen.findByText("BETO ADMIN");
  expect(getEmployeeCharges).toHaveBeenCalledWith({});
  expect(screen.queryByText("ANA PLANTA")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Por decidir/ })).toHaveAttribute("aria-pressed", "true");
  const summary = screen.getByRole("region", { name: "Resumen de cargos" });
  expect(within(summary).getByText("Esperan decisión")).toBeInTheDocument();
  expect(within(summary).getByText("Q 100.00 sin definir cómo se cobra")).toBeInTheDocument();
  expect(within(summary).getByText("Q 80.00")).toBeInTheDocument();
});

test("cada cargo ofrece solo las acciones que le corresponden", async () => {
  render(<EmployeeCharges />);
  await screen.findByText("BETO ADMIN");
  showAll();

  expect(within(rowOf("ANA PLANTA")).queryByRole("radiogroup")).not.toBeInTheDocument();
  expect(within(rowOf("ANA PLANTA")).getByText("Descuento en planilla")).toBeInTheDocument();
  expect(rowButtons("ANA PLANTA")).toEqual(["Anular"]);

  const choices = within(rowOf("BETO ADMIN")).getAllByRole("radio");
  expect(choices).toHaveLength(3);
  choices.forEach((choice) => expect(choice).toHaveAttribute("aria-checked", "false"));
  expect(rowButtons("BETO ADMIN")).toEqual(["Anular"]);
  expect(rowButtons("CARLA ADMIN")).toContain("Pagado");
  expect(rowButtons("DORA ADMIN")).toEqual([]);

  expect(within(rowOf("ELSA ADMIN")).queryByRole("radiogroup")).not.toBeInTheDocument();
  expect(within(rowOf("ELSA ADMIN")).getByText(/80.00 en borrador/)).toBeInTheDocument();
  expect(rowButtons("ELSA ADMIN")).toEqual([]);
});

test("Contabilidad decide la forma de pago y registra el pago con confirmación", async () => {
  decideEmployeeCharge.mockResolvedValue({});
  markEmployeeChargePaid.mockResolvedValue({});
  render(<EmployeeCharges />);
  await screen.findByText("BETO ADMIN");

  fireEvent.click(within(rowOf("BETO ADMIN")).getByRole("radio", { name: "Transferencia" }));
  await act(async () => {
    fireEvent.click(within(rowOf("BETO ADMIN")).getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(decideEmployeeCharge).toHaveBeenCalledWith(2, "TRANSFERENCIA"));

  showAll();
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
  showAll();
  const radio = (name, label) => within(rowOf(name)).getByRole("radio", { name: label });
  expect(radio("FABI PLANTA", "Descuento en planilla")).toBeEnabled();
  expect(radio("FABI PLANTA", "Transferencia")).toBeDisabled();
  expect(radio("FABI PLANTA", "Efectivo")).toBeDisabled();
  ["Descuento en planilla", "Transferencia", "Efectivo"].forEach((label) => expect(radio("GABY PLANTA", label)).toBeEnabled());
  expect(within(rowOf("GABY PLANTA")).getByText(/de baja/)).toBeInTheDocument();

  fireEvent.click(radio("GABY PLANTA", "Efectivo"));
  await act(async () => {
    fireEvent.click(within(rowOf("GABY PLANTA")).getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(decideEmployeeCharge).toHaveBeenCalledWith(7, "EFECTIVO"));
});

test("varios cargos se deciden a la vez y los de planta se quedan en descuento", async () => {
  decideEmployeeCharge.mockResolvedValue({});
  getEmployeeCharges.mockResolvedValue([
    { ...base, id: 2, employeeName: "BETO ADMIN", payGroup: "ADMINISTRACION", amount: 100, balance: 100, settlementMethod: null, status: "PENDIENTE" },
    { ...base, id: 6, employeeName: "FABI PLANTA", payGroup: "PLANTA", employeeActive: true, amount: 90, balance: 90,
      settlementMethod: null, status: "PENDIENTE" },
  ]);
  render(<EmployeeCharges />);
  await screen.findByText("BETO ADMIN");
  fireEvent.click(screen.getByRole("checkbox", { name: /Seleccionar todos/ }));
  const bulk = await screen.findByRole("region", { name: "Acciones en lote" });
  expect(within(bulk).getByText("2 seleccionados")).toBeInTheDocument();
  await act(async () => { fireEvent.click(within(bulk).getByRole("button", { name: "Transferencia" })); });
  await waitFor(() => expect(decideEmployeeCharge).toHaveBeenCalledTimes(1));
  expect(decideEmployeeCharge).toHaveBeenCalledWith(2, "TRANSFERENCIA");
});

test("sin permiso de edición los cargos solo se consultan", async () => {
  mockGranted = new Set(["PLANILLA.CARGOS.VER"]);
  render(<EmployeeCharges />);
  await screen.findByText("BETO ADMIN");
  showAll();
  ["ANA PLANTA", "BETO ADMIN", "CARLA ADMIN", "ELSA ADMIN"].forEach((name) => {
    expect(rowButtons(name)).toEqual([]);
    expect(within(rowOf(name)).queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(within(rowOf(name)).queryByRole("checkbox")).not.toBeInTheDocument();
  });
});

describe("cargo manual", () => {
  const profiles = [
    { id: 21, fullName: "ANA PLANTA", payGroup: "PLANTA", status: "active" },
    { id: 22, fullName: "BETO KIOSCO", payGroup: "ADMINISTRACION", status: "active" },
    { id: 23, fullName: "CARLA BAJA", payGroup: "ADMINISTRACION", status: "inactive" },
  ];
  const openForm = async () => {
    mockGranted = new Set(["PLANILLA.CARGOS.VER", "PLANILLA.CARGOS.EDITAR", "PLANILLA.CARGOS.CREAR"]);
    getPayrollProfiles.mockResolvedValue(profiles);
    render(<EmployeeCharges />);
    await screen.findByText("BETO ADMIN");
    fireEvent.click(screen.getByRole("button", { name: "Nuevo cargo" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuevo cargo a un colaborador" });
    await within(dialog).findByRole("option", { name: /BETO KIOSCO/ });
    return dialog;
  };

  test("solo quien tiene el permiso ve el botón", async () => {
    render(<EmployeeCharges />);
    await screen.findByText("BETO ADMIN");
    expect(screen.queryByRole("button", { name: "Nuevo cargo" })).not.toBeInTheDocument();
  });

  test("ofrece solo colaboradores activos y no registra sin aceptación, motivo ni monto", async () => {
    const dialog = await openForm();
    expect(within(dialog).queryByRole("option", { name: /CARLA BAJA/ })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Registrar cargo" })); });
    expect(within(dialog).getByText("Elija al colaborador.")).toBeInTheDocument();
    expect(within(dialog).getByText("Indique un monto mayor que cero.")).toBeInTheDocument();
    expect(within(dialog).getByText("Escriba qué pasó y cómo se calculó el monto.")).toBeInTheDocument();
    expect(within(dialog).getByText("Confirme que el colaborador aceptó el cargo.")).toBeInTheDocument();
    expect(createEmployeeCharge).not.toHaveBeenCalled();
  });

  test("registra el cargo con cuota y la aceptación del colaborador", async () => {
    createEmployeeCharge.mockResolvedValue({});
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText("Colaborador"), { target: { value: "22" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Faltante de caja" }));
    fireEvent.change(within(dialog).getByLabelText(/Monto/), { target: { value: "300" } });
    fireEvent.change(within(dialog).getByLabelText("Motivo"), { target: { value: "Faltaron Q300 en el cierre" } });
    fireEvent.click(within(dialog).getByLabelText("Cobrar en cuotas"));
    fireEvent.change(within(dialog).getByLabelText("Cuota por quincena"), { target: { value: "100" } });
    expect(within(dialog).getByText(/3 quincenas/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText("El colaborador aceptó este cargo"));
    fireEvent.change(within(dialog).getByLabelText("Dónde está la constancia"), { target: { value: "Carta firmada" } });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Registrar cargo" })); });
    await waitFor(() => expect(createEmployeeCharge).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 22, concept: "FALTANTE_CAJA", amount: 300, reason: "Faltaron Q300 en el cierre", reference: null,
      employeeAuthorized: true, authorizationNote: "Carta firmada", installmentAmount: 100,
    })));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(getEmployeeCharges).toHaveBeenCalledTimes(2);
  });

  test("una cuota mayor que el monto se rechaza", async () => {
    const dialog = await openForm();
    fireEvent.change(within(dialog).getByLabelText(/Monto/), { target: { value: "100" } });
    fireEvent.click(within(dialog).getByLabelText("Cobrar en cuotas"));
    fireEvent.change(within(dialog).getByLabelText("Cuota por quincena"), { target: { value: "150" } });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Registrar cargo" })); });
    expect(within(dialog).getByText("La cuota no puede ser mayor que el monto.")).toBeInTheDocument();
    expect(createEmployeeCharge).not.toHaveBeenCalled();
  });
});
