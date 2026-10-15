import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TasksByTable from "../TasksByTable";
import * as taskService from "services/taskService";
import { getProductionOrders } from "services/productionOrderService";
import { getDeskCountForDate } from "services/deskCountService";
import { getDeskSupervisorsForDate } from "services/deskSupervisorService";
import { getCinchoDayStatuses } from "services/cinchoDayStatusService";

jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasAnyRole: () => true }),
}));
jest.mock("services/taskService");
jest.mock("services/productionOrderService");
jest.mock("services/deskCountService");
jest.mock("services/deskSupervisorService");
jest.mock("services/cinchoDayStatusService");
jest.mock("components/common/DatePickerField", () => () => <input aria-label="fecha" />);
jest.mock("utils/dateTimeHelper", () => ({
  ...jest.requireActual("utils/dateTimeHelper"),
  getTodayYmdGuatemala: () => "2026-10-14",
}));

const item = (id, code) => ({ id, productCode: code, productName: `Producto ${code}`, colorName: "Negro", quantity: 10, estimatedHours: 1 });
const task = (id, extra = {}) => ({
  id, code: `T-${id}`, productionOrderId: 1, productionOrderCode: "OPV-1", status: "PENDING",
  scheduledDate: "2026-10-14", desk: null, dieCutReady: true, quantity: 10, estimatedHours: 1,
  items: [item(id * 10, `P${id}`)], ...extra,
});

// CRA reinicia los mocks antes de cada prueba, así que se definen aquí.
beforeEach(() => {
  getProductionOrders.mockResolvedValue([]);
  getDeskCountForDate.mockResolvedValue({ numDesks: 3 });
  getDeskSupervisorsForDate.mockResolvedValue({ assignments: [] });
  getCinchoDayStatuses.mockResolvedValue({});
  // Por defecto el servidor no tiene /tasks/board: se usa el listado completo.
  taskService.getBoardTasks.mockRejectedValue(Object.assign(new Error("no existe"), { status: 404 }));
  taskService.getTasks.mockResolvedValue([
    task(1, { desk: 1 }),
    task(2, { desk: 2, status: "IN_PROGRESS", startedAt: "2026-10-14T08:00:00" }),
    task(3, { desk: null, dieCutReady: true }),
  ]);
  taskService.getDieCutPending.mockResolvedValue([]);
  taskService.getBacklogTasks.mockResolvedValue([{ id: 9, code: "T-9", scheduledDate: "2026-10-10", status: "PENDING", items: [] }]);
  taskService.getUnfinishedTasks.mockResolvedValue([]);
  taskService.getBlockedLeatherLines.mockResolvedValue([]);
  taskService.getDaySalesSummary.mockResolvedValue(null);
  taskService.getOplDispatchSummary.mockResolvedValue(null);
});

const mount = () => render(<MemoryRouter><TasksByTable /></MemoryRouter>);

describe("Tablero", () => {
  test("muestra el tablero con la capacidad, las mesas y las tarjetas", async () => {
    mount();
    expect(await screen.findByRole("heading", { name: "Tablero" })).toBeTruthy();
    expect(screen.getByText("Armar el día")).toBeTruthy();
    // capacidad: 3 mesas × 4 h
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/3 mesas activas/));
    await waitFor(() => expect(document.querySelectorAll(".tbs-desk-name")).toHaveLength(3));
    expect(document.querySelectorAll(".tbs-task")).toHaveLength(3); // dos en mesa y una en «Sin mesa»
    expect(screen.getByText("Por cortar")).toBeTruthy();
    // la tarea cortada sin mesa aparece en «Sin mesa» con su botón
    expect(await screen.findByText("Asignar mesa")).toBeTruthy();
  });

  test("ya no existen las vistas viejas", async () => {
    mount();
    await screen.findByRole("heading", { name: "Tablero" });
    ["Operación del día", "Cronograma", "Redistribuir", "Planificar", "Lista detallada"].forEach((t) => {
      expect(screen.queryByText(new RegExp(t))).toBeNull();
    });
  });

  test("la pestaña Atrasadas reúne lo atrasado", async () => {
    mount();
    await screen.findByRole("heading", { name: "Tablero" });
    await waitFor(() => expect(screen.getAllByText("1").length).toBeGreaterThan(0));
    fireEvent.click(screen.getByText("Atrasadas", { selector: "a, a *" }));
    expect(await screen.findByText(/Empezadas y sin terminar/)).toBeTruthy();
    expect(screen.getByText(/Pendientes sin hacer/)).toBeTruthy();
  });
});

describe("Tablero liviano (/tasks/board)", () => {
  test("no pide todas las tareas ni las órdenes al abrir y pinta los conteos del servidor", async () => {
    taskService.getBoardTasks.mockResolvedValue({
      tasks: [task(1, { desk: 1 }), task(3, { desk: null })],
      counts: { dieCutPending: 75, backlog: 400, unfinished: 83 },
    });
    mount();
    await screen.findByRole("heading", { name: "Tablero" });
    await waitFor(() => expect(document.querySelectorAll(".tbs-task")).toHaveLength(2));
    expect(screen.getByText("483 atrasadas")).toBeTruthy();
    expect(screen.getByText("75")).toBeTruthy(); // insignia de «Por cortar»
    expect(taskService.getTasks).not.toHaveBeenCalled();
    expect(getProductionOrders).not.toHaveBeenCalled();
    expect(taskService.getBacklogTasks).not.toHaveBeenCalled();
    expect(taskService.getBlockedLeatherLines).not.toHaveBeenCalled();
  });

  test("los listados se piden al abrir su pestaña", async () => {
    taskService.getBoardTasks.mockResolvedValue({ tasks: [], counts: { dieCutPending: 1, backlog: 1, unfinished: 0 } });
    mount();
    await screen.findByRole("heading", { name: "Tablero" });
    fireEvent.click(screen.getByText("Por cortar", { selector: "a, a *" }));
    await waitFor(() => expect(taskService.getDieCutPending).toHaveBeenCalled());
  });
});
