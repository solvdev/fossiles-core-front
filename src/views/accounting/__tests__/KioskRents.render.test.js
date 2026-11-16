import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  createOtherRent,
  deactivateOtherRent,
  getKioskRents,
  importKioskRentTemplate,
  saveKioskRent,
  saveOtherRent,
} from "services/kioskRentService";
import { showError } from "utils/notificationHelper";
import KioskRents from "../KioskRents";

jest.mock("services/kioskRentService");
jest.mock("utils/notificationHelper", () => ({
  showError: jest.fn(),
  showSuccess: jest.fn(),
}));

const kiosk = {
  rentType: "KIOSK",
  rentId: null,
  locationId: 4,
  code: "K4",
  name: "Kiosco Centro",
  category: null,
  description: null,
  landlordName: "Ana López",
  monthlyRent: 2500,
  paymentDay: 10,
  contractStart: "2026-01-01",
  contractEnd: "2026-12-31",
  nextPaymentDate: "2026-11-10",
  daysToNextPayment: 3,
  daysToContractEnd: 45,
  contractProgressPct: 80,
  status: "VIGENTE",
  note: null,
};

const legacyKiosk = {
  locationId: 7,
  code: "K7",
  name: "Kiosco Sur",
  landlordName: null,
  monthlyRent: null,
  paymentDay: null,
  contractStart: null,
  contractEnd: null,
  nextPaymentDate: null,
  daysToNextPayment: null,
  status: "SIN_CARGAR",
};

const other = {
  rentType: "OTHER",
  rentId: 12,
  locationId: null,
  code: null,
  name: "Oficina central",
  category: "OFICINA",
  description: "Zona 10",
  landlordName: "Inmobiliaria Sol",
  monthlyRent: 1500,
  monthlyAmount: 1500,
  paymentDay: 5,
  contractStart: "2026-02-01",
  contractEnd: "2027-01-31",
  nextPaymentDate: "2026-12-05",
  daysToNextPayment: 19,
  daysToContractEnd: 76,
  contractProgressPct: 40,
  status: "VIGENTE",
  note: null,
};

const payload = {
  rows: [kiosk, legacyKiosk, other],
  landlords: ["Ana López", "Inmobiliaria Sol"],
  today: "2026-11-07",
  expiringDays: 60,
  canEdit: true,
  summary: {
    totalMonthlyRent: 4000,
    totalAnnualRent: 48000,
    kiosksTotal: 2,
    kiosksWithRent: 1,
    otherRentsTotal: 1500,
    paymentsNext7Days: 1,
    paymentsNext7DaysAmount: 2500,
    countByStatus: { VIGENTE: 2, SIN_CARGAR: 1 },
  },
};

const rowOf = (name) => screen.getByText(name).closest("tr");

beforeEach(() => {
  getKioskRents.mockResolvedValue(payload);
  createOtherRent.mockResolvedValue(payload);
  saveOtherRent.mockResolvedValue(payload);
  deactivateOtherRent.mockResolvedValue(payload);
  saveKioskRent.mockResolvedValue(payload);
});

afterEach(() => {
  cleanup();
  jest.clearAllMocks();
});

test("lista kioscos y otras rentas con badge de tipo", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");
  expect(within(rowOf("Kiosco Centro")).getByText("K4")).toBeInTheDocument();
  expect(within(rowOf("Kiosco Centro")).getAllByText("Kiosco").length).toBeGreaterThan(0);
  expect(within(rowOf("Oficina central")).getAllByText("Oficina").length).toBeGreaterThan(0);
  expect(within(rowOf("Oficina central")).queryByText("K4")).not.toBeInTheDocument();
  expect(screen.getByText("Otras rentas")).toBeInTheDocument();
  expect(within(rowOf("Oficina central")).getByText(/1[.,\u00a0\s]?500/)).toBeInTheDocument();
});

test("el filtro Todas / Kioscos / Otras oculta el otro tipo", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");
  fireEvent.click(screen.getByRole("button", { name: /Otras/ }));
  expect(screen.getByText("Oficina central")).toBeInTheDocument();
  expect(screen.queryByText("Kiosco Centro")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Kioscos/ }));
  expect(screen.getByText("Kiosco Centro")).toBeInTheDocument();
  expect(screen.getByText("Kiosco Sur")).toBeInTheDocument();
  expect(screen.queryByText("Oficina central")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Todas/ }));
  expect(screen.getByText("Oficina central")).toBeInTheDocument();
  expect(screen.getByText("Kiosco Centro")).toBeInTheDocument();
});

