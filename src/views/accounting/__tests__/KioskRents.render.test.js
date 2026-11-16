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
    otherRentsTotal: 1,
    otherMonthlyRent: 1500,
    paymentsNext7Days: 1,
    paymentsNext7DaysAmount: 2500,
    countByStatus: { VIGENTE: 2, SIN_CARGAR: 1 },
  },
};

const rowOf = (name) => screen.getByText(name).closest("tr");

beforeEach(() => {
  getKioskRents.mockResolvedValue(payload);
  createOtherRent.mockResolvedValue({ ...other, rentId: 20, name: "Bodega norte" });
  saveOtherRent.mockResolvedValue(other);
  deactivateOtherRent.mockResolvedValue(null);
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
  const otherCard = screen.getByText("Otras rentas").closest(".krn-card");
  expect(within(otherCard).getByText("1")).toBeInTheDocument();
  expect(within(otherCard).getByText(/1[.,\u00a0\s]?500/)).toBeInTheDocument();
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
  expect(getKioskRents).toHaveBeenCalledTimes(2);
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
  expect(getKioskRents).toHaveBeenCalledTimes(1);
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
  expect(getKioskRents).toHaveBeenCalledTimes(2);
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

test("el formulario de otra renta no trae campos de kiosco ni pagos/historial", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");
  fireEvent.click(screen.getByRole("button", { name: "Agregar renta" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: "Agregar renta" })).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Nombre/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Tipo \/ categoría/)).toHaveDisplayValue("Oficina");
  expect(within(dialog).getByRole("option", { name: "Bodega" })).toBeInTheDocument();
  expect(within(dialog).getByRole("option", { name: "Otro" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("option", { name: "Kiosco" })).not.toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Arrendante/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Monto mensual/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Inicio de contrato/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Fin de contrato/)).toBeInTheDocument();
  expect(within(dialog).queryByLabelText(/^Arrendador/)).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText(/Contrato desde/)).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText(/Contrato hasta/)).not.toBeInTheDocument();
  expect(within(dialog).queryByText(/Se toma de Finanzas/)).not.toBeInTheDocument();
  expect(within(dialog).queryByText(/Quitar datos del contrato/)).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();
  expect(within(dialog).queryByText(/historial/i)).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: /pagos/i })).not.toBeInTheDocument();
  expect(within(dialog).queryByText(/código|location/i)).not.toBeInTheDocument();
});

