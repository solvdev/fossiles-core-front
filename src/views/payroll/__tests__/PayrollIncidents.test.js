import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import PayrollIncidents from "../PayrollIncidents";
import { cancelIncident, createIncidents, getIncidentWorkspace, getIncidents } from "services/payrollService";
import { todayIso } from "../payrollUi";

jest.mock("services/payrollService");
jest.mock("utils/notificationHelper");

let mockGranted = new Set(["PLANILLA.NOVEDADES.KIOSCOS"]);
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (code) => mockGranted.has(code) }),
}));

const workspace = {
  sections: ["KIOSCOS"],
  people: [
    { id: 1, fullName: "VERA KIOSCO", position: "Vendedora", section: "KIOSCOS", kioskName: "Kiosco A" },
    { id: 2, fullName: "BETA KIOSCO", position: "Encargada", section: "KIOSCOS", kioskName: "Kiosco A" },
  ],
  holidays: [
    { date: "2020-01-01", name: "Año Nuevo", halfDay: false, cityOnly: false },
    { date: "2099-12-24", name: "Nochebuena (desde el mediodía)", halfDay: true, cityOnly: false },
  ],
  overtimeFactor: 1.5, holidayFactor: 2, workdayHours: 8,
};
const incident = { id: 10, employeeId: 1, employeeName: "VERA KIOSCO", section: "KIOSCOS", kind: "HORA_EXTRA", dateFrom: todayIso(), dateTo: todayIso(), hours: 2, note: "Cierre de caja" };

beforeEach(() => {
  mockGranted = new Set(["PLANILLA.NOVEDADES.KIOSCOS"]);
  getIncidentWorkspace.mockResolvedValue(workspace);
  getIncidents.mockResolvedValue([incident]);
  createIncidents.mockResolvedValue([{ id: 11 }, { id: 12 }]);
  cancelIncident.mockResolvedValue({});
});
afterEach(cleanup);

const openNew = async () => {
  render(<PayrollIncidents />);
  fireEvent.click(await screen.findByRole("button", { name: "Nueva novedad" }));
  return screen.findByRole("dialog", { name: "Nueva novedad" });
};

test("muestra los feriados y solo deja registrar los que ya pasaron", async () => {
  render(<PayrollIncidents />);
  await screen.findByText("Año Nuevo");
  expect(screen.getByRole("button", { name: "Registrar quién trabajó el Año Nuevo" })).toBeEnabled();
  expect(screen.getByRole("button", { name: /Registrar quién trabajó el Nochebuena/ })).toBeDisabled();
  expect(screen.getByText("Medio día")).toBeInTheDocument();
  expect(screen.getByText(/Usted registra a:/)).toHaveTextContent("Kioscos · 2 personas");
});

test("lista las novedades del mes con su detalle", async () => {
  render(<PayrollIncidents />);
  const row = (await screen.findByText("Cierre de caja")).closest("tr");
  expect(within(row).getByText("VERA KIOSCO")).toBeInTheDocument();
  expect(within(row).getByText("Hora extra")).toBeInTheDocument();
  expect(within(row).getByText("2 h")).toBeInTheDocument();
});

test("registra horas extra a varias personas de una vez", async () => {
  const dialog = await openNew();
  expect(within(dialog).getByText(/×1.5 del valor de la hora/)).toBeInTheDocument();
  fireEvent.click(within(dialog).getByLabelText(/Todas las que se ven/));
  fireEvent.change(within(dialog).getByLabelText("Horas extra"), { target: { value: "2" } });
  fireEvent.change(within(dialog).getByLabelText("Nota"), { target: { value: "Cierre del sábado" } });
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Registrar a 2 personas" })); });
  await waitFor(() => expect(createIncidents).toHaveBeenCalledWith({
    employeeIds: [1, 2], kind: "HORA_EXTRA", dateFrom: todayIso(), dateTo: null, hours: 2, hourlyRate: null, note: "Cierre del sábado",
  }));
});

test("no registra sin personas ni horas y lo explica", async () => {
  const dialog = await openNew();
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Registrar" })); });
  expect(within(dialog).getByText("Elija al menos una persona.")).toBeInTheDocument();
  expect(within(dialog).getByText("Indique las horas extra: más de 0 y hasta 16.")).toBeInTheDocument();
  expect(createIncidents).not.toHaveBeenCalled();
});

test("desde un feriado se abre el formulario con el feriado elegido", async () => {
  render(<PayrollIncidents />);
  fireEvent.click(await screen.findByRole("button", { name: "Registrar quién trabajó el Año Nuevo" }));
  const dialog = await screen.findByRole("dialog", { name: "Nueva novedad" });
  expect(within(dialog).getByRole("radio", { name: "Feriado trabajado" })).toHaveAttribute("aria-checked", "true");
  expect(within(dialog).getByLabelText("Feriado trabajado")).toHaveValue("2020-01-01");
  fireEvent.click(within(dialog).getByLabelText(/VERA KIOSCO/));
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Registrar" })); });
  await waitFor(() => expect(createIncidents).toHaveBeenCalledWith(expect.objectContaining({
    employeeIds: [1], kind: "FERIADO_TRABAJADO", dateFrom: "2020-01-01", dateTo: null, hours: null,
  })));
});

test("una ausencia pide fecha inicial y final", async () => {
  const dialog = await openNew();
  fireEvent.click(within(dialog).getByRole("radio", { name: "Ausencia sin goce" }));
  fireEvent.click(within(dialog).getByLabelText(/VERA KIOSCO/));
  fireEvent.change(within(dialog).getByLabelText("Desde"), { target: { value: "2026-10-12" } });
  fireEvent.change(within(dialog).getByLabelText("Hasta"), { target: { value: "2026-10-10" } });
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Registrar" })); });
  expect(within(dialog).getByText("La fecha final no puede ser anterior a la inicial.")).toBeInTheDocument();
  expect(createIncidents).not.toHaveBeenCalled();
});

test("anular pide confirmación", async () => {
  render(<PayrollIncidents />);
  fireEvent.click(await screen.findByRole("button", { name: "Anular la novedad de VERA KIOSCO" }));
  const dialog = await screen.findByRole("dialog");
  expect(cancelIncident).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Anular" })); });
  await waitFor(() => expect(cancelIncident).toHaveBeenCalledWith(10));
});

test("sin personal a su cargo avisa y no deja registrar", async () => {
  getIncidentWorkspace.mockResolvedValue({ ...workspace, people: [] });
  getIncidents.mockResolvedValue([]);
  render(<PayrollIncidents />);
  expect(await screen.findByText(/No hay personal a su cargo/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Nueva novedad" })).toBeDisabled();
});

test("si el servidor niega el acceso lo muestra", async () => {
  getIncidentWorkspace.mockRejectedValue(new Error("No tiene permiso para registrar novedades de personal."));
  render(<PayrollIncidents />);
  expect(await screen.findByText("No tiene permiso para registrar novedades de personal.")).toBeInTheDocument();
});