test("Agregar renta valida y manda el payload de create", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");
  fireEvent.click(screen.getByRole("button", { name: "Agregar renta" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(createOtherRent).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Indique el nombre de la renta.");

  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Bodega norte" } });
  fireEvent.change(screen.getByLabelText(/Tipo \/ categoría/), { target: { value: "BODEGA" } });
  fireEvent.change(screen.getByLabelText(/Descripción/), { target: { value: "Mixco" } });
  fireEvent.change(screen.getByLabelText(/Arrendante/), { target: { value: "Pedro" } });
  fireEvent.change(screen.getByLabelText(/Monto mensual/), { target: { value: "800" } });
  fireEvent.change(screen.getByLabelText(/Día de pago del mes/), { target: { value: "20" } });
  fireEvent.change(screen.getByLabelText(/Inicio de contrato/), { target: { value: "2026-03-01" } });
  fireEvent.change(screen.getByLabelText(/Fin de contrato/), { target: { value: "2027-03-01" } });
  fireEvent.change(screen.getByLabelText(/^Nota/), { target: { value: "sin depósito" } });

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(createOtherRent).toHaveBeenCalledTimes(1));
  expect(createOtherRent).toHaveBeenCalledWith({
    name: "Bodega norte",
    description: "Mixco",
    category: "BODEGA",
    landlordName: "Pedro",
    monthlyAmount: 800,
    paymentDay: 20,
    contractStart: "2026-03-01",
    contractEnd: "2027-03-01",
    note: "sin depósito",
  });
  expect(saveKioskRent).not.toHaveBeenCalled();
});

test("editar otra renta usa PUT por rentId y un 409 se ve en el modal", async () => {
  saveOtherRent.mockRejectedValue(new Error("Ya existe una renta activa con esa categoría y nombre."));
  render(<KioskRents />);
  await screen.findByText("Oficina central");
  fireEvent.click(within(rowOf("Oficina central")).getByRole("button", { name: /Editar renta Oficina central/ }));
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Oficina central" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(saveOtherRent).toHaveBeenCalled());
  expect(saveOtherRent.mock.calls[0][0]).toBe(12);
  expect(saveOtherRent.mock.calls[0][1]).toMatchObject({
    name: "Oficina central",
    category: "OFICINA",
    monthlyAmount: 1500,
    paymentDay: 5,
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Ya existe una renta activa con esa categoría y nombre.");
});

test("Desactivar pide confirmación y llama DELETE", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(true);
  render(<KioskRents />);
  await screen.findByText("Oficina central");
  fireEvent.click(within(rowOf("Oficina central")).getByRole("button", { name: /Editar renta Oficina central/ }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  });
  await waitFor(() => expect(deactivateOtherRent).toHaveBeenCalledWith(12));
  confirm.mockRestore();
});

test("un kiosco sin rentType sigue editándose por locationId", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Sur");
  fireEvent.click(within(rowOf("Kiosco Sur")).getByRole("button", { name: /Editar renta de Kiosco Sur/ }));
  expect(screen.getByLabelText(/Arrendador/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Arrendador/), { target: { value: "Luis" } });
  fireEvent.change(screen.getByLabelText(/Día de pago del mes/), { target: { value: "8" } });
  fireEvent.change(screen.getByLabelText(/Contrato desde/), { target: { value: "2026-01-01" } });
  fireEvent.change(screen.getByLabelText(/Contrato hasta/), { target: { value: "2026-12-31" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(saveKioskRent).toHaveBeenCalledWith(7, {
    landlordName: "Luis",
    paymentDay: 8,
    contractStart: "2026-01-01",
    contractEnd: "2026-12-31",
    note: null,
  }));
  expect(createOtherRent).not.toHaveBeenCalled();
});

test("la revisión de import muestra rentType y rentId en cambios y errores", async () => {
  importKioskRentTemplate.mockResolvedValue({
    applied: false,
    readRows: 3,
    blankRows: 0,
    unchangedRows: 0,
    changes: [
      {
        kind: "NEW",
        rentType: "OTHER",
        rentId: null,
        name: "Bodega nueva",
        landlordName: "Pedro",
        paymentDay: 12,
        contractStart: "2026-01-01",
        contractEnd: "2026-12-31",
      },
      {
        kind: "UPDATE",
        rentType: "KIOSK",
        locationId: 4,
        name: "Kiosco Centro",
        landlordName: "Ana López",
        paymentDay: 10,
        contractStart: "2026-01-01",
        contractEnd: "2026-12-31",
      },
    ],
    errors: [
      { row: 5, name: "Oficina dup", rentType: "OTHER", rentId: 12, message: "Nombre duplicado" },
    ],
  });
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");
  const input = document.querySelector('input[type="file"]');
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File(["x"], "rentas.xlsx")] } });
  });
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Otra")).toBeInTheDocument();
  expect(within(dialog).getByText("Bodega nueva")).toBeInTheDocument();
  expect(within(dialog).getByText("Kiosco")).toBeInTheDocument();
  expect(within(dialog).getByText(/Fila 5 · Oficina dup · Otra · ID 12/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Nombre duplicado/)).toBeInTheDocument();
  expect(showError).not.toHaveBeenCalled();
});
