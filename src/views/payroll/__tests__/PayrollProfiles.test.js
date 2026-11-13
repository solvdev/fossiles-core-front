import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import PayrollProfiles from "../PayrollProfiles";
import { getPayrollProfiles, updatePayrollProfile } from "services/payrollService";
import { getLocations } from "services/locationService";
import { showError } from "utils/notificationHelper";

jest.mock("services/payrollService");
jest.mock("services/locationService");
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
const openEditor = async (name) => {
  fireEvent.click(screen.getByRole("button", { name: `Editar ficha de ${name}` }));
  return screen.findByRole("dialog", { name });
};

beforeEach(() => {
  mockGranted = new Set(["PLANILLA.CORRIDAS.VER", "PLANILLA.CORRIDAS.CREAR"]);
  getPayrollProfiles.mockResolvedValue([ana, beto, carla]);
  getLocations.mockResolvedValue([]);
});
afterEach(cleanup);

test("la ficha se edita en un panel y se guarda completa", async () => {
  updatePayrollProfile.mockResolvedValue({ ...ana, bonification: null });
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(screen.queryByText("CARLA INACTIVA")).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  const dialog = await openEditor("ANA PRUEBA");
  fireEvent.change(within(dialog).getByLabelText(/Bonificación/), { target: { value: "" } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar ficha" }));
  });
  await waitFor(() => expect(updatePayrollProfile).toHaveBeenCalledWith(1, {
    employmentType: "PLANILLA", payGroup: "PLANTA", paymentMethod: "CHEQUE", bankAccount: null,
    salary: 4000, bonification: null, terminationDate: null, nit: "1234567", igssAffiliation: "999",
    igssEnabled: true, irtraEnabled: true,
  }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("cambiar la vinculación se refleja en la lista al guardar", async () => {
  updatePayrollProfile.mockImplementation((id, body) => Promise.resolve({ ...ana, employmentType: body.employmentType }));
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(within(rowOf("ANA PRUEBA")).getByText("Planilla")).toBeInTheDocument();

  const dialog = await openEditor("ANA PRUEBA");
  fireEvent.click(within(dialog).getByRole("radio", { name: "Servicios" }));
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar ficha" }));
  });
  await waitFor(() => expect(within(rowOf("ANA PRUEBA")).getByText("Servicios")).toBeInTheDocument());
});

test("no guarda una ficha sin forma de pago", async () => {
  getPayrollProfiles.mockResolvedValue([{ ...ana, paymentMethod: null, warnings: ["Sin forma de pago"] }]);
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  const dialog = await openEditor("ANA PRUEBA");
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar ficha" }));
  });
  expect(within(dialog).getByText("Indique la forma de pago.")).toBeInTheDocument();
  expect(updatePayrollProfile).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("radio", { name: "Efectivo" }));
  expect(within(dialog).queryByText("Indique la forma de pago.")).not.toBeInTheDocument();
});

test("no guarda una bonificación negativa", async () => {
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  const dialog = await openEditor("ANA PRUEBA");
  fireEvent.change(within(dialog).getByLabelText(/Bonificación/), { target: { value: "-5" } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar ficha" }));
  });
  expect(within(dialog).getByText("La bonificación no puede ser negativa.")).toBeInTheDocument();
  expect(updatePayrollProfile).not.toHaveBeenCalled();
});

test("si el servidor rechaza el guardado avisa y deja el panel abierto", async () => {
  updatePayrollProfile.mockRejectedValue(new Error("No se pudo guardar la ficha."));
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  const dialog = await openEditor("ANA PRUEBA");
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar ficha" }));
  });
  expect(showError).toHaveBeenCalledWith("No se pudo guardar la ficha.");
  expect(screen.getByRole("dialog", { name: "ANA PRUEBA" })).toBeInTheDocument();
});

test("los filtros muestran solo las fichas con avisos o también las inactivas", async () => {
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(screen.getByText("Transferencia sin número de cuenta")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Fichas con avisos/ }));
  expect(screen.queryByText("ANA PRUEBA")).not.toBeInTheDocument();
  expect(screen.getByText("BETO PRUEBA")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Fichas con avisos/ }));
  fireEvent.click(screen.getByLabelText(/Incluir inactivos/));
  expect(screen.getByText("CARLA INACTIVA")).toBeInTheDocument();
});

test("sin permiso para preparar planillas las fichas son de solo lectura", async () => {
  mockGranted = new Set(["PLANILLA.CORRIDAS.VER"]);
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(screen.queryByRole("button", { name: /Editar ficha/ })).not.toBeInTheDocument();
  fireEvent.click(rowOf("ANA PRUEBA"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(within(rowOf("ANA PRUEBA")).getByText("4,000.00")).toBeInTheDocument();
  expect(within(rowOf("BETO PRUEBA")).getByText("Ley")).toBeInTheDocument();
});

test("las fichas se ven en tres secciones: planta, kioscos y administración", async () => {
  const vera = { ...ana, id: 5, fullName: "VERA KIOSCO", payGroup: "ADMINISTRACION", departmentName: "Kiosco Miraflores", kiosk: true };
  getPayrollProfiles.mockResolvedValue([ana, { ...beto, warnings: [] }, vera]);
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(within(rowOf("VERA KIOSCO")).getByText("Kioscos")).toBeInTheDocument();
  expect(within(rowOf("BETO PRUEBA")).getByText("Administración")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^1\s*Kioscos/ }));
  expect(screen.getByText("VERA KIOSCO")).toBeInTheDocument();
  expect(screen.queryByText("ANA PRUEBA")).not.toBeInTheDocument();
  expect(screen.queryByText("BETO PRUEBA")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /^1\s*Kioscos/ }));
  fireEvent.change(screen.getByLabelText("Grupo"), { target: { value: "ADMINISTRACION" } });
  expect(screen.getByText("BETO PRUEBA")).toBeInTheDocument();
  expect(screen.queryByText("VERA KIOSCO")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Grupo"), { target: { value: "ADMIN_TODO" } });
  expect(screen.getByText("VERA KIOSCO")).toBeInTheDocument();
  expect(screen.queryByText("ANA PRUEBA")).not.toBeInTheDocument();
});

