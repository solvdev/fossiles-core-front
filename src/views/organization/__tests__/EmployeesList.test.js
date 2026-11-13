import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import EmployeesList from "../EmployeesList";
import { changeEmployeeStatus, deleteEmployee, getEmployees } from "services/employeeService";
import { getDepartments } from "services/departmentService";
import { getCostCenters } from "services/costCenterService";
import { getOperationalUnits } from "services/operationalUnitService";

jest.mock("services/employeeService");
jest.mock("services/departmentService");
jest.mock("services/costCenterService");
jest.mock("services/operationalUnitService");
jest.mock("utils/notificationHelper");
jest.mock("../EmployeesForm", () => () => null);

let mockGranted = new Set();
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (code) => mockGranted.has(code) }),
}));

const base = { email: "", dpi: "", hireDate: "2026-01-10", position: "Vendedora", salary: 4000, departmentId: 1, igssEnabled: true, irtraEnabled: true };
const employees = [
  { ...base, id: 1, firstName: "Ana", lastName: "Activa", status: "active" },
  { ...base, id: 2, firstName: "Beto", lastName: "SinSeguro", status: "active", igssEnabled: false },
  { ...base, id: 3, firstName: "Carla", lastName: "Baja", status: "inactive" },
];

beforeEach(() => {
  mockGranted = new Set(["PLANILLA.CORRIDAS.VER"]);
  getEmployees.mockResolvedValue(employees);
  getDepartments.mockResolvedValue([{ id: 1, code: "K", name: "Kiosco Miraflores" }]);
  getCostCenters.mockResolvedValue([]);
  getOperationalUnits.mockResolvedValue([]);
  changeEmployeeStatus.mockResolvedValue({});
  deleteEmployee.mockResolvedValue({});
});
afterEach(cleanup);

const rowOf = (name) => screen.getByText(name).closest("tr");

test("abre con los activos y muestra quién no goza IGSS", async () => {
  render(<EmployeesList />);
  await screen.findByText("Ana Activa");
  expect(screen.queryByText("Carla Baja")).not.toBeInTheDocument();
  expect(within(rowOf("Ana Activa")).getByText("IGSS")).toBeInTheDocument();
  expect(within(rowOf("Beto SinSeguro")).getByText("Sin IGSS")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^Inactivos/ }));
  expect(screen.getByText("Carla Baja")).toBeInTheDocument();
  expect(screen.queryByText("Ana Activa")).not.toBeInTheDocument();
});

test("la tarjeta Sin IGSS filtra a quienes no lo gozan", async () => {
  render(<EmployeesList />);
  await screen.findByText("Ana Activa");
  fireEvent.click(screen.getByRole("button", { name: /^1\s*Sin IGSS/ }));
  expect(screen.getByText("Beto SinSeguro")).toBeInTheDocument();
  expect(screen.queryByText("Ana Activa")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
  expect(screen.getByText("Ana Activa")).toBeInTheDocument();
});

test("desde el menú de cada fila se desactiva y se elimina con confirmación", async () => {
  render(<EmployeesList />);
  await screen.findByText("Ana Activa");

  fireEvent.click(within(rowOf("Ana Activa")).getByRole("button", { name: "Más acciones de Ana Activa" }));
  fireEvent.click(within(rowOf("Ana Activa")).getByText("Desactivar (dar de baja)"));
  await waitFor(() => expect(changeEmployeeStatus).toHaveBeenCalledWith(1, "inactive"));

  fireEvent.click(within(rowOf("Beto SinSeguro")).getByRole("button", { name: "Más acciones de Beto SinSeguro" }));
  fireEvent.click(within(rowOf("Beto SinSeguro")).getByText("Eliminar…"));
  expect(deleteEmployee).not.toHaveBeenCalled();
  const confirm = await screen.findByRole("button", { name: /^Eliminar$/ });
  await act(async () => { fireEvent.click(confirm); });
  await waitFor(() => expect(deleteEmployee).toHaveBeenCalledWith(2));
});

test("el salario solo lo ve quien lleva la planilla", async () => {
  render(<EmployeesList />);
  await screen.findByText("Ana Activa");
  expect(within(rowOf("Ana Activa")).getByText(/4,000/)).toBeInTheDocument();
  cleanup();
  mockGranted = new Set();
  render(<EmployeesList />);
  await screen.findByText("Ana Activa");
  expect(screen.queryByRole("columnheader", { name: /Salario/ })).not.toBeInTheDocument();
});
