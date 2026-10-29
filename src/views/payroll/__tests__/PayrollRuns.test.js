import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import * as XLSX from "xlsx-js-style";
import PayrollRuns from "../PayrollRuns";
import {
  approvePayrollRun,
  createPayrollRun,
  getPayDays,
  getPayrollProfiles,
  getPayrollRun,
  getPayrollRuns,
  recalculatePayrollRun,
} from "services/payrollService";

jest.mock("services/payrollService");
jest.mock("utils/notificationHelper");
jest.mock("xlsx-js-style", () => ({ ...jest.requireActual("xlsx-js-style"), writeFile: jest.fn() }));

const ALL = ["PLANILLA.CORRIDAS.VER", "PLANILLA.CORRIDAS.CREAR", "PLANILLA.CORRIDAS.APROBAR"];
let mockGranted = new Set(ALL);
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (code) => mockGranted.has(code) }),
}));

const cheque = {
  id: 1, employeeId: 11, employeeName: "ANA PRUEBA", position: "OPERARIO", employmentType: "PLANILLA",
  paymentMethod: "CHEQUE", bankAccount: null, monthlySalary: 4000, daysPaid: 15, baseSalary: 2000,
  bonification: 125, igssEmployee: 96.6, isr: 0, opiDiscount: 0, otherDeductions: 0, netPay: 2028.4,
  igssEmployer: 213.4, irtra: 20, intecap: 20, chequeNumber: null,
};
const transfer = {
  ...cheque, id: 2, employeeId: 12, employeeName: "BETO PRUEBA", paymentMethod: "TRANSFERENCIA BANCARIA",
  baseSalary: 1500, bonification: 0, igssEmployee: 0, netPay: 1500, igssEmployer: 0, irtra: 0, intecap: 0,
};
const draft = (overrides = {}) => ({
  id: 9, payGroup: "PLANTA", scheduledDate: "2026-11-05", payDate: "2026-11-05", periodStart: "2026-10-16",
  periodEnd: "2026-10-31", status: "BORRADOR", bankName: "BANCO G Y T CONTINENTAL", totalGross: 3625,
  totalDeductions: 96.6, totalNet: 3528.4, lines: [cheque, transfer], warnings: [], stale: false, ...overrides,
});

const buttonNames = () => screen.getAllByRole("button").map((button) => button.textContent.trim());