test("el seguro social se marca por persona y se ve en la lista", async () => {
  getPayrollProfiles.mockResolvedValue([ana, { ...beto, igssEnabled: false, warnings: [] }]);
  updatePayrollProfile.mockImplementation((id, body) => Promise.resolve({ ...ana, ...body }));
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  expect(within(rowOf("ANA PRUEBA")).getByText("IGSS")).toBeInTheDocument();
  expect(within(rowOf("BETO PRUEBA")).getByText("Sin IGSS")).toBeInTheDocument();

  const dialog = await openEditor("ANA PRUEBA");
  fireEvent.click(within(dialog).getByLabelText(/Lleva IRTRA e INTECAP/));
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Guardar ficha" })); });
  await waitFor(() => expect(updatePayrollProfile).toHaveBeenCalledWith(1, expect.objectContaining({ igssEnabled: true, irtraEnabled: false })));
});

test("el filtro de seguro muestra solo a quienes no gozan IGSS", async () => {
  getPayrollProfiles.mockResolvedValue([ana, { ...beto, igssEnabled: false, warnings: [] }]);
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  fireEvent.change(screen.getByLabelText("Seguro"), { target: { value: "SIN_IGSS" } });
  expect(screen.queryByText("ANA PRUEBA")).not.toBeInTheDocument();
  expect(screen.getByText("BETO PRUEBA")).toBeInTheDocument();
});

test("varias fichas se cambian de seguro a la vez", async () => {
  getPayrollProfiles.mockResolvedValue([ana, { ...beto, warnings: [] }]);
  updatePayrollProfile.mockImplementation((id, body) => Promise.resolve({ ...(id === 1 ? ana : beto), ...body, warnings: [] }));
  render(<PayrollProfiles />);
  await screen.findByText("ANA PRUEBA");
  fireEvent.click(screen.getByLabelText("Seleccionar las fichas de la página"));
  const bulk = await screen.findByRole("region", { name: "Acciones en lote" });
  expect(within(bulk).getByText("2 seleccionados")).toBeInTheDocument();
  await act(async () => { fireEvent.click(within(bulk).getByRole("button", { name: "No goza" })); });
  await waitFor(() => expect(updatePayrollProfile).toHaveBeenCalledTimes(2));
  expect(updatePayrollProfile).toHaveBeenCalledWith(1, expect.objectContaining({ igssEnabled: false, irtraEnabled: true }));
  expect(updatePayrollProfile).toHaveBeenCalledWith(2, expect.objectContaining({ igssEnabled: false }));
  await waitFor(() => expect(within(rowOf("ANA PRUEBA")).getByText("Sin IGSS")).toBeInTheDocument());
  expect(screen.queryByRole("region", { name: "Acciones en lote" })).not.toBeInTheDocument();
});

describe("kiosco del personal de kiosco", () => {
  const vera = { ...ana, id: 5, fullName: "VERA KIOSCO", payGroup: "ADMINISTRACION", departmentName: "Kiosco Miraflores", kiosk: true, kioskLocationId: null, warnings: [] };

  beforeEach(() => {
    getLocations.mockResolvedValue([{ id: 7, name: "Kiosco Miraflores", code: "KM" }, { id: 8, name: "Bodega", code: "B1" }]);
  });

  test("avisa quién no tiene kiosco y deja elegirlo con una lista solo de kioscos", async () => {
    getPayrollProfiles.mockResolvedValue([ana, vera]);
    updatePayrollProfile.mockImplementation((id, body) => Promise.resolve({ ...vera, ...body }));
    render(<PayrollProfiles />);
    await screen.findByText("VERA KIOSCO");
    expect(within(rowOf("VERA KIOSCO")).getByText("Sin kiosco asignado")).toBeInTheDocument();
    expect(within(rowOf("ANA PRUEBA")).queryByText("Sin kiosco asignado")).not.toBeInTheDocument();

    const dialog = await openEditor("VERA KIOSCO");
    const select = within(dialog).getByLabelText("Kiosco donde trabaja");
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(["Sin kiosco asignado", "Kiosco Miraflores"]);
    fireEvent.change(select, { target: { value: "7" } });
    await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Guardar ficha" })); });
    await waitFor(() => expect(updatePayrollProfile).toHaveBeenCalledWith(5, expect.objectContaining({ kioskLocationId: 7, clearKioskLocation: false })));
  });

  test("quien no es de kiosco no ve el campo ni manda el kiosco", async () => {
    getPayrollProfiles.mockResolvedValue([ana]);
    render(<PayrollProfiles />);
    await screen.findByText("ANA PRUEBA");
    const dialog = await openEditor("ANA PRUEBA");
    expect(within(dialog).queryByLabelText("Kiosco donde trabaja")).not.toBeInTheDocument();
  });
});
