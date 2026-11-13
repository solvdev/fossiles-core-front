import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { MemoryRouter } from "react-router-dom";
import ShipmentsInTransit from "../ShipmentsInTransit";
import ReceiptConfirmation from "../ReceiptConfirmation";
import AuthorizeShipments from "../AuthorizeShipments";
import { getShipmentsByStatus, getShipmentsInTransit } from "services/productDistributionService";
import {
  authorizeOpiProduction,
  listExistingEnviShipments,
  listInternalShipmentRequests,
} from "services/internalShipmentRequestService";

jest.mock("services/productDistributionService");
jest.mock("services/internalShipmentRequestService");
jest.mock("utils/notificationHelper");
jest.mock("utils/reportExportHelper");
jest.mock("components/distribution/CreateStandaloneInternalShipmentModal", () => () => null);
jest.mock("components/distribution/PrintSlipBookletModal", () => () => null);
jest.mock("components/distribution/InternalShipmentRequestDetailModal", () => () => null);

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

let mockGranted = new Set(["CONTABILIDAD.ENVIOS.APROBAR"]);
jest.mock("contexts/AuthContext", () => ({
  useAuth: () => ({ hasPermission: (code) => mockGranted.has(code) }),
}));

const shipment = (id) => ({
  id,
  shipmentNumber: `ENV-${id}`,
  status: "SENT",
  locationName: `Kiosco ${id}`,
  sentAt: "2026-10-20T10:00:00",
  products: [{ id: id * 10, productCode: `P-${id}`, productName: `Producto ${id}`, colorName: "Negro", quantity: 2 }],
});

beforeEach(() => {
  mockGranted = new Set(["CONTABILIDAD.ENVIOS.APROBAR"]);
  mockNavigate.mockReset();
});
afterEach(cleanup);

test("en tránsito, el detalle se abre debajo de su fila y Recibir lleva el envío elegido", async () => {
  getShipmentsInTransit.mockResolvedValue([shipment(1), shipment(2), shipment(3)]);
  render(<MemoryRouter><ShipmentsInTransit /></MemoryRouter>);
  const row = (await screen.findByText("ENV-2")).closest("tr");

  fireEvent.click(within(row).getByRole("button", { name: "Ver Detalle" }));
  expect(row.nextElementSibling).toHaveClass("fossiles-detalle-fila");
  expect(within(row.nextElementSibling).getByText("Producto 2")).toBeInTheDocument();
  expect(within(row).getByRole("button", { name: "Ocultar" })).toBeInTheDocument();

  fireEvent.click(within(row).getByRole("button", { name: "Recibir" }));
  expect(mockNavigate).toHaveBeenCalledWith("/admin/receipt-confirmation", {
    state: { shipmentId: 2, shipmentNumber: "ENV-2" },
  });
  expect(screen.getByText(/3 en total/)).toBeInTheDocument();
});

test("recepción muestra el envío que llega elegido, en su página y con su formulario debajo", async () => {
  getShipmentsInTransit.mockResolvedValue(Array.from({ length: 25 }, (_, index) => shipment(index + 1)));
  getShipmentsByStatus.mockResolvedValue([]);
  render(
    <MemoryRouter initialEntries={[{ pathname: "/admin/receipt-confirmation", state: { shipmentId: 23, shipmentNumber: "ENV-23" } }]}>
      <ReceiptConfirmation />
    </MemoryRouter>
  );
  expect(await screen.findByText(/listo para recibir/)).toHaveTextContent("Envío ENV-23 listo para recibir");
  await waitFor(() => expect(screen.getByText("Página")).toHaveTextContent("Página 3 de 3"));
  expect(screen.getByText("Recepción · ENV-23 (Kiosco 23)")).toBeInTheDocument();
  expect(screen.queryByText("ENV-1")).not.toBeInTheDocument();
});

test("recepción avisa si el envío elegido ya no está pendiente", async () => {
  getShipmentsInTransit.mockResolvedValue([shipment(1)]);
  getShipmentsByStatus.mockResolvedValue([]);
  render(
    <MemoryRouter initialEntries={[{ pathname: "/admin/receipt-confirmation", state: { shipmentId: 99, shipmentNumber: "ENV-99" } }]}>
      <ReceiptConfirmation />
    </MemoryRouter>
  );
  expect(await screen.findByText(/ya no está pendiente/)).toHaveTextContent("El envío ENV-99 ya no está pendiente de recepción.");
});

test("autorizar la producción de una OPI se confirma en un modal, no en una alerta del navegador", async () => {
  const confirmSpy = jest.spyOn(window, "confirm");
  listExistingEnviShipments.mockResolvedValue([]);
  listInternalShipmentRequests.mockResolvedValue([{
    id: 7, status: "PENDIENTE", requestType: "OPI", recipientName: "Colaboradora", lines: [],
    productionOrderId: 9, productionOrderCode: "OPI-9", productionOrderStatus: "DRAFT",
  }]);
  authorizeOpiProduction.mockResolvedValue({ id: 7, productionOrderCode: "OPI-9" });
  render(<MemoryRouter><AuthorizeShipments /></MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: "Autorizar prod." }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Se autoriza la producción de OPI-9 para la solicitud #7.")).toBeInTheDocument();
  await act(async () => { fireEvent.click(within(dialog).getByRole("button", { name: "Autorizar producción" })); });
  expect(authorizeOpiProduction).toHaveBeenCalledWith(7);
  expect(confirmSpy).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});