test("Agregar renta valida monto, día de pago y fechas en el modal", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");
  fireEvent.click(screen.getByRole("button", { name: "Agregar renta" }));
  fireEvent.change(screen.getByLabelText(/Nombre/), { target: { value: "Bodega norte" } });

  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Indique el monto mensual.");
  expect(createOtherRent).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText(/Monto mensual/), { target: { value: "-1" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Indique el monto mensual.");

  fireEvent.change(screen.getByLabelText(/Monto mensual/), { target: { value: "800" } });
  fireEvent.change(screen.getByLabelText(/Día de pago del mes/), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("El día de pago debe estar entre 1 y 31.");

  fireEvent.change(screen.getByLabelText(/Día de pago del mes/), { target: { value: "32" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("El día de pago debe estar entre 1 y 31.");

  fireEvent.change(screen.getByLabelText(/Día de pago del mes/), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Indique desde cuándo y hasta cuándo dura el contrato.");

  fireEvent.change(screen.getByLabelText(/Inicio de contrato/), { target: { value: "2027-03-01" } });
  fireEvent.change(screen.getByLabelText(/Fin de contrato/), { target: { value: "2026-03-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("«Contrato hasta» no puede ser anterior a «Contrato desde».");
  expect(createOtherRent).not.toHaveBeenCalled();
  expect(saveKioskRent).not.toHaveBeenCalled();
});

test("otras rentas con campos nulos no rompen la lista ni muestran código de kiosco", async () => {
  const sparse = {
    rentType: "OTHER",
    rentId: 44,
    locationId: null,
    code: null,
    name: "Local sin datos",
    category: "OTRO",
    description: null,
    landlordName: null,
    monthlyRent: 900,
    paymentDay: null,
    contractStart: "2026-01-01",
    contractEnd: null,
    nextPaymentDate: null,
    daysToNextPayment: null,
    daysToContractEnd: null,
    contractProgressPct: undefined,
    status: "INCOMPLETO",
    note: null,
  };
  getKioskRents.mockResolvedValue({ ...payload, rows: [...payload.rows, sparse] });
  render(<KioskRents />);
  await screen.findByText("Local sin datos");

  const filled = rowOf("Oficina central");
  expect(within(filled).getByText("Vigente")).toBeInTheDocument();
  expect(within(filled).getByText(/Día 5 de cada mes/)).toBeInTheDocument();
  expect(within(filled).queryByText(/^K\d+$/)).not.toBeInTheDocument();

  const empty = rowOf("Local sin datos");
  expect(within(empty).queryByText(/null|undefined/i)).not.toBeInTheDocument();
  expect(within(empty).getByText("Falta indicar")).toBeInTheDocument();
  expect(within(empty).getByText("Sin fechas de contrato")).toBeInTheDocument();
  expect(within(empty).getByText("Sin día de pago")).toBeInTheDocument();
  expect(within(empty).getByText("Incompleto")).toBeInTheDocument();
  expect(within(empty).getAllByText("Otro").length).toBeGreaterThan(0);
  expect(within(empty).queryByText("K4")).not.toBeInTheDocument();
  expect(within(rowOf("Kiosco Centro")).getByText("K4")).toBeInTheDocument();
});

test("las tarjetas de resumen no mezclan conteos de kiosco con otras rentas", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");

  const monthCard = screen.getByText("Renta mensual total").closest(".krn-card");
  expect(within(monthCard).getByText(/Q\s*4[.,\u00a0\s]?000/)).toBeInTheDocument();
  expect(within(monthCard).getByText(/1 de 2 kioscos con renta en Finanzas/)).toBeInTheDocument();

  const payCard = screen.getByText("Pagos en 7 días").closest(".krn-card");
  expect(within(payCard).getByText(/1 renta/)).toBeInTheDocument();

  expect(screen.getByText(/1 de 2 kioscos · 1 otras/)).toBeInTheDocument();
  expect(screen.getByText(/48[.,\u00a0\s]?000/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Todas \(3\)/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Kioscos \(2\)/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Otras \(1\)/ })).toBeInTheDocument();
});

test("editar un kiosco con rentType KIOSK sigue usando el PUT de kiosco", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");
  fireEvent.click(within(rowOf("Kiosco Centro")).getByRole("button", { name: /Editar renta de Kiosco Centro/ }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText(/Arrendador/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Contrato desde/)).toBeInTheDocument();
  expect(within(dialog).getByLabelText(/Contrato hasta/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Se toma de Finanzas/)).toBeInTheDocument();
  expect(within(dialog).queryByLabelText(/^Nombre/)).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText(/Tipo \/ categoría/)).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText(/Monto mensual/)).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Desactivar" })).not.toBeInTheDocument();

  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(saveKioskRent).toHaveBeenCalledWith(4, {
    landlordName: "Ana López",
    paymentDay: 10,
    contractStart: "2026-01-01",
    contractEnd: "2026-12-31",
    note: null,
  }));
  expect(createOtherRent).not.toHaveBeenCalled();
  expect(saveOtherRent).not.toHaveBeenCalled();
});

test("guardar otra renta recarga el GET y cierra el modal", async () => {
  render(<KioskRents />);
  await screen.findByText("Oficina central");
  fireEvent.click(within(rowOf("Oficina central")).getByRole("button", { name: /Editar renta Oficina central/ }));
  fireEvent.change(screen.getByLabelText(/Descripción/), { target: { value: "Zona 4" } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  });
  await waitFor(() => expect(saveOtherRent).toHaveBeenCalledWith(12, expect.objectContaining({
    name: "Oficina central",
    description: "Zona 4",
    category: "OFICINA",
    monthlyAmount: 1500,
    paymentDay: 5,
  })));
  expect(getKioskRents).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(screen.queryByLabelText(/Nombre/)).not.toBeInTheDocument());
  expect(saveKioskRent).not.toHaveBeenCalled();
});

test("cancelar desactivar no llama DELETE", async () => {
  const confirm = jest.spyOn(window, "confirm").mockReturnValue(false);
  render(<KioskRents />);
  await screen.findByText("Oficina central");
  fireEvent.click(within(rowOf("Oficina central")).getByRole("button", { name: /Editar renta Oficina central/ }));
  fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
  expect(deactivateOtherRent).not.toHaveBeenCalled();
  expect(getKioskRents).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText(/Nombre/)).toBeInTheDocument();
  confirm.mockRestore();
});

test("la búsqueda encuentra otras rentas por descripción", async () => {
  render(<KioskRents />);
  await screen.findByText("Kiosco Centro");
  fireEvent.change(screen.getByLabelText(/Buscar kiosco, renta o arrendador/), { target: { value: "Zona 10" } });
  expect(screen.getByText("Oficina central")).toBeInTheDocument();
  expect(screen.queryByText("Kiosco Centro")).not.toBeInTheDocument();
  expect(screen.queryByText("Kiosco Sur")).not.toBeInTheDocument();
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