async function openRun(run) {
  getPayrollRun.mockResolvedValue(run);
  render(<PayrollRuns />);
  fireEvent.click(await screen.findByRole("button", { name: /#9/ }));
  await screen.findByText(/Planilla #9/);
}

beforeEach(() => {
  mockGranted = new Set(ALL);
  getPayDays.mockResolvedValue([
    { payGroup: "PLANTA", scheduledDate: "2026-11-05", payDate: "2026-11-05", periodStart: "2026-10-16",
      periodEnd: "2026-10-31", runId: 9, runStatus: "BORRADOR" },
    { payGroup: "ADMINISTRACION", scheduledDate: "2026-11-15", payDate: "2026-11-13", periodStart: "2026-11-01",
      periodEnd: "2026-11-15", runId: null, runStatus: null },
  ]);
  getPayrollRuns.mockResolvedValue([]);
});
afterEach(cleanup);

test("lista los días de pago del calendario y solo quien prepara ve Preparar", async () => {
  createPayrollRun.mockResolvedValue(draft({ id: 10, payGroup: "ADMINISTRACION" }));
  render(<PayrollRuns />);
  expect(await screen.findByText("13/11/2026")).toBeInTheDocument();
  expect(screen.getByText("(antes de la fecha programada)")).toBeInTheDocument();
  expect(screen.getByText("01/11/2026 al 15/11/2026")).toBeInTheDocument();
  expect(getPayDays).toHaveBeenCalledWith();

  const prepare = screen.getAllByRole("button", { name: "Preparar" });
  expect(prepare).toHaveLength(1);
  fireEvent.click(prepare[0]);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/período del 01\/11\/2026 al 15\/11\/2026/)).toBeInTheDocument();
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Preparar" })); });
  expect(createPayrollRun).toHaveBeenCalledWith({ payGroup: "ADMINISTRACION", scheduledDate: "2026-11-15" });
  expect(await screen.findByText(/Planilla #10/)).toBeInTheDocument();

  cleanup();
  mockGranted = new Set(["PLANILLA.CORRIDAS.VER"]);
  render(<PayrollRuns />);
  await screen.findByText("13/11/2026");
  expect(screen.queryByRole("button", { name: "Preparar" })).not.toBeInTheDocument();
});

test("un borrador muestra sus avisos y se aprueba con confirmación", async () => {
  approvePayrollRun.mockResolvedValue(draft({ status: "APROBADA" }));
  await openRun(draft({ warnings: ["Cobran por transferencia sin número de cuenta: 1"] }));
  expect(screen.getByText("Cobran por transferencia sin número de cuenta: 1")).toBeInTheDocument();
  const names = buttonNames();
  ["Recalcular", "Aprobar", "Fecha de pago", "Anular", "Excel"].forEach((name) => expect(names).toContain(name));
  ["Numerar cheques", "Registrar pago", "Vouchers", "Cheques"].forEach((name) => expect(names).not.toContain(name));

  fireEvent.click(screen.getByRole("button", { name: "Aprobar" }));
  const dialog = await screen.findByRole("dialog");
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Aprobar" })); });
  await waitFor(() => expect(approvePayrollRun).toHaveBeenCalledWith(9));
});

test("no ofrece aprobar un borrador desactualizado ni uno con alguien sin forma de pago", async () => {
  await openRun(draft({ stale: true }));
  expect(screen.getByText(/Recalcule para poder aprobar/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();

  cleanup();
  await openRun(draft({ lines: [cheque, { ...transfer, paymentMethod: null }] }));
  expect(screen.getByText("Sin forma de pago")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Aprobar" })).not.toBeInTheDocument();
});

test("aprobada: sugiere el siguiente cheque y solo deja pagar con todos los cheques numerados", async () => {
  await openRun(draft({ status: "APROBADA", suggestedFirstChequeNumber: "00000130/GCF" }));
  expect(screen.getByText(/Faltan 1 números de cheque/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Registrar pago" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Vouchers" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Numerar cheques" }));
  expect(await screen.findByDisplayValue("00000130/GCF")).toBeInTheDocument();

  cleanup();
  await openRun(draft({ status: "APROBADA", lines: [{ ...cheque, chequeNumber: "00000130/GCF" }, transfer] }));
  const names = buttonNames();
  ["Registrar pago", "Vouchers", "Cheques", "Anular"].forEach((name) => expect(names).toContain(name));
});

test("anulada o sin colaboradores: no imprime ni ofrece aprobar", async () => {
  await openRun(draft({ status: "ANULADA", cancellationReason: "Error de cálculo",
    lines: [{ ...cheque, chequeNumber: "00000130/GCF" }, transfer] }));
  let names = buttonNames();
  ["Vouchers", "Cheques", "Aprobar", "Anular", "Numerar cheques"].forEach((name) => expect(names).not.toContain(name));
  expect(names).toContain("Excel");

  cleanup();
  await openRun(draft({ lines: [] }));
  names = buttonNames();
  expect(names).not.toContain("Aprobar");
  expect(names).toContain("Recalcular");
});

test("al volver de Fichas recarga la lista y la planilla abierta, y Fichas no se vuelve a montar", async () => {
  getPayrollProfiles.mockResolvedValue([]);
  await openRun(draft());
  expect(getPayrollRun).toHaveBeenCalledTimes(1);
  const tab = (label) => screen.getByText(label, { selector: "a" });

  fireEvent.click(tab("Fichas"));
  await waitFor(() => expect(getPayrollProfiles).toHaveBeenCalledTimes(1));
  getPayrollRun.mockResolvedValue(draft({ stale: true }));
  await act(async () => { fireEvent.click(tab("Planillas")); });
  expect(await screen.findByText(/Recalcule para poder aprobar/)).toBeInTheDocument();
  expect(getPayrollRun).toHaveBeenCalledTimes(2);
  expect(getPayrollRuns).toHaveBeenCalledTimes(2);

  fireEvent.click(tab("Fichas"));
  await act(async () => { fireEvent.click(tab("Planillas")); });
  expect(getPayrollProfiles).toHaveBeenCalledTimes(1);
});

test("si se abren dos planillas seguidas queda la última aunque la primera responda después", async () => {
  let answerFirst;
  getPayrollRuns.mockResolvedValue([{ ...draft({ id: 10, payGroup: "ADMINISTRACION" }), lines: undefined }]);
  getPayrollRun.mockImplementation((id) => (id === 9
    ? new Promise((resolve) => { answerFirst = () => resolve(draft()); })
    : Promise.resolve(draft({ id: 10, payGroup: "ADMINISTRACION" }))));
  render(<PayrollRuns />);
  fireEvent.click(await screen.findByRole("button", { name: /#9/ }));
  const listRow = screen.getAllByRole("row").find((row) => row.textContent.startsWith("10"));
  fireEvent.click(listRow);
  await screen.findByText(/Planilla #10/);
  await act(async () => { answerFirst(); });
  expect(screen.getByText(/Planilla #10/)).toBeInTheDocument();
  expect(screen.queryByText(/Planilla #9/)).not.toBeInTheDocument();
});

test("la planilla abierta ocupa la vista y Volver regresa a los días de pago", async () => {
  await openRun(draft());
  expect(screen.queryByText("Fecha programada")).not.toBeInTheDocument();
  expect(screen.queryByText("Todavía no hay planillas.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Volver a planillas/ }));
  expect(screen.getByText("Fecha programada")).toBeInTheDocument();
  expect(screen.queryByText(/Planilla #9/)).not.toBeInTheDocument();

  fireEvent.click(await screen.findByRole("button", { name: /#9/ }));
  await screen.findByText(/Planilla #9/);
  fireEvent.click(screen.getByRole("button", { name: "Cerrar planilla" }));
  expect(screen.getByText("Fecha programada")).toBeInTheDocument();
});

test("el siguiente paso y los avisos llevan a Fichas con el filtro de la planilla", async () => {
  getPayrollProfiles.mockResolvedValue([]);
  await openRun(draft({ lines: [cheque, { ...transfer, paymentMethod: null }], warnings: ["Sin departamento en la ficha: 1"] }));
  expect(screen.getByText("1 colaborador sin forma de pago")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Revisar en Fichas" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Completar en Fichas" }));
  await waitFor(() => expect(getPayrollProfiles).toHaveBeenCalled());
  expect(await screen.findByLabelText(/Solo con avisos/)).toBeChecked();
  expect(screen.getByDisplayValue("Planta")).toBeInTheDocument();
});

test("recalcular atenúa la tabla y resume lo que cambió", async () => {
  let finish;
  recalculatePayrollRun.mockImplementation(() => new Promise((resolve) => {
    finish = () => resolve(draft({ totalNet: 3628.4, lines: [{ ...cheque, netPay: 2128.4 }, transfer] }));
  }));
  await openRun(draft());
  fireEvent.click(screen.getByRole("button", { name: "Recalcular" }));
  expect(screen.getAllByText("Recalculando…").length).toBeGreaterThan(0);
  await act(async () => { finish(); });
  expect(screen.getByText("Recalculada: 1 colaborador cambió. Líquido total Q 3,628.40 (antes Q 3,528.40).")).toBeInTheDocument();
  expect(screen.queryByText("Recalculando…")).not.toBeInTheDocument();
});

test("una anulada ofrece preparar de nuevo la misma fecha", async () => {
  createPayrollRun.mockResolvedValue(draft({ id: 11 }));
  await openRun(draft({ status: "ANULADA", cancellationReason: "Salario equivocado" }));
  expect(screen.getByText("Motivo: Salario equivocado.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Preparar de nuevo" }));
  const dialog = await screen.findByRole("dialog");
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Preparar" })); });
  expect(createPayrollRun).toHaveBeenCalledWith({ payGroup: "PLANTA", scheduledDate: "2026-11-05" });
  expect(await screen.findByText(/Planilla #11/)).toBeInTheDocument();
});

test("pagada: ya no se anula ni se cambia; se exporta con la hoja de transferencias", async () => {
  await openRun(draft({ status: "PAGADA", lines: [{ ...cheque, chequeNumber: "00000130/GCF" }, transfer] }));
  const names = buttonNames();
  ["Anular", "Aprobar", "Recalcular", "Fecha de pago", "Registrar pago", "Numerar cheques"]
    .forEach((name) => expect(names).not.toContain(name));
  ["Excel", "Vouchers", "Cheques"].forEach((name) => expect(names).toContain(name));

  fireEvent.click(screen.getByRole("button", { name: "Excel" }));
  expect(XLSX.writeFile).toHaveBeenCalledTimes(1);
  const [book, fileName] = XLSX.writeFile.mock.calls[0];
  expect(fileName).toBe("planilla_planta_2026-11-05.xlsx");
  expect(book.SheetNames).toEqual(["Planilla", "Transferencias"]);
  const transfers = XLSX.utils.sheet_to_json(book.Sheets.Transferencias, { header: 1 });
  expect(transfers[1]).toEqual(["BETO PRUEBA", "SIN CUENTA", 1500]);
  expect(transfers[2]).toEqual(["TOTAL", "", 1500]);
});
