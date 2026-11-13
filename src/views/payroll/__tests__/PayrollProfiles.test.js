import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import PayrollProfiles from "../PayrollProfiles";
import { getPayrollProfiles, updatePayrollProfile } from "services/payrollService";
import { showError } from "utils/notificationHelper";

jest.mock("services/payrollService");
jest.mock("utils/notificationHelper");

let mockGranted = new Set(["PLANILLA.CORRIDAS.VER", "PLANILLA.CORRIDAS.CREAR"]);
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (code) => mockGranted.has(code) }),
}));

const ana = {
  id: 1, fullName: "ANA PRUEBA", position: "OPERARIO", departmentName: "Producción", status: "active",
  employmentType: "PLANILLA", payGroup: "PLANTA", departmentPayGroup: "PLANTA", paymentMethod: "CHEQUE",
  bankAccount: null, salary: 4000, bonification: 125, nit: "1234567", igssAffiliation: "999", terminationDate: null,
  warnings: [],
};
const beto = {
  ...ana, id: 2, fullName: "BETO PRUEBA", payGroup: "ADMINISTRACION", departmentName: "Kioscos",
  departmentPayGroup: "ADMINISTRACION", paymentMethod: "TRANSFERENCIA BANCARIA", salary: 3000, bonification: null,
  nit: null, igssAffiliation: null, warnings: ["Transferencia sin número de cuenta"],
};
const carla = { ...ana, id: 3, fullName: "CARLA INACTIVA", status: "inactive" };

const rowOf = (name) => screen.getByText(name).closest("tr");

beforeEach(() => {
  mockGranted = new Set(["PLANILLA.CORRIDAS.VER", "PLANILLA.CORRIDAS.CREAR"]);
  getPayrollProfiles.mockResolvedValue([ana, beto, carla]);
});
afterEach(cleanup);

test("Guardar aparece solo si la fila cambió y manda la ficha completa", async () => {
  updatePayrollProfile.mockResolvedValue({ ...ana, bonification: null });
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(screen.queryByText("CARLA INACTIVA")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();

  const [type] = within(rowOf("ANA PRUEBA")).getAllByRole("combobox");
  fireEvent.change(type, { target: { value: "SERVICIOS" } });
  expect(within(rowOf("ANA PRUEBA")).getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  fireEvent.change(type, { target: { value: "PLANILLA" } });
  expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();

  const [, bonification] = within(rowOf("ANA PRUEBA")).getAllByRole("spinbutton");
  fireEvent.change(bonification, { target: { value: "" } });
  await act(async () => {
    fireEvent.click(within(rowOf("ANA PRUEBA")).getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(updatePayrollProfile).toHaveBeenCalledWith(1, {
    employmentType: "PLANILLA", payGroup: "PLANTA", paymentMethod: "CHEQUE", bankAccount: null,
    salary: 4000, bonification: null, terminationDate: null, nit: "1234567", igssAffiliation: "999",
  }));
  expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
});

test("no guarda una ficha sin forma de pago", async () => {
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  const [, , method] = within(rowOf("ANA PRUEBA")).getAllByRole("combobox");
  fireEvent.change(method, { target: { value: "" } });
  await act(async () => {
    fireEvent.click(within(rowOf("ANA PRUEBA")).getByRole("button", { name: "Guardar" }));
  });
  expect(updatePayrollProfile).not.toHaveBeenCalled();
});

test("no guarda una bonificación negativa", async () => {
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  const [, bonification] = within(rowOf("ANA PRUEBA")).getAllByRole("spinbutton");
  fireEvent.change(bonification, { target: { value: "-5" } });
  await act(async () => {
    fireEvent.click(within(rowOf("ANA PRUEBA")).getByRole("button", { name: "Guardar" }));
  });
  expect(showError).toHaveBeenCalledWith("La bonificación no puede ser negativa.");
  expect(updatePayrollProfile).not.toHaveBeenCalled();
});

test("dos fichas guardadas a la vez conservan ambos resultados", async () => {
  const answers = {};
  updatePayrollProfile.mockImplementation((id, body) => new Promise((resolve) => {
    answers[id] = () => resolve({ ...(id === 1 ? ana : beto), employmentType: body.employmentType });
  }));
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  ["ANA PRUEBA", "BETO PRUEBA"].forEach((name) => {
    const [type] = within(rowOf(name)).getAllByRole("combobox");
    fireEvent.change(type, { target: { value: "SERVICIOS" } });
  });
  fireEvent.click(within(rowOf("ANA PRUEBA")).getByRole("button", { name: "Guardar" }));
  fireEvent.click(within(rowOf("BETO PRUEBA")).getByRole("button", { name: "Guardar" }));
  expect(within(rowOf("BETO PRUEBA")).getByRole("button", { name: "Guardar" })).toBeDisabled();

  await act(async () => { answers[2](); });
  expect(within(rowOf("ANA PRUEBA")).getByRole("button", { name: "Guardar" })).toBeDisabled();
  await act(async () => { answers[1](); });
  expect(screen.queryByRole("button", { name: "Guardar" })).not.toBeInTheDocument();
  ["ANA PRUEBA", "BETO PRUEBA"].forEach((name) =>
    expect(within(rowOf(name)).getAllByRole("combobox")[0]).toHaveValue("SERVICIOS"));
});

test("los filtros muestran solo las fichas con avisos o también las inactivas", async () => {
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(screen.getByText("Transferencia sin número de cuenta")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/Solo con avisos/));
  expect(screen.queryByText("ANA PRUEBA")).not.toBeInTheDocument();
  expect(screen.getByText("BETO PRUEBA")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/Solo con avisos/));
  fireEvent.click(screen.getByLabelText(/Incluir inactivos/));
  expect(screen.getByText("CARLA INACTIVA")).toBeInTheDocument();
});

test("sin permiso para preparar planillas las fichas son de solo lectura", async () => {
  mockGranted = new Set(["PLANILLA.CORRIDAS.VER"]);
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(within(rowOf("ANA PRUEBA")).queryByRole("combobox")).not.toBeInTheDocument();
  expect(within(rowOf("ANA PRUEBA")).getByText("4,000.00")).toBeInTheDocument();
  expect(within(rowOf("BETO PRUEBA")).getByText("Ley")).toBeInTheDocument();
});
