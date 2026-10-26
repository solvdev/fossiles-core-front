import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import EmployeesForm from "../EmployeesForm";
import EmployeesList from "../EmployeesList";
import { createEmployee, getEmployeeById, getEmployees, updateEmployee } from "services/employeeService";
import { getDepartments } from "services/departmentService";
import { getCostCenters } from "services/costCenterService";
import { getOperationalUnits } from "services/operationalUnitService";
import { getUsers } from "services/userService";

jest.mock("services/employeeService");
jest.mock("services/departmentService");
jest.mock("services/costCenterService");
jest.mock("services/operationalUnitService");
jest.mock("services/userService");
jest.mock("utils/notificationHelper");

let mockGranted = new Set();
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (code) => mockGranted.has(code) }),
}));

const SALARIES = "PLANILLA.CORRIDAS.VER";
const departments = [
  { id: 1, code: "DEPT-PRODUCCION", name: "Producción" },
  { id: 2, code: "DEPT-ADMIN", name: "Administración" },
  { id: 3, code: "BOD-PT", name: "Productos terminados" },
  { id: 4, code: "PRODUC-02", name: "Línea 2" },
];
const employee = {
  id: 5, firstName: "Ana", lastName: "Prueba", email: "ana@prueba.com", phone: "", dpi: "1234",
  hireDate: "2026-01-10", position: "OPERARIO", salary: 4000, bankAccount: "", paymentMethod: "CHEQUE",
  bonification: 125, employmentType: "PLANILLA", payGroup: "PLANTA", nit: "", igssAffiliation: "",
  terminationDate: "2026-12-31", departmentId: 1, status: "active",
};
const selectWithOption = (text) => screen.getAllByRole("combobox")
  .find((select) => Array.from(select.options).some((option) => option.textContent.includes(text)));

beforeEach(() => {
  mockGranted = new Set();
  getDepartments.mockResolvedValue(departments);
  getCostCenters.mockResolvedValue([]);
  getOperationalUnits.mockResolvedValue([]);
  getUsers.mockResolvedValue([]);
  updateEmployee.mockResolvedValue({});
  createEmployee.mockResolvedValue({});
});
afterEach(cleanup);

async function openForm(props) {
  render(<EmployeesForm isOpen toggle={jest.fn()} onSuccess={jest.fn()} {...props} />);
  await waitFor(() => expect(selectWithOption("Producción")).toBeTruthy());
}

test("al elegir el departamento propone el grupo de pago", async () => {
  await openForm({ employeeId: null });
  const group = selectWithOption("Según departamento");
  fireEvent.change(selectWithOption("Producción"), { target: { value: "1" } });
  expect(group).toHaveValue("PLANTA");
  fireEvent.change(selectWithOption("Producción"), { target: { value: "2" } });
  expect(group).toHaveValue("ADMINISTRACION");
  // Misma regla que el backend: "Producción" en el nombre o "PRODUC" en el código.
  fireEvent.change(selectWithOption("Producción"), { target: { value: "3" } });
  expect(group).toHaveValue("ADMINISTRACION");
  fireEvent.change(selectWithOption("Producción"), { target: { value: "4" } });
  expect(group).toHaveValue("PLANTA");
});

test("quien no ve salarios no puede cambiarlos ni borrarlos al guardar", async () => {
  getEmployeeById.mockResolvedValue({ ...employee, salary: null, bonification: null });
  await openForm({ employeeId: 5 });
  await screen.findByDisplayValue("Ana");
  const locked = screen.getAllByPlaceholderText("Solo administración y Contabilidad");
  expect(locked).toHaveLength(5);
  locked.forEach((input) => expect(input).toBeDisabled());
  // Tampoco cambia los datos de pago, y cambiar el departamento no mueve el grupo de pago.
  [selectWithOption("TRANSFERENCIA BANCARIA"), selectWithOption("SERVICIOS"), selectWithOption("Según departamento"),
    screen.getByDisplayValue("2026-12-31")].forEach((input) => expect(input).toBeDisabled());
  fireEvent.change(selectWithOption("Producción"), { target: { value: "2" } });
  expect(selectWithOption("Según departamento")).toHaveValue("PLANTA");

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Actualizar" })); });
  await waitFor(() => expect(updateEmployee).toHaveBeenCalledWith(5, expect.objectContaining({
    salary: null, bonification: null, clearBonification: false, departmentId: 2, payGroup: null, employmentType: null,
    bankAccount: null, paymentMethod: null, terminationDate: null, clearTerminationDate: false,
  })));
});

test("con permiso, «Según departamento» fija el grupo del departamento y lo que estaba vacío no se borra", async () => {
  mockGranted = new Set([SALARIES]);
  getEmployeeById.mockResolvedValue({ ...employee, payGroup: "ADMINISTRACION", bonification: null, terminationDate: null });
  await openForm({ employeeId: 5 });
  await screen.findByDisplayValue("Ana");
  fireEvent.change(selectWithOption("Según departamento"), { target: { value: "" } });

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Actualizar" })); });
  await waitFor(() => expect(updateEmployee).toHaveBeenCalledWith(5, expect.objectContaining({
    payGroup: "PLANTA", clearBonification: false, clearTerminationDate: false,
  })));
});

test("con permiso, dejar vacías la bonificación y la fecha de baja las borra", async () => {
  mockGranted = new Set([SALARIES]);
  getEmployeeById.mockResolvedValue(employee);
  await openForm({ employeeId: 5 });
  fireEvent.change(await screen.findByDisplayValue("125"), { target: { value: "" } });
  fireEvent.change(screen.getByDisplayValue("2026-12-31"), { target: { value: "" } });

  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Actualizar" })); });
  await waitFor(() => expect(updateEmployee).toHaveBeenCalledWith(5, expect.objectContaining({
    salary: 4000, bonification: null, clearBonification: true, terminationDate: null, clearTerminationDate: true,
  })));
});

test("la lista solo muestra la columna de salario a quien puede verla", async () => {
  getEmployees.mockResolvedValue([{ ...employee, salary: null }]);
  render(<EmployeesList />);
  await screen.findByText("Ana Prueba");
  expect(screen.queryByText(/^Salario/)).not.toBeInTheDocument();

  cleanup();
  mockGranted = new Set([SALARIES]);
  getEmployees.mockResolvedValue([employee]);
  render(<EmployeesList />);
  await screen.findByText("Ana Prueba");
  expect(screen.getByText(/^Salario/)).toBeInTheDocument();
});
