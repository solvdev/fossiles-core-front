import React from "react";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import StepDone from "../StepDone";

jest.mock("components/production/DownloadOpsModal", () => ({
  __esModule: true,
  default: ({ isOpen, workDateYmd, orders }) => (isOpen ? <div data-testid="ops-modal">{workDateYmd}·{orders.length}</div> : null),
  mergeOrdersForDownload: () => [],
}));

const baseTask = { clientId: "c1", orderCode: "OPV-1", lines: [{ quantity: 10, prdTimePerUnit: 0.2 }] };
const planner = (extra = {}) => ({
  result: { created: [{ clientId: "c1", code: "T-1", scheduledDate: "2026-10-14" }], leftovers: [] },
  tasks: [baseTask],
  date: "2026-10-14",
  downloadSheet: jest.fn(),
  printSheet: jest.fn(),
  startOver: jest.fn(),
  loadOpsDownload: jest.fn().mockResolvedValue({ date: "2026-10-14", orders: [{ id: 1 }], dayDeskTasks: [{ id: 5 }] }),
  ...extra,
});

describe("Paso 4: Descargar OPs", () => {
  test("«Descargar OPs» es la acción principal y abre el lote de las OPs del día", async () => {
    const p = planner();
    render(<MemoryRouter><StepDone planner={p} /></MemoryRouter>);
    fireEvent.click(screen.getByText("⬇ Descargar OPs"));
    await waitFor(() => expect(screen.getByTestId("ops-modal").textContent).toBe("2026-10-14·1"));
    expect(p.loadOpsDownload).toHaveBeenCalledWith("2026-10-14");
  });

  test("la hoja de mesas sigue disponible como acción secundaria", () => {
    const p = planner();
    render(<MemoryRouter><StepDone planner={p} /></MemoryRouter>);
    fireEvent.click(screen.getByText("Hoja de mesas (Excel)"));
    expect(p.downloadSheet).toHaveBeenCalledWith("2026-10-14");
  });
});
